#!/bin/bash
# Аккуратная остановка прогона: сперва воркеры (чтобы не подняли новую задачу),
# потом node. Без pkill -f — он матчит сам себя (обжигались).
set -u
for p in $(ps -eo pid,args --no-headers | grep 'phaseA/worker\.sh' | grep -v grep | awk '{print $1}'); do
  kill -9 "$p" 2>/dev/null
done
for p in $(ps -eo pid,args --no-headers | grep 'phaseA/run_edge\.mjs' | grep -v grep | awk '{print $1}'); do
  kill -9 "$p" 2>/dev/null
done
sleep 1
left=$(ps -eo pid,args --no-headers | grep -E 'phaseA/worker\.sh|phaseA/run_edge\.mjs' | grep -v grep | wc -l)
echo "остановлено, осталось процессов: $left"
