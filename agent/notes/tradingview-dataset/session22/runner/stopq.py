#!/usr/bin/env python3
"""Два вопроса Петра, ответ по уже посчитанной сетке фазы B (11 520 точек).

Q1: нужно ли менять стоп в зависимости от времени?
Q2: нужен ли trailing stop зеркально к trailing take?
"""
import sys
from collections import defaultdict

D = sys.argv[1]
STOPS = [6, 8, 10, 12, 14, 16, 20, 25, 30, 40, 60, 99]
HOLDS = [10080, 14400, 17280, 20160]
TRAILS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 25, 30, 100]

# rule -> pnl, trades, exits(hard,trail,lock,time,trunc)
agg = defaultdict(lambda: [0.0, 0, 0, 0, 0, 0, 0])
for line in open(f"{D}/pnt_all.tsv"):
    p = line.rstrip("\n").split("\t")
    k = (int(p[2]), float(p[3]), float(p[4]), float(p[5]))   # hold lock stop trail
    q = agg[k]
    q[0] += float(p[6])
    q[1] += int(p[10])
    for j, c in enumerate(range(13, 18)):
        q[2 + j] += int(p[c])

print("=" * 100)
print("Q1. ЧТО СТОП СТОИТ, И ЗАВИСИТ ЛИ ЭТО ОТ ДЛИНЫ ХОЛДА")
print("=" * 100)
print("Средний суммарный PnL точки, % (усреднение по локу и трейлингу):\n")
hdr = "  стоп " + "".join(f"{h//1440:>9}сут" for h in HOLDS)
print(hdr)
for s in STOPS:
    row = f"  {s:<5}"
    for h in HOLDS:
        vals = [v[0] for k, v in agg.items() if k[2] == s and k[0] == h]
        row += f"{sum(vals)/len(vals):>12.0f}" if vals else f"{'—':>12}"
    print(row)

print("\nЦена стопа = (PnL при стопе 99) − (PnL при стопе X), парно по лок×трейл×холд:\n")
print("  стоп " + "".join(f"{h//1440:>9}сут" for h in HOLDS))
for s in STOPS[:-1]:
    row = f"  {s:<5}"
    for h in HOLDS:
        d = [agg[(h, lk, 99.0, t)][0] - agg[(h, lk, s, t)][0]
             for (hh, lk, ss, t) in agg if hh == h and ss == s and (h, lk, 99.0, t) in agg]
        row += f"{sum(d)/len(d):>+12.0f}" if d else f"{'—':>12}"
    print(row)

print("\nДоля выходов по стопу, % от всех сделок (усреднение по локу и трейлингу):\n")
print("  стоп " + "".join(f"{h//1440:>9}сут" for h in HOLDS))
for s in STOPS:
    row = f"  {s:<5}"
    for h in HOLDS:
        sel = [v for k, v in agg.items() if k[2] == s and k[0] == h]
        tot = sum(sum(v[2:7]) for v in sel)
        row += f"{100*sum(v[2] for v in sel)/tot:>11.0f}%" if tot else f"{'—':>12}"
    print(row)

print()
print("=" * 100)
print("Q2. ЗАМЕНЯЕТ ЛИ ТРЕЙЛИНГ СТОП — срез холд 14 сут, усреднение по локу")
print("=" * 100)
print("Средний суммарный PnL точки, %:\n")
print("  трейл " + "".join(f"{s:>8}" for s in [6, 10, 16, 25, 40, 60, 99]))
for t in TRAILS:
    row = f"  {t:<6}"
    for s in [6, 10, 16, 25, 40, 60, 99]:
        vals = [v[0] for k, v in agg.items() if k[0] == 20160 and k[3] == t and k[2] == float(s)]
        row += f"{sum(vals)/len(vals):>8.0f}" if vals else f"{'—':>8}"
    print(row)

print("\nПри отсутствии стопа (99) — что делает трейлинг, холд 14 сут:\n")
print(f"  {'трейл':<8}{'ср. PnL':>10}{'сделок':>9}{'по трейлу':>11}{'по замку':>10}{'по времени':>12}")
for t in TRAILS:
    sel = [v for k, v in agg.items() if k[0] == 20160 and k[3] == t and k[2] == 99.0]
    if not sel:
        continue
    tot = sum(sum(v[2:7]) for v in sel) or 1
    print(f"  {t:<8}{sum(v[0] for v in sel)/len(sel):>10.0f}{sum(v[1] for v in sel)//len(sel):>9}"
          f"{100*sum(v[3] for v in sel)/tot:>10.0f}%{100*sum(v[4] for v in sel)/tot:>9.0f}%"
          f"{100*sum(v[6] for v in sel)/tot:>11.0f}%")
