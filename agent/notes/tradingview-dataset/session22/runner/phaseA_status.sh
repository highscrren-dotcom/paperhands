#!/bin/bash
# Одна строка состояния прогона, запускается НА ХОСТЕ pve:
#   TEMP=<C> CPU=<%busy> DONE=<n>/445 IDEAS=<n> PROC=<n> FIN=<n> ERR=<n>
set -u
T=$(sensors 2>/dev/null | awk '/Package id 0/{gsub(/[+°C]/,"",$4); print int($4)}' | head -1)
C=$(top -bn2 -d0.5 | grep '%Cpu' | tail -1 | awk '{gsub(/,/,".",$8); printf "%d", 100-$8}')
read -r D I P F E < <(lxc-attach -n 105 -- bash -c '
  cd /data/backtests/_agent/phaseA 2>/dev/null || exit 0
  d=$(ls out/done_*.json 2>/dev/null | wc -l)
  i=$(grep -h "^task" logs/*.log 2>/dev/null | sed -e "s/.*ideas=//" -e "s/ .*//" | awk "{s+=\$1} END{print s+0}")
  p=$(ps -eo args --no-headers | grep "phaseA/run_edge" | grep -cv grep)
  f=$(grep -h FINISHED logs/w[0-4].log 2>/dev/null | wc -l)
  e=$(grep -h "rc=[^0]" logs/*.log 2>/dev/null | wc -l)
  echo "${d:-0} ${i:-0} ${p:-0} ${f:-0} ${e:-0}"')
echo "TEMP=${T:-?} CPU=${C:-?} DONE=${D:-0}/445 IDEAS=${I:-0}/10892 PROC=${P:-0} FIN=${F:-0} ERR=${E:-0}"
