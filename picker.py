"""AI 選股：規則評分 + 投資組合回測（研究與實盤共用）。

只用日 K（開高低收量）計算因子，每個再平衡日以收盤資料打分數、隔天開盤成交，避免偷看未來。
策略 = 篩選條件 + 排序分數 + 持股檔數 + 再平衡頻率 + 停損 + 大盤濾網。
"""
import math

# ---------------- 因子 ----------------


def _sma(a, n):
    out, s = [None] * len(a), 0.0
    for i, v in enumerate(a):
        s += v
        if i >= n:
            s -= a[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def _rsi(c, n=14):
    out, g, l = [None] * len(c), 0.0, 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]
        up, dn = max(d, 0), max(-d, 0)
        if i <= n:
            g += up / n; l += dn / n
        else:
            g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n
        if i >= n:
            out[i] = 100 - 100 / (1 + g / l) if l else 100
    return out


def features(bars):
    """回傳每一天的因子 dict 陣列（資料不足的天數為 None）。"""
    c = [b["c"] for b in bars]; h = [b["h"] for b in bars]; v = [b.get("v") or 0 for b in bars]
    n = len(c)
    ma20, ma60, ma120, ma200 = _sma(c, 20), _sma(c, 60), _sma(c, 120), _sma(c, 200)
    v5, v60 = _sma(v, 5), _sma(v, 60)
    rsi = _rsi(c)
    rets = [0.0] + [(c[i] / c[i - 1] - 1) if c[i - 1] else 0 for i in range(1, n)]
    out = [None] * n
    for i in range(n):
        if i < 250:
            continue
        r = lambda k: c[i] / c[i - k] - 1 if c[i - k] else 0
        win = rets[i - 59:i + 1]
        m = sum(win) / 60
        vol = math.sqrt(sum((x - m) ** 2 for x in win) / 60) * math.sqrt(252)
        hi250 = max(h[i - 249:i + 1])
        out[i] = {
            "c": c[i], "r5": r(5), "r20": r(20), "r60": r(60), "r120": r(120), "r250": r(250),
            "mom121": (c[i - 20] / c[i - 250] - 1) if c[i - 250] else 0,
            "ma20": ma20[i], "ma60": ma60[i], "ma120": ma120[i], "ma200": ma200[i],
            "vr": (v5[i] / v60[i]) if v60[i] else 1, "vol": vol or 1e-9, "rsi": rsi[i],
            "hi": c[i] / hi250 if hi250 else 0, "liq": (v60[i] or 0) * c[i],
        }
    return out


# ---------------- 候選策略 ----------------
# 每個策略：filt(f) 決定能不能入選，score(f) 越大越好
def _up(f):
    return f["c"] > f["ma60"] > f["ma120"]


STRATS = {
    "mom6": {"name": "半年動能", "desc": "過去 120 天漲最多", "filt": lambda f: True, "score": lambda f: f["r120"]},
    "mom12": {"name": "12-1 動能", "desc": "過去一年（扣掉最近一個月）漲最多", "filt": lambda f: True, "score": lambda f: f["mom121"]},
    "trend_mom": {"name": "多頭排列＋季動能", "desc": "股價 > 季線 > 半年線，挑近 60 天最強", "filt": _up, "score": lambda f: f["r60"]},
    "breakout": {"name": "一年新高突破", "desc": "距一年高點 3% 內且量增，挑近 20 天最強", "filt": lambda f: f["hi"] >= 0.97 and f["vr"] > 1.2, "score": lambda f: f["r20"]},
    "lowvol_mom": {"name": "低波動動能", "desc": "半年報酬 ÷ 波動度，漲得穩的優先", "filt": lambda f: f["r120"] > 0, "score": lambda f: f["r120"] / f["vol"]},
    "pullback": {"name": "多頭拉回", "desc": "長期多頭中 RSI 跌到 45 以下，挑短線跌最多", "filt": lambda f: _up(f) and (f["rsi"] or 50) < 45, "score": lambda f: -f["r5"]},
    "reversal": {"name": "短線反轉", "desc": "近 5 天跌最多（均值回歸）", "filt": lambda f: True, "score": lambda f: -f["r5"]},
    "vol_surge": {"name": "量增轉強", "desc": "5 日均量 > 60 日均量 1.5 倍且上漲，挑近 20 天最強", "filt": lambda f: f["vr"] > 1.5 and f["r5"] > 0, "score": lambda f: f["r20"]},
    "near_high": {"name": "貼近新高", "desc": "離一年高點最近、且在多頭排列", "filt": _up, "score": lambda f: f["hi"]},
    "composite": {"name": "綜合評分", "desc": "半年動能 + 月動能 + 多頭排列 − 波動度（各自排名後加總）", "filt": lambda f: f["c"] > f["ma200"], "score": None},
}


