#!/bin/bash
# Автономный конвейер: доводит фазу A2 (мейкерские издержки), считает её,
# затем гонит фазу B (поиск границы поверхности) и считает её.
# Запускается под systemd внутри CT105 — переживает отключение ноутбука и ssh.
# Идемпотентен: задачи с меткой done_*.json пропускаются, оборванные пересчитываются.
set -u
ROOT=/data/backtests/_agent/phaseA
LOG=$ROOT/logs/pipeline.log
mkdir -p "$ROOT/logs"
say() { echo "[$(date -u +%F_%T)] $*" >> "$LOG"; }

# Фаза B: поверхность в фазе A росла по локу, трейлу И стопу до самого угла бокса,
# значит максимум снаружи. Замерено (may_2022 BTCUSDT, 36 идей): 1 точка 449 с,
# 245 точек 446 с, 2475 точек 477 с, 9900 точек 571 с при пике RSS 418 МБ — время
# держит ЧИСЛО ИДЕЙ (чтение свечей поминутными файлами), а не размер сетки, память
# растёт ~195 Б на сделку. Поэтому сетка плотная: 16 x 15 x 12 x 4 = 11 520 точек.
# Ось hold ВНИЗ бесплатна: горизонт профиля = max(holdMinutes) = 20160, свечи те же.
# Выключенные уровни включены намеренно (лок 0 = замка нет, трейл 100 = взвод
# недостижим, стоп 99 = стопа нет): если максимум сядет туда, риск-менеджмент не
# добавляет ничего и весь эффект — чистая направленная экспозиция на 14 суток.
GRID_B='{"profitLockPercent":[0,2,3,4,5,6,7,8,9,10,12,14,16,20,25,30],"trailingTakePercent":[3,4,5,6,7,8,9,10,12,14,16,20,25,30,100],"hardStopPercent":[6,8,10,12,14,16,20,25,30,40,60,99],"holdMinutes":[10080,14400,17280,20160]}'

running() {
  ps -eo args --no-headers | grep -E 'phaseA/(worker2?\.sh|run_edge)|\./worker2?\.sh' | grep -vc grep
}

todo_count() {   # <outdir> <suffix>
  local OUTD=$1 SUF=$2 n=0 m s
  while IFS=$'\t' read -r m s _; do
    [ -n "${m:-}" ] || continue
    [ -f "$OUTD/done_${m}_${s}${SUF}.json" ] || n=$((n + 1))
  done < "$ROOT/tasks.tsv"
  echo "$n"
}

wait_idle() {
  sleep 20
  while [ "$(running)" != "0" ]; do sleep 60; done
}

run_phase() {    # <outdir> <suffix> <fee> <slip> <grid> <tries>
  local OUTD=$1 SUF=$2 FEE=$3 SLIP=$4 GRIDJSON=$5 TRIES=${6:-4} t left
  mkdir -p "$OUTD"
  for t in $(seq 1 "$TRIES"); do
    left=$(todo_count "$OUTD" "$SUF")
    if [ "$left" -le 5 ]; then
      say "$SUF: осталось $left задач (5 нерасчётных — идеи старше листинга), фаза закрыта"
      return 0
    fi
    say "$SUF: попытка $t/$TRIES, осталось $left задач"
    local i
    for i in 0 1 2 3 4; do
      GRID="$GRIDJSON" setsid nohup "$ROOT/worker2.sh" "$i" "$OUTD" "$SUF" "$FEE" "$SLIP" \
        >/dev/null 2>&1 </dev/null &
    done
    wait_idle
    say "$SUF: попытка $t отработала, осталось $(todo_count "$OUTD" "$SUF")"
  done
  say "$SUF: исчерпаны попытки, осталось $(todo_count "$OUTD" "$SUF")"
}

analyse() {      # <outdir> <paneldir> <заголовок>
  local OUTD=$1 PANEL=$2 TITLE=$3
  say "$TITLE: сборка панелей"
  "$ROOT/concat.sh" "$OUTD" "$PANEL" >> "$LOG" 2>&1
  say "$TITLE: лифт по правилам"
  python3 "$ROOT/sweep.py" "$PANEL" >> "$LOG" 2>&1
  python3 "$ROOT/summary.py" "$PANEL" "$TITLE" > "$ROOT/SUMMARY_${TITLE}.txt" 2>>"$LOG"
  say "$TITLE: готово -> $ROOT/SUMMARY_${TITLE}.txt"
}

say "=== конвейер запущен ==="
say "жду завершения того, что уже крутится (фаза A2)"
wait_idle
say "свободно; довожу A2"
run_phase "$ROOT/out_mk" "_mk" 0.02 0.05 "" 4
analyse "$ROOT/out_mk" "$ROOT/panel_mk" "A2-maker"

say "=== фаза B: поиск границы поверхности, 11 520 точек ==="
run_phase "$ROOT/out_b" "_b" "" "" "$GRID_B" 4
analyse "$ROOT/out_b" "$ROOT/panel_b" "B-bounds"

say "=== конвейер завершён ==="
date -u +%F_%T > "$ROOT/PIPELINE_DONE"
