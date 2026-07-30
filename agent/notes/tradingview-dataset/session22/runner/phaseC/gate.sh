#!/bin/bash
# Контрольный прогон ОДНОГО тикеро-месяца на горизонте фазы C.
# Отвечает сразу на три вопроса, каждый — фактом, а не оценкой:
#   1) netCalls — полон ли объединённый склад свечей (гейт фазы);
#   2) пик RSS — сколько кучи просит горизонт 27 суток (иначе rc=134, как в фазе B);
#   3) секунд на идею — сколько будет стоить весь прогон.
# usage: gate.sh <month> <SYMBOL> [heap_mb] [grid_json] [suffix]
set -u
M="$1"; S="$2"; HEAP="${3:-6144}"; GRIDJ="${4:-}"; SUF="${5:-_gate}"
ROOT=/data/backtests/_agent/phaseA
CROOT=/data/backtests/_agent/phaseC
# OUT можно переопределить: тогда замер памяти заодно закрывает настоящую задачу фазы
OUT="${OUTDIR:-$CROOT/gate}"
WD=$CROOT/union/$S
PKG=/data/backtests/dataset-master/content/$M
mkdir -p "$OUT"
[ -d "$WD/dump" ] || { echo "нет склада $WD"; exit 1; }

cd "$WD" || exit 1
t0=$(date +%s)
M="$M" S="$S" OUT="$OUT" PKG="$PKG" TAGSUF="$SUF" GRID="$GRIDJ" \
  node --max-old-space-size="$HEAP" "$ROOT/run_edge.mjs" &
PID=$!
PEAK=0
while kill -0 "$PID" 2>/dev/null; do
  R=$(awk '/^VmRSS/{print $2}' "/proc/$PID/status" 2>/dev/null)
  if [ -n "${R:-}" ] && [ "$R" -gt "$PEAK" ]; then PEAK=$R; fi
  sleep 5
done
wait "$PID"; rc=$?
SEC=$(( $(date +%s) - t0 ))
echo "=== $M $S heap=${HEAP}МБ rc=$rc пик RSS=$((PEAK / 1024)) МБ время ${SEC} с ==="
[ -f "$OUT/done_${M}_${S}${SUF}.json" ] && cat "$OUT/done_${M}_${S}${SUF}.json"
[ -f "$OUT/error_${M}_${S}${SUF}.txt" ] && { echo "--- ОШИБКА ---"; cat "$OUT/error_${M}_${S}${SUF}.txt"; }
exit 0
