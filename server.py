"""台股＋美股看盤 - 本機後端
啟動: py server.py  然後打開 http://localhost:8765  （或執行 台股看盤.bat 開獨立視窗）
資料來源:
  台股 即時報價/五檔/排行: 證交所 MIS      K線: Yahoo Finance
  台股 股票清單: 證交所/櫃買 OpenAPI       三大法人: 證交所 T86
  美股 報價/K線/搜尋/排行: Yahoo Finance
只用 Python 標準函式庫。
"""
import json
import os
import re
import socket
import ssl
import sys
import threading
import time
import uuid
import strategy as S
import urllib.parse
import urllib.request
import urllib.error
import http.cookiejar
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# 英文版 Windows 等非 UTF-8 主控台印中文會直接當掉，統一改用 UTF-8 輸出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import base64
import hmac

PORT = int(os.environ.get("PORT", "8765"))
HOST = os.environ.get("HOST", "127.0.0.1")          # 0.0.0.0 = 讓同網路的手機連得到
PASSWORD = os.environ.get("TWSTOCK_PASSWORD", "")   # 設定後非本機連線要輸入密碼
FROZEN = getattr(sys, "frozen", False)
ROOT = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = (os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "NightMarket")
                if FROZEN else os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("TWSTOCK_DATA", DEFAULT_DATA)
PAPER_FILE = os.path.join(DATA_DIR, "paper.json")
PAPER_AI_FILE = os.path.join(DATA_DIR, "paper_ai.json")  # AI 自己的模擬倉，跟使用者的分開
TW = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
POOL = ThreadPoolExecutor(12)

# 證交所/櫃買的憑證缺少 Subject Key Identifier，Python 3.13+ 的嚴格模式會拒絕。
# 仍然完整驗證憑證，只關閉 X509 嚴格檢查。
SSL_CTX = ssl.create_default_context()
if hasattr(ssl, "VERIFY_X509_STRICT"):
    SSL_CTX.verify_flags &= ~ssl.VERIFY_X509_STRICT

_cache = {}
_cache_lock = threading.Lock()


def cached(key, ttl, fn):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    val = fn()
    with _cache_lock:
        _cache[key] = (now, val)
    return val


def fetch(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read().decode("utf-8", errors="replace")


def fetch_json(url, timeout=12):
    return json.loads(fetch(url, timeout))


def _num(v):
    try:
        if v in (None, "", "-"):
            return None
        return float(v)
    except (ValueError, TypeError):
        return None


def is_tw(code):
    return not ("." in code or code.startswith("^"))


def tw_open(now=None):
    n = now or datetime.now(TW)
    m = n.hour * 60 + n.minute
    return n.weekday() < 5 and 9 * 60 <= m <= 13 * 60 + 30


# ---------------- 台股清單 ----------------
STOCK_RE = re.compile(r"^(\d{4}|00\d{2,4}[A-Z]?)$")  # 一般股票(4碼)與 ETF，排除權證等


def _load_list():
    out = {}
    try:
        for r in fetch_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", 20):
            if STOCK_RE.match(r["Code"]):
                out[r["Code"]] = {"code": r["Code"], "name": r["Name"], "mkt": "tse"}
    except Exception as e:
        print("TWSE list error:", e, file=sys.stderr)
    try:
        for r in fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", 20):
            c = r.get("SecuritiesCompanyCode")
            if c and c not in out and STOCK_RE.match(c):
                out[c] = {"code": c, "name": r.get("CompanyName", c), "mkt": "otc"}
    except Exception as e:
        print("TPEx list error:", e, file=sys.stderr)
    return out


def stock_list():
    lst = cached("list", 6 * 3600, _load_list)
    if not lst:  # 抓失敗不要快取空清單太久
        with _cache_lock:
            _cache.pop("list", None)
    return lst


def market_of(code):
    s = stock_list().get(code)
    return s["mkt"] if s else None


def yahoo_symbol(code):
    """內部代碼 -> Yahoo 代碼。台股: 2330 / 美股: US.AAPL / 指數: US.^DJI / 匯率: FX.USDTWD"""
    if code == "t00":
        return "^TWII"
    if code.startswith("US."):
        return code[3:]
    if code.startswith("FX."):
        return code[3:] + "=X"
    if code.startswith("Y.") or code.startswith("G."):  # G. = 其他股市個股（日韓港陸歐…），後面直接是 Yahoo 代碼
        return code[2:]
    if code.startswith("OPT.US:"):
        return code[7:]
    return f"{code}.TWO" if market_of(code) == "otc" else f"{code}.TW"


# ---------------- 台股即時報價 (MIS) ----------------
def _levels(s):
    return [_num(x) for x in (s or "").split("_") if x != ""]


def parse_mis(m):
    asks, bids = _levels(m.get("a")), _levels(m.get("b"))
    askv, bidv = _levels(m.get("f")), _levels(m.get("g"))
    # 價格 0 是「市價」委託、"-" 是沒有掛單，五檔裡都不算
    ab = [(p, v) for p, v in zip(asks, askv) if p]
    bb = [(p, v) for p, v in zip(bids, bidv) if p]
    up, dn = _num(m.get("u")), _num(m.get("w"))
    last = _num(m.get("z"))
    if last is None:  # 這幾秒沒有成交（跌停/漲停鎖住時 z 也會是 "-"）
        last = _num((m.get("trade") or {}).get("z")) or _num(m.get("pz"))
    if last is None:
        if not bb and dn and (0.0 in asks[:1] or (ab and ab[0][0] == dn)):
            last = dn  # 跌停鎖死：只剩賣單（市價賣）
        elif not ab and up and (0.0 in bids[:1] or (bb and bb[0][0] == up)):
            last = up  # 漲停鎖死
        else:
            last = (bb[0][0] if bb else None) or (ab[0][0] if ab else None) or _num(m.get("y"))
    asks, askv = [p for p, _ in ab], [v for _, v in ab]
    bids, bidv = [p for p, _ in bb], [v for _, v in bb]
    tl = _num(m.get("tlong"))
    return {
        "code": m.get("c"), "name": m.get("n"), "fullName": m.get("nf"), "mkt": m.get("ex"),
        "price": last, "prev": _num(m.get("y")), "open": _num(m.get("o")),
        "high": _num(m.get("h")), "low": _num(m.get("l")),
        "limitUp": _num(m.get("u")), "limitDown": _num(m.get("w")),
        "volume": _num(m.get("v")),  # 張 (指數為成交金額百萬)
        "amount": _num(m.get("m")),
        "time": m.get("t") or m.get("%"), "date": m.get("d"),
        "ts": int(tl / 1000) if tl else None,
        "asks": [{"p": p, "v": v} for p, v in zip(asks, askv)],
        "bids": [{"p": p, "v": v} for p, v in zip(bids, bidv)],
        "currency": "TWD", "isOpen": tw_open(),
    }


_mis_lock = threading.Lock()
_mis_last = [0.0]


def mis_batch(chans):
    """證交所 MIS：請求排隊（不同時發送、間隔至少 0.3 秒），失敗先重試一次。"""
    with _mis_lock:
        for attempt in (0, 1):
            wait = 0.3 - (time.time() - _mis_last[0])
            if wait > 0:
                time.sleep(wait)
            _mis_last[0] = time.time()
            try:
                return _mis_fetch(chans)
            except Exception:
                if attempt:
                    raise
                time.sleep(0.8)


def _mis_fetch(chans):
    url = ("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch="
           + urllib.parse.quote("|".join(chans), safe="|_.") + f"&_={int(time.time()*1000)}")
    data = fetch_json(url, 15)
    return [parse_mis(m) for m in data.get("msgArray", [])]


_mis_down_until = 0.0
_mis_fails = [0]


def tw_quotes(codes):
    global _mis_down_until
    chans = []
    for c in codes:
        if c == "t00":
            chans.append("tse_t00.tw")
        elif c == "o00":
            chans.append("otc_o00.tw")
        else:
            mk = market_of(c)
            chans += [f"{mk}_{c}.tw"] if mk else [f"tse_{c}.tw", f"otc_{c}.tw"]
    out = {}
    if time.time() > _mis_down_until:
        parts = [chans[i:i + 80] for i in range(0, len(chans), 80)]
        failed = False
        for res in POOL.map(lambda p: _safe(mis_batch, p, None), parts):
            if res is None:
                failed = True
                continue
            for q in res:
                out[q["code"]] = q
        if failed:  # 連續失敗 3 次才暫停 30 秒（期間改用 Yahoo，Yahoo 台股約延遲 20 分鐘）
            _mis_fails[0] += 1
            if _mis_fails[0] >= 3:
                _mis_down_until = time.time() + 30
                _mis_fails[0] = 0
                print("MIS 連續失敗，暫停 30 秒改用 Yahoo 備援", file=sys.stderr)
        else:
            _mis_fails[0] = 0
    missing = [c for c in codes if c not in out and c != "o00"]
    for q in POOL.map(lambda c: _safe(yahoo_quote, c, None), missing):
        if q:
            info = stock_list().get(q["code"]) or {}
            q.update(mkt=info.get("mkt", "tse"), name=info.get("name", q["name"]), isOpen=tw_open(), source="yahoo")
            out[q["code"]] = q
    return out


def _safe(fn, arg, default):
    try:
        return fn(arg)
    except Exception as e:
        print(f"{fn.__name__} error:", e, file=sys.stderr)
        return default


# ---------------- Yahoo 報價 (美股/指數/匯率) ----------------
def _fmt_local(ts, off):
    return datetime.fromtimestamp(ts + off, timezone.utc).strftime("%H:%M:%S") if ts else None


def yahoo_quote(code):
    sym = yahoo_symbol(code)

    def load():
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}"
               "?interval=1m&range=1d&includePrePost=true")
        d = fetch_json(url)["chart"]["result"][0]
        m = d["meta"]
        off = m.get("gmtoffset", 0)
        reg = (m.get("currentTradingPeriod") or {}).get("regular") or {}
        now = time.time()
        ts = d.get("timestamp") or []
        q = d["indicators"]["quote"][0]
        opn, ext = None, None
        for i, t in enumerate(ts):
            if reg and t >= reg.get("start", 0) and q["open"][i] is not None:
                opn = q["open"][i]
                break
        # 盤前/盤後價：最後一筆不在正規時段內才算。今天盤前開始之前的價格是上一個交易日的盤後價
        pre_p = (m.get("currentTradingPeriod") or {}).get("pre") or {}
        for i in range(len(ts) - 1, -1, -1):
            if q["close"][i] is not None:
                t = ts[i]
                if reg and code.startswith("US.") and (t >= reg.get("end", 1e18) or t < reg.get("start", 0)):  # 只有美股有盤前盤後
                    is_pre = pre_p.get("start", 0) <= t < reg.get("start", 0)
                    ext = {"price": q["close"][i], "label": "盤前" if is_pre else "盤後", "time": _fmt_local(t, off), "ts": t}
                break
        rt = m.get("regularMarketTime")
        ctp = m.get("currentTradingPeriod") or {}
        pre, post = ctp.get("pre") or {}, ctp.get("post") or {}
        sess = "CLOSED"
        if reg and reg.get("start", 0) <= now < reg.get("end", 0):
            sess = "REGULAR"
        elif pre and pre.get("start", 0) <= now < pre.get("end", 0):
            sess = "PRE"
        elif post and post.get("start", 0) <= now < post.get("end", 0):
            sess = "POST"
        elif code.startswith("US."):
            lt = datetime.fromtimestamp(now + off, timezone.utc)  # 交易所當地時間
            wd, hr = lt.weekday(), lt.hour  # Mon=0 ... Sun=6
            if (hr >= 20 and wd in (6, 0, 1, 2, 3)) or (hr < 4 and wd in (0, 1, 2, 3, 4)):
                sess = "OVERNIGHT"
        trade_px = ext["price"] if (sess in ("PRE", "POST") and ext) else m.get("regularMarketPrice")
        return {
            "code": code, "symbol": sym, "name": m.get("shortName") or m.get("longName") or sym,
            "fullName": m.get("longName"), "mkt": "us" if code.startswith("US.") else "gl" if code.startswith("G.") else "fx",
            "price": m.get("regularMarketPrice"), "prev": m.get("chartPreviousClose") or m.get("previousClose"),
            "open": opn, "high": m.get("regularMarketDayHigh"), "low": m.get("regularMarketDayLow"),
            "volume": m.get("regularMarketVolume"), "w52h": m.get("fiftyTwoWeekHigh"), "w52l": m.get("fiftyTwoWeekLow"),
            "ts": rt, "time": _fmt_local(rt, off),
            "date": datetime.fromtimestamp((rt or 0) + off, timezone.utc).strftime("%Y%m%d") if rt else None,
            "tz": m.get("exchangeTimezoneName"), "exchange": m.get("fullExchangeName"),
            "asks": [], "bids": [], "currency": m.get("currency"),
            "isOpen": bool(reg) and reg.get("start", 0) <= now <= reg.get("end", 0),
            "ext": ext, "session": sess, "tradable": sess in ("REGULAR", "PRE", "POST"), "tradePrice": trade_px,
            "preStart": pre.get("start"), "postEnd": post.get("end"),
        }
    return cached("yq:" + sym, 1.5, load)


def taifex_open(now=None):
    n = now or datetime.now(TW)
    m = n.hour * 60 + n.minute
    return n.weekday() < 5 and 8 * 60 + 45 <= m <= 13 * 60 + 45


US_OPT_RE = re.compile(r"^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$")


