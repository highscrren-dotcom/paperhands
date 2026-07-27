#!/bin/bash
# Точный пересчёт ВСЕЙ старой сетки 21 280 точек на другую комиссию.
# Комиссия не входит ни в один уровень выхода (stopLevel/lockLevel/armLevel считаются
# от entryFill, куда входит только слиппедж) — значит смена CC_PERCENT_FEE сдвигает
# PnL каждой сделки ровно на 2*(f_old - f_new), и пересчёт на суммах ТОЧЕН.
# Слиппедж так пересчитать нельзя: он двигает сами уровни, нужен прогон.
set -eu
G="${1:-/data/backtests/_agent/panels/grid_all.tsv}"
FNEW="${2:-0.02}"
LC_ALL=C awk -F'\t' -v FNEW="$FNEW" '
  { k=$3"|"$4"|"$5"|"$6
    n=$14+$15+$16+$17+$18          # exitReasons: hard_stop..data_truncated
    pnl[k]+=$7; trades[k]+=n }
  END {
    d = 2*(0.1 - FNEW)
    for (k in pnl) {
      old=pnl[k]; new=old + d*trades[k]
      no++; if (old>0) po++; if (new>0) pn++
      if (new>bestn || no==1) { bestn=new; bestk=k; besto=old; bestt=trades[k] }
      so+=old; sn+=new
      printf "%s\t%.1f\t%.1f\t%d\n", k, old, new, trades[k] > "/tmp/fee_shift_points.tsv"
    }
    printf "точек %d | было в плюсе %d | стало в плюсе %d\n", no, po, pn
    printf "средний PnL точки: было %+.1f%%, стало %+.1f%%\n", so/no, sn/no
    printf "лучшая после сдвига: %s -> было %+.1f%%, стало %+.1f%% (сделок %d)\n", bestk, besto, bestn, bestt
  }' "$G"
echo "--- топ-10 после сдвига (hold|lock|stop|trail  было  стало  сделок) ---"
LC_ALL=C sort -t$'\t' -k3,3nr /tmp/fee_shift_points.tsv | head -10
