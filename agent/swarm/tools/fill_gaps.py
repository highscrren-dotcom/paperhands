#!/usr/bin/env python3
# Латальщик внутренних дыр живого свечного стора (№129): датасет Петра
# унаследовал пропущенные СУТКИ краула (SOL-2025 — 22 дня, DOGE — 2+16, ETH — 1);
# candles_update.py продлевает только кромку — этот скрипт одноразово (и по
# надобности) заполняет разрывы историческими минутками Binance. Ряд символа
# собирается из ВСЕХ годовых файлов разом (дыры на стыке годов тоже видны,
# например DOGE 31.12.2025), запись — по годам, merge+sort+atomic rewrite.
# Идемпотентен: нет дыр — ничего не делает.
# Запуск: python3 fill_gaps.py [SYMBOL ...]   (дефолт — вся четвёрка)
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

STORE = Path("/opt/quant/data/candles")
API = "https://api.binance.com/api/v3/klines"
MIN = 60_000


def log(msg):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {msg}", flush=True)


def fetch_range(symbol, start_ms, end_ms):
    """Все 1m-свечи [start_ms, end_ms] включительно, с пагинацией."""
    out = []
    cur = start_ms
    while cur <= end_ms:
        url = f"{API}?symbol={symbol}&interval=1m&startTime={cur}&endTime={end_ms}&limit=1000"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    rows = json.loads(r.read())
                break
            except Exception as e:
                if attempt == 2:
                    raise
                log(f"[{symbol}] retry {attempt + 1}: {e}")
                time.sleep(5)
        if not rows:
            break
        out.extend(rows)
        cur = int(rows[-1][0]) + MIN
        time.sleep(0.3)
    return out


def fill_symbol(symbol):
    files = sorted(STORE.glob(f"{symbol}-*.jsonl"))
    if not files:
        log(f"[{symbol}] стор пуст — пропуск")
        return 0
    cands = {}
    for path in files:
        for line in open(path):
            c = json.loads(line)
            cands[c["t"]] = c
    ts = sorted(cands)
    gaps = [(a + MIN, b - MIN) for a, b in zip(ts, ts[1:]) if b - a > MIN]
    if not gaps:
        log(f"[{symbol}] дыр нет ({len(cands)} свечей, {len(files)} файлов)")
        return 0
    added = 0
    touched_years = set()
    for gs, ge in gaps:
        rows = fetch_range(symbol, gs, ge)
        got = 0
        for k in rows:
            t = int(k[0])
            if gs <= t <= ge and t not in cands:
                cands[t] = {"s": symbol, "t": t, "o": float(k[1]), "h": float(k[2]),
                            "l": float(k[3]), "c": float(k[4]), "v": float(k[5])}
                touched_years.add(datetime.fromtimestamp(t / 1000, timezone.utc).year)
                got += 1
        added += got
        want = (ge - gs) // MIN + 1
        note = "" if got == want else f" ⚠️ биржа отдала {got}/{want} (пауза торгов?)"
        log(f"[{symbol}] дыра {datetime.fromtimestamp(gs/1000, timezone.utc):%Y-%m-%d %H:%M}"
            f"..{datetime.fromtimestamp(ge/1000, timezone.utc):%Y-%m-%d %H:%M}: +{got}{note}")
    by_year = {}
    for t in sorted(cands):
        by_year.setdefault(datetime.fromtimestamp(t / 1000, timezone.utc).year, []).append(cands[t])
    for year in sorted(touched_years):
        path = STORE / f"{symbol}-{year}.jsonl"
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w") as f:
            for c in by_year.get(year, []):
                f.write(json.dumps(c, separators=(",", ":")) + "\n")
        os.replace(tmp, path)
        log(f"[{symbol}] переписан {path.name}: {len(by_year.get(year, []))} строк")
    log(f"[{symbol}] итого +{added}")
    return added


def main():
    symbols = sys.argv[1:] or ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"]
    total = 0
    for s in symbols:
        total += fill_symbol(s)
    log(f"done: +{total} свечей")


if __name__ == "__main__":
    main()
