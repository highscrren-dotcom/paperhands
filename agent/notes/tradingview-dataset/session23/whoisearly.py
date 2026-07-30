#!/usr/bin/env python3
"""Вопрос автора (29.07 19:20): «должны быть паттерны — вот в эту первую половину,
пока толпа ещё не поперла, кто именно пишет».

Замер №136 показал: чем больше чужих постов было перед идеей, тем хуже её доходность.
Значит «первая половина» — это идеи с низкой предшествующей плотностью, и вопрос в том,
кто там сидит. Здесь считается три вещи, все без единого вектора:

  1. РАННОСТЬ автора — доля его постов, вышедших при плотности <= 2 чужих за 24 ч.
     Плюс доходность его ранних и поздних постов по отдельности.
  2. УСТОЙЧИВОСТЬ ранности — свойство это автора или случай. Считается разбиением
     его постов на две половины по времени: коррелирует ли ранность первой половины
     с ранностью второй. Если нет — «ранний автор» это ярлык на шуме.
  3. ПРЕДСКАЗУЕМОСТЬ — walk-forward: берём топ-K авторов по РАННОСТИ прошлых
     12 месяцев (не по PnL!) и смотрим их доходность в следующем месяце. Это уже
     готовая торговая гипотеза, а не описание.

usage: whoisearly.py [порог_ранности] [окно_часов]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

EARLY_MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 2      # <= столько чужих = «рано»
WIN_H = int(sys.argv[2]) if len(sys.argv) > 2 else 24
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

recs = []          # (month, symbol, author, ts, n_other, pnl, isPro, isScript)
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
        recs.append((d["_m"], symbol, d["author"], d["ts"], n_other, pnl,
                     bool(d.get("authorIsPro")), bool(d.get("isScript"))))
    print(f"  {symbol}: {len(recs)} идей, {time.time() - t0:.0f} с", flush=True)

print(f"\nвсего идей {len(recs):,}; «рано» = не больше {EARLY_MAX} чужих постов "
      f"за {WIN_H} ч до публикации")

# ---------------------------------------------------------------- 1. кто пишет рано
au = defaultdict(lambda: [0, 0, 0.0, 0.0, 0, 0])   # ранних, поздних, pnlРанн, pnlПоздн, pro, script
for m, s, a, ts, n, pnl, pro, scr in recs:
    q = au[a]
    if n <= EARLY_MAX:
        q[0] += 1; q[2] += pnl
    else:
        q[1] += 1; q[3] += pnl
    q[4] += pro; q[5] += scr
rows = [(a, v) for a, v in au.items() if v[0] + v[1] >= 20]
print(f"\nавторов с >=20 идеями: {len(rows)} (из {len(au)})")
rows.sort(key=lambda r: -(r[1][0] / (r[1][0] + r[1][1])))
print(f"\n{'автор':<24}{'идей':>6}{'ранних':>8}{'доля':>7}{'PnL ранних':>12}{'PnL поздних':>13}{'Pro':>5}")
for a, v in rows[:12]:
    n = v[0] + v[1]
    print(f"{a[:22]:<24}{n:>6}{v[0]:>8}{100*v[0]/n:>6.0f}%"
          f"{v[2]/v[0] if v[0] else 0:>+12.3f}{v[3]/v[1] if v[1] else 0:>+13.3f}"
          f"{100*v[4]/n:>4.0f}%")
print("  … хвост …")
for a, v in rows[-6:]:
    n = v[0] + v[1]
    print(f"{a[:22]:<24}{n:>6}{v[0]:>8}{100*v[0]/n:>6.0f}%"
          f"{v[2]/v[0] if v[0] else 0:>+12.3f}{v[3]/v[1] if v[1] else 0:>+13.3f}"
          f"{100*v[4]/n:>4.0f}%")

# поле целиком: ранние против поздних
e = [r for r in recs if r[4] <= EARLY_MAX]
l = [r for r in recs if r[4] > EARLY_MAX]
print(f"\nПОЛЕ: ранних идей {len(e):,} -> {sum(r[5] for r in e)/len(e):+.3f} %/сделку; "
      f"поздних {len(l):,} -> {sum(r[5] for r in l)/len(l):+.3f}")
pe = sum(1 for r in e if r[6]) / len(e) * 100
pl = sum(1 for r in l if r[6]) / len(l) * 100
se = sum(1 for r in e if r[7]) / len(e) * 100
sl = sum(1 for r in l if r[7]) / len(l) * 100
print(f"доля Pro-аккаунтов: рано {pe:.1f} % против поздно {pl:.1f} %; "
      f"скриптовых: рано {se:.1f} % против поздно {sl:.1f} %")

# ---------------------------------------------------------------- 2. устойчива ли ранность
half = defaultdict(lambda: [[0, 0], [0, 0]])
byau = defaultdict(list)
for r in recs:
    byau[r[2]].append(r)
pairs = []
for a, rs in byau.items():
    if len(rs) < 20:
        continue
    rs.sort(key=lambda r: r[3])
    mid = len(rs) // 2
    f1 = sum(1 for r in rs[:mid] if r[4] <= EARLY_MAX) / mid
    f2 = sum(1 for r in rs[mid:] if r[4] <= EARLY_MAX) / (len(rs) - mid)
    pairs.append((f1, f2))
if len(pairs) > 2:
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    syy = sum((p[1] - my) ** 2 for p in pairs)
    r = sxy / (sxx * syy) ** 0.5 if sxx and syy else 0
    print(f"\nУСТОЙЧИВОСТЬ РАННОСТИ: корреляция первой и второй половины постов автора "
          f"r = {r:+.3f} на {n} авторах")
    print("  (r около нуля значит, что «ранний автор» — ярлык на шуме, а не свойство)")

# ---------------------------------------------------------------- 3. walk-forward по ранности
bym = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))    # month -> author -> ранних, всего, pnl
for m, s, a, ts, n, pnl, pro, scr in recs:
    q = bym[m][a]
    q[0] += (n <= EARLY_MAX); q[1] += 1; q[2] += pnl
allm = sorted(bym, key=mkey)
print(f"\nWALK-FORWARD ПО РАННОСТИ (рейтинг по прошлым 12 мес, доход в следующем):")
print(f"{'K':>4}{'мес':>6}{'сделок':>9}{'на сделку':>12}{'поле':>10}{'лифт':>9}")
for K in (1, 2, 3, 5, 10):
    tot = [0, 0.0]; fld = [0, 0.0]; nm = 0
    for idx, tm in enumerate(allm):
        if mkey(tm)[0] < 2022:
            continue
        train = allm[max(0, idx - 12):idx]
        if len(train) < 2:
            continue
        sc = defaultdict(lambda: [0, 0])
        for m in train:
            for a, v in bym[m].items():
                sc[a][0] += v[0]; sc[a][1] += v[1]
        elig = [a for a, v in sc.items() if v[1] >= 10]
        if len(elig) < max(3 * K, 6):
            continue
        elig.sort(key=lambda a: sc[a][0] / sc[a][1], reverse=True)
        mt = bym.get(tm, {})
        got = False
        for a in elig[:K]:
            if a in mt:
                tot[0] += mt[a][1]; tot[1] += mt[a][2]; got = True
        for a in elig:
            if a in mt:
                fld[0] += mt[a][1]; fld[1] += mt[a][2]
        nm += got
    if tot[0]:
        av = tot[1] / tot[0]; fa = fld[1] / fld[0] if fld[0] else 0
        print(f"{K:>4}{nm:>6}{tot[0]:>9}{av:>+12.3f}{fa:>+10.3f}{av-fa:>+9.3f}")
