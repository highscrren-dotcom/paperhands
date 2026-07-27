#!/usr/bin/env python3
"""Поиск перформящих авторов: ранжирование + слепая walk-forward проверка.

Вход  — панели, снятые полным проходом по датасету (64 ГБ):
  authors_all.tsv  month symbol hold lock stop trail author ideas hits
  field_all.tsv    month symbol hold lock stop trail n_authors ideas hits
  trades_all.tsv   month symbol hold lock stop trail author dir entry exit reason pnl absorbed
  summary.tsv      month symbol ideasTotal ideasDirectional profiles truncated avgHold p95 p99
"""
import math, random, sys
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate(
    "jan feb mar apr may jun jul aug sep oct nov dec".split())}

def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])

HEADLINE = ("15840", "2", "7.5", "1.5")   # заявленная Петром лучшая точка

def load_field(rule=None):
    field = {}
    with open(f"{DIR}/field_all.tsv") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            r = (p[2], p[3], p[4], p[5])
            if rule and r != rule:
                continue
            field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
    return field

def load_authors(rules):
    """rules: set of (hold,lock,stop,trail) -> {rule: {(month,symbol): {author:(ideas,hits)}}}"""
    out = {r: defaultdict(dict) for r in rules}
    with open(f"{DIR}/authors_all.tsv") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            r = (p[2], p[3], p[4], p[5])
            if r not in out:
                continue
            out[r][(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
    return out

def wilson_lo(hits, n, z=1.96):
    if n == 0:
        return 0.0
    p = hits / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    s = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - s) / d

def binom_z(hits, n, p0):
    if n == 0 or p0 <= 0 or p0 >= 1:
        return 0.0
    return (hits - n * p0) / math.sqrt(n * p0 * (1 - p0))

# ---------------------------------------------------------------- инвентарь
def inventory():
    print("=" * 78)
    print("1. ИНВЕНТАРЬ И СТРУКТУРА ДАННЫХ")
    print("=" * 78)
    rows = [l.rstrip("\n").split("\t") for l in open(f"{DIR}/summary.tsv")]
    months = sorted({r[0] for r in rows}, key=mkey)
    print(f"месяцев: {len(months)}  ({months[0]} .. {months[-1]})")
    print(f"тикеро-месяцев: {len(rows)}   идей направленных всего: "
          f"{sum(int(r[3]) for r in rows)}")
    trunc = sum(int(r[5]) for r in rows)
    tot = sum(int(r[4]) for r in rows)
    print(f"профилей: {tot}, из них обрезано горизонтом (truncated): {trunc} "
          f"({100*trunc/max(tot,1):.1f}%)")

    # живость ленты: firstSeen vs ts
    lag_by_month = defaultdict(list)
    fs_by_month = defaultdict(set)
    for l in open(f"{DIR}/feed.tsv"):
        p = l.rstrip("\n").split("\t")
        if len(p) < 7:
            continue
        m, ts, fs = p[0], int(p[2]), int(p[6])
        lag_by_month[m].append((fs - ts) / 3600000.0)
        fs_by_month[m].add(fs)
    live = sum(1 for m in lag_by_month
               for x in lag_by_month[m] if x < 24)
    total_ideas = sum(len(v) for v in lag_by_month.values())
    print(f"\nЖИВОСТЬ ЛЕНТЫ: идей всего {total_ideas}, с лагом firstSeen-ts < 24ч: {live}")
    allfs = set()
    for s in fs_by_month.values():
        allfs |= s
    print(f"уникальных значений firstSeen во всём датасете: {len(allfs)} "
          f"-> {'ЕДИНЫЙ БЭКФИЛ-СНАПШОТ' if len(allfs) <= 3 else 'есть живой сегмент'}")
    for m in months[-4:]:
        if m in lag_by_month:
            v = sorted(lag_by_month[m])
            print(f"  {m}: идей {len(v)}, лаг мин {v[0]/24:.1f} дн, "
                  f"медиана {v[len(v)//2]/24:.1f} дн")

    # обрыв глубины скрейпа: идеи по месяцам для BTC
    print("\nПЛОТНОСТЬ ЛЕНТЫ BTCUSDT по годам (ideasTotal/ideasDirectional):")
    per_year = defaultdict(lambda: [0, 0])
    for r in rows:
        if r[1] != "BTCUSDT":
            continue
        y = mkey(r[0])[0]
        per_year[y][0] += int(r[2])
        per_year[y][1] += int(r[3])
    for y in sorted(per_year):
        print(f"  {y}: {per_year[y][0]:6d} / {per_year[y][1]:6d}")
    return months, rows

# ------------------------------------------------------- ранжирование (IS)
def ranking(field, authors, rule, min_ideas=10):
    print("\n" + "=" * 78)
    print(f"2. РАНЖИРОВАНИЕ (in-sample, всё 5.5 года), правило hold={rule[0]}м "
          f"lock={rule[1]}% stop={rule[2]}% trail={rule[3]}%")
    print("=" * 78)
    agg = defaultdict(lambda: [0, 0, 0.0, 0, set()])  # ideas, hits, exp_hits, months, symbols
    for (m, s), aut in authors[rule].items():
        fi, fh = field.get((m, s, rule), (0, 0))
        if fi == 0:
            continue
        rate = fh / fi
        for a, (i, h) in aut.items():
            g = agg[a]
            g[0] += i; g[1] += h; g[2] += i * rate; g[3] += 1; g[4].add(s)
    rankable = [(a, g) for a, g in agg.items() if g[0] >= min_ideas]
    print(f"авторов в панели: {len(agg)}, с ideas>={min_ideas}: {len(rankable)}")
    # z-статистика превышения над полем + нижняя граница Уилсона
    scored = []
    for a, g in rankable:
        ideas, hits, exp = g[0], g[1], g[2]
        p0 = exp / ideas
        z = binom_z(hits, ideas, p0)
        scored.append((z, a, ideas, hits, hits / ideas, p0, len(g[4]), g[3]))
    scored.sort(reverse=True)
    print(f"\n{'автор':<22}{'идей':>6}{'хитов':>7}{'hitRate':>9}{'поле':>8}"
          f"{'excess':>9}{'z':>7}{'симв':>6}{'мес':>5}")
    for z, a, ideas, hits, hr, p0, nsym, nmon in scored[:20]:
        print(f"{a:<22}{ideas:>6}{hits:>7}{hr:>9.3f}{p0:>8.3f}"
              f"{hr-p0:>+9.3f}{z:>7.2f}{nsym:>6}{nmon:>5}")
    print("\nхудшие 5 (для симметрии):")
    for z, a, ideas, hits, hr, p0, nsym, nmon in scored[-5:]:
        print(f"{a:<22}{ideas:>6}{hits:>7}{hr:>9.3f}{p0:>8.3f}"
              f"{hr-p0:>+9.3f}{z:>7.2f}{nsym:>6}{nmon:>5}")
    # сколько ожидать |z|>2 при чистом шуме
    n_big = sum(1 for s in scored if s[0] > 2)
    n_small = sum(1 for s in scored if s[0] < -2)
    print(f"\nz>+2: {n_big} авторов, z<-2: {n_small}, всего проверено {len(scored)}"
          f" (при чистом шуме ждём ~{0.023*len(scored):.1f} в каждую сторону)")
    return scored

# ------------------------------------------- слепая walk-forward проверка
def walk_forward(field, authors, rule, W=6, K=10, MIN_IDEAS=5, NDRAW=400,
                 start_year=2022, verbose=True, seed=7):
    rnd = random.Random(seed)
    months = sorted({m for (m, s) in authors[rule]}, key=mkey)
    res = dict(sel_i=0, sel_h=0, sel_e=0.0, bot_i=0, bot_h=0, bot_e=0.0,
               all_i=0, all_h=0, months=0, wins=0, null_better=0, null_tot=0,
               per_month=[])
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start_year:
            continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0.0])         # ideas, excess
        for m in train:
            for (mm, s), aut in authors[rule].items():
                if mm != m:
                    continue
                fi, fh = field.get((m, s, rule), (0, 0))
                if fi == 0:
                    continue
                rate = fh / fi
                for a, (i, h) in aut.items():
                    sc[a][0] += i
                    sc[a][1] += h - i * rate
        elig = [a for a, v in sc.items() if v[0] >= MIN_IDEAS]
        if len(elig) < 2 * K:
            continue
        elig.sort(key=lambda a: sc[a][1] / sc[a][0], reverse=True)
        top, bot = elig[:K], elig[-K:]

        # тестовый месяц
        tst = {}
        fld = {}
        for (mm, s), aut in authors[rule].items():
            if mm != tm:
                continue
            fi, fh = field.get((tm, s, rule), (0, 0))
            if fi == 0:
                continue
            fld[s] = fh / fi
            for a, (i, h) in aut.items():
                q = tst.setdefault(a, [0, 0, 0.0])
                q[0] += i; q[1] += h; q[2] += i * fld[s]
        if not tst:
            continue
        def pool(group):
            i = h = e = 0.0
            for a in group:
                if a in tst:
                    i += tst[a][0]; h += tst[a][1]; e += tst[a][2]
            return i, h, e
        si, sh, se = pool(top)
        bi, bh, be = pool(bot)
        if si < 5:
            continue
        ai = sum(v[0] for v in tst.values()); ah = sum(v[1] for v in tst.values())
        res['sel_i'] += si; res['sel_h'] += sh; res['sel_e'] += se
        res['bot_i'] += bi; res['bot_h'] += bh; res['bot_e'] += be
        res['all_i'] += ai; res['all_h'] += ah
        res['months'] += 1
        lift = sh / si - se / si
        if lift > 0:
            res['wins'] += 1
        # плацебо: K случайных авторов из того же eligible-пула
        better = 0
        for _ in range(NDRAW):
            g = rnd.sample(elig, K)
            ri, rh, re_ = pool(g)
            if ri >= 5 and (rh / ri - re_ / ri) >= lift:
                better += 1
        res['null_better'] += better
        res['null_tot'] += NDRAW
        res['per_month'].append((tm, si, sh, se, lift, better / NDRAW))
    return res

