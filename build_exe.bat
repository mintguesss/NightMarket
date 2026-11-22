@echo off
rem 打包成單一 Windows 執行檔：dist\NightMarket.exe
rem 需要先安裝 PyInstaller：py -m pip install pyinstaller
cd /d "%~dp0"
py -m PyInstaller --version >nul 2>&1 || (echo 請先執行：py -m pip install pyinstaller & exit /b 1)
py tools\gen_icons.py
py -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name NightMarket ^
  --icon web\icons\app.ico ^
  --add-data "web;web" ^
  --add-data "tools\pick_research.py;tools" ^
  --hidden-import server --hidden-import strategy --hidden-import picker ^
  launcher.pyw
echo.
echo 完成：dist\NightMarket.exe （模擬倉資料存在 %%LOCALAPPDATA%%\NightMarket）
