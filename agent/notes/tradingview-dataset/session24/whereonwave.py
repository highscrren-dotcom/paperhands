#!/usr/bin/env python3
"""Вопрос автора (30.07 13:07): ранние авторы «стабильно идут на момент начала
ускорения» или случайно попали в хвост распределения?

Здесь меряется ПОЛОЖЕНИЕ поста на кривой движения: сколько монета уже прошла В
СТОРОНУ идеи до публикации (back) и сколько прошла после (fwd). Всё в % и в
направлении идеи (sd * ход): back >> 0 = автор постит после разгона (гонится за
толпой), back ~ 0 при fwd > 0 = пост стоит в начале движения.

Группы:
  1. сделки walk-forward топ-2 по ранности, окно 60 мес (ровно те, что в отборе);
  2. ранние идеи поля (<=2 чужих за 24 ч);
  3. поздние идеи поля;
плюс таблица по авторам текущего топа ранности (их ранние идеи).

Окна: back за 3 и 14 суток до входа, fwd = 14 суток холда (как в рецепте).
Без издержек: это замер положения на волне, а не доходности стратегии.

usage: whereonwave.py [окно_обучения_мес]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

TRAIN_M = int(sys.argv[1]) if len(sys.argv) > 1 else 60
EARLY_MAX, WIN_H, K, MIN_IDEAS = 2, 24, 2, 10
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
HOLD = 14 * 1440
BACK3 = 3 * 1440
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


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
        try:
            with open(f"{self.dir}/{ts}.json") as fh:
                c = json.load(fh)
            return c["open"], c["close"]
        except FileNotFoundError:
            return None


months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

# recs: (month, author, early, sd, back3, back14, fwd14)
recs = []
t0 = time.time()
for symbol in sorted(months):
    st = Store(symbol)
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
        c_e = st.candle(e0)
        c_x = st.candle(e0 + (HOLD - 1) * MIN_MS)
        c_b3 = st.candle(e0 - BACK3 * MIN_MS)
        c_b14 = st.candle(e0 - HOLD * MIN_MS)
        if not c_e or not c_x:
            continue
        sd = 1 if d["direction"] == "LONG" else -1
        fwd = sd * (c_x[1] - c_e[0]) / c_e[0] * 100
        b3 = sd * (c_e[0] - c_b3[0]) / c_b3[0] * 100 if c_b3 else None
        b14 = sd * (c_e[0] - c_b14[0]) / c_b14[0] * 100 if c_b14 else None
        lo = bisect.bisect_left(ts_arr, d["ts"] - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, d["ts"])
        n_other = sum(1 for i in range(lo, hi) if tape[i][1] != d["author"])
        recs.append((d["_m"], d["author"], n_other <= EARLY_MAX, sd, b3, b14, fwd))
    print(f"  {symbol}: {len(recs)}, {time.time() - t0:.0f} с", flush=True)

print(f"\nидей {len(recs):,}; back/fwd в % И В НАПРАВЛЕНИИ идеи; окно {TRAIN_M} мес")

# walk-forward топ-K по ранности (как в permearly)
bym = defaultdict(lambda: defaultdict(lambda: [0, 0]))
for m, a, early, sd, b3, b14, fwd in recs:
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


def med(xs):
    xs = sorted(x for x in xs if x is not None)
    return xs[len(xs) // 2] if xs else float("nan")


def report(label, rows):
    if not rows:
        return
    n = len(rows)
    b3 = med([r[4] for r in rows])
    b14 = med([r[5] for r in rows])
    fw = med([r[6] for r in rows])
    fw_mean = sum(r[6] for r in rows) / n
    print(f"{label:<38}{n:>7}{b3:>+9.2f}{b14:>+9.2f}{fw:>+9.2f}{fw_mean:>+9.2f}")


sel = [r for r in recs if (r[0], r[1]) in picked]
sel_early = [r for r in sel if r[2]]
fld_early = [r for r in recs if r[2]]
fld_late = [r for r in recs if not r[2]]

print(f"\n{'группа':<38}{'идей':>7}{'back3м':>9}{'back14м':>9}{'fwd14м':>9}{'fwd ср':>9}")
print("-" * 81)
report(f"отбор топ-{K} по ранности (окно {TRAIN_M}м)", sel)
report("  из них ранние идеи", sel_early)
report("раннее поле (<=2 чужих)", fld_early)
report("позднее поле (>2 чужих)", fld_late)
report("всё поле", recs)

# по авторам текущего топа ранности — их ранние идеи за всю историю
sc = defaultdict(lambda: [0, 0])
for m in allm[-TRAIN_M:]:
    for a, v in bym[m].items():
        sc[a][0] += v[0]
        sc[a][1] += v[1]
top_now = sorted((a for a, v in sc.items() if v[1] >= 20),
                 key=lambda a: sc[a][0] / sc[a][1], reverse=True)[:10]
print(f"\nтоп-10 текущего окна, ИХ РАННИЕ идеи за всю историю:")
print(f"{'автор':<38}{'идей':>7}{'back3м':>9}{'back14м':>9}{'fwd14м':>9}{'fwd ср':>9}")
print("-" * 81)
byau = defaultdict(list)
for r in recs:
    if r[2]:
        byau[r[1]].append(r)
for a in top_now:
    report(a, byau.get(a, []))
print(f"\nготово за {time.time() - t0:.0f} с")
