"""桌面版啟動器：在背景啟動後端，並用 Edge 的 App 模式開一個獨立視窗（沒有網址列/分頁）。
關掉視窗後，後端會一起結束。雙擊 start.bat 或執行 `pyw launcher.pyw`。
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BASE_PORT = int(os.environ.get("PORT", "8765"))
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", HERE), "NightMarket", "edge-profile")


def port_in_use(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def is_ours(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1.5) as r:
            return json.loads(r.read()).get("app") == "nightmarket"
    except Exception:
        return False


def pick_port():
    """回傳 (port, 已經在跑嗎)。埠被別的程式佔用時往後找空的。"""
    for port in range(BASE_PORT, BASE_PORT + 30):
        if not port_in_use(port):
            return port, False
        if is_ours(port):
            return port, True
    raise RuntimeError("找不到可用的連接埠")


def find_edge():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if base:
            p = os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe")
            if os.path.exists(p):
                return p
    return None


def main():
    port, running = pick_port()
    url = f"http://localhost:{port}"
    if not running:
        import server
        srv = server.start(port)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        for _ in range(50):
            if port_in_use(port):
                break
            time.sleep(0.1)
    edge = find_edge()
    if not edge:
        webbrowser.open(url)
        while True:  # 沒有 Edge 時改用預設瀏覽器，後端持續執行
            time.sleep(3600)
    os.makedirs(PROFILE, exist_ok=True)
    # 用獨立的使用者資料夾，Edge 會開成自己的行程；視窗關閉時 run() 才會返回
    subprocess.run([edge, f"--app={url}", f"--user-data-dir={PROFILE}", "--window-size=1680,980",
                    "--no-first-run", "--disable-features=Translate"])


if __name__ == "__main__":
    main()
