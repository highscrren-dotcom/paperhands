#!/usr/bin/env bash
# Супервизор multi-day paper feb_2026 (BTC news-sentiment): рестарт при падении.
# Урок 2026-07-06/08: необработанный ccxt RequestTimeout убивает процесс —
# ядро не ретраит, чинить src/** нельзя (форк ребейзабельный) → шелл-супервизор.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
while true; do
  node ./node_modules/@backtest-kit/cli/build/index.mjs --paper --symbol BTCUSDT \
    ./content/feb_2026.strategy/feb_2026.strategy.ts >> logs/paper-feb2026.log 2>&1
  echo "[supervisor] paper упал ($(date -Is)), рестарт через 60с" >> logs/paper-feb2026.log
  sleep 60
done
