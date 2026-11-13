#!/data/data/com.termux/files/usr/bin/bash
# 在 Android 手機上直接執行（不需要電腦）
# 1. 從 F-Droid 或 GitHub 安裝 Termux
# 2. 在 Termux 執行：pkg install -y git python && git clone https://github.com/mintguesss/NightMarket.git && cd NightMarket && bash deploy/run-android.sh
# 3. 用手機的 Chrome 打開 http://localhost:8765 ，選單「加入主畫面」就會像 App 一樣開啟
set -e
cd "$(dirname "$0")/.."
command -v python >/dev/null 2>&1 || pkg install -y python
# 防止手機休眠時 Termux 被系統暫停（需要 Termux:API 時可略過錯誤）
termux-wake-lock 2>/dev/null || true
echo "看盤已啟動，請用手機瀏覽器開啟：http://localhost:8765"
echo "（要停止請按 Ctrl+C，或下拉通知列結束 Termux）"
exec python server.py
