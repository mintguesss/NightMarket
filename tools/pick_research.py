"""AI 選股策略研究：抓股票池日 K → 所有候選策略 × 參數做投資組合回測 → 依近期表現挑出最好的策略。

驗證方式：
  1. 多個時間窗（近 3 個月、6 個月、12 個月、3 年）分別回測，偏重近期但要求各時段都不能太差
  2. 跟「等權重買進整個股票池」和大盤比，扣掉股票池本身的倖存者偏差
  3. 滾動式樣本外測試：每次只用當時以前的資料選策略，再看下一季的真實表現（檢查是不是過度擬合）
結果寫到 DATA_DIR/ai_research.json，網頁「AI 選股」頁會讀取。

用法：py tools/pick_research.py [tw|us|all]
"""
import itertools
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import picker as PK  # noqa: E402
import server as S  # noqa: E402

BENCH = {"tw": "0050", "us": "US.SPY"}
GRID = {"strat": list(PK.STRATS), "top": [5, 10], "rebal": [5, 20], "stop": [0, 10], "regime": list(PK.REGIMES)}
LEN = {"1m": 21, "3m": 63, "6m": 126, "12m": 252, "3y": 756}
WINDOWS = [(k, v, 0.2) for k, v in LEN.items()]  # 顯示用的時間窗
# 選策略用的評分（看哪些期間）與多久重選一次：各市場不同，由 tools/meta_research.py 的交叉測試決定（ai_meta.json）
DEFAULT_METHOD = {"wins": ["6m", "12m"], "rebal": "quarterly"}
LONG = [("12m", 252, 0.5), ("3y", 756, 0.5)]
HOLD = {"monthly": 21, "quarterly": 63}


def method(mkt):
    """這個市場選策略的方式：{wins, rebal, name}。"""
    try:
        m = json.load(open(os.path.join(S.DATA_DIR, "ai_meta.json"), encoding="utf-8"))[mkt]
        b = m["methods"][m["best"]]
        return {"wins": b["wins"], "rebal": b["rebal"], "name": b["method"]}
    except (OSError, ValueError, KeyError):
        return dict(DEFAULT_METHOD, name="6m+12m")


def select_windows(mkt):
    w = method(mkt)["wins"]
    return [(k, LEN[k], 1 / len(w)) for k in w]


def universe(mkt):
    return S.ai_universe(mkt)


def load_data(mkt, codes):
    cache = os.path.join(S.DATA_DIR, f"research_{mkt}.json")
    try:
        d = json.load(open(cache, encoding="utf-8"))
        if time.time() - d["t"] < 6 * 3600 and set(codes) <= set(d["data"]):
            return {c: d["data"][c] for c in codes}, d["bench"]
    except (OSError, ValueError, KeyError):
        pass

    def one(c):
        try:
            return c, S.kline(c, "1d", "5y")["bars"]
        except Exception as e:
            print("  抓不到", c, e)
            return c, None
    with ThreadPoolExecutor(6) as ex:
        data = {c: b for c, b in ex.map(one, codes) if b and len(b) > 300}
    bench = S.kline(BENCH[mkt], "1d", "5y")["bars"]
    json.dump({"t": time.time(), "data": data, "bench": bench}, open(cache, "w", encoding="utf-8"))
    return data, bench


def configs():
    keys = list(GRID)
    for vals in itertools.product(*(GRID[k] for k in keys)):
        yield dict(zip(keys, vals))


def cfg_id(c):
    return f"{c['strat']}|top{c['top']}|r{c['rebal']}|sl{c['stop']}|{PK.regime_mode(c['regime'])}"


def evaluate(mkt, data, feats, bench, end_i, windows=WINDOWS, cfgs=None):
    """以 bench 的第 end_i 根為終點，對每個設定跑各時間窗。回傳 {id: {cfg, win: {name: stats}}}。"""
    end_t = bench[end_i]["t"]
    res = {}
    base = {}
    for name, n, _ in windows:
        st = bench[max(0, end_i - n)]["t"]
        base[name] = {"ew": PK.stats(PK.ew_equity(data, st, end_t)), "bench": PK.stats(PK.bench_equity(bench, st, end_t))}
    for cfg in (cfgs or list(configs())):
        cfg = dict(cfg, mkt=mkt)
        out = {}
        for name, n, _ in windows:
            st = bench[max(0, end_i - n)]["t"]
            r = PK.portfolio_backtest(data, feats, bench, cfg, st, end_t)
            if not r:
                continue
            s = PK.stats(r["equity"], r["closed"]); s["trades"] = r["trades"]
            s["excess"] = s["ret"] - base[name]["ew"].get("ret", 0)
            out[name] = s
        res[cfg_id(cfg)] = {"cfg": cfg, "win": out}
    return res, base


