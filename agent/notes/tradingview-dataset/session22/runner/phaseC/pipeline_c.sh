#!/bin/bash
# Конвейер фазы C: ось холда до 27 суток на объединённом складе свечей.
# Запускается под systemd ВНУТРИ CT105 — переживает ssh, сессию и выключение ноутбука.
# Идемпотентен: задача с меткой done_*.json пропускается, оборванная считается заново,
# поэтому обрыв (ребут, rc=134, тепловой троттлинг) не стоит пересчёта всей фазы.
#
# Крупные и мелкие тикеро-месяцы идут ОДНОВРЕМЕННО, но разными пулами: горизонт
# 27 суток делает профиль вдвое толще фазы B, а контейнер один на всех (16 ГБ).
# Крупным — своя куча (HEAP_BIG), мелким — своя (HEAP_SMALL).
set -u
ROOT=/data/backtests/_agent/phaseA
CROOT=/data/backtests/_agent/phaseC
. "$CROOT/grid_c.sh"
OUTD=$CROOT/out_c
SUF=_c
LOG=$CROOT/logs/pipeline_c.log
# Раскладка по ЗАМЕРУ, а не по догадке: гейт may_2022 BTCUSDT (36 идей, 840 точек,
# горизонт 38 880 мин) дал пик RSS 541 МБ = ~12.5 МБ на идею. Пик шарда = его самая
# крупная задача: b0 449 идей ~5.7 ГБ, b1 209 ~2.7 ГБ, три мелких по ~1.3 ГБ,
# в сумме ~12.1 ГБ из 16 ГБ контейнера. Куча — потолок V8, а не резерв: если задача
# не влезет, воркер упадёт с rc=134 и её доберёт одиночный проход, а не ляжет контейнер.
NS="${NS:-3}"                 # воркеров на мелких задачах
NB="${NB:-2}"                 # воркеров на крупных
HEAP_SMALL="${HEAP_SMALL:-2048}"
HEAP_BIG="${HEAP_BIG:-8192}"
TRIES="${TRIES:-4}"
mkdir -p "$OUTD" "$CROOT/logs"
say() { echo "[$(date -u +%F_%T)] $*" >> "$LOG"; }

[ -f "$CROOT/PHASE_C_DONE" ] && { say "PHASE_C_DONE уже есть, работы нет"; exit 0; }

running() { ps -eo args --no-headers | grep -E 'phaseC/worker_c\.sh|phaseA/run_edge' | grep -vc grep; }

todo_count() {                # <файл списка задач>
  local n=0 m s
  while IFS=$'\t' read -r m s _; do
    [ -n "${m:-}" ] || continue
    [ -f "$OUTD/done_${m}_${s}${SUF}.json" ] || n=$((n + 1))
  done < "$1"
  echo "$n"
}

todo_all() {
  local n=0 f
  for f in "$CROOT"/shard_[0-9]*.tsv "$CROOT"/shard_b[0-9]*.tsv; do n=$((n + $(todo_count "$f"))); done
  echo "$n"
}

wait_idle() { sleep 20; while [ "$(running)" != "0" ]; do sleep 60; done; }

launch() {                    # <префикс> <сколько> <куча>
  local P=$1 K=$2 H=$3 i
  for ((i = 0; i < K; i++)); do
    GRID="$GRID_C" HEAP="$H" setsid nohup "$CROOT/worker_c.sh" "$P$i" "$OUTD" "$SUF" \
      >/dev/null 2>&1 </dev/null &
  done
}

say "=== фаза C: 840 точек (600 заказанных + два выключенных уровня), холд до 27 суток ==="
say "мелких воркеров $NS куча $HEAP_SMALL МБ; крупных $NB куча $HEAP_BIG МБ"
wait_idle
for t in $(seq 1 "$TRIES"); do
  left=$(todo_all)
  if [ "$left" = "0" ]; then say "все задачи закрыты"; break; fi
  say "попытка $t/$TRIES, осталось $left задач"
  launch "" "$NS" "$HEAP_SMALL"
  launch "b" "$NB" "$HEAP_BIG"
  wait_idle
  say "попытка $t отработала, осталось $(todo_all)"
done

left=$(todo_all)
if [ "$left" != "0" ]; then
  say "ОСТАЛОСЬ $left незакрытых задач — добиваю поодиночке кучей 12288 МБ"
  cat "$CROOT"/shard_[0-9]*.tsv "$CROOT"/shard_b[0-9]*.tsv > "$CROOT/shard_rest.tsv"
  GRID="$GRID_C" HEAP=12288 "$CROOT/worker_c.sh" "rest" "$OUTD" "$SUF" &
  wait_idle
  say "после одиночного прохода осталось $(todo_all)"
fi

say "сборка панелей"
"$ROOT/concat.sh" "$OUTD" "$CROOT/panel_c" >> "$LOG" 2>&1
say "лифт отбора по каждому правилу"
python3 "$ROOT/sweep.py" "$CROOT/panel_c" >> "$LOG" 2>&1
python3 "$ROOT/summary.py" "$CROOT/panel_c" "C-hold27" > "$CROOT/SUMMARY_C-hold27.txt" 2>>"$LOG"
say "=== готово -> SUMMARY_C-hold27.txt ==="
date -u +%F_%T > "$CROOT/PHASE_C_DONE"
