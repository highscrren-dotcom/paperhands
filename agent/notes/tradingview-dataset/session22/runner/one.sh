#!/bin/bash
# usage: one.sh <month> <SYMBOL> [outdir] [tagsuf]
set -eu
M="$1"; S="$2"; OUT="${3:-/data/backtests/_agent/phaseA/out}"; SUF="${4:-}"
ROOT=/data/backtests/_agent/phaseA
PKG=/data/backtests/dataset-master/content/$M
WD=$ROOT/wd/$M
mkdir -p "$WD"
[ -e "$WD/dump" ] || ln -sfn "$PKG/dump" "$WD/dump"
cd "$WD"
M="$M" S="$S" OUT="$OUT" PKG="$PKG" TAGSUF="$SUF" \
  exec node --max-old-space-size=3072 "$ROOT/run_edge.mjs"
