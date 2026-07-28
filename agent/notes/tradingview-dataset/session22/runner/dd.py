#!/usr/bin/env python3
"""Просадка и состав выходов для избранных точек фазы B.

Сумма pnlPercent — это НЕ доходность: каждая сделка считается ставкой
фиксированного размера. Без стопа одна сделка может стоить десятки процентов,
поэтому смотрим просадку помесячной кривой и долю выходов по времени.
"""
import sys
from collections import defaultdict

D = sys.argv[1]
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])

WANT = {
    ("20160", "0", "99", "100"):  "лок 0 / трейл 100 / стоп 99  (нет управления)",
    ("20160", "20", "99", "8"):   "лок 20 / трейл 8 / стоп 99",
    ("14400", "20", "20", "14"):  "лок 20 / трейл 14 / стоп 20  (лучшая по отбору)",
    ("17280", "16", "10", "6"):   "лок 16 / трейл 6 / стоп 10",
    ("20160", "8", "10", "8"):    "лок 8 / трейл 8 / стоп 10   (лучшая фазы A)",
}

per = defaultdict(lambda: defaultdict(float))   # rule -> month -> pnl
agg = defaultdict(lambda: [0, 0.0, 0.0, 0, 0, 0, 0, 0])
# trades, pnl, winrate*trades, hard_stop, trail, lock, time, trunc
for line in open(f"{D}/pnt_all.tsv"):
    p = line.rstrip("\n").split("\t")
    r = (p[2], p[3], p[4], p[5])
    if r not in WANT:
        continue
    per[r][p[0]] += float(p[6])
    q = agg[r]
    n = int(p[10])
    q[0] += n
    q[1] += float(p[6])
    q[2] += float(p[8]) * n
    for j, k in enumerate(range(13, 18)):
        q[3 + j] += int(p[k])

print(f"{'правило':<46}{'сделок':>8}{'сумма':>10}{'на сделку':>11}{'win':>7}"
      f"{'макс.DD':>10}{'мес+':>8}{'стоп%':>7}{'время%':>8}")
for r, name in WANT.items():
    if r not in agg:
        print(f"{name:<46}  (нет данных)")
        continue
    q = agg[r]
    months = sorted(per[r], key=mkey)
    cum = 0.0
    peak = 0.0
    dd = 0.0
    pos = 0
    for m in months:
        v = per[r][m]
        cum += v
        if v > 0:
            pos += 1
        peak = max(peak, cum)
        dd = max(dd, peak - cum)
    tot_exits = sum(q[3:8]) or 1
    print(f"{name:<46}{q[0]:>8}{q[1]:>+10.0f}{q[1]/max(q[0],1):>+11.3f}"
          f"{q[2]/max(q[0],1):>7.2f}{-dd:>10.0f}{pos:>4}/{len(months):<3}"
          f"{100*q[3]/tot_exits:>7.0f}{100*q[6]/tot_exits:>8.0f}")
