#!/usr/bin/env python3
"""Шестая попытка собрать полевой эдж TV: отбор авторов по НАПРАВЛЕНЧЕСКОМУ СКИЛЛУ
в честном walk-forward (запрос владельца 03.08 «искать сигналы с TV»).

Пять предыдущих способов закрыты гейтами (PnL-отбор, фильтр шума, кластеры,
ранность, ранность+PnL — №134/№143). Здесь отбор по единственному свойству,
которое пережило личные перм-тесты в №145: умение ставить СТОРОНУ.

Метрика отбора (in-sample запрещён — считается только по прошлым TRAIN_M мес):
  dirlift = mean(pnl со своим направлением) − mean(ожидание при случайной
            стороне с той же долей лонгов q)
  где ожидание = q*pnl_long + (1−q)*pnl_short для каждой сделки. Это ТОЧНОЕ
  матожидание перестановочного теста направления — то же, что перм-тест, но
  аналитически и мгновенно, поэтому влезает внутрь walk-forward.

ГЕЙТ ОБЪЯВЛЕН ДО ПРОГОНА: отбор обязан бить ОБА контроля —
  1) жребий: K случайных авторов из тех же допущенных (1000 розыгрышей);
  2) случайные даты: те же отобранные сделки со сдвигом тикеро-месяца
     ±1..30 сут (100 розыгрышей) — тест, который убил ранность.
Не бьёт хотя бы один → TV закрывается так же, как телеграм.

Модель: угол «досидеть 14 сут», издержки 0.4%, пол стопа −99.2/−99.399.

usage: dirsel.py [train_months] [ndraw_pick] [ndraw_shift]
"""
import bisect, heapq, json, os, sys, time
from array import array
from collections import defaultdict

TRAIN_M = int(sys.argv[1]) if len(sys.argv) > 1 else 12
NPICK = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
NSHIFT = int(sys.argv[3]) if len(sys.argv) > 3 else 100
MIN_TRADES = 10          # допуск автора: сделок в окне обучения
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
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


