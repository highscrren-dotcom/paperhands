#!/usr/bin/env python3
"""Этап 4б фазы D: шаблонны ли заголовки внутри кластера постов — метод автора
(KNN по косинусной близости, как в присланной им статье), вектора — TF char-3-граммы.

Ollama на CT101 остановлен (вместо него vLLM с чат-моделью, эмбеддингов не отдаёт),
поэтому вектора считаются локально: мешок символьных 3-грамм, L2-норма, косинус.
Для вопроса «боты ли это» литеральная близость острее семантической: бот-шаблон —
это одна строка с подстановками, парафразы нас не интересуют.

Вопрос (из плана фазы D): заголовки ВНУТРИ кластера ближе друг к другу, чем к
случайной выборке той же эпохи? Сравниваются только пары РАЗНЫХ авторов — свою
собственную шаблонность (один автор постит одинаково) координацией не считаем.

Нуль: для кластера из m постов — NDRAW выборок m случайных постов того же символа
в +-60 сут от кластера, той же метрикой. p = доля выборок со средним косинусом >=
настоящего.

Дополнительно: прямые почти-дубли (cos >= 0.8) между разными авторами внутри
кластеров — список пар аккаунтов по числу дублей. Это и есть ответ «кто постит».

usage: titlesim.py [K] [W_часов] [ndraw]
"""
import bisect, json, math, random, sys, time
from collections import defaultdict

K = int(sys.argv[1]) if len(sys.argv) > 1 else 3
W_H = int(sys.argv[2]) if len(sys.argv) > 2 else 6
NDRAW = int(sys.argv[3]) if len(sys.argv) > 3 else 30
ROOT = "/data/backtests/dataset-master/content"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
EPOCH_D = 60
DUP_COS = 0.8


def rnd(x):
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


def vec(title):
    s = " " + " ".join(title.lower().split()) + " "
    v = defaultdict(int)
    for i in range(len(s) - 2):
        v[s[i:i + 3]] += 1
    norm = math.sqrt(sum(c * c for c in v.values()))
    return {g: c / norm for g, c in v.items()} if norm else {}


def cos(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(w * b[g] for g, w in a.items() if g in b)


months = defaultdict(set)
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS:
        months[s].add(m)

posts = {}                      # symbol -> sorted [(ts, author, vec)]
t0 = time.time()
for symbol in sorted(months):
    rows = []
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
            rows.append((d["ts"], d["author"], vec(d.get("title") or "")))
    rows.sort(key=lambda r: r[0])
    posts[symbol] = rows
    print(f"  {symbol}: {len(rows)} постов, {time.time() - t0:.0f} с", flush=True)


def mean_cross_cos(rows):
    """Средний косинус по парам РАЗНЫХ авторов. None, если таких пар нет."""
    s = 0.0
    n = 0
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if rows[i][1] == rows[j][1]:
                continue
            s += cos(rows[i][2], rows[j][2])
            n += 1
    return (s / n, n) if n else (None, 0)


print(f"\nкластер: >= {K} постов за {W_H} ч; нуль: {NDRAW} выборок той же эпохи "
      f"(+-{EPOCH_D} сут); пары только разных авторов")
n_cl = n_ok = n_sig = 0
dups = defaultdict(int)         # (author_a, author_b) -> почти-дублей
dup_examples = []
sims = []
for symbol in sorted(posts):
    rows = posts[symbol]
    ts_arr = [r[0] for r in rows]
    W_ms = W_H * HOUR_MS
    i = 0
    while i < len(rows):
        t0c = ts_arr[i]
        j = bisect.bisect_right(ts_arr, t0c + W_ms, i)
        if j - i < K:
            i += 1
            continue
        cl = rows[i:j]
        i = j
        n_cl += 1
        real, npairs = mean_cross_cos(cl)
        if real is None:
            continue
        # почти-дубли внутри кластера
        for a in range(len(cl)):
            for b in range(a + 1, len(cl)):
                if cl[a][1] == cl[b][1]:
                    continue
                c = cos(cl[a][2], cl[b][2])
                if c >= DUP_COS:
                    pair = tuple(sorted((cl[a][1], cl[b][1])))
                    dups[pair] += 1
                    if len(dup_examples) < 12:
                        dup_examples.append((symbol, t0c, pair, c))
        # нуль той же эпохи
        lo = bisect.bisect_left(ts_arr, t0c - EPOCH_D * DAY_MS)
        hi = bisect.bisect_right(ts_arr, t0c + EPOCH_D * DAY_MS)
        pool = list(range(lo, hi))
        if len(pool) < len(cl) * 2:
            continue
        n_ok += 1
        m = len(cl)
        worse = 0
        rng = random.Random(t0c * 1000003 + K * 31 + W_H)
        for sdr in range(NDRAW):
            idxs = rng.sample(pool, m)
            null, _ = mean_cross_cos([rows[ix] for ix in idxs])
            if null is not None and null >= real:
                worse += 1
        p = (worse + 1) / (NDRAW + 1)
        sims.append((real, p))
        if p <= 1 / (NDRAW + 1):
            n_sig += 1

share = 100 * n_sig / n_ok if n_ok else 0
print(f"\nкластеров {n_cl}, с нулём {n_ok}; шаблонных (p минимально возможное, "
      f"т.е. все {NDRAW} выборок хуже): {n_sig} = {share:.1f} % (нуль дал бы "
      f"~{100 / (NDRAW + 1):.1f} %)")
if sims:
    sims.sort(key=lambda s: s[0])
    print(f"медианный внутрикластерный косинус {sims[len(sims) // 2][0]:.3f}")

print(f"\nпары РАЗНЫХ аккаунтов с почти-дублями заголовков (cos >= {DUP_COS}) "
      f"внутри кластеров:")
top = sorted(dups.items(), key=lambda kv: -kv[1])[:20]
for (a, b), c in top:
    print(f"  {a} <-> {b}: {c}")
print(f"\nпримеры (первые {len(dup_examples)}):")
for symbol, ts, pair, c in dup_examples:
    g = time.gmtime(ts / 1000)
    print(f"  {symbol} {g.tm_year}-{g.tm_mon:02d}-{g.tm_mday:02d} "
          f"{pair[0]} <-> {pair[1]} cos={c:.2f}")
print(f"\nготово за {time.time() - t0:.0f} с")
