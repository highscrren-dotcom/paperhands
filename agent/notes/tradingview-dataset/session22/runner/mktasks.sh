#!/bin/bash
# Строит список задач (месяц, символ, направленных идей) и раскладывает по N воркерам
# жадно LPT (longest processing time first) — время задачи ~ числу идей.
set -eu
N="${1:-5}"
ROOT=/data/backtests/_agent/phaseA
CONTENT=/data/backtests/dataset-master/content
cd "$CONTENT"
: > "$ROOT/tasks.tsv"
for m in */; do
  m=${m%/}
  for f in "$m"/index.*.mjs; do
    [ -f "$f" ] || continue
    s=$(basename "$f" .mjs); s=${s#index.}
    S=$(echo "$s" | tr 'a-z' 'A-Z')
    nd=$(grep "\"symbol\":\"$S\"" "$m/assets/tv-ideas.normalize.jsonl" 2>/dev/null | grep -c -v '"direction":"NEUTRAL"' || true)
    nd=${nd:-0}
    printf '%s\t%s\t%s\n' "$m" "$S" "$nd" >> "$ROOT/tasks.tsv"
  done
done
echo "tasks: $(wc -l < "$ROOT/tasks.tsv")  ideas: $(awk -F'\t' '{a+=$3} END{print a}' "$ROOT/tasks.tsv")"
echo "empty (0 directional): $(awk -F'\t' '$3==0' "$ROOT/tasks.tsv" | wc -l)"

# LPT-раскладка
rm -f "$ROOT"/shard_*.tsv
sort -t$'\t' -k3,3nr "$ROOT/tasks.tsv" | awk -F'\t' -v N="$N" -v OUT="$ROOT" '
  BEGIN { for (i=0;i<N;i++) load[i]=0 }
  {
    b=0; for (i=1;i<N;i++) if (load[i]<load[b]) b=i
    load[b]+=$3+3
    print $1"\t"$2"\t"$3 >> OUT"/shard_"b".tsv"
  }
  END { for (i=0;i<N;i++) printf "shard %d: load %d\n", i, load[i] }
'
wc -l "$ROOT"/shard_*.tsv
