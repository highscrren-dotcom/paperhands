#!/usr/bin/env python3
"""verify_tv.py — adversarial checks on the tv_sharpe verdict.
(1) 8h horizon coverage: do exits actually reach ~480m or are they truncated?
(2) PLACEBO: random directions (seeded) — a real directional signal must
    collapse to ~0 under random labels; if placebo ~ actual, the 'edge' is a
    drift/asymmetry artifact, not forecasting.
(3) DE-BETA: subtract contemporaneous BTCUSDT move (dir-signed) — removes market
    beta. If the tiny long edge was just crypto drift, de-beta'd edge -> 0.
"""
import sys, math, random, glob
from bisect import bisect_left, bisect_right
sys.path.insert(0, "/home/s1dd1/dev/quant/paperhands/agent/notes/tradingview-dataset")
from tv_sharpe import load_ideas, load_candles, to_binance_symbol, HORIZONS, MIN, CANDLES

rng = random.Random(42)

def stat(xs):
    n=len(xs)
    if n<2: return (n,0,0,0,0)
    m=sum(xs)/n
    s=math.sqrt(sum((x-m)**2 for x in xs)/(n-1))
    sh=m/s if s>0 else 0
    return (n, m, s, sh, sh*math.sqrt(n))

def line(tag, xs):
    n,m,s,sh,t = stat(xs)
    return f"{tag:14} n={n:6} μ={m*100:+.4f}% S={sh:+.4f} t={t:+.2f}"

ideas, kept = load_ideas()
print(f"kept={kept}", file=sys.stderr)

# BTC index for de-beta
btc_ts, btc_cl = load_candles("BTCUSDT")
def btc_long(base_t, mins):
    i = bisect_left(btc_ts, base_t)
    if i>=len(btc_ts): return None
    e = btc_cl[i]; target = btc_ts[i] + mins*MIN
    j = bisect_right(btc_ts, target)-1
    if j<=i or e<=0 or btc_cl[j]<=0: return None
    return btc_cl[j]/e - 1

H8 = 480
actual = {h:[] for h,_ in HORIZONS}
placebo = {h:[] for h,_ in HORIZONS}
debeta_long = []  # 8h long-only, market-adjusted
debeta_short = []
exit_lag8 = []
actual_L = {h:[] for h,_ in HORIZONS}; actual_S = {h:[] for h,_ in HORIZONS}
placebo_L = {h:[] for h,_ in HORIZONS}; placebo_S = {h:[] for h,_ in HORIZONS}

for sym, lst in ideas.items():
    if not glob.glob(f"{CANDLES}/{sym}-*.jsonl"): continue
    ts, cl = load_candles(sym)
    if not len(ts): continue
    for idea in lst:
        eo = ((idea["ts"]+MIN-1)//MIN)*MIN
        i = bisect_left(ts, eo)
        if i>=len(ts): continue
        base_t = ts[i]; entry = cl[i]
        if entry<=0: continue
        pdir = "LONG" if rng.random()<0.5 else "SHORT"
        for label, mins in HORIZONS:
            target = base_t + mins*MIN
            j = bisect_right(ts, target)-1
            if j<=i or cl[j]<=0: continue
            cx = cl[j]
            if label=="8h": exit_lag8.append((ts[j]-base_t)/MIN)
            a = (cx/entry-1) if idea["dir"]=="LONG" else (entry/cx-1)
            pp= (cx/entry-1) if pdir=="LONG" else (entry/cx-1)
            actual[label].append(a); placebo[label].append(pp)
            (actual_L if idea["dir"]=="LONG" else actual_S)[label].append(a)
            (placebo_L if pdir=="LONG" else placebo_S)[label].append(pp)
            if label=="8h":
                bl = btc_long(base_t, mins)
                if bl is not None:
                    sign = 1 if idea["dir"]=="LONG" else -1
                    ex = a - sign*bl
                    (debeta_long if idea["dir"]=="LONG" else debeta_short).append(ex)

print("\n=== (1) 8h exit-lag coverage (target 480m) ===")
exit_lag8.sort()
q=lambda p: exit_lag8[int(p*(len(exit_lag8)-1))]
print(f"n={len(exit_lag8)} p10={q(.1):.0f} p50={q(.5):.0f} p90={q(.9):.0f} min={exit_lag8[0]:.0f} max={exit_lag8[-1]:.0f}  (<480 => truncated by +485 window)")
frac_full = sum(1 for x in exit_lag8 if x>=470)/len(exit_lag8)
print(f"fraction reaching >=470m: {frac_full*100:.1f}%")

print("\n=== (2) PLACEBO (random dir) vs ACTUAL — signal must beat placebo ===")
for h,_ in HORIZONS:
    print(line(f"actual {h} ALL", actual[h]))
    print(line(f"placebo {h} ALL", placebo[h]))
print("-- short cut (the non-beta hint) --")
for h,_ in HORIZONS:
    print(line(f"actual {h} SHORT", actual_S[h]))
    print(line(f"placebo {h} SHORT", placebo_S[h]))

print("\n=== (3) DE-BETA 8h (subtract dir-signed BTC move) ===")
print(line("raw LONG 8h", actual_L["8h"]))
print(line("debeta LONG 8h", debeta_long))
print(line("raw SHORT 8h", actual_S["8h"]))
print(line("debeta SHORT 8h", debeta_short))
