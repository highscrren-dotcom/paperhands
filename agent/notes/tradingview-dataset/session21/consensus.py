#!/usr/bin/env python3
"""Консенсус толпы: репликация Петра + причинная версия + полная сетка.

Ключевая правка: у автора окно согласия СИММЕТРИЧНО (|o.entry - t.entry| <= W),
то есть в фильтр входа попадают идеи, опубликованные ПОСЛЕ входа. На момент
сделки их не существует. Здесь считаются обе версии:
  sym   - как у автора, [t-W, t+W]
  causal- честная, [t-W, t]
"""
import sys, math, random
from collections import defaultdict

DIR = "/tmp/claude-1000/-home-s1dd1-dev-quant/9c05b72b-d954-4ac2-9790-35f2e95bd445/scratchpad/night"
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def mkey(m):
    a, b = m.split("_"); return (int(b), MON[a])
HEAD = ("15840", "2", "7.5", "1.5")     # окно Петра: стоп 7.5 / трейл 1.5 / 11 сут / лок 2
HOUR = 3600_000

def load_trades(rule, symbol=None):
    """(month,symbol) -> [ (entry, direction, pnl, author) ]"""
    out = defaultdict(list)
    for fn in ("trades_all.tsv", "trades2_all.tsv", "trades3_all.tsv"):
        try: fh = open(f"{DIR}/{fn}")
        except FileNotFoundError: continue
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if (p[2], p[3], p[4], p[5]) != rule: continue
            if symbol and p[1] != symbol: continue
            out[(p[0], p[1])].append((int(p[8]), p[7], float(p[11]), p[6]))
    for k in out: out[k].sort()
    return out

def load_ideas():
    """(month,symbol) -> [ (ts, direction) ] — ВСЕ мнения толпы, не только торгуемые"""
    out = defaultdict(list)
    for line in open(f"{DIR}/feed.tsv"):
        p = line.rstrip("\n").split("\t")
        if len(p) < 6 or p[4] not in ("LONG", "SHORT"): continue
        out[(p[0], p[3])].append((int(p[2]), p[4]))
    for k in out: out[k].sort()
    return out

def counts(events, t, D, W, causal):
    """same, opp в окне относительно момента t"""
    lo, hi = t - W, (t if causal else t + W)
    same = opp = 0
    for ts, d in events:
        if lo <= ts <= hi:
            if d == D: same += 1
            else: opp += 1
    return same, opp

def evaluate(trades, source, W, mode, rule_fn, direction=None):
    """rule_fn(same,opp)->bool ; source: 'trades'|'ideas' ; mode: 'sym'|'causal'"""
    causal = (mode == "causal")
    tot_n = tot_p = 0.0; k_n = k_p = 0.0
    per_month = defaultdict(lambda: [0, 0.0, 0, 0.0])
    for (m, s), tr in trades.items():
        ev = [(e, d) for e, d, _, _ in tr] if source == "trades" else source_ideas.get((m, s), [])
        for (e, d, pnl, a) in tr:
            if direction and d != direction: continue
            tot_n += 1; tot_p += pnl
            pm = per_month[m]; pm[0] += 1; pm[1] += pnl
            same, opp = counts(ev, e, d, W, causal)
            if rule_fn(same, opp):
                k_n += 1; k_p += pnl
                pm[2] += 1; pm[3] += pnl
    better = sum(1 for v in per_month.values() if v[3] > v[1])
    return dict(all_n=tot_n, all_p=tot_p, keep_n=k_n, keep_p=k_p,
                all_per=(tot_p / tot_n if tot_n else 0),
                keep_per=(k_p / k_n if k_n else 0),
                better=better, months=len(per_month), per_month=per_month)

source_ideas = load_ideas()

