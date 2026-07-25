#!/usr/bin/env python3
# Живой свечной стор: продление 1m-кромки с Binance (решение владельца 25.07,
# №129 — инфраструктура вахты CobraVanguard). Раз в день кроном на cfy.
#
# Стор: /opt/quant/data/candles/<SYMBOL>-<YEAR>.jsonl — ФОРМАТ ДАТАСЕТА Петра
# ({"s","t","o","h","l","c","v"}, t=открытие минуты, ms UTC), годовые файлы,
# год-ролловер автоматический. Засев — копии 2026-файлов датасета (кромка
# 19.07.2026 12:11Z), дальше только append строго после последней t.
# Идемпотентно: упал/пропустил день — следующий запуск дорешает от кромки.
# Текущая (незакрытая) минута не пишется. Только stdlib, без зависимостей.
import fcntl
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

STORE = Path("/opt/quant/data/candles")
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"]  # + тикер = дописать сюда
API = "https://api.binance.com/api/v3/klines"
MIN = 60_000
LOCK = Path("/tmp/candles-update.lock")


def log(msg):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {msg}", flush=True)


def last_t(symbol):
    """Последняя t по годовым файлам стора (свежайший год, последняя строка)."""
    files = sorted(STORE.glob(f"{symbol}-*.jsonl"))
    if not files:
        raise SystemExit(f"стор не засеян для {symbol}: нет {STORE}/{symbol}-*.jsonl")
    with open(files[-1], "rb") as f:
        f.seek(max(f.seek(0, 2) - 4096, 0))
        line = f.read().splitlines()[-1]
    return json.loads(line)["t"]


def fetch(symbol, start_ms, end_ms):
    url = f"{API}?symbol={symbol}&interval=1m&startTime={start_ms}&endTime={end_ms}&limit=1000"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # сеть/5xx — ретрай с паузой, потом громко
            if attempt == 2:
                raise
            log(f"[{symbol}] retry {attempt + 1}: {e}")
            time.sleep(5)


def update(symbol):
    edge = last_t(symbol)
    # только закрытые минуты: строго до начала текущей
    cutoff = (int(time.time() * 1000) // MIN) * MIN
    start = edge + MIN
    appended = 0
    while start < cutoff:
        rows = fetch(symbol, start, cutoff - 1)
        if not rows:
            break
        by_year = {}
        for k in rows:
            t = int(k[0])
            if t < start or t >= cutoff:
                continue
            year = datetime.fromtimestamp(t / 1000, timezone.utc).year
            c = {"s": symbol, "t": t, "o": float(k[1]), "h": float(k[2]),
                 "l": float(k[3]), "c": float(k[4]), "v": float(k[5])}
            by_year.setdefault(year, []).append(c)
        for year, cs in sorted(by_year.items()):
            with open(STORE / f"{symbol}-{year}.jsonl", "a") as f:
                for c in cs:
                    f.write(json.dumps(c, separators=(",", ":")) + "\n")
            appended += len(cs)
        start = int(rows[-1][0]) + MIN
        time.sleep(0.3)  # вежливость к rate-limit (вес 2/запрос, лимит 6к/мин)
    gap_h = (cutoff - MIN - last_t(symbol)) / 3600_000
    log(f"[{symbol}] +{appended} свечей, кромка {datetime.fromtimestamp(last_t(symbol) / 1000, timezone.utc).isoformat(timespec='minutes')}"
        + (f" ⚠️ отстаёт на {gap_h:.1f}ч" if gap_h > 1 else ""))
    return appended


def main():
    STORE.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("уже идёт другой запуск — выход")
            return 0
        total = 0
        failed = []
        for s in SYMBOLS:
            try:
                total += update(s)
            except Exception as e:
                failed.append(s)
                log(f"[{s}] FAIL: {e}")
        log(f"done: +{total} свечей, символов {len(SYMBOLS) - len(failed)}/{len(SYMBOLS)}"
            + (f", FAILED: {','.join(failed)}" if failed else ""))
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
