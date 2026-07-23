#!/usr/bin/env python3
"""tv_sharpe.py — do retail TradingView ideas predict price? (evidence-first)

Ports news_sharpe.mjs methodology (author №88а) to the tv-ideas dataset:
  - entry = close of FIRST 1m candle with open >= idea.ts  (look-ahead-safe:
    close happens AFTER publication; ts = look-ahead-bias-free per author)
  - horizons 1h/4h/8h (60/240/480 min) — bundle forward window is +485 min,
    so 24h is out of coverage (would need external candles; not used here)
  - directional return: LONG -> c_exit/entry-1 ; SHORT -> entry/c_exit-1
  - Sharpe = mean/std per-trade (no annualization). t-stat = Sharpe*sqrt(n).
  - friction NOT in the raw Sharpe (this measures FORECAST quality); a
    friction-adjusted mean (-0.2% round-trip) is reported alongside for
    tradeability.

HONESTY CONTROLS:
  - LONG vs SHORT asymmetry = the beta control. Real skill => longs up AND
    shorts down (both positive directional return). If only longs are positive,
    it's just crypto drift, not forecasting.
  - per-author / per-symbol cells are many => multiple testing; flagged.
  - n>=5 to print a Sharpe, n>=30 to start believing a cell.

Universe filter = author's candles.mjs (see tv_universe.py): ts>=2022-01-01,
direction in {LONG,SHORT}, isScript=false, symbol->Binance USDT via toBinanceSymbol.
"""
import json, re, os, sys, math
from array import array
from bisect import bisect_left, bisect_right
from collections import defaultdict, Counter

ROOT = "/home/s1dd1/dev/quant/tradingview-ideas-signals/data"
CANDLES = f"{ROOT}/candles"
OUT = "/home/s1dd1/dev/quant/paperhands/agent/notes/tradingview-dataset/tv-sharpe-heatmap.md"
FROM_TS = 1640995200000  # 2022-01-01Z
MIN = 60_000
HORIZONS = [("1h", 60), ("4h", 240), ("8h", 480)]
FRICTION = 0.002  # 0.2% round-trip (commission+slippage), for tradeability line
MIN_PRINT_N = 5
SIG_N = 30

FIAT_BASES = {"EUR","GBP","AUD","NZD","JPY","CHF","CAD","TRY","XAU","XAG","XTI","XPT"}
TICKER_RENAMES = {"TON":"GRAM","MATIC":"POL","FTM":"S"}
_RE = re.compile(r'^([A-Z0-9]{2,15}?)(USDT|USDC|USD)$')
def to_binance_symbol(short):
    s = re.sub(r'\.P[S]?$', '', str(short or "").upper())
    m = _RE.match(s)
    if not m or m.group(1) in FIAT_BASES:
        return None
    return TICKER_RENAMES.get(m.group(1), m.group(1)) + "USDT"

def load_ideas():
    valid = set(json.load(open(f"{ROOT}/binance-symbols.json")))
    # popularity: max likes per id
    likes = {}
    lf = f"{ROOT}/tv-likes.jsonl"
    if os.path.exists(lf):
        for line in open(lf):
            line = line.strip()
            if not line: continue
            try: r = json.loads(line)
            except: continue
            i = r.get("id"); lk = r.get("likes", 0) or 0
            if i is not None:
                likes[i] = max(likes.get(i, 0), lk)
    ideas = defaultdict(list)  # symbol -> list of idea dicts
    kept = 0
    for line in open(f"{ROOT}/tv-ideas.jsonl"):
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except: continue
        if r.get("isScript"): continue
        d = r.get("direction")
        if d not in ("LONG","SHORT"): continue
        ts = r.get("ts")
        if ts is None or ts < FROM_TS: continue
        sym = to_binance_symbol(r.get("symbol"))
        if sym is None or sym not in valid: continue
        import datetime as dt
        ideas[sym].append({
            "ts": ts, "dir": d, "pro": bool(r.get("authorIsPro")),
            "author": r.get("author","?"), "year": dt.datetime.fromtimestamp(ts/1000, dt.timezone.utc).year,
            "likes": likes.get(r.get("id"), 0),
        })
        kept += 1
    return ideas, kept

def load_candles(sym):
    """all data/candles/<SYM>-*.jsonl -> (ts_array_int, close_array_float) sorted."""
    import glob
    rows = []
    ap = rows.append
    for fp in sorted(glob.glob(f"{CANDLES}/{sym}-*.jsonl")):
        with open(fp) as f:
            for line in f:
                # fixed format {"s":"..","t":NNN,"o":..,"h":..,"l":..,"c":CCC,"v":..}
                ti = line.find('"t":')
                ci = line.find('"c":')
                if ti < 0 or ci < 0: continue
                ti += 4; tj = line.find(',', ti)
                ci += 4; cj = line.find(',', ci)
                try:
                    ap((int(line[ti:tj]), float(line[ci:cj])))
                except: continue
    rows.sort(key=lambda x: x[0])
    ts = array('q'); cl = array('d')
    last = None
    for t, c in rows:
        if t == last:  # dedupe identical timestamps
            continue
        ts.append(t); cl.append(float(c)); last = t
    return ts, cl

