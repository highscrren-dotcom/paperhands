#!/usr/bin/env python3
"""Последний шанс: ЛУЧШИЕ правила сетки + отбор авторов, слепо."""
import random
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])

# правила, у которых есть И треки авторов (панель 1344), И сделки (проход 3)
CAND = [("20160", "5", "5.5", "5"), ("20160", "5", "10", "5"),
        ("15840", "2", "7.5", "1.5")]        # последняя — точка Петра для сравнения

def load_trades(files, want):
    tr = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))   # rule -> month -> author
    tot = defaultdict(lambda: [0, 0.0])
    for fn in files:
        for line in open(f"{DIR}/{fn}"):
            p = line.rstrip("\n").split("\t")
            r = (p[2], p[3], p[4], p[5])
            if r not in want: continue
            q = tr[r][(p[0], p[6])]; q[0] += 1; q[1] += float(p[11])
            t = tot[r]; t[0] += 1; t[1] += float(p[11])
    return tr, tot

def load_panel(want):
    field, aut = {}, defaultdict(lambda: defaultdict(dict))
    for line in open(f"{DIR}/field_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        if r in want: field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
    for line in open(f"{DIR}/authors_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        if r in want: aut[r][(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
    return field, aut

def run(rule, tr, field, aut, W=12, K=5, MIN=5, by="hit", NDRAW=1000, seed=9, start=2022):
    rnd = random.Random(seed)
    hits = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
    for (m, s), a in aut[rule].items():
        fi, fh = field.get((m, s, rule), (0, 0))
        if fi == 0: continue
        rate = fh / fi
        for au, (i, h) in a.items():
            q = hits[m][au]; q[0] += i; q[1] += h; q[2] += i * rate
    money = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for (m, au), v in tr[rule].items():
        q = money[m][au]; q[0] += v[0]; q[1] += v[1]
    months = sorted(set(hits) | set(money), key=mkey)
    real = [0, 0.0]; fld = [0, 0.0]; draws = [[0, 0.0] for _ in range(NDRAW)]
    used = 0; wins = 0; curve = []
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start: continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2: continue
        sc = defaultdict(lambda: [0, 0.0, 0, 0.0])
        for m in train:
            for au, (i, h, e) in hits[m].items():
                sc[au][0] += i; sc[au][1] += h - e
            for au, (t, p) in money[m].items():
                sc[au][2] += t; sc[au][3] += p
        elig = [a for a, v in sc.items() if v[0] >= MIN]
        if len(elig) < 3 * K: continue
        if by == "hit":
            elig.sort(key=lambda a: sc[a][1] / (sc[a][0] + 20), reverse=True)
        else:
            elig.sort(key=lambda a: sc[a][3] / (sc[a][2] + 10) if sc[a][2] else -9, reverse=True)
        top = elig[:K]
        mt = money.get(tm, {})
        if not mt: continue
        b0 = real[0]; mp = 0.0
        for a in top:
            if a in mt:
                real[0] += mt[a][0]; real[1] += mt[a][1]; mp += mt[a][1]
        if real[0] == b0: continue
        used += 1; curve.append((tm, mp))
        if mp > 0: wins += 1
        for a, v in mt.items():
            fld[0] += v[0]; fld[1] += v[1]
        for d in range(NDRAW):
            for a in rnd.sample(elig, K):
                if a in mt:
                    draws[d][0] += mt[a][0]; draws[d][1] += mt[a][1]
    avg = lambda x: x[1] / x[0] if x[0] else float("nan")
    nl = sorted(avg(d) for d in draws if d[0] > 0)
    return dict(months=used, wins=wins, trades=real[0], total=real[1], avg=avg(real),
                field_avg=avg(fld), field_trades=fld[0],
                p=sum(1 for x in nl if x >= avg(real)) / max(len(nl), 1),
                null=nl[len(nl) // 2] if nl else float("nan"), curve=curve)

want = set(CAND)
tr, tot = load_trades(["trades_all.tsv", "trades2_all.tsv"], want)
field, aut = load_panel(want)

print("=" * 92)
print("15. ЛУЧШИЕ ПРАВИЛА СЕТКИ + ОТБОР АВТОРОВ (слепая проверка, 2022-2026)")
print("=" * 92)
print("in-sample по всей истории:")
for r in CAND:
    t = tot[r]
    print(f"  hold={int(r[0])//1440}сут lock={r[1]}% stop={r[2]}% trail={r[3]}%: "
          f"сделок {t[0]}, суммарно {t[1]:+.1f}%, на сделку {t[1]/max(t[0],1):+.3f}%")
print(f"\n{'правило':<40}{'отбор':>6}{'мес':>5}{'приб.мес':>10}{'сделок':>8}"
      f"{'на сделку':>11}{'суммарно':>11}{'поле':>9}{'p':>7}")
best_positive = []
for r in CAND:
    for by in ("hit", "pnl"):
        for K in (3, 5, 10):
            m = run(r, tr, field, aut, K=K, by=by)
            if m['months'] < 8: continue
            tag = f"hold={int(r[0])//1440:>2}сут lock={r[1]:>2}% stop={r[2]:>4}% trail={r[3]}% K={K:<2}"
            print(f"{tag:<40}{by:>6}{m['months']:>5}{m['wins']:>6}/{m['months']:<3}"
                  f"{m['trades']:>8}{m['avg']:>+11.3f}{m['total']:>+11.1f}"
                  f"{m['field_avg']:>+9.3f}{m['p']:>7.3f}")
            if m['avg'] > 0:
                best_positive.append((r, by, K, m))
print(f"\nконфигураций с ПОЛОЖИТЕЛЬНЫМ PnL вне выборки: {len(best_positive)}")
for r, by, K, m in best_positive:
    print(f"  hold={int(r[0])//1440}сут lock={r[1]}% stop={r[2]}% trail={r[3]}% "
          f"отбор={by} K={K}: {m['avg']:+.3f}%/сделку, суммарно {m['total']:+.1f}% "
          f"за {m['months']} мес, p={m['p']:.3f}")
    print("     помесячно:", ", ".join(f"{t}:{v:+.0f}" for t, v in m['curve'][-14:]))
