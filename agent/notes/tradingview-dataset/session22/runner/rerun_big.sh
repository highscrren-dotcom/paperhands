#!/bin/bash
# Пересчёт самого крупного тикеро-месяца с большой кучей: на 11520 точках
# jul_2026 BTCUSDT (449 идей) не влезает в 2560 МБ и падает с rc=134 (SIGABRT V8).
set -u
R=/data/backtests/_agent/phaseA
cd $R/wd/jul_2026 || exit 1
export M=jul_2026 S=BTCUSDT PKG=/data/backtests/dataset-master/content/jul_2026
export OUT=$R/out_b TAGSUF=_b
export GRID='{"profitLockPercent":[0,2,3,4,5,6,7,8,9,10,12,14,16,20,25,30],"trailingTakePercent":[3,4,5,6,7,8,9,10,12,14,16,20,25,30,100],"hardStopPercent":[6,8,10,12,14,16,20,25,30,40,60,99],"holdMinutes":[10080,14400,17280,20160]}'
exec nice -n 12 ionice -c3 node --max-old-space-size=8192 $R/run_edge.mjs