def opt_quote(code):
    if code.startswith("OPT.TW:"):
        sid = code[7:]
        rows = cached("txo", 8, lambda: taifex_post(_tf_body("O", "TXO")))
        r = next((x for x in rows if x["SymbolID"] == sid), None)
        if not r:
            return None
        q = _tfq(r)
        m = OPT_RE.match(sid)
        strike = int(m.group(2)) if m else ""
        cp = "買權" if m and m.group(3) <= "L" else "賣權"
        last = q["last"] or None
        op = taifex_open()
        return {"code": code, "name": f"台指選 {q['ename'] or ''} {strike} {cp}", "mkt": "opt", "price": last or q["ref"],
                "prev": q["ref"], "bid": q["bid"] or None, "ask": q["ask"] or None, "high": q["high"], "low": q["low"],
                "volume": q["vol"], "isOpen": op, "tradable": op, "mult": 50, "currency": "TWD", "asks": [], "bids": [],
                "time": q["time"], "date": q["date"]}
    if code.startswith("OPT.US:"):
        sym = code[7:]
        d = cached("oq:" + sym, 10, lambda: yahoo_auth_json(
            "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + urllib.parse.quote(sym)))
        res = (d.get("quoteResponse") or {}).get("result") or []
        if not res:
            return None
        r = res[0]
        m = US_OPT_RE.match(sym)
        name = f"{m.group(1)} 20{m.group(2)}/{m.group(3)}/{m.group(4)} {int(m.group(6)) / 1000:g} {'Call' if m.group(5) == 'C' else 'Put'}" if m else sym
        und = r.get("underlyingSymbol") or (m.group(1) if m else None)
        uq = _safe(yahoo_quote, "US." + und, None) if und else None
        op = bool(uq and uq.get("session") == "REGULAR")  # 選擇權的 marketState 不可靠，改看標的股；只在正規時段交易
        return {"code": code, "name": name, "mkt": "opt", "price": r.get("regularMarketPrice"), "prev": r.get("regularMarketPreviousClose"),
                "bid": r.get("bid") or None, "ask": r.get("ask") or None, "high": r.get("regularMarketDayHigh"), "low": r.get("regularMarketDayLow"),
                "volume": r.get("regularMarketVolume"), "isOpen": op, "tradable": op, "mult": 100, "currency": "USD", "asks": [], "bids": []}
    return None


def quotes(codes):
    opts = [c for c in codes if c.startswith("OPT.")]
    codes = [c for c in codes if not c.startswith("OPT.")]
    tw = [c for c in codes if is_tw(c)]
    other = [c for c in codes if not is_tw(c)]
    out = tw_quotes(tw) if tw else {}
    for q in POOL.map(lambda c: _safe(opt_quote, c, None), opts):
        if q:
            out[q["code"]] = q
    for q in POOL.map(lambda c: _safe(yahoo_quote, c, None), other):
        if q:
            out[q["code"]] = q
    night = [c for c, q in out.items() if q.get("session") == "OVERNIGHT" and c.startswith("US.") and "^" not in c]
    if night and alpaca_on():
        lt = alpaca_latest(night)
        for c, x in lt.items():
            q = out[c] = dict(out[c])  # 快取裡的物件不要直接改
            if x["ts"] > (q.get("ts") or 0) and (not q.get("ext") or x["ts"] >= q["ext"].get("ts", 0)):
                q["ext"] = {"price": x["price"], "label": "夜盤", "time": _fmt_local(x["ts"], -5 * 3600 if not _us_dst_now() else -4 * 3600), "ts": x["ts"], "night": True}
    return out


def _us_dst_now():
    return _us_dst(datetime.now(timezone.utc).replace(tzinfo=None))


# ---------------- K 線 (Yahoo) ----------------
def kline(code, interval, rng, ext=False):
    sym = yahoo_symbol(code)
    pre = "true" if (code.startswith("US.") and interval.endswith("m") and rng in ("1d", "5d")) else "false"
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}"
           f"?interval={interval}&range={rng}&includePrePost={pre}")
    ttl = 10 if interval.endswith("m") else 120

    def load():
        d = fetch_json(url)["chart"]["result"][0]
        ts = d.get("timestamp") or []
        q = d["indicators"]["quote"][0]
        meta = d.get("meta", {})
        reg = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
        bars = []
        for i, t in enumerate(ts):
            o, h, l, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
            if None in (o, h, l, c):
                continue
            bars.append({"t": t, "o": round(o, 4), "h": round(h, 4), "l": round(l, 4), "c": round(c, 4), "v": v or 0})
        bars = sorted({b["t"]: b for b in bars}.values(), key=lambda b: b["t"])  # Yahoo 偶爾在時段交界回傳重複或亂序的時間
        ctp = meta.get("currentTradingPeriod") or {}
        tps = meta.get("tradingPeriods") or {}
        if (is_tw(code) or code == "t00") and interval.endswith("m"):
            bars = merge_tw_today(code, interval, bars)  # 當天部分改用即時資料
        if pre == "true" and not ext:  # 只留正規交易時段（多日時用每日的 regular 區間）
            regs = [p for day in (tps.get("regular") or []) for p in day] if isinstance(tps, dict) else []
            if regs:
                bars = [b for b in bars if any(p["start"] <= b["t"] < p["end"] for p in regs)] or bars
            elif reg:
                bars = [b for b in bars if reg["start"] <= b["t"] < reg["end"]] or bars
        post = ctp.get("post") or {}
        prep = ctp.get("pre") or {}
        regs_all = [[p["start"], p["end"]] for day in (tps.get("regular") or []) for p in day] if isinstance(tps, dict) else []
        return {"symbol": sym, "bars": bars, "prev": meta.get("chartPreviousClose"),
                "gmtoffset": meta.get("gmtoffset", 0), "sessionStart": reg.get("start"), "sessionEnd": reg.get("end"),
                "preStart": prep.get("start"), "postEnd": post.get("end"), "ext": bool(ext and pre == "true"),
                "regular": regs_all}
    return cached(f"k:{sym}:{interval}:{rng}:{ext}", ttl, load)


def tw_intraday(code):
    """Yahoo 奇摩股市的當日 1 分鐘走勢（即時；國際版 Yahoo 台股約延遲 20 分鐘）。"""
    sym = yahoo_symbol(code)
    url = ("https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols="
           + urllib.parse.quote(json.dumps([sym]), safe="") + ";type=tick")

    def load():
        c = fetch_json(url)[0]["chart"]
        q = c["indicators"]["quote"][0]
        mul = 1 if code == "t00" else 1000  # 個股成交量單位是張 -> 換成股，和國際版一致
        out = []
        for i, t in enumerate(c.get("timestamp") or []):
            o, h, l, cl, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
            if None in (o, h, l, cl):
                continue
            if (t + 8 * 3600) % 86400 != 9 * 3600:
                t -= 60  # 奇摩以分鐘「結束」時間標記，改成「開始」時間（09:00 開盤競價那筆除外）
            out.append({"t": t, "o": o, "h": h, "l": l, "c": cl, "v": (v or 0) * mul})
        return out
    return cached("twi:" + sym, 5, load)


STEP = {"1m": 60, "2m": 120, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600, "90m": 5400}


def merge_tw_today(code, interval, bars):
    tb = _safe(tw_intraday, code, [])
    if not tb or interval not in STEP:
        return bars
    step, start = STEP[interval], tb[0]["t"]
    anchor = start - (start + 8 * 3600) % 86400 + 9 * 3600  # 當天 09:00（UTC 秒）
    agg, cur, key = [], None, None
    for b in tb:
        k = anchor + (b["t"] - anchor) // step * step
        if k != key:
            cur = dict(b, t=k)
            agg.append(cur)
            key = k
        else:
            cur["h"] = max(cur["h"], b["h"]); cur["l"] = min(cur["l"], b["l"]); cur["c"] = b["c"]; cur["v"] += b["v"]
    cut = agg[0]["t"]  # 即時資料沒涵蓋的較早部分，保留國際版的K棒
    return [b for b in bars if b["t"] < cut] + agg


def sparks(codes):
    syms = {yahoo_symbol(c): c for c in codes}
    out = {}
    keys = list(syms)

    def one(part):
        url = ("https://query1.finance.yahoo.com/v8/finance/spark?range=1d&interval=5m&symbols="
               + urllib.parse.quote(",".join(part), safe=",.^="))
        return cached("spark:" + ",".join(part), 60, lambda: fetch_json(url))
    tw = [s for s in keys if is_tw(syms[s])]
    us = [s for s in keys if not is_tw(syms[s])]
    for d in POOL.map(lambda p: _safe(one, p, {}), [us[i:i + 20] for i in range(0, len(us), 20)]):
        for s, v in d.items():
            pts = [(t, c) for t, c in zip(v.get("timestamp") or [], v.get("close") or []) if c is not None]
            out[syms.get(s, s)] = {"t": [p[0] for p in pts], "c": [p[1] for p in pts], "prev": v.get("chartPreviousClose"),
                                   "start": v.get("start"), "end": v.get("end")}
    # 台股改用奇摩即時 1 分鐘走勢（國際版 5 分 K 延遲又常缺資料），一次可查多檔，取每 3 分鐘一點
    for part in POOL.map(lambda p: _safe(tw_spark_batch, p, {}), [tw[i:i + 20] for i in range(0, len(tw), 20)]):
        for s, v in part.items():
            out[syms.get(s, s)] = v
    return out


