#!/bin/bash
# Фаза A2: та же сетка 450 точек на мейкерских издержках (fee 0.02 / slip 0.05).
set -eu
cd /data/backtests/_agent/phaseA
mkdir -p out_mk
for i in 0 1 2 3 4; do
  setsid nohup ./worker.sh "$i" /data/backtests/_agent/phaseA/out_mk _mk 0.02 0.05 > /dev/null 2>&1 < /dev/null &
  disown || true
done
sleep 3
ps -eo pid,pcpu,etime,cmd --no-headers | grep -E "worker.sh|run_edge" | grep -v grep
