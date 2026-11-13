"""策略引擎：技術指標、條件判斷、歷史回測（只用 Python 標準函式庫）。

條件格式（JSON）：
  運算元 operand: {"k": "close"} / {"k": "ma", "n": 20} / {"k": "value", "v": 30} ...
  規則 rule:      {"a": operand, "op": "gt|lt|ge|le|cross_up|cross_down", "b": operand}
  群組 group:     {"mode": "all|any", "rules": [rule, ...]}
策略 strategy:
  {"name", "mkt": "tw|us", "universe": [code...], "entry": group, "exit": group,
   "stop_loss": 8, "take_profit": 20, "max_hold": 0, "size_pct": 100}
"""
import math

# ---------------- 指標 ----------------


def sma(a, n):
    out, s, k = [None] * len(a), 0.0, 0
    for i, v in enumerate(a):
        if v is not None:
            s += v; k += 1
        if i >= n and a[i - n] is not None:
            s -= a[i - n]; k -= 1
        if i >= n - 1 and k == n:
            out[i] = s / n
    return out


def ema(a, n):
    out, p, k = [None] * len(a), None, 2 / (n + 1)
    for i, v in enumerate(a):
        if v is None:
            continue
        p = v if p is None else v * k + p * (1 - k)
        out[i] = p
    return out


def smma(a, n):
    out, p, s, c = [None] * len(a), None, 0.0, 0
    for i, v in enumerate(a):
        if v is None:
            continue
        if p is None:
            s += v; c += 1
            if c == n:
                p = s / n; out[i] = p
        else:
            p = (p * (n - 1) + v) / n; out[i] = p
    return out


def rsi(c, n):
    up = [None] + [max(c[i] - c[i - 1], 0) for i in range(1, len(c))]
    dn = [None] + [max(c[i - 1] - c[i], 0) for i in range(1, len(c))]
    su, sd = smma(up, n), smma(dn, n)
    return [None if u is None else (100.0 if d == 0 else 100 - 100 / (1 + u / d)) for u, d in zip(su, sd)]


def macd(c, f=12, s=26, sig=9):
    ef, es = ema(c, f), ema(c, s)
    dif = [a - b for a, b in zip(ef, es)]
    dea = ema(dif, sig)
    return dif, dea, [(a - b) * 2 for a, b in zip(dif, dea)]


def kd(h, l, c, n=9):
    K, D, k, d = [], [], 50.0, 50.0
    for i in range(len(c)):
        hh, ll = max(h[max(0, i - n + 1):i + 1]), min(l[max(0, i - n + 1):i + 1])
        rsv = 50 if hh == ll else (c[i] - ll) / (hh - ll) * 100
        k = (2 * k + rsv) / 3; d = (2 * d + k) / 3
        K.append(k if i >= n - 1 else None); D.append(d if i >= n - 1 else None)
    return K, D


def boll(c, n=20, m=2):
    mid = sma(c, n)
    up, dn = [], []
    for i, v in enumerate(mid):
        if v is None:
            up.append(None); dn.append(None); continue
        sd = math.sqrt(sum((x - v) ** 2 for x in c[i - n + 1:i + 1]) / n)
        up.append(v + m * sd); dn.append(v - m * sd)
    return up, mid, dn


def atr(h, l, c, n=14):
    tr = [h[0] - l[0]] + [max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])) for i in range(1, len(c))]
    return smma(tr, n)


def dmi(h, l, c, n=14):
    """回傳 (+DI, -DI, ADX)。"""
    L = len(c)
    pdm, mdm, tr = [None], [None], [None]
    for i in range(1, L):
        up, dn = h[i] - h[i - 1], l[i - 1] - l[i]
        pdm.append(up if up > dn and up > 0 else 0.0)
        mdm.append(dn if dn > up and dn > 0 else 0.0)
        tr.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
    sp, sm, st = smma(pdm, n), smma(mdm, n), smma(tr, n)
    pdi = [None if a is None or not t else a / t * 100 for a, t in zip(sp, st)]
    mdi = [None if a is None or not t else a / t * 100 for a, t in zip(sm, st)]
    dx = [None if p is None or m is None or p + m == 0 else abs(p - m) / (p + m) * 100 for p, m in zip(pdi, mdi)]
    return pdi, mdi, smma(dx, n)


