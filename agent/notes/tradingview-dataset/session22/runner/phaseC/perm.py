#!/usr/bin/env python3
"""Перестановочный тест направления: одно плацебо — это один розыгрыш, а не вывод.

verdict.py считает ОДНО перемешивание направлений. Если оно оказалось лучше настоящего,
это ещё не значит ничего: с одной выборкой из нуля так бывает в половине случаев.
Здесь строится нулевое распределение.

Тест точен, а не приблизителен: в углу «лок 0 / трейл 100 / стоп 99» выход всегда по
концу окна холда, поэтому слот автора не зависит от направления, и набор сделок у real,
longonly и placebo_dir СОВПАДАЕТ до одной сделки. Значит перемешать сторону — значит
ровно переставить метки LONG/SHORT по тем же сделкам, доля LONG сохраняется.
По каждой сделке в trades_real.tsv лежит и pnl в лонг, и pnl в шорт по той же паре
свечей, поэтому 1000 перестановок — это арифметика, а не 1000 прогонов.

Мерятся две статистики:
  ПОЛЕ   — средний PnL всех сделок (отбора нет вовсе);
  ОТБОР  — walk-forward топ-K по прошлым 12 мес, как в рецепте.
p-value односторонний: доля перестановок, где плацебо не хуже настоящего.

usage: perm.py [panel_nv] [перестановок] [K] [MIN]
"""
import sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_nv"
NPERM = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
K = int(sys.argv[3]) if len(sys.argv) > 3 else 2
MIN_IDEAS = int(sys.argv[4]) if len(sys.argv) > 4 else 10
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def rnd(x):
    """fmix32 — своё ГПСЧ, чтобы прогон воспроизводился в точности."""
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


# ПОЛ СТОПА. В этом углу стоп 99 формально есть: для лонга уровень 0.01 от входа,
# для шорта 1.99 — то есть шорт на утроившейся цене движок выбивает на -99.4 %, а модель
# «досидеть до конца» досиживает и показывает -205 %. Своих таких сделок 2-5 на холд, но
# в ШОРТ-колонке их 16-31, а перестановка как раз назначает шорты случайно — без пола
# нулевое распределение занижалось бы, и значимость настоящего направления завышалась.
# Уровни выведены из SIMULATE_TRADE_FN и сверены с движком: он отдаёт ровно -99.399.
FLOOR_L, FLOOR_S = -99.2, -99.399

rows = defaultdict(list)                       # hold -> [(month, author, d, pnlL, pnlS)]
for line in open(f"{D}/trades_real.tsv"):
    p = line.rstrip("\n").split("\t")
    rows[int(p[3])].append((p[0], p[2], int(p[4]),
                            max(float(p[5]), FLOOR_L), max(float(p[6]), FLOOR_S)))

ideas = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))   # hold->month->author
for line in open(f"{D}/autnv_real.tsv"):
    p = line.rstrip("\n").split("\t")
    ideas[int(p[2])][p[0]][p[6]] += int(p[7])


def field(trades, dirs):
    s = 0.0
    for (_, _, _, pl, ps), d in zip(trades, dirs):
        s += pl if d > 0 else ps
    return s / len(trades)


def selected(trades, dirs, ideas_by_m):
    mon = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for (m, au, _, pl, ps), d in zip(trades, dirs):
        q = mon[m][au]
        q[0] += 1
        q[1] += pl if d > 0 else ps
    months = sorted(set(ideas_by_m) | set(mon), key=mkey)
    n = 0
    tot = 0.0
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < 2022:
            continue
        train = months[max(0, idx - 12):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0, 0.0])
        for m in train:
            for au, i in ideas_by_m[m].items():
                sc[au][0] += i
            for au, v in mon[m].items():
                sc[au][1] += v[0]
                sc[au][2] += v[1]
        elig = [a for a, v in sc.items() if v[0] >= MIN_IDEAS]
        if len(elig) < max(3 * K, 6):
            continue
        elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + 10) if sc[a][1] else -9, reverse=True)
        mt = mon.get(tm, {})
        for a in elig[:K]:
            if a in mt:
                n += mt[a][0]
                tot += mt[a][1]
    return (tot / n if n else 0.0), n


print("=" * 96)
print(f"ПЕРЕСТАНОВОЧНЫЙ ТЕСТ НАПРАВЛЕНИЯ, {NPERM} перестановок, отбор топ-{K} "
      f"с порогом {MIN_IDEAS} идей")
print("угол сетки: лок 0 / трейл 100 / стоп 99 («досидеть до конца холда»)")
print("=" * 96)
print(f"{'холд':>6}{'сделок':>8}{'':>4}{'поле real':>11}{'медиана нуля':>14}{'p':>8}"
      f"{'':>4}{'отбор real':>12}{'медиана нуля':>14}{'p':>8}")
for h in sorted(rows):
    tr = rows[h]
    d0 = [t[2] for t in tr]
    f0 = field(tr, d0)
    s0, ntr = selected(tr, d0, ideas[h])
    fn = []
    sn = []
    ge_f = ge_s = 0
    for k in range(NPERM):
        # перестановка меток стороны: доля LONG сохраняется точно
        order = sorted(range(len(tr)), key=lambda i: rnd(i * 2654435761 + k * 97 + 1))
        perm = [None] * len(tr)
        for pos, i in enumerate(order):
            perm[i] = d0[pos]
        f = field(tr, perm)
        s, _ = selected(tr, perm, ideas[h])
        fn.append(f)
        sn.append(s)
        ge_f += f >= f0
        ge_s += s >= s0
    fn.sort()
    sn.sort()
    print(f"{h // 1440:>4}сут{len(tr):>8}{'':>4}{f0:>+11.3f}{fn[NPERM // 2]:>+14.3f}"
          f"{(ge_f + 1) / (NPERM + 1):>8.3f}{'':>4}{s0:>+12.3f}{sn[NPERM // 2]:>+14.3f}"
          f"{(ge_s + 1) / (NPERM + 1):>8.3f}")
print()
print("p — доля перестановок, где перемешанное направление не хуже настоящего.")
print("p около 0.5 значит, что направление автора не отличимо от жребия;")
print("p выше 0.5 — что жребий в среднем ЛУЧШЕ.")