def score(res, windows=WINDOWS):
    """各時間窗的夏普值排名百分位加權（近期權重高）；回撤太大或多數時段輸給等權重就扣分。"""
    ids = list(res)
    total = {i: 0.0 for i in ids}
    for name, _, w in windows:
        vals = sorted(ids, key=lambda i: res[i]["win"].get(name, {}).get("sharpe", -99))
        for r, i in enumerate(vals):
            total[i] += w * r / max(1, len(ids) - 1)
    for i in ids:
        win = res[i]["win"]
        beats = sum(1 for name, _, _ in windows if win.get(name, {}).get("excess", -1) > 0)
        if beats < len(windows) - 1:
            total[i] -= 0.3
        if win.get(windows[-1][0], {}).get("mdd", 0) < -35:
            total[i] -= 0.3
    return sorted(ids, key=lambda i: -total[i]), total


# ---------------- 壓力測試（找「最不容易壞」而不是「紙上賺最多」的策略） ----------------
STRESS_SLIP = 0.003  # 每邊 0.3% 滑價＝預設成本的三倍


def yearly(pts):
    """逐年報酬：{年: 報酬}，只算有 60 個交易日以上的年份。"""
    by, prev, out = {}, None, {}
    for t, v in pts:
        by.setdefault(time.gmtime(t).tm_year, []).append(v)
    for y in sorted(by):
        vs = by[y]; base = prev if prev else vs[0]
        if len(vs) >= 60 and base:
            out[y] = vs[-1] / base - 1
        prev = vs[-1]
    return out


def neighbors(i, ids):
    """參數鄰居：同策略、同大盤濾網，只差持股數、調倉頻率或停損其中一項。"""
    a = i.split("|")
    return [j for j in ids if j != i and (b := j.split("|"))[0] == a[0] and b[4] == a[4] and sum(x != y for x, y in zip(a[1:4], b[1:4])) == 1]


def robust_choose(mkt, data, feats, bench, end_i, res, wins, topk=20):
    """依評分由高到低檢查，第一個通過四項壓力測試的就採用：
    1. 成本加重（每邊滑價 0.3%）後，近 3 年仍贏等權重全買
    2. 逐年看，至少一半的年份贏等權重全買（不靠一兩段大行情）
    3. 參數鄰居的平均評分沒有明顯比較差（是一片高原，不是剛好的尖峰）
    4. 近 3 年至少 30 筆出場交易（樣本夠）
    都沒有全部通過，就用通過項目最多的（同分取評分高的），並標示「未全部通過」。"""
    order, total = score(res, wins)
    st, et = bench[max(0, end_i - 756)]["t"], bench[end_i]["t"]
    ew = PK.ew_equity(data, st, et); ew_ret = PK.stats(ew).get("ret", 0); ew_y = yearly(ew)
    checks = {}
    for i in order[:topk]:
        r = PK.portfolio_backtest(data, feats, bench, dict(res[i]["cfg"], slip=STRESS_SLIP), st, et)
        if not r:
            continue
        sr = PK.stats(r["equity"]).get("ret", 0); y = yearly(r["equity"])
        yrs = [k for k in y if k in ew_y]; beat = sum(1 for k in yrs if y[k] > ew_y[k])
        nb = neighbors(i, res)
        nb_avg = sum(total[j] for j in nb) / len(nb) if nb else total[i]
        ck = {"stress_ret": sr, "stress_excess": sr - ew_ret, "years": len(yrs), "years_beat": beat, "trades": len(r["closed"]),
              "nb_avg": nb_avg, "score": total[i],
              "yearly": {str(k): [y[k] * 100, ew_y[k] * 100] for k in yrs}}
        ck["pass"] = {"cost": ck["stress_excess"] > 0, "years": bool(yrs) and beat * 2 >= len(yrs),
                      "neighbors": nb_avg >= total[i] - 0.2, "trades": ck["trades"] >= 30}
        ck["ok"] = all(ck["pass"].values())
        checks[i] = ck
        if ck["ok"]:
            return i, checks, order, total
    if not checks:
        return order[0], checks, order, total
    best = max(checks, key=lambda i: (sum(checks[i]["pass"].values()), total[i]))
    return best, checks, order, total


