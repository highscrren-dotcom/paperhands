#!/bin/bash
# Обёртка: гейт с сеткой фазы C. Отдельный файл, чтобы JSON сетки не проезжал через
# ssh -> shell -> lxc-attach и не рвался на кавычках.
# usage: run_gate.sh <month> <SYMBOL> [heap_mb]
set -u
CROOT=/data/backtests/_agent/phaseC
. "$CROOT/grid_c.sh"
exec "$CROOT/gate.sh" "$1" "$2" "${3:-6144}" "$GRID_C" "_gate"
