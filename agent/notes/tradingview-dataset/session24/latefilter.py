#!/usr/bin/env python3
"""Этап 2 фазы D: фильтр «поздний вход» на НАСТОЯЩЕМ правиле рецепта фазы C.

Рецепт фазы C: холд 14 сут, лок 20, трейл 8, стопа нет, отбор топ-2 по PnL прошлых
12 мес. Его парный контроль дал +1.493 %/сделку над теми же сделками в LONG (t = +2.28,
264 сделки). Здесь к рецепту добавляется одно условие: НЕ входить, если за 24 ч до
поста по этому символу было >= N ЧУЖИХ постов.

Пороги объявлены ДО прогона, по распределению плотности (precluster, 10 167 идей):
медиана и граница верхней трети. Точные значения печатаются из данных, не задаются
руками. Сравнение — с базлайном БЕЗ фильтра в этом же прогоне (он обязан воспроизвести
+1.493 / t +2.28 / 264 сделки — это и сверка порта).

Три варианта считаются В ОДИН проход (слот автора у каждого варианта свой):
  A: без фильтра (базлайн + сверка с движком);
  B: вход только при n_other < P50;
  C: вход только при n_other < P67.

Стоп-условие этапа (из плана): лифт не выше +1.493 при t не выше +2.28 -> фильтр
не работает.

usage: latefilter.py <panel_c> [K] [MIN]
"""
import bisect, json, os, sys, time
from array import array
from collections import defaultdict

PANEL = sys.argv[1] if len(sys.argv) > 1 else "/data/backtests/_agent/phaseC/panel_c"
K = int(sys.argv[2]) if len(sys.argv) > 2 else 2
MIN_IDEAS = int(sys.argv[3]) if len(sys.argv) > 3 else 10

ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
MIN_MS = 60_000
HOUR_MS = 3_600_000
CHUNK = 1000
DEDUPE_MS = 8 * 60 * MIN_MS
FEE, SLIP = 0.1, 0.1
HOLD = 14 * 1440
LOCKF, STOPF, TRAILF = 20.0, 99.0, 8.0
RULE = (str(HOLD), "20", "99", "8")
WIN_H = 24
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def mkey(m):
    a, b = m.split("_")
    return (int(b), MON[a])


# ------------------------------------------------------- отбор по панелям движка
ideas_by_m = defaultdict(lambda: defaultdict(int))
mon = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
cells = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
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
want = defaultdict(set)
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
            want[tm].add(a)
print(f"правило {RULE}, топ-{K}, порог {MIN_IDEAS}: месяцев с отбором {len(want)}",
      flush=True)


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


# ------------------------------------------------------- пороги по распределению
tasks = defaultdict(list)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        tasks[s].append(m)

# плотность считается по ленте ВСЕХ постов символа (включая NEUTRAL), как в precluster
tapes = {}
dens_all = []
for symbol in sorted(tasks):
    tape = []
    for m in sorted(tasks[symbol]):
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
    tape.sort()
    tapes[symbol] = ([t for t, _ in tape], tape)

def n_other(symbol, ts, author):
    ts_arr, tape = tapes[symbol]
    lo = bisect.bisect_left(ts_arr, ts - WIN_H * HOUR_MS)
    hi = bisect.bisect_left(ts_arr, ts)
    return sum(1 for i in range(lo, hi) if tape[i][1] != author)