def cci(h, l, c, n=20):
    tp = [(a + b + d) / 3 for a, b, d in zip(h, l, c)]
    ma = sma(tp, n)
    out = [None] * len(c)
    for i in range(n - 1, len(c)):
        md = sum(abs(x - ma[i]) for x in tp[i - n + 1:i + 1]) / n
        out[i] = 0.0 if md == 0 else (tp[i] - ma[i]) / (0.015 * md)
    return out


def williams(h, l, c, n=14):
    out = [None] * len(c)
    for i in range(n - 1, len(c)):
        hh, ll = max(h[i - n + 1:i + 1]), min(l[i - n + 1:i + 1])
        out[i] = -50.0 if hh == ll else (hh - c[i]) / (hh - ll) * -100
    return out


def mfi(h, l, c, v, n=14):
    tp = [(a + b + d) / 3 for a, b, d in zip(h, l, c)]
    out = [None] * len(c)
    for i in range(n, len(c)):
        pos = sum(tp[j] * v[j] for j in range(i - n + 1, i + 1) if tp[j] > tp[j - 1])
        neg = sum(tp[j] * v[j] for j in range(i - n + 1, i + 1) if tp[j] < tp[j - 1])
        out[i] = 100.0 if neg == 0 else 100 - 100 / (1 + pos / neg)
    return out


def obv(c, v):
    out, s = [0.0], 0.0
    for i in range(1, len(c)):
        s += v[i] if c[i] > c[i - 1] else -v[i] if c[i] < c[i - 1] else 0
        out.append(s)
    return out


def sar(h, l, step=0.02, mx=0.2):
    L = len(h)
    if L < 2:
        return [None] * L
    out, up, af = [None], h[1] >= h[0], step
    ep, s = (h[0], l[0]) if up else (l[0], h[0])
    for i in range(1, L):
        s = s + af * (ep - s)
        if up:
            s = min(s, l[i - 1], l[i - 2] if i > 1 else l[i - 1])
            if l[i] < s:
                up, s, ep, af = False, ep, l[i], step
            elif h[i] > ep:
                ep, af = h[i], min(af + step, mx)
        else:
            s = max(s, h[i - 1], h[i - 2] if i > 1 else h[i - 1])
            if h[i] > s:
                up, s, ep, af = True, ep, h[i], step
            elif l[i] < ep:
                ep, af = l[i], min(af + step, mx)
        out.append(s)
    return out


def streak(c, rising=True):
    out, k = [0], 0
    for i in range(1, len(c)):
        k = k + 1 if (c[i] > c[i - 1] if rising else c[i] < c[i - 1]) else 0
        out.append(k)
    return out


