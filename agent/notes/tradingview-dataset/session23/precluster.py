#!/usr/bin/env python3
"""Предпосылка гипотезы автора: есть ли ВСПЛЕСК постов ПЕРЕД постом автора.

Гипотеза (Пётр, 28.07): «они загоняют толпу в монету» — сначала постят боты, потом сам
автор, чтобы обмануть алгоритм рекомендаций. Отсюда и найденный в фазе C факт, что вход
за неделю ДО публикации бьёт публикацию в 100 случаях из 100: пост стоит в конце движения.

Кластеризация постов по тексту (KNN, на что автор и дал ссылку) — второй шаг. У гипотезы
есть предпосылка, которую видно на голых временных метках и без единого вектора:
если координация есть, то перед постом на том же символе должна быть аномальная
плотность чужих постов. Если её нет — строить эмбеддинги незачем.

Мерим три вещи:
  1. распределение плотности чужих постов в окнах перед идеей;
  2. доходность идеи по бакетам этой плотности (наивная модель фазы C: две свечи);
  3. то же по «перформящим» авторам отдельно — гипотеза именно про них.

usage: precluster.py [окно_часов ...]
"""
import json, os, sys, time
from array import array
from collections import defaultdict

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
WINDOWS = [int(x) for x in sys.argv[1:]] or [6, 24, 72, 168]


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

# ---- полная лента по символу: ВСЕ посты, включая NEUTRAL и повторы (это и есть «толпа»)
tape = defaultdict(list)                       # symbol -> [(ts, author, direction)]
seen_files = set()
for symbol, ms in months.items():
    for m in ms:
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        if (f, symbol) in seen_files:
            continue
        seen_files.add((f, symbol))
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
            tape[symbol].append((d["ts"], d["author"], d["direction"]))
for s in tape:
    tape[s].sort()

print(f"лента: {sum(len(v) for v in tape.values()):,} постов по {len(tape)} символам "
      f"(включая NEUTRAL и повторы одного автора)")

stat = defaultdict(lambda: [0, 0.0])           # (окно, бакет) -> сделок, pnl
dens_hist = defaultdict(lambda: defaultdict(int))
t0 = time.time()
rows = 0
for symbol in sorted(months):
    st = Store(symbol)
    tp = tape[symbol]
    ts_arr = [t for t, _, _ in tp]
    # торгуемые идеи: как в движке — направленные, дедуп 8 ч на автора+сторону
    last = {}
    ded = []
    for m in sorted(months[symbol]):
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        try:
            fh = open(f)
        except FileNotFoundError:
            continue
        for line in fh:
            if f'"symbol":"{symbol}"' not in line or '"direction":"NEUTRAL"' in line:
                continue
            d = json.loads(line)
            if d["symbol"] != symbol or d["direction"] == "NEUTRAL":
                continue
            ded.append(d)
    ded.sort(key=lambda d: d["ts"])
    keep = []
    for d in ded:
        k = f'{d["author"]}:{d["direction"]}'
        if k in last and d["ts"] - last[k] < DEDUPE_MS:
            continue
        last[k] = d["ts"]
        keep.append(d)

    import bisect
    for d in keep:
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
        rows += 1
        for w in WINDOWS:
            lo = bisect.bisect_left(ts_arr, d["ts"] - w * HOUR_MS)
            hi = bisect.bisect_left(ts_arr, d["ts"])
            n_other = sum(1 for i in range(lo, hi) if tp[i][1] != d["author"])
            dens_hist[w][min(n_other, 20)] += 1
            b = 0 if n_other == 0 else 1 if n_other <= 2 else 2 if n_other <= 5 else \
                3 if n_other <= 10 else 4
            q = stat[(w, b)]
            q[0] += 1
            q[1] += pnl
    print(f"  {symbol}: {rows} идей, {time.time() - t0:.0f} с", flush=True)

LAB = ["0 чужих", "1-2", "3-5", "6-10", "11+"]
print(f"\nторгуемых идей с полным окном холда 14 сут: {rows:,}")
for w in WINDOWS:
    print(f"\n=== окно {w} ч перед постом ===")
    tot = sum(dens_hist[w].values())
    z = dens_hist[w].get(0, 0)
    print(f"  идей, перед которыми ВООБЩЕ не было чужих постов: {z:,} ({100*z/tot:.1f} %)")
    print(f"  {'плотность':<12}{'идей':>8}{'доля':>8}{'PnL/сделку':>13}")
    for b, lab in enumerate(LAB):
        q = stat[(w, b)]
        if not q[0]:
            continue
        print(f"  {lab:<12}{q[0]:>8}{100*q[0]/rows:>7.1f}%{q[1]/q[0]:>+13.3f}")
