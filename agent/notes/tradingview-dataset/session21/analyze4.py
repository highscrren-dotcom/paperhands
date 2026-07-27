#!/usr/bin/env python3
"""Решающий тест: держится ли ЛУЧШАЯ ТОЧКА СЕТКИ вне выборки.

Читает сводки всех 21 280 точек по всем 440 тикеро-месяцам (9.36 млн строк),
строит помесячную матрицу PnL и гоняет walk-forward по самому правилу
риск-менеджмента: выбрали лучшее на прошлом окне -> применили на следующем месяце.
"""
import math, random
from array import array
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])
HEADLINE = ("15840", "2", "7.5", "1.5")

print("читаю сетку (9.36 млн строк)...", flush=True)
rule_idx = {}
rules = []
months_set = set()
rows = []
with open(f"{DIR}/grid_all.tsv") as fh:
    for line in fh:
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        i = rule_idx.get(r)
        if i is None:
            i = len(rules); rule_idx[r] = i; rules.append(r)
        months_set.add(p[0])
        rows.append((p[0], p[1], i, float(p[6]), int(p[12] if False else 0), p[9]))
NR = len(rules)
months = sorted(months_set, key=mkey)
mi = {m: i for i, m in enumerate(months)}
print(f"правил {NR}, месяцев {len(months)}, строк {len(rows)}", flush=True)

# помесячная матрица pnl (сумма по символам) и та же матрица только по BTC
pnl = [array('d', [0.0]) * 1 for _ in range(0)]
pnl = [array('d', bytes(8 * NR)) for _ in months]
pnl_btc = [array('d', bytes(8 * NR)) for _ in months]
cnt = [array('i', bytes(4 * NR)) for _ in months]
for m, s, i, tot, _t, _sh in rows:
    k = mi[m]
    pnl[k][i] += tot
    cnt[k][i] += 1
    if s == "BTCUSDT":
        pnl_btc[k][i] += tot
del rows

hidx = rule_idx[HEADLINE]
print("=" * 86)
print("11. ВСЯ СЕТКА 21 280 ПРАВИЛ, СУММАРНО ЗА 5.5 ЛЕТ (in-sample)")
print("=" * 86)
tot_by_rule = [sum(pnl[k][i] for k in range(len(months))) for i in range(NR)]
pos_rules = sum(1 for x in tot_by_rule if x > 0)
srt = sorted(range(NR), key=lambda i: -tot_by_rule[i])
print(f"правил с положительным суммарным PnL: {pos_rules} из {NR} "
      f"({100*pos_rules/NR:.1f}%)")
print(f"медиана по правилам: {sorted(tot_by_rule)[NR//2]:+.1f}%, "
      f"лучшее {tot_by_rule[srt[0]]:+.1f}%, худшее {tot_by_rule[srt[-1]]:+.1f}%")
print(f"точка Петра (hold 11сут/lock 2/stop 7.5/trail 1.5): {tot_by_rule[hidx]:+.1f}% "
      f"-> место {srt.index(hidx)+1} из {NR}")
print("\nтоп-8 правил за всю историю:")
for i in srt[:8]:
    r = rules[i]
    mp = sum(1 for k in range(len(months)) if pnl[k][i] > 0)
    print(f"  hold={int(r[0])//1440:>2}сут lock={r[1]:>3}% stop={r[2]:>4}% trail={r[3]:>3}%"
          f"  сумма {tot_by_rule[i]:>+9.1f}%  прибыльных месяцев {mp}/{len(months)}")
print("худшие 3:")
for i in srt[-3:]:
    r = rules[i]
    print(f"  hold={int(r[0])//1440:>2}сут lock={r[1]:>3}% stop={r[2]:>4}% trail={r[3]:>3}%"
          f"  сумма {tot_by_rule[i]:>+9.1f}%")

# где в сетке живёт плюс
print("\nдоля прибыльных правил по осям:")
for ax, name in ((0, "hold"), (1, "lock"), (2, "stop"), (3, "trail")):
    agg = defaultdict(lambda: [0, 0])
    for i in range(NR):
        v = rules[i][ax]
        agg[v][0] += 1
        if tot_by_rule[i] > 0: agg[v][1] += 1
    keys = sorted(agg, key=lambda x: float(x))
    line = "  " + name + ": " + "  ".join(
        f"{(int(k)//1440 if name=='hold' else k)}:{100*agg[k][1]/agg[k][0]:.0f}%" for k in keys)
    print(line)

