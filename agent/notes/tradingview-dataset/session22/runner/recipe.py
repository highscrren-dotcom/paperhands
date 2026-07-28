#!/usr/bin/env python3
"""Рецепт: сколько авторов брать, с каким порогом, и что это даёт в деньгах.

Правило фиксировано: холд 14 сут, лок 20 %, трейлинг 8 %, стопа нет.
Издержки движка по умолчанию = 0.2 % комиссии + слиппедж = ~0.4 % на круг (цифра Петра).
Отбор — walk-forward: рейтинг строится ТОЛЬКО на прошлых 12 месяцах.
"""
import sys
from collections import defaultdict

D = sys.argv[1]
RULE = ("20160", "20", "99", "8")
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])

field, aut, mon, msa = {}, defaultdict(dict), defaultdict(lambda: defaultdict(lambda: [0, 0.0])), defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
for line in open(f"{D}/fld_all.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) == RULE:
        field[(p[0], p[1])] = (int(p[7]), int(p[8]))
for line in open(f"{D}/aut_sorted.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) == RULE and int(p[7]) >= 2:
        aut[(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
for line in open(f"{D}/trd_sorted.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) != RULE:
        continue
    q = mon[p[0]][p[6]]; q[0] += int(p[7]); q[1] += float(p[8])
    z = msa[p[0]][(p[1], p[6])]; z[0] += int(p[7]); z[1] += float(p[8])

ideas_by_m = defaultdict(lambda: defaultdict(int))
for (m, s), a in aut.items():
    for au, (i, h) in a.items():
        ideas_by_m[m][au] += i
months = sorted(set(ideas_by_m) | set(mon), key=mkey)


def run(K, MIN, W=12, shrink=10, start=2022):
    real = [0, 0.0]; fld = [0, 0.0]
    curve = []; peryear = defaultdict(lambda: [0, 0.0])
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start: continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2: continue
        sc = defaultdict(lambda: [0, 0, 0.0])
        for m in train:
            for au, i in ideas_by_m[m].items(): sc[au][0] += i
            for au, v in mon[m].items(): sc[au][1] += v[0]; sc[au][2] += v[1]
        elig = [a for a, v in sc.items() if v[0] >= MIN]
        if len(elig) < max(3 * K, 6): continue
        elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + shrink) if sc[a][1] else -9, reverse=True)
        top = set(elig[:K]); mt = mon.get(tm, {})
        if not mt: continue
        mp = 0.0; b0 = real[0]
        for a in top:
            if a in mt:
                real[0] += mt[a][0]; real[1] += mt[a][1]; mp += mt[a][1]
                peryear[mkey(tm)[0]][0] += mt[a][0]; peryear[mkey(tm)[0]][1] += mt[a][1]
        if real[0] == b0: continue
        curve.append((tm, mp))
        es = set(elig); syms = {s for (s, a) in msa[tm] if a in top}
        for (s, a), v in msa[tm].items():
            if s in syms and a in es: fld[0] += v[0]; fld[1] += v[1]
    cum = peak = dd = 0.0; pos = 0
    for _, v in curve:
        cum += v; pos += v > 0; peak = max(peak, cum); dd = max(dd, peak - cum)
    n = len(curve)
    return dict(K=K, MIN=MIN, months=n, trades=real[0], total=real[1],
                avg=real[1] / real[0] if real[0] else 0,
                field=fld[1] / fld[0] if fld[0] else 0,
                tpm=real[0] / n if n else 0, dd=dd, posm=pos,
                years=len(peryear), ypos=sum(1 for v in peryear.values() if v[1] > 0))


print("=" * 104)
print("СКОЛЬКО АВТОРОВ И КАКОЙ ПОРОГ (правило: холд 14 сут, лок 20 %, трейл 8 %, стопа нет)")
print("=" * 104)
print(f"{'авторов':>8}{'порог идей':>12}{'мес':>5}{'сделок':>8}{'в мес':>7}{'на сделку':>11}"
      f"{'поле':>8}{'лифт':>8}{'суммарно':>11}{'просадка':>10}{'приб.мес':>10}{'лет+':>6}")
best = []
for MIN in (5, 10, 15, 20, 30):
    for K in (1, 2, 3, 5, 7, 10, 15):
        r = run(K, MIN)
        if r["months"] < 20: continue
        best.append(r)
        print(f"{K:>8}{MIN:>12}{r['months']:>5}{r['trades']:>8}{r['tpm']:>7.1f}"
              f"{r['avg']:>+11.3f}{r['field']:>+8.3f}{r['avg']-r['field']:>+8.3f}"
              f"{r['total']:>+11.0f}{-r['dd']:>10.0f}{r['posm']:>5}/{r['months']:<4}{r['ypos']:>3}/{r['years']}")

print("\nЛУЧШИЕ ПО ОТНОШЕНИЮ ПРИБЫЛЬ/ПРОСАДКА:")
for r in sorted(best, key=lambda r: -(r['total'] / r['dd'] if r['dd'] else 0))[:5]:
    print(f"  K={r['K']:<3} порог={r['MIN']:<3}: {r['total']:+.0f}% при просадке {-r['dd']:.0f}% "
          f"= {r['total']/r['dd']:.2f}, {r['tpm']:.1f} сделок/мес, {r['ypos']}/{r['years']} лет")

print()
print("=" * 104)
print("СПАМ ИЛИ ПО ДЕЛУ: связь плодовитости автора с его результатом")
print("=" * 104)
tot = defaultdict(lambda: [0, 0, 0.0])   # author -> ideas, trades, pnl
for m in months:
    for au, i in ideas_by_m[m].items(): tot[au][0] += i
    for au, v in mon[m].items(): tot[au][1] += v[0]; tot[au][2] += v[1]
rows = [(a, v[0], v[1], v[2] / v[1]) for a, v in tot.items() if v[1] >= 20]
rows.sort(key=lambda r: -r[1])
print(f"авторов со >=20 сделками: {len(rows)}\n")
print(f"  {'группа по числу идей':<28}{'авторов':>9}{'сделок':>9}{'PnL/сделку':>13}")
bands = [(0, 25, "мало (<25 идей)"), (25, 75, "средне (25-75)"),
         (75, 200, "много (75-200)"), (200, 10 ** 9, "очень много (200+)")]
for lo, hi, name in bands:
    g = [r for r in rows if lo <= r[1] < hi]
    if not g: continue
    tr = sum(r[2] for r in g); pn = sum(r[2] * r[3] for r in g)
    print(f"  {name:<28}{len(g):>9}{tr:>9}{pn/tr:>+13.3f}")
print(f"\n  {'топ-10 плодовитых':<28}{'идей':>7}{'сделок':>9}{'PnL/сделку':>13}")
for a, i, t, p in rows[:10]:
    print(f"  {a[:26]:<28}{i:>7}{t:>9}{p:>+13.3f}")
