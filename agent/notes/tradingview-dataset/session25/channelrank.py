#!/usr/bin/env python3
"""Поиск ЛУЧШЕГО источника сигналов среди всех каналов нашего TG-сбора
(запрос владельца 03.08). Йода провалил гейт этапа 0 — ищем, есть ли в 60
каналах кто-то, кто его проходит.

Модель (одинаковая для всех каналов, никакой подгонки под формат):
  - сигнал = пост, где есть тикер из списка ликвидных пар И слово направления;
  - вход по открытию следующей 15m свечи после поста (рынок, без лимитов);
  - холд HOLD_H часов, выход по закрытию; издержки 0.4% на круг;
  - спот-эквивалент без плеча (риг Петра спотовый).

ОБЯЗАТЕЛЬНЫЙ КОНТРОЛЬ (урок №143): для каждого канала — те же сделки со
случайным общим сдвигом дат ±1..14 суток, NDRAW розыгрышей. Канал считается
интересным, только если бьёт свой же сдвиг. Мультисравнения: каналов много,
при p<=0.05 ждём ~5% ложных — цифра печатается явно.

usage: channelrank.py [hold_hours] [min_signals] [ndraw]
"""
import json, glob, os, re, sys, time, urllib.request, urllib.error
from collections import defaultdict, Counter

HOLD_H = int(sys.argv[1]) if len(sys.argv) > 1 else 24
MIN_SIG = int(sys.argv[2]) if len(sys.argv) > 2 else 8
NDRAW = int(sys.argv[3]) if len(sys.argv) > 3 else 100
STORES = "/data/backtests/_agent/feed/tg/stores"
CACHE = "/data/backtests/_agent/yoda/candles15"
FEE = 0.4
TF_MS = 15 * 60_000
SHIFT_D = 14
os.makedirs(CACHE, exist_ok=True)

COINS = ("BTC ETH SOL XRP DOGE BNB ADA AVAX LINK TON TRX NEAR PENGU PUMP ZEC POL "
         "HBAR FARTCOIN TAO WLD SUI APT ARB OP INJ TIA SEI JUP ONDO ENA AAVE LTC "
         "DOT ATOM FIL ETC XLM UNI RENDER KAS PEPE SHIB BONK WIF FLOKI").split()
COIN_RE = re.compile(r"[#$]?\b(" + "|".join(COINS) + r")(?:/?USDT|USD|\b)", re.I)
LONG_RE = re.compile(r"\b(лонг|long|buy|покупа|покупк|лонгу|bullish|в лонг|уровень покупк)\w*", re.I)
SHORT_RE = re.compile(r"\b(шорт|short|sell|продаж|продав|шортим|bearish|в шорт)\w*", re.I)


def fetch(symbol, start_ms, end_ms):
    key = f"{CACHE}/{symbol}.json"
    if os.path.exists(key):
        with open(key) as fh:
            d = json.load(fh)
        if d and d[0][0] <= start_ms and d[-1][0] >= end_ms - TF_MS * 4:
            return d
    out, cur = [], start_ms
    while cur < end_ms:
        url = (f"https://api.binance.com/api/v3/klines?symbol={symbol}"
               f"&interval=15m&startTime={cur}&limit=1000")
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                batch = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 400:
                return None
            raise
        except Exception:
            return None
        if not batch:
            break
        out.extend([[c[0], float(c[1]), float(c[2]), float(c[3]), float(c[4])] for c in batch])
        cur = batch[-1][0] + TF_MS
        if len(batch) < 1000:
            break
        time.sleep(0.1)
    if out:
        with open(key, "w") as fh:
            json.dump(out, fh)
    return out


# ---------------------------------------------------------------- сбор сигналов
sigs = defaultdict(list)          # channel -> [(ts, coin, dir)]
for f in sorted(glob.glob(f"{STORES}/*.jsonl")):
    ch = os.path.basename(f)[:-6]
    for line in open(f):
        r = json.loads(line)
        t = r.get("text") or ""
        if len(t) < 15:
            continue
        m = COIN_RE.search(t)
        if not m:
            continue
        head = t[:400]
        is_l, is_s = bool(LONG_RE.search(head)), bool(SHORT_RE.search(head))
        if is_l == is_s:              # нет направления или оба сразу — не сигнал
            continue
        sigs[ch].append((r["ts"], m.group(1).upper(), 1 if is_l else -1))

