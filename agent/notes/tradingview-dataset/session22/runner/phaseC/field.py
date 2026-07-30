#!/usr/bin/env python3
"""Ось холда на СЫРОМ ПОЛЕ: все сделки всех авторов, без всякого отбора.

Отбор — отдельный слой, и он шумит: на топ-2 остаётся 200 сделок, где видно что угодно.
Здесь его нет вовсе, поэтому видно саму ось. Плюс главная поправка к вопросу автора:
сумма процентов растёт с холдом просто потому, что дольше держишь. Капитал занят всё
это время, поэтому честная мера — процент НА СУТКИ удержания, а не на сделку.

usage: field.py [panel_nv]
"""
import sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_nv"
VAR = ["real", "longonly", "placebo_dir", "placebo_ts", "placebo_shift"]

agg = defaultdict(lambda: [0, 0.0, 0])
pair = defaultdict(lambda: [0, 0.0, 0.0])
for v in VAR:
    for line in open(f"{D}/trdnv_{v}.tsv"):
        p = line.rstrip("\n").split("\t")
        h = int(p[2])
        q = agg[(v, h)]
        q[0] += int(p[7]); q[1] += float(p[8]); q[2] += int(p[9])
        if v == "real" and len(p) > 13:
            z = pair[h]
            z[0] += int(p[7]); z[1] += float(p[12]); z[2] += float(p[13])

print("=" * 104)
print("СЫРОЕ ПОЛЕ, БЕЗ ОТБОРА. Угол «досидеть до конца холда», издержки 0.4 % на круг")
print("=" * 104)
print(f"{'холд':>6}{'вариант':>14}{'сделок':>9}{'на сделку':>12}{'на сутки':>11}"
      f"{'суммарно':>12}{'winRate':>10}")
for h in sorted({k[1] for k in agg}):
    for v in VAR:
        q = agg[(v, h)]
        if not q[0]:
            continue
        d = h / 1440
        print(f"{h // 1440:>4}сут{v:>14}{q[0]:>9}{q[1] / q[0]:>+12.3f}"
              f"{q[1] / q[0] / d:>+11.4f}{q[1]:>+12.0f}{q[2] / q[0]:>10.3f}")
    print()

print("=" * 104)
print("ПАРНЫЙ БЕТА-КОНТРОЛЬ НА ВСЁМ ПОЛЕ: та же сделка, направление принудительно LONG")
print("=" * 104)
print(f"{'холд':>6}{'сделок':>9}{'лифт на сделку':>17}{'парный t':>11}")
for h in sorted(pair):
    n, s, s2 = pair[h]
    var = (s2 - s * s / n) / (n - 1) if n > 1 else 0
    t = (s / n) / ((var / n) ** 0.5) if var > 0 else 0
    print(f"{h // 1440:>4}сут{n:>9}{s / n:>+17.3f}{t:>+11.2f}")