print("\n" + "=" * 86)
print("12. WALK-FORWARD ПО САМОМУ ПРАВИЛУ: выбрали лучшее на прошлом -> торгуем следующий месяц")
print("=" * 86)
rnd = random.Random(3)
def rule_wf(W=12, crit="pnl", start_year=2022, NDRAW=500, use_btc=False):
    src = pnl_btc if use_btc else pnl
    picked = 0.0; oracle = 0.0; fixed = 0.0; avg_all = 0.0; wins = 0; used = 0
    draws = [0.0] * NDRAW
    hist = []
    for k, tm in enumerate(months):
        if mkey(tm)[0] < start_year: continue
        if k < W + 1: continue
        tr = range(k - W, k)
        if crit == "pnl":
            score = [sum(src[j][i] for j in tr) for i in range(NR)]
        else:                                   # sharpe-подобный: среднее/разброс
            score = []
            for i in range(NR):
                vals = [src[j][i] for j in tr]
                mu = sum(vals) / len(vals)
                sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals)) or 1e-9
                score.append(mu / sd)
        b = max(range(NR), key=lambda i: score[i])
        got = src[k][b]
        picked += got; used += 1
        if got > 0: wins += 1
        oracle += max(src[k][i] for i in range(NR))
        fixed += src[k][hidx]
        avg_all += sum(src[k]) / NR
        hist.append((tm, rules[b], got))
        for d in range(NDRAW):
            draws[d] += src[k][rnd.randrange(NR)]
    nd = sorted(draws)
    return dict(months=used, picked=picked, oracle=oracle, fixed=fixed, avg=avg_all,
                wins=wins, p=sum(1 for x in nd if x >= picked) / max(len(nd), 1),
                null_med=nd[len(nd) // 2], hist=hist)

for crit in ("pnl", "sharpe"):
    for W in (6, 12):
        r = rule_wf(W=W, crit=crit)
        print(f"критерий={crit:<7} окно={W:>2}мес: месяцев {r['months']}, "
              f"выбранная точка {r['picked']:>+8.1f}%, прибыльных мес {r['wins']}/{r['months']} | "
              f"средняя точка сетки {r['avg']:>+8.1f}% | фикс. точка Петра {r['fixed']:>+8.1f}% | "
              f"оракул (лучшее задним числом) {r['oracle']:>+8.1f}% | плацебо-p={r['p']:.3f}")

print("\nчто выбирал walk-forward (критерий pnl, окно 12) — последние 10 месяцев:")
r = rule_wf(W=12, crit="pnl")
for tm, rr, got in r['hist'][-10:]:
    print(f"  {tm}: hold={int(rr[0])//1440}сут lock={rr[1]}% stop={rr[2]}% trail={rr[3]}% "
          f"-> получено {got:+.1f}%")

print("\n" + "=" * 86)
print("13. ТО ЖЕ ТОЛЬКО ПО BTCUSDT (самый длинный ряд, 67 месяцев)")
print("=" * 86)
for crit in ("pnl", "sharpe"):
    r = rule_wf(W=12, crit=crit, use_btc=True)
    print(f"критерий={crit:<7}: месяцев {r['months']}, выбранная {r['picked']:+.1f}%, "
          f"прибыльных {r['wins']}/{r['months']}, средняя точка {r['avg']:+.1f}%, "
          f"точка Петра {r['fixed']:+.1f}%, оракул {r['oracle']:+.1f}%, p={r['p']:.3f}")

print("\n" + "=" * 86)
print("14. РАЗМЕР ОВЕРФИТА: лучшая точка месяца против её же результата в следующем месяце")
print("=" * 86)
gap = []
for k in range(1, len(months)):
    b = max(range(NR), key=lambda i: pnl[k - 1][i])
    gap.append((months[k], pnl[k - 1][b], pnl[k][b], sum(pnl[k]) / NR))
ins = sum(g[1] for g in gap); oos = sum(g[2] for g in gap); avg = sum(g[3] for g in gap)
print(f"месяцев {len(gap)}: лучшая точка ДАЛА в своём месяце {ins:+.1f}%, "
      f"а в следующем {oos:+.1f}% (средняя точка сетки за те же месяцы {avg:+.1f}%)")
print(f"усадка: {100*(1 - oos/ins) if ins else 0:.1f}% результата исчезает вне выборки")
