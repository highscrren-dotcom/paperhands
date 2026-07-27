#!/usr/bin/env python3
"""Сводка по любой сетке: маргиналы по осям, топ точек, доля плюсовых."""
import sys
from collections import defaultdict
D = sys.argv[1]
TITLE = sys.argv[2] if len(sys.argv) > 2 else D

rows = []
for line in open(f"{D}/lift_by_rule.tsv"):
    if line.startswith("hold"):
        continue
    p = line.rstrip("\n").split("\t")
    rows.append(dict(hold=int(p[0]), lock=float(p[1]), stop=float(p[2]), trail=float(p[3]),
                     months=int(p[4]), wins=int(p[5]), trades=int(p[6]), total=float(p[7]),
                     avg=float(p[8]), field=float(p[9]), lift=float(p[10]),
                     py=int(p[11]), ny=int(p[12])))
raw = defaultdict(lambda: [0.0, 0])
try:
    for line in open(f"{D}/pnt_all.tsv"):
        p = line.rstrip("\n").split("\t")
        k = (int(p[2]), float(p[3]), float(p[4]), float(p[5]))
        raw[k][0] += float(p[6]); raw[k][1] += int(p[10])
except FileNotFoundError:
    pass

print("=" * 100)
print(f"{TITLE}: точек {len(rows)}")
print("=" * 100)
if raw:
    tot = sorted(((v[0], k) for k, v in raw.items()), reverse=True)
    pos = sum(1 for v, _ in tot if v > 0)
    print(f"СЫРАЯ СЕТКА: в плюсе {pos} из {len(tot)}; лучшая {tot[0][0]:+.0f}% "
          f"(холд {tot[0][1][0]//1440}сут лок {tot[0][1][1]} стоп {tot[0][1][2]} трейл {tot[0][1][3]}), "
          f"медиана {tot[len(tot)//2][0]:+.0f}%")
    print("  топ-6 сырых:")
    for v, k in tot[:6]:
        print(f"    лок {k[1]:>5} трейл {k[3]:>6} стоп {k[2]:>5} холд {k[0]//1440:>3}сут -> {v:>+9.0f}% "
              f"({raw[k][1]} сделок)")
p = [r for r in rows if r['avg'] > 0]
print(f"\nОТБОР ТОП-3: в плюсе на сделку {len(p)} из {len(rows)}; "
      f"из них >=4 лет из 5: {sum(1 for r in p if r['py'] >= 4)}; все 5 лет: {sum(1 for r in p if r['py'] == r['ny'])}")
print(f"лифт>0: {sum(1 for r in rows if r['lift'] > 0)} из {len(rows)}")

for ax in ("lock", "trail", "stop", "hold"):
    agg = defaultdict(lambda: [0, 0.0, 0.0, 0, 0.0])
    for r in rows:
        q = agg[r[ax]]; q[0] += 1; q[1] += r['lift']; q[2] += r['avg']; q[4] += r['field']
        if r['avg'] > 0: q[3] += 1
    vals = sorted(agg)
    if len(vals) < 2:
        continue
    print(f"\n{ax}:")
    print(f"  {'знач':<10}{'точек':>7}{'ср.лифт':>10}{'ср.отбор':>11}{'ср.поле':>10}{'отбор>0':>10}"
          + ("      ср.сырой" if raw else ""))
    for a in vals:
        q = agg[a]
        lab = f"{int(a)//1440}сут" if ax == "hold" else f"{a:g}"
        line = f"  {lab:<10}{q[0]:>7}{q[1]/q[0]:>+10.3f}{q[2]/q[0]:>+11.3f}{q[4]/q[0]:>+10.3f}{q[3]:>7}/{q[0]:<3}"
        if raw:
            sel = [v[0] for k, v in raw.items() if {"lock": k[1], "trail": k[3], "stop": k[2], "hold": k[0]}[ax] == a]
            if sel:
                line += f"{sum(sel)/len(sel):>+14.0f}"
        print(line)

print(f"\nТОП-10 ПО PnL ОТБОРА НА СДЕЛКУ")
print(f"{'лок':>6}{'трейл':>7}{'стоп':>7}{'холд':>7}{'мес':>5}{'сделок':>8}{'суммарно':>11}"
      f"{'на сделку':>11}{'поле':>9}{'лифт':>9}{'лет+':>7}")
for r in sorted(rows, key=lambda r: -r['avg'])[:10]:
    print(f"{r['lock']:>6g}{r['trail']:>7g}{r['stop']:>7g}{r['hold']//1440:>7}{r['months']:>5}"
          f"{r['trades']:>8}{r['total']:>+11.1f}{r['avg']:>+11.3f}{r['field']:>+9.3f}{r['lift']:>+9.3f}"
          f"{r['py']:>5}/{r['ny']}")