def tw_spark_batch(syms):
    url = ("https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols="
           + urllib.parse.quote(json.dumps(syms), safe="") + ";type=tick")

    def load():
        res = {}
        for item in fetch_json(url):
            c = item.get("chart") or {}
            m = c.get("meta") or {}
            ts, cl = c.get("timestamp") or [], ((c.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
            pts = [(t, v) for t, v in zip(ts, cl) if v is not None]
            if not pts:
                continue
            day0 = pts[0][0] - (pts[0][0] + 8 * 3600) % 86400  # 當天 00:00（台北）
            pts = pts[::3] + ([pts[-1]] if (len(pts) - 1) % 3 else [])
            res[m.get("symbol")] = {"t": [p[0] for p in pts], "c": [p[1] for p in pts], "prev": m.get("chartPreviousClose") or m.get("previousClose"),
                                    "start": day0 + 9 * 3600, "end": day0 + 13 * 3600 + 1800}
        return res
    return cached("twspark:" + ",".join(syms), 60, load)


# ---------------- 搜尋（美股＋其他股市） ----------------
US_EX = {"NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS", "NAS", "NYS", "CBO"}
_CJK_Q = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


def _zh_search(q):
    """中文名稱查詢：Yahoo 搜尋不吃中文（會回 400），改查本機的中文名稱表"""
    ql = q.lower()
    hits = [(c, n) for c, n in ZH_NAMES.items() if ql in n.lower() and (c.startswith("US.") or c.startswith("G."))]
    hits.sort(key=lambda x: (not x[1].lower().startswith(ql), len(x[1])))
    return [{"code": c, "name": n, "mkt": "us" if c.startswith("US.") else "gl", "ex": "美股" if c.startswith("US.") else region_of(c)} for c, n in hits[:12]]


REGION = {"KS": "韓股", "KQ": "韓股", "T": "日股", "HK": "港股", "SS": "陸股", "SZ": "陸股", "L": "英股", "DE": "德股", "F": "德股",
          "PA": "法股", "AS": "荷股", "SW": "瑞士", "MI": "義股", "MC": "西股", "ST": "瑞典", "CO": "丹麥", "OL": "挪威", "HE": "芬蘭",
          "BR": "比股", "TO": "加股", "V": "加股", "AX": "澳股", "NZ": "紐股", "SI": "星股", "NS": "印股", "BO": "印股", "KL": "馬股",
          "BK": "泰股", "JK": "印尼", "SA": "巴西", "MX": "墨股"}


def region_of(code):
    suf = code.rsplit(".", 1)[-1] if code.count(".") >= 2 else ""
    return REGION.get(suf, "國際")


_SECONDARY = {"F", "BE", "DU", "MU", "SG", "HM", "IL", "VI", "MX", "BA", "SN", "NE", "CN"}  # 法蘭克福等地的重複掛牌，結果太雜


def us_search(q):
    q = q.strip()
    if not q:
        return []
    if _CJK_Q.search(q):
        return _zh_search(q)
    url = ("https://query1.finance.yahoo.com/v1/finance/search?quotesCount=15&newsCount=0&q="
           + urllib.parse.quote(q))
    try:
        d = cached("search:" + q.lower(), 300, lambda: fetch_json(url, timeout=6))
    except Exception:
        d = {}
    if not d.get("quotes"):  # Yahoo 偶爾回空結果（限流），不要快取 5 分鐘
        with _cache_lock:
            _cache.pop("search:" + q.lower(), None)
    out = []
    for r in d.get("quotes", []):
        sym, qt = r.get("symbol") or "", r.get("quoteType")
        if qt not in ("EQUITY", "ETF") or not sym:
            continue
        name = r.get("shortname") or r.get("longname") or sym
        if r.get("exchange") in US_EX and "." not in sym.replace("BRK.", "").replace("BF.", ""):
            out.append({"code": "US." + sym, "name": name, "mkt": "us", "ex": r.get("exchDisp")})
        elif sym.endswith(".TW") or sym.endswith(".TWO"):
            out.append({"code": sym.split(".")[0], "name": name, "mkt": "otc" if sym.endswith(".TWO") else "tse"})
        elif "." in sym and sym.rsplit(".", 1)[1] not in _SECONDARY:
            code = "G." + sym
            out.append({"code": code, "name": zh_name(code, name), "mkt": "gl", "ex": region_of(code)})
    return out


# ---------------- 排行 ----------------
def _rank_rows(rows, n=50):
    rows = [r for r in rows if r["price"] and r["prev"]]
    for r in rows:
        r["chg"] = r["price"] - r["prev"]
        r["pct"] = r["chg"] / r["prev"] * 100
    return {
        "gainers": sorted(rows, key=lambda r: -r["pct"])[:n],
        "losers": sorted(rows, key=lambda r: r["pct"])[:n],
        "volume": sorted(rows, key=lambda r: -(r["volume"] or 0))[:n],
        "value": sorted(rows, key=lambda r: -(r["value"] or 0))[:n],
    }


TW_SORT = {"gainers": "-changePercent", "losers": "changePercent", "volume": "-volume", "value": "-turnoverK"}


def tw_rank(include_etf=True):
    """Yahoo 奇摩股市排行 API（上市 TAI + 上櫃 TWO 各取前 100 再合併排序）。"""
    def one(args):
        ex, sort = args
        url = (f"https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.rank;exchange={ex};"
               f"limit=100;offset=0;period=1D;sortBy={sort}")
        out = []
        for r in fetch_json(url).get("list", []):
            code = r["symbol"].split(".")[0]
            out.append({"code": code, "name": r.get("name") or r.get("symbolName"), "mkt": "otc" if ex == "TWO" else "tse",
                        "price": _num(r.get("price")), "prev": _num(r.get("previousClose")),
                        "volume": (_num(r.get("volume")) or 0) / 1000, "value": (_num(r.get("turnoverK")) or 0) * 1000,
                        "limitUp": r.get("limitUp"), "limitDown": r.get("limitDown")})
        return out

    def load():
        res = {}
        for key, sort in TW_SORT.items():
            rows = []
            for part in POOL.map(lambda a: _safe(one, a, []), [("TAI", sort), ("TWO", sort)]):
                rows += part
            res[key] = rows
        return {"lists": res, "updated": int(time.time())}
    snap = cached("twrank", 60 if tw_open() else 600, load)
    out = {"updated": snap["updated"]}
    for key, rows in snap["lists"].items():
        rows = [dict(r) for r in rows if include_etf or not r["code"].startswith("0")]
        out[key] = _rank_rows(rows, 100)[key]
    return out


def us_rank():
    def scr(sid):
        url = f"https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds={sid}&count=50"
        r = fetch_json(url)["finance"]["result"][0]["quotes"]
        return [{"code": "US." + q["symbol"], "name": q.get("shortName") or q["symbol"], "mkt": "us",
                 "price": q.get("regularMarketPrice"), "prev": q.get("regularMarketPreviousClose"),
                 "volume": q.get("regularMarketVolume"),
                 "value": (q.get("regularMarketPrice") or 0) * (q.get("regularMarketVolume") or 0)} for q in r]

    def load():
        g, l, a = POOL.map(lambda s: _safe(scr, s, []), ["day_gainers", "day_losers", "most_actives"])
        res = _rank_rows(g + l + a)
        res["gainers"] = _rank_rows(g)["gainers"]
        res["losers"] = _rank_rows(l)["losers"]
        res["volume"] = _rank_rows(a)["volume"]
        res["value"] = _rank_rows(a)["value"]
        res["updated"] = int(time.time())
        return res
    return cached("usrank", 60, load)


# ---------------- 三大法人 (T86, 上市) ----------------
def _t86(date_str):
    def load():
        url = f"https://www.twse.com.tw/rwd/zh/fund/T86?date={date_str}&selectType=ALLBUT0999&response=json"
        d = fetch_json(url, 20)
        if d.get("stat") != "OK":
            return None
        rows = {}

        def n(x):
            try:
                return int(str(x).replace(",", ""))
            except ValueError:
                return 0
        for r in d.get("data", []):
            rows[r[0].strip()] = {"foreign": n(r[4]) + n(r[7]), "trust": n(r[10]), "dealer": n(r[11]), "total": n(r[-1])}
        return rows
    today = datetime.now(TW).strftime("%Y%m%d")
    return cached(f"t86:{date_str}", 600 if date_str == today else 86400 * 7, load)


def institutional(code, days=10):
    if market_of(code) != "tse":
        return {"supported": False, "rows": []}
    rows, d, tries = [], datetime.now(TW), 0
    while len(rows) < days and tries < days * 2 + 6:
        tries += 1
        if d.weekday() < 5:
            ds = d.strftime("%Y%m%d")
            fresh = f"t86:{ds}" not in _cache
            try:
                t = _t86(ds)
            except Exception as e:
                print("T86 error:", ds, e, file=sys.stderr)
                t = None
            if t and code in t:
                rows.append({"date": ds, **{k: int(v / 1000) for k, v in t[code].items()}})  # 換算成張
            if fresh:
                time.sleep(0.35)  # 避免證交所擋流量
        d -= timedelta(days=1)
    return {"supported": True, "rows": rows}


# ---------------- 模擬倉 ----------------
_paper_lock = threading.RLock()
DEFAULT_CASH = {"TWD": 10_000_000.0, "USD": 30_000.0}


def paper_new(cash=None):
    cash = cash or DEFAULT_CASH
    return {"cash": dict(cash), "initial": dict(cash), "positions": {}, "orders": [],
            "realized": {"TWD": 0.0, "USD": 0.0}, "created": int(time.time())}


def _paper_file(acct="me"):
    return PAPER_AI_FILE if acct == "ai" else PAPER_FILE


def paper_load(acct="me"):
    try:
        with open(_paper_file(acct), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return paper_new()


def paper_save(acc, acct="me"):
    path = _paper_file(acct)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(acc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def ccy_of(code):
    return "TWD" if (is_tw(code) or code.startswith("OPT.TW:")) else "USD"


def mult_of(code):
    return 50 if code.startswith("OPT.TW:") else 100 if code.startswith("OPT.US:") else 1


qty_of_amount_ctx = {}  # 選擇權手續費按口數計，透過這裡傳口數


def fees(code, side, amount):
    """台股: 手續費 0.1425% (最低 20 元)、賣出證交稅 0.3% (ETF 0.1%)。美股: 先以零手續費計。
    台指選: 每口 25 元 + 期交稅 0.1%（權利金）。美股選擇權: 每口 0.65 美元。amount 為權利金總額。"""
    if code.startswith("OPT.TW:"):
        return float(25 * qty_of_amount_ctx.get("qty", 1)), float(round(amount * 0.001))
    if code.startswith("OPT.US:"):
        return round(0.65 * qty_of_amount_ctx.get("qty", 1), 2), 0.0
    if is_tw(code):
        fee = max(20.0, round(amount * 0.001425))
        tax = round(amount * (0.001 if code.startswith("0") else 0.003)) if side == "sell" else 0.0
        return float(fee), float(tax)
    return 0.0, 0.0


def _fill(acc, o, price):
    code, qty, side, ccy = o["code"], o["qty"], o["side"], o["ccy"]
    mult = mult_of(code)
    amount = price * qty * mult
    qty_of_amount_ctx["qty"] = qty
    fee, tax = fees(code, side, amount)
    pos = acc["positions"].get(code)
    if side == "buy":
        need = amount + fee + tax  # 台股買進 tax=0；台指選買進也要期交稅
        if acc["cash"][ccy] + 1e-9 < need:
            o.update(status="rejected", reason="現金不足", doneAt=int(time.time()))
            return
        acc["cash"][ccy] -= need
        if not pos:
            pos = acc["positions"][code] = {"code": code, "name": o["name"], "qty": 0, "cost": 0.0, "ccy": ccy, "mult": mult}
        pos["qty"] += qty
        pos["cost"] += need
    else:
        if not pos or pos["qty"] < qty:
            o.update(status="rejected", reason="庫存不足", doneAt=int(time.time()))
            return
        avg = pos["cost"] / pos["qty"]
        pnl = amount - fee - tax - avg * qty
        acc["cash"][ccy] += amount - fee - tax
        acc["realized"][ccy] = acc["realized"].get(ccy, 0) + pnl
        pos["qty"] -= qty
        pos["cost"] -= avg * qty
        o["pnl"] = round(pnl, 2)
        if pos["qty"] == 0:
            del acc["positions"][code]
    o.update(status="filled", fillPrice=price, fee=fee, tax=tax, doneAt=int(time.time()))


def paper_order(body, acct="me"):
    code = str(body.get("code", "")).strip()
    side = body.get("side")
    otype = body.get("type", "market")
    qty = int(body.get("qty") or 0)
    limit = _num(body.get("price"))
    if side not in ("buy", "sell") or qty <= 0 or not code:
        return {"ok": False, "msg": "委託內容不正確"}
    if otype == "limit" and not limit:
        return {"ok": False, "msg": "限價單要填價格"}
    q = quotes([code]).get(code)
    if not q or not q.get("price"):
        return {"ok": False, "msg": "抓不到這檔的報價"}
    o = {"id": uuid.uuid4().hex[:10], "code": code, "name": q.get("name") or code, "side": side, "type": otype,
         "qty": qty, "limit": limit, "ccy": ccy_of(code), "status": "pending", "created": int(time.time())}
    if body.get("note"):
        o["note"] = str(body["note"])[:300]
    with _paper_lock:
        acc = paper_load(acct)
        is_opt = code.startswith("OPT.")
        if is_opt:  # 選擇權：買用賣價、賣用買價成交
            price = (q.get("ask") if side == "buy" else q.get("bid")) or q["price"]
        else:
            price = q.get("tradePrice") or q["price"]
        can_trade = q.get("tradable", q.get("isOpen"))
        if side == "buy":
            est = (limit if otype == "limit" else price) * qty * mult_of(code)
            qty_of_amount_ctx["qty"] = qty
            if acc["cash"][o["ccy"]] < est + fees(code, "buy", est)[0]:
                return {"ok": False, "msg": "現金不足"}
        else:
            pos = acc["positions"].get(code)
            reserved = sum(x["qty"] for x in acc["orders"] if x["status"] == "pending" and x["code"] == code and x["side"] == "sell")
            if not pos or pos["qty"] - reserved < qty:
                return {"ok": False, "msg": "可賣庫存不足"}
        if otype == "market":
            if not q.get("isOpen"):
                msg = "盤前/盤後只接受限價單" if q.get("tradable") else "目前不是交易時段，市價單無法成交；請改用限價單（開盤後自動撮合）"
                return {"ok": False, "msg": msg}
            _fill(acc, o, price)
        elif can_trade and ((side == "buy" and price <= limit) or (side == "sell" and price >= limit)):
            _fill(acc, o, price)  # 美股盤前/盤後時段限價單也可成交（用延長時段價格）
        acc["orders"].insert(0, o)
        acc["orders"] = acc["orders"][:500]
        paper_save(acc, acct)
    msg = {"filled": f"成交 @ {o.get('fillPrice')}", "pending": "已委託，等待成交", "rejected": o.get("reason", "")}[o["status"]]
    return {"ok": o["status"] != "rejected", "msg": msg, "order": o}


def paper_cancel(oid, acct="me"):
    with _paper_lock:
        acc = paper_load(acct)
        for o in acc["orders"]:
            if o["id"] == oid and o["status"] == "pending":
                o.update(status="cancelled", doneAt=int(time.time()))
                paper_save(acc, acct)
                return {"ok": True, "msg": "已取消"}
    return {"ok": False, "msg": "找不到可取消的委託"}


def paper_matcher():
    """背景撮合限價單：每 5 秒檢查一次。"""
    while True:
        time.sleep(5)
        for acct in ("me", "ai"):
            _match_once(acct)


def _match_once(acct):
    if True:
        try:
            with _paper_lock:
                acc = paper_load(acct)
                pend = [o for o in acc["orders"] if o["status"] == "pending"]
            if not pend:
                return
            qs = quotes(list({o["code"] for o in pend}))
            changed = False
            with _paper_lock:
                acc = paper_load(acct)
                for o in acc["orders"]:
                    if o["status"] != "pending":
                        continue
                    q = qs.get(o["code"])
                    if not q or not q.get("tradable", q.get("isOpen")) or not q.get("price"):
                        continue
                    if o["code"].startswith("OPT."):
                        p = (q.get("ask") if o["side"] == "buy" else q.get("bid"))
                        if not p:
                            continue
                    else:
                        p = q.get("tradePrice") or q["price"]
                    if (o["side"] == "buy" and p <= o["limit"]) or (o["side"] == "sell" and p >= o["limit"]):
                        _fill(acc, o, p)
                        changed = True
                if changed:
                    paper_save(acc, acct)
        except Exception as e:
            print("matcher error:", e, file=sys.stderr)



# ---------------- Yahoo crumb (美股選擇權需要) ----------------
_yjar = http.cookiejar.CookieJar()
_yopener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_yjar), urllib.request.HTTPSHandler(context=SSL_CTX))
_ycrumb = {"v": None, "t": 0}


def yahoo_crumb(force=False):
    if force or not _ycrumb["v"] or time.time() - _ycrumb["t"] > 3600:
        try:
            _yopener.open(urllib.request.Request("https://fc.yahoo.com", headers={"User-Agent": UA}), timeout=10)
        except Exception:
            pass  # fc.yahoo.com 回 404 但會設定 cookie
        r = _yopener.open(urllib.request.Request("https://query1.finance.yahoo.com/v1/test/getcrumb", headers={"User-Agent": UA}), timeout=10)
        _ycrumb.update(v=r.read().decode().strip(), t=time.time())
    return _ycrumb["v"]


def yahoo_auth_json(url):
    for attempt in (0, 1):
        crumb = yahoo_crumb(force=attempt == 1)
        sep = "&" if "?" in url else "?"
        try:
            r = _yopener.open(urllib.request.Request(f"{url}{sep}crumb={urllib.parse.quote(crumb)}", headers={"User-Agent": UA}), timeout=15)
            return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code != 401 or attempt:
                raise


# ---------------- 選擇權 ----------------
def us_options(code, date=None):
    sym = yahoo_symbol(code)
    url = f"https://query1.finance.yahoo.com/v7/finance/options/{urllib.parse.quote(sym)}" + (f"?date={date}" if date else "")
    d = cached(f"opt:{sym}:{date}", 20, lambda: yahoo_auth_json(url))["optionChain"]["result"][0]
    o = (d.get("options") or [{}])[0]
    q = d.get("quote", {})

    def m(x):
        return {"id": x.get("contractSymbol"), "strike": x.get("strike"), "last": x.get("lastPrice"), "chg": x.get("change"), "pct": x.get("percentChange"),
                "bid": x.get("bid"), "ask": x.get("ask"), "vol": x.get("volume"), "oi": x.get("openInterest"),
                "iv": x.get("impliedVolatility"), "itm": x.get("inTheMoney")}
    strikes = {}
    for side in ("calls", "puts"):
        for x in o.get(side, []):
            strikes.setdefault(x["strike"], {"strike": x["strike"]})[side[:-1]] = m(x)
    return {"underlying": code, "name": q.get("shortName") or sym, "spot": q.get("regularMarketPrice"),
            "expiries": [{"id": str(t), "label": datetime.fromtimestamp(t, timezone.utc).strftime("%Y/%m/%d")} for t in d.get("expirationDates", [])],
            "expiry": str(o.get("expirationDate") or ""), "rows": sorted(strikes.values(), key=lambda r: r["strike"]), "currency": "USD"}


def taifex_post(body):
    url = "https://mis.taifex.com.tw/futures/api/getQuoteList"
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))["RtData"]["QuoteList"]


def _tf_body(stype, cid, month=""):
    return {"MarketType": "0", "SymbolType": stype, "KindID": "1", "CID": cid, "ExpireMonth": month,
            "RowSize": "全部", "PageNo": "", "SortColumn": "", "AscDesc": "A"}


def _tfq(r):
    return {"id": r["SymbolID"], "name": r.get("DispCName"), "ename": r.get("DispEName"),
            "last": _num(r.get("CLastPrice")), "ref": _num(r.get("CRefPrice")), "chg": _num(r.get("CDiff")),
            "pct": _num(r.get("CDiffRate")), "open": _num(r.get("COpenPrice")), "high": _num(r.get("CHighPrice")),
            "low": _num(r.get("CLowPrice")), "vol": _num(r.get("CTotalVolume")), "oi": _num(r.get("OpenInterest")),
            "bid": _num(r.get("CBidPrice1")), "ask": _num(r.get("CAskPrice1")), "time": r.get("CTime"), "date": r.get("CDate")}


def tw_futures():
    def load():
        out = []
        for cid in ("TXF", "MXF", "TMF"):
            try:
                out += [dict(_tfq(r), product=cid) for r in taifex_post(_tf_body("F", cid))]
            except Exception as e:
                print("TAIFEX fut error:", e, file=sys.stderr)
        return out
    return cached("twfut", 5, load)


OPT_RE = re.compile(r"^(TX[A-Z0-9])(\d+)([A-X])(\d)-O$")


def tw_options(expiry=None):
    rows = cached("txo", 8, lambda: taifex_post(_tf_body("O", "TXO")))
    spot = None
    series = {}
    for r in rows:
        if r["SymbolID"] == "TXO-Q":
            spot = _num(r.get("CLastPrice"))
            continue
        m = OPT_RE.match(r["SymbolID"])
        if not m:
            continue
        prefix, strike, letter, yd = m.groups()
        call = letter <= "L"
        month = (ord(letter) - ord("A")) % 12 + 1
        key = r.get("DispEName") or f"{prefix}{month}{yd}"
        s = series.setdefault(key, {"id": key, "prefix": prefix, "month": month, "year": int(yd), "rows": {}})
        q = _tfq(r)
        q["strike"] = float(strike)
        s["rows"].setdefault(float(strike), {"strike": float(strike)})["call" if call else "put"] = q

    def order(s):  # 依到期日排序（名稱裡有日期就用，月選沒有日期時以當月第三個週三估算）
        m = re.search(r"(\d{4})/(\d{2})/(\d{2})", s["id"])
        if m:
            return m.group(0)
        y = 2020 + s["year"] if s["year"] >= 6 else 2030 + s["year"]
        return f"{y}/{s['month']:02d}/18"
    exps = sorted(series.values(), key=order)
    if not exps:
        return {"underlying": "TXO", "name": "台指選擇權", "spot": spot, "expiries": [], "rows": []}
    cur = next((s for s in exps if s["id"] == expiry), exps[0])

    def lab(s):
        return f"{s['id']}（{'月選' if s['prefix'] == 'TXO' else '週選'}）"
    return {"underlying": "TXO", "name": "台指選擇權", "spot": spot, "currency": "TWD",
            "expiries": [{"id": s["id"], "label": lab(s)} for s in exps], "expiry": cur["id"],
            "rows": sorted(cur["rows"].values(), key=lambda r: r["strike"])}


