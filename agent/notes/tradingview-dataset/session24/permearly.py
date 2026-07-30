#!/usr/bin/env python3
"""Контроли на отбор авторов ПО РАННОСТИ (первое дело фазы D, гейт из HANDOFF_PHASE_D).

whoisearly.py дал: walk-forward топ-K по ранности прошлых 12 мес платит +3.060 %/сделку
на K=2 против +0.675 у отбора по PnL. Но ровно такой же узор (эффект в малых K) в фазе C
оказался подгоном, поэтому до любых выводов — три контроля на ТОЙ ЖЕ выборке:

  1. ЖРЕБИЙ ПО АВТОРАМ: топ-K по ранности против K случайных из тех же допущенных,
     1000 жеребьёвок (машинерия permsel.py). Плюс анти-отбор (низ по ранности).
  2. ЖРЕБИЙ ПРИ ТОЙ ЖЕ ПЛОТНОСТИ: ранность определена через низкую плотность, а низкая
     плотность сама по себе платит (+0.524 у раннего поля против +0.311 у общего).
     Поэтому второй нуль — случайные K авторов, но берутся только их РАННИЕ идеи,
     и настоящий отбор в этом варианте тоже сужен до ранних идей. Если здесь p велико —
     весь эффект делает плотность, а не «кто пишет».
  3. ПАРНЫЙ BUY & HOLD: сделки настоящего топ-K против тех же сделок принудительно в
     LONG (тот же вход, та же длительность, те же издержки). Лифт и парный t.

Гейт (объявлен в HANDOFF до прогона): отбор обязан бить И жребий, И раннее поле.
Иначе ветка закрывается, как закрылся отбор по PnL в фазе C.

Данные и модель — один в один whoisearly.py (наивная модель фазы C, холд 14 сут,
издержки 0.4 % на круг, пол стопа −99.2/−99.399, дедуп 8 ч на пару автор+сторона).

usage: permearly.py [порог_ранности] [окно_часов] [жеребьёвок] [окно_обучения_мес]
                    [1 = допуск только авторов с PnL>0 в окне обучения]
"""
import bisect, heapq, json, os, sys, time
from array import array
from collections import defaultdict

EARLY_MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 2
WIN_H = int(sys.argv[2]) if len(sys.argv) > 2 else 24
NDRAW = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
TRAIN_M = int(sys.argv[4]) if len(sys.argv) > 4 else 12
REQ_POS = bool(int(sys.argv[5])) if len(sys.argv) > 5 else False
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
MIN_IDEAS = 10
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

recs = []          # (month, author, early?, pnl, pnl_long)
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
        efl = c0[0] * (1 + SLIP / 100)
        xfl = ce[1] * (1 - SLIP / 100)
        pnl_l = max(((xfl - efl) / efl) * 100 - 2 * FEE, FLOOR_L)
        lo = bisect.bisect_left(ts_arr, d["ts"] - WIN_H * HOUR_MS)
        hi = bisect.bisect_left(ts_arr, d["ts"])
        n_other = sum(1 for i in range(lo, hi) if tape[i][1] != d["author"])
        recs.append((d["_m"], d["author"], n_other <= EARLY_MAX, pnl, pnl_l))
    print(f"  {symbol}: {len(recs)} идей, {time.time() - t0:.0f} с", flush=True)

print(f"\nвсего идей {len(recs):,}; «рано» = не больше {EARLY_MAX} чужих за {WIN_H} ч; "
      f"{NDRAW} жеребьёвок; допуск {MIN_IDEAS} идей"
      f"{' И PnL>0 в окне' if REQ_POS else ''}; окно обучения {TRAIN_M} мес")

# ---- агрегаты (month, author): тренировка и тест
# bym[m][a] = [early, total, sum_pnl, sum_pnl_e, n_e, sum_d, sum_d2, sum_d_e, sum_d2_e,
#              sum_long]
bym = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, 0.0, 0.0]))
for m, a, early, pnl, pnl_l in recs:
    q = bym[m][a]
    d = pnl - pnl_l
    q[1] += 1
    q[2] += pnl
    q[5] += d
    q[6] += d * d
    q[9] += pnl_l
    if early:
        q[0] += 1
        q[3] += pnl
        q[4] += 1
        q[7] += d
        q[8] += d * d
allm = sorted(bym, key=mkey)

# ---- предвычисление тестовых месяцев: допущенные + их ранность за прошлые 12 мес
tests = []   # (tm, elig_sorted_by_earliness_desc, mt)
for idx, tm in enumerate(allm):
    if mkey(tm)[0] < 2022:
        continue
    train = allm[max(0, idx - TRAIN_M):idx]
    if len(train) < 2:
        continue
    sc = defaultdict(lambda: [0, 0, 0.0])
    for m in train:
        for a, v in bym[m].items():
            sc[a][0] += v[0]
            sc[a][1] += v[1]
            sc[a][2] += v[2]
    elig = [a for a, v in sc.items()
            if v[1] >= MIN_IDEAS and (not REQ_POS or v[2] > 0)]
    if len(elig) < 6:
        continue
    elig.sort(key=lambda a: sc[a][0] / sc[a][1], reverse=True)
    tests.append((tm, elig, bym.get(tm, {})))

HA = {}
for tm, elig, mt in tests:
    for a in elig:
        if a not in HA:
            HA[a] = shash(a)
HM = {tm: shash(tm) for tm, _, _ in tests}


