#!/usr/bin/env python3
"""Июльский OOS-фид BTCUSDT для simulator (формат Петра ts-ideas.normalized.jsonl).

Порт фильтров = tv_universe.py (аудит A−): drop isScript, direction LONG/SHORT
(NEUTRAL оставляем? — у Петра в фиде NEUTRAL есть, симулятор сам дропает; здесь
оставляем только BTCUSDT-маппинг, NEUTRAL сохраняем для честности формата),
symbol → toBinanceSymbol == BTCUSDT. Окно публикации: [2026-07-01, 2026-07-15) UTC.
"""
import json, re

DATA = "/home/s1dd1/dev/quant/tradingview-ideas-signals/data"
OUT = "/tmp/claude-1000/-home-s1dd1-dev-quant/eebd657c-cde4-4ae4-b792-9b49c903179e/scratchpad/ts-ideas.july.jsonl"
FIAT_BASES = {"EUR","GBP","AUD","NZD","JPY","CHF","CAD","TRY","XAU","XAG","XTI","XPT"}
TICKER_RENAMES = {"TON":"GRAM","MATIC":"POL","FTM":"S"}
_RE = re.compile(r'^([A-Z0-9]{2,15}?)(USDT|USDC|USD)$')

T0 = 1782864000000  # 2026-07-01T00:00:00Z
T1 = 1784073600000  # 2026-07-15T00:00:00Z

def to_binance_symbol(short):
    s = re.sub(r'\.P[S]?$', '', str(short or "").upper())
    m = _RE.match(s)
    if not m or m.group(1) in FIAT_BASES:
        return None
    return TICKER_RENAMES.get(m.group(1), m.group(1)) + "USDT"

seen = set()
rows = []
with open(f"{DATA}/tv-ideas.jsonl") as f:
    for line in f:
        r = json.loads(line)
        if r.get("isScript"):
            continue
        if not (T0 <= r["ts"] < T1):
            continue
        if to_binance_symbol(r.get("symbol")) != "BTCUSDT":
            continue
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        rows.append({
            "id": r["id"], "ts": r["ts"], "symbol": "BTCUSDT",
            "fullName": r.get("fullName"), "direction": r.get("direction"),
            "author": r.get("author"), "authorIsPro": bool(r.get("authorIsPro")),
            "isScript": False, "title": r.get("title"), "url": r.get("url"),
            "firstSeen": r.get("firstSeen"),
        })
rows.sort(key=lambda x: x["ts"])
with open(OUT, "w") as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
from collections import Counter
dirs = Counter(r["direction"] for r in rows)
authors = len({r["author"] for r in rows})
import datetime
print(f"july feed: {len(rows)} ideas, dirs={dict(dirs)}, authors={authors}")
if rows:
    print("span:", datetime.datetime.utcfromtimestamp(rows[0]["ts"]/1000), "..",
          datetime.datetime.utcfromtimestamp(rows[-1]["ts"]/1000))
