#!/usr/bin/env python3
"""Запрос автора (30.07 12:05): полный список доверенных авторов по критерию ранности.

Печатает:
  1. ПОЛНУЮ таблицу всех авторов с >= 20 торгуемых идей за всю историю, сортировка по
     доле ранних (та же метрика, что в whoisearly, но без обрезки топ-12/хвост-6).
  2. Список «доверенных на следующий месяц»: рейтинг по ранности за скользящее окно
     последних 60 месяцев (спека автора), допуски 10 и 20 идей.

Модель та же: наивная фазы C, холд 14 сут, издержки 0.4 %, пол стопа, дедуп 8 ч.
«Рано» = не больше 2 чужих постов по символу за 24 ч до публикации.

usage: fullearly.py [порог_ранности] [окно_часов] [окно_обучения_мес]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

EARLY_MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 2
WIN_H = int(sys.argv[2]) if len(sys.argv) > 2 else 24
TRAIN_M = int(sys.argv[3]) if len(sys.argv) > 3 else 60
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
FEE, SLIP = 0.1, 0.1
FLOOR_L, FLOOR_S = -99.2, -99.399
HOLD = 14 * 1440
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

recs = []          # (month, author, early?, pnl, pro)
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
        c0 = st.candle(e0)
        ce = st.candle(e0 + (HOLD - 1) * MIN_MS)
        if not c0 or not ce:
            continue
        sd = 1 if d["direction"] == "LONG" else -1
        ef = c0[0] * (1 + sd * SLIP / 100)
        xf = ce[1] * (1 - sd * SLIP / 100)
        pnl = max(sd * ((xf - ef) / ef) * 100 - 2 * FEE, FLOOR_L if sd > 0 else FLOOR_S)
        lo = bisect.bisect_left(ts_arr, d["ts"] - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, d["ts"])
        n_other = sum(1 for i in range(lo, hi) if tape[i][1] != d["author"])
        recs.append((d["_m"], d["author"], n_other <= EARLY_MAX, pnl,
                     bool(d.get("authorIsPro"))))
    print(f"  {symbol}: {len(recs)} идей, {time.time() - t0:.0f} с", flush=True)

print(f"\nвсего идей {len(recs):,}; «рано» = <= {EARLY_MAX} чужих за {WIN_H} ч")

# ---------------- 1. полная таблица за всю историю
au = defaultdict(lambda: [0, 0, 0.0, 0.0, 0, 0.0])   # ранних, поздних, pnlР, pnlП, pro, pnlВсего
for m, a, early, pnl, pro in recs:
    q = au[a]
    if early:
        q[0] += 1; q[2] += pnl
    else:
        q[1] += 1; q[3] += pnl
    q[4] += pro; q[5] += pnl
rows = [(a, v) for a, v in au.items() if v[0] + v[1] >= 20]
rows.sort(key=lambda r: -(r[1][0] / (r[1][0] + r[1][1])))
print(f"\nПОЛНЫЙ СПИСОК: {len(rows)} авторов с >= 20 идеями, сортировка по доле ранних")
print(f"{'#':>3} {'автор':<26}{'идей':>6}{'ранних':>8}{'доля':>7}{'PnL ранних':>12}"
      f"{'PnL поздних':>13}{'PnL всего':>11}{'Pro':>5}")
for i, (a, v) in enumerate(rows, 1):
    n = v[0] + v[1]
    pe = v[2] / v[0] if v[0] else 0.0
    pl = v[3] / v[1] if v[1] else 0.0
    pt = v[5] / n
    print(f"{i:>3} {a[:24]:<26}{n:>6}{v[0]:>8}{100 * v[0] / n:>6.0f}%"
          f"{pe:>+12.3f}{pl:>+13.3f}{pt:>+11.3f}{100 * v[4] / n:>4.0f}%")

# ---------------- 2. доверенные на следующий месяц (скользящее окно TRAIN_M мес)
bym = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
for m, a, early, pnl, pro in recs:
    q = bym[m][a]
    q[0] += early; q[1] += 1; q[2] += pnl
allm = sorted(bym, key=mkey)
train = allm[-TRAIN_M:]
print(f"\nДОВЕРЕННЫЕ НА СЛЕДУЮЩИЙ МЕСЯЦ: рейтинг по ранности за последние "
      f"{len(train)} мес ({train[0]}..{train[-1]})")
sc = defaultdict(lambda: [0, 0, 0.0])
for m in train:
    for a, v in bym[m].items():
        sc[a][0] += v[0]; sc[a][1] += v[1]; sc[a][2] += v[2]
for MIN_I in (10, 20):
    elig = [(a, v) for a, v in sc.items() if v[1] >= MIN_I]
    elig.sort(key=lambda kv: -(kv[1][0] / kv[1][1]))
    print(f"\n  допуск >= {MIN_I} идей в окне: {len(elig)} авторов, топ-15:")
    print(f"  {'#':>3} {'автор':<26}{'идей':>6}{'доля ранних':>13}{'PnL/сд в окне':>15}")
    for i, (a, v) in enumerate(elig[:15], 1):
        print(f"  {i:>3} {a[:24]:<26}{v[1]:>6}{100 * v[0] / v[1]:>12.0f}%"
              f"{v[2] / v[1]:>+15.3f}")
print(f"\nготово за {time.time() - t0:.0f} с")
