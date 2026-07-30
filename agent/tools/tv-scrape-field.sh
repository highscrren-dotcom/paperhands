#!/bin/bash
# Полевой сбор TV-идей с честным firstSeen (DECISIONS №144).
# Гонять таймером раз в 10 мин на CT105. Сторы append-only, по одному на символ:
# firstSeen ставится при первом появлении id и неприкосновенен, lastSeen
# перестал расти = пост снесли, lagSec = задний ввод. Сырьё не нормализуется —
# перпы (.P) и чужие котировки остаются в сторе, маппинг решается при анализе.
set -uo pipefail
SCRAPER="$(dirname "$0")/../notes/tradingview-dataset/session24/tv-ideas.firstseen.mjs"
OUT="${TV_FEED_DIR:-/data/backtests/_agent/feed/stores}"
mkdir -p "$OUT"

# плотные ленты — 2 страницы, остальные — 1 (24 идеи/страница >> потока за 10 мин)
DEEP="BTCUSDT ETHUSDT SOLUSDT"
REST="DOGEUSDT XRPUSDT BNBUSDT TRXUSDT ZECUSDT NEARUSDT POLUSDT PENGUUSDT PUMPUSDT"

rc=0
for sym in $DEEP; do
  node "$SCRAPER" "$sym" --pages 2 --store "$OUT/$sym.jsonl" || { echo "FAIL $sym" >&2; rc=1; }
done
for sym in $REST; do
  node "$SCRAPER" "$sym" --pages 1 --store "$OUT/$sym.jsonl" || { echo "FAIL $sym" >&2; rc=1; }
done
exit $rc
