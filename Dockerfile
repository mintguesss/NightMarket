# 個人使用的容器版（請不要架成公開服務，並務必設定密碼）
# 建置：docker build -t tw-us-viewer .
# 執行：docker run -d -p 8765:8765 -e TWSTOCK_PASSWORD=你的密碼 -v tw-us-data:/data tw-us-viewer
FROM python:3.12-slim
WORKDIR /app
COPY server.py strategy.py ./
COPY web ./web
ENV HOST=0.0.0.0 PORT=8765 TWSTOCK_DATA=/data PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8765
CMD ["python", "server.py"]
