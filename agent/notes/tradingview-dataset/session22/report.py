#!/usr/bin/env python3
"""Фаза A: ответ на вопрос сессии — продолжается ли лифт за лок 5 % и трейл 5 %."""
import sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "."
LOCKS = [4, 5, 6, 7, 8]
TRAILS = [3, 4, 5, 6, 7, 8]
STOPS = [8, 8.5, 9, 9.5, 10]
HOLDS = [17280, 18720, 20160]

# --- сырые точки сетки ------------------------------------------------------
raw = defaultdict(lambda: [0.0, 0, 0])          # rule -> pnl, trades, cells
try:
    for line in open(f"{D}/pnt_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (float(p[3]), float(p[5]), float(p[4]), int(p[2]))   # lock, trail, stop, hold
        q = raw[r]
        q[0] += float(p[6])
        q[1] += int(p[10])
        q[2] += 1
except FileNotFoundError:
    pass

lift = {}
for line in open(f"{D}/lift_by_rule.tsv"):
    if line.startswith("hold"):
        continue
    p = line.rstrip("\n").split("\t")
    r = (float(p[1]), float(p[3]), float(p[2]), int(p[0]))   # lock, trail, stop, hold
    lift[r] = dict(months=int(p[4]), wins=int(p[5]), trades=int(p[6]), total=float(p[7]),
                   avg=float(p[8]), field=float(p[9]), lift=float(p[10]),
                   pos_years=int(p[11]), n_years=int(p[12]))

print("=" * 96)
print(f"A1. СЫРАЯ СЕТКА ЗА КРАЕМ: {len(raw)} точек, {sum(v[2] for v in raw.values())} тикеро-месяцев")
print("=" * 96)
tot = sorted(((v[0], k) for k, v in raw.items()), reverse=True) or [(0.0, (0, 0, 0, 0))]
pos = sum(1 for v, _ in tot if v > 0)
print(f"точек с положительным суммарным PnL за 5.5 лет: {pos} из {len(tot)}")
print(f"лучшая {tot[0][0]:+.0f}% (лок {tot[0][1][0]}, трейл {tot[0][1][1]}, стоп {tot[0][1][2]}, "
      f"холд {tot[0][1][3]//1440}сут), медиана {tot[len(tot)//2][0]:+.0f}%, худшая {tot[-1][0]:+.0f}%")
print("для сравнения: лучшая точка старой сетки 21 280 = −1948%, медиана −3476%")
print("\nсуммарный PnL сетки (сумма по всем тикеро-месяцам), холд 14 сут, стоп 10%:")
print("      " + "".join(f"{'trail ' + str(t):>12}" for t in TRAILS))
for lk in LOCKS:
    row = f"lock {lk}"
    for t in TRAILS:
        v = raw.get((float(lk), float(t), 10.0, 20160))
        row += f"{v[0]:>12.0f}" if v else f"{'—':>12}"
    print(row)

print()
print("=" * 96)
print("A2. ЛИФТ ОТБОРА АВТОРОВ (walk-forward: топ-3 по PnL за 12 мес, с 2022 г.)")
print("=" * 96)
print("матрица лифта, % на сделку сверх поля тех же символов — холд 14 сут, стоп 10%:")
print("      " + "".join(f"{'trail ' + str(t):>12}" for t in TRAILS))
for lk in LOCKS:
    row = f"lock {lk}"
    for t in TRAILS:
        v = lift.get((float(lk), float(t), 10.0, 20160))
        row += f"{v['lift']:>+12.3f}" if v else f"{'—':>12}"
    print(row)
print("\nтот же срез — сделок в отборе:")
print("      " + "".join(f"{'trail ' + str(t):>12}" for t in TRAILS))
for lk in LOCKS:
    row = f"lock {lk}"
    for t in TRAILS:
        v = lift.get((float(lk), float(t), 10.0, 20160))
        row += f"{v['trades']:>12}" if v else f"{'—':>12}"
    print(row)
print("\nтот же срез — лет с положительным лифтом из 5:")
print("      " + "".join(f"{'trail ' + str(t):>12}" for t in TRAILS))
for lk in LOCKS:
    row = f"lock {lk}"
    for t in TRAILS:
        v = lift.get((float(lk), float(t), 10.0, 20160))
        row += f"{str(v['pos_years']) + '/' + str(v['n_years']):>12}" if v else f"{'—':>12}"
    print(row)

print()
print("=" * 96)
print("A3. МАРГИНАЛЫ ПО ОСЯМ (усреднение по остальным трём осям, все 450 точек)")
print("=" * 96)


def marg(axis):
    agg = defaultdict(lambda: [0, 0.0, 0, 0.0, 0])   # n, sum lift, npos, sum avg, sum field
    for k, v in lift.items():
        a = k[axis]
        q = agg[a]
        q[0] += 1
        q[1] += v['lift']
        q[3] += v['avg']
        q[4] += v['field']
        if v['lift'] > 0:
            q[2] += 1
    return agg


for axis, name, vals in ((0, "lock", LOCKS), (1, "trail", TRAILS),
                         (2, "stop", STOPS), (3, "hold", HOLDS)):
    agg = marg(axis)
    print(f"\n{name}:")
    print(f"  {'значение':<12}{'точек':>7}{'ср.лифт':>10}{'лифт>0':>9}"
          f"{'ср.отбор':>11}{'ср.поле':>10}")
    for a in vals:
        q = agg.get(float(a) if axis != 3 else a)
        if not q:
            continue
        lab = f"{a//1440}сут" if name == "hold" else str(a)
        print(f"  {lab:<12}{q[0]:>7}{q[1]/q[0]:>+10.3f}{q[2]:>6}/{q[0]:<3}"
              f"{q[3]/q[0]:>+11.3f}{q[4]/q[0]:>+10.3f}")

print()
print("=" * 96)
print("A4. МОНОТОННОСТЬ: где по каждой оси стоит максимум лифта")
print("=" * 96)
for axis, name, vals in ((0, "lock", LOCKS), (1, "trail", TRAILS)):
    peak = defaultdict(int)
    grew = 0
    fell = 0
    prof = 0
    others = defaultdict(list)
    for k, v in lift.items():
        rest = tuple(x for i, x in enumerate(k) if i != axis)
        others[rest].append((k[axis], v['lift']))
    for rest, pts in others.items():
        pts.sort()
        if len(pts) < len(vals):
            continue
        prof += 1
        best = max(pts, key=lambda x: x[1])[0]
        peak[best] += 1
        at5 = dict(pts).get(5.0)
        beyond = [l for a, l in pts if a > 5]
        if at5 is not None and beyond:
            if max(beyond) > at5:
                grew += 1
            else:
                fell += 1
    print(f"\n{name}: полных профилей {prof}")
    print("  максимум лифта стоит на: " +
          ", ".join(f"{a}: {peak.get(float(a), 0)}" for a in vals))
    print(f"  за 5 % лифт ВЫШЕ, чем на 5 %: {grew} профилей; НИЖЕ или равен: {fell}")

print()
print("=" * 96)
print("A5. ТОП-12 ТОЧЕК ПО ЛИФТУ")
print("=" * 96)
print(f"{'lock':>6}{'trail':>7}{'stop':>7}{'hold':>7}{'мес':>6}{'сделок':>8}"
      f"{'суммарно':>11}{'на сделку':>11}{'поле':>9}{'лифт':>9}{'лет+':>6}")
for k, v in sorted(lift.items(), key=lambda x: -x[1]['lift'])[:12]:
    print(f"{k[0]:>6}{k[1]:>7}{k[2]:>7}{k[3]//1440:>7}{v['months']:>6}{v['trades']:>8}"
          f"{v['total']:>+11.1f}{v['avg']:>+11.3f}{v['field']:>+9.3f}{v['lift']:>+9.3f}"
          f"{v['pos_years']:>4}/{v['n_years']}")
print("\nякорь сессии 21 (лок 5, трейл 5, стоп 10, холд 14 сут):")
v = lift.get((5.0, 5.0, 10.0, 20160))
if v:
    print(f"  сделок {v['trades']}, суммарно {v['total']:+.1f}%, на сделку {v['avg']:+.3f}%, "
          f"поле {v['field']:+.3f}%, лифт {v['lift']:+.3f}%, лет с плюсом {v['pos_years']}/{v['n_years']}")

print()
print("=" * 96)
print("A6. УСТОЙЧИВОСТЬ САМОГО ОТБОРА: совпадают ли выбранные авторы у соседних точек")
print("=" * 96)
sel = defaultdict(dict)
try:
    for line in open(f"{D}/sel_by_rule.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (float(p[1]), float(p[3]), float(p[2]), int(p[0]))
        sel[r][p[4]] = set(p[5:])
except FileNotFoundError:
    sel = {}
if sel:
    anchor = (5.0, 5.0, 10.0, 20160)
    base = sel.get(anchor, {})
    print(f"якорь: лок 5, трейл 5, стоп 10, холд 14 сут — {len(base)} месяцев отбора")
    print("доля совпадения топ-3 с якорем (пересечение / 3), срез стоп 10, холд 14 сут:")
    print("      " + "".join(f"{'trail ' + str(t):>12}" for t in TRAILS))
    for lk in LOCKS:
        row = f"lock {lk}"
        for t in TRAILS:
            s = sel.get((float(lk), float(t), 10.0, 20160))
            if not s or not base:
                row += f"{'—':>12}"
                continue
            com = [m for m in base if m in s]
            if not com:
                row += f"{'—':>12}"
                continue
            ov = sum(len(base[m] & s[m]) for m in com) / (3 * len(com))
            row += f"{ov:>12.2f}"
        print(row)
