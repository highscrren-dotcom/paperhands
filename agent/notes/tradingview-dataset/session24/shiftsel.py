#!/usr/bin/env python3
"""Ответ на критику ревью (30.07 16:21): «сравнение не со случайным выбором авторов,
а со случайными датами входа при том же исполнении — из текста не видно, что такой
тест делался». На сыром поле делался (permshift, фаза C). Здесь — НА ОТОБРАННЫХ
сделках топ-K по ранности: та же идея, тот же автор, то же направление, тот же холд,
но вход сдвинут общим смещением тикеро-месяца на случайные +-1..30 суток
(кучность сохраняется — урок фазы C). Если сдвинутые входы зарабатывают столько же,
отбор по ранности = бета удачных месяцев, и ветка закрывается.

Гейт объявлен ДО прогона: настоящие входы обязаны бить случайные даты (p <= 0.05
на K=2). Модель — угол «досидеть 14 сут» (как все контроли ранности), издержки
0.4 %, пол стопа.

usage: shiftsel.py [K] [окно_обучения_мес] [ndraw]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

K = int(sys.argv[1]) if len(sys.argv) > 1 else 2
TRAIN_M = int(sys.argv[2]) if len(sys.argv) > 2 else 12
NDRAW = int(sys.argv[3]) if len(sys.argv) > 3 else 100
EARLY_MAX, WIN_H, MIN_IDEAS = 2, 24, 10
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
FEE, SLIP = 0.1, 0.1
FLOOR_L, FLOOR_S = -99.2, -99.399
HOLD = 14 * 1440
SHIFT_MAX_D = 30
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


def rnd(x):
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


def shash(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


class Store:
    def __init__(self, symbol):
        self.dir = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
        ts = sorted(int(e.name[:-5]) for e in os.scandir(self.dir))
        self.lo, self.hi = ts[0], ts[-1]
        n = (self.hi - self.lo) // MIN_MS + 1
        pres = bytearray(n)
        for t in ts:
            pres[(t - self.lo) // MIN_MS] = 1
        pref = array("i", [0]) * (n + 1)
        acc = 0
        for i in range(n):
            acc += pres[i]
            pref[i + 1] = acc
        self.n, self.pref = n, pref
        self.cache = {}

    def ok(self, entry_ts, horizon):
        got = 0
        while got < horizon:
            a = (entry_ts + got * MIN_MS - self.lo) // MIN_MS
            b = a + CHUNK
            if a < 0 or b > self.n or self.pref[b] - self.pref[a] != CHUNK:
                return got
            got += CHUNK
        return horizon

    def candle(self, ts):
        c = self.cache.get(ts)
        if c is not None:
            return c
        try:
            with open(f"{self.dir}/{ts}.json") as fh:
                d = json.load(fh)
            c = (d["open"], d["close"])
        except FileNotFoundError:
            c = None
        self.cache[ts] = c
        return c


def pnl_at(st, post_ts, sd):
    e0 = (post_ts // MIN_MS) * MIN_MS + MIN_MS
    if st.ok(e0, HOLD) < HOLD:
        return None
    c0 = st.candle(e0)
    ce = st.candle(e0 + (HOLD - 1) * MIN_MS)
    if not c0 or not ce:
        return None
    ef = c0[0] * (1 + sd * SLIP / 100)
    xf = ce[1] * (1 - sd * SLIP / 100)
    return max(sd * ((xf - ef) / ef) * 100 - 2 * FEE, FLOOR_L if sd > 0 else FLOOR_S)


months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

recs = []          # (month, symbol, author, ts, early, sd)
stores = {}
t0 = time.time()
for symbol in sorted(months):
    st = Store(symbol)
    stores[symbol] = st
    tape = []
    ded = []
    for m in sorted(months[symbol]):
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        try:
            fh = open(f)
        except FileNotFoundError:
            continue
        for line in fh:
            if f'"symbol":"{symbol}"' not in line:
                continue
            d = json.loads(line)
            if d["symbol"] != symbol:
                continue
            tape.append((d["ts"], d["author"]))
            if d["direction"] != "NEUTRAL":
                d["_m"] = m
                ded.append(d)
    tape.sort()
    ts_arr = [t for t, _ in tape]
    ded.sort(key=lambda d: d["ts"])
    last = {}
    for d in ded:
        k = f'{d["author"]}:{d["direction"]}'
        if k in last and d["ts"] - last[k] < DEDUPE_MS:
            continue
        last[k] = d["ts"]
        e0 = (d["ts"] // MIN_MS) * MIN_MS + MIN_MS
        if st.ok(e0, HOLD) < HOLD:
            continue
        lo = bisect.bisect_left(ts_arr, d["ts"] - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, d["ts"])
        n_other = sum(1 for i in range(lo, hi) if tape[i][1] != d["author"])
        sd = 1 if d["direction"] == "LONG" else -1
        recs.append((d["_m"], symbol, d["author"], d["ts"], n_other <= EARLY_MAX, sd))
    print(f"  {symbol}: {len(recs)}, {time.time() - t0:.0f} с", flush=True)

# walk-forward отбор топ-K по ранности
bym = defaultdict(lambda: defaultdict(lambda: [0, 0]))
for m, s, a, ts, early, sd in recs:
    q = bym[m][a]
    q[0] += early
    q[1] += 1
allm = sorted(bym, key=mkey)
picked = set()
for idx, tm in enumerate(allm):
    if mkey(tm)[0] < 2022:
        continue
    train = allm[max(0, idx - TRAIN_M):idx]
    if len(train) < 2:
        continue
    sc = defaultdict(lambda: [0, 0])
    for m in train:
        for a, v in bym[m].items():
            sc[a][0] += v[0]
            sc[a][1] += v[1]
    elig = [a for a, v in sc.items() if v[1] >= MIN_IDEAS]
    if len(elig) < max(3 * K, 6):
        continue
    elig.sort(key=lambda a: sc[a][0] / sc[a][1], reverse=True)
    for a in elig[:K]:
        picked.add((tm, a))

# отобранные сделки, у которых влезают все сдвиги +-30 сут (кромка у всех одинаково)
sel = []
for m, s, a, ts, early, sd in recs:
    if (m, a) not in picked:
        continue
    st = stores[s]
    e_lo = ((ts - SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
    e_hi = ((ts + SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
    if st.ok(e_lo, 1) < 1 or st.ok(e_hi, HOLD) < HOLD:
        continue
    p = pnl_at(st, ts, sd)
    if p is None:
        continue
    g = time.gmtime(ts / 1000)
    sel.append((s, ts, sd, p, (g.tm_year, g.tm_mon)))

n = len(sel)
real = sum(r[3] for r in sel) / n
print(f"\nK={K}, окно {TRAIN_M} мес: отобранных сделок с полной кромкой {n}, "
      f"настоящие входы {real:+.3f} %/сделку")

groups = defaultdict(list)
for i, r in enumerate(sel):
    groups[(r[0], r[4])].append(i)
null = []
for sdr in range(NDRAW):
    tot = 0.0
    cnt = 0
    for g, idxs in groups.items():
        h = rnd(sdr * 2654435761 + shash(g[0]) ^ (g[1][0] * 100 + g[1][1]))
        mag = 1 + h % SHIFT_MAX_D
        sign = 1 if (h >> 8) & 1 else -1
        off = sign * mag * DAY_MS
        for i in idxs:
            s, ts, sd, p, ym = sel[i]
            v = pnl_at(stores[s], ts + off, sd)
            if v is not None:
                tot += v
                cnt += 1
    if cnt:
        null.append(tot / cnt)
null.sort()
p_val = (sum(1 for v in null if v >= real) + 1) / (len(null) + 1)
med = null[len(null) // 2] if null else 0.0
lo5 = null[int(len(null) * 0.05)] if null else 0.0
hi95 = null[int(len(null) * 0.95)] if null else 0.0
print(f"случайные даты (общий сдвиг тикеро-месяца +-1..30 сут, {NDRAW} розыгрышей): "
      f"медиана {med:+.3f}, 5..95 пцт {lo5:+.3f}..{hi95:+.3f}")
print(f"p = {p_val:.3f}  (доля розыгрышей, где случайные даты не хуже настоящих)")
print("\nгейт: p <= 0.05 -> время постов несёт информацию сверх беты месяцев; "
      "иначе отбор по ранности = бета, ветку закрывать")
print(f"готово за {time.time() - t0:.0f} с")