def report_wf(tag, r):
    if r['months'] == 0 or r['sel_i'] == 0:
        print(f"{tag:<44} нет данных")
        return None
    sel = r['sel_h'] / r['sel_i']; exp = r['sel_e'] / r['sel_i']
    bot = (r['bot_h'] / r['bot_i']) if r['bot_i'] else float('nan')
    botx = (r['bot_e'] / r['bot_i']) if r['bot_i'] else float('nan')
    z = binom_z(r['sel_h'], r['sel_i'], exp)
    pnull = r['null_better'] / max(r['null_tot'], 1)
    print(f"{tag:<44} мес={r['months']:>3} идей={r['sel_i']:>5} "
          f"top={sel:.3f} поле={exp:.3f} лифт={sel-exp:+.3f} z={z:+.2f} "
          f"плацебо-p={pnull:.3f} bottom={bot:.3f}/{botx:.3f} "
          f"мес.в плюс={r['wins']}/{r['months']}")
    return dict(lift=sel - exp, z=z, p=pnull, months=r['months'], ideas=r['sel_i'],
                bottom_lift=(bot - botx) if r['bot_i'] else None)

def main():
    months, rows = inventory()
    field_all = load_field()
    rules = {HEADLINE}
    # набор для проверки устойчивости: та же ось hold, разные риск-коридоры
    for h in ("2880", "8640", "15840", "20160"):
        for st in ("2.5", "4", "7.5", "10"):
            for lk in ("1", "2", "3"):
                rules.add((h, lk, st, "1.5"))
    authors = load_authors(rules)
    print(f"\nзагружено правил: {len(rules)}, "
          f"строк панели по ним: {sum(len(v) for v in authors.values())} тикеро-месяцев")

    scored = ranking(field_all, authors, HEADLINE, min_ideas=10)

    print("\n" + "=" * 78)
    print("3. СЛЕПАЯ ПРОВЕРКА (walk-forward): отбираем на прошлом, меряем на следующем")
    print("=" * 78)
    print("top = K лучших по excess над полем за окно W месяцев; поле = все авторы "
          "того же месяца;\nплацебо-p = доля случайных наборов K авторов, которые "
          "показали лифт не хуже отобранных\n")
    grid = []
    for W in (3, 6, 12):
        for K in (5, 10, 20):
            for MI in (3, 5, 10):
                r = walk_forward(field_all, authors, HEADLINE, W=W, K=K, MIN_IDEAS=MI)
                g = report_wf(f"headline W={W:>2} K={K:>2} minIdeas={MI:>2}", r)
                if g:
                    grid.append(((W, K, MI), g))
    if grid:
        lifts = [g['lift'] for _, g in grid]
        pos = sum(1 for x in lifts if x > 0)
        print(f"\nИТОГ ПО СЕТКЕ НАСТРОЕК ОТБОРА: конфигураций {len(grid)}, "
              f"с положительным лифтом {pos}, медианный лифт "
              f"{sorted(lifts)[len(lifts)//2]:+.4f}")
        ps = [g['p'] for _, g in grid]
        print(f"плацебо-p: мин {min(ps):.3f}, медиана {sorted(ps)[len(ps)//2]:.3f}, "
              f"доля конфигураций с p<0.05: {sum(1 for p in ps if p<0.05)}/{len(ps)}")

if __name__ == "__main__":
    main()
