#!/bin/bash
# Проход по result_tracks.jsonl: вытаскивает панель (месяц x символ x правило x автор)
# для 1344 стратифицированных правил + полевую базу по всем авторам.
# usage: extract_tracks.sh <shard_file> <outdir> <tag>
set -u
SHARD="$1"; OUT="$2"; TAG="$3"
mkdir -p "$OUT"
: > "$OUT/authors_$TAG.tsv"
: > "$OUT/field_$TAG.tsv"
: > "$OUT/progress_$TAG.log"
while read -r f; do
  [ -f "$f" ] || continue
  m=$(echo "$f" | awk -F/ '{print $(NF-3)}')
  s=$(echo "$f" | awk -F/ '{print $(NF-1)}')
  LC_ALL=C grep -F -f /tmp/agent/rules_tracks.txt "$f" | LC_ALL=C awk -v M="$m" -v S="$s" \
    -v AF="$OUT/authors_$TAG.tsv" -v FF="$OUT/field_$TAG.tsv" '
  {
    i = index($0, ",\"author\":\"")
    if (i == 0) next
    rule = substr($0, 1, i-1)
    rest = substr($0, i+11)
    j = index(rest, "\",\"ideas\":")
    if (j == 0) next
    author = substr(rest, 1, j-1)
    tail = substr(rest, j+10)
    k = index(tail, ",\"hits\":")
    ideas = substr(tail, 1, k-1) + 0
    tail2 = substr(tail, k+8)
    l = index(tail2, ",\"hitRate\":")
    hits = substr(tail2, 1, l-1) + 0
    split(rule, p, /[:,]/)
    key = p[2]"\t"p[4]"\t"p[6]"\t"p[8]
    tid[key] += ideas; thit[key] += hits; tn[key] += 1
    if (ideas >= 2) print M"\t"S"\t"key"\t"author"\t"ideas"\t"hits >> AF
  }
  END { for (k2 in tid) print M"\t"S"\t"k2"\t"tn[k2]"\t"tid[k2]"\t"thit[k2] >> FF }
  '
  echo "done $m $s $(date -u +%H:%M:%S)" >> "$OUT/progress_$TAG.log"
done < "$SHARD"
echo "FINISHED $(date -u +%F_%H:%M:%S)" >> "$OUT/progress_$TAG.log"
