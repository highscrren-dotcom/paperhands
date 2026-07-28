#!/usr/bin/env python3
"""Докачка хвоста свечей под горизонт 27 суток — прямо в объединённый склад.

Движок докачанное в кэш НЕ пишет (проверено: после 159 докачек фазы A не изменился ни
один файл, а фаза A2 перекачала те же 29 чанков). Поэтому заполняем сами, в его формате:
  <склад>/dump/data/candle/ccxt_cached/<SYMBOL>/1m/<ts_ms>.json
  {"timestamp":…,"open":…,"high":…,"low":…,"close":…,"volume":…}

Только stdlib: numpy/requests на CT105 нет.
"""
import json, os, sys, time, urllib.request, urllib.error, datetime
from collections import defaultdict

ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
HOLD_MIN = 27 * 1440
MIN_MS = 60_000
DAY_MS = 86_400_000
API = "https://api.binance.com/api/v3/klines"
ONLY = sys.argv[1] if len(sys.argv) > 1 else None

tasks = defaultdict(list)
for line in open("/data/backtests/_agent/phaseA/tasks.tsv"):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0:
        tasks[s].append(m)

now_day = int(time.time() * 1000) // DAY_MS


def fetch(symbol, start_ms, limit=1000):
    url = f"{API}?symbol={symbol}&interval=1m&startTime={start_ms}&limit={limit}"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code == 418:
                wait = 10 * (attempt + 1)
                print(f"    рейт-лимит {e.code}, жду {wait} с", flush=True)
                time.sleep(wait)
                continue
            if e.code == 400:
                return []          # символа не было на бирже в это время
            raise
        except Exception as ex:
            print(f"    сеть: {ex}, повтор", flush=True)
            time.sleep(3 * (attempt + 1))
    return None


total_written = total_req = 0
for symbol in sorted(tasks):
    if ONLY and symbol != ONLY:
        continue
    d = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
    if not os.path.isdir(d):
        print(f"{symbol}: склада нет, пропускаю")
        continue
    have = set()
    with os.scandir(d) as it:
        for e in it:
            have.add(int(e.name[:-5]) // DAY_MS)

    need = set()
    for m in tasks[symbol]:
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        try:
            fh = open(f)
        except FileNotFoundError:
            continue
        lo = hi = None
        for line in fh:
            if f'"symbol":"{symbol}"' not in line or '"direction":"NEUTRAL"' in line:
                continue
            ts = json.loads(line)["ts"]
            lo = ts if lo is None else min(lo, ts)
            hi = ts if hi is None else max(hi, ts)
        if lo is None:
            continue
        need |= set(range(lo // DAY_MS, (hi + HOLD_MIN * MIN_MS) // DAY_MS + 1))

    miss = sorted(x for x in (need - have) if x < now_day)
    if not miss:
        print(f"{symbol}: докачивать нечего")
        continue
    print(f"{symbol}: не хватает {len(miss)} суток, качаю", flush=True)

    written = 0
    for day in miss:
        t = day * DAY_MS
        end = t + DAY_MS
        while t < end:
            rows = fetch(symbol, t)
            total_req += 1
            if rows is None:
                print(f"  {symbol} {datetime.datetime.utcfromtimestamp(t/1000):%Y-%m-%d}: не смог, пропускаю день")
                break
            if not rows:
                break
            for k in rows:
                ts = int(k[0])
                if ts >= end:
                    break
                p = f"{d}/{ts}.json"
                if os.path.exists(p):
                    continue
                with open(p, "w") as fh:
                    json.dump({"timestamp": ts, "open": float(k[1]), "high": float(k[2]),
                               "low": float(k[3]), "close": float(k[4]), "volume": float(k[5])}, fh,
                              separators=(",", ":"))
                written += 1
            t = int(rows[-1][0]) + MIN_MS
            time.sleep(0.12)          # ~8 запросов/с, вес klines=2, лимит 6000/мин
    total_written += written
    print(f"{symbol}: записано {written} минуток", flush=True)

print(f"\nИТОГО: запросов {total_req}, записано минуток {total_written}")
