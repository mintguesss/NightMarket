"""不需要網路的基本檢查：策略引擎回測合成資料、伺服器能啟動並回應。執行：python tools/smoke_test.py"""
import json
import math
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
import strategy  # noqa: E402


def synthetic_bars(n=400):
    bars, t0 = [], 1_600_000_000
    for i in range(n):
        c = 100 + 20 * math.sin(i / 25) + i * 0.05
        bars.append({"t": t0 + i * 86400, "o": c - 0.5, "h": c + 1, "l": c - 1, "c": c, "v": 1000 + i})
    return bars


def test_backtest():
    strat = {
        "name": "smoke", "mkt": "us",
        "entry": {"mode": "all", "rules": [{"a": {"k": "ma", "n": 5}, "op": "cross_up", "b": {"k": "ma", "n": 20}}]},
        "exit": {"mode": "any", "rules": [{"a": {"k": "ma", "n": 5}, "op": "cross_down", "b": {"k": "ma", "n": 20}}]},
        "stop_loss": 10, "take_profit": 0, "size_pct": 100,
    }
    r = strategy.backtest(strat, {"TEST": synthetic_bars()}, 100_000)
    assert "error" not in r, r
    assert r["equity"], "沒有權益曲線"
    print("backtest ok:", json.dumps(r.get("metrics", {}), ensure_ascii=False)[:160])


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.read().decode("utf-8")


def test_server():
    port = free_port()
    env = dict(os.environ, TWSTOCK_DATA=tempfile.mkdtemp())
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py"), "--port", str(port)],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(60):
            if p.poll() is not None:
                raise SystemExit("server exited:\n" + p.stderr.read().decode("utf-8", "replace"))
            try:
                assert json.loads(get(base + "/api/ping"))["app"] == "nightmarket"
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise SystemExit("server did not start")
        assert "NightMarket" in get(base + "/")
        assert json.loads(get(base + "/api/strategy/operands"))
        print("server ok on port", port)
    finally:
        p.terminate()
        p.wait(10)


if __name__ == "__main__":
    test_backtest()
    test_server()
    print("all passed")
