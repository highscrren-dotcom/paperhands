#!/bin/bash
# Скрейп лент доверенных авторов + нормализация в фид стратегии.
# Гонять кроном/таймером раз в 5-10 минут; cwd не важен — скрипт сам переходит
# в каталог стратегии. firstSeen честен с точностью до интервала запуска.
set -euo pipefail
cd "$(dirname "$0")/.."
SCRAPER="../../../agent/notes/tradingview-dataset/session24/tv-ideas.firstseen.mjs"
mkdir -p assets/stores
AUTHORS=$(node -e 'const a=require("./assets/trusted.authors.json");console.log(a.ranked.slice(0,2).map(r=>r.author).join(" "))')
for au in $AUTHORS; do
  node "$SCRAPER" "@$au" --pages 1 --store "assets/stores/$au.jsonl" \
    || echo "scrape $au failed" >&2
done
node scripts/feed-normalize.mjs assets/tv-ideas.normalized.jsonl assets/stores/*.jsonl
