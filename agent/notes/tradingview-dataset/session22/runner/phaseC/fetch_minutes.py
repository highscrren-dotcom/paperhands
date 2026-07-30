#!/usr/bin/env python3
"""Докачка НЕДОСТАЮЩИХ МИНУТОК по адресному списку check_minutes.py.

Зачем отдельный скрипт вместо fetch_tail.py: тот считает посуточно — сутки числятся
«есть», если существует хотя бы одна минутка. У Петра дыры бывают ВНУТРИ суток
(DECISIONS №129), и посуточный докачиватель их не закроет. Здесь качаем ровно по списку
`missing_minutes.json`, который check_minutes.py считает поминутно.

Пишем в формате движка, прямо в объединённый склад:
  <склад>/dump/data/candle/ccxt_cached/<SYMBOL>/1m/<ts_ms>.json
  {"timestamp":…,"open":…,"high":…,"low":…,"close":…,"volume":…}

Идемпотентность: существующие файлы не перезаписываются, прогресс по символам пишется
в fetch_progress.json — обрыв не стоит пересчёта.

Только stdlib: numpy/requests на CT105 нет.
"""
import json, os, sys, time, urllib.request, urllib.error, datetime

UNION = "/data/backtests/_agent/phaseC/union"
MISSING = "/data/backtests/_agent/phaseC/missing_minutes.json"
PROGRESS = "/data/backtests/_agent/phaseC/fetch_progress.json"
UNAVAIL = "/data/backtests/_agent/phaseC/unavailable_minutes.json"
MIN_MS = 60_000
API = "https://api.binance.com/api/v3/klines"
ONLY = sys.argv[1] if len(sys.argv) > 1 else None

missing = json.load(open(MISSING))
progress = json.load(open(PROGRESS)) if os.path.exists(PROGRESS) else {}
unavail = json.load(open(UNAVAIL)) if os.path.exists(UNAVAIL) else {}


def fetch(symbol, start_ms, limit=1000):
    """Возвращает список свечей, [] если биржа не отдаёт этот участок, None если не смогли."""
    url = f"{API}?symbol={symbol}&interval=1m&startTime={start_ms}&limit={limit}"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 418):
                wait = 10 * (attempt + 1)
                print(f"    рейт-лимит {e.code}, жду {wait} с", flush=True)
                time.sleep(wait)
                continue
            if e.code == 400:
                return []          # символа не было на бирже в это время
            print(f"    HTTP {e.code}, повтор", flush=True)
            time.sleep(3 * (attempt + 1))
        except Exception as ex:
            print(f"    сеть: {ex}, повтор", flush=True)
            time.sleep(3 * (attempt + 1))
    return None


def runs(mins):
    """Список подряд идущих минуток -> [(начало, конец_включительно), …]."""
    out = []
    s = p = mins[0]
    for t in mins[1:]:
        if t == p + MIN_MS:
            p = t
            continue
        out.append((s, p))
        s = p = t
    out.append((s, p))
    return out


def ymd(ms):
    return datetime.datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M")


total_written = total_req = total_gap = 0
for symbol in sorted(missing):
    if ONLY and symbol != ONLY:
        continue
    if progress.get(symbol) == "done":
        print(f"{symbol}: уже закрыт (fetch_progress.json)", flush=True)
        continue
    d = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
    if not os.path.isdir(d):
        print(f"{symbol}: склада нет, пропускаю", flush=True)
        continue
    mins = sorted(missing[symbol])
    rs = runs(mins)
    print(f"{symbol}: {len(mins):,} минуток в {len(rs)} интервалах "
          f"({ymd(mins[0])} … {ymd(mins[-1])})", flush=True)

    want = set(mins)
    written = req = 0
    t_start = time.time()
    for a, b in rs:
        t = a
        while t <= b:
            rows = fetch(symbol, t, 1000)
            req += 1
            if rows is None:
                print(f"  {symbol} {ymd(t)}: сеть не даёт, пропускаю интервал", flush=True)
                break
            if not rows:
                # биржа не отдаёт этот участок (символа ещё не было) — дальше по интервалу пусто
                break
            last = t
            for k in rows:
                ts = int(k[0])
                last = max(last, ts)
                if ts > b or ts not in want:
                    continue
                p = f"{d}/{ts}.json"
                if os.path.exists(p):
                    continue
                with open(p, "w") as fh:
                    json.dump({"timestamp": ts, "open": float(k[1]), "high": float(k[2]),
                               "low": float(k[3]), "close": float(k[4]),
                               "volume": float(k[5])}, fh, separators=(",", ":"))
                written += 1
            if last <= t:
                break
            t = last + MIN_MS
            time.sleep(0.12)          # ~8 запросов/с, вес klines=2, лимит 6000/мин

    still = [x for x in mins if not os.path.exists(f"{d}/{x}.json")]
    if still:
        unavail[symbol] = still
    else:
        unavail.pop(symbol, None)
    progress[symbol] = "done"
    json.dump(progress, open(PROGRESS, "w"))
    json.dump(unavail, open(UNAVAIL, "w"))
    total_written += written
    total_req += req
    total_gap += len(still)
    print(f"{symbol}: записано {written:,} минуток за {req} запросов "
          f"({time.time() - t_start:.0f} с), биржа не отдала {len(still):,}", flush=True)

print(f"\nИТОГО: запросов {total_req:,}, записано минуток {total_written:,}, "
      f"осталось недоступных {total_gap:,}")
print(f"Недоступное (нет на бирже) записано в {UNAVAIL}")