# ---------------- 運算元目錄（前端也用這份產生選單） ----------------
OPERANDS = [
    {"k": "close", "label": "收盤價", "en": "Close"},
    {"k": "open", "label": "開盤價", "en": "Open"},
    {"k": "high", "label": "最高價", "en": "High"},
    {"k": "low", "label": "最低價", "en": "Low"},
    {"k": "volume", "label": "成交量", "en": "Volume"},
    {"k": "chg_pct", "label": "當日漲跌幅(%)", "en": "Change %"},
    {"k": "ma", "label": "MA 均線", "en": "SMA", "n": 20},
    {"k": "ema", "label": "EMA 均線", "en": "EMA", "n": 20},
    {"k": "rsi", "label": "RSI", "en": "RSI", "n": 14},
    {"k": "macd_dif", "label": "MACD DIF", "en": "MACD line"},
    {"k": "macd_dea", "label": "MACD DEA", "en": "MACD signal"},
    {"k": "macd_hist", "label": "MACD 柱", "en": "MACD hist"},
    {"k": "kd_k", "label": "KD K 值", "en": "Stoch %K", "n": 9},
    {"k": "kd_d", "label": "KD D 值", "en": "Stoch %D", "n": 9},
    {"k": "boll_up", "label": "布林上軌", "en": "BB upper", "n": 20},
    {"k": "boll_mid", "label": "布林中軌", "en": "BB middle", "n": 20},
    {"k": "boll_dn", "label": "布林下軌", "en": "BB lower", "n": 20},
    {"k": "hh", "label": "前 N 日最高價", "en": "Highest high (N)", "n": 20},
    {"k": "ll", "label": "前 N 日最低價", "en": "Lowest low (N)", "n": 20},
    {"k": "vol_ma", "label": "N 日均量", "en": "Volume SMA", "n": 20},
    {"k": "vol_ratio", "label": "量比（量 ÷ N 日均量）", "en": "Volume ratio", "n": 5},
    {"k": "atr", "label": "ATR", "en": "ATR", "n": 14},
    {"k": "prev_close", "label": "前一日收盤價", "en": "Previous close"},
    {"k": "chg_n", "label": "N 日漲跌幅(%)", "en": "N-day change %", "n": 5},
    {"k": "gap_pct", "label": "跳空幅度(%)", "en": "Gap %"},
    {"k": "range_pct", "label": "當日振幅(%)", "en": "Day range %"},
    {"k": "bias", "label": "乖離率(%)", "en": "Bias %", "n": 20},
    {"k": "ma_slope", "label": "均線斜率（較前一日 %）", "en": "SMA slope %", "n": 20},
    {"k": "dist_hh", "label": "距 N 日高點(%)", "en": "% from N-day high", "n": 52},
    {"k": "dist_ll", "label": "距 N 日低點(%)", "en": "% from N-day low", "n": 52},
    {"k": "up_days", "label": "連續上漲天數", "en": "Up-day streak"},
    {"k": "down_days", "label": "連續下跌天數", "en": "Down-day streak"},
    {"k": "boll_pctb", "label": "布林 %B", "en": "Bollinger %B", "n": 20},
    {"k": "boll_width", "label": "布林帶寬(%)", "en": "Bollinger width %", "n": 20},
    {"k": "atr_pct", "label": "ATR 佔股價(%)", "en": "ATR % of price", "n": 14},
    {"k": "wr", "label": "威廉 %R", "en": "Williams %R", "n": 14},
    {"k": "cci", "label": "CCI", "en": "CCI", "n": 20},
    {"k": "mfi", "label": "MFI 資金流量", "en": "MFI", "n": 14},
    {"k": "adx", "label": "ADX 趨勢強度", "en": "ADX", "n": 14},
    {"k": "pdi", "label": "+DI", "en": "+DI", "n": 14},
    {"k": "mdi", "label": "-DI", "en": "-DI", "n": 14},
    {"k": "roc", "label": "ROC 變動率(%)", "en": "ROC %", "n": 12},
    {"k": "obv", "label": "OBV 能量潮", "en": "OBV"},
    {"k": "obv_ma", "label": "OBV 均線", "en": "OBV SMA", "n": 20},
    {"k": "sar", "label": "SAR 拋物線", "en": "Parabolic SAR"},
    {"k": "rel_chg", "label": "當日漲跌 − 大盤(%)", "en": "Day change vs benchmark %"},
    {"k": "rel_n", "label": "N 日報酬 − 大盤(%)", "en": "N-day return vs benchmark %", "n": 20},
    {"k": "bench_chg", "label": "大盤當日漲跌(%)", "en": "Benchmark change %"},
    {"k": "bench_ma_pct", "label": "大盤距 N 日均線(%)", "en": "Benchmark vs SMA %", "n": 200},
    {"k": "regime", "label": "市場環境（1=多頭平穩，0=修正）", "en": "Market regime (1 = uptrend, 0 = correction)"},
    {"k": "value", "label": "數值", "en": "Value", "v": 0},
]
BENCH_KEYS = {"rel_chg", "rel_n", "bench_chg", "bench_ma_pct", "regime"}


