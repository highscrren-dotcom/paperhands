#!/usr/bin/env python3
"""Денежная часть: держится ли отбор авторов на PnL, а не только на hitRate."""
import math, random
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])
HEADLINE = ("15840", "2", "7.5", "1.5")

def load_points():
    pts = defaultdict(dict)     # rule -> (month,symbol) -> dict
    for line in open(f"{DIR}/points_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        pts[r][(p[0], p[1])] = dict(total=float(p[6]), avg=float(p[7]), win=float(p[8]),
                                    sharpe=float(p[9]), skipped=int(p[13]),
                                    trades=int(p[14]), hard=int(p[15]), trail=int(p[16]),
                                    lock=int(p[17]), exp=int(p[18]), trunc=int(p[19]))
    return pts

def load_trades():
    tr = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0, 0.0])))
    dirs = defaultdict(lambda: [0, 0.0])
    for line in open(f"{DIR}/trades_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        q = tr[r][(p[0], p[1])][p[6]]
        q[0] += 1; q[1] += float(p[11])
        if r == HEADLINE:
            d = dirs[p[7]]; d[0] += 1; d[1] += float(p[11])
    return tr, dirs

def load_tracks_panel(rules):
    field, aut = {}, defaultdict(lambda: defaultdict(dict))
    for line in open(f"{DIR}/field_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        if r in rules: field[(p[0], p[1], r)] = (int(p[7]), int(p[8]))
    for line in open(f"{DIR}/authors_all.tsv"):
        p = line.rstrip("\n").split("\t")
        r = (p[2], p[3], p[4], p[5])
        if r in rules: aut[r][(p[0], p[1])][p[6]] = (int(p[7]), int(p[8]))
    return field, aut

def money_wf(rule, tr, field, aut, W=12, K=5, MIN=5, by="hit", NDRAW=1000, seed=5,
             start_year=2022):
    """Отбор на прошлых месяцах -> суммарный PnL отобранных в следующем месяце."""
    rnd = random.Random(seed)
    # помесячные агрегаты
    hits = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))   # month->author->[ideas,hits,exp]
    for (m, s), a in aut[rule].items():
        fi, fh = field.get((m, s, rule), (0, 0))
        if fi == 0: continue
        rate = fh / fi
        for au, (i, h) in a.items():
            q = hits[m][au]; q[0] += i; q[1] += h; q[2] += i * rate
    money = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))     # month->author->[trades,pnl]
    for (m, s), d in tr[rule].items():
        for au, v in d.items():
            q = money[m][au]; q[0] += v[0]; q[1] += v[1]
    months = sorted(set(hits) | set(money), key=mkey)
    real = [0, 0.0]; fieldacc = [0, 0.0]; draws = [[0, 0.0] for _ in range(NDRAW)]
    curve = []; used = 0
    for idx, tm in enumerate(months):
        if mkey(tm)[0] < start_year: continue
        train = months[max(0, idx - W):idx]
        if len(train) < 2: continue
        sc = defaultdict(lambda: [0, 0.0, 0, 0.0])   # ideas, excess, trades, pnl
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
        before = real[0]
        mpnl = 0.0
        for a in top:
            if a in mt:
                real[0] += mt[a][0]; real[1] += mt[a][1]; mpnl += mt[a][1]
        if real[0] == before: continue
        used += 1
        curve.append((tm, mpnl))
        for a, v in mt.items():
            fieldacc[0] += v[0]; fieldacc[1] += v[1]
        for d in range(NDRAW):
            for a in rnd.sample(elig, K):
                if a in mt:
                    draws[d][0] += mt[a][0]; draws[d][1] += mt[a][1]
    avg = lambda x: x[1] / x[0] if x[0] else float("nan")
    nl = sorted(avg(d) for d in draws if d[0] > 0)
    r = avg(real)
    tot = sorted(d[1] for d in draws if d[0] > 0)
    return dict(months=used, trades=real[0], avg=r, total=real[1],
                field_avg=avg(fieldacc), field_trades=fieldacc[0],
                p_avg=sum(1 for x in nl if x >= r) / max(len(nl), 1),
                p_tot=sum(1 for x in tot if x >= real[1]) / max(len(tot), 1),
                null_avg=nl[len(nl) // 2] if nl else float("nan"),
                null_tot=tot[len(tot) // 2] if tot else float("nan"),
                curve=curve)

def main():
    pts = load_points(); tr, dirs = load_trades()
    rules = set(pts.keys())
    field, aut = load_tracks_panel(rules)

    print("=" * 86)
    print("8. ДЕНЬГИ В ЦЕЛОМ ПО 12 ЯКОРНЫМ ТОЧКАМ (все 440 тикеро-месяцев, in-sample)")
    print("=" * 86)
    print(f"{'правило hold/lock/stop/trail':<34}{'сделок':>8}{'сум.PnL%':>11}{'на сделку':>11}"
          f"{'мес.в плюс':>12}{'winRate':>9}{'стоп%':>7}{'таймаут%':>9}")
    for r in sorted(pts, key=lambda x: -sum(v['total'] for v in pts[x].values())):
        v = pts[r]
        tot = sum(x['total'] for x in v.values()); trd = sum(x['trades'] for x in v.values())
        pos = sum(1 for x in v.values() if x['total'] > 0)
        wr = sum(x['win'] * x['trades'] for x in v.values()) / max(trd, 1)
        hard = sum(x['hard'] for x in v.values()); exp = sum(x['exp'] for x in v.values())
        mark = "  <-- точка Петра" if r == HEADLINE else ""
        print(f"hold={r[0]:>5} lock={r[1]:>3} stop={r[2]:>4} trail={r[3]:<4}{trd:>8}"
              f"{tot:>+11.1f}{tot/max(trd,1):>+11.3f}{pos:>7}/{len(v):<4}{wr:>9.3f}"
              f"{100*hard/max(trd,1):>7.1f}{100*exp/max(trd,1):>9.1f}{mark}")

    print("\nразбивка сделок точки Петра по направлению:")
    for d, v in sorted(dirs.items()):
        print(f"  {d}: сделок {v[0]}, суммарно {v[1]:+.1f}%, на сделку {v[1]/max(v[0],1):+.3f}%")

    print("\n" + "=" * 86)
    print("9. ДЕНЕЖНАЯ СЛЕПАЯ ПРОВЕРКА ПО ВСЕМ ЯКОРНЫМ ПРАВИЛАМ (отбор top-5 по прошлому)")
    print("=" * 86)
    print(f"{'правило':<34}{'отбор':>7}{'мес':>5}{'сделок':>8}{'на сделку':>11}{'поле':>9}"
          f"{'плацебо-p':>11}{'нуль':>9}")
    rows = []
    for r in sorted(pts):
        for by in ("hit", "pnl"):
            m = money_wf(r, tr, field, aut, W=12, K=5, MIN=5, by=by)
            if m['months'] < 8: continue
            print(f"hold={r[0]:>5} lock={r[1]:>3} stop={r[2]:>4} trail={r[3]:<4}{by:>7}"
                  f"{m['months']:>5}{m['trades']:>8}{m['avg']:>+11.3f}{m['field_avg']:>+9.3f}"
                  f"{m['p_avg']:>11.3f}{m['null_avg']:>+9.3f}")
            rows.append((r, by, m))
    pos = [x for x in rows if x[2]['avg'] > 0]
    print(f"\nвсего связок правило x способ отбора: {len(rows)}; "
          f"с ПОЛОЖИТЕЛЬНЫМ PnL на сделку вне выборки: {len(pos)}; "
          f"бьющих поле с p<0.05: {sum(1 for x in rows if x[2]['p_avg']<0.05)}")
    if pos:
        print("положительные:")
        for r, by, m in pos:
            print(f"   hold={r[0]} lock={r[1]} stop={r[2]} trail={r[3]} отбор={by}: "
                  f"{m['avg']:+.3f}%/сделку, суммарно {m['total']:+.1f}%, p={m['p_avg']:.3f}")

    print("\n" + "=" * 86)
    print("10. ПОМЕСЯЧНАЯ КРИВАЯ ОТОБРАННОГО ПОРТФЕЛЯ (точка Петра, отбор по hitRate)")
    print("=" * 86)
    m = money_wf(HEADLINE, tr, field, aut, W=12, K=5, MIN=5, by="hit")
    run = 0.0; wins = 0
    for tm, p in m['curve']:
        run += p
        if p > 0: wins += 1
    print(f"месяцев {len(m['curve'])}, прибыльных {wins}, суммарно {run:+.1f}% "
          f"(сумма процентов по сделкам, не капитал)")
    print("последние 12 месяцев:", ", ".join(f"{t}:{p:+.1f}" for t, p in m['curve'][-12:]))

if __name__ == "__main__":
    main()
