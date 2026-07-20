# Рантайм paper-движка + крон-контейнера (Coolify). Собирается только example/
# (движок = npm-пакеты @backtest-kit/*, монорепу билдить не нужно).
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl bash procps \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/supercronic \
      https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
 && chmod +x /usr/local/bin/supercronic

WORKDIR /app

COPY example/package.json example/package-lock.json ./example/
# mongoose --no-save: скрипты (news_mongo_sync, forward/shadow) на ноуте брали его
# из соседней репы через INGEST_PKG; в контейнере соседа нет — кладём локально,
# package.json не трогаем (форк держим чистым).
RUN cd example && npm ci --no-audit --no-fund && npm i --no-save --no-audit --no-fund mongoose@8.23.0

COPY . .

ENV TZ=Asia/Yekaterinburg

# Супервизор-обёртка: рестарт при падении, --noFlush, --ui (см. комменты в скрипте)
CMD ["bash", "example/scripts/run_paper_feb.sh"]
