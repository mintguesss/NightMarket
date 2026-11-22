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
GRID = {"strat": list(PK.STRATS), "top": [5, 10], "rebal": [5, 20], "stop": [0, 10], "regime": [False, True]}
WINDOWS = [("3m", 63, 0.2), ("6m", 126, 0.3), ("12m", 252, 0.3), ("3y", 756, 0.2)]  # 顯示用的時間窗
# 選策略用的評分：滾動樣本外測試中「只看近 6 個月和 12 個月」在台股、美股都比加入 3 個月或 3 年的版本好
SELECT = [("6m", 126, 0.5), ("12m", 252, 0.5)]
LONG = [("12m", 252, 0.5), ("3y", 756, 0.5)]


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
    return f"{c['strat']}|top{c['top']}|r{c['rebal']}|sl{c['stop']}|{'regime' if c['regime'] else 'all'}"


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


def walk_forward(mkt, data, feats, bench, steps=6, hold=63, wins=SELECT, log=True):
    """滾動樣本外：在每個時間點只用過去資料選出第一名，持有下一季，最後串起來看真實表現。"""
    n = len(bench) - 1
    chain, rows = 1.0, []
    ew_chain, bm_chain = 1.0, 1.0
    for k in range(steps, 0, -1):
        sel_end = n - k * hold
        test_end = min(n, sel_end + hold)
        if sel_end < 300:
            continue
        res, _ = evaluate(mkt, data, feats, bench, sel_end, wins)
        best = score(res, wins)[0][0]
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
    order, total = score(res, SELECT)
    print(f"[{mkt}] 前 10 名（{time.time() - t0:.0f} 秒）")
    for i in order[:10]:
        w = res[i]["win"]
        print(f"  {total[i]:.2f} {i:38s} " + "  ".join(f"{k}:{w.get(k, {}).get('ret', 0):+6.1f}%/夏普{w.get(k, {}).get('sharpe', 0):4.1f}" for k, _, _ in WINDOWS) + f"  3y回撤{w.get('3y', {}).get('mdd', 0):.0f}%")
    print("  基準：" + "  ".join(f"{k} 等權{base[k]['ew'].get('ret', 0):+.1f}% 大盤{base[k]['bench'].get('ret', 0):+.1f}%" for k, _, _ in WINDOWS))
    print(f"[{mkt}] 滾動樣本外驗證…")
    wf = walk_forward(mkt, data, feats, bench)
    wf_long = walk_forward(mkt, data, feats, bench, wins=LONG, log=False)
    wf["long_total"] = wf_long["total"]
    print(f"[{mkt}] 樣本外串接：策略 {wf['total']:+.1f}%（偏長期評分 {wf_long['total']:+.1f}%）  等權 {wf['ew_total']:+.1f}%  大盤 {wf['bench_total']:+.1f}%  （{time.time() - t0:.0f} 秒）")
    # 各策略（不分參數）最佳成績，給網頁的比較表
    by_strat = {}
    for i in order:
        k = res[i]["cfg"]["strat"]
        by_strat.setdefault(k, {"id": i, "score": total[i], "win": res[i]["win"]})
    return {"mkt": mkt, "updated": int(time.time()), "universe": len(data), "best": res[order[0]]["cfg"], "best_id": order[0],
            "top": [{"id": i, "score": total[i], "cfg": res[i]["cfg"], "win": res[i]["win"]} for i in order[:15]],
            "by_strat": [{"strat": k, "name": PK.STRATS[k]["name"], "desc": PK.STRATS[k]["desc"], **v} for k, v in by_strat.items()],
            "base": base, "walk_forward": wf}


def run_all(which="all"):
    path = os.path.join(S.DATA_DIR, "ai_research.json")
    try:
        out = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        out = {}
    for m in (["tw", "us"] if which == "all" else [which]):
        out[m] = run(m)
        json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已寫入", path)
    return out


if __name__ == "__main__":
    run_all(sys.argv[1] if len(sys.argv) > 1 else "all")
