#!/bin/bash
# Воркер фазы C. Отличие от worker2/worker3: рабочий каталог — ОБЪЕДИНЁННЫЙ СКЛАД
# СИМВОЛА, а не месячный пакет. Кэш свечей движок ищет по ./dump относительно cwd,
# поэтому cwd задаёт, какие свечи он видит. Месячные пакеты обрезаны по 14 суток после
# последней идеи месяца — на горизонте 27 суток их не хватает.
# Идеи по-прежнему берутся из месячного пакета (PKG, абсолютный путь), выход — в OUT.
# usage: worker_c.sh <shard_id> <outdir> <suffix> [fee] [slip]
set -u
ID="$1"; OUT="$2"; SUF="${3:-_c}"
FEE="${4:-}"; SLIP="${5:-}"
ROOT=/data/backtests/_agent/phaseA
CROOT=/data/backtests/_agent/phaseC
LOG=$ROOT/logs/w${ID}${SUF}.log
mkdir -p "$OUT" "$ROOT/logs"
echo "START shard=$ID $(date -u +%F_%T)" >> "$LOG"
while IFS=$'\t' read -r M S N; do
  [ -n "${M:-}" ] || continue
  [ "${N:-0}" -gt 0 ] || continue
  if [ -f "$OUT/done_${M}_${S}${SUF}.json" ]; then
    echo "skip $M $S (done)" >> "$LOG"; continue
  fi
  WD=$CROOT/union/$S
  if [ ! -d "$WD/dump" ]; then
    echo "task $M $S НЕТ СКЛАДА — пропуск" >> "$LOG"; continue
  fi
  PKG=/data/backtests/dataset-master/content/$M
  t0=$(date +%s)
  ( cd "$WD" && M="$M" S="$S" OUT="$OUT" PKG="$PKG" TAGSUF="$SUF" FEE="$FEE" SLIP="$SLIP" \
      GRID="${GRID:-}" nice -n 10 ionice -c3 node --max-old-space-size="${HEAP:-6144}" \
      "$ROOT/run_edge.mjs" ) >> "$LOG" 2>&1
  rc=$?
  echo "task $M $S ideas=$N rc=$rc sec=$(( $(date +%s) - t0 )) $(date -u +%T)" >> "$LOG"
done < "$ROOT/shard_${ID}.tsv"
echo "FINISHED shard=$ID $(date -u +%F_%T)" >> "$LOG"
