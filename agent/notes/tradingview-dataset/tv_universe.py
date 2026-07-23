#!/usr/bin/env python3
"""tv_universe.py — quantify the ANALYZABLE universe of tv-ideas before Sharpe.

Ports the author's candles.mjs filters EXACTLY (сначала код автора):
  - drop isScript
  - keep direction in {LONG, SHORT}  (NEUTRAL excluded, like HOLD)
  - drop ts < 2022-01-01  (candles only downloaded from --from default)
  - symbol must map via toBinanceSymbol() to a Binance TRADING USDT pair
Reports coverage + distributions (direction / isPro / year / top symbols/authors)
and the firstSeen-ts lag (tradeability caveat: you could only act at firstSeen).
"""
import json, re, os
from collections import Counter, defaultdict

DATA = "/home/s1dd1/dev/quant/tradingview-ideas-signals/data"
IDEAS = f"{DATA}/tv-ideas.jsonl"
SYMS = f"{DATA}/binance-symbols.json"
FROM_TS = 1640995200000  # 2022-01-01T00:00:00Z in ms (author default --from)

# ---- port of candles.mjs toBinanceSymbol() ----
FIAT_BASES = {"EUR","GBP","AUD","NZD","JPY","CHF","CAD","TRY","XAU","XAG","XTI","XPT"}
TICKER_RENAMES = {"TON":"GRAM","MATIC":"POL","FTM":"S"}
_RE = re.compile(r'^([A-Z0-9]{2,15}?)(USDT|USDC|USD)$')
def to_binance_symbol(short):
    s = re.sub(r'\.P[S]?$', '', str(short or "").upper())
    m = _RE.match(s)
    if not m or m.group(1) in FIAT_BASES:
        return None
    base = TICKER_RENAMES.get(m.group(1), m.group(1))
    return base + "USDT"

valid = set(json.load(open(SYMS)))

tot = 0
drop_script = drop_dir = drop_old = drop_sym_parse = drop_sym_notlisted = 0
kept = 0
by_dir = Counter(); by_pro = Counter(); by_year = Counter()
by_symbol = Counter(); by_author = Counter()
lags = []  # firstSeen - ts (ms) for kept
neutral = 0

with open(IDEAS) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        tot += 1
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("direction") == "NEUTRAL":
            neutral += 1
        if r.get("isScript"):
            drop_script += 1; continue
        if r.get("direction") not in ("LONG","SHORT"):
            drop_dir += 1; continue
        ts = r.get("ts")
        if ts is None or ts < FROM_TS:
            drop_old += 1; continue
        sym = to_binance_symbol(r.get("symbol"))
        if sym is None:
            drop_sym_parse += 1; continue
        if sym not in valid:
            drop_sym_notlisted += 1; continue
        kept += 1
        by_dir[r["direction"]] += 1
        by_pro["pro" if r.get("authorIsPro") else "non-pro"] += 1
        year = 1970 + (ts // (365.25*86400*1000))  # rough; refine below
        import datetime as _dt
        y = _dt.datetime.utcfromtimestamp(ts/1000).year
        by_year[y] += 1
        by_symbol[sym] += 1
        by_author[r.get("author","?")] += 1
        fs = r.get("firstSeen")
        if isinstance(fs,(int,float)) and fs >= ts:
            lags.append(fs - ts)

def pct(n): return f"{100*n/tot:.1f}%"
print(f"TOTAL ideas: {tot}")
print(f"  NEUTRAL (info-only): {neutral} ({pct(neutral)})")
print(f"DROP isScript:        {drop_script} ({pct(drop_script)})")
print(f"DROP dir!=LONG/SHORT: {drop_dir} ({pct(drop_dir)})")
print(f"DROP ts<2022-01-01:   {drop_old} ({pct(drop_old)})")
print(f"DROP symbol unparseable/FIAT: {drop_sym_parse} ({pct(drop_sym_parse)})")
print(f"DROP symbol not Binance-listed: {drop_sym_notlisted} ({pct(drop_sym_notlisted)})")
print(f"KEPT (analyzable universe): {kept} ({pct(kept)})")
print()
print("by direction:", dict(by_dir))
print("by authorIsPro:", dict(by_pro))
print("by year:", dict(sorted(by_year.items())))
print(f"distinct symbols: {len(by_symbol)}, distinct authors: {len(by_author)}")
print("top 15 symbols:", by_symbol.most_common(15))
print("authors with >=10 kept ideas:", sum(1 for a,n in by_author.items() if n>=10))
print("authors with >=30 kept ideas:", sum(1 for a,n in by_author.items() if n>=30))
print("top 15 authors:", by_author.most_common(15))
if lags:
    lags.sort()
    import statistics as st
    q = lambda p: lags[int(p*(len(lags)-1))]/60000  # minutes
    print(f"firstSeen-ts lag (min): n={len(lags)} p50={q(.5):.1f} p90={q(.9):.1f} p99={q(.99):.1f} max={lags[-1]/60000:.0f}")
