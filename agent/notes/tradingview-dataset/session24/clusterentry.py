#!/usr/bin/env python3
"""Этап 3 фазы D — ГЛАВНЫЙ тест гипотезы автора: предсказывает ли кластер постов
движение ВПЕРЁД от своего начала (координация), или он лишь объясняет движение назад
(реакция толпы). Гейт объявлен в HANDOFF_PHASE_D до прогонов: вход в начале кластера
обязан бить вход по посту — иначе координации в торгуемом смысле нет.

Кластер: >= K постов по символу внутри окна W. Сетка объявлена заранее:
K in {3, 5, 8}, W in {6 ч, 24 ч}. Детекция жадная слева, кластеры не перекрываются
(следующий кандидат — первый пост после конца окна текущего кластера).

Четыре входа от ОДНОГО кластера (наивная модель фазы C: две свечи, слиппедж в цене,
комиссия 2 x fee, пол стопа, холд 14 сут):
  A: начало кластера (первый пост окна), направление — первой направленной идеи окна.
     Диагностика: в момент первого поста ни кластер, ни направление ещё не видны.
  B: пост автора (та самая первая направленная идея), «как сейчас» — торгуемый базлайн.
  D: момент, когда кластер СТАНОВИТСЯ виден и направление известно:
     max(время K-го поста, время направленной идеи) — честно торгуемый вариант.
  C: buy & hold от начала кластера (как A, но принудительно LONG) — отделяет
     «направление» от «просто попал в волну».

Контроли:
  - плацебо по ВРЕМЕНИ: общий сдвиг всех кластеров тикеро-месяца на один случайный
    срок +-1..30 сут (кучность сохраняется — урок фазы C), 100 розыгрышей, кромка
    вырезана у всех вариантов одинаково;
  - плацебо по СОСТАВУ: кластеры, найденные на объединённой ленте ОСТАЛЬНЫХ 11
    символов, торгуются на ЭТОМ символе (направление — первой направленной идеи
    чужого кластера). Отделяет «на рынке вообще шумно» от «шумно именно тут».

usage: clusterentry.py [ndraw]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

NDRAW = int(sys.argv[1]) if len(sys.argv) > 1 else 100
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
CHUNK = 1000
FEE, SLIP = 0.1, 0.1
FLOOR_L, FLOOR_S = -99.2, -99.399
HOLD = 14 * 1440
GRID = [(3, 6), (5, 6), (8, 6), (3, 24), (5, 24), (8, 24)]   # (K постов, W часов)
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


def pnl_at(st, post_ts, sd):
    """Вход по открытию минуты после post_ts, выход по закрытию через 14 сут."""
    e0 = (post_ts // MIN_MS) * MIN_MS + MIN_MS
    if st.ok(e0, HOLD) < HOLD:
        return None
    c0 = st.candle(e0)
    ce = st.candle(e0 + (HOLD - 1) * MIN_MS)
    if not c0 or not ce:
        return None
    ef = c0[0] * (1 + sd * SLIP / 100)
    xf = ce[1] * (1 - sd * SLIP / 100)
    return max(sd * ((xf - ef) / ef) * 100 - 2 * FEE,
               FLOOR_L if sd > 0 else FLOOR_S)


def find_clusters(tape_ts, K, W_ms):
    """Жадная детекция слева на отсортированной ленте времён. Возвращает список
    (t_first, t_kth): начало окна и момент K-го поста."""
    out = []
    i = 0
    n = len(tape_ts)
    while i < n:
        t0 = tape_ts[i]
        j = bisect.bisect_right(tape_ts, t0 + W_ms, i)
        if j - i >= K:
            out.append((t0, tape_ts[i + K - 1]))
            i = bisect.bisect_right(tape_ts, t0 + W_ms, i)   # без перекрытий
        else:
            i += 1
    return out


# ------------------------------------------------------- данные
months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

tapes = {}          # symbol -> (ts_list, полная лента)
direc = {}          # symbol -> [(ts, +1/-1)] направленные идеи
stores = {}
for symbol in sorted(months):
    tape = []
    dd = []
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
            tape.append(d["ts"])
            if d["direction"] != "NEUTRAL":
                dd.append((d["ts"], 1 if d["direction"] == "LONG" else -1))
    tape.sort()
    dd.sort()
    tapes[symbol] = tape
    direc[symbol] = dd
    stores[symbol] = Store(symbol)
    print(f"  {symbol}: лента {len(tape)}, направленных {len(dd)}", flush=True)

pooled = {}         # symbol -> лента остальных символов (для плацебо по составу)
all_events = []     # (ts, symbol) всех постов
for s, tp in tapes.items():
    for t in tp:
        all_events.append((t, s))
all_events.sort()
for s in tapes:
    pooled[s] = [t for t, s2 in all_events if s2 != s]

MONKEY = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def month_of(ts):
    """Тикеро-месяц по времени поста: нужен только для группировки сдвига."""
    d = time.gmtime(ts / 1000)
    return (d.tm_year, d.tm_mon)


t0 = time.time()
print(f"\nхолд 14 сут, издержки 0.4 % на круг, {NDRAW} сдвигов +-1..{SHIFT_MAX_D} сут")
print("=" * 100)
print(f"{'K':>3}{'W':>5}{'класт.':>8}{'годн.':>7}{'A старт':>9}{'B пост':>9}"
      f"{'A-B t':>7}{'D видим':>9}{'C лонг':>9}{'A-C t':>7}"
      f"{'пл.время мед':>13}{'p':>7}{'пл.состав':>10}")

for K, W_h in GRID:
    W_ms = W_h * HOUR_MS
    rows = []       # (symbol, t_first, t_vis, t_post, sd)
    n_cl = 0
    for symbol in sorted(tapes):
        dd = direc[symbol]
        dts = [t for t, _ in dd]
        for t_first, t_kth in find_clusters(tapes[symbol], K, W_ms):
            n_cl += 1
            i = bisect.bisect_left(dts, t_first)
            if i >= len(dd) or dd[i][0] > t_first + W_ms:
                continue                        # в окне нет направленной идеи
            t_post, sd = dd[i]
            rows.append((symbol, t_first, max(t_kth, t_post), t_post, sd))

    # кромка: годен кластер, у которого влезают и все сдвиги +-SHIFT_MAX_D
    ok_rows = []
    for symbol, t_first, t_vis, t_post, sd in rows:
        st = stores[symbol]
        e_lo = ((t_first - SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        e_hi = ((t_post + SHIFT_MAX_D * DAY_MS) // MIN_MS) * MIN_MS + MIN_MS
        if st.ok(e_lo, 1) < 1 or st.ok(e_hi, HOLD) < HOLD:
            continue
        pa = pnl_at(st, t_first, sd)
        pb = pnl_at(st, t_post, sd)
        pdv = pnl_at(st, t_vis, sd)
        pc = pnl_at(st, t_first, 1)
        if None in (pa, pb, pdv, pc):
            continue
        ok_rows.append((symbol, t_first, t_vis, t_post, sd, pa, pb, pdv, pc))

    n = len(ok_rows)
    if n < 30:
        print(f"{K:>3}{W_h:>4}ч{n_cl:>8}{n:>7}   мало годных, пропуск")
        continue
    ma = sum(r[5] for r in ok_rows) / n
    mb = sum(r[6] for r in ok_rows) / n
    md = sum(r[7] for r in ok_rows) / n
    mc = sum(r[8] for r in ok_rows) / n
    dab = [r[5] - r[6] for r in ok_rows]
    dac = [r[5] - r[8] for r in ok_rows]

    def paired_t(ds):
        m = sum(ds) / len(ds)
        var = sum((x - m) ** 2 for x in ds) / (len(ds) - 1)
        return m / ((var / len(ds)) ** 0.5) if var > 0 else 0.0

    t_ab = paired_t(dab)
    t_ac = paired_t(dac)

    # плацебо по времени: общий сдвиг тикеро-месяца
    groups = defaultdict(list)
    for idx, r in enumerate(ok_rows):
        groups[(r[0], month_of(r[1]))].append(idx)
    null_a = []
    for s_draw in range(NDRAW):
        tot = 0.0
        cnt = 0
        for g, idxs in groups.items():
            h = rnd(s_draw * 2654435761 + shash(g[0]) ^ (g[1][0] * 100 + g[1][1]))
            mag = 1 + h % SHIFT_MAX_D
            sign = 1 if (h >> 8) & 1 else -1
            off = sign * mag * DAY_MS
            for idx in idxs:
                symbol, t_first, _, _, sd = ok_rows[idx][:5]
                p = pnl_at(stores[symbol], t_first + off, sd)
                if p is not None:
                    tot += p
                    cnt += 1
        if cnt:
            null_a.append(tot / cnt)
    null_a.sort()
    p_time = (sum(1 for v in null_a if v >= ma) + 1) / (len(null_a) + 1)
    med_null = null_a[len(null_a) // 2] if null_a else 0.0

    # плацебо по составу: кластеры чужой ленты торгуются на этом символе
    comp_tot = 0.0
    comp_n = 0
    for symbol in sorted(tapes):
        dd = direc[symbol]
        st = stores[symbol]
        for t_first, t_kth in find_clusters(pooled[symbol], K, W_ms):
            # направление — первая направленная идея ЧУЖОГО кластера не определена на
            # этом символе; берём первую направленную идею ЭТОГО символа в том же окне,
            # а если её нет — LONG (нейтральная сторона волны)
            i = bisect.bisect_left([t for t, _ in dd], t_first)
            if i < len(dd) and dd[i][0] <= t_first + W_ms:
                sd = dd[i][1]
            else:
                sd = 1
            p = pnl_at(st, t_first, sd)
            if p is not None:
                comp_tot += p
                comp_n += 1
    m_comp = comp_tot / comp_n if comp_n else 0.0

    print(f"{K:>3}{W_h:>4}ч{n_cl:>8}{n:>7}{ma:>+9.3f}{mb:>+9.3f}{t_ab:>+7.2f}"
          f"{md:>+9.3f}{mc:>+9.3f}{t_ac:>+7.2f}{med_null:>+13.3f}{p_time:>7.3f}"
          f"{m_comp:>+10.3f}  [{time.time() - t0:.0f} с]", flush=True)

print("""
Чтение:
  A > B значимо (t A-B > 2) и плацебо не проходят -> начало кластера несёт информацию
  вперёд: гипотеза координации жива, смотреть D (торгуемость).
  A <= B или p времени велико -> кластер объясняет движение назад, координации в
  торгуемом смысле нет — ветка закрывается по гейту.
""")
