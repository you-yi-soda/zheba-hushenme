FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 ORT_THREADS=2 REQUIRE_WECHAT_ID=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --only-binary=:all: --timeout 120 --retries 5 -r requirements.txt
COPY . .
RUN useradd --create-home mahjong && chown -R mahjong:mahjong /app
USER mahjong
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "4", "--timeout", "60", "--error-logfile", "-", "wsgi:app"]
