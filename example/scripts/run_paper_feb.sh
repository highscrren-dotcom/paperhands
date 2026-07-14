#!/usr/bin/env bash
# Супервизор multi-day paper feb_2026 (BTC news-sentiment): рестарт при падении.
# Урок 2026-07-06/08: необработанный ccxt RequestTimeout убивает процесс —
# ядро не ретраит, чинить src/** нельзя (форк ребейзабельный) → шелл-супервизор.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
while true; do
  # --noFlush: рестарт НЕ должен стирать накопленные paper-артефакты dump/
  # (урок 2026-07-08: флаш при перезапуске уничтожил статистику 8.5ч прогона)
  # --ui ОБЯЗАТЕЛЕН: свечной таймер движка unref'нут (build/index.mjs
  # «Do not keep the process alive just for the candle clock») — headless-paper
  # штатно выходит с кодом 0 через ~30с, только UI/telegram держат процесс
  # (вскрыто 2026-07-14 после 3941 «рестарта»). Порт 60052: 60050 занят live-ботом.
  CC_WWWROOT_PORT=60052 node ./node_modules/@backtest-kit/cli/build/index.mjs --paper --noFlush --ui --symbol BTCUSDT \
    ./content/feb_2026.strategy/feb_2026.strategy.ts >> logs/paper-feb2026.log 2>&1
  echo "[supervisor] paper упал ($(date -Is)), рестарт через 60с" >> logs/paper-feb2026.log
  sleep 60
done
