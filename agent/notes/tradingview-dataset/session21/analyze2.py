#!/usr/bin/env python3
"""Слепая проверка отбора авторов — усиленная версия.

Отличия от analyze.py:
  * перестановочная нуль-гипотеза считается АГРЕГИРОВАННО (каждый прогон-плацебо
    строит полную псевдо-историю по всем тестовым месяцам) — это на порядок
    мощнее помесячного сравнения;
  * добавлен денежный тест: PnL отобранных авторов в тестовом месяце;
  * разрезы: режим данных (хвост выживших vs полное окно), устойчивость по 48
    правилам риск-менеджмента, варианты скоринга.
"""
import math, random
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])
HEADLINE = ("15840", "2", "7.5", "1.5")

def binom_z(h, n, p0):
    if n == 0 or p0 <= 0 or p0 >= 1: return 0.0
    return (h - n * p0) / math.sqrt(n * p0 * (1 - p0))

def load(rules):
    field, authors = {}, {r: defaultdict(dict) for r in rules}
    with open(f"{DIR}/field_all.tsv") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            r = (p[2], p[3], p[4], p[5])
            if r in authors: field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
    with open(f"{DIR}/authors_all.tsv") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            r = (p[2], p[3], p[4], p[5])
            if r in authors: authors[r][(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
    return field, authors

def load_trades(rule):
    """(month,symbol)->author->[trades, pnl_sum]; плюс поле по всем авторам"""
    tr = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    with open(f"{DIR}/trades_all.tsv") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if (p[2], p[3], p[4], p[5]) != rule: continue
            q = tr[(p[0], p[1])][p[6]]
            q[0] += 1; q[1] += float(p[11])
    return tr

def month_panel(authors, field, rule):
    """month -> {author: [ideas, hits, expected_hits]} с полем по каждому символу"""
    per = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
    fieldrate = {}
    for (m, s), aut in authors[rule].items():
        fi, fh = field.get((m, s, rule), (0, 0))
        if fi == 0: continue
        rate = fh / fi
        fieldrate[(m, s)] = rate
        for a, (i, h) in aut.items():
            q = per[m][a]; q[0] += i; q[1] += h; q[2] += i * rate
    return per

def wf_perm(per, W=12, K=5, MIN_IDEAS=5, start_year=2022, end_year=9999,
            NDRAW=2000, seed=11, score_mode="rate"):
    """Возвращает реальный агрегированный лифт и распределение плацебо."""
    rnd = random.Random(seed)
    months = sorted(per, key=mkey)
    real = [0.0, 0.0, 0.0]                 # ideas, hits, expected
    draws = [[0.0, 0.0, 0.0] for _ in range(NDRAW)]
    bot = [0.0, 0.0, 0.0]
    allp = [0.0, 0.0, 0.0]
    used_months = 0
    for idx, tm in enumerate(months):
        y = mkey(tm)[0]
        if y < start_year or y > end_year: continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2: continue
        sc = defaultdict(lambda: [0, 0.0])
        for m in train:
            for a, (i, h, e) in per[m].items():
                sc[a][0] += i; sc[a][1] += h - e
        elig = [a for a, v in sc.items() if v[0] >= MIN_IDEAS]
        if len(elig) < 3 * K: continue
        if score_mode == "rate":
            key = lambda a: sc[a][1] / sc[a][0]
        elif score_mode == "shrunk":                       # усадка к нулю по объёму
            key = lambda a: sc[a][1] / (sc[a][0] + 20)
        else:                                              # z-подобный
            key = lambda a: sc[a][1] / math.sqrt(sc[a][0])
        elig.sort(key=key, reverse=True)
        top, bottom = elig[:K], elig[-K:]
        tst = per[tm]
        def pool(group, acc):
            for a in group:
                if a in tst:
                    q = tst[a]; acc[0] += q[0]; acc[1] += q[1]; acc[2] += q[2]
        before = real[0]
        pool(top, real)
        if real[0] == before: continue                     # никто из отобранных не постил
        used_months += 1
        pool(bottom, bot)
        for a, q in tst.items():
            allp[0] += q[0]; allp[1] += q[1]; allp[2] += q[2]
        for d in range(NDRAW):
            pool(rnd.sample(elig, K), draws[d])
    def lift(acc):
        return (acc[1] - acc[2]) / acc[0] if acc[0] else float("nan")
    rl = lift(real)
    nulls = sorted(lift(d) for d in draws if d[0] > 0)
    p = sum(1 for x in nulls if x >= rl) / max(len(nulls), 1)
    return dict(months=used_months, ideas=real[0], lift=rl, p=p,
                z=binom_z(real[1], real[0], real[2] / real[0]) if real[0] else 0,
                bottom=lift(bot), field=lift(allp),
                null_med=nulls[len(nulls) // 2] if nulls else float("nan"),
                null_p95=nulls[int(len(nulls) * 0.95)] if nulls else float("nan"))

def money_wf(per, trades, W=12, K=5, MIN_IDEAS=5, start_year=2022, NDRAW=2000, seed=13):
    """Тот же отбор, но метрика — деньги (сумма pnl% сделок) в тестовом месяце."""
    rnd = random.Random(seed)
    months = sorted(per, key=mkey)
    real = [0, 0.0]; draws = [[0, 0.0] for _ in range(NDRAW)]; allp = [0, 0.0]
    tr_by_month = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for (m, s), d in trades.items():
        for a, v in d.items():
            q = tr_by_month[m][a]; q[0] += v[0]; q[1] += v[1]
    used = 0
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start_year: continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2: continue
        sc = defaultdict(lambda: [0, 0.0])
        for m in train:
            for a, (i, h, e) in per[m].items():
                sc[a][0] += i; sc[a][1] += h - e
        elig = [a for a, v in sc.items() if v[0] >= MIN_IDEAS]
        if len(elig) < 3 * K: continue
        elig.sort(key=lambda a: sc[a][1] / sc[a][0], reverse=True)
        top = elig[:K]
        tmt = tr_by_month.get(tm, {})
        if not tmt: continue
        def acc(group, target):
            for a in group:
                if a in tmt:
                    target[0] += tmt[a][0]; target[1] += tmt[a][1]
        before = real[0]; acc(top, real)
        if real[0] == before: continue
        used += 1
        for a, v in tmt.items():
            allp[0] += v[0]; allp[1] += v[1]
        for d in range(NDRAW):
            acc(rnd.sample(elig, K), draws[d])
    avg = lambda x: x[1] / x[0] if x[0] else float("nan")
    r = avg(real)
    nl = sorted(avg(d) for d in draws if d[0] > 0)
    return dict(months=used, trades=real[0], avg_pnl=r, total_pnl=real[1],
                field_avg=avg(allp), field_trades=allp[0],
                p=sum(1 for x in nl if x >= r) / max(len(nl), 1),
                null_med=nl[len(nl) // 2] if nl else float("nan"))

def main():
    rules = {HEADLINE}
    for h in ("2880", "8640", "15840", "20160"):
        for st in ("2.5", "4", "7.5", "10"):
            for lk in ("1", "2", "3"):
                rules.add((h, lk, st, "1.5"))
    field, authors = load(rules)
    per = month_panel(authors, field, HEADLINE)

    print("=" * 84)
    print("4. СЛЕПАЯ ПРОВЕРКА С АГРЕГИРОВАННЫМ ПЛАЦЕБО (2000 псевдо-историй на конфигурацию)")
    print("=" * 84)
    print("лифт = hitRate отобранных минус то, что дало бы поле на тех же идеях")
    print("p = доля из 2000 случайных наборов авторов, показавших лифт не хуже\n")
    print(f"{'конфигурация':<40}{'мес':>4}{'идей':>7}{'лифт':>9}{'p':>7}{'нуль-медиана':>14}{'нуль-p95':>10}{'bottom-K':>10}")
    best = []
    for mode in ("rate", "shrunk", "z"):
        for W in (6, 12, 24):
            for K in (5, 10):
                for MI in (5, 10):
                    r = wf_perm(per, W=W, K=K, MIN_IDEAS=MI, score_mode=mode)
                    if r['months'] < 5: continue
                    print(f"{mode:<8}W={W:<3}K={K:<3}minIdeas={MI:<3}{'':<12}"
                          f"{r['months']:>4}{int(r['ideas']):>7}{r['lift']:>+9.4f}"
                          f"{r['p']:>7.3f}{r['null_med']:>+14.4f}{r['null_p95']:>+10.4f}"
                          f"{r['bottom']:>+10.4f}")
                    best.append(((mode, W, K, MI), r))
    ps = [r['p'] for _, r in best]
    lifts = [r['lift'] for _, r in best]
    bots = [r['bottom'] for _, r in best]
    print(f"\nконфигураций: {len(best)}; лифт>0 в {sum(1 for x in lifts if x>0)}; "
          f"p<0.05 в {sum(1 for p in ps if p<0.05)}; p<0.10 в {sum(1 for p in ps if p<0.10)}")
    print(f"медианный лифт {sorted(lifts)[len(lifts)//2]:+.4f}, "
          f"медианный bottom-K лифт {sorted(bots)[len(bots)//2]:+.4f} "
          f"(если отбор осмыслен — bottom должен быть отрицательным)")

    print("\n" + "=" * 84)
    print("5. РАЗРЕЗ ПО РЕЖИМУ ДАННЫХ (хвост выживших vs плотное окно скрейпа)")
    print("=" * 84)
    for lbl, sy, ey in (("2022-2024 (глубокий хвост)", 2022, 2024),
                        ("2025-2026 (плотная лента)", 2025, 2026)):
        r = wf_perm(per, W=12, K=5, MIN_IDEAS=5, start_year=sy, end_year=ey)
        print(f"{lbl:<32} мес={r['months']:>3} идей={int(r['ideas']):>5} "
              f"лифт={r['lift']:+.4f} p={r['p']:.3f} bottom={r['bottom']:+.4f} "
              f"поле={r['field']:+.4f}")

    print("\n" + "=" * 84)
    print("6. УСТОЙЧИВОСТЬ ПО 48 ПРАВИЛАМ РИСК-МЕНЕДЖМЕНТА (W=12 K=5 minIdeas=5)")
    print("=" * 84)
    out = []
    for r in sorted(rules):
        p2 = month_panel(authors, field, r)
        if not p2: continue
        res = wf_perm(p2, W=12, K=5, MIN_IDEAS=5, NDRAW=500, seed=17)
        if res['months'] < 10: continue
        out.append((res['lift'], res['p'], res['bottom'], r, res))
    out.sort(reverse=True)
    print(f"{'правило (hold/lock/stop/trail)':<34}{'мес':>4}{'идей':>7}{'лифт':>9}{'p':>7}{'bottom':>9}")
    for lift, p, bt, r, res in out[:6]:
        print(f"hold={r[0]:>5} lock={r[1]:>3} stop={r[2]:>4} trail={r[3]:<4}"
              f"{res['months']:>6}{int(res['ideas']):>7}{lift:>+9.4f}{p:>7.3f}{bt:>+9.4f}")
    print("  ...")
    for lift, p, bt, r, res in out[-3:]:
        print(f"hold={r[0]:>5} lock={r[1]:>3} stop={r[2]:>4} trail={r[3]:<4}"
              f"{res['months']:>6}{int(res['ideas']):>7}{lift:>+9.4f}{p:>7.3f}{bt:>+9.4f}")
    lv = [x[0] for x in out]; pv = [x[1] for x in out]; bv = [x[2] for x in out]
    print(f"\nправил проверено: {len(out)}; лифт>0 в {sum(1 for x in lv if x>0)}; "
          f"p<0.05 в {sum(1 for x in pv if x<0.05)}; медиана лифта {sorted(lv)[len(lv)//2]:+.4f}; "
          f"медиана bottom {sorted(bv)[len(bv)//2]:+.4f}")

    print("\n" + "=" * 84)
    print("7. ДЕНЕЖНЫЙ ТЕСТ: PnL отобранных авторов в следующем месяце (правило Петра)")
    print("=" * 84)
    trades = load_trades(HEADLINE)
    for W, K, MI in ((12, 5, 5), (12, 10, 5), (6, 5, 5), (24, 5, 10)):
        m = money_wf(per, trades, W=W, K=K, MIN_IDEAS=MI)
        print(f"W={W:>2} K={K:>2} minIdeas={MI:>2}: мес={m['months']:>3} "
              f"сделок={m['trades']:>4} avgPnL={m['avg_pnl']:+.3f}% "
              f"суммарно={m['total_pnl']:+.1f}% | поле avgPnL={m['field_avg']:+.3f}% "
              f"(сделок {m['field_trades']}) | плацебо p={m['p']:.3f} "
              f"медиана нуля={m['null_med']:+.3f}%")

if __name__ == "__main__":
    main()
