#!/usr/bin/env python3
"""Сверка питоновских контролей с движком НА ВСЁМ ДАТАСЕТЕ, а не на одном месяце.

На `may_2022 BTCUSDT` совпадение было построчное и точное (40 из 40). Но там нет ни
кромки данных, ни окон техобслуживания биржи, а именно на них питон и движок обязаны
разойтись: питон считает чанк неполным и обрезает профиль, а движок в этом месте идёт
в сеть, получает от биржи склейку через дыру и профиль не обрезает.

Здесь считается, СКОЛЬКО таких строк и насколько они расходятся. Если расхождение сидит
ровно в тикеро-месяцах у семи окон биржи и у кромки jul_2026 — модель контролей верна,
и её выводы можно переносить на движок. Если расходится где попало — нельзя.

usage: xcheck.py <панель движка>  (нужен trd_sorted.tsv; контроли берутся из panel_nv)
"""
import sys
from collections import defaultdict

P = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_c"
NV = "/data/backtests/_agent/phaseC/panel_nv/trdnv_real.tsv"
RULE = ("0", "99", "100")           # лок 0, стоп 99, трейл 100 — «досидеть до конца холда»

eng = {}
for line in open(f"{P}/trd_sorted.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[3], p[4], p[5]) != RULE:
        continue
    eng[(p[0], p[1], p[2], p[6])] = (int(p[7]), float(p[8]))

nv = {}
for line in open(NV):
    p = line.rstrip("\n").split("\t")
    nv[(p[0], p[1], p[2], p[6])] = (int(p[7]), float(p[8]))

common = eng.keys() & nv.keys()
only_e = eng.keys() - nv.keys()
only_n = {k for k in nv.keys() - eng.keys() if (k[0], k[1]) in {(a, b) for a, b, _, _ in eng}}

same = 0
diff = []
for k in common:
    if eng[k][0] == nv[k][0] and abs(eng[k][1] - nv[k][1]) < 1e-3:
        same += 1
    else:
        diff.append((abs(eng[k][1] - nv[k][1]), k, eng[k], nv[k]))
diff.sort(reverse=True)

print(f"строк в углу у движка {len(eng):,}, у контролей {len(nv):,}, общих {len(common):,}")
print(f"совпало до 0.001 %: {same:,} ({100 * same / max(len(common), 1):.2f} %)")
print(f"разошлось: {len(diff):,}")
print(f"есть только у движка: {len(only_e):,}; только у контролей "
      f"(в посчитанных тикеро-месяцах): {len(only_n):,}")

if diff:
    bym = defaultdict(int)
    for _, k, _, _ in diff:
        bym[(k[0], k[1])] += 1
    print(f"\nрасхождения по тикеро-месяцам (всего {len(bym)}):")
    for (m, s), n in sorted(bym.items(), key=lambda x: -x[1])[:15]:
        print(f"  {m:<10}{s:<10}{n:>6} строк")
    print("\nсамые крупные расхождения:")
    for d, k, e, n in diff[:8]:
        print(f"  {k[0]:<10}{k[1]:<10}холд {int(k[2]) // 1440:>3}сут {k[3][:22]:<24}"
              f"движок {e[0]} сд. {e[1]:+.3f}   питон {n[0]} сд. {n[1]:+.3f}")
