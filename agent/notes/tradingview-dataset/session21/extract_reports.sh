#!/bin/bash
# Проход по result_reports.jsonl: для 12 якорных точек вытаскивает
# (a) сводку точки, (b) все сделки с автором/направлением/pnl.
# usage: extract_reports.sh <shard_file> <outdir> <tag>
set -u
SHARD="$1"; OUT="$2"; TAG="$3"
mkdir -p "$OUT"
: > "$OUT/trades_$TAG.tsv"
: > "$OUT/points_$TAG.tsv"
: > "$OUT/rprogress_$TAG.log"
while read -r f; do
  [ -f "$f" ] || continue
  m=$(echo "$f" | awk -F/ '{print $(NF-3)}')
  s=$(echo "$f" | awk -F/ '{print $(NF-1)}')
  LC_ALL=C grep -F -f /tmp/agent/rules_reports.txt "$f" \
   | jq -rc --arg M "$m" --arg S "$s" '
      .point as $p
      | ([ "P", $M, $S, ($p.holdMinutes|tostring), ($p.profitLockPercent|tostring),
           ($p.hardStopPercent|tostring), ($p.trailingTakePercent|tostring),
           (.totalPnlPercent|tostring), (.avgPnlPercent|tostring), (.winRate|tostring),
           (.sharpe|tostring), (.sortino|tostring), (.maxSeriesDrawdownPercent|tostring),
           (.profitFactor|tostring), (.skippedBusy|tostring), ((.tradesList|length)|tostring),
           (.exitReasons.hard_stop|tostring), (.exitReasons.trailing_take|tostring),
           (.exitReasons.profit_lock|tostring), (.exitReasons.time_expired|tostring),
           (.exitReasons.data_truncated|tostring) ] | @tsv),
        ( .tradesList[]? | [ "T", $M, $S, ($p.holdMinutes|tostring), ($p.profitLockPercent|tostring),
           ($p.hardStopPercent|tostring), ($p.trailingTakePercent|tostring),
           .author, .direction, (.entryTimestamp|tostring), (.exitTimestamp|tostring),
           .exitReason, (.pnlPercent|tostring), ((.absorbedIdeas|length)|tostring) ] | @tsv )' \
   | LC_ALL=C awk -v TF="$OUT/trades_$TAG.tsv" -v PF="$OUT/points_$TAG.tsv" -F'\t' \
       '{ line=substr($0, index($0,"\t")+1); if ($1=="T") print line >> TF; else print line >> PF }'
  echo "done $m $s $(date -u +%H:%M:%S)" >> "$OUT/rprogress_$TAG.log"
done < "$SHARD"
echo "FINISHED $(date -u +%F_%H:%M:%S)" >> "$OUT/rprogress_$TAG.log"