# ---------------- 新聞 ----------------
def _rss_items(xml):
    items = []
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        def tag(t):
            m = re.search(rf"<{t}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{t}>", it, re.S)
            return m.group(1).strip() if m else ""
        ts = None
        try:
            ts = int(datetime.strptime(tag("pubDate"), "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            pass
        items.append({"title": tag("title"), "link": tag("link"), "publisher": "Yahoo股市", "time": ts})
    return items


def news(code=None):
    def load():
        out = []
        if code and not is_tw(code):
            d = fetch_json("https://query1.finance.yahoo.com/v1/finance/search?quotesCount=0&newsCount=20&q=" + urllib.parse.quote(yahoo_symbol(code)))
            out = [{"title": n["title"], "link": n["link"], "publisher": n.get("publisher"), "time": n.get("providerPublishTime")}
                   for n in d.get("news", [])]
        elif code:
            out = _rss_items(fetch(f"https://tw.stock.yahoo.com/rss?s={urllib.parse.quote(code)}"))
        else:
            for cat, label in (("tw_stock", "台股"), ("wd_stock", "國際股")):
                try:
                    d = fetch_json(f"https://api.cnyes.com/media/api/v1/newslist/category/{cat}?limit=30")
                    for n in d["items"]["data"]:
                        out.append({"title": n["title"], "link": f"https://news.cnyes.com/news/id/{n['newsId']}", "publisher": "鉅亨網",
                                    "time": n.get("publishAt"), "cat": label, "summary": n.get("summary")})
                except Exception as e:
                    print("cnyes error:", e, file=sys.stderr)
            out.sort(key=lambda n: -(n["time"] or 0))
        return out
    return cached(f"news:{code}", 180, load)


# ---------------- 日曆 ----------------
def _roc(d):  # 民國 1151113 -> 20261113
    return f"{int(d[:3]) + 1911}{d[3:]}" if d and len(d) == 7 else d


def calendar(date):
    """date: YYYY-MM-DD"""
    def nas(kind):
        d = fetch_json(f"https://api.nasdaq.com/api/calendar/{kind}?date={date}", 15)
        return ((d.get("data") or {}).get("rows")) or []

    def load():
        res = {"date": date}
        try:
            res["earnings"] = [{"symbol": r.get("symbol"), "name": r.get("name"), "time": r.get("time"), "cap": r.get("marketCap"),
                                "eps": r.get("epsForecast"), "lastEps": r.get("lastYearEPS")} for r in nas("earnings")]
        except Exception as e:
            res["earnings"] = []
            print("earnings error:", e, file=sys.stderr)
        try:
            res["economic"] = [{"time": r.get("gmt"), "country": r.get("country"), "event": r.get("eventName"), "actual": r.get("actual"),
                                "consensus": r.get("consensus"), "previous": r.get("previous")} for r in nas("economicevents")]
        except Exception as e:
            res["economic"] = []
            print("econ error:", e, file=sys.stderr)
        return res
    out = dict(cached(f"cal:{date}", 1800, load))
    try:
        divs = cached("twdiv", 6 * 3600, lambda: fetch_json("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", 20))
        out["twDividends"] = [{"date": _roc(r["Date"]), "code": r["Code"], "name": r["Name"], "type": r.get("Exdividend"),
                               "cash": _num(r.get("CashDividend")), "stock": r.get("StockDividendRatio")} for r in divs]
    except Exception as e:
        out["twDividends"] = []
        print("div error:", e, file=sys.stderr)
    try:
        hol = cached("twhol", 86400, lambda: fetch_json("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", 20))
        out["twHolidays"] = [{"date": _roc(r["Date"]), "name": r["Name"], "desc": r.get("Description")} for r in hol]
    except Exception as e:
        out["twHolidays"] = []
        print("holiday error:", e, file=sys.stderr)
    return out



# ---------------- 個股資訊 ----------------
def _open_data(url, ttl=6 * 3600):
    return cached("od:" + url, ttl, lambda: fetch_json(url, 25))


def _find(rows, code, *keys):
    for r in rows or []:
        for k in keys:
            if str(r.get(k, "")).strip() == code:
                return r
    return None


def _roc_date(s):
    s = str(s or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}/{s[4:6]}/{s[6:]}"
    return f"{int(s[:3]) + 1911}/{s[3:5]}/{s[5:7]}" if len(s) == 7 and s.isdigit() else s


def _money(v):
    n = _num(v)
    return f"{n / 1e8:,.2f} 億元" if n else v


def _shares(v):
    n = _num(v)
    return f"{n:,.0f} 股（{n / 1000:,.0f} 張）" if n else v


def _div_history(code):
    sym = yahoo_symbol(code)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=10y&interval=3mo&events=div"
    d = cached("div:" + sym, 6 * 3600, lambda: fetch_json(url))["chart"]["result"][0]
    divs = sorted(((d.get("events") or {}).get("dividends") or {}).values(), key=lambda x: -x["date"])
    return [{"date": datetime.fromtimestamp(x["date"], timezone.utc).strftime("%Y/%m/%d"), "amount": round(x["amount"], 4)} for x in divs[:40]]


def _summary(code, modules):
    sym = yahoo_symbol(code)
    url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}?modules={modules}"
    r = cached(f"qs:{sym}:{modules}", 3600, lambda: yahoo_auth_json(url))
    res = (r.get("quoteSummary") or {}).get("result") or [{}]
    return res[0] or {}


def _raw(x):
    return x.get("raw") if isinstance(x, dict) else x


def _fmt(x):
    if isinstance(x, dict):
        return x.get("fmt") or x.get("longFmt") or x.get("raw")
    return x


def _eps_fin(s):
    e = s.get("earnings") or {}
    eps = [{"q": q.get("date"), "actual": _raw(q.get("actual")), "estimate": _raw(q.get("estimate"))}
           for q in ((e.get("earningsChart") or {}).get("quarterly") or [])]
    fin = [{"year": y.get("date"), "revenue": _raw(y.get("revenue")), "earnings": _raw(y.get("earnings"))}
           for y in ((e.get("financialsChart") or {}).get("yearly") or [])]
    return eps, fin


def tw_info(code):
    mkt = market_of(code) or "tse"
    out = {"code": code, "market": "tw", "mkt": mkt}
    if mkt == "tse":
        prof = _find(_open_data("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"), code, "公司代號")
        rev = _find(_open_data("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"), code, "公司代號")
        val = _find(_open_data("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL", 3600), code, "Code")
        ann = [r for r in _open_data("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", 900) if str(r.get("公司代號")).strip() == code]
        if prof:
            g = prof.get
            out["profile"] = [["公司名稱", g("公司名稱")], ["英文簡稱", g("英文簡稱")], ["董事長", g("董事長")], ["總經理", g("總經理")],
                              ["發言人", f"{g('發言人') or ''}（{g('發言人職稱') or ''}）"], ["成立日期", _roc_date(g("成立日期"))],
                              ["上市日期", _roc_date(g("上市日期"))], ["實收資本額", _money(g("實收資本額"))], ["已發行普通股數", _shares(g("已發行普通股數或TDR原股發行股數"))],
                              ["簽證會計師事務所", g("簽證會計師事務所")], ["股務代理", g("股票過戶機構")], ["電話", g("總機電話")],
                              ["地址", g("住址")], ["網址", g("網址")]]
        if val:
            out["valuation"] = {"pe": _num(val.get("PEratio")), "yield": _num(val.get("DividendYield")), "pb": _num(val.get("PBratio")), "date": _roc_date(val.get("Date"))}
        out["announcements"] = [{"date": _roc_date(r.get("發言日期")), "time": str(r.get("發言時間", "")).zfill(6),
                                 "title": (r.get("主旨 ") or r.get("主旨") or "").strip(), "desc": (r.get("說明") or "").strip()} for r in ann]
    else:
        prof = _find(_open_data("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"), code, "SecuritiesCompanyCode")
        rev = _find(_open_data("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"), code, "公司代號")
        val = _find(_open_data("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis", 3600), code, "SecuritiesCompanyCode")
        ann = [r for r in _open_data("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O", 900) if str(r.get("SecuritiesCompanyCode")).strip() == code]
        if prof:
            g = prof.get
            out["profile"] = [["公司名稱", g("CompanyName")], ["英文簡稱", g("Symbol")], ["董事長", g("Chairman")], ["總經理", g("GeneralManager")],
                              ["發言人", f"{g('Spokesman') or ''}（{g('TitleOfSpokesman') or ''}）"], ["成立日期", _roc_date(g("DateOfIncorporation"))],
                              ["上櫃日期", _roc_date(g("DateOfListing"))], ["實收資本額", _money(g("Paidin.Capital.NTDollars"))], ["已發行普通股數", _shares(g("IssueShares"))],
                              ["簽證會計師事務所", g("AccountingFirm")], ["股務代理", g("StockTransferAgent")], ["電話", g("Telephone")],
                              ["地址", g("Address")], ["網址", g("WebAddress")]]
        if val:
            out["valuation"] = {"pe": _num(val.get("PriceEarningRatio")), "yield": _num(val.get("YieldRatio")), "pb": _num(val.get("PriceBookRatio")), "date": _roc_date(val.get("Date"))}
        out["announcements"] = [{"date": _roc_date(r.get("發言日期")), "time": str(r.get("發言時間", "")).zfill(6),
                                 "title": (r.get("主旨") or "").strip(), "desc": (r.get("說明") or "").strip()} for r in ann]
    if rev:
        ym = str(rev.get("資料年月", ""))
        out["revenue"] = {"month": f"{int(ym[:3]) + 1911}/{ym[3:]}" if len(ym) == 5 else ym, "industry": rev.get("產業別"),
                          "cur": _num(rev.get("營業收入-當月營收")), "prev": _num(rev.get("營業收入-上月營收")), "lastYear": _num(rev.get("營業收入-去年當月營收")),
                          "mom": _num(rev.get("營業收入-上月比較增減(%)")), "yoy": _num(rev.get("營業收入-去年同月增減(%)")),
                          "ytd": _num(rev.get("累計營業收入-當月累計營收")), "ytdLast": _num(rev.get("累計營業收入-去年累計營收")),
                          "ytdYoy": _num(rev.get("累計營業收入-前期比較增減(%)")), "note": (rev.get("備註") or "").strip()}
    out["dividends"] = _safe(_div_history, code, [])
    if prof:
        out["shares"] = _num(prof.get("已發行普通股數或TDR原股發行股數") or prof.get("IssueShares"))
    s = _safe(lambda c: _summary(c, "earnings,financialData"), code, {})
    out["eps"], out["financials"] = _eps_fin(s)
    return out


def us_info(code):
    s = _summary(code, "assetProfile,summaryDetail,defaultKeyStatistics,financialData,calendarEvents,earnings,price")
    ap, sd, ks, fd, ce, pr = (s.get(k) or {} for k in ("assetProfile", "summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents", "price"))
    out = {"code": code, "market": "us"}
    out["profile"] = [["公司名稱", pr.get("longName") or pr.get("shortName")], ["產業", f"{ap.get('sector') or ''}／{ap.get('industry') or ''}"],
                      ["員工人數", f"{ap['fullTimeEmployees']:,}" if ap.get("fullTimeEmployees") else None], ["交易所", pr.get("exchangeName")],
                      ["地址", ", ".join(x for x in (ap.get("address1"), ap.get("city"), ap.get("state"), ap.get("country")) if x)],
                      ["電話", ap.get("phone")], ["網址", ap.get("website")]]
    out["officers"] = [[o.get("name"), o.get("title")] for o in (ap.get("companyOfficers") or [])[:5]]
    out["summary"] = ap.get("longBusinessSummary")
    out["stats"] = [["市值", _fmt(sd.get("marketCap")) or _fmt(pr.get("marketCap"))], ["本益比 (TTM)", _fmt(sd.get("trailingPE"))], ["預估本益比", _fmt(sd.get("forwardPE"))],
                    ["每股盈餘 (TTM)", _fmt(ks.get("trailingEps"))], ["股價淨值比", _fmt(ks.get("priceToBook"))], ["殖利率", _fmt(sd.get("dividendYield"))],
                    ["Beta", _fmt(sd.get("beta"))], ["52 週區間", f"{_fmt(sd.get('fiftyTwoWeekLow'))} – {_fmt(sd.get('fiftyTwoWeekHigh'))}"],
                    ["營收 (TTM)", _fmt(fd.get("totalRevenue"))], ["營收成長 (YoY)", _fmt(fd.get("revenueGrowth"))], ["毛利率", _fmt(fd.get("grossMargins"))],
                    ["營業利益率", _fmt(fd.get("operatingMargins"))], ["淨利率", _fmt(fd.get("profitMargins"))], ["股東權益報酬率", _fmt(fd.get("returnOnEquity"))],
                    ["現金", _fmt(fd.get("totalCash"))], ["負債", _fmt(fd.get("totalDebt"))], ["流通股數", _fmt(ks.get("sharesOutstanding"))],
                    ["放空比例", _fmt(ks.get("shortPercentOfFloat"))]]
    out["analyst"] = {"target": _raw(fd.get("targetMeanPrice")), "high": _raw(fd.get("targetHighPrice")), "low": _raw(fd.get("targetLowPrice")),
                      "rec": fd.get("recommendationKey"), "count": _raw(fd.get("numberOfAnalystOpinions")), "price": _raw(fd.get("currentPrice"))}
    ed = (ce.get("earnings") or {}).get("earningsDate") or []
    out["events"] = [["下次財報", " ~ ".join(_fmt(x) for x in ed[:2]) if ed else None], ["除息日", _fmt(ce.get("exDividendDate"))], ["配息日", _fmt(ce.get("dividendDate"))]]
    out["eps"], out["financials"] = _eps_fin(s)
    out["dividends"] = _safe(_div_history, code, [])
    out["shares"] = _raw(ks.get("sharesOutstanding"))
    return out


def stock_info(code, tr=False):
    info = dict(tw_info(code) if is_tw(code) else us_info(code))
    info["news"] = _safe(news, code, [])
    if tr and not is_tw(code):
        info["news"] = add_translation(info["news"])
        if info.get("summary"):
            info["summary_zh"] = (translate_zh([info["summary"]]) or [None])[0]
        # 產業別、經營團隊職稱也翻成中文
        prof = [list(r) for r in info.get("profile") or []]
        offs = [list(r) for r in info.get("officers") or []]
        targets = [r for r in prof if r[0] == "產業" and r[1]] + [r for r in offs if r[1]]
        for r, zh in zip(targets, translate_zh([r[1] for r in targets])):
            if zh and zh != r[1]:
                r[1] = zh
        info["profile"], info["officers"] = prof, offs
    return info


# ---------------- 英文翻譯（新聞標題、公司簡介） ----------------
# 使用 Google 翻譯的公開網頁端點；失敗時前端照樣顯示原文，並附「翻譯」連結
_TR, _tr_lock, _tr_fail = {}, threading.Lock(), [0.0]
_CJK = re.compile(r"[぀-ヿ㐀-鿿]")


def translate_zh(texts):
    texts = [t if isinstance(t, str) else "" for t in texts]
    need = [t for t in dict.fromkeys(texts) if t.strip() and t not in _TR and not _CJK.search(t) and re.search(r"[A-Za-z]{2}", t)]
    if need and time.time() - _tr_fail[0] > 300:  # 失敗後 5 分鐘內不再嘗試
        chunks, cur, size = [], [], 0
        for t in need:
            if cur and (size + len(t) > 4000 or len(cur) >= 40):
                chunks.append(cur); cur, size = [], 0
            cur.append(t[:4500]); size += len(t)
        if cur:
            chunks.append(cur)
        for ch in chunks:
            try:
                body = urllib.parse.urlencode([("q", t) for t in ch]).encode()
                req = urllib.request.Request("https://translate.googleapis.com/translate_a/t?client=gtx&sl=en&tl=zh-TW", data=body,
                                             headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"})
                with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as r:
                    res = json.loads(r.read().decode("utf-8"))
                if isinstance(res, str):
                    res = [res]
                with _tr_lock:
                    if len(_TR) > 5000:
                        _TR.clear()
                    for src, dst in zip(ch, res):
                        dst = dst[0] if isinstance(dst, list) else dst
                        if isinstance(dst, str) and dst.strip():
                            _TR[src] = dst
            except Exception as e:
                _tr_fail[0] = time.time()
                print("translate error:", e, file=sys.stderr)
                break
    return [_TR.get(t) for t in texts]


def add_translation(items, key="title"):
    items = [dict(n) for n in items]
    for n, zh in zip(items, translate_zh([n.get(key) for n in items])):
        if zh:
            n[key + "_zh"] = zh
    return items



# ---------------- 週日曆 ----------------
# 紐約證交所休市日（含提早收盤）
NYSE_HOLIDAYS = {
    "2026-01-01": "元旦", "2026-01-19": "馬丁路德金恩紀念日", "2026-02-16": "總統日", "2026-04-03": "耶穌受難日",
    "2026-05-25": "陣亡將士紀念日", "2026-06-19": "六月節", "2026-07-03": "獨立紀念日（補假）", "2026-09-07": "勞動節",
    "2026-11-26": "感恩節", "2026-11-27": "感恩節翌日（提早 13:00 收盤）", "2026-12-24": "平安夜（提早 13:00 收盤）", "2026-12-25": "聖誕節",
    "2027-01-01": "元旦", "2027-01-18": "馬丁路德金恩紀念日", "2027-02-15": "總統日", "2027-03-26": "耶穌受難日",
    "2027-05-31": "陣亡將士紀念日", "2027-06-18": "六月節（補假）", "2027-07-05": "獨立紀念日（補假）", "2027-09-06": "勞動節",
    "2027-11-25": "感恩節", "2027-11-26": "感恩節翌日（提早 13:00 收盤）", "2027-12-24": "聖誕節（補假）",
}
COUNTRY_ZH = {"United States": "美國", "China": "中國", "Japan": "日本", "Euro Zone": "歐元區", "Germany": "德國", "United Kingdom": "英國",
              "France": "法國", "Italy": "義大利", "Spain": "西班牙", "Canada": "加拿大", "Australia": "澳洲", "New Zealand": "紐西蘭",
              "South Korea": "南韓", "India": "印度", "Brazil": "巴西", "Russia": "俄羅斯", "South Africa": "南非", "Switzerland": "瑞士"}


def _us_dst(d):
    """美國夏令時間：三月第二個週日 ~ 十一月第一個週日。"""
    def nth_sunday(y, m, n):
        first = datetime(y, m, 1)
        return first + timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))
    return nth_sunday(d.year, 3, 2) <= d < nth_sunday(d.year, 11, 1)