def directional_returns(idea, ts, cl):
    entry_open = ((idea["ts"] + MIN - 1) // MIN) * MIN
    i = bisect_left(ts, entry_open)
    if i >= len(ts):
        return None, None
    base_t = ts[i]; entry = cl[i]
    if entry <= 0:
        return None, None
    entry_lag = (base_t - idea["ts"]) / MIN  # minutes entry candle is after ts
    rets = {}
    for label, mins in HORIZONS:
        target = base_t + mins * MIN
        j = bisect_right(ts, target) - 1
        if j <= i:
            rets[label] = None; continue
        cx = cl[j]
        if cx <= 0:
            rets[label] = None; continue
        rets[label] = (cx/entry - 1) if idea["dir"] == "LONG" else (entry/cx - 1)
    return rets, entry_lag

# ---- stats ----
def mean(xs): return sum(xs)/len(xs)
def std(xs):
    if len(xs) < 2: return None
    m = mean(xs); return math.sqrt(sum((x-m)**2 for x in xs)/(len(xs)-1))
def cell(xs):
    n = len(xs)
    if n == 0: return None
    m = mean(xs); s = std(xs)
    sharpe = (m/s) if (n >= MIN_PRINT_N and s and s > 0) else None
    t = (sharpe*math.sqrt(n)) if sharpe is not None else None
    wr = sum(1 for x in xs if x > 0)/n
    return {"n": n, "mean": m, "std": s, "sharpe": sharpe, "t": t, "wr": wr,
            "mean_fr": m - FRICTION}

def fmt(c):
    if c is None: return "—"
    sh = f"{c['sharpe']:.3f}" if c['sharpe'] is not None else ("н/д" if c['n']<MIN_PRINT_N else "σ=0")
    t  = f"{c['t']:+.2f}" if c['t'] is not None else "—"
    star = "" if c['n']>=SIG_N else "†"
    return f"n={c['n']}{star} μ={c['mean']*100:+.3f}% σ={(c['std']*100 if c['std'] else 0):.2f}% S={sh} t={t} WR={c['wr']*100:.0f}% μ-fr={c['mean_fr']*100:+.3f}%"

def main():
    ideas, kept = load_ideas()
    print(f"[tv_sharpe] kept ideas: {kept} across {len(ideas)} symbols", file=sys.stderr)
    # records[horizon] grouped by dimension
    recs = {h: [] for h,_ in HORIZONS}          # (dir,pro,author,year,symbol,likes,ret)
    entry_lags = []
    no_entry = 0
    symbols_missing = []
    done = 0
    for sym, lst in sorted(ideas.items(), key=lambda kv: -len(kv[1])):
        import glob
        if not glob.glob(f"{CANDLES}/{sym}-*.jsonl"):
            symbols_missing.append((sym, len(lst))); continue
        ts, cl = load_candles(sym)
        if len(ts) == 0:
            symbols_missing.append((sym, len(lst))); continue
        for idea in lst:
            rets, lag = directional_returns(idea, ts, cl)
            if rets is None:
                no_entry += 1; continue
            entry_lags.append(lag)
            for label,_ in HORIZONS:
                r = rets[label]
                if r is None: continue
                recs[label].append((idea["dir"], idea["pro"], idea["author"], idea["year"], sym, idea["likes"], r))
        done += 1
        if done % 50 == 0:
            print(f"  ..{done} symbols processed", file=sys.stderr)

    def sub(label, pred):
        return [r[6] for r in recs[label] if pred(r)]

    L = []
    def p(s=""): L.append(s)
    tot = len(recs[HORIZONS[0][0]])
    p(f"# TradingView retail ideas — predictive-power Sharpe (evidence-first)")
    p("")
    p(f"> Universe: {kept} ideas (2022-01-01..2026, Binance-spot-crypto, dir∈LONG/SHORT, isScript=false).")
    p(f"> Entry = close of 1st 1m candle ≥ idea.ts (look-ahead-safe). Horizons 1h/4h/8h (bundle fwd window +485m).")
    p(f"> S = per-trade Sharpe μ/σ; t = S·√n (H0: μ=0); WR = win-rate; μ-fr = μ − 0.2% round-trip friction.")
    p(f"> †  n<{SIG_N} (weak cell). Friction NOT in raw Sharpe — this measures FORECAST quality, not a strategy P&L.")
    if symbols_missing:
        miss_n = sum(n for _,n in symbols_missing)
        p(f"> ⚠️ candles missing for {len(symbols_missing)} symbols ({miss_n} ideas) — download incomplete or symbol absent.")
    p("")
    p("## Overall + LONG-vs-SHORT (the beta control: real skill ⇒ BOTH positive)")
    p("")
    p("| cut | " + " | ".join(h for h,_ in HORIZONS) + " |")
    p("|---|" + "---|"*len(HORIZONS))
    for name, pred in [("ALL", lambda r: True),
                       ("LONG", lambda r: r[0]=="LONG"),
                       ("SHORT", lambda r: r[0]=="SHORT")]:
        p(f"| {name} | " + " | ".join(fmt(cell(sub(h, pred))) for h,_ in HORIZONS) + " |")
    p("")
    p("## authorIsPro (do TV-Pro authors predict better?)")
    p("")
    p("| cut | " + " | ".join(h for h,_ in HORIZONS) + " |")
    p("|---|" + "---|"*len(HORIZONS))
    for name, pred in [("pro", lambda r: r[1]), ("non-pro", lambda r: not r[1])]:
        p(f"| {name} | " + " | ".join(fmt(cell(sub(h, pred))) for h,_ in HORIZONS) + " |")
    p("")
    p("## by year (walk-forward view — is any 'edge' stable or period-specific?)")
    p("")
    p("| year | " + " | ".join(h for h,_ in HORIZONS) + " |")
    p("|---|" + "---|"*len(HORIZONS))
    for y in sorted(set(r[3] for r in recs[HORIZONS[0][0]])):
        p(f"| {y} | " + " | ".join(fmt(cell(sub(h, lambda r,y=y: r[3]==y))) for h,_ in HORIZONS) + " |")
    p("")
    p("## top symbols (n≥30)")
    p("")
    symcount = Counter(r[4] for r in recs[HORIZONS[0][0]])
    p("| symbol | " + " | ".join(h for h,_ in HORIZONS) + " |")
    p("|---|" + "---|"*len(HORIZONS))
    for sym,_n in symcount.most_common(15):
        p(f"| {sym} | " + " | ".join(fmt(cell(sub(h, lambda r,sym=sym: r[4]==sym))) for h,_ in HORIZONS) + " |")
    p("")
    p("## likes bucket (popularity ~ confidence proxy)")
    p("")
    def lb(lk): return "0" if lk==0 else "1-5" if lk<=5 else "6-20" if lk<=20 else "21+"
    p("| likes | " + " | ".join(h for h,_ in HORIZONS) + " |")
    p("|---|" + "---|"*len(HORIZONS))
    for b in ["0","1-5","6-20","21+"]:
        p(f"| {b} | " + " | ".join(fmt(cell(sub(h, lambda r,b=b: lb(r[5])==b))) for h,_ in HORIZONS) + " |")
    p("")
    p("## top authors by 4h Sharpe (n≥30) — ⚠️ MULTIPLE TESTING: 74 authors tested, expect false positives")
    p("")
    authcount = Counter(r[2] for r in recs["4h"])
    auth_cells = []
    for a,n in authcount.items():
        if n < SIG_N: continue
        c = cell(sub("4h", lambda r,a=a: r[2]==a))
        if c and c["sharpe"] is not None:
            auth_cells.append((a, c))
    auth_cells.sort(key=lambda x: -(x[1]["sharpe"] or -9))
    p("| author | n | 4h: μ | S | t | WR | μ-fr |")
    p("|---|---|---|---|---|---|---|")
    for a,c in auth_cells[:12]:
        p(f"| {a} | {c['n']} | {c['mean']*100:+.3f}% | {c['sharpe']:.3f} | {c['t']:+.2f} | {c['wr']*100:.0f}% | {c['mean_fr']*100:+.3f}% |")
    p("… (worst) …")
    for a,c in auth_cells[-4:]:
        p(f"| {a} | {c['n']} | {c['mean']*100:+.3f}% | {c['sharpe']:.3f} | {c['t']:+.2f} | {c['wr']*100:.0f}% | {c['mean_fr']*100:+.3f}% |")
    p("")
    if entry_lags:
        entry_lags.sort()
        q = lambda pp: entry_lags[int(pp*(len(entry_lags)-1))]
        p(f"entry-lag (min after ts): p50={q(.5):.1f} p90={q(.9):.1f} max={entry_lags[-1]:.0f}; no-entry(no candle after ts)={no_entry}")
    p("")
    txt = "\n".join(L)
    open(OUT, "w").write(txt + "\n")
    print(txt)
    print(f"\n[tv_sharpe] -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
