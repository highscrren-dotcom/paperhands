#!/bin/bash
# Полный ночной проход по датасету Петра (read-only, вывод только в /tmp/agent/out).
set -u
ROOT=/data/backtests/dataset-master/content
OUT=/tmp/agent/out
mkdir -p "$OUT"
echo "START $(date -u +%F_%T)" > "$OUT/STATUS"

# --- 1. инвентарь: сводки прогонов, лучшие точки, сырые ленты идей -------------
: > "$OUT/summary.tsv"; : > "$OUT/best.tsv"; : > "$OUT/feed.tsv"
find "$ROOT" -name result.json | sort | while read -r f; do
  m=$(echo "$f" | awk -F/ '{print $(NF-3)}'); s=$(echo "$f" | awk -F/ '{print $(NF-1)}')
  jq -r --arg M "$m" --arg S "$s" '[$M,$S,.ideasTotal,.ideasDirectional,.profileCount,.truncatedCount,.avgHoldMinutes,.p95HoldMinutes,.p99HoldMinutes]|@tsv' "$f" >> "$OUT/summary.tsv" 2>/dev/null
done
find "$ROOT" -name result_best.jsonl | sort | while read -r f; do
  m=$(echo "$f" | awk -F/ '{print $(NF-3)}'); s=$(echo "$f" | awk -F/ '{print $(NF-1)}')
  jq -r --arg M "$m" --arg S "$s" '[$M,$S,.criterion,.report.point.holdMinutes,.report.point.profitLockPercent,.report.point.hardStopPercent,.report.point.trailingTakePercent,.report.totalPnlPercent,.report.avgPnlPercent,.report.winRate,.report.sharpe,.report.sortino,.report.maxSeriesDrawdownPercent,.report.skippedBusy,(.report.tradesList|length),(.report.tradesList|map(select(.direction=="LONG"))|length)]|@tsv' "$f" >> "$OUT/best.tsv" 2>/dev/null
done
find "$ROOT" -name tv-ideas.normalize.jsonl | sort | while read -r f; do
  m=$(echo "$f" | awk -F/ '{print $(NF-2)}')
  jq -r --arg M "$m" '[$M,.id,.ts,.symbol,.direction,.author,.firstSeen,.authorIsPro]|@tsv' "$f" >> "$OUT/feed.tsv" 2>/dev/null
done
echo "INVENTORY_DONE $(date -u +%F_%T)" >> "$OUT/STATUS"

# --- 2. треки: панель правило x автор по 1344 стратифицированным правилам ------
cd /tmp/agent
rm -f tshard_* rshard_*
split -n l/4 -d tracks.all tshard_
for i in 0 1 2 3; do
  nice -n 10 ionice -c3 /tmp/agent/extract_tracks.sh "/tmp/agent/tshard_0$i" "$OUT" "t$i" &
done
wait
cat "$OUT"/authors_t*.tsv > "$OUT/authors_all.tsv"
cat "$OUT"/field_t*.tsv  > "$OUT/field_all.tsv"
echo "TRACKS_DONE $(date -u +%F_%T) rows=$(wc -l < "$OUT/authors_all.tsv")" >> "$OUT/STATUS"

# --- 3. отчёты: сделки в 12 якорных точках (деньги, а не только hitRate) -------
split -n l/4 -d reports.all rshard_
for i in 0 1 2 3; do
  nice -n 10 ionice -c3 /tmp/agent/extract_reports.sh "/tmp/agent/rshard_0$i" "$OUT" "r$i" &
done
wait
cat "$OUT"/trades_r*.tsv > "$OUT/trades_all.tsv"
cat "$OUT"/points_r*.tsv > "$OUT/points_all.tsv"
echo "REPORTS_DONE $(date -u +%F_%T) trades=$(wc -l < "$OUT/trades_all.tsv")" >> "$OUT/STATUS"
echo "ALL_DONE $(date -u +%F_%T)" >> "$OUT/STATUS"
