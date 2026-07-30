#!/usr/bin/env python3
"""Проверка САМОГО рецепта: даёт ли рейтинг по прошлым 12 месяцам что-то сверх жребия.

perm.py перемешивает направление и отвечает на вопрос «есть ли сигнал в ленте».
Здесь другой, более неудобный вопрос: пусть сигнал есть — но выбирает ли наш рейтинг
авторов лучше, чем случайный тык? Нулевая гипотеза: из тех же допущенных авторов
берутся K СЛУЧАЙНЫХ вместо топ-K по PnL прошлых 12 месяцев. Всё остальное — те же
месяцы, те же сделки, тот же walk-forward.

p — доля жеребьёвок, где случайный выбор не хуже нашего рейтинга. Если p велико,
рейтинг не работает, сколько бы точек сетки он ни выигрывал: «лифт над полем» в фазах
A/B мерил другое — отобранных против всех допущенных при ОДНОМ розыгрыше, а не против
распределения.

usage: permsel.py [panel_nv] [жеребьёвок] [MIN]
"""
import sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_nv"
NDRAW = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
MIN_IDEAS = int(sys.argv[3]) if len(sys.argv) > 3 else 10
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def rnd(x):
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


mon = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0, 0.0])))   # hold->month->author
ideas = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
for line in open(f"{D}/autnv_real.tsv"):
    p = line.rstrip("\n").split("\t")
    ideas[int(p[2])][p[0]][p[6]] += int(p[7])
for line in open(f"{D}/trdnv_real.tsv"):
    p = line.rstrip("\n").split("\t")
    q = mon[int(p[2])][p[0]][p[6]]
    q[0] += int(p[7])
    q[1] += float(p[8])


def evaluate(h, K, chooser):
    """chooser(elig, sc, tm) -> список из K авторов."""
    M = mon[h]
    IB = ideas[h]
    months = sorted(set(IB) | set(M), key=mkey)
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
            for au, i in IB[m].items():
                sc[au][0] += i
            for au, v in M[m].items():
                sc[au][1] += v[0]
                sc[au][2] += v[1]
        elig = sorted(a for a, v in sc.items() if v[0] >= MIN_IDEAS)
        if len(elig) < max(3 * K, 6):
            continue
        mt = M.get(tm, {})
        for a in chooser(elig, sc, tm, K):
            if a in mt:
                n += mt[a][0]
                tot += mt[a][1]
    return (tot / n if n else 0.0), n


def top_by_pnl(elig, sc, tm, K):
    e = sorted(elig, key=lambda a: sc[a][2] / (sc[a][1] + 10) if sc[a][1] else -9, reverse=True)
    return e[:K]


def bottom_by_pnl(elig, sc, tm, K):
    """Обратный рейтинг. Если рейтинг что-то ловит, худшие обязаны быть заметно хуже
    жребия — это проверка самой машинерии, а не гипотезы."""
    e = sorted(elig, key=lambda a: sc[a][2] / (sc[a][1] + 10) if sc[a][1] else 9)
    return e[:K]


def shash(s):
    """FNV-1a. Своё, а не встроенный hash(): тот рандомизирован по PYTHONHASHSEED,
    и жеребьёвка не воспроизвелась бы при повторе."""
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


def make_random(seed):
    def pick(elig, sc, tm, K):
        h = rnd(seed * 1000003 + len(elig) * 31 + shash(tm))
        e = sorted(elig, key=lambda a: rnd(h ^ shash(a)))
        return e[:K]
    return pick


print("=" * 92)
print(f"РЕЙТИНГ ПРОТИВ ЖРЕБИЯ: {NDRAW} случайных выборов K авторов из тех же допущенных")
print(f"допуск {MIN_IDEAS} идей за 12 мес, walk-forward с 2022, "
      f"угол лок 0 / трейл 100 / стоп 99")
print("=" * 92)
print(f"{'холд':>6}{'K':>4}{'сделок':>8}{'верх':>10}{'p верха':>9}"
      f"{'низ':>10}{'p низа':>9}{'медиана жребия':>16}")
for h in sorted(mon):
    for K in (1, 2, 3, 5, 10):
        real, ntr = evaluate(h, K, top_by_pnl)
        if ntr < 30:
            continue
        anti, _ = evaluate(h, K, bottom_by_pnl)
        null = []
        for s in range(NDRAW):
            v, m = evaluate(h, K, make_random(s))
            if m:
                null.append(v)
        null.sort()
        n = len(null)
        p_top = (sum(1 for v in null if v >= real) + 1) / (n + 1)
        p_bot = (sum(1 for v in null if v <= anti) + 1) / (n + 1)
        print(f"{h // 1440:>4}сут{K:>4}{ntr:>8}{real:>+10.3f}{p_top:>9.3f}"
              f"{anti:>+10.3f}{p_bot:>9.3f}{null[n // 2]:>+16.3f}")
    print()
print("p верха — доля жеребьёвок, где случайный выбор не хуже топ-K по прошлым 12 мес.")
print("p низа  — доля жеребьёвок, где случайный выбор не лучше худших K по тем же 12 мес.")
print("Маленькое p низа при большом p верха значит: рейтинг видит плохих, но не видит хороших.")

# ------------------------------------------------------ чёрный список вместо белого
print()
print("=" * 92)
print("ЧЁРНЫЙ СПИСОК ВМЕСТО БЕЛОГО: берём ВСЕХ допущенных, кроме худших B по рейтингу")
print("=" * 92)
print(f"{'холд':>6}{'выкинуто':>10}{'сделок':>9}{'на сделку':>12}{'суммарно':>12}")


def drop_bottom(B):
    def pick(elig, sc, tm, K):
        e = sorted(elig, key=lambda a: sc[a][2] / (sc[a][1] + 10) if sc[a][1] else -9,
                   reverse=True)
        return e[:len(e) - B] if B < len(e) else []
    return pick


for h in sorted(mon):
    for B in (0, 3, 5, 10, 20):
        v, ntr = evaluate(h, B, drop_bottom(B))
        if not ntr:
            continue
        print(f"{h // 1440:>4}сут{B:>10}{ntr:>9}{v:>+12.3f}{v * ntr:>+12.0f}")
    print()
