#!/bin/bash
# usage: worker.sh <shard_id> [outdir] [tagsuf] [fee] [slip]
set -u
ID="$1"; OUT="${2:-/data/backtests/_agent/phaseA/out}"; SUF="${3:-}"
FEE="${4:-}"; SLIP="${5:-}"
ROOT=/data/backtests/_agent/phaseA
LOG="$ROOT/logs/w${ID}${SUF}.log"
mkdir -p "$OUT" "$ROOT/logs"
echo "START shard=$ID $(date -u +%F_%T)" >> "$LOG"
while IFS=$'\t' read -r M S N; do
  [ -n "${M:-}" ] || continue
  if [ -f "$OUT/done_${M}_${S}${SUF}.json" ]; then
    echo "skip $M $S (done)" >> "$LOG"; continue
  fi
  PKG=/data/backtests/dataset-master/content/$M
  WD=$ROOT/wd/$M
  mkdir -p "$WD"
  [ -e "$WD/dump" ] || ln -sfn "$PKG/dump" "$WD/dump"
  t0=$(date +%s)
  ( cd "$WD" && M="$M" S="$S" OUT="$OUT" PKG="$PKG" TAGSUF="$SUF" FEE="$FEE" SLIP="$SLIP" \
      nice -n 10 ionice -c3 node --max-old-space-size=2560 "$ROOT/run_edge.mjs" ) >> "$LOG" 2>&1
  rc=$?
  echo "task $M $S ideas=$N rc=$rc sec=$(( $(date +%s) - t0 )) $(date -u +%T)" >> "$LOG"
done < "$ROOT/shard_${ID}.tsv"
echo "FINISHED shard=$ID $(date -u +%F_%T)" >> "$LOG"