def align_bench(bars, bench):
    if not bench:
        return None
    by_day = {b["t"] // 86400: b["c"] for b in bench}
    days = sorted(by_day)
    out, j, last = [], 0, None
    for b in bars:
        d = b["t"] // 86400
        while j < len(days) and days[j] <= d:
            last = by_day[days[j]]; j += 1
        out.append(last)
    return out


def regime_of(bc):
    """大盤在 200 日線上且近 20 日上漲 = 1（多頭平穩），否則 0（修正）。"""
    if not bc:
        return []
    m = sma(bc, 200)
    return [None if m[i] is None or i < 20 or bc[i - 20] is None else (1.0 if bc[i] > m[i] and bc[i] > bc[i - 20] else 0.0) for i in range(len(bc))]
OPS = {"gt": ">", "lt": "<", "ge": "≥", "le": "≤", "cross_up": "向上穿越", "cross_down": "向下穿越"}


class Series:
    """一檔股票的日 K，指標結果快取起來重複使用。"""

    def __init__(self, bars, bench=None):
        self.bars = bars
        self.o = [b["o"] for b in bars]; self.h = [b["h"] for b in bars]
        self.l = [b["l"] for b in bars]; self.c = [b["c"] for b in bars]
        self.v = [float(b.get("v") or 0) for b in bars]
        self._cache = {}
        self.bc = align_bench(bars, bench)  # 大盤收盤價（依日期對齊，缺的用前一天補）

    def get(self, op):
        k = op.get("k")
        n = int(op.get("n") or 0)
        key = (k, n, op.get("v"))
        if key in self._cache:
            return self._cache[key]
        c, L = self.c, len(self.c)
        if k == "close": r = c
        elif k == "open": r = self.o
        elif k == "high": r = self.h
        elif k == "low": r = self.l
        elif k == "volume": r = self.v
        elif k == "value": r = [float(op.get("v") or 0)] * L
        elif k == "chg_pct": r = [None] + [(c[i] - c[i - 1]) / c[i - 1] * 100 if c[i - 1] else None for i in range(1, L)]
        elif k == "ma": r = sma(c, n or 20)
        elif k == "ema": r = ema(c, n or 20)
        elif k == "rsi": r = rsi(c, n or 14)
        elif k in ("macd_dif", "macd_dea", "macd_hist"):
            r = macd(c)[("macd_dif", "macd_dea", "macd_hist").index(k)]
        elif k in ("kd_k", "kd_d"):
            r = kd(self.h, self.l, c, n or 9)[0 if k == "kd_k" else 1]
        elif k in ("boll_up", "boll_mid", "boll_dn"):
            r = boll(c, n or 20)[("boll_up", "boll_mid", "boll_dn").index(k)]
        elif k == "hh": nn = n or 20; r = [max(self.h[i - nn:i]) if i >= nn else None for i in range(L)]
        elif k == "ll": nn = n or 20; r = [min(self.l[i - nn:i]) if i >= nn else None for i in range(L)]
        elif k == "vol_ma": r = sma(self.v, n or 20)
        elif k == "vol_ratio":
            vm = sma(self.v, n or 5)
            r = [None] + [self.v[i] / vm[i - 1] if vm[i - 1] else None for i in range(1, L)]
        elif k == "atr": r = atr(self.h, self.l, c, n or 14)
        elif k == "prev_close": r = [None] + c[:-1]
        elif k == "chg_n": nn = n or 5; r = [(c[i] / c[i - nn] - 1) * 100 if i >= nn and c[i - nn] else None for i in range(L)]
        elif k == "roc": nn = n or 12; r = [(c[i] / c[i - nn] - 1) * 100 if i >= nn and c[i - nn] else None for i in range(L)]
        elif k == "gap_pct": r = [None] + [(self.o[i] / c[i - 1] - 1) * 100 if c[i - 1] else None for i in range(1, L)]
        elif k == "range_pct": r = [None] + [(self.h[i] - self.l[i]) / c[i - 1] * 100 if c[i - 1] else None for i in range(1, L)]
        elif k == "bias": m = sma(c, n or 20); r = [None if x is None or not x else (v / x - 1) * 100 for v, x in zip(c, m)]
        elif k == "ma_slope": m = sma(c, n or 20); r = [None] + [None if m[i] is None or not m[i - 1] else (m[i] / m[i - 1] - 1) * 100 for i in range(1, L)]
        elif k == "dist_hh": nn = n or 52; r = [(c[i] / max(self.h[max(0, i - nn + 1):i + 1]) - 1) * 100 if i >= nn - 1 else None for i in range(L)]
        elif k == "dist_ll": nn = n or 52; r = [(c[i] / min(self.l[max(0, i - nn + 1):i + 1]) - 1) * 100 if i >= nn - 1 else None for i in range(L)]
        elif k == "up_days": r = streak(c, True)
        elif k == "down_days": r = streak(c, False)
        elif k in ("boll_pctb", "boll_width"):
            up, mid, dn = boll(c, n or 20)
            if k == "boll_pctb": r = [None if u is None or u == d else (v - d) / (u - d) for v, u, d in zip(c, up, dn)]
            else: r = [None if m is None or not m else (u - d) / m * 100 for u, m, d in zip(up, mid, dn)]
        elif k == "atr_pct": a = atr(self.h, self.l, c, n or 14); r = [None if x is None or not v else x / v * 100 for x, v in zip(a, c)]
        elif k == "wr": r = williams(self.h, self.l, c, n or 14)
        elif k == "cci": r = cci(self.h, self.l, c, n or 20)
        elif k == "mfi": r = mfi(self.h, self.l, c, self.v, n or 14)
        elif k in ("pdi", "mdi", "adx"): r = dmi(self.h, self.l, c, n or 14)[("pdi", "mdi", "adx").index(k)]
        elif k == "obv": r = obv(c, self.v)
        elif k == "obv_ma": r = sma(obv(c, self.v), n or 20)
        elif k == "sar": r = sar(self.h, self.l)
        elif k in BENCH_KEYS:
            bc = self.bc
            if not bc:
                r = [None] * L
            elif k == "bench_chg": r = [None] + [(bc[i] / bc[i - 1] - 1) * 100 if bc[i] and bc[i - 1] else None for i in range(1, L)]
            elif k == "rel_chg":
                r = [None] + [((c[i] / c[i - 1]) - (bc[i] / bc[i - 1])) * 100 if c[i - 1] and bc[i] and bc[i - 1] else None for i in range(1, L)]
            elif k == "rel_n":
                nn = n or 20
                r = [((c[i] / c[i - nn]) - (bc[i] / bc[i - nn])) * 100 if i >= nn and c[i - nn] and bc[i] and bc[i - nn] else None for i in range(L)]
            elif k == "bench_ma_pct":
                m = sma([x if x is not None else 0 for x in bc], n or 200)
                r = [None if m[i] is None or not bc[i] else (bc[i] / m[i] - 1) * 100 for i in range(L)]
            else: r = regime_of([x if x is not None else 0 for x in bc])
        else: raise ValueError(f"不支援的指標：{k}")
        self._cache[key] = r
        return r

    def rule(self, rule, i):
        a, b = self.get(rule["a"]), self.get(rule["b"])
        op = rule["op"]
        if a[i] is None or b[i] is None:
            return False
        if op == "gt": return a[i] > b[i]
        if op == "lt": return a[i] < b[i]
        if op == "ge": return a[i] >= b[i]
        if op == "le": return a[i] <= b[i]
        if i < 1 or a[i - 1] is None or b[i - 1] is None:
            return False
        if op == "cross_up": return a[i - 1] <= b[i - 1] and a[i] > b[i]
        if op == "cross_down": return a[i - 1] >= b[i - 1] and a[i] < b[i]
        raise ValueError(f"不支援的比較：{op}")

    def group(self, g, i):
        rules = (g or {}).get("rules") or []
        if not rules:
            return False
        res = (self.rule(r, i) for r in rules)
        return all(res) if (g.get("mode") or "all") == "all" else any(res)


def describe(op):
    for o in OPERANDS:
        if o["k"] == op.get("k"):
            if op["k"] == "value":
                return str(op.get("v"))
            return f"{o['label']}({op['n']})" if op.get("n") and "n" in o else o["label"]
    return op.get("k", "?")


# ---------------- 回測 ----------------
def fee_model(code, mkt):
    if mkt == "tw":
        etf = code.startswith("0")
        return lambda amt: max(20.0, round(amt * 0.001425)), lambda amt: max(20.0, round(amt * 0.001425)) + round(amt * (0.001 if etf else 0.003))
    return lambda amt: 0.0, lambda amt: 0.0


def backtest_one(code, bars, strat, capital, bench=None):
    """訊號以當天收盤判斷、隔天開盤成交（避免偷看未來）。停損停利以盤中最高最低觸發。"""
    s = Series(bars, bench)
    buy_fee, sell_fee = fee_model(code, strat.get("mkt", "tw"))
    sl, tp = float(strat.get("stop_loss") or 0) / 100, float(strat.get("take_profit") or 0) / 100
    max_hold = int(strat.get("max_hold") or 0)
    trail = float(strat.get("trailing_stop") or 0) / 100
    atr_k = float(strat.get("atr_stop") or 0)
    min_hold = int(strat.get("min_hold") or 0)
    cooldown = int(strat.get("cooldown") or 0)
    atr_v = atr(s.h, s.l, s.c, 14) if atr_k else None
    atr_px, last_stop_i = 0.0, -10 ** 9
    peak = 0.0  # 進場後的最高價（移動停損用）
    size = float(strat.get("size_pct") or 100) / 100
    cash, shares, entry_px, entry_i, cost = capital, 0, 0.0, 0, 0.0
    trades, equity = [], []
    pending = None  # "buy" / "sell"，隔天開盤執行
    for i, b in enumerate(bars):
        # 1) 執行前一天收盤產生的訊號（開盤價成交）
        if pending == "buy" and shares == 0 and b["o"] > 0:
            budget = cash * size
            qty = int(budget / (b["o"] * 1.002))
            if qty > 0:
                amt = qty * b["o"]; f = buy_fee(amt)
                cash -= amt + f; shares, entry_px, entry_i, cost = qty, b["o"], i, amt + f
                peak = b["o"]
                a0 = atr_v[i - 1] if atr_v and i > 0 else None
                atr_px = b["o"] - atr_k * a0 if a0 else 0.0
        elif pending == "sell" and shares:
            cash, shares = _close(trades, code, bars, entry_i, i, entry_px, b["o"], shares, cost, sell_fee, cash, "出場條件")
        pending = None
        # 2) 盤中停損／停利
        if shares:
            reason, px = None, None
            if sl and b["l"] <= entry_px * (1 - sl):
                reason, px = "停損", min(b["o"], entry_px * (1 - sl))
            elif atr_px and b["l"] <= atr_px:
                reason, px = "ATR 停損", min(b["o"], atr_px)
            elif trail and b["l"] <= peak * (1 - trail):
                reason, px = "移動停損", min(b["o"], peak * (1 - trail))
            elif tp and b["h"] >= entry_px * (1 + tp):
                reason, px = "停利", max(b["o"], entry_px * (1 + tp))
            elif max_hold and i - entry_i >= max_hold:
                reason, px = "持有天數到期", b["c"]
            if reason:
                cash, shares = _close(trades, code, bars, entry_i, i, entry_px, px, shares, cost, sell_fee, cash, reason)
                if "停損" in reason:
                    last_stop_i = i
            else:
                peak = max(peak, b["h"])
        # 3) 收盤判斷訊號
        if shares == 0 and i - last_stop_i > cooldown and s.group(strat.get("entry"), i):
            pending = "buy"
        elif shares and i - entry_i >= min_hold and (strat.get("exit") or {}).get("rules") and s.group(strat.get("exit"), i):
            pending = "sell"
        equity.append([b["t"], cash + shares * b["c"]])
    if shares:  # 最後一天仍持有：以收盤價計算未平倉（標記）
        last = bars[-1]
        trades.append({"code": code, "entry_t": bars[entry_i]["t"], "exit_t": last["t"], "entry": entry_px, "exit": last["c"],
                       "qty": shares, "pnl": shares * last["c"] - sell_fee(shares * last["c"]) - cost,
                       "ret": (shares * last["c"] - sell_fee(shares * last["c"]) - cost) / cost * 100, "reason": "未平倉", "days": len(bars) - 1 - entry_i, "open": True})
    return {"code": code, "equity": equity, "trades": trades}


def _close(trades, code, bars, ei, i, entry_px, px, qty, cost, sell_fee, cash, reason):
    amt = qty * px; f = sell_fee(amt); pnl = amt - f - cost
    trades.append({"code": code, "entry_t": bars[ei]["t"], "exit_t": bars[i]["t"], "entry": entry_px, "exit": px, "qty": qty,
                   "pnl": pnl, "ret": pnl / cost * 100, "reason": reason, "days": i - ei})
    return cash + amt - f, 0


def metrics(equity, trades, capital, bench=None):
    if not equity:
        return {}
    vals = [e[1] for e in equity]
    peak, mdd = vals[0], 0.0
    for v in vals:
        peak = max(peak, v); mdd = min(mdd, (v - peak) / peak)
    rets = [(vals[i] - vals[i - 1]) / vals[i - 1] for i in range(1, len(vals)) if vals[i - 1]]
    mean = sum(rets) / len(rets) if rets else 0
    sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / len(rets)) if rets else 0
    years = max((equity[-1][0] - equity[0][0]) / 86400 / 365.25, 1e-9)
    total = vals[-1] / capital - 1
    closed = [t for t in trades if not t.get("open")]
    wins = [t for t in closed if t["pnl"] > 0]
    loss = [t for t in closed if t["pnl"] <= 0]
    gw, gl = sum(t["pnl"] for t in wins), -sum(t["pnl"] for t in loss)
    m = {"total_return": total * 100, "cagr": ((vals[-1] / capital) ** (1 / years) - 1) * 100 if vals[-1] > 0 else -100,
         "max_drawdown": mdd * 100, "sharpe": (mean / sd * math.sqrt(252)) if sd else 0, "trades": len(closed),
         "win_rate": len(wins) / len(closed) * 100 if closed else 0, "profit_factor": (gw / gl) if gl else (None if not gw else 999),
         "avg_trade": sum(t["ret"] for t in closed) / len(closed) if closed else 0,
         "avg_days": sum(t["days"] for t in closed) / len(closed) if closed else 0, "final": vals[-1], "years": years}
    if bench:
        m["bench_return"] = (bench[-1][1] / bench[0][1] - 1) * 100 if bench[0][1] else 0
    return m


