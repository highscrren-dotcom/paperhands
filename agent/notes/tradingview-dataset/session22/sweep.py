#!/usr/bin/env python3
"""Фаза A: лифт отбора авторов на КАЖДОЙ из 450 точек за краем сетки.

Вход — отсортированные по правилу панели (см. concat.sh):
  aut_sorted.tsv  month symbol hold lock stop trail author ideas hits
  fld_all.tsv     month symbol hold lock stop trail nAuthors ideas hits
  trd_sorted.tsv  month symbol hold lock stop trail author trades pnlSum wins
  pnt_all.tsv     month symbol hold lock stop trail totalPnl avgPnl winRate sharpe trades ...

Протокол отбора зафиксирован тем, что подтвердилось в сессии 21:
окно обучения 12 мес, скоринг PnL/(сделок+10), допуск >=5 идей, топ-3, с 2022 года.
Поле сравнения: те же символы, авторы прошедшие тот же допуск.
"""
import sys
from collections import defaultdict
from itertools import groupby

MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def rkey(p):
    return (p[2], p[3], p[4], p[5])


def rsort(r):
    return (float(r[0]), float(r[1]), float(r[2]), float(r[3]))


def groups(path, minideas=None):
    """Итератор (rule, [разобранные строки]) по файлу, отсортированному по правилу."""
    def rows():
        with open(path) as fh:
            for line in fh:
                p = line.rstrip("\n").split("\t")
                if minideas is not None and int(p[7]) < minideas:
                    continue
                yield p
    for r, it in groupby(rows(), key=rkey):
        yield r, list(it)


def walk(rule, field, aut_rows, trd_rows, W=12, K=3, MIN=5, shrink=10, start=2022):
    hits = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
    for p in aut_rows:
        fi, fh = field.get((p[0], p[1], rule), (0, 0))
        if fi == 0:
            continue
        q = hits[p[0]][p[6]]
        i = int(p[7])
        q[0] += i
        q[1] += int(p[8])
        q[2] += i * fh / fi
    mon = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    msa = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for p in trd_rows:
        n, pnl = int(p[7]), float(p[8])
        q = mon[p[0]][p[6]]
        q[0] += n
        q[1] += pnl
        z = msa[p[0]][(p[1], p[6])]
        z[0] += n
        z[1] += pnl
    months = sorted(set(hits) | set(mon), key=mkey)
    real = [0, 0.0]
    fld = [0, 0.0]
    used = wins = 0
    picks = []
    peryear = defaultdict(lambda: [0, 0.0, 0, 0.0])
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start:
            continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0, 0.0])
        for m in train:
            for au, v in hits[m].items():
                sc[au][0] += v[0]
            for au, v in mon[m].items():
                sc[au][1] += v[0]
                sc[au][2] += v[1]
        elig = [a for a, v in sc.items() if v[0] >= MIN]
        if len(elig) < 3 * K:
            continue
        elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + shrink) if sc[a][1] else -9,
                  reverse=True)
        top = elig[:K]
        mt = mon.get(tm)
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
        picks.append((tm, tuple(top)))
        if mp > 0:
            wins += 1
        ts, es = set(top), set(elig)
        syms = {s for (s, a) in msa[tm] if a in ts}
        for (s, a), v in msa[tm].items():
            if s not in syms or a not in es:
                continue
            fld[0] += v[0]
            fld[1] += v[1]
            peryear[yr][2] += v[0]
            peryear[yr][3] += v[1]
    if real[0] == 0 or fld[0] == 0:
        return None
    ra = real[1] / real[0]
    fa = fld[1] / fld[0]
    yl = {}
    for y, v in sorted(peryear.items()):
        if v[0] and v[2]:
            yl[y] = (v[0], v[1], v[1] / v[0] - v[3] / v[2])
    return dict(months=used, wins=wins, trades=real[0], total=real[1], avg=ra,
                field_avg=fa, lift=ra - fa, years=yl, picks=picks,
                pos_years=sum(1 for v in yl.values() if v[2] > 0), n_years=len(yl))


def main(d):
    field = {}
    for line in open(f"{d}/fld_all.tsv"):
        p = line.rstrip("\n").split("\t")
        field[(p[0], p[1], rkey(p))] = (int(p[7]), int(p[8]))
    print(f"# поле: {len(field)} ячеек (месяц x символ x правило)", file=sys.stderr)

    ga = groups(f"{d}/aut_sorted.tsv", minideas=2)
    gt = groups(f"{d}/trd_sorted.tsv")
    ta = next(ga, None)
    tt = next(gt, None)
    out = []
    while ta is not None or tt is not None:
        if ta is None:
            ka = None
        else:
            ka = rsort(ta[0])
        kt = None if tt is None else rsort(tt[0])
        if ka is not None and (kt is None or ka < kt):
            ta = next(ga, None)
            continue
        if kt is not None and (ka is None or kt < ka):
            tt = next(gt, None)
            continue
        rule = ta[0]
        m = walk(rule, field, ta[1], tt[1])
        if m:
            out.append((rule, m))
        ta = next(ga, None)
        tt = next(gt, None)
    print(f"# правил с результатом: {len(out)}", file=sys.stderr)

    with open(f"{d}/sel_by_rule.tsv", "w") as fh:
        for r, m in out:
            for tm, top in m["picks"]:
                fh.write(f"{r[0]}\t{r[1]}\t{r[2]}\t{r[3]}\t{tm}\t" + "\t".join(top) + "\n")

    with open(f"{d}/lift_by_rule.tsv", "w") as fh:
        fh.write("hold\tlock\tstop\ttrail\tmonths\twins\ttrades\ttotal\tavg\tfield_avg\t"
                 "lift\tpos_years\tn_years\n")
        for r, m in out:
            fh.write(f"{r[0]}\t{r[1]}\t{r[2]}\t{r[3]}\t{m['months']}\t{m['wins']}\t"
                     f"{m['trades']}\t{m['total']:.2f}\t{m['avg']:.4f}\t{m['field_avg']:.4f}\t"
                     f"{m['lift']:.4f}\t{m['pos_years']}\t{m['n_years']}\n")
    print(f"# записано {d}/lift_by_rule.tsv", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
