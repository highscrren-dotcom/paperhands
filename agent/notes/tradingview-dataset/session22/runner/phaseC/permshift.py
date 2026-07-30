#!/usr/bin/env python3
"""Есть ли у времени публикации срок годности: нулевое распределение по сдвигу входа.

Прямой вопрос автора — «докуда растёт холд» — упирается в то, что с ростом холда любая
стратегия становится похожа на «купил и держал». Отделить одно от другого можно так:
сдвинуть ВЕСЬ тикеро-месяц на общий случайный срок и посмотреть, потерял ли результат.
Общий сдвиг на пакет (а не на каждую идею) сохраняет дедуп, кучность постов и работу
слота автора один в один — ломается ровно привязка входов к рынку.

Если на холде H настоящее время публикации ничем не лучше сдвинутого, значит на этом
горизонте идея не несёт информации, а несёт экспозицию.

Считается только СЫРОЕ ПОЛЕ (все сделки, отбора нет): отбор — отдельный слой, на нём
двести сделок и видно что угодно.

Кромка данных вырезается у ВСЕХ вариантов одинаково. Иначе сравнение нечестное: у края
склада сдвиг назад удлиняет профиль, а сдвиг вперёд его убивает, и «сдвинутые» получают
в среднем более длинный холд, чем настоящие. Поэтому берутся только идеи, у которых и
сама сделка, и любой её сдвиг целиком помещаются в склад.

Знак сдвига важен отдельно. Сдвиг НАЗАД торговать нельзя — это вход до публикации, то
есть заглядывание вперёд; он годится только как диагностика («пост случился после
хорошего движения»). Сдвиг ВПЕРЁД торговать можно: это буквально «подожди N суток после
поста». Поэтому знак задаётся аргументом.

usage: permshift.py [сдвигов] [макс. сдвиг, суток] [кромка: 1/0] [знак: 0 оба, 1 вперёд, -1 назад]
"""
import json, os, sys, time
from array import array
from collections import defaultdict

NSEED = int(sys.argv[1]) if len(sys.argv) > 1 else 30
SHIFT_DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 30
TRIM = int(sys.argv[3]) if len(sys.argv) > 3 else 1
SIGN = int(sys.argv[4]) if len(sys.argv) > 4 else 0
ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
FEE, SLIP = 0.1, 0.1
# пол стопа: в углу «стоп 99» уровень шорта 1.99 от входа, движок выбивает на
# -99.4 %, а «досидеть до конца» досиживает. Сверено с движком (xcheck.py).
FLOOR_L, FLOOR_S = -99.2, -99.399
HOLDS = [14 * 1440, 18 * 1440, 21 * 1440, 24 * 1440, 27 * 1440]


def rnd(x):
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


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

    def profile_len(self, entry_ts, horizon):
        got = 0
        while got < horizon:
            a = (entry_ts + got * MIN_MS - self.lo) // MIN_MS
            b = a + CHUNK
            if a < 0 or b > self.n or self.pref[b] - self.pref[a] != CHUNK:
                return got
            got += CHUNK
        return horizon

    def candle(self, ts):
        v = self.cache.get(ts)
        if v is not None:
            return v
        try:
            with open(f"{self.dir}/{ts}.json") as fh:
                c = json.load(fh)
        except FileNotFoundError:
            return None
        v = (c["open"], c["close"])
        if len(self.cache) < 4_000_000:
            self.cache[ts] = v
        return v


tasks = defaultdict(list)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        tasks[s].append(m)