def collect(sel_by_month, early_only):
    """Суммирует тестовые значения по выбору {tm: [авторы]}. Возвращает
    (n, mean, sum_d, sum_d2) — d определён только для настоящего отбора."""
    n = 0
    tot = 0.0
    sd = 0.0
    sd2 = 0.0
    slong = 0.0
    for tm, elig, mt in tests:
        for a in sel_by_month.get(tm, ()):
            if a not in mt:
                continue
            v = mt[a]
            if early_only:
                n += v[4]; tot += v[3]; sd += v[7]; sd2 += v[8]
            else:
                n += v[1]; tot += v[2]; sd += v[5]; sd2 += v[6]; slong += v[9]
    return n, (tot / n if n else 0.0), sd, sd2, slong


def run_K(K):
    ok_tests = [(tm, elig, mt) for tm, elig, mt in tests if len(elig) >= max(3 * K, 6)]
    top = {tm: elig[:K] for tm, elig, mt in ok_tests}
    bot = {tm: elig[-K:] for tm, elig, mt in ok_tests}
    months_fired = sum(1 for tm, elig, mt in ok_tests if any(a in mt for a in top[tm]))

    n_r, m_r, sd, sd2, slong = collect(top, False)
    n_re, m_re, _, _, _ = collect(top, True)
    n_b, m_b, _, _, _ = collect(bot, False)

    # поле допущенных в тех же месяцах: все идеи и только ранние
    fn = fe = 0
    ft = fte = 0.0
    for tm, elig, mt in ok_tests:
        for a in elig:
            if a in mt:
                v = mt[a]
                fn += v[1]; ft += v[2]
                fe += v[4]; fte += v[3]
    f_all = ft / fn if fn else 0.0
    f_early = fte / fe if fe else 0.0

    # жребий: два нуля
    null_all = []
    null_early = []
    for s in range(NDRAW):
        sel = {}
        for tm, elig, mt in ok_tests:
            h = rnd(s * 1000003 + len(elig) * 31 + HM[tm])
            sel[tm] = heapq.nsmallest(K, elig, key=lambda a: rnd(h ^ HA[a]))
        n1, v1, _, _, _ = collect(sel, False)
        n2, v2, _, _, _ = collect(sel, True)
        if n1:
            null_all.append(v1)
        if n2:
            null_early.append(v2)
    null_all.sort()
    null_early.sort()
    p_all = (sum(1 for v in null_all if v >= m_r) + 1) / (len(null_all) + 1)
    p_early = (sum(1 for v in null_early if v >= m_re) + 1) / (len(null_early) + 1)
    p_bot = (sum(1 for v in null_all if v <= m_b) + 1) / (len(null_all) + 1)

    # разбивка настоящего отбора по годам — эффект не должен сидеть в одном годе
    byy = defaultdict(lambda: [0, 0.0])
    for tm, elig, mt in ok_tests:
        for a in top.get(tm, ()):
            if a in mt:
                v = mt[a]
                byy[mkey(tm)[0]][0] += v[1]
                byy[mkey(tm)[0]][1] += v[2]
    yr = "  по годам: " + "; ".join(
        f"{y}: {v[1] / v[0]:+.2f} ({v[0]} сд.)" for y, v in sorted(byy.items()) if v[0])

    # парный buy & hold на настоящем отборе
    mean_d = sd / n_r if n_r else 0.0
    var_d = (sd2 - n_r * mean_d * mean_d) / (n_r - 1) if n_r > 1 else 0.0
    t_d = mean_d / ((var_d / n_r) ** 0.5) if var_d > 0 else 0.0
    m_long = slong / n_r if n_r else 0.0

    print(f"\nK={K}: месяцев с сделками {months_fired}, сделок {n_r}")
    print(f"  ЖРЕБИЙ (все идеи): отбор {m_r:+.3f} против медианы жребия "
          f"{null_all[len(null_all) // 2] if null_all else 0:+.3f}, поле {f_all:+.3f}, "
          f"p = {p_all:.3f}   [{NDRAW} жеребьёвок]")
    print(f"  низ по ранности: {m_b:+.3f}, p низа = {p_bot:.3f}")
    print(f"  ЖРЕБИЙ (только ранние): отбор {m_re:+.3f} ({n_re} сд.) против медианы "
          f"{null_early[len(null_early) // 2] if null_early else 0:+.3f}, "
          f"раннее поле {f_early:+.3f}, p = {p_early:.3f}")
    print(f"  ПАРНЫЙ B&H: стратегия {m_r:+.3f}, те же в LONG {m_long:+.3f}, "
          f"лифт {mean_d:+.3f}, парный t = {t_d:+.2f} на {n_r} сд.")
    print(yr)
    return (K, n_r, m_r, p_all, m_re, p_early, f_early, mean_d, t_d)


print("=" * 88)
print("ОТБОР ПО РАННОСТИ ПРОТИВ ЖРЕБИЯ: два нуля (все идеи / только ранние) + парный B&H")
print("гейт: отбор обязан бить и жребий, и раннее поле — иначе ветка закрывается")
print("=" * 88)
rows = [run_K(K) for K in (1, 2, 3, 5, 10)]
print("\nСВОДКА")
print(f"{'K':>3}{'сделок':>8}{'отбор':>9}{'p жребия':>10}{'ранние':>9}{'p ранних':>10}"
      f"{'раннее поле':>13}{'лифт B&H':>10}{'t':>7}")
for K, n, m, p1, me, p2, fe, ld, td in rows:
    print(f"{K:>3}{n:>8}{m:>+9.3f}{p1:>10.3f}{me:>+9.3f}{p2:>10.3f}{fe:>+13.3f}"
          f"{ld:>+10.3f}{td:>+7.2f}")
