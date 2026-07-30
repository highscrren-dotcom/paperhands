#!/bin/bash
# Шарды фазы C. Отличия от mktasks.sh фазы A:
#  - список задач берётся готовый (phaseA/tasks.tsv), заново не пересчитывается;
#  - выкинут HYPEUSDT: символ делистнут с Binance spot, докачать хвост неоткуда
#    (exchangeInfo отвечает "Invalid symbol"), 47 идей из 10 892;
#  - раскладка НЕ чисто по времени, а по ПАМЯТИ. Замер на гейте (may_2022 BTCUSDT,
#    36 идей, 840 точек, горизонт 38 880 мин): пик RSS 541 МБ, то есть ~12.5 МБ на
#    идею. В контейнере 16 ГБ на всех воркеров, поэтому пик шарда = его самая
#    крупная задача, и сумма пиков должна влезать.
#    Раскладка: два самых тяжёлых тикеро-месяца (>= HUGE идей) кладутся в ОДИН шард
#    b0 — тогда они физически не могут считаться одновременно. Пик b0 ~5.7 ГБ,
#    b1 ~2.7 ГБ, три мелких по ~1.3 ГБ, всего ~12.8 ГБ из 16.
# usage: mktasks_c.sh [мелких воркеров] [крупных воркеров] [порог BIG] [порог HUGE]
set -eu
N="${1:-3}"
NB="${2:-2}"
BIG="${3:-100}"
HUGE="${4:-300}"
ROOT=/data/backtests/_agent/phaseA
CROOT=/data/backtests/_agent/phaseC
rm -f "$CROOT"/shard_*.tsv
SMALL=$(mktemp); BIGF=$(mktemp); HUGEF=$(mktemp)
trap 'rm -f "$SMALL" "$BIGF" "$HUGEF"' EXIT

awk -F'\t' -v BIG="$BIG" -v HUGE="$HUGE" -v S="$SMALL" -v B="$BIGF" -v H="$HUGEF" '
  $2 == "HYPEUSDT" { skip++; ihype += $3; next }
  $3 == 0 { empty++; next }
  $3 >= HUGE { print > H; nh++; ih += $3; next }
  $3 >= BIG  { print > B; nb++; ib += $3; next }
  { print > S; ns++; is += $3 }
  END {
    printf "мелких %d задач / %d идей, крупных %d / %d, тяжёлых %d / %d, пустых %d, HYPE выкинут %d задач / %d идей\n",
           ns, is, nb, ib, nh, ih, empty, skip, ihype
  }
' "$ROOT/tasks.tsv"

# тяжёлые — все в b0, подряд: два таких профиля в памяти одновременно не помещаются
sort -t$'\t' -k3,3nr "$HUGEF" > "$CROOT/shard_b0.tsv"
HL=$(awk -F'\t' '{s+=$3} END{print s+0}' "$CROOT/shard_b0.tsv")

lpt() {   # <файл задач> <воркеров> <префикс> <стартовая нагрузка шарда 0>
  sort -t$'\t' -k3,3nr "$1" | awk -F'\t' -v N="$2" -v P="$3" -v L0="${4:-0}" -v OUT="$CROOT" '
    BEGIN { for (i = 0; i < N; i++) load[i] = 0; load[0] = L0 }
    {
      b = 0; for (i = 1; i < N; i++) if (load[i] < load[b]) b = i
      load[b] += $3 + 3
      print $1"\t"$2"\t"$3 >> (OUT "/shard_" P b ".tsv")
    }
    END { for (i = 0; i < N; i++) printf "  shard %s%d: нагрузка %d идей\n", P, i, load[i] }
  '
}
lpt "$SMALL" "$N" ""
lpt "$BIGF" "$NB" "b" "$HL"
wc -l "$CROOT"/shard_*.tsv
echo "самая крупная задача в каждом шарде (по ней и считается пик памяти):"
for f in "$CROOT"/shard_*.tsv; do
  awk -F'\t' -v F="$(basename "$f")" '$3>m{m=$3} END{printf "  %-16s max %d идей ~ %d МБ\n", F, m, 90 + 12.5*m}' "$f"
done