# распределение плотности на всех торгуемых направленных идеях (после дедупа),
# те же 10 167, что в precluster/whoisearly
for symbol in sorted(tasks):
    st = Store(symbol)
    ded = []
    for m in sorted(tasks[symbol]):
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        try:
            fh = open(f)
        except FileNotFoundError:
            continue
        for line in fh:
            if f'"symbol":"{symbol}"' not in line:
                continue
            d = json.loads(line)
            if d["symbol"] != symbol or d["direction"] == "NEUTRAL":
                continue
            ded.append(d)
    ded.sort(key=lambda d: d["ts"])
    last = {}
    for d in ded:
        k = f'{d["author"]}:{d["direction"]}'
        if k in last and d["ts"] - last[k] < DEDUPE_MS:
            continue
        last[k] = d["ts"]
        e0 = (d["ts"] // MIN_MS) * MIN_MS + MIN_MS
        if st.profile_len(e0, HOLD) < HOLD:
            continue
        dens_all.append(n_other(symbol, d["ts"], d["author"]))

dens_all.sort()
P50 = dens_all[len(dens_all) // 2]
P67 = dens_all[int(len(dens_all) * 2 / 3)]
print(f"распределение плотности на {len(dens_all):,} идеях: "
      f"P50 = {P50}, P67 = {P67} чужих постов за {WIN_H} ч")
print(f"варианты: A без фильтра; B вход при n_other <= {P50 - 1} (медиана); "
      f"C вход при n_other <= {P67 - 1} (верхняя треть)", flush=True)
CUT = {"A": None, "B": P50, "C": P67}          # порог: вход, если n_other < CUT

# ------------------------------------------------------- один проход, три варианта
acc = {v: dict(n=0, sr=0.0, sl=0.0, sd=0.0, sd2=0.0, skipped=0) for v in CUT}
mine = defaultdict(float)
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
            busy = {v: -1 for v in CUT}
            for i in (x for x in ded if x["author"] == au):
                e0 = (i["ts"] // MIN_MS) * MIN_MS + MIN_MS
                dens = None
                todo = []
                for v, cut in CUT.items():
                    if e0 < busy[v]:
                        continue
                    if cut is not None:
                        if dens is None:
                            dens = n_other(symbol, i["ts"], au)
                        if dens >= cut:
                            acc[v]["skipped"] += 1
                            continue
                    todo.append(v)
                if not todo:
                    continue
                ln = st.profile_len(e0, HOLD)
                if ln == 0:
                    continue
                path = st.path(e0, ln)
                if not path:
                    continue
                d = 1 if i["direction"] == "LONG" else -1
                pr, xi = simulate(path, d, HOLD, LOCKF, STOPF, TRAILF)
                pl, _ = simulate(path, 1, HOLD, LOCKF, STOPF, TRAILF)
                for v in todo:
                    busy[v] = e0 + xi * MIN_MS + MIN_MS
                    a = acc[v]
                    a["n"] += 1; a["sr"] += pr; a["sl"] += pl
                    a["sd"] += pr - pl; a["sd2"] += (pr - pl) ** 2
                if "A" in todo:
                    mine[(month, symbol, au)] += pr
    print(f"  {symbol}: A={acc['A']['n']} сд., {time.time() - t0:.0f} с", flush=True)

# ------------------------------------------------------- сверка базлайна с движком
diff = worst = 0.0
checked = 0
for (m, s, a), v in mine.items():
    eng = cells[m].get((s, a))
    if eng is None:
        continue
    checked += 1
    diff += abs(v - eng[1])
    worst = max(worst, abs(v - eng[1]))
print(f"\nсверка базлайна A с движком: ячеек {checked}, "
      f"суммарное расхождение {diff:.4f} %, худшая {worst:.4f} %")

print(f"\n{'вариант':>8}{'порог':>7}{'сделок':>8}{'пропущено':>11}{'стратегия':>11}"
      f"{'в LONG':>9}{'лифт':>8}{'t':>7}")
for v, cut in CUT.items():
    a = acc[v]
    n = a["n"]
    if not n:
        continue
    t = 0.0
    if n > 1:
        var = (a["sd2"] - a["sd"] ** 2 / n) / (n - 1)
        if var > 0:
            t = (a["sd"] / n) / (var / n) ** 0.5
    lab = "нет" if cut is None else f"<{cut}"
    print(f"{v:>8}{lab:>7}{n:>8}{a['skipped']:>11}{a['sr'] / n:>+11.3f}"
          f"{a['sl'] / n:>+9.3f}{a['sd'] / n:>+8.3f}{t:>+7.2f}")
print("\nбазлайн A обязан воспроизвести фазу C: 264 сделки, лифт +1.493, t +2.28")
