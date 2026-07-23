#!/bin/bash
# kanlab dataset expansion: month-strategy backtests over extra symbols.
# Waves by symbol; inside a wave strategies run in parallel (max 4) —
# each strategy has its own dump/report dir so runs never collide.
set -u
EX=/home/s1dd1/dev/quant/paperhands/example
OUT=/tmp/claude-1000/-home-s1dd1-dev-quant/f35dc419-23ee-453c-92db-b38bd675c9f1/scratchpad/kanlab-dataset
LOGS=$OUT/run_logs
mkdir -p "$LOGS" "$OUT/reports"
STRATS="apr_2024 apr_2026 dec_2025 mar_2026 oct_2021 feb_2021"
SYMS="ETHUSDT SOLUSDT BNBUSDT XRPUSDT"
MAXJOBS=4

run_one() {
  local strat=$1 sym=$2
  local dir=$EX/content/$strat.strategy
  local dst=$OUT/reports/${strat}__${sym}.jsonl
  [ -f "$dst" ] && { echo "SKIP $strat $sym (exists)"; return; }
  rm -rf "$dir/dump/report"
  ( cd "$EX" && timeout 14400 npm start -- --backtest --symbol "$sym" \
      "./content/$strat.strategy/$strat.strategy.ts" ) \
      > "$LOGS/${strat}__${sym}.log" 2>&1
  local rc=$?
  if [ -f "$dir/dump/report/backtest.jsonl" ]; then
    cp "$dir/dump/report/backtest.jsonl" "$dst"
    echo "DONE $strat $sym rc=$rc closed=$(grep -c '"action":"closed"' "$dst")"
  else
    echo "FAIL $strat $sym rc=$rc (no report)"
  fi
}

echo "start $(date -u +%FT%TZ)"
for sym in $SYMS; do
  echo "=== wave $sym ==="
  for strat in $STRATS; do
    while [ "$(jobs -rp | wc -l)" -ge $MAXJOBS ]; do sleep 20; done
    run_one "$strat" "$sym" &
    sleep 5
  done
  wait
done
# feb_2021 gave 0 trades on its native DOTUSDT — try BTC as an extra
run_one feb_2021 BTCUSDT
echo "all waves done $(date -u +%FT%TZ)"
