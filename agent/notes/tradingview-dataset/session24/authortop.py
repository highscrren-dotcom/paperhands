#!/usr/bin/env python3
"""Запрос автора (30.07 22:30): топ-20 авторов с аргументацией «почему эксперт».

После №143 планка такая: экспертность автора должна переживать контроли ЛИЧНО,
а не в пуле. На каждого автора с >= 20 торгуемых идей считается досье:

  n, месяцы активности, PnL/сделку (угол «досидеть 14 сут», издержки 0.4 %),
  по годам (годы с >= 5 сделок);
  p_dir  — перестановка направлений НА ЕГО сделках (его LONG/SHORT против
           случайной расстановки той же пропорции, 200 розыгрышей);
  p_time — его входы против СЛУЧАЙНЫХ ДАТ его же сделок (общий сдвиг
           тикеро-месяца +-1..30 сут, 100 розыгрышей) — ось из урока №143;
  lift/t — парный B&H (его сторона против тех же входов в LONG);
  early% — доля ранних (<=2 чужих/24ч), back14/fwd14 — положение на волне.

Мультисравнения честно: на ~74 авторах при p<=0.05 ждём ~4 ложных на каждый тест.
Досье — не сертификат; сертифицированных нет (№134/№143).

usage: authortop.py [min_ideas] [ndraw_dir] [ndraw_time]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

MIN_N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
NDIR = int(sys.argv[2]) if len(sys.argv) > 2 else 200
NTIME = int(sys.argv[3]) if len(sys.argv) > 3 else 100
EARLY_MAX, WIN_H = 2, 24
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
BACK = 14 * 1440
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


def pnl_pair(st, post_ts):
    """(pnl_long, pnl_short) по двум свечам; None если склад не полон."""
    e0 = (post_ts // MIN_MS) * MIN_MS + MIN_MS
    if st.ok(e0, HOLD) < HOLD:
        return None
    c0 = st.candle(e0)
    ce = st.candle(e0 + (HOLD - 1) * MIN_MS)
    if not c0 or not ce:
        return None
    out = []
    for sd in (1, -1):
        ef = c0[0] * (1 + sd * SLIP / 100)
        xf = ce[1] * (1 - sd * SLIP / 100)
        out.append(max(sd * ((xf - ef) / ef) * 100 - 2 * FEE,
                       FLOOR_L if sd > 0 else FLOOR_S))
    return out[0], out[1]


months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

recs = []   # (author, symbol, ts, sd, early, pnl_l, pnl_s, back, fwd, year, edge_ok)
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
        pp = pnl_pair(st, d["ts"])
        if pp is None:
            continue
        sd = 1 if d["direction"] == "LONG" else -1
        e0 = (d["ts"] // MIN_MS) * MIN_MS + MIN_MS
        cb = st.candle(e0 - BACK * MIN_MS)
        ce = st.candle(e0)
        back = sd * (ce[0] - cb[0]) / cb[0] * 100 if (cb and ce) else None
        fwd = pp[0] if sd > 0 else pp[1]
        lo = bisect.bisect_left(ts_arr, d["ts"] - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, d["ts"])
        n_other = sum(1 for i in range(lo, hi) if tape[i][1] != d["author"])
        e_lo = ((d["ts"] - SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        e_hi = ((d["ts"] + SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        edge_ok = st.ok(e_lo, 1) >= 1 and st.ok(e_hi, HOLD) >= HOLD
        g = time.gmtime(d["ts"] / 1000)
        recs.append((d["author"], symbol, d["ts"], sd, n_other <= EARLY_MAX,
                     pp[0], pp[1], back, fwd, g.tm_year, edge_ok))
    print(f"  {symbol}: {len(recs)}, {time.time() - t0:.0f} с", flush=True)

byau = defaultdict(list)
for r in recs:
    byau[r[0]].append(r)
authors = {a: rs for a, rs in byau.items() if len(rs) >= MIN_N}
print(f"\nидей {len(recs):,}; авторов с >= {MIN_N}: {len(authors)}; "
      f"p_dir {NDIR} розыгрышей, p_time {NTIME}", flush=True)

print("\nautor\tn\tmonths\tpnl\tp_dir\tp_time\tlift\tt_bh\tearly%\tback14\tfwd14\tyears")
for a, rs in sorted(authors.items()):
    n = len(rs)
    pnl = [r[5] if r[3] > 0 else r[6] for r in rs]
    real = sum(pnl) / n
    longs = [r[5] for r in rs]
    n_long = sum(1 for r in rs if r[3] > 0)
    # p_dir: случайные направления той же пропорции на тех же входах
    worse = 0
    ha = shash(a)
    for sdr in range(NDIR):
        h = rnd(sdr * 2654435761 + ha)
        tot = 0.0
        for i, r in enumerate(rs):
            h = rnd(h + i * 40503)
            pick_long = (h % n) < n_long
            tot += r[5] if pick_long else r[6]
        if tot / n >= real:
            worse += 1
    p_dir = (worse + 1) / (NDIR + 1)
    # p_time: случайные даты его же сделок (общий сдвиг тикеро-месяца)
    sel = [r for r in rs if r[10]]
    p_time = None
    if len(sel) >= 10:
        real_t = sum((r[5] if r[3] > 0 else r[6]) for r in sel) / len(sel)
        groups = defaultdict(list)
        for r in sel:
            g = time.gmtime(r[2] / 1000)
            groups[(r[1], g.tm_year, g.tm_mon)].append(r)
        worse_t = 0
        drawn = 0
        for sdr in range(NTIME):
            tot = 0.0
            cnt = 0
            for gk, grs in groups.items():
                h = rnd(sdr * 2654435761 + shash(gk[0]) ^ (gk[1] * 100 + gk[2]))
                mag = 1 + h % SHIFT_MAX_D
                sign = 1 if (h >> 8) & 1 else -1
                off = sign * mag * DAY_MS
                for r in grs:
                    pp = pnl_pair(stores[r[1]], r[2] + off)
                    if pp is None:
                        continue
                    tot += pp[0] if r[3] > 0 else pp[1]
                    cnt += 1
            if cnt:
                drawn += 1
                if tot / cnt >= real_t:
                    worse_t += 1
        p_time = (worse_t + 1) / (drawn + 1) if drawn else None
    # парный B&H
    d = [(r[5] if r[3] > 0 else r[6]) - r[5] for r in rs]
    md = sum(d) / n
    var = sum((x - md) ** 2 for x in d) / (n - 1) if n > 1 else 0
    t_bh = md / ((var / n) ** 0.5) if var > 0 else 0.0
    early = 100 * sum(1 for r in rs if r[4]) / n
    backs = sorted(r[7] for r in rs if r[7] is not None)
    fwds = sorted(r[8] for r in rs)
    b14 = backs[len(backs) // 2] if backs else float("nan")
    f14 = fwds[len(fwds) // 2]
    ys = defaultdict(lambda: [0, 0.0])
    for i, r in enumerate(rs):
        ys[r[9]][0] += 1
        ys[r[9]][1] += pnl[i]
    yrs = ";".join(f"{y}:{v[1] / v[0]:+.1f}({v[0]})" for y, v in sorted(ys.items())
                   if v[0] >= 5)
    mon_span = len({(time.gmtime(r[2] / 1000).tm_year, time.gmtime(r[2] / 1000).tm_mon)
                    for r in rs})
    pt = f"{p_time:.3f}" if p_time is not None else "-"
    print(f"{a}\t{n}\t{mon_span}\t{real:+.3f}\t{p_dir:.3f}\t{pt}\t{md:+.3f}"
          f"\t{t_bh:+.2f}\t{early:.0f}\t{b14:+.2f}\t{f14:+.2f}\t{yrs}", flush=True)

print(f"\nготово за {time.time() - t0:.0f} с")
