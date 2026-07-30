#!/usr/bin/env python3
"""Парный бета-контроль на НАСТОЯЩЕМ правиле рецепта, а не только на голом углу сетки.

naive.py считает контроли в углу «лок 0 / трейл 100 / стоп 99» — там выход всегда по
концу холда, и хватает двух свечей на идею. У правила рецепта (лок 20 / трейл 8 /
стопа нет) выход зависит от всей поминутной траектории, и полный прогон движком стоит
те же ~15 часов. Но нам не нужен полный прогон: отбор авторов УЖЕ посчитан движком
(panel_c), а парный контроль нужен только по тем сделкам, которые отбор реально взял.

Поэтому здесь:
  1) walk-forward отбор повторяется по панелям движка на заданном правиле;
  2) для отобранных (месяц, автор) поднимаются ИХ идеи из датасета;
  3) каждая идея прогоняется дважды — со своим направлением и принудительно в LONG —
     точным портом SIMULATE_TRADE_FN (вход по открытию минуты после публикации,
     слиппедж в цене, выходы по фитилям, стоп бьёт фиксацию, комиссия 2 x fee);
  4) слот на автора соблюдается: идея внутри его же открытой позиции пропускается.
Сверка: сумма «своего направления» обязана совпасть с trd-строкой движка. Если не
совпала — порт врёт, и результату верить нельзя. Расхождение печатается явно.

usage: paired_rule.py <panel_c> <hold_minutes> <lock> <stop> <trail> [K] [MIN]
"""
import json, os, sys, time
from array import array
from collections import defaultdict

PANEL = sys.argv[1]
HOLD = int(sys.argv[2])
LOCK, STOP, TRAIL = (sys.argv[3], sys.argv[4], sys.argv[5])
K = int(sys.argv[6]) if len(sys.argv) > 6 else 2
MIN_IDEAS = int(sys.argv[7]) if len(sys.argv) > 7 else 10

ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
FEE, SLIP = 0.1, 0.1
RULE = (str(HOLD), LOCK, STOP, TRAIL)
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


