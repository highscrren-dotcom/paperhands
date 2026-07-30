#!/usr/bin/env python3
"""Гейт фазы C: длинный холд — это эдж или это бета?

Контроли объявлены ДО прогона (PLAN_PHASE_C.md, HANDOFF_PHASE_C.md) и здесь только
считаются. Лента на 72 % LONG, поэтому «27 лучше 14» само по себе не значит ничего:
чем длиннее холд, тем сильнее любая стратегия похожа на «купил и держал».

Три контроля:
  1. ПАРНЫЙ BUY & HOLD — те же самые сделки (те же авторы, входы, длительность),
     но направление принудительно LONG. Разница ровно в направлении и только в нём.
  2. ПЛАЦЕБО ПО НАПРАВЛЕНИЮ — направления перемешаны внутри тикеро-месяца
     (доля LONG сохранена), весь отбор гоняется заново.
  3. ПЛАЦЕБО ПО ВРЕМЕНИ — входы сдвинуты на ±(1..30) суток, направление своё.
Плюс календарный buy & hold по каждому символу за то же окно — верхняя рамка «беты».

Отбор везде walk-forward: рейтинг строится ТОЛЬКО на прошлых 12 месяцах,
измеряется на следующем. Протокол тот же, что в фазах A/B (sweep.py, recipe.py):
окно 12 мес, скоринг PnL/(сделок+shrink), допуск по числу идей, топ-K, с 2022 года.

usage: verdict.py [panel_nv] [K] [MIN]
"""
import json, os, sys
from collections import defaultdict

D = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_nv"
K_MAIN = int(sys.argv[2]) if len(sys.argv) > 2 else 2
MIN_MAIN = int(sys.argv[3]) if len(sys.argv) > 3 else 10
UNION = "/data/backtests/_agent/phaseC/union"
VARIANTS = ["real", "longonly", "placebo_dir", "placebo_ts", "placebo_shift"]
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def load(variant):
    """-> holds -> (ideas_by_month, mon, msa, monL)

    Колонки trdnv_*.tsv: 0 месяц, 1 символ, 2 холд, 3 лок, 4 стоп, 5 трейл, 6 автор,
    7 сделок, 8 pnl, 9 плюсовых, 10 pnl тех же сделок в LONG, 11 плюсовых в LONG,
    12 сумма парных разностей, 13 сумма их квадратов (последние четыре — только real).
    """
    out = defaultdict(lambda: (defaultdict(lambda: defaultdict(int)),
                               defaultdict(lambda: defaultdict(lambda: [0, 0.0])),
                               defaultdict(lambda: defaultdict(lambda: [0, 0.0])),
                               defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0, 0.0]))))
    for line in open(f"{D}/autnv_{variant}.tsv"):
        p = line.rstrip("\n").split("\t")
        out[int(p[2])][0][p[0]][p[6]] += int(p[7])
    for line in open(f"{D}/trdnv_{variant}.tsv"):
        p = line.rstrip("\n").split("\t")
        h = int(p[2])
        _, mon, msa, monL = out[h]
        n, pnl = int(p[7]), float(p[8])
        q = mon[p[0]][p[6]]; q[0] += n; q[1] += pnl
        z = msa[p[0]][(p[1], p[6])]; z[0] += n; z[1] += pnl
        if len(p) > 13:
            w = monL[p[0]][p[6]]
            w[0] += n; w[1] += float(p[10]); w[2] += float(p[12]); w[3] += float(p[13])
    return out


def walk(ideas_by_m, mon, msa, monL, K, MIN, W=12, shrink=10, start=2022):
    months = sorted(set(ideas_by_m) | set(mon), key=mkey)
    real = [0, 0.0]; fld = [0, 0.0]; lng = [0, 0.0, 0.0, 0.0]
    curve = []; curveL = []
    peryear = defaultdict(lambda: [0, 0.0])
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
        elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + shrink) if sc[a][1] else -9,
                  reverse=True)
        top = set(elig[:K])
        mt = mon.get(tm, {})
        if not mt:
            continue
        mp = mpl = 0.0; b0 = real[0]
        for a in top:
            if a in mt:
                real[0] += mt[a][0]; real[1] += mt[a][1]; mp += mt[a][1]
                peryear[mkey(tm)[0]][0] += mt[a][0]
                peryear[mkey(tm)[0]][1] += mt[a][1]
            if a in monL.get(tm, {}):
                v = monL[tm][a]
                lng[0] += v[0]; lng[1] += v[1]; lng[2] += v[2]; lng[3] += v[3]
                mpl += v[1]
        if real[0] == b0:
            continue
        curve.append(mp); curveL.append(mpl)
        es = set(elig); syms = {s for (s, a) in msa[tm] if a in top}
        for (s, a), v in msa[tm].items():
            if s in syms and a in es:
                fld[0] += v[0]; fld[1] += v[1]

    def dd(c):
        cum = peak = worst = 0.0
        for v in c:
            cum += v; peak = max(peak, cum); worst = max(worst, peak - cum)
        return worst
    n = len(curve)
    # парный t по разностям «сделка автора минус та же сделка в LONG»
    tstat = 0.0
    if lng[0] > 1:
        m = lng[2] / lng[0]
        var = (lng[3] - lng[2] ** 2 / lng[0]) / (lng[0] - 1)
        if var > 0:
            tstat = m / (var / lng[0]) ** 0.5
    return dict(months=n, trades=real[0], total=real[1], tstat=tstat,
                avg=real[1] / real[0] if real[0] else 0.0,
                field=fld[1] / fld[0] if fld[0] else 0.0,
                dd=dd(curve), posm=sum(1 for v in curve if v > 0),
                years=len(peryear), ypos=sum(1 for v in peryear.values() if v[1] > 0),
                ltrades=lng[0], ltotal=lng[1],
                lavg=lng[1] / lng[0] if lng[0] else 0.0, ldd=dd(curveL))