# seed 0 = настоящие входы, дальше — сдвиги
sums = defaultdict(lambda: [0, 0.0])            # (seed, hold) -> сделок, pnl
t0 = time.time()
for symbol in sorted(tasks):
    st = Store(symbol)
    for month in sorted(tasks[symbol]):
        f = f"{ROOT}/{month}/assets/tv-ideas.normalize.jsonl"
        try:
            raw = [json.loads(x) for x in open(f) if x.strip()]
        except FileNotFoundError:
            continue
        ideas = sorted((i for i in raw
                        if i["symbol"] == symbol and i["direction"] != "NEUTRAL"),
                       key=lambda i: i["ts"])
        last = {}
        ded = []
        for i in ideas:
            k = f'{i["author"]}:{i["direction"]}'
            if k in last and i["ts"] - last[k] < DEDUPE_MS:
                continue
            last[k] = i["ts"]
            ded.append(i)
        if TRIM:
            # кромка вырезается ОДИНАКОВО у всех вариантов: оставляем только те идеи,
            # у которых и сама сделка, и любой её сдвиг целиком лежат внутри склада
            pad = SHIFT_DAYS * 1440 * MIN_MS
            need = max(HOLDS) * MIN_MS
            ded = [i for i in ded
                   if (i["ts"] // MIN_MS) * MIN_MS + MIN_MS - pad >= st.lo
                   and (i["ts"] // MIN_MS) * MIN_MS + MIN_MS + pad + need <= st.hi]
        if not ded:
            continue
        base = rnd(ded[0]["id"])
        for seed in range(NSEED + 1):
            if seed == 0:
                off = 0
            else:
                h = rnd(base ^ (seed * 2654435761))
                sg = SIGN if SIGN else (1 if (h >> 16) & 1 else -1)
                off = sg * ((h % SHIFT_DAYS) + 1) * 1440 * MIN_MS
            busy = {}
            for i in ded:
                au = i["author"]
                ent = (i["ts"] // MIN_MS) * MIN_MS + MIN_MS + off
                ln = st.profile_len(ent, max(HOLDS))
                if ln == 0:
                    continue
                c0 = st.candle(ent)
                if c0 is None:
                    continue
                d = 1 if i["direction"] == "LONG" else -1
                for hold in HOLDS:
                    if ent < busy.get((au, hold), -1):
                        continue
                    xi = min(hold, ln) - 1
                    ce = st.candle(ent + xi * MIN_MS)
                    if ce is None:
                        continue
                    ef = c0[0] * (1 + d * SLIP / 100)
                    xf = ce[1] * (1 - d * SLIP / 100)
                    q = sums[(seed, hold)]
                    q[0] += 1
                    q[1] += max(d * ((xf - ef) / ef) * 100 - 2 * FEE,
                                FLOOR_L if d > 0 else FLOOR_S)
                    busy[(au, hold)] = ent + xi * MIN_MS + MIN_MS
    print(f"  {symbol}: {time.time() - t0:.0f} с", flush=True)

print()
print("=" * 96)
ZN = {0: "+-", 1: "вперёд на", -1: "назад на"}[SIGN]
print(f"СРОК ГОДНОСТИ ВРЕМЕНИ ВХОДА: {NSEED} сдвигов пакета {ZN} (1..{SHIFT_DAYS}) суток"
      f"{'' if TRIM else ', кромка НЕ вырезана'}")
print("сырое поле, все сделки, издержки 0.4 % на круг")
print("=" * 96)
print(f"{'холд':>6}{'сделок':>9}{'сделок у сдвигов':>18}{'настоящие входы':>18}"
      f"{'медиана сдвига':>17}{'5-й..95-й перц.':>22}{'p':>8}")
for hold in HOLDS:
    real = sums[(0, hold)]
    if not real[0]:
        continue
    vals = sorted((sums[(s, hold)][1] / sums[(s, hold)][0], sums[(s, hold)][0])
                  for s in range(1, NSEED + 1) if sums[(s, hold)][0])
    null = [v for v, _ in vals]
    cnts = sorted(c for _, c in vals)
    r = real[1] / real[0]
    ge = sum(1 for v in null if v >= r)
    lo = null[int(0.05 * (len(null) - 1))]
    hi = null[int(0.95 * (len(null) - 1))]
    print(f"{hold // 1440:>4}сут{real[0]:>9}{cnts[len(cnts) // 2]:>18}{r:>+18.3f}"
          f"{null[len(null) // 2]:>+17.3f}{f'{lo:+.3f} .. {hi:+.3f}':>22}"
          f"{(ge + 1) / (len(null) + 1):>8.3f}")
print()
print("p — доля сдвигов, где случайное время входа не хуже настоящего.")
print("Маленькое p = время публикации ещё значит что-то. p около 0.5 = уже нет.")