# ------------------------------------------------------- отбор по панелям движка
ideas_by_m = defaultdict(lambda: defaultdict(int))
mon = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
cells = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))     # month -> (symbol,author)
for line in open(f"{PANEL}/aut_sorted.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) == RULE and int(p[7]) >= 2:
        ideas_by_m[p[0]][p[6]] += int(p[7])
for line in open(f"{PANEL}/trd_sorted.tsv"):
    p = line.rstrip("\n").split("\t")
    if (p[2], p[3], p[4], p[5]) != RULE:
        continue
    q = mon[p[0]][p[6]]; q[0] += int(p[7]); q[1] += float(p[8])
    z = cells[p[0]][(p[1], p[6])]; z[0] += int(p[7]); z[1] += float(p[8])

months = sorted(set(ideas_by_m) | set(mon), key=mkey)
picked = []                                                   # (month, author)
for idx, tm in enumerate(months):
    if mkey(tm)[0] < 2022:
        continue
    train = months[max(0, idx - 12):idx]
    if len(train) < 2:
        continue
    sc = defaultdict(lambda: [0, 0, 0.0])
    for m in train:
        for au, i in ideas_by_m[m].items():
            sc[au][0] += i
        for au, v in mon[m].items():
            sc[au][1] += v[0]; sc[au][2] += v[1]
    elig = [a for a, v in sc.items() if v[0] >= MIN_IDEAS]
    if len(elig) < max(3 * K, 6):
        continue
    elig.sort(key=lambda a: sc[a][2] / (sc[a][1] + 10) if sc[a][1] else -9, reverse=True)
    for a in elig[:K]:
        if a in mon.get(tm, {}):
            picked.append((tm, a))

want = defaultdict(set)                                        # month -> {author}
for tm, a in picked:
    want[tm].add(a)
print(f"правило холд {HOLD // 1440} сут / лок {LOCK} / стоп {STOP} / трейл {TRAIL}, "
      f"топ-{K}, порог {MIN_IDEAS}: отобрано {len(picked)} пар (месяц, автор) "
      f"в {len(want)} месяцах", flush=True)


# ------------------------------------------------------- склад и симуляция
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

    def profile_len(self, entry_ts, horizon):
        got = 0
        while got < horizon:
            a = (entry_ts + got * MIN_MS - self.lo) // MIN_MS
            b = a + CHUNK
            if a < 0 or b > self.n or self.pref[b] - self.pref[a] != CHUNK:
                return got
            got += CHUNK
        return horizon

    def path(self, entry_ts, count):
        out = []
        for i in range(count):
            try:
                with open(f"{self.dir}/{entry_ts + i * MIN_MS}.json") as fh:
                    c = json.load(fh)
            except FileNotFoundError:
                break
            out.append((c["open"], c["high"], c["low"], c["close"]))
        return out


def simulate(path, direction, hold, lock, stop, trail):
    """Точный порт SIMULATE_TRADE_FN (ClientSweep.ts): -> (pnl%, минут в позиции)."""
    d = direction
    slip = SLIP / 100
    entry_fill = path[0][0] * (1 + d * slip)
    stop_level = entry_fill * (1 - d * stop / 100)
    tr = trail / 100
    arm = entry_fill / (1 - d * tr) if (1 - d * tr) != 0 else float("inf") * d
    lock_level = entry_fill * (1 + d * lock / 100) if lock > 0 else None
    peak = entry_fill
    exit_level = None
    exit_i = min(hold, len(path)) - 1
    i = 0
    while i <= exit_i:
        _, hi, lo, _ = path[i]
        adverse = lo if d > 0 else hi
        favorable = hi if d > 0 else lo
        if (adverse <= stop_level) if d > 0 else (adverse >= stop_level):
            exit_level, exit_i = stop_level, i
            break
        trail_level = peak * (1 - d * tr)
        trail_armed = (peak >= arm) if d > 0 else (peak <= arm)
        trail_hit = trail_armed and ((adverse <= trail_level) if d > 0 else (adverse >= trail_level))
        lock_armed = lock_level is not None and ((peak >= lock_level) if d > 0 else (peak <= lock_level))
        lock_hit = lock_armed and ((adverse <= lock_level) if d > 0 else (adverse >= lock_level))
        if trail_hit and lock_hit:
            better = (trail_level >= lock_level) if d > 0 else (trail_level <= lock_level)
            exit_level, exit_i = (trail_level if better else lock_level), i
            break
        if trail_hit:
            exit_level, exit_i = trail_level, i
            break
        if lock_hit:
            exit_level, exit_i = lock_level, i
            break
        peak = max(peak, favorable) if d > 0 else min(peak, favorable)
        i += 1
    if exit_level is None:
        exit_level = path[exit_i][3]
    exit_fill = exit_level * (1 - d * slip)
    return d * ((exit_fill - entry_fill) / entry_fill) * 100 - 2 * FEE, exit_i


# ------------------------------------------------------- идеи отобранных авторов
tasks = defaultdict(list)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        tasks[s].append(m)

lockf, stopf, trailf = float(LOCK), float(STOP), float(TRAIL)
sum_real = sum_long = 0.0
n_tr = 0
sd = sd2 = 0.0
mine = defaultdict(float)                       # (month, symbol, author) -> мой pnl
t0 = time.time()
for symbol in sorted(tasks):
    need_months = [m for m in tasks[symbol] if m in want]
    if not need_months:
        continue
    st = Store(symbol)
    for month in sorted(need_months):
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
        for au in want[month]:
            busy = -1
            for i in (x for x in ded if x["author"] == au):
                e0 = (i["ts"] // MIN_MS) * MIN_MS + MIN_MS
                if e0 < busy:
                    continue                                   # slot автора занят
                ln = st.profile_len(e0, HOLD)
                if ln == 0:
                    continue
                path = st.path(e0, ln)
                if not path:
                    continue
                d = 1 if i["direction"] == "LONG" else -1
                pr, xi = simulate(path, d, HOLD, lockf, stopf, trailf)
                pl, _ = simulate(path, 1, HOLD, lockf, stopf, trailf)
                busy = e0 + xi * MIN_MS + MIN_MS
                sum_real += pr; sum_long += pl; n_tr += 1
                sd += pr - pl; sd2 += (pr - pl) ** 2
                mine[(month, symbol, au)] += pr
    print(f"  {symbol}: {n_tr} сделок, {time.time() - t0:.0f} с", flush=True)

# ------------------------------------------------------- сверка с движком
diff = worst = 0.0
checked = 0
for (m, s, a), v in mine.items():
    eng = cells[m].get((s, a))
    if eng is None:
        continue
    checked += 1
    diff += abs(v - eng[1])
    worst = max(worst, abs(v - eng[1]))

print()
print(f"сверка с движком: ячеек {checked}, суммарное расхождение {diff:.4f} %, "
      f"худшая ячейка {worst:.4f} %")
if n_tr:
    t = 0.0
    if n_tr > 1:
        var = (sd2 - sd ** 2 / n_tr) / (n_tr - 1)
        if var > 0:
            t = (sd / n_tr) / (var / n_tr) ** 0.5
    print(f"сделок {n_tr}")
    print(f"стратегия      {sum_real / n_tr:+.3f} %/сделку, всего {sum_real:+.1f} %")
    print(f"та же в LONG   {sum_long / n_tr:+.3f} %/сделку, всего {sum_long:+.1f} %")
    print(f"лифт           {(sum_real - sum_long) / n_tr:+.3f} %/сделку, парный t = {t:+.2f}")