def pnl_pair(st, post_ts):
    e0 = (post_ts // MIN_MS) * MIN_MS + MIN_MS
    if st.ok(e0, HOLD) < HOLD:
        return None
    c0, ce = st.candle(e0), st.candle(e0 + (HOLD - 1) * MIN_MS)
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

recs = []          # (month, symbol, author, ts, sd, pl, ps, edge_ok)
stores = {}
t0 = time.time()
for symbol in sorted(months):
    st = Store(symbol)
    stores[symbol] = st
    ded = []
    for m in sorted(months[symbol]):
        try:
            fh = open(f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl")
        except FileNotFoundError:
            continue
        for line in fh:
            if f'"symbol":"{symbol}"' not in line:
                continue
            d = json.loads(line)
            if d["symbol"] != symbol or d["direction"] == "NEUTRAL":
                continue
            d["_m"] = m
            ded.append(d)
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
        e_lo = ((d["ts"] - SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        e_hi = ((d["ts"] + SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        edge_ok = st.ok(e_lo, 1) >= 1 and st.ok(e_hi, HOLD) >= HOLD
        recs.append((d["_m"], symbol, d["author"], d["ts"],
                     1 if d["direction"] == "LONG" else -1, pp[0], pp[1], edge_ok))
    print(f"  {symbol}: {len(recs)}, {time.time() - t0:.0f} с", flush=True)

bym = defaultdict(lambda: defaultdict(list))
for r in recs:
    bym[r[0]][r[2]].append(r)
allm = sorted(bym, key=mkey)
print(f"\nсделок {len(recs):,}, месяцев {len(allm)}, окно обучения {TRAIN_M} мес, "
      f"допуск {MIN_TRADES} сделок")


def dirlift(trades):
    """Точное матожидание перестановки стороны при той же доле лонгов."""
    n = len(trades)
    if n < MIN_TRADES:
        return None
    q = sum(1 for t in trades if t[4] > 0) / n
    real = sum((t[5] if t[4] > 0 else t[6]) for t in trades) / n
    null = sum(q * t[5] + (1 - q) * t[6] for t in trades) / n
    return real - null


tests = []
for idx, tm in enumerate(allm):
    if mkey(tm)[0] < 2022:
        continue
    train = allm[max(0, idx - TRAIN_M):idx]
    if len(train) < 2:
        continue
    agg = defaultdict(list)
    for m in train:
        for a, ts in bym[m].items():
            agg[a].extend(ts)
    scored = [(a, dirlift(v)) for a, v in agg.items()]
    elig = sorted([(a, s) for a, s in scored if s is not None], key=lambda x: -x[1])
    if len(elig) < 6:
        continue
    tests.append((tm, [a for a, _ in elig], bym.get(tm, {})))

HA = {a: shash(a) for _, el, _ in tests for a in el}
HM = {tm: shash(tm) for tm, _, _ in tests}


def evaluate(pick_fn, K):
    n = 0
    tot = 0.0
    sd = sd2 = 0.0
    sel_trades = []
    for tm, elig, mt in tests:
        if len(elig) < max(3 * K, 6):
            continue
        for a in pick_fn(tm, elig, K):
            for t in mt.get(a, []):
                p = t[5] if t[4] > 0 else t[6]
                n += 1
                tot += p
                d = p - t[5]
                sd += d
                sd2 += d * d
                sel_trades.append(t)
    if not n:
        return None
    mean_d = sd / n
    var = (sd2 - n * mean_d * mean_d) / (n - 1) if n > 1 else 0
    t_bh = mean_d / ((var / n) ** 0.5) if var > 0 else 0.0
    return dict(n=n, mean=tot / n, lift=mean_d, t_bh=t_bh, trades=sel_trades)


def top(tm, elig, K):
    return elig[:K]


def make_rand(seed):
    def pick(tm, elig, K):
        h = rnd(seed * 1000003 + len(elig) * 31 + HM[tm])
        return heapq.nsmallest(K, elig, key=lambda a: rnd(h ^ HA[a]))
    return pick


print(f"\n{'K':>3}{'сделок':>8}{'отбор':>9}{'поле':>8}{'p жребия':>10}"
      f"{'p дат':>8}{'лифт B&H':>10}{'t':>7}")
print("-" * 63)
results = []
for K in (1, 2, 3, 5, 10):
    real = evaluate(top, K)
    if not real:
        continue
    # поле: все допущенные
    fld = evaluate(lambda tm, el, k: el, K)
    # контроль 1 — жребий по авторам
    null = []
    for s in range(NPICK):
        v = evaluate(make_rand(s), K)
        if v:
            null.append(v["mean"])
    null.sort()
    p_pick = (sum(1 for v in null if v >= real["mean"]) + 1) / (len(null) + 1)
    # контроль 2 — случайные даты на отобранных сделках
    sel = [t for t in real["trades"] if t[7]]
    p_shift = float("nan")
    if len(sel) >= 20:
        base = sum((t[5] if t[4] > 0 else t[6]) for t in sel) / len(sel)
        groups = defaultdict(list)
        for t in sel:
            g = time.gmtime(t[3] / 1000)
            groups[(t[1], g.tm_year, g.tm_mon)].append(t)
        nulls = []
        for s in range(NSHIFT):
            tot = cnt = 0
            acc = 0.0
            for gk, ts in groups.items():
                h = rnd(s * 2654435761 + shash(gk[0]) ^ (gk[1] * 100 + gk[2]))
                off = (1 + h % SHIFT_MAX_D) * (1 if (h >> 8) & 1 else -1) * DAY_MS
                for t in ts:
                    pp = pnl_pair(stores[t[1]], t[3] + off)
                    if pp is None:
                        continue
                    acc += pp[0] if t[4] > 0 else pp[1]
                    cnt += 1
            if cnt:
                nulls.append(acc / cnt)
        nulls.sort()
        p_shift = (sum(1 for v in nulls if v >= base) + 1) / (len(nulls) + 1)
    print(f"{K:>3}{real['n']:>8}{real['mean']:>+9.3f}{fld['mean']:>+8.3f}"
          f"{p_pick:>10.3f}{p_shift:>8.3f}{real['lift']:>+10.3f}{real['t_bh']:>+7.2f}")
    results.append((K, real, p_pick, p_shift))

print("\nГЕЙТ: отбор обязан бить И жребий (p<=0.05), И случайные даты (p<=0.05).")
ok = [r for r in results if r[2] <= 0.05 and r[3] == r[3] and r[3] <= 0.05]
if ok:
    print(f"ПРОШЛИ: {[r[0] for r in ok]} — первый выживший отбор за шесть попыток")
else:
    print("НЕ ПРОШЁЛ НИ ОДИН K — направленческий отбор на TV закрывается так же,")
    print("как ранность (№143) и телеграм-каналы (№151).")
print(f"\nготово за {time.time() - t0:.0f} с")
