"""找各市場最適合的「選策略方式」：看多長的期間 × 多久重新選一次。

做法：過去 18 個月，每個月底（或每季底）只用當時以前的資料、依某種評分選出第一名策略，持有到下次重選，
把所有區間串起來看真實（樣本外）報酬，再跟等權重全買、大盤比。
同一個時間點、同一個期間長度的回測結果會共用，避免重複計算。

用法：py tools/meta_research.py [tw|us|all]
結果寫入 DATA_DIR/ai_meta.json，pick_research.py 會讀取各市場選中的方式。
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pick_research as R  # noqa: E402
import picker as PK  # noqa: E402

LEN = {"1m": 21, "3m": 63, "6m": 126, "12m": 252, "3y": 756}
METHODS = {  # 名稱: 期間組合（等權重）
    "1m": ["1m"], "3m": ["3m"], "6m": ["6m"], "12m": ["12m"],
    "1m+3m": ["1m", "3m"], "3m+6m": ["3m", "6m"], "6m+12m": ["6m", "12m"],
    "3m+6m+12m": ["3m", "6m", "12m"], "12m+3y": ["12m", "3y"],
}
REBAL = {"monthly": 21, "quarterly": 63}
MONTHS = 18


def run(mkt):
    t0 = time.time()
    codes = R.universe(mkt)
    data, bench = R.load_data(mkt, codes)
    feats = {c: PK.features(b) for c, b in data.items()}
    n = len(bench) - 1
    ends = [n - k * 21 for k in range(MONTHS, 0, -1)]
    cfgs = list(R.configs())
    # 1) 每個時間點 × 每個期間長度，所有設定的回測統計（共用）
    cache = {}
    for e in ends:
        for w, L in LEN.items():
            cache[(e, w)] = {}
            st, et = bench[max(0, e - L)]["t"], bench[e]["t"]
            ew = PK.stats(PK.ew_equity(data, st, et)).get("ret", 0)
            for cfg in cfgs:
                cfg = dict(cfg, mkt=mkt)
                r = PK.portfolio_backtest(data, feats, bench, cfg, st, et)
                s = PK.stats(r["equity"]) if r else {}
                s["excess"] = s.get("ret", 0) - ew
                cache[(e, w)][R.cfg_id(cfg)] = {"cfg": cfg, "s": s}
        print(f"  [{mkt}] {time.strftime('%Y-%m-%d', time.gmtime(bench[e]['t']))} 完成（{time.time() - t0:.0f} 秒）", flush=True)

    def pick(e, wins):
        res = {i: {"cfg": cache[(e, wins[0])][i]["cfg"], "win": {w: cache[(e, w)][i]["s"] for w in wins}} for i in cache[(e, wins[0])]}
        return R.score(res, [(w, LEN[w], 1 / len(wins)) for w in wins])[0][0], res

    # 2) 每種方式 × 重選頻率，串接樣本外報酬
    out = {}
    for rb, step in REBAL.items():
        sel = [e for i, e in enumerate(ends) if i % (step // 21) == 0]
        for name, wins in METHODS.items():
            ch, rows, peak, mdd = 1.0, [], 1.0, 0.0
            for i, e in enumerate(sel):
                te = sel[i + 1] if i + 1 < len(sel) else n
                best, res = pick(e, wins)
                r = PK.portfolio_backtest(data, feats, bench, res[best]["cfg"], bench[e]["t"], bench[te]["t"])
                ret = PK.stats(r["equity"]).get("ret", 0) if r else 0
                ch *= 1 + ret / 100; peak = max(peak, ch); mdd = min(mdd, ch / peak - 1)
                rows.append({"from": bench[e]["t"], "to": bench[te]["t"], "pick": best, "ret": ret})
            wins_cnt = 0
            for x in rows:
                ew = PK.stats(PK.ew_equity(data, x["from"], x["to"])).get("ret", 0)
                x["ew"] = ew; wins_cnt += x["ret"] > ew
            out[f"{name}|{rb}"] = {"method": name, "wins": wins, "rebal": rb, "total": (ch - 1) * 100, "mdd": mdd * 100,
                                   "beat_ew": wins_cnt, "periods": len(rows), "rows": rows}
    st, et = bench[ends[0]]["t"], bench[n]["t"]
    base = {"ew": PK.stats(PK.ew_equity(data, st, et)).get("ret"), "bench": PK.stats(PK.bench_equity(bench, st, et)).get("ret")}
    # 3) 選出最好的方式：累積報酬為主，但要求多數區間贏等權重（避免靠一兩次大賺）
    ranked = sorted(out, key=lambda k: -(out[k]["total"] + (0 if out[k]["beat_ew"] * 2 >= out[k]["periods"] else -1000)))
    print(f"[{mkt}] {MONTHS} 個月樣本外：等權重 {base['ew']:+.1f}%  大盤 {base['bench']:+.1f}%")
    for k in ranked:
        o = out[k]
        print(f"  {k:24s} {o['total']:+7.1f}%  回撤 {o['mdd']:6.1f}%  贏等權重 {o['beat_ew']}/{o['periods']}")
    return {"mkt": mkt, "updated": int(time.time()), "months": MONTHS, "best": ranked[0], "ranked": ranked, "methods": out, "base": base}


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    path = os.path.join(R.S.DATA_DIR, "ai_meta.json")
    for m in (["tw", "us"] if which == "all" else [which]):
        r = run(m)
        try:  # 寫入前重新讀檔再合併：台股、美股可能同時在跑
            res = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError):
            res = {}
        res[m] = r
        json.dump(res, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已寫入", path)
