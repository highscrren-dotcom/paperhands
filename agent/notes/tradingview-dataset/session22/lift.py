#!/usr/bin/env python3
"""Лифт отбора авторов на произвольном правиле сетки — общий движок сессий 21/22.

Панели (агрегированный формат, одинаковый для старых и новых прогонов):
  aut  : month symbol hold lock stop trail author ideas hits
  fld  : month symbol hold lock stop trail nAuthors ideas hits
  trd  : month symbol hold lock stop trail author trades pnlSum [wins]

Метод — тот же walk-forward, что подтвердил находку в сессии 21:
рейтинг строится ТОЛЬКО на прошлых W месяцах, результат меряется на следующем.
"""
import glob
import random
import sys
from collections import defaultdict

MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def rkey(p):
    return (p[2], p[3], p[4], p[5])


def load(aut_glob, fld_glob, trd_glob, want=None, min_ideas=2):
    """want — множество правил (hold, lock, stop, trail) как строки, либо None = все."""
    field = {}
    aut = defaultdict(lambda: defaultdict(dict))
    money = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for fn in sorted(glob.glob(fld_glob)):
        for line in open(fn):
            p = line.rstrip("\n").split("\t")
            r = rkey(p)
            if want and r not in want:
                continue
            field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
    for fn in sorted(glob.glob(aut_glob)):
        for line in open(fn):
            p = line.rstrip("\n").split("\t")
            r = rkey(p)
            if want and r not in want:
                continue
            if int(p[7]) < min_ideas:
                continue
            aut[r][(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
    for fn in sorted(glob.glob(trd_glob)):
        for line in open(fn):
            p = line.rstrip("\n").split("\t")
            r = rkey(p)
            if want and r not in want:
                continue
            q = money[r][(p[0], p[1], p[6])]
            q[0] += int(p[7])
            q[1] += float(p[8])
    return field, aut, money


def run(rule, field, aut, money, W=12, K=3, MIN=5, by="pnl",
        NDRAW=1000, seed=9, start=2022, shrink_hit=20, shrink_pnl=10,
        field_scope="symbols", field_elig=True):
    """Поле сравнения (базовая линия «а что дал бы неотобранный автор»):
    field_scope="symbols" — только те символы, где отбор реально торговал в этом
    месяце; "all" — все символы месяца. field_elig=True — только авторы, прошедшие
    тот же допуск MIN (иначе поле разбавляется одноразовыми авторами).
    Эталон сессии 21 (symbols+elig) даёт лифт +0.720 против опубликованных +0.703."""
    rnd = random.Random(seed)
    hits = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
    for (m, s), a in aut[rule].items():
        fi, fh = field.get((m, s, rule), (0, 0))
        if fi == 0:
            continue
        rate = fh / fi
        for au, (i, h) in a.items():
            q = hits[m][au]
            q[0] += i
            q[1] += h
            q[2] += i * rate
    mon = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))      # month -> author
    msa = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))      # month -> (sym, author)
    for (m, s, au), v in money[rule].items():
        q = mon[m][au]
        q[0] += v[0]
        q[1] += v[1]
        z = msa[m][(s, au)]
        z[0] += v[0]
        z[1] += v[1]
    months = sorted(set(hits) | set(mon), key=mkey)
    real = [0, 0.0]
    fld = [0, 0.0]
    draws = [[0, 0.0] for _ in range(NDRAW)]
    used = wins = 0
    curve = []
    peryear = defaultdict(lambda: [0, 0.0, 0, 0.0])   # year -> [n, pnl, fieldN, fieldPnl]
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start:
            continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0.0, 0, 0.0])
        for m in train:
            for au, (i, h, e) in hits[m].items():
                sc[au][0] += i
                sc[au][1] += h - e
            for au, (t, p) in mon[m].items():
                sc[au][2] += t
                sc[au][3] += p
        elig = [a for a, v in sc.items() if v[0] >= MIN]
        if len(elig) < 3 * K:
            continue
        if by == "hit":
            elig.sort(key=lambda a: sc[a][1] / (sc[a][0] + shrink_hit), reverse=True)
        else:
            elig.sort(key=lambda a: sc[a][3] / (sc[a][2] + shrink_pnl) if sc[a][2] else -9,
                      reverse=True)
        top = elig[:K]
        mt = mon.get(tm, {})
        if not mt:
            continue
        b0 = real[0]
        mp = 0.0
        yr = mkey(tm)[0]
        for a in top:
            if a in mt:
                real[0] += mt[a][0]
                real[1] += mt[a][1]
                mp += mt[a][1]
                peryear[yr][0] += mt[a][0]
                peryear[yr][1] += mt[a][1]
        if real[0] == b0:
            continue
        used += 1
        curve.append((tm, mp))
        if mp > 0:
            wins += 1
        topset = set(top)
        eset = set(elig)
        syms = {s for (s, a) in msa[tm] if a in topset}
        src = [v for (s, a), v in msa[tm].items()
               if (field_scope != "symbols" or s in syms)
               and (not field_elig or a in eset)]
        for v in src:
            fld[0] += v[0]
            fld[1] += v[1]
            peryear[yr][2] += v[0]
            peryear[yr][3] += v[1]
        for d in range(NDRAW):
            for a in rnd.sample(elig, K):
                if a in mt:
                    draws[d][0] += mt[a][0]
                    draws[d][1] += mt[a][1]
    avg = lambda x: x[1] / x[0] if x[0] else float("nan")
    nl = sorted(avg(d) for d in draws if d[0] > 0)
    a_real = avg(real)
    a_fld = avg(fld)
    years = {}
    for y, v in sorted(peryear.items()):
        fa = v[3] / v[2] if v[2] else float("nan")
        years[y] = dict(trades=v[0], pnl=v[1],
                        avg=(v[1] / v[0] if v[0] else float("nan")),
                        field_avg=fa, field_scaled=fa * v[0] if v[0] else float("nan"),
                        lift=(v[1] / v[0] - fa) if v[0] else float("nan"))
    return dict(months=used, wins=wins, trades=real[0], total=real[1], avg=a_real,
                field_avg=a_fld, field_trades=fld[0], field_scaled=a_fld * real[0],
                lift=a_real - a_fld,
                p=sum(1 for x in nl if x >= a_real) / max(len(nl), 1),
                null=nl[len(nl) // 2] if nl else float("nan"),
                curve=curve, years=years)


if __name__ == "__main__":
    # самопроверка: воспроизводим опубликованное число сессии 21
    D = sys.argv[1] if len(sys.argv) > 1 else "ref"
    BEST = ("20160", "5", "10", "5")
    field, aut, money = load(f"{D}/aut_*.tsv", f"{D}/fld_*.tsv", f"{D}/trd_*.tsv",
                             want={BEST}, min_ideas=2)
    print(f"загружено: field {len(field)}, aut-ячеек {len(aut[BEST])}, "
          f"money-ячеек {len(money[BEST])}")
    print(f"{'MIN':>4}{'K':>3}{'W':>4}{'отбор':>7}{'поле':>9}{'мес':>5}{'сделок':>8}"
          f"{'суммарно':>11}{'на сделку':>11}{'поле%':>10}{'лифт':>9}{'p':>7}")
    for MIN in (3, 5, 10):
        for K in (3, 5):
            for by in ("pnl", "hit"):
                for fs in ("symbols", "all"):
                    m = run(BEST, field, aut, money, W=12, K=K, MIN=MIN, by=by, field_scope=fs)
                    print(f"{MIN:>4}{K:>3}{12:>4}{by:>7}{fs:>9}{m['months']:>5}{m['trades']:>8}"
                          f"{m['total']:>+11.1f}{m['avg']:>+11.3f}"
                          f"{m['field_scaled']:>+10.1f}{m['lift']:>+9.3f}{m['p']:>7.3f}")
    print("\nпогодовая разбивка эталона (MIN=5 K=3 W=12 pnl, поле=symbols):")
    m = run(BEST, field, aut, money, W=12, K=3, MIN=5, by="pnl", field_scope="symbols")
    for y, v in m["years"].items():
        print(f"  {y}: сделок {v['trades']:>4}  факт {v['pnl']:>+8.1f}%  "
              f"поле {v['field_scaled']:>+8.1f}%  лифт {v['lift']:>+7.3f}%")
    print(f"  ИТОГО: сделок {m['trades']}  факт {m['total']:+.1f}%  "
          f"поле {m['field_scaled']:+.1f}%  лифт {m['lift']:+.3f}%  p={m['p']:.3f}")
