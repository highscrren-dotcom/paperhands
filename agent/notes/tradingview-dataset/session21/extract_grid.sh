#!/bin/bash
# Сводки ВСЕХ 21280 точек сетки без tradesList (второй полный проход по 51 ГБ).
set -u
SHARD="$1"; OUT="$2"; TAG="$3"
: > "$OUT/grid_$TAG.tsv"
while read -r f; do
  [ -f "$f" ] || continue
  m=$(echo "$f" | awk -F/ '{print $(NF-3)}')
  s=$(echo "$f" | awk -F/ '{print $(NF-1)}')
  LC_ALL=C awk '{ p = index($0, ",\"tradesList\""); if (p>0) print substr($0,1,p-1) "}" }' "$f" \
   | jq -rc --arg M "$m" --arg S "$s" '[$M,$S,(.point.holdMinutes|tostring),(.point.profitLockPercent|tostring),(.point.hardStopPercent|tostring),(.point.trailingTakePercent|tostring),(.totalPnlPercent|tostring),(.avgPnlPercent|tostring),(.winRate|tostring),(.sharpe|tostring),(.sortino|tostring),(.maxSeriesDrawdownPercent|tostring),(.skippedBusy|tostring),(.exitReasons.hard_stop|tostring),(.exitReasons.trailing_take|tostring),(.exitReasons.profit_lock|tostring),(.exitReasons.time_expired|tostring),(.exitReasons.data_truncated|tostring)]|@tsv' >> "$OUT/grid_$TAG.tsv"
  echo "done $m $s" >> "$OUT/gprogress_$TAG.log"
done < "$SHARD"
echo "FINISHED" >> "$OUT/gprogress_$TAG.log"