tmin = min((s[0] for v in sigs.values() for s in v), default=0)
tmax = max((s[0] for v in sigs.values() for s in v), default=0)
need = sorted({s[1] for v in sigs.values() for s in v})
print(f"каналов с сигналами: {len(sigs)} | всего сигналов: {sum(len(v) for v in sigs.values())}")
print(f"окно: {time.strftime('%d.%m', time.gmtime(tmin/1000))} .. "
      f"{time.strftime('%d.%m.%Y', time.gmtime(tmax/1000))} | монет: {len(need)}")
print(f"модель: вход по рынку, холд {HOLD_H} ч, издержки {FEE}%, спот-эквивалент\n")

candles = {}
for coin in need:
    sym = f"{coin}USDT"
    kl = fetch(sym, tmin - SHIFT_D * 86400000, tmax + (HOLD_H + 24) * 3600000)
    if kl:
        candles[sym] = kl
print(f"свечи загружены по {len(candles)} парам\n")


def pnl_at(sym, ts, d):
    kl = candles.get(sym)
    if not kl:
        return None
    lo, hi = 0, len(kl) - 1
    while lo < hi:                       # первая свеча строго после поста
        mid = (lo + hi) // 2
        if kl[mid][0] <= ts:
            lo = mid + 1
        else:
            hi = mid
    i = lo
    j = i + HOLD_H * 4                   # 4 свечи по 15m в часе
    if i >= len(kl) or j >= len(kl):
        return None
    entry, exit_ = kl[i][1], kl[j][4]
    return d * (exit_ - entry) / entry * 100 - FEE


def rnd(x):
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


rows = []
for ch, items in sigs.items():
    real = [(p, d) for ts, c, d in items
            for p in [pnl_at(f"{c}USDT", ts, d)] if p is not None]
    if len(real) < MIN_SIG:
        continue
    pn = [p for p, _ in real]
    mean = sum(pn) / len(pn)
    null = []
    for s in range(NDRAW):
        h = rnd(s * 2654435761 + sum(map(ord, ch)))
        off = ((1 + h % SHIFT_D) * (1 if (h >> 8) & 1 else -1)) * 86400000
        vals = [p for ts, c, d in items
                for p in [pnl_at(f"{c}USDT", ts + off, d)] if p is not None]
        if vals:
            null.append(sum(vals) / len(vals))
    null.sort()
    p_shift = (sum(1 for v in null if v >= mean) + 1) / (len(null) + 1) if null else 1.0
    longs = sum(1 for _, d in real if d > 0)
    rows.append((ch, len(pn), mean, sum(pn), 100 * sum(1 for x in pn if x > 0) / len(pn),
                 p_shift, null[len(null) // 2] if null else 0, 100 * longs / len(real)))

rows.sort(key=lambda r: -r[2])
print(f"каналов с >= {MIN_SIG} сигналами: {len(rows)}; "
      f"при p<=0.05 ложных ожидаем ~{max(1, round(len(rows) * 0.05))}\n")
print(f"{'канал':<28}{'сигн':>5}{'на сделку':>11}{'сумма':>9}{'винрейт':>9}"
      f"{'p сдвига':>10}{'медиана нуля':>13}{'%лонгов':>9}")
print("-" * 94)
for ch, n, mean, tot, wr, p, med, pl in rows:
    mark = " ★" if p <= 0.05 and mean > 0 else ""
    print(f"{ch[:26]:<28}{n:>5}{mean:>+11.3f}{tot:>+9.1f}{wr:>8.0f}%{p:>10.3f}"
          f"{med:>+13.3f}{pl:>8.0f}%{mark}")

good = [r for r in rows if r[5] <= 0.05 and r[2] > 0]
print(f"\nбьют собственный сдвиг дат (p<=0.05) и в плюсе: {len(good)}")
for ch, n, mean, tot, wr, p, med, pl in good:
    print(f"  {ch}: {mean:+.3f}%/сделку на {n} сигналах, p={p:.3f}")