DATA = {v: load(v) for v in VARIANTS}
HOLDS = sorted(DATA["real"])

print("=" * 112)
print(f"ГЕЙТ ФАЗЫ C: отбор топ-{K_MAIN}, порог {MIN_MAIN} идей за 12 мес, "
      f"walk-forward с 2022, издержки 0.4 % на круг")
print("угол сетки: лок 0 / трейл 100 / стоп 99 = «досидеть до конца холда»")
print("=" * 112)
print(f"{'холд':>6}{'вариант':>14}{'мес':>5}{'сделок':>8}{'на сделку':>11}{'поле':>9}"
      f"{'лифт':>9}{'суммарно':>11}{'просадка':>10}{'приб.мес':>10}{'лет+':>7}")
res = {}
for h in HOLDS:
    for v in VARIANTS:
        r = walk(*DATA[v][h], K_MAIN, MIN_MAIN)
        res[(h, v)] = r
        print(f"{h // 1440:>4}сут{v:>14}{r['months']:>5}{r['trades']:>8}{r['avg']:>+11.3f}"
              f"{r['field']:>+9.3f}{r['avg'] - r['field']:>+9.3f}{r['total']:>+11.0f}"
              f"{-r['dd']:>10.0f}{r['posm']:>5}/{r['months']:<4}{r['ypos']:>4}/{r['years']}")
    print()

print("=" * 112)
print("КОНТРОЛЬ 1 — ПАРНЫЙ BUY & HOLD: те же сделки, направление принудительно LONG")
print("=" * 112)
print(f"{'холд':>6}{'сделок':>8}{'стратегия':>12}{'та же в LONG':>15}{'лифт':>10}{'парный t':>10}"
      f"{'сумма страт.':>14}{'сумма LONG':>13}{'просадка страт.':>17}{'просадка LONG':>16}")
for h in HOLDS:
    r = res[(h, "real")]
    print(f"{h // 1440:>4}сут{r['trades']:>8}{r['avg']:>+12.3f}{r['lavg']:>+15.3f}"
          f"{r['avg'] - r['lavg']:>+10.3f}{r['tstat']:>+10.2f}{r['total']:>+14.0f}{r['ltotal']:>+13.0f}"
          f"{-r['dd']:>17.0f}{-r['ldd']:>16.0f}")

print()
print("=" * 112)
print("КОНТРОЛЬ 2/3 — ПЛАЦЕБО: проходит ли отбор на перемешанном направлении и сдвинутом входе")
print("=" * 112)
print(f"{'холд':>6}{'real на сделку':>17}{'плацебо направл.':>19}{'плацебо время':>17}"
      f"{'longonly':>12}")
for h in HOLDS:
    print(f"{h // 1440:>4}сут{res[(h, 'real')]['avg']:>+17.3f}"
          f"{res[(h, 'placebo_dir')]['avg']:>+19.3f}"
          f"{res[(h, 'placebo_ts')]['avg']:>+17.3f}"
          f"{res[(h, 'longonly')]['avg']:>+12.3f}")

print()
print("=" * 112)
print("КАЛЕНДАРНЫЙ BUY & HOLD по символам за окно оценки (2022-01-01 .. край склада)")
print("=" * 112)
print(f"{'символ':<12}{'старт':>14}{'конец':>14}{'buy & hold':>14}")
START_MS = 1_640_995_200_000            # 2022-01-01T00:00Z
tot = []
for symbol in sorted(os.listdir(UNION)):
    d = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
    if not os.path.isdir(d):
        continue
    ts = []
    with os.scandir(d) as it:
        for e in it:
            ts.append(int(e.name[:-5]))
    ts.sort()
    fwd = [t for t in ts if t >= START_MS]
    if len(fwd) < 2:
        continue
    a = json.load(open(f"{d}/{fwd[0]}.json"))
    b = json.load(open(f"{d}/{fwd[-1]}.json"))
    ch = (b["close"] / a["open"] - 1) * 100
    tot.append(ch)
    print(f"{symbol:<12}{a['open']:>14.6g}{b['close']:>14.6g}{ch:>+13.1f}%")
if tot:
    print(f"{'равновзвешенно':<12}{'':>14}{'':>14}{sum(tot) / len(tot):>+13.1f}%")

print()
print("=" * 112)
print("ВЕРДИКТ")
print("=" * 112)
h27 = max(HOLDS); h14 = min(HOLDS)
r27, r14 = res[(h27, "real")], res[(h14, "real")]
print(f"холд {h14 // 1440} сут: {r14['avg']:+.3f} %/сделку, всего {r14['total']:+.0f} %")
print(f"холд {h27 // 1440} сут: {r27['avg']:+.3f} %/сделку, всего {r27['total']:+.0f} %")
lift = r27['avg'] - r27['lavg']
worst_plac = max(res[(h27, 'placebo_dir')]['avg'], res[(h27, 'placebo_ts')]['avg'])
print(f"лифт над тем же в LONG на {h27 // 1440} сут: {lift:+.3f} %/сделку "
      f"(парный t = {r27['tstat']:+.2f} на {r27['ltrades']} сделках)")
print(f"лучшее плацебо на {h27 // 1440} сут: {worst_plac:+.3f} %/сделку")
if lift > 0 and r27['avg'] > worst_plac:
    print("ГЕЙТ ПРОЙДЕН: лифт над buy & hold положителен и плацебо не дотягивает")
else:
    print("ГЕЙТ НЕ ПРОЙДЕН: на длинном холде это бета, а не эдж")