def backtest(strat, data, capital=1_000_000, bench=None):
    """data: {code: bars}；bench: 大盤日 K（比較與市場環境條件用）。資金平均分配給每一檔，最後合併權益曲線。"""
    codes = [c for c in data if data[c]]
    if not codes:
        return {"error": "沒有可回測的資料"}
    per = capital / len(codes)
    results, all_trades, by_t, bench_t = [], [], {}, {}
    for code in codes:
        r = backtest_one(code, data[code], strat, per, bench)
        bh = data[code][0]["c"]
        b_eq = [[b["t"], per * b["c"] / bh] for b in data[code]] if bh else []
        r["metrics"] = metrics(r["equity"], r["trades"], per, b_eq)
        results.append({"code": code, "metrics": r["metrics"], "trades": len([t for t in r["trades"] if not t.get("open")])})
        all_trades += r["trades"]
        for (t, v), (_, bv) in zip(r["equity"], b_eq):
            d = t // 86400
            by_t[d] = by_t.get(d, 0) + v
            bench_t[d] = bench_t.get(d, 0) + bv
    # 只保留所有股票都有資料的日期，避免開頭缺資料造成跳動
    counts = {}
    for code in codes:
        for b in data[code]:
            counts[b["t"] // 86400] = counts.get(b["t"] // 86400, 0) + 1
    days = sorted(d for d in by_t if counts.get(d) == len(codes))
    equity = [[d * 86400, by_t[d]] for d in days]
    bench = [[d * 86400, bench_t[d]] for d in days]
    all_trades.sort(key=lambda t: t["exit_t"], reverse=True)
    return {"equity": equity, "bench": bench, "metrics": metrics(equity, all_trades, capital, bench),
            "per_code": results, "trades": all_trades[:500], "capital": capital}


def signal_now(bars, group, bench=None):
    """最新一根 K 棒是否滿足條件（給提醒／自動下單用）。"""
    if not bars:
        return False
    return Series(bars, bench).group(group, len(bars) - 1)


def explain(group, bars, bench=None):
    """列出每條規則在最新一根的數值（給選股與提醒的說明）。"""
    s = Series(bars, bench)
    i = len(bars) - 1
    out = []
    for r in (group or {}).get("rules") or []:
        a, b = s.get(r["a"])[i], s.get(r["b"])[i]
        out.append({"text": f"{describe(r['a'])} {OPS.get(r['op'], r['op'])} {describe(r['b'])}", "a": a, "b": b, "ok": s.rule(r, i)})
    return out


# ---------------- 歷史訊號統計 ----------------
def _wilson(k, n, z=1.96):
    if not n:
        return None, None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def signal_stats(strat, data, bench=None, horizons=(5, 20, 60), cost=None):
    """進場條件「剛成立」的那些日子（前一天不成立），隔天開盤買、持有 h 天後收盤的報酬。
    回傳每檔與全部合併的：樣本數、勝率（含 95% 區間）、平均報酬、比大盤多賺多少，以及任意一天進場的基準。
    這是過去的統計，不代表未來勝率。"""
    mkt = strat.get("mkt", "tw")
    cost = (0.005 if mkt == "tw" else 0.001) if cost is None else cost
    entry = strat.get("entry")
    pooled = {h: {"r": [], "x": [], "base": []} for h in horizons}
    per, recent = {}, []
    for code, bars in data.items():
        if len(bars) < 80:
            continue
        sr = Series(bars, bench)
        bc = sr.bc
        hit = [sr.group(entry, i) for i in range(len(bars))]
        st = {h: {"r": [], "x": []} for h in horizons}
        for i in range(1, len(bars) - 1):
            for h in horizons:
                j = i + h
                if j >= len(bars) or not bars[i + 1]["o"]:
                    continue
                ret = bars[j]["c"] / bars[i + 1]["o"] - 1 - cost
                bret = (bc[j] / bc[i + 1] - 1) if bc and bc[j] and bc[i + 1] else None
                pooled[h]["base"].append(ret)
                if hit[i] and not hit[i - 1]:
                    st[h]["r"].append(ret)
                    pooled[h]["r"].append(ret)
                    if bret is not None:
                        st[h]["x"].append(ret - bret)
                        pooled[h]["x"].append(ret - bret)
        for i in range(max(1, len(bars) - 60), len(bars)):
            if hit[i] and not hit[i - 1]:
                recent.append({"code": code, "t": bars[i]["t"], "c": bars[i]["c"], "now": bars[-1]["c"]})
        per[code] = {h: _summ(st[h]["r"], st[h]["x"]) for h in horizons}
    out = {"horizons": list(horizons), "cost": cost, "per": per,
           "all": {h: _summ(pooled[h]["r"], pooled[h]["x"]) for h in horizons},
           "base": {h: _summ(pooled[h]["base"], []) for h in horizons},
           "recent": sorted(recent, key=lambda x: -x["t"])[:30]}
    return out


def _summ(rs, xs):
    n = len(rs)
    if not n:
        return {"n": 0}
    k = sum(1 for r in rs if r > 0)
    lo, hi = _wilson(k, n)
    srt = sorted(rs)
    return {"n": n, "win": k / n, "win_lo": lo, "win_hi": hi, "avg": sum(rs) / n, "med": srt[n // 2],
            "worst": srt[0], "excess": (sum(xs) / len(xs)) if xs else None}
