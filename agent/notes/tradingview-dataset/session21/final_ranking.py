#!/usr/bin/env python3
"""Финальный артефакт: рейтинг авторов + текущий отбор на следующий месяц."""
import math
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])
BEST = ("20160", "5", "10", "5")     # правило, на котором отбор подтвердился слепо
HEAD = ("15840", "2", "7.5", "1.5")  # точка Петра

# --- треки авторов (hitRate) по обоим правилам ------------------------------
hits = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))   # rule -> author -> ideas,hits,exp
months_of = defaultdict(set); syms_of = defaultdict(set)
field = {}
for line in open(f"{DIR}/field_all.tsv"):
    p = line.rstrip("\n").split("\t")
    r = (p[2], p[3], p[4], p[5])
    if r in (BEST, HEAD): field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
for line in open(f"{DIR}/authors_all.tsv"):
    p = line.rstrip("\n").split("\t")
    r = (p[2], p[3], p[4], p[5])
    if r not in (BEST, HEAD): continue
    fi, fh = field.get((p[0], p[1], r), (0, 0))
    if fi == 0: continue
    q = hits[r][p[6]]
    q[0] += int(p[7]); q[1] += int(p[8]); q[2] += int(p[7]) * fh / fi
    if r == BEST:
        months_of[p[6]].add(p[0]); syms_of[p[6]].add(p[1])

# --- деньги по обоим правилам ----------------------------------------------
money = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))     # rule -> author
money_m = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))   # month -> author (BEST)
symf = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
for fn in ("trades_all.tsv", "trades2_all.tsv", "trades3_all.tsv"):
    try: fh_ = open(f"{DIR}/{fn}")
    except FileNotFoundError: continue
    for line in fh_:
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        if r not in (BEST, HEAD): continue
        q = money[r][p[6]]; q[0] += 1; q[1] += float(p[11])
        if r == BEST:
            z = money_m[p[0]][p[6]]; z[0] += 1; z[1] += float(p[11])
            y = symf[p[0]][p[1]]; y[0] += 1; y[1] += float(p[11])

def z_of(h, n, p0):
    if n == 0 or p0 <= 0 or p0 >= 1: return 0.0
    return (h - n * p0) / math.sqrt(n * p0 * (1 - p0))

rows = []
for a, (i, h, e) in hits[BEST].items():
    if i < 10: continue
    m = money[BEST].get(a, [0, 0.0])
    mh = money[HEAD].get(a, [0, 0.0])
    hh = hits[HEAD].get(a, [0, 0, 0.0])
    rows.append(dict(author=a, ideas=i, hits=h, hr=h / i, field=e / i, z=z_of(h, i, e / i),
                     months=len(months_of[a]), syms=len(syms_of[a]),
                     trades=m[0], pnl=m[1], pnl_tr=(m[1] / m[0]) if m[0] else 0.0,
                     pnl_head=(mh[1] / mh[0]) if mh[0] else 0.0,
                     hr_head=(hh[1] / hh[0]) if hh[0] else 0.0))
# сводный ранг: усадка PnL по объёму + z по hitRate
for r in rows:
    r['score'] = r['pnl'] / (r['trades'] + 10) if r['trades'] else -9
rows.sort(key=lambda r: -r['score'])

with open(f"{DIR}/authors_ranked.tsv", "w") as out:
    out.write("author\tideas\thits\thitRate\tfieldRate\tz\tmonths\tsymbols\ttrades\t"
              "pnlTotal\tpnlPerTrade\tscore\thitRate_petr_point\tpnlPerTrade_petr_point\n")
    for r in rows:
        out.write(f"{r['author']}\t{r['ideas']}\t{r['hits']}\t{r['hr']:.4f}\t{r['field']:.4f}\t"
                  f"{r['z']:.3f}\t{r['months']}\t{r['syms']}\t{r['trades']}\t{r['pnl']:.2f}\t"
                  f"{r['pnl_tr']:.4f}\t{r['score']:.4f}\t{r['hr_head']:.4f}\t{r['pnl_head']:.4f}\n")

print("=" * 104)
print("16. РЕЙТИНГ АВТОРОВ (правило: холд 14 сут, лок 5%, стоп 10%, трейлинг 5%)")
print("=" * 104)
print(f"{'#':<4}{'автор':<24}{'идей':>6}{'мес':>5}{'симв':>6}{'hitRate':>9}{'поле':>8}"
      f"{'z':>7}{'сделок':>8}{'PnL/сделку':>12}{'PnL всего':>11}")
for i, r in enumerate(rows[:25], 1):
    print(f"{i:<4}{r['author']:<24}{r['ideas']:>6}{r['months']:>5}{r['syms']:>6}"
          f"{r['hr']:>9.3f}{r['field']:>8.3f}{r['z']:>+7.2f}{r['trades']:>8}"
          f"{r['pnl_tr']:>+12.3f}{r['pnl']:>+11.1f}")
print(f"\nвсего авторов с >=10 идей: {len(rows)}; файл: authors_ranked.tsv")

# --- ТЕКУЩИЙ отбор: обучение на последних 12 месяцах ------------------------
months = sorted(money_m, key=mkey)
train = months[-12:]
sc = defaultdict(lambda: [0, 0, 0.0])
for m in train:
    for a, v in money_m[m].items():
        q = sc[a]; q[1] += v[0]; q[2] += v[1]
for line in open(f"{DIR}/authors_all.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) != BEST: continue
    if p[0] in train: sc[p[6]][0] += int(p[7])
elig = [(v[2] / (v[1] + 10), a, v) for a, v in sc.items() if v[0] >= 5]
elig.sort(reverse=True)
print("\n" + "=" * 104)
print(f"17. ТЕКУЩИЙ ОТБОР НА СЛЕДУЮЩИЙ МЕСЯЦ (обучение: {train[0]} .. {train[-1]})")
print("=" * 104)
print(f"кандидатов с >=5 идей за окно: {len(elig)}")
print(f"{'#':<4}{'автор':<24}{'идей':>7}{'сделок':>8}{'PnL за окно':>13}{'PnL/сделку':>12}")
for i, (s, a, v) in enumerate(elig[:12], 1):
    mark = "  <-- топ-3 (боевой отбор)" if i <= 3 else ""
    print(f"{i:<4}{a:<24}{v[0]:>7}{v[1]:>8}{v[2]:>+13.1f}{(v[2]/v[1] if v[1] else 0):>+12.3f}{mark}")