def _et_to_tw(date_str, hhmm):
    """Nasdaq 經濟數據時間為美東時間 -> 台北時間 (date, HH:MM)。"""
    try:
        h, m = map(int, hhmm.split(":"))
    except (ValueError, AttributeError):
        return date_str, None
    et = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=h, minute=m)
    tw = et + timedelta(hours=12 if _us_dst(et) else 13)
    return tw.strftime("%Y-%m-%d"), tw.strftime("%H:%M")


def _nas_rows(kind, date):
    def load():
        d = fetch_json(f"https://api.nasdaq.com/api/calendar/{kind}?date={date}", 15).get("data") or {}
        return (d.get("calendar") or {}).get("rows") or d.get("rows") or []
    return cached(f"nas:{kind}:{date}", 1800, load)


def cal_week(start, mkt):
    """start: 週日 YYYY-MM-DD。回傳 {date: [events]}，時間一律台北時間。"""
    d0 = datetime.strptime(start, "%Y-%m-%d")
    days = [(d0 + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    out = {d: [] for d in days}

    def add(date, ev):
        if date in out:
            out[date].append(ev)
    # 經濟數據（前一天也抓，因為時差可能跨日）
    econ_days = [(d0 + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(-1, 7)]
    for date, rows in zip(econ_days, POOL.map(lambda d: _safe(lambda x: _nas_rows("economicevents", x), d, []), econ_days)):
        for r in rows:
            td, tt = _et_to_tw(date, r.get("gmt"))
            c = r.get("country")
            clean = lambda v: (v or "").replace("&nbsp;", "").strip() or None
            add(td, {"type": "econ", "time": tt, "country": c, "countryZh": COUNTRY_ZH.get(c, c), "title": r.get("eventName"),
                     "actual": clean(r.get("actual")), "consensus": clean(r.get("consensus")), "previous": clean(r.get("previous"))})
    if mkt == "us":
        for date, rows in zip(days, POOL.map(lambda d: _safe(lambda x: _nas_rows("earnings", x), d, []), days)):
            for r in rows:
                cap = _num(str(r.get("marketCap") or "").replace("$", "").replace(",", "")) or 0
                t = {"time-pre-market": "pre", "time-after-hours": "post"}.get(r.get("time"))
                add(date, {"type": "earn", "code": "US." + r["symbol"], "symbol": r["symbol"], "title": r.get("name"), "cap": cap,
                           "session": t, "eps": r.get("epsForecast"), "lastEps": r.get("lastYearEPS"), "quarter": r.get("fiscalQuarterEnding")})
        for date, rows in zip(days, POOL.map(lambda d: _safe(lambda x: _nas_rows("dividends", x), d, []), days)):
            for r in rows:
                add(date, {"type": "div", "code": "US." + r["symbol"], "symbol": r["symbol"], "title": r.get("companyName"),
                           "amount": r.get("dividend_Rate"), "annual": r.get("indicated_Annual_Dividend"), "pay": r.get("payment_Date")})
        for d in days:
            if d in NYSE_HOLIDAYS:
                add(d, {"type": "hol", "title": "美股" + ("提早收盤" if "提早" in NYSE_HOLIDAYS[d] else "休市"), "desc": NYSE_HOLIDAYS[d]})
    else:
        try:
            divs = cached("twdiv", 6 * 3600, lambda: fetch_json("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", 20))
        except Exception:
            divs = []
        for r in divs:
            dd = _roc(r["Date"])
            dd = f"{dd[:4]}-{dd[4:6]}-{dd[6:]}"
            add(dd, {"type": "div", "code": r["Code"], "symbol": r["Code"], "title": r["Name"], "kind": r.get("Exdividend"),
                     "amount": _num(r.get("CashDividend")), "stock": r.get("StockDividendRatio")})
        try:
            hol = cached("twhol", 86400, lambda: fetch_json("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", 20))
        except Exception:
            hol = []
        for h in hol:
            dd = _roc(h["Date"])
            name = h.get("Name") or ""
            if "開始交易" in name or "最後交易" in name:
                kind = "台股" + ("開始交易" if "開始交易" in name else "最後交易")
            else:
                kind = "台股休市"
            add(f"{dd[:4]}-{dd[4:6]}-{dd[6:]}", {"type": "hol", "title": kind, "desc": name})
    for d in out:
        out[d].sort(key=lambda e: (e["type"] != "hol", e.get("time") or "99:99", -(e.get("cap") or 0)))
    return {"start": start, "days": days, "events": out}



# ---------------- 設定檔、推播 ----------------
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
STRAT_FILE = os.path.join(DATA_DIR, "strategies.json")
EVENT_FILE = os.path.join(DATA_DIR, "strategy_events.json")
_store_lock = threading.RLock()


def _jload(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _jsave(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def config_get():
    return _jload(CONFIG_FILE, {"notify": {}})


def config_public():
    """回傳給前端時把 token 遮起來。"""
    c = config_get().get("notify", {})
    def mask(v):
        return (v[:4] + "…" + v[-4:]) if isinstance(v, str) and len(v) > 10 else ("已設定" if v else "")
    return {"telegram": {"enabled": bool(c.get("telegram", {}).get("enabled")), "token": mask(c.get("telegram", {}).get("token")), "chat_id": c.get("telegram", {}).get("chat_id", "")},
            "discord": {"enabled": bool(c.get("discord", {}).get("enabled")), "webhook": mask(c.get("discord", {}).get("webhook"))},
            "ntfy": {"enabled": bool(c.get("ntfy", {}).get("enabled")), "topic": c.get("ntfy", {}).get("topic", ""), "server": c.get("ntfy", {}).get("server", "https://ntfy.sh")},
            "base_url": c.get("base_url", ""), "mode": c.get("mode", "both")}


def config_set_notify(body):
    with _store_lock:
        cfg = config_get()
        n = cfg.setdefault("notify", {})
        for ch, keys in (("telegram", ("token", "chat_id")), ("discord", ("webhook",)), ("ntfy", ("topic", "server"))):
            if ch in body:
                cur = n.setdefault(ch, {})
                cur["enabled"] = bool(body[ch].get("enabled"))
                for k in keys:
                    v = body[ch].get(k)
                    if v is not None and "…" not in str(v) and v != "已設定":  # 遮罩值代表沒改
                        cur[k] = str(v).strip()
        if "base_url" in body:
            n["base_url"] = str(body.get("base_url") or "").strip()
        if body.get("mode") in ("instant", "summary", "both"):
            n["mode"] = body["mode"]
        _jsave(CONFIG_FILE, cfg)
    return {"ok": True, "msg": "推播設定已儲存"}


# ---------------- Alpaca 夜盤資料（美東 20:00–04:00，Blue Ocean ATS） ----------------
ALPACA_DATA = "https://data.alpaca.markets"
_alp_feed = {}  # 記住哪個 feed 這個帳號能用：{"bars": "boats", "latest": "overnight"}


def alpaca_keys():
    a = config_get().get("alpaca") or {}
    return (a.get("key") or "", a.get("secret") or "")


def alpaca_on():
    k, sec = alpaca_keys()
    return bool(k and sec)


def _alp_sym(code):
    return code[3:].replace("-", ".")  # US.BRK-B -> BRK.B


class AlpacaError(Exception):
    pass


def _alp_get(path, params):
    k, sec = alpaca_keys()
    if not (k and sec):
        raise AlpacaError("尚未設定 Alpaca 金鑰")
    url = ALPACA_DATA + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": sec, "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=8, context=SSL_CTX) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw).get("message") or raw[:120]
        except ValueError:
            msg = ""
        hint = {401: "金鑰不正確", 403: "這個帳號的方案沒有夜盤資料權限", 429: "請求太頻繁，稍後再試"}.get(e.code, "")
        raise AlpacaError(f"HTTP {e.code} {hint} {msg}".strip()) from None


def _alp_try(kind, path, params):
    """依序試 boats / overnight 兩種 feed，第一個成功的記起來下次直接用。"""
    feeds = [_alp_feed[kind]] if kind in _alp_feed else ["boats", "overnight"]
    err = None
    for f in feeds:
        try:
            d = _alp_get(path, dict(params, feed=f))
            _alp_feed[kind] = f
            return d
        except AlpacaError as e:
            err = e
    _alp_feed.pop(kind, None)
    raise err


def _iso_ts(s):
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


def alpaca_latest(codes):
    """美股代號 -> 最新一筆夜盤成交 {"price","ts"}。"""
    syms = sorted({_alp_sym(c) for c in codes})
    if not syms or not alpaca_on():
        return {}

    def load():
        d = _alp_try("latest", "/v2/stocks/trades/latest", {"symbols": ",".join(syms)})
        return {sym: {"price": t["p"], "ts": _iso_ts(t["t"])} for sym, t in (d.get("trades") or {}).items() if t.get("p")}
    try:
        got = cached("alp:last:" + ",".join(syms), 4, load)
    except Exception as e:  # 金鑰錯、方案沒權限：報價照舊，不要讓整個報價失敗
        print("[alpaca] latest:", e)
        return {}
    return {c: got[_alp_sym(c)] for c in codes if _alp_sym(c) in got}


_alp_delayed = [False]  # 免費方案不能查最近 15 分鐘的 BOATS 分K


def alpaca_night_bars(code, start, end):
    if not code.startswith("US."):
        return {"bars": [], "error": "只有美股有夜盤"}
    if not alpaca_on():
        return {"bars": [], "error": "nokey"}
    now = int(time.time())
    start, end = int(start), min(int(end), now + 60)
    if end <= start:
        return {"bars": []}
    iso = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sym = _alp_sym(code)

    def get(stop):
        bars, tok = [], None
        for _ in range(5):
            prm = {"symbols": sym, "timeframe": "1Min", "start": iso(start), "end": iso(stop), "limit": 10000, "sort": "asc", "feed": "boats"}
            if tok:
                prm["page_token"] = tok
            d = _alp_get("/v2/stocks/bars", prm)
            for x in (d.get("bars") or {}).get(sym) or []:
                bars.append({"t": _iso_ts(x["t"]), "o": x["o"], "h": x["h"], "l": x["l"], "c": x["c"], "v": x.get("v", 0)})
            tok = d.get("next_page_token")
            if not tok:
                break
        return bars

    def load():
        stop = min(end, now - 16 * 60) if _alp_delayed[0] else end
        bars = []
        if stop > start:
            try:
                bars = get(stop)
            except AlpacaError as e:
                if "recent" not in str(e) or _alp_delayed[0]:
                    raise
                _alp_delayed[0] = True
                stop = min(end, now - 16 * 60)
                bars = get(stop) if stop > start else []
        if _alp_delayed[0] and end > now - 16 * 60:  # 最近 15 分鐘用最新成交補一根，之後由即時報價接著畫
            x = alpaca_latest([code]).get(code)
            if x and start <= x["ts"] < end and (not bars or x["ts"] >= bars[-1]["t"] + 60):
                t = x["ts"] // 60 * 60
                bars.append({"t": t, "o": x["price"], "h": x["price"], "l": x["price"], "c": x["price"], "v": 0})
        return {"bars": bars, "delayed": _alp_delayed[0]}
    try:
        return cached(f"alp:bars:{sym}:{start}:{end // 30}:{now // 30}", 20, load)
    except AlpacaError as e:
        return {"bars": [], "error": str(e)}


def config_alpaca_public():
    k, sec = alpaca_keys()
    return {"key": (k[:4] + "…" + k[-4:]) if len(k) > 10 else ("已設定" if k else ""), "secret": "已設定" if sec else ""}


def config_set_alpaca(body):
    with _store_lock:
        cfg = config_get()
        a = cfg.setdefault("alpaca", {})
        for k in ("key", "secret"):
            v = body.get(k)
            if v is not None and "…" not in str(v) and v != "已設定":
                a[k] = str(v).strip()
        _jsave(CONFIG_FILE, cfg)
    _alp_feed.clear()
    with _cache_lock:
        for k in [k for k in _cache if k.startswith("alp:")]:
            _cache.pop(k, None)
    if not alpaca_on():
        return {"ok": True, "msg": "已清除 Alpaca 金鑰"}
    try:
        d = _alp_try("latest", "/v2/stocks/trades/latest", {"symbols": "SPY"})
        t = (d.get("trades") or {}).get("SPY") or {}
        return {"ok": True, "msg": f"Alpaca 連線成功（{_alp_feed.get('latest')}，SPY 最新夜盤成交 {t.get('p', '--')}）"}
    except AlpacaError as e:
        return {"ok": False, "msg": "金鑰已儲存，但連線失敗：" + str(e)}


def _post(url, data, headers=None, form=False):
    body = (urllib.parse.urlencode(data).encode() if form else
            data.encode("utf-8") if isinstance(data, str) else json.dumps(data).encode("utf-8"))
    h = {"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" if form else
         ("text/plain; charset=utf-8" if isinstance(data, str) else "application/json")}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h), timeout=10, context=SSL_CTX) as r:
        return r.status


def push(title, text, only=None, url=None, tags=None, priority=None):
    """送到所有已啟用的推播管道。text 可用 **粗體**；url 是點通知要打開的網址。回傳每個管道的結果。"""
    n = config_get().get("notify", {})
    res = {}
    plain = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    t = n.get("telegram", {})
    if t.get("enabled") and t.get("token") and t.get("chat_id") and (not only or only == "telegram"):
        try:
            h = lambda x: x.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            body = f"<b>{h(title)}</b>\n\n" + re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", h(text))
            if url:
                body += f'\n\n<a href="{h(url)}">在 NightMarket 打開</a>'
            _post(f"https://api.telegram.org/bot{t['token']}/sendMessage",
                  {"chat_id": t["chat_id"], "text": body[:4000], "parse_mode": "HTML", "disable_web_page_preview": "true"}, form=True)
            res["telegram"] = "ok"
        except Exception as e:
            res["telegram"] = f"失敗：{e}"
    d = n.get("discord", {})
    if d.get("enabled") and d.get("webhook") and (not only or only == "discord"):
        try:
            emb = {"title": title[:250], "description": text[:4000], "color": {"buy": 0xF0444F, "sell": 0x17B978}.get(priority, 0xF5A524)}
            if url:
                emb["url"] = url
            _post(d["webhook"], {"embeds": [emb]})
            res["discord"] = "ok"
        except Exception as e:
            res["discord"] = f"失敗：{e}"
    f = n.get("ntfy", {})
    if f.get("enabled") and f.get("topic") and (not only or only == "ntfy"):
        try:
            server_ = (f.get("server") or "https://ntfy.sh").rstrip("/")
            msg = {"topic": f["topic"], "title": title, "message": plain[:3800], "tags": tags or ["chart_with_upwards_trend"],
                   "priority": 4 if priority in ("buy", "sell") else 3}
            if url:
                msg["click"] = url
                msg["actions"] = [{"action": "view", "label": "打開圖表", "url": url}]
            _post(server_, msg)  # JSON 發布：標題、中文、按鈕都不會變亂碼
            res["ntfy"] = "ok"
        except Exception as e:
            res["ntfy"] = f"失敗：{e}"
    return res


def app_url(code=None, view=None):
    """通知裡「打開圖表」的網址（推播設定裡填的網頁網址，例如 Tailscale 網址）。"""
    base = (config_get().get("notify", {}).get("base_url") or "").strip().rstrip("/")
    if not base:
        return None
    parts = []
    if code:
        parts += [f"mkt={'tw' if is_tw(code) else 'us'}", f"code={urllib.parse.quote(code)}"]
    if view:
        parts.append(f"view={view}")
    return base + "/" + ("#" + "&".join(parts) if parts else "")


# ---------------- 策略：存取、回測、監控 ----------------
def strategies_get():
    return _jload(STRAT_FILE, [])


def strategies_save(lst):
    with _store_lock:
        _jsave(STRAT_FILE, lst)


def strategy_upsert(st):
    st = dict(st)
    st.setdefault("id", uuid.uuid4().hex[:10])
    st["updated"] = int(time.time())
    with _store_lock:
        lst = [x for x in strategies_get() if x.get("id") != st["id"]]
        lst.insert(0, st)
        strategies_save(lst)
    return {"ok": True, "strategy": st}


def strategy_delete(sid):
    with _store_lock:
        strategies_save([x for x in strategies_get() if x.get("id") != sid])
    return {"ok": True}


def _daily(code, years=2):
    rng = {1: "1y", 2: "2y", 3: "5y", 5: "5y", 10: "10y"}.get(int(years), "2y")
    return (kline(code, "1d", rng) or {}).get("bars") or []


DEFAULT_BENCH = {"tw": "0050", "us": "US.SPY"}


def bench_of(st):
    return st.get("benchmark") or DEFAULT_BENCH.get(st.get("mkt", "tw"), "0050")


def run_backtest(body):
    st = body.get("strategy") or {}
    codes = [c for c in (st.get("universe") or []) if c][:20]
    if not codes:
        return {"error": "請至少選一檔股票"}
    if not (st.get("entry") or {}).get("rules"):
        return {"error": "請設定進場條件"}
    years = int(body.get("years") or 2)
    capital = float(body.get("capital") or (10_000_000 if st.get("mkt") == "tw" else 30_000))
    data = {}
    for code, bars in zip(codes, POOL.map(lambda c: _safe(lambda x: _daily(x, years), c, []), codes)):
        if years in (3,) and bars:  # 5y 資料截成 3 年
            cut = bars[-1]["t"] - 3 * 365 * 86400
            bars = [b for b in bars if b["t"] >= cut]
        if len(bars) > 30:
            data[code] = bars
    if not data:
        return {"error": "抓不到歷史資料"}
    bench = _safe(lambda x: _daily(x, max(years, 5) if years != 10 else 10), bench_of(st), [])
    r = S.backtest(st, data, capital, bench)
    r["stats"] = S.signal_stats(st, data, bench)
    r["benchmark"] = bench_of(st)
    r["names"] = {c: (stock_list().get(c) or {}).get("name") or c for c in data}
    return r


def events_get(since=0):
    return [e for e in _jload(EVENT_FILE, []) if e.get("t", 0) > since][:100]


def _event_add(ev):
    with _store_lock:
        lst = _jload(EVENT_FILE, [])
        lst.insert(0, ev)
        _jsave(EVENT_FILE, lst[:300])


_fired = {}  # (sid, code, kind, date) 一天只觸發一次


def _session_frac(code):
    """目前交易時段已經過的比例（台股 09:00–13:30、美股 09:30–16:00 紐約時間），收盤後為 1。"""
    if is_tw(code):
        n = datetime.now(TW)
        m = n.hour * 60 + n.minute - 9 * 60
        return max(0.05, min(1.0, m / 270))
    n = datetime.now(timezone.utc)
    off = -4 if _us_dst(n.replace(tzinfo=None)) else -5
    ny = n + timedelta(hours=off)
    m = ny.hour * 60 + ny.minute - 9 * 60 - 30
    return max(0.05, min(1.0, m / 390))


def _live_bars(code, project=False):
    """日 K 加上今天的即時報價。project=True 時盤中成交量依經過時間推估成全日量（量比條件才不會被低估）。"""
    bars = [dict(b) for b in _daily(code, 1)]
    q = quotes([code]).get(code)
    if not bars or not q or not q.get("price"):
        return bars, q
    last = bars[-1]
    off = 8 * 3600 if is_tw(code) else -5 * 3600
    qdate = (q.get("date") or "")
    ldate = datetime.fromtimestamp(last["t"] + off, timezone.utc).strftime("%Y%m%d")
    vol = (q.get("volume") or 0) * (1000 if is_tw(code) else 1)
    if qdate and qdate > ldate:  # 今天的K棒還沒進日K：用即時報價補一根
        bars.append({"t": last["t"] + 86400, "o": q.get("open") or q["price"], "h": q.get("high") or q["price"],
                     "l": q.get("low") or q["price"], "c": q["price"], "v": vol})
    else:
        last.update(c=q["price"], h=max(last["h"], q.get("high") or q["price"]), l=min(last["l"], q.get("low") or q["price"]), v=max(last["v"], vol))
    if project and q.get("isOpen"):
        frac = _session_frac(code)
        if frac < 1:
            bars[-1]["v"] = bars[-1]["v"] / frac
    return bars, q


def _market_open(mkt):
    if mkt == "tw":
        return tw_open()
    q = _safe(yahoo_quote, "US.^GSPC", None)
    return bool(q and q.get("session") == "REGULAR")


_stats_cache = {}  # (sid, 日期) -> signal_stats


def _strategy_stats(st):
    key = (st["id"], st.get("updated"), datetime.now(TW).strftime("%Y%m%d"))
    if key not in _stats_cache:
        codes = (st.get("universe") or [])[:30]
        data = {c: b for c, b in zip(codes, POOL.map(lambda c: _safe(lambda x: _daily(x, 5), c, []), codes)) if len(b) > 80}
        bench = _safe(lambda x: _daily(x, 5), bench_of(st), [])
        _stats_cache.clear() if len(_stats_cache) > 50 else None
        _stats_cache[key] = S.signal_stats(st, data, bench, horizons=(5, 20, 60))
    return _stats_cache[key]


def _pct(v, d=1):
    return "-" if v is None else f"{v * 100:+.{d}f}%"


def _stat_line(label, x, h=20):
    x = (x or {}).get(h) or (x or {}).get(str(h)) or {}
    if not x.get("n"):
        return f"{label}：沒有歷史樣本"
    warn = "（樣本少）" if x["n"] < 15 else ""
    ex = f"，比大盤 {_pct(x['excess'])}" if x.get("excess") is not None else ""
    return f"{label} {x['n']} 次{warn}：{h} 天勝率 {x['win'] * 100:.0f}%，平均 {_pct(x['avg'])}{ex}"


try:
    ZH_NAMES = json.load(open(os.path.join(ROOT, "web", "names-zh.json"), encoding="utf-8"))
except Exception:
    ZH_NAMES = {}


def zh_name(code, fallback=None):
    if is_tw(code):
        return (stock_list().get(code) or {}).get("name") or fallback or code
    return ZH_NAMES.get(code) or fallback or code


def _fmt_signal_push(st, evs):
    kind = evs[0]["kind"]
    head = "📈 進場訊號" if kind == "entry" else "📉 出場訊號"
    title = f"{head}｜{st.get('name')}" + (f"（{len(evs)} 檔）" if len(evs) > 1 else "")
    blocks = []
    for ev in evs:
        q = ev.get("q") or {}
        chg = (q["price"] / q["prev"] - 1) if q.get("price") and q.get("prev") else None
        lines = [f"**{ev['name']} {ev['code'].replace('US.', '')}**　{ev['price']:,}" + (f"（{_pct(chg, 2)}）" if chg is not None else "")]
        ok = [d["text"] for d in ev["detail"] if d.get("ok")]
        lines.append("・條件：" + "；".join(ok))
        stx = ev.get("stats")
        if stx and kind == "entry":
            lines.append("・" + _stat_line("本檔過去", stx["per"].get(ev["code"])))
        if ev.get("trade"):
            lines.append("・" + ev["trade"])
        blocks.append("\n".join(lines))
    foot = []
    stx = evs[0].get("stats")
    if stx and kind == "entry":
        foot.append(_stat_line("這個策略在整個股票池", stx["all"]))
        base = (stx.get("base") or {}).get(20) or {}
        if base.get("n"):
            foot.append(f"對照：任意一天進場，20 天平均 {_pct(base['avg'])}、勝率 {base['win'] * 100:.0f}%")
    if evs[0].get("regime"):
        foot.append(f"市場環境：{evs[0]['regime']}")
    return title, "\n\n".join(blocks) + ("\n\n" + "\n".join(foot) if foot else "") + "\n\n（過去 5 年統計，不代表未來）"


def market_regime(mkt):
    code = DEFAULT_BENCH[mkt]
    bars = _safe(lambda x: _daily(x, 2), code, [])
    if len(bars) < 210:
        return {"mkt": mkt, "bench": code, "regime": None}
    c = [b["c"] for b in bars]
    ma = sum(c[-200:]) / 200
    chg20 = c[-1] / c[-21] - 1
    up = c[-1] > ma and chg20 > 0
    label = ("多頭平穩" if up else "修正") + f"（{'0050' if mkt == 'tw' else 'SPY'} 距 200 日線 {_pct(c[-1] / ma - 1)}、近 20 日 {_pct(chg20)}）"
    return {"mkt": mkt, "bench": code, "regime": 1 if up else 0, "label": label, "vs_ma200": c[-1] / ma - 1, "chg20": chg20}


def check_strategies(force=False):
    """檢查所有啟用中的策略；force=True 時不管是否開盤（手動「立即檢查」）。"""
    out = []
    mode = config_get().get("notify", {}).get("mode", "both")
    for st in strategies_get():
        if not st.get("enabled") or not (st.get("alert") or st.get("auto_trade")):
            continue
        mkt = st.get("mkt", "tw")
        live = _market_open(mkt)
        if not force and not live:
            continue
        codes = (st.get("universe") or [])[:30]
        need_bench = any(r.get(side, {}).get("k") in S.BENCH_KEYS for g in (st.get("entry"), st.get("exit")) for r in ((g or {}).get("rules") or []) for side in ("a", "b"))
        bench = _safe(lambda x: _live_bars(x)[0], bench_of(st), None) if need_bench else None
        fired = []
        for code in codes:
            try:
                bars, q = _live_bars(code, project=True)
            except Exception as e:
                print("strategy data error:", code, e, file=sys.stderr)
                continue
            if len(bars) < 30:
                continue
            day = datetime.now(TW).strftime("%Y%m%d")
            acc = paper_load()
            pos = acc["positions"].get(code)
            checks = [("exit", st.get("exit"))] if (st.get("auto_trade") and pos) else [("entry", st.get("entry"))]
            if st.get("alert") and not st.get("auto_trade") and (st.get("exit") or {}).get("rules"):
                checks = [("entry", st.get("entry")), ("exit", st.get("exit"))]
            for kind, grp in checks:
                if not (grp or {}).get("rules") or not S.signal_now(bars, grp, bench):
                    continue
                key = (st["id"], code, kind, day)
                if key in _fired:
                    continue
                # 非交易時段手動檢查時，自動交易的策略只回報訊號、不下單，也不記為已觸發，開盤後監控仍會照常下單
                hold = bool(st.get("auto_trade")) and not live
                if not hold:
                    _fired[key] = True
                name = zh_name(code, (q or {}).get("name"))
                price = bars[-1]["c"]
                ev = {"t": int(time.time()), "sid": st["id"], "strategy": st.get("name"), "code": code, "name": name,
                      "kind": kind, "price": price, "detail": S.explain(grp, bars, bench), "mkt": mkt}
                if hold:
                    ev["trade"] = "非交易時段，未下單（開盤後監控會自動判斷）"
                    out.append(ev)
                    continue
                trade_msg = ""
                if st.get("auto_trade"):
                    ccy = ccy_of(code)
                    if kind == "entry" and not pos:
                        budget = acc["cash"][ccy] * float(st.get("size_pct") or 100) / 100 / max(1, len(codes))
                        lots = int(budget / (price * 1000)) if is_tw(code) else 0
                        qty = lots * 1000 if lots >= 1 else int(budget / price)  # 台股夠一張就買整張，不夠買零股
                        if qty > 0:
                            r = paper_order({"code": code, "side": "buy", "type": "market", "qty": qty})
                            trade_msg = f"模擬買進 {qty} 股：{r.get('msg')}"
                    elif kind == "exit" and pos:
                        r = paper_order({"code": code, "side": "sell", "type": "market", "qty": pos["qty"]})
                        trade_msg = f"模擬賣出 {pos['qty']} 股：{r.get('msg')}"
                ev["trade"] = trade_msg
                if kind == "entry":
                    try:
                        stx = _strategy_stats(st)
                        ev["stats"] = {"per": {code: stx["per"].get(code)}, "all": stx["all"], "base": stx["base"]}
                    except Exception as e:
                        print("stats error:", e, file=sys.stderr)
                _event_add({k: v for k, v in ev.items() if k != "q"})
                ev["q"] = q
                fired.append(ev)
                out.append({k: v for k, v in ev.items() if k != "q"})
        # 同一次檢查、同一個策略的訊號合併成一則推播（不洗版）
        if fired and st.get("alert") and mode in ("instant", "both"):
            reg = (_safe(market_regime, mkt, {}) or {}).get("label")
            for kind in ("entry", "exit"):
                evs = [e for e in fired if e["kind"] == kind]
                if evs:
                    for e in evs:
                        e["regime"] = reg
                    title, text = _fmt_signal_push(st, evs)
                    push(title, text, url=app_url(evs[0]["code"]), tags=["chart_with_upwards_trend" if kind == "entry" else "chart_with_downwards_trend"],
                         priority="buy" if kind == "entry" else "sell")
    return out


def daily_summary(mkt, force=False):
    """收盤摘要：今天每個訊號從提醒價到收盤價的變化、大盤漲跌、市場環境。"""
    today = datetime.now(TW).date()
    evs = [e for e in events_get() if e.get("mkt", "tw" if is_tw(e["code"]) else "us") == mkt
           and datetime.fromtimestamp(e["t"], TW).date() >= today - timedelta(days=0 if mkt == "tw" else 1)
           and (mkt == "tw" or e["t"] > time.time() - 18 * 3600)]
    if not evs and not force:
        return None
    qs = quotes(list({e["code"] for e in evs} | {DEFAULT_BENCH[mkt]}))
    bq = qs.get(DEFAULT_BENCH[mkt]) or {}
    bchg = (bq["price"] / bq["prev"] - 1) if bq.get("price") and bq.get("prev") else None
    lines = []
    for e in sorted(evs, key=lambda e: e["t"]):
        q = qs.get(e["code"]) or {}
        now = q.get("price")
        d = (now / e["price"] - 1) if now and e.get("price") else None
        tag = "進場" if e["kind"] == "entry" else "出場"
        lines.append(f"・{tag}　**{e['name']} {e['code'].replace('US.', '')}**　{e['price']:,} → {f'{now:,}' if now is not None else '-'}（{_pct(d)}）　{e['strategy']}")
    reg = (_safe(market_regime, mkt, {}) or {}).get("label")
    title = f"🌙 {'台股' if mkt == 'tw' else '美股'}收盤摘要：{len(evs)} 則訊號"
    text = ("\n".join(lines) if lines else "今天沒有觸發任何策略。") + \
        f"\n\n{'0050' if mkt == 'tw' else 'SPY'} 今日 {_pct(bchg, 2)}" + (f"\n市場環境：{reg}" if reg else "")
    return push(title, text, url=app_url(view="strategy"), tags=["crescent_moon"])


_summary_sent = {}


def _maybe_summary():
    mode = config_get().get("notify", {}).get("mode", "both")
    if mode not in ("summary", "both"):
        return
    now_tw = datetime.now(TW)
    if now_tw.weekday() < 5 and (now_tw.hour, now_tw.minute) >= (13, 40) and now_tw.hour < 18:
        k = ("tw", now_tw.strftime("%Y%m%d"))
        if k not in _summary_sent:
            _summary_sent[k] = True
            daily_summary("tw")
    nu = datetime.now(timezone.utc)
    ny = nu + timedelta(hours=-4 if _us_dst(nu.replace(tzinfo=None)) else -5)
    if ny.weekday() < 5 and (ny.hour, ny.minute) >= (16, 10) and ny.hour < 20:
        k = ("us", ny.strftime("%Y%m%d"))
        if k not in _summary_sent:
            _summary_sent[k] = True
            daily_summary("us")


def strategy_monitor():
    while True:
        time.sleep(60)
        try:
            check_strategies()
        except Exception as e:
            print("strategy monitor error:", e, file=sys.stderr)
        try:
            _maybe_summary()
        except Exception as e:
            print("summary error:", e, file=sys.stderr)


# ---------------- AI 選股與 AI 模擬倉 ----------------
import picker as PK  # noqa: E402

AI_FILE = os.path.join(DATA_DIR, "ai.json")          # AI 狀態：設定、上次調倉
RESEARCH_FILE = os.path.join(DATA_DIR, "ai_research.json")  # tools/pick_research.py 的研究結果
AI_UNIVERSE = {"tw": 150, "us": 100}
AI_FALLBACK = {"strat": "composite", "top": 10, "rebal": 5, "stop": 10, "regime": True}
_ai_lock = threading.RLock()


def ai_universe(mkt):
    """股票池：台股市值前 150 檔（不含 ETF）、美股市值前 100 檔。"""
    if mkt == "tw":
        rows = [r for r in tw_snapshot() if r.get("mcap") and r.get("industry") not in ("ETF", "存託憑證") and not r["code"].startswith("00")]
    else:
        rows = [r for r in us_snapshot() if r.get("mcap") and "." not in r["code"][3:] and "-" not in r["code"][3:]]
    rows.sort(key=lambda r: -r["mcap"])
    return [r["code"] for r in rows[:AI_UNIVERSE[mkt]]]


def ai_research():
    try:
        with open(RESEARCH_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def ai_state():
    try:
        with open(AI_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def ai_state_save(st):
    tmp = AI_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, AI_FILE)


def ai_state_reset():
    with _ai_lock:
        st = ai_state()
        for m in ("tw", "us"):
            st.setdefault(m, {}).update(last_rebal=None, days=0, seen=None)
        ai_state_save(st)


def ai_cfg(mkt):
    """目前使用的策略：使用者有指定就用指定的，否則用研究結果第一名。"""
    st = ai_state().get(mkt, {})
    cfg = st.get("cfg") or (ai_research().get(mkt) or {}).get("best") or AI_FALLBACK
    return {k: cfg[k] for k in ("strat", "top", "rebal", "stop", "regime") if k in cfg}


def ai_enabled(mkt):
    return ai_state().get(mkt, {}).get("enabled", True)


def ai_config_set(body):
    mkt = body.get("mkt", "tw")
    with _ai_lock:
        st = ai_state(); m = st.setdefault(mkt, {})
        if "enabled" in body:
            m["enabled"] = bool(body["enabled"])
        if body.get("cfg") == "auto":
            m.pop("cfg", None)
        elif isinstance(body.get("cfg"), dict) and body["cfg"].get("strat") in PK.STRATS:
            m["cfg"] = {k: body["cfg"][k] for k in ("strat", "top", "rebal", "stop", "regime") if k in body["cfg"]}
        ai_state_save(st)
    return {"ok": True, "msg": "已儲存", "cfg": ai_cfg(mkt), "enabled": ai_enabled(mkt)}


def _completed(bars, mkt):
    """盤中最後一根是今天還沒收完的K棒，打分數只用收完的。"""
    if bars and _market_open(mkt):
        tz = TW if mkt == "tw" else timezone(timedelta(hours=-4 if _us_dst_now() else -5))
        today = datetime.now(tz).date()
        if datetime.fromtimestamp(bars[-1]["t"], tz).date() == today:
            return bars[:-1]
    return bars


def ai_compute(mkt):
    """抓股票池日K、算因子、依目前策略排名。結果快取 20 分鐘。"""
    def load():
        codes = ai_universe(mkt)
        from concurrent.futures import ThreadPoolExecutor

        def one(c):
            try:
                return c, _completed(_daily(c, 2), mkt)
            except Exception:
                return c, None
        with ThreadPoolExecutor(6) as ex:
            data = {c: b for c, b in ex.map(one, codes) if b and len(b) > 260}
        bench = _completed(_daily(DEFAULT_BENCH[mkt], 2), mkt)
        feats = {c: PK.features(b)[-1] for c, b in data.items()}
        last_t = max((b[-1]["t"] for b in data.values()), default=0)
        feats = {c: f for c, f in feats.items() if f and data[c][-1]["t"] >= last_t - 5 * 86400}  # 停牌太久的不選
        bc = [b["c"] for b in bench]
        ma200 = sum(bc[-200:]) / 200 if len(bc) >= 200 else None
        return {"feats": feats, "asof": bench[-1]["t"] if bench else last_t, "risk_off": bool(ma200 and bc[-1] < ma200),
                "bench_px": bc[-1] if bc else None, "bench_ma200": ma200, "n": len(data)}
    return cached("ai:" + mkt, 1200, load)


def ai_picks_api(mkt, refresh=False):
    if refresh:
        _cache.pop("ai:" + mkt, None)
    try:
        d = ai_compute(mkt)
    except Exception as e:
        return {"ok": False, "msg": f"計算失敗：{e}"}
    cfg = ai_cfg(mkt)
    ranked = PK.pick(d["feats"], cfg["strat"], 0)
    top = cfg["top"]
    rows = [{"code": c, "name": zh_name(c, None), "score": sc, "rank": i + 1, "price": d["feats"][c]["c"], "reason": PK.reasons(d["feats"][c]),
             "r20": d["feats"][c]["r20"] * 100, "r120": d["feats"][c]["r120"] * 100} for i, (c, sc) in enumerate(ranked[:max(20, top * 2)])]
    st = ai_state().get(mkt, {})
    return {"ok": True, "mkt": mkt, "asof": d["asof"], "cfg": cfg, "strat_name": PK.STRATS[cfg["strat"]]["name"], "strat_desc": PK.STRATS[cfg["strat"]]["desc"],
            "risk_off": d["risk_off"] and cfg.get("regime"), "bench_px": d["bench_px"], "bench_ma200": d["bench_ma200"], "universe": d["n"],
            "rows": rows, "enabled": ai_enabled(mkt), "auto": not st.get("cfg"), "last_rebal": st.get("last_rebal"), "days": st.get("days", 0),
            "log": [x for x in paper_load("ai").get("log", []) if x.get("mkt") == mkt][:50]}


def _ai_log(acc, mkt, msg):
    acc.setdefault("log", []).insert(0, {"t": int(time.time()), "mkt": mkt, "msg": msg})
    acc["log"] = acc["log"][:300]


def ai_run(mkt, force=False):
    """AI 模擬倉：開盤中每分鐘檢查。新交易日且到了調倉日就換股；持股跌破停損就賣。"""
    if not force and not ai_enabled(mkt):
        return {"ok": False, "msg": "AI 模擬倉已暫停"}
    if not _market_open(mkt):
        return {"ok": False, "msg": "目前不是交易時段，開盤後 AI 會自動調倉"}
    cfg = ai_cfg(mkt); ccy = "TWD" if mkt == "tw" else "USD"
    d = ai_compute(mkt)
    sig = time.strftime("%Y-%m-%d", time.gmtime(d["asof"] + (8 * 3600 if mkt == "tw" else 0)))
    msgs = []
    with _ai_lock:
        st = ai_state(); ms = st.setdefault(mkt, {})
        acc = paper_load("ai")
        held = {c: p for c, p in acc["positions"].items() if p["ccy"] == ccy and not c.startswith("OPT.")}
        qs = quotes(list(held)) if held else {}
        # 1) 停損
        stop = (cfg.get("stop") or 0) / 100
        for c, p in list(held.items()):
            q = qs.get(c) or {}
            avg = p["cost"] / p["qty"] if p["qty"] else 0
            if stop and q.get("price") and avg and q["price"] <= avg * (1 - stop):
                r = paper_order({"code": c, "side": "sell", "type": "market", "qty": p["qty"], "note": f"停損：跌破成本 {cfg['stop']}%"}, "ai")
                msgs.append(f"停損賣出 {zh_name(c, None)} {p['qty']} 股：{r.get('msg')}")
                held.pop(c, None)
        # 2) 調倉日判斷：每個新的交易日計數 +1，到了 rebal 天數（或第一次、或強制）就換股
        new_day = ms.get("seen") != sig
        if new_day:
            ms["seen"] = sig; ms["days"] = ms.get("days", 0) + 1
        due = force or not ms.get("last_rebal") or (new_day and ms["days"] >= cfg["rebal"])
        if due:
            ranked = PK.pick(d["feats"], cfg["strat"], 0)
            top = cfg["top"]
            if cfg.get("regime") and d["risk_off"]:
                target, why_out = [], "大盤跌破 200 日均線，全部出場空手"
            else:
                keep = {c for c, _ in ranked[:top * 2]}
                hold = [c for c in held if c in keep][:top]
                target = hold + [c for c, _ in ranked if c not in hold][:top - len(hold)]
                why_out = f"跌出前 {top * 2} 名"
            rank_of = {c: i + 1 for i, (c, _) in enumerate(ranked)}
            for c, p in list(held.items()):
                if c not in target:
                    r = paper_order({"code": c, "side": "sell", "type": "market", "qty": p["qty"], "note": f"{why_out}（目前第 {rank_of.get(c, '-')} 名）"}, "ai")
                    msgs.append(f"賣出 {zh_name(c, None)}：{r.get('msg')}")
            acc = paper_load("ai")
            held = {c: p for c, p in acc["positions"].items() if p["ccy"] == ccy}
            new = [c for c in target if c not in held]
            if new:
                qs = quotes(list(set(new) | set(held)))
                value = acc["cash"][ccy] + sum(p["qty"] * (qs.get(c) or {}).get("price", 0) for c, p in held.items())
                slot = value / top
                for c in new:
                    px = (qs.get(c) or {}).get("price")
                    if not px:
                        continue
                    budget = min(slot, paper_load("ai")["cash"][ccy] * 0.995)
                    if mkt == "tw":
                        lots = int(budget / (px * 1000 * 1.002))
                        qty = lots * 1000 if lots >= 1 else int(budget / (px * 1.002))
                    else:
                        qty = int(budget / px)
                    if qty <= 0:
                        continue
                    f = d["feats"].get(c)
                    note = f"{PK.STRATS[cfg['strat']]['name']} 第 {rank_of.get(c)} 名：" + (PK.reasons(f) if f else "")
                    r = paper_order({"code": c, "side": "buy", "type": "market", "qty": qty, "note": note}, "ai")
                    msgs.append(f"買進 {zh_name(c, None)} {qty} 股：{r.get('msg')}")
            ms["last_rebal"] = sig; ms["days"] = 0
            if not msgs:
                msgs.append("調倉檢查：持股不變")
        ai_state_save(st)
        if msgs:
            acc = paper_load("ai")
            for m in msgs:
                _ai_log(acc, mkt, m)
            paper_save(acc, "ai")
    return {"ok": True, "msg": "；".join(msgs) or "沒有需要調整的部位"}


_research = {"running": False, "msg": ""}


def ai_research_run(which="all"):
    """背景重新跑策略研究（約 3～5 分鐘）。"""
    if _research["running"]:
        return {"ok": False, "msg": "研究正在進行中"}

    def go():
        _research.update(running=True, msg="研究中…")
        try:
            sys.path.insert(0, os.path.join(ROOT, "tools"))
            import pick_research
            pick_research.run_all(which)
            _research["msg"] = "研究完成"
            for m in ("tw", "us"):
                _cache.pop("ai:" + m, None)
        except Exception as e:
            _research["msg"] = f"研究失敗：{e}"
        finally:
            _research["running"] = False
    threading.Thread(target=go, daemon=True).start()
    return {"ok": True, "msg": "開始重新研究，約需 3～5 分鐘"}


def ai_trader():
    time.sleep(30)
    while True:
        try:  # 研究結果超過 7 天就自動重跑（週末市場關閉時跑最剛好，但沒跑過也會補）
            r = ai_research()
            if not _research["running"] and (not r or time.time() - min((r.get(m) or {}).get("updated", 0) for m in ("tw", "us")) > 7 * 86400):
                ai_research_run()
        except Exception as e:
            print("ai research error:", e, file=sys.stderr)
        for mkt in ("tw", "us"):
            try:
                if ai_enabled(mkt) and _market_open(mkt):
                    ai_run(mkt)
            except Exception as e:
                print("ai trader error:", mkt, e, file=sys.stderr)
        time.sleep(60)


# ---------------- 市場快照（選股、熱力圖） ----------------
TW_INDUSTRY = {"01": "水泥", "02": "食品", "03": "塑膠", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙",
               "10": "鋼鐵", "11": "橡膠", "12": "汽車", "14": "建材營造", "15": "航運", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨",
               "20": "其他", "21": "化學", "22": "生技醫療", "23": "油電燃氣", "24": "半導體", "25": "電腦週邊", "26": "光電", "27": "通信網路",
               "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子", "32": "文化創意", "33": "農業科技", "34": "電子商務",
               "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活", "80": "管理股票", "91": "存託憑證"}


def tw_snapshot():
    def load():
        rows = {}
        for r in _safe(lambda u: _open_data(u, 1800), "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", []):
            c = r.get("Code", "")
            if STOCK_RE.match(c):
                rows[c] = {"code": c, "name": r.get("Name"), "mkt": "tse", "price": _num(r.get("ClosingPrice")),
                           "chg": _num(r.get("Change")), "volume": (_num(r.get("TradeVolume")) or 0) / 1000}
        for r in _safe(lambda u: _open_data(u, 1800), "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", []):
            c = r.get("SecuritiesCompanyCode", "")
            if STOCK_RE.match(c):
                rows[c] = {"code": c, "name": r.get("CompanyName"), "mkt": "otc", "price": _num(r.get("Close")),
                           "chg": _num(str(r.get("Change") or "").strip()), "volume": (_num(r.get("TradingShares")) or 0) / 1000}
        for r in _safe(_open_data, "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL", []):
            x = rows.get(r.get("Code"))
            if x:
                x.update(pe=_num(r.get("PEratio")), yld=_num(r.get("DividendYield")), pb=_num(r.get("PBratio")))
        for r in _safe(_open_data, "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis", []):
            x = rows.get(r.get("SecuritiesCompanyCode"))
            if x:
                x.update(pe=_num(r.get("PriceEarningRatio")), yld=_num(r.get("YieldRatio")), pb=_num(r.get("PriceBookRatio")))
        for r in _safe(_open_data, "https://openapi.twse.com.tw/v1/opendata/t187ap03_L", []):
            x = rows.get(str(r.get("公司代號")).strip())
            if x:
                x.update(industry=TW_INDUSTRY.get(r.get("產業別"), "其他"), shares=_num(r.get("已發行普通股數或TDR原股發行股數")))
        for r in _safe(_open_data, "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", []):
            x = rows.get(str(r.get("SecuritiesCompanyCode")).strip())
            if x:
                x.update(industry=TW_INDUSTRY.get(r.get("SecuritiesIndustryCode"), "其他"), shares=_num(r.get("IssueShares")))
        for x in rows.values():
            if x["code"].startswith("00"):
                x["industry"] = "ETF"
            x.setdefault("industry", "其他")
            p, c = x.get("price"), x.get("chg")
            x["pct"] = c / (p - c) * 100 if p and c is not None and p - c else 0
            x["mcap"] = (x.get("shares") or 0) * (p or 0)
        return list(rows.values())
    return cached("twsnap", 1800, load)


def us_snapshot():
    def load():
        d = fetch_json("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true", 30)
        out = []
        for r in (d.get("data") or {}).get("rows") or []:
            sym = r.get("symbol", "")
            if not sym or "^" in sym or "/" in sym:
                continue
            mcap = _num(r.get("marketCap")) or 0
            out.append({"code": "US." + sym.strip(), "name": r.get("name"), "mkt": "us", "price": _num(str(r.get("lastsale", "")).replace("$", "")),
                        "chg": _num(r.get("netchange")), "pct": _num(str(r.get("pctchange", "")).replace("%", "")) or 0,
                        "volume": _num(r.get("volume")) or 0, "mcap": mcap, "industry": r.get("sector") or "Other", "sub": r.get("industry")})
        return out
    return cached("ussnap", 120, load)


US_SECTOR_ZH = {"Technology": "科技", "Health Care": "醫療保健", "Finance": "金融", "Consumer Discretionary": "非必需消費", "Industrials": "工業",
                "Energy": "能源", "Utilities": "公用事業", "Real Estate": "房地產", "Basic Materials": "原物料", "Consumer Staples": "必需消費",
                "Telecommunications": "通訊", "Miscellaneous": "其他", "Other": "其他"}


def heatmap(mkt):
    if mkt == "us":
        rows = sorted((r for r in us_snapshot() if r["mcap"] > 0), key=lambda r: -r["mcap"])[:300]
        for r in rows:
            r["industryZh"] = US_SECTOR_ZH.get(r["industry"], r["industry"])
        return {"mkt": "us", "rows": rows, "live": True, "updated": int(time.time())}
    rows = sorted((r for r in tw_snapshot() if r.get("mcap") and r["industry"] not in ("ETF", "存託憑證")), key=lambda r: -r["mcap"])[:250]
    rows = [dict(r) for r in rows]

    def live():
        return quotes([r["code"] for r in rows])
    qs = cached("hm:twq", 30, live)
    for r in rows:
        q = qs.get(r["code"])
        if q and q.get("price") and q.get("prev"):
            r["price"], r["pct"] = q["price"], (q["price"] - q["prev"]) / q["prev"] * 100
            r["mcap"] = (r.get("shares") or 0) * q["price"]
        r["industryZh"] = r["industry"]
    return {"mkt": "tw", "rows": rows, "live": bool(qs), "updated": int(time.time())}


def screener(body):
    mkt = body.get("mkt", "tw")
    f = body.get("filters") or {}
    rows = us_snapshot() if mkt == "us" else tw_snapshot()

    def ok(r):
        def rng(key, lo, hi):
            v = r.get(key)
            if f.get(lo) not in (None, "") and (v is None or v < float(f[lo])):
                return False
            if f.get(hi) not in (None, "") and (v is None or v > float(f[hi])):
                return False
            return True
        if not (rng("price", "price_min", "price_max") and rng("pct", "pct_min", "pct_max") and rng("volume", "vol_min", "vol_max")
                and rng("pe", "pe_min", "pe_max") and rng("yld", "yld_min", "yld_max") and rng("pb", "pb_min", "pb_max")):
            return False
        if f.get("mcap_min") not in (None, "") and (r.get("mcap") or 0) < float(f["mcap_min"]) * (1e8 if mkt == "tw" else 1e9):
            return False
        if f.get("industries") and r.get("industry") not in f["industries"]:
            return False
        if f.get("no_etf") and (r.get("industry") == "ETF"):
            return False
        return True
    cand = [r for r in rows if ok(r)]
    sort = body.get("sort") or "volume"
    cand.sort(key=lambda r: -(r.get(sort) or 0))
    tech = body.get("tech") or {}
    total = len(cand)
    if not (tech.get("rules")):
        return {"rows": cand[:300], "total": total, "scanned": 0}
    limit = min(int(body.get("limit") or 80), 150)
    pool = cand[:limit]
    results = []
    for r, bars in zip(pool, POOL.map(lambda c: _safe(lambda x: _daily(x, 1), c["code"], []), pool)):
        if len(bars) > 30 and S.signal_now(bars, tech):
            results.append(dict(r, detail=S.explain(tech, bars)))
    return {"rows": results, "total": total, "scanned": len(pool)}


# ---------------- HTTP ----------------
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json",
                      ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(ROOT, "web"), **kw)

    def _authorized(self):
        if not PASSWORD:
            return True
        ip = self.client_address[0]
        # 本機直接連線免密碼；經由 tailscale serve 等反向代理進來的請求會帶 X-Forwarded-For，仍要密碼
        if ip in ("127.0.0.1", "::1") and not self.headers.get("X-Forwarded-For"):
            return True
        h = self.headers.get("Authorization", "")
        if h.startswith("Basic "):
            try:
                _, pw = base64.b64decode(h[6:]).decode("utf-8").split(":", 1)
                return hmac.compare_digest(pw, PASSWORD)
            except Exception:
                return False
        return False

    def _deny(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="nightmarket", charset="UTF-8"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._authorized():
            return self._deny()
        u = urllib.parse.urlparse(self.path)
        if u.path in ("/sw.js",):  # service worker 不快取
            self.send_response(200)
            body = open(os.path.join(ROOT, "web", "sw.js"), "rb").read()
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        codes = [c for c in q.get("codes", "").split(",") if c][:200]
        try:
            if u.path == "/api/ping":
                self.send_json({"app": "nightmarket"})
            elif u.path == "/api/list":
                self.send_json(list(stock_list().values()))
            elif u.path == "/api/quote":
                self.send_json(quotes(codes))
            elif u.path == "/api/kline":
                self.send_json(kline(q["code"], q.get("interval", "1d"), q.get("range", "1y"), q.get("ext") == "1"))
            elif u.path == "/api/spark":
                self.send_json(sparks(codes))
            elif u.path == "/api/inst":
                self.send_json(institutional(q["code"], int(q.get("days", "10"))))
            elif u.path == "/api/search":
                self.send_json(us_search(q.get("q", "")))
            elif u.path == "/api/rank":
                if q.get("mkt") == "us":
                    self.send_json(us_rank())
                else:
                    self.send_json(tw_rank(q.get("etf", "1") == "1"))
            elif u.path == "/api/options":
                und = q.get("u", "TXO")
                self.send_json(tw_options(q.get("exp")) if und == "TXO" else us_options(und, q.get("exp")))
            elif u.path == "/api/futures":
                self.send_json(tw_futures())
            elif u.path == "/api/strategies":
                self.send_json(strategies_get())
            elif u.path == "/api/strategy/events":
                self.send_json(events_get(int(q.get("since") or 0)))
            elif u.path == "/api/strategy/operands":
                self.send_json({"operands": S.OPERANDS, "ops": S.OPS})
            elif u.path == "/api/config/notify":
                self.send_json(config_public())
            elif u.path == "/api/config/alpaca":
                self.send_json(config_alpaca_public())
            elif u.path == "/api/overnight":
                self.send_json(alpaca_night_bars(q["code"], q["start"], q["end"]))
            elif u.path == "/api/heatmap":
                self.send_json(heatmap(q.get("mkt", "tw")))
            elif u.path == "/api/calweek":
                self.send_json(cal_week(q["start"], q.get("mkt", "tw")))
            elif u.path == "/api/info":
                self.send_json(stock_info(q["code"], q.get("tr") == "1"))
            elif u.path == "/api/regime":
                self.send_json(market_regime(q.get("mkt", "tw")))
            elif u.path == "/api/news":
                n = news(q.get("code"))
                self.send_json(add_translation(n) if q.get("tr") == "1" and q.get("code") and not is_tw(q["code"]) else n)
            elif u.path == "/api/calendar":
                self.send_json(calendar(q.get("date") or datetime.now(TW).strftime("%Y-%m-%d")))
            elif u.path == "/api/paper":
                with _paper_lock:
                    self.send_json(paper_load(q.get("acct", "me")))
            elif u.path == "/api/ai/picks":
                self.send_json(ai_picks_api(q.get("mkt", "tw"), q.get("refresh") == "1"))
            elif u.path == "/api/ai/research":
                self.send_json({**ai_research(), "status": _research})
            else:
                self.send_json({"error": "not found"}, 404)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        if not self._authorized():
            return self._deny()
        u = urllib.parse.urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if u.path == "/api/strategies":
                self.send_json(strategy_upsert(body))
            elif u.path == "/api/strategies/delete":
                self.send_json(strategy_delete(body.get("id")))
            elif u.path == "/api/backtest":
                self.send_json(run_backtest(body))
            elif u.path == "/api/strategy/check":
                self.send_json({"events": check_strategies(force=True)})
            elif u.path == "/api/screener":
                self.send_json(screener(body))
            elif u.path == "/api/config/notify":
                self.send_json(config_set_notify(body))
            elif u.path == "/api/config/alpaca":
                self.send_json(config_set_alpaca(body))
            elif u.path == "/api/notify/test":
                r = push("測試推播", "NightMarket：推播設定成功 ✅", only=body.get("channel"))
                self.send_json({"ok": bool(r) and all(v == "ok" for v in r.values()), "result": r or {"-": "沒有啟用中的管道"}})
            elif u.path == "/api/notify/summary":
                self.send_json({"result": daily_summary(body.get("mkt", "tw"), force=True) or {}})
            elif u.path == "/api/notify/send":
                self.send_json({"result": push(body.get("title") or "提醒", body.get("text") or "")})
            elif u.path == "/api/paper/order":
                if body.get("acct") == "ai":
                    self.send_json({"ok": False, "msg": "AI 模擬倉只由 AI 自己下單"})
                else:
                    self.send_json(paper_order(body))
            elif u.path == "/api/paper/cancel":
                self.send_json(paper_cancel(body.get("id"), body.get("acct", "me")))
            elif u.path == "/api/ai/config":
                self.send_json(ai_config_set(body))
            elif u.path == "/api/ai/research/run":
                self.send_json(ai_research_run(body.get("mkt", "all")))
            elif u.path == "/api/ai/run":
                self.send_json(ai_run(body.get("mkt", "tw"), force=True))
            elif u.path == "/api/paper/reset":
                cash = {"TWD": float(body.get("TWD") or DEFAULT_CASH["TWD"]), "USD": float(body.get("USD") or DEFAULT_CASH["USD"])}
                with _paper_lock:
                    acct = body.get("acct", "me")
                    paper_save(paper_new(cash), acct)
                    if acct == "ai":
                        ai_state_reset()
                self.send_json({"ok": True, "msg": "模擬帳戶已重設"})
            else:
                self.send_json({"error": "not found"}, 404)
        except Exception as e:
            self.send_json({"ok": False, "msg": str(e)}, 500)


def start(port=PORT, host=None):
    os.makedirs(DATA_DIR, exist_ok=True)
    threading.Thread(target=stock_list, daemon=True).start()
    threading.Thread(target=paper_matcher, daemon=True).start()
    threading.Thread(target=strategy_monitor, daemon=True).start()
    threading.Thread(target=ai_trader, daemon=True).start()
    srv = ThreadingHTTPServer((host or HOST, port), Handler)
    return srv


def _lan_ips():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


if __name__ == "__main__":
    import argparse
    import socket
    ap = argparse.ArgumentParser(description="NightMarket 後端")
    ap.add_argument("--host", default=HOST, help="監聽位址，預設 127.0.0.1（只有本機）；0.0.0.0 讓同網路裝置連線")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--password", default=PASSWORD, help="非本機連線需要的密碼（建議 --host 0.0.0.0 時設定）")
    args = ap.parse_args()
    PASSWORD = args.password
    srv = start(args.port, args.host)
    print(f"看盤已啟動: http://localhost:{args.port}")
    if args.host not in ("127.0.0.1", "localhost"):
        for ip in _lan_ips():
            print(f"  其他裝置可連: http://{ip}:{args.port}")
        if not PASSWORD:
            print("  ⚠ 沒有設定密碼，同網路的人都連得到。建議加上 --password 你的密碼")
    srv.serve_forever()