if __name__ == "__main__":
    tr_btc = load_trades(HEAD, "BTCUSDT")
    print("=" * 92)
    print("1. РЕПЛИКАЦИЯ ЧИСЕЛ ПЕТРА (BTCUSDT, окно 7.5/1.5/11сут/2, консенсус ±24ч по СДЕЛКАМ)")
    print("=" * 92)
    print(f"месяцев с данными: {len(tr_btc)}")
    print(f"{'направление':<12}{'вариант':<14}{'PnL':>11}{'сделок':>8}{'на сделку':>11}{'лучше в мес':>13}")
    for D in ("SHORT", "LONG"):
        r = evaluate(tr_btc, "trades", 24 * HOUR, "sym", lambda s, o: s > o, D)
        print(f"{D:<12}{'все':<14}{r['all_p']:>+11.1f}{int(r['all_n']):>8}{r['all_per']:>+11.3f}")
        print(f"{'':<12}{'консенсус':<14}{r['keep_p']:>+11.1f}{int(r['keep_n']):>8}{r['keep_per']:>+11.3f}"
              f"{r['better']:>9}/{r['months']:<3}")
    print("\nу Петра: SHORT все −616.2%/1356 (−0.454), консенсус −154.2%/536 (−0.288), лучше 34/67")
    print("         LONG  все −952.8%/2576 (−0.370), консенсус −744.9%/2091 (−0.356), лучше 32/67")

    print("\n" + "=" * 92)
    print("2. ЦЕНА ЗАГЛЯДЫВАНИЯ ВПЕРЁД: симметричное окно против причинного")
    print("=" * 92)
    print(f"{'направление':<10}{'источник':<9}{'окно':<8}{'режим':<9}{'сделок':>8}{'PnL':>11}"
          f"{'на сделку':>11}{'лучше мес':>11}")
    for D in ("SHORT", "LONG"):
        for src in ("trades", "ideas"):
            for mode in ("sym", "causal"):
                r = evaluate(tr_btc, src, 24 * HOUR, mode, lambda s, o: s > o, D)
                print(f"{D:<10}{src:<9}{'±24ч' if mode=='sym' else '[-24ч,0]':<8}{mode:<9}"
                      f"{int(r['keep_n']):>8}{r['keep_p']:>+11.1f}{r['keep_per']:>+11.3f}"
                      f"{r['better']:>7}/{r['months']:<3}")

    print("\n" + "=" * 92)
    print("3. ПОЛНАЯ СЕТКА КОНСЕНСУСА (ТЗ раздел 9, шаг 1) — причинное окно, источник: идеи")
    print("=" * 92)
    print(f"{'напр':<7}{'W,ч':>5}{'правило':<14}{'сделок':>8}{'PnL':>11}{'на сделку':>11}"
          f"{'плюс.мес':>10}{'лучше базы':>12}")
    rows = []
    for D in ("SHORT", "LONG"):
        base = evaluate(tr_btc, "ideas", 24 * HOUR, "causal", lambda s, o: True, D)
        print(f"{D:<7}{'—':>5}{'без фильтра':<14}{int(base['all_n']):>8}{base['all_p']:>+11.1f}"
              f"{base['all_per']:>+11.3f}")
        for H in (6, 12, 24, 48, 72):
            W = H * HOUR
            variants = [("same>opp", lambda s, o: s > o)]
            for K in (1, 2, 3, 4, 6):
                variants.append((f"перевес>={K}", (lambda K: lambda s, o: s - o >= K)(K)))
            for R in (0.55, 0.6, 0.7):
                variants.append((f"доля>={R}", (lambda R: lambda s, o: (s + o) > 0 and s / (s + o) >= R)(R)))
            for name, fn in variants:
                r = evaluate(tr_btc, "ideas", W, "causal", fn, D)
                if r['keep_n'] < 30: continue
                pos = sum(1 for v in r['per_month'].values() if v[3] > 0)
                print(f"{D:<7}{H:>5}{name:<14}{int(r['keep_n']):>8}{r['keep_p']:>+11.1f}"
                      f"{r['keep_per']:>+11.3f}{pos:>7}/{r['months']:<3}{r['better']:>9}/{r['months']:<3}")
                rows.append((D, H, name, r))
    best = sorted(rows, key=lambda x: -x[3]['keep_per'])[:5]
    print("\nлучшие 5 по PnL на сделку:")
    for D, H, name, r in best:
        print(f"  {D} W={H}ч {name}: {r['keep_per']:+.3f}%/сделку, {int(r['keep_n'])} сделок, "
              f"суммарно {r['keep_p']:+.1f}%")