def walk_forward(mkt, data, feats, bench, steps=6, hold=63, wins=None, log=True):
    """滾動樣本外：在每個時間點只用過去資料選出第一名，持有下一季，最後串起來看真實表現。"""
    wins = wins or select_windows(mkt)
    n = len(bench) - 1
    chain, rows = 1.0, []
    ew_chain, bm_chain = 1.0, 1.0
    for k in range(steps, 0, -1):
        sel_end = n - k * hold
        test_end = min(n, sel_end + hold)
        if sel_end < 300:
            continue
        res, _ = evaluate(mkt, data, feats, bench, sel_end, wins)
        best = robust_choose(mkt, data, feats, bench, sel_end, res, wins)[0]
        cfg = res[best]["cfg"]
        r = PK.portfolio_backtest(data, feats, bench, cfg, bench[sel_end]["t"], bench[test_end]["t"])
        s = PK.stats(r["equity"]) if r else {}
        ew = PK.stats(PK.ew_equity(data, bench[sel_end]["t"], bench[test_end]["t"]))
        bm = PK.stats(PK.bench_equity(bench, bench[sel_end]["t"], bench[test_end]["t"]))
        chain *= 1 + s.get("ret", 0) / 100; ew_chain *= 1 + ew.get("ret", 0) / 100; bm_chain *= 1 + bm.get("ret", 0) / 100
        rows.append({"from": bench[sel_end]["t"], "to": bench[test_end]["t"], "pick": best, "ret": s.get("ret"), "ew": ew.get("ret"), "bench": bm.get("ret")})
        if log:
            print(f"  樣本外 {time.strftime('%Y-%m-%d', time.gmtime(bench[sel_end]['t']))} 選 {best:38s} 下一季 {s.get('ret', 0):+6.1f}%  等權 {ew.get('ret', 0):+6.1f}%  大盤 {bm.get('ret', 0):+6.1f}%")
    return {"rows": rows, "total": (chain - 1) * 100, "ew_total": (ew_chain - 1) * 100, "bench_total": (bm_chain - 1) * 100}


def run(mkt):
    t0 = time.time()
    codes = universe(mkt)
    print(f"[{mkt}] 股票池 {len(codes)} 檔，抓資料中…")
    data, bench = load_data(mkt, codes)
    feats = {c: PK.features(b) for c, b in data.items()}
    print(f"[{mkt}] 有資料 {len(data)} 檔，開始回測 {len(list(configs()))} 組設定 × {len(WINDOWS)} 個時間窗")
    res, base = evaluate(mkt, data, feats, bench, len(bench) - 1)
    meth = method(mkt)
    best, checks, order, total = robust_choose(mkt, data, feats, bench, len(bench) - 1, res, select_windows(mkt))
    for i, ck in checks.items():
        print(f"  壓力測試 {i:38s} {'通過' if ck['ok'] else '未通過'}  成本加重後超額 {ck['stress_excess']:+.1f}%  逐年 {ck['years_beat']}/{ck['years']}  鄰居 {ck['nb_avg']:.2f}/{ck['score']:.2f}  交易 {ck['trades']}")
    print(f"[{mkt}] 採用 {best}")
    print(f"[{mkt}] 前 10 名（{time.time() - t0:.0f} 秒）")
    for i in order[:10]:
        w = res[i]["win"]
        print(f"  {total[i]:.2f} {i:38s} " + "  ".join(f"{k}:{w.get(k, {}).get('ret', 0):+6.1f}%/夏普{w.get(k, {}).get('sharpe', 0):4.1f}" for k, _, _ in WINDOWS) + f"  3y回撤{w.get('3y', {}).get('mdd', 0):.0f}%")
    print("  基準：" + "  ".join(f"{k} 等權{base[k]['ew'].get('ret', 0):+.1f}% 大盤{base[k]['bench'].get('ret', 0):+.1f}%" for k, _, _ in WINDOWS))
    print(f"[{mkt}] 滾動樣本外驗證…")
    hold = HOLD[meth["rebal"]]
    wf = walk_forward(mkt, data, feats, bench, steps=378 // hold, hold=hold)  # 過去 18 個月
    wf_long = walk_forward(mkt, data, feats, bench, steps=378 // hold, hold=hold, wins=LONG, log=False)
    wf["long_total"] = wf_long["total"]
    print(f"[{mkt}] 樣本外串接：策略 {wf['total']:+.1f}%（偏長期評分 {wf_long['total']:+.1f}%）  等權 {wf['ew_total']:+.1f}%  大盤 {wf['bench_total']:+.1f}%  （{time.time() - t0:.0f} 秒）")
    # 各策略（不分參數）最佳成績，給網頁的比較表
    by_strat = {}
    for i in order:
        k = res[i]["cfg"]["strat"]
        by_strat.setdefault(k, {"id": i, "score": total[i], "win": res[i]["win"]})
    return {"mkt": mkt, "updated": int(time.time()), "universe": len(data), "method": meth, "n_cfgs": len(res), "best": res[best]["cfg"], "best_id": best,
            "robust": checks.get(best), "robust_ok": bool(checks.get(best, {}).get("ok")), "checked": checks,
            "top": [{"id": i, "score": total[i], "cfg": res[i]["cfg"], "win": res[i]["win"]} for i in order[:15]],
            "by_strat": [{"strat": k, "name": PK.STRATS[k]["name"], "desc": PK.STRATS[k]["desc"], **v} for k, v in by_strat.items()],
            "base": base, "walk_forward": wf}


def run_all(which="all"):
    path = os.path.join(S.DATA_DIR, "ai_research.json")
    out = {}
    for m in (["tw", "us"] if which == "all" else [which]):
        r = run(m)
        try:  # 寫入前重新讀檔再合併：台股、美股可能同時在跑
            out = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError):
            out = {}
        out[m] = r
        json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已寫入", path)
    return out


if __name__ == "__main__":
    run_all(sys.argv[1] if len(sys.argv) > 1 else "all")
