#!/usr/bin/env python3
"""Этап 4а фазы D: совстречаемость аккаунтов — кто СИСТЕМАТИЧЕСКИ стоит в окне 24 ч
ПЕРЕД постами авторов. Если один и тот же набор аккаунтов регулярно предшествует
постам конкретного автора — это подпись координации, видная без единого вектора.

Метод: для каждого автора X с >= 20 торгуемых идей (те же 74, что в whoisearly) и
каждой его торгуемой идеи берётся множество РАЗЛИЧНЫХ аккаунтов Y != X, постивших по
тому же символу в [ts - 24 ч, ts). Счёт cnt[X][Y] = в скольких окнах X встретился Y.

Нуль: 300 розыгрышей, времена идей X сдвигаются ОБЩИМ смещением тикеро-месяца на
+-1..30 сут (кучность сохраняется — урок фазы C), лента остальных не трогается.
p(X,Y) = доля розыгрышей, где сдвинутый счёт >= настоящего.

Печатаются только пары с cnt >= 10: при ~10^4 проверенных пар ждём ~3 ложных на
p <= 0.01 — это разведка «кто», а не гейт, и трактуется соответственно.

usage: whobefore.py [ndraw] [окно_часов]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

NDRAW = int(sys.argv[1]) if len(sys.argv) > 1 else 300
WIN_H = int(sys.argv[2]) if len(sys.argv) > 2 else 24
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
HOLD = 14 * 1440
MIN_IDEAS_X = 20
SHIFT_MAX_D = 30


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

    def ok(self, entry_ts, horizon):
        got = 0
        while got < horizon:
            a = (entry_ts + got * MIN_MS - self.lo) // MIN_MS
            b = a + CHUNK
            if a < 0 or b > self.n or self.pref[b] - self.pref[a] != CHUNK:
                return got
            got += CHUNK
        return horizon


months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

tapes = {}                       # symbol -> (ts_list, [(ts, author)])
ideas = []                       # (symbol, author, ts, ym) торгуемые идеи
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
                ded.append(d)
    tape.sort()
    tapes[symbol] = ([t for t, _ in tape], tape)
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
        g = time.gmtime(d["ts"] / 1000)
        ideas.append((symbol, d["author"], d["ts"], (g.tm_year, g.tm_mon)))
    print(f"  {symbol}: идей {len(ideas)}, {time.time() - t0:.0f} с", flush=True)

by_author = defaultdict(list)
for r in ideas:
    by_author[r[1]].append(r)
xs = sorted(a for a, rs in by_author.items() if len(rs) >= MIN_IDEAS_X)
print(f"\nавторов X с >= {MIN_IDEAS_X} идеями: {len(xs)}; окно {WIN_H} ч, "
      f"{NDRAW} сдвигов")


def windows_count(rows, offset_by_group):
    """rows: идеи одного X. Возвращает {Y: окон с Y} при данном сдвиге групп."""
    c = defaultdict(int)
    for symbol, x, ts, ym in rows:
        off = offset_by_group.get((symbol, ym), 0)
        t = ts + off
        ts_arr, tape = tapes[symbol]
        lo = bisect.bisect_left(ts_arr, t - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, t)
        seen = set()
        for i in range(lo, hi):
            y = tape[i][1]
            if y != x:
                seen.add(y)
        for y in seen:
            c[y] += 1
    return c


results = []                     # (X, Y, real, null_med, p, nX)
for x in xs:
    rows = by_author[x]
    real = windows_count(rows, {})
    if not real:
        continue
    groups = sorted({(s, ym) for s, _, _, ym in rows})
    hits = defaultdict(int)      # Y -> розыгрышей с cnt >= real[Y]
    meds = defaultdict(list)
    hx = shash(x)
    for sdr in range(NDRAW):
        off = {}
        for g in groups:
            h = rnd(sdr * 2654435761 + hx ^ shash(g[0]) ^ (g[1][0] * 100 + g[1][1]))
            mag = 1 + h % SHIFT_MAX_D
            sign = 1 if (h >> 8) & 1 else -1
            off[g] = sign * mag * DAY_MS
        c = windows_count(rows, off)
        for y, rv in real.items():
            cv = c.get(y, 0)
            if cv >= rv:
                hits[y] += 1
            meds[y].append(cv)
    for y, rv in real.items():
        if rv < 10:
            continue
        p = (hits[y] + 1) / (NDRAW + 1)
        ml = sorted(meds[y])
        results.append((x, y, rv, ml[len(ml) // 2], p, len(rows)))

results.sort(key=lambda r: (r[4], -r[2]))
print(f"\nпар с cnt >= 10: {len(results)}; ожидание ложных на p<=0.01: "
      f"~{len(results) * 0.01:.0f}")
print(f"\n{'X (перформящий)':<22}{'Y (стоит перед)':<22}{'окон':>6}{'нуль':>6}"
      f"{'p':>8}{'идей X':>8}")
for x, y, rv, mn, p, nx in results[:40]:
    print(f"{x[:20]:<22}{y[:20]:<22}{rv:>6}{mn:>6}{p:>8.3f}{nx:>8}")

# серийные предвестники: Y, значимо стоящие перед НЕСКОЛЬКИМИ X
sig = defaultdict(list)
for x, y, rv, mn, p, nx in results:
    if p <= 0.01:
        sig[y].append(x)
print(f"\nаккаунты Y, значимо (p<=0.01) стоящие перед >= 2 разными X:")
for y, xl in sorted(sig.items(), key=lambda kv: -len(kv[1])):
    if len(xl) >= 2:
        print(f"  {y}: перед {len(xl)} авторами — {', '.join(sorted(xl)[:6])}")
print(f"\nготово за {time.time() - t0:.0f} с")
