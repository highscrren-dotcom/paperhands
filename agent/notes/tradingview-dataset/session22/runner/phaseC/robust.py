#!/usr/bin/env python3
"""Устойчивость гейта фазы C: не сидит ли вывод в одной удачной ячейке (K, порог).

Плацебо по времени берётся в СОПОСТАВИМОЙ форме (placebo_shift, общий сдвиг на весь
тикеро-месяц): поидейный сдвиг ломает кучность постов и раздувает число сделок.

verdict.py считает один набор (топ-K, порог идей). Здесь тот же расчёт гоняется по
сетке K x порог, и печатается только то, что решает: обогнала ли стратегия ТУ ЖЕ
сделку в LONG, и обогнала ли она плацебо. Если вывод переворачивается от ячейки к
ячейке — значит вывода нет ни в одной.

usage: robust.py [panel_nv]
"""
import sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_nv"
VARIANTS = ["real", "longonly", "placebo_dir", "placebo_ts", "placebo_shift"]
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def load(variant):
    out = defaultdict(lambda: (defaultdict(lambda: defaultdict(int)),
                               defaultdict(lambda: defaultdict(lambda: [0, 0.0])),
                               defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0, 0.0]))))
    for line in open(f"{D}/autnv_{variant}.tsv"):
        p = line.rstrip("\n").split("\t")
        out[int(p[2])][0][p[0]][p[6]] += int(p[7])
    for line in open(f"{D}/trdnv_{variant}.tsv"):
        p = line.rstrip("\n").split("\t")
        _, mon, monL = out[int(p[2])]
        q = mon[p[0]][p[6]]; q[0] += int(p[7]); q[1] += float(p[8])
        if len(p) > 13:
            w = monL[p[0]][p[6]]
            w[0] += int(p[7]); w[1] += float(p[10]); w[2] += float(p[12]); w[3] += float(p[13])
    return out


def walk(ideas_by_m, mon, monL, K, MIN, W=12, shrink=10, start=2022):
    months = sorted(set(ideas_by_m) | set(mon), key=mkey)
    real = [0, 0.0]; lng = [0, 0.0, 0.0, 0.0]
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start:
            continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0, 0.0])
        for m in train:
            for au, i in ideas_by_m[m].items():
                sc[au][0] += i
            for au, v in mon[m].items():
                sc[au][1] += v[0]; sc[au][2] += v[1]
        elig = [a for a, v in sc.items() if v[0] >= MIN]
        if len(elig) < max(3 * K, 6):
            continue
        elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + shrink) if sc[a][1] else -9, reverse=True)
        mt = mon.get(tm, {})
        for a in elig[:K]:
            if a in mt:
                real[0] += mt[a][0]; real[1] += mt[a][1]
            v = monL.get(tm, {}).get(a)
            if v:
                lng[0] += v[0]; lng[1] += v[1]; lng[2] += v[2]; lng[3] += v[3]
    t = 0.0
    if lng[0] > 1:
        m = lng[2] / lng[0]
        var = (lng[3] - lng[2] ** 2 / lng[0]) / (lng[0] - 1)
        if var > 0:
            t = m / (var / lng[0]) ** 0.5
    return (real[0], real[1] / real[0] if real[0] else 0.0,
            lng[1] / lng[0] if lng[0] else 0.0, t)


DATA = {v: load(v) for v in VARIANTS}
HOLDS = sorted(DATA["real"])
KS = (1, 2, 3, 5, 7, 10)
MINS = (5, 10, 20)

print("=" * 118)
print("УСТОЙЧИВОСТЬ ГЕЙТА: стратегия против ТОЙ ЖЕ сделки в LONG и против плацебо")
print("угол сетки лок 0 / трейл 100 / стоп 99, walk-forward с 2022, издержки 0.4 % на круг")
print("=" * 118)
print(f"{'холд':>6}{'K':>4}{'порог':>7}{'сделок':>8}{'страт.':>9}{'та же LONG':>12}"
      f"{'лифт':>9}{'t':>8}{'плац.напр.':>12}{'плац.сдвиг':>12}{'бьёт оба?':>11}")
win = tot = 0
for h in HOLDS:
    for K in KS:
        for MN in MINS:
            n, a, la, t = walk(*DATA["real"][h], K, MN)
            if n < 30:
                continue
            _, pd_, _, _ = walk(*DATA["placebo_dir"][h], K, MN)
            _, pt, _, _ = walk(*DATA["placebo_shift"][h], K, MN)
            ok = a > la and a > pd_ and a > pt
            tot += 1; win += ok
            print(f"{h // 1440:>4}сут{K:>4}{MN:>7}{n:>8}{a:>+9.3f}{la:>+12.3f}"
                  f"{a - la:>+9.3f}{t:>+8.2f}{pd_:>+12.3f}{pt:>+12.3f}{'ДА' if ok else 'нет':>11}")
    print()
print(f"ячеек, где стратегия бьёт И buy & hold, И оба плацебо: {win} из {tot}")
print()
print("то же на длинном крае (только холд 24 и 27 суток):")
w2 = t2 = 0
for h in HOLDS[-2:]:
    for K in KS:
        for MN in MINS:
            n, a, la, _ = walk(*DATA["real"][h], K, MN)
            if n < 30:
                continue
            _, pd_, _, _ = walk(*DATA["placebo_dir"][h], K, MN)
            _, pt, _, _ = walk(*DATA["placebo_shift"][h], K, MN)
            t2 += 1; w2 += (a > la and a > pd_ and a > pt)
print(f"  {w2} из {t2}")
