#!/usr/bin/env python3
"""ТЗ шаги 2-4: другие символы, walk-forward со всеми контролями, детектор режима."""
import math, random
from collections import defaultdict
from consensus import load_trades, source_ideas, counts, HEAD, HOUR, mkey

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"

RULES = [("same>opp", lambda s, o: s > o)]
for K in (2, 3, 4, 6):
    RULES.append((f"перевес>={K}", (lambda K: lambda s, o: s - o >= K)(K)))
for R in (0.6, 0.7):
    RULES.append((f"доля>={R}", (lambda R: lambda s, o: (s + o) > 0 and s / (s + o) >= R)(R)))
WINDOWS = (6, 12, 24, 48, 72)

def annotate(trades):
    """для каждой сделки считаем (same,opp) причинно по идеям для всех W"""
    out = []
    for (m, s), tr in trades.items():
        ev = source_ideas.get((m, s), [])
        for (e, d, pnl, a) in tr:
            cs = {H: counts(ev, e, d, H * HOUR, True) for H in WINDOWS}
            out.append((m, s, e, d, pnl, cs))
    return out

print("=" * 92)
print("4. ДРУГИЕ СИМВОЛЫ (ТЗ шаг 4): причинный консенсус, окно Петра")
print("=" * 92)
print(f"{'символ':<10}{'напр':<7}{'без фильтра':>22}{'лучшая причинная ячейка':>40}")
for sym in ("BTCUSDT", "ETHUSDT", "DOGEUSDT", "SOLUSDT"):
    ann = annotate(load_trades(HEAD, sym))
    for D in ("SHORT", "LONG"):
        sub = [x for x in ann if x[3] == D]
        if len(sub) < 100: continue
        base_n = len(sub); base_p = sum(x[4] for x in sub)
        best = None
        for H in WINDOWS:
            for name, fn in RULES:
                keep = [x for x in sub if fn(*x[5][H])]
                if len(keep) < max(30, 0.1 * base_n): continue
                per = sum(x[4] for x in keep) / len(keep)
                if best is None or per > best[0]:
                    best = (per, H, name, len(keep), sum(x[4] for x in keep))
        b = f"W={best[1]}ч {best[2]}: {best[0]:+.3f}%/сд, {best[3]} сд" if best else "нет ячеек"
        print(f"{sym:<10}{D:<7}{base_p:>+10.1f}% /{base_n:>5} сд ({base_p/base_n:+.3f}){b:>40}")

print("\n" + "=" * 92)
print("5. WALK-FORWARD (ТЗ шаг 3): параметры с прошлых 12 мес -> торговля следующего")
print("=" * 92)
ann_btc = annotate(load_trades(HEAD, "BTCUSDT"))
by_month = defaultdict(list)
for x in ann_btc: by_month[x[0]].append(x)
months = sorted(by_month, key=mkey)

def wf(direction, mode="causal", pick="pnl_per_trade"):
    """выбираем (W,правило) на окне обучения, меряем на следующем месяце"""
    picked = [0, 0.0]; nofilter = [0, 0.0]; rnd_acc = [0, 0.0]
    rnd = random.Random(4); used = 0; wins = 0; hist = []
    for i, tm in enumerate(months):
        if i < 12: continue
        train = months[i - 12:i]
        tr = [x for m in train for x in by_month[m] if x[3] == direction]
        te = [x for x in by_month[tm] if x[3] == direction]
        if len(tr) < 50 or not te: continue
        best = None
        for H in WINDOWS:
            for name, fn in RULES:
                keep = [x for x in tr if fn(*x[5][H])]
                if len(keep) < 0.15 * len(tr): continue     # не даём фильтру "победить" отказом
                per = sum(x[4] for x in keep) / len(keep)
                if best is None or per > best[0]: best = (per, H, name, fn)
        if not best: continue
        _, H, name, fn = best
        keep = [x for x in te if fn(*x[5][H])]
        if not keep: continue
        used += 1
        picked[0] += len(keep); picked[1] += sum(x[4] for x in keep)
        nofilter[0] += len(te); nofilter[1] += sum(x[4] for x in te)
        rH = rnd.choice(WINDOWS); rname, rfn = rnd.choice(RULES)
        rk = [x for x in te if rfn(*x[5][rH])]
        rnd_acc[0] += len(rk); rnd_acc[1] += sum(x[4] for x in rk)
        mp = sum(x[4] for x in keep)
        if mp > 0: wins += 1
        hist.append((tm, H, name, len(keep), mp))
    per = lambda a: a[1] / a[0] if a[0] else float("nan")
    return dict(months=used, wins=wins, picked=picked, nofilter=nofilter, rnd=rnd_acc,
                p_per=per(picked), n_per=per(nofilter), r_per=per(rnd_acc), hist=hist)

print(f"{'напр':<8}{'мес':>5}{'плюс.мес':>10}{'сделок':>8}{'PnL выбранного':>16}{'на сделку':>11}"
      f"{'без фильтра':>13}{'случайный фильтр':>18}")
for D in ("SHORT", "LONG"):
    r = wf(D)
    print(f"{D:<8}{r['months']:>5}{r['wins']:>7}/{r['months']:<3}{r['picked'][0]:>8}"
          f"{r['picked'][1]:>+16.1f}{r['p_per']:>+11.3f}{r['n_per']:>+13.3f}{r['r_per']:>+18.3f}")
    print("   что выбирал (последние 6 мес):",
          ", ".join(f"{t}:W{H}/{n}" for t, H, n, _, _ in r['hist'][-6:]))

print("\n" + "=" * 92)
print("6. ДЕТЕКТОР НЕРАБОЧЕГО МЕСЯЦА (ТЗ шаг 2): признаки, доступные ДО входа")
print("=" * 92)
# месячный PnL базового окна + признаки предыдущего месяца
mon_pnl = {}; mon_n = {}
for m in months:
    v = by_month[m]
    mon_pnl[m] = sum(x[4] for x in v); mon_n[m] = len(v)
feat = {}
for m in months:
    ideas = source_ideas.get((m, "BTCUSDT"), [])
    L = sum(1 for _, d in ideas if d == "LONG"); S = len(ideas) - L
    feat[m] = dict(skew=(L - S) / max(L + S, 1), n_ideas=len(ideas))
rows = []
for i, m in enumerate(months):
    if i == 0: continue
    p = months[i - 1]
    rows.append((m, mon_pnl[m], feat[p]['skew'], feat[p]['n_ideas'], mon_pnl[p], mon_n[p]))
def corr(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs) / n); sy = math.sqrt(sum((y - my) ** 2 for y in ys) / n)
    if sx == 0 or sy == 0: return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (n * sx * sy)
y = [r[1] for r in rows]
for idx, nm in ((2, "перекос ленты пред.мес"), (3, "число идей пред.мес"),
                (4, "PnL пред.мес"), (5, "число сделок пред.мес")):
    print(f"  корреляция признака «{nm}» с PnL текущего месяца: {corr([r[idx] for r in rows], y):+.3f}")
dead = [r for r in rows if r[1] < -100]
alive = [r for r in rows if r[1] > 0]
print(f"\nмесяцев с PnL < −100%: {len(dead)}, с PnL > 0: {len(alive)}")
for idx, nm in ((2, "перекос"), (4, "PnL пред.мес")):
    dm = sum(r[idx] for r in dead) / max(len(dead), 1)
    am = sum(r[idx] for r in alive) / max(len(alive), 1)
    print(f"  средний «{nm}»: у мёртвых {dm:+.3f}, у живых {am:+.3f}")
