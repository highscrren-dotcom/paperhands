#!/bin/bash
# Собирает per-ticker-month файлы в 4 панели и сортирует по правилу.
# usage: concat.sh <outdir> <paneldir>
set -eu
SRC="${1:-/data/backtests/_agent/phaseA/out}"
DST="${2:-/data/backtests/_agent/phaseA/panel}"
mkdir -p "$DST"
for k in fld pnt; do
  find "$SRC" -name "${k}_*.tsv" -print0 | xargs -0 cat > "$DST/${k}_all.tsv"
done
for k in aut trd; do
  find "$SRC" -name "${k}_*.tsv" -print0 | xargs -0 cat > "$DST/${k}_all.tsv"
  LC_ALL=C sort -S 1G -t$'\t' -k3,3n -k4,4n -k5,5n -k6,6n "$DST/${k}_all.tsv" > "$DST/${k}_sorted.tsv"
done
wc -l "$DST"/*.tsv