def _rank_pct(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    out = [0.0] * len(vals)
    for r, i in enumerate(order):
        out[i] = r / max(1, len(vals) - 1)
    return out


def pick(feats_today, strat_key, top, min_liq=0):
    """feats_today: {code: f}。回傳依分數排序的 [(code, score)]。"""
    st = STRATS[strat_key]
    cand = [(c, f) for c, f in feats_today.items() if f and f["liq"] >= min_liq and f["ma200"] and st["filt"](f)]
    if not cand:
        return []
    if st["score"] is None:  # 綜合評分：排名加總
        a = _rank_pct([f["r120"] for _, f in cand]); b = _rank_pct([f["r20"] for _, f in cand])
        t = [1.0 if _up(f) else 0.0 for _, f in cand]; v = _rank_pct([f["vol"] for _, f in cand])
        sc = [a[i] + 0.5 * b[i] + 0.5 * t[i] - 0.5 * v[i] for i in range(len(cand))]
    else:
        sc = [st["score"](f) for _, f in cand]
    ranked = sorted(zip([c for c, _ in cand], sc), key=lambda x: -x[1])
    return ranked[:top] if top else ranked


def reasons(f):
    """給人看的入選理由。"""
    out = []
    if f["c"] > f["ma60"] > f["ma120"]:
        out.append("多頭排列（股價 > 季線 > 半年線）")
    out.append(f"半年 {f['r120'] * 100:+.1f}%、近一月 {f['r20'] * 100:+.1f}%")
    if f["hi"] >= 0.97:
        out.append("貼近一年新高")
    if f["vr"] > 1.3:
        out.append(f"量能放大 {f['vr']:.1f} 倍")
    if f["rsi"] is not None:
        out.append(f"RSI {f['rsi']:.0f}")
    out.append(f"年化波動 {f['vol'] * 100:.0f}%")
    return "、".join(out)


# ---------------- 投資組合回測 ----------------
def tw_cost(code):
    etf = code.startswith("0")
    return 0.001425, 0.001425 + (0.001 if etf else 0.003)


def portfolio_backtest(data, feats, bench, cfg, start_t, end_t=None, capital=1_000_000):
    """data: {code: bars}（日 K），feats: {code: features}，bench: 大盤日 K。
    cfg: strat, top, rebal（交易日）, stop（%，0 不用）, regime（大盤在 200 日均線下就空手）, mkt。"""
    days = sorted({b["t"] // 86400 for bars in data.values() for b in bars if b["t"] >= start_t and (end_t is None or b["t"] <= end_t)})
    if len(days) < 10:
        return None
    idx = {c: {b["t"] // 86400: i for i, b in enumerate(bars)} for c, bars in data.items()}
    bidx = {b["t"] // 86400: i for i, b in enumerate(bench)}
    bc = [b["c"] for b in bench]; bma = _sma(bc, 200)
    cash, pos = float(capital), {}  # pos: code -> {qty, entry}
    pending, eq, trades, n_trades = None, [], [], 0
    stop = (cfg.get("stop") or 0) / 100
    top, rebal = cfg["top"], cfg["rebal"]
    tw = cfg.get("mkt", "tw") == "tw"
    for k, d in enumerate(days):
        # 1) 開盤執行前一天的調整
        if pending is not None:
            target = pending
            for code in list(pos):
                if code not in target:
                    i = idx[code].get(d)
                    if i is None:
                        continue
                    px = data[code][i]["o"]; p = pos.pop(code)
                    fee = tw_cost(code)[1] if tw else 0
                    cash += p["qty"] * px * (1 - fee); n_trades += 1
                    trades.append((p["qty"] * px * (1 - fee)) / p["cost"] - 1)
            new = [c for c in target if c not in pos and idx[c].get(d) is not None]
            if new:
                val = cash + sum(p["qty"] * data[c][idx[c][d]]["o"] for c, p in pos.items() if idx[c].get(d) is not None)
                slot = val / top
                for code in new:
                    px = data[code][idx[code][d]]["o"]
                    fee = tw_cost(code)[0] if tw else 0
                    amt = min(slot, cash)
                    qty = amt / (px * (1 + fee))  # 研究用：允許零股，避免高價股買不到
                    if qty * px < 1:
                        continue
                    cash -= qty * px * (1 + fee); pos[code] = {"qty": qty, "entry": px, "cost": qty * px * (1 + fee)}
                    n_trades += 1
            pending = None
        # 2) 盤中停損
        if stop:
            for code in list(pos):
                i = idx[code].get(d)
                if i is None:
                    continue
                b = data[code][i]; p = pos[code]
                if b["l"] <= p["entry"] * (1 - stop):
                    px = min(b["o"], p["entry"] * (1 - stop)); fee = tw_cost(code)[1] if tw else 0
                    cash += p["qty"] * px * (1 - fee); pos.pop(code); n_trades += 1
                    trades.append((p["qty"] * px * (1 - fee)) / p["cost"] - 1)
        # 3) 收盤市值
        val = cash
        for code, p in pos.items():
            i = idx[code].get(d)
            if i is None:  # 當天沒資料（停牌）用最近一筆
                i = max((j for dd, j in idx[code].items() if dd <= d), default=None)
            if i is not None:
                val += p["qty"] * data[code][i]["c"]
        eq.append((d * 86400, val))
        # 4) 再平衡日：收盤打分數，隔天執行
        if k % rebal == 0 and k < len(days) - 1:
            bi = bidx.get(d)
            risk_off = cfg.get("regime") and bi is not None and bma[bi] and bc[bi] < bma[bi]
            if risk_off:
                pending = []
            else:
                today = {c: feats[c][idx[c][d]] for c in data if idx[c].get(d) is not None}
                ranked = pick(today, cfg["strat"], 0, cfg.get("min_liq", 0))
                keep_zone = {c for c, _ in ranked[:top * 2]}  # 緩衝區：還在前 2N 名就續抱，減少換手
                hold = [c for c in pos if c in keep_zone][:top]
                pending = hold + [c for c, _ in ranked if c not in hold][:top - len(hold)]
    return {"equity": eq, "trades": n_trades, "closed": trades}


def stats(eq, closed=None):
    if not eq or len(eq) < 2:
        return {}
    v = [x[1] for x in eq]
    rets = [v[i] / v[i - 1] - 1 for i in range(1, len(v)) if v[i - 1]]
    m = sum(rets) / len(rets); sd = math.sqrt(sum((r - m) ** 2 for r in rets) / len(rets)) or 1e-9
    peak, mdd = v[0], 0.0
    for x in v:
        peak = max(peak, x); mdd = min(mdd, x / peak - 1)
    yrs = max((eq[-1][0] - eq[0][0]) / 86400 / 365.25, 1 / 365)
    out = {"ret": (v[-1] / v[0] - 1) * 100, "cagr": ((v[-1] / v[0]) ** (1 / yrs) - 1) * 100, "mdd": mdd * 100, "sharpe": m / sd * math.sqrt(252)}
    if closed:
        out["win"] = sum(1 for r in closed if r > 0) / len(closed) * 100
    return out


def bench_equity(bench, start_t, end_t=None):
    pts = [(b["t"] // 86400 * 86400, b["c"]) for b in bench if b["t"] >= start_t and (end_t is None or b["t"] <= end_t)]
    return pts


def ew_equity(data, start_t, end_t=None):
    """等權重持有整個股票池（買進持有）：用來判斷選股有沒有比「隨便全買」好。"""
    days = sorted({b["t"] // 86400 for bars in data.values() for b in bars if b["t"] >= start_t and (end_t is None or b["t"] <= end_t)})
    base, last = {}, {}
    for c, bars in data.items():
        for b in bars:
            if b["t"] >= start_t:
                base[c] = b["c"]; break
    series = {c: {b["t"] // 86400: b["c"] for b in bars} for c, bars in data.items()}
    out = []
    for d in days:
        tot, n = 0.0, 0
        for c in base:
            px = series[c].get(d, last.get(c))
            if px:
                last[c] = px; tot += px / base[c]; n += 1
        out.append((d * 86400, tot / n if n else 1))
    return out
