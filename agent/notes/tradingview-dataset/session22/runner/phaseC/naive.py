#!/usr/bin/env python3
"""Контроли фазы C: угол «просто досидеть до конца холда», посчитанный ВНЕ движка.

Зачем не движком. Время прогона держит не сетка, а построение профилей: каждой идее
читается 38 880 поминутных JSON-файлов. Прогнать три контроля движком — это ещё
три раза по ~15 часов. Но у угла «лок 0 / трейл 100 / стоп 99» выход всегда один —
конец окна холда, и для него нужны ровно ДВЕ свечи на идею: открытие входной минуты и
закрытие последней. Поэтому контроли считаются здесь, а сверяются с движком по той же
точке сетки (она включена в GRID_C специально).

Считаются четыре варианта на одних и тех же входах:
  real        — направление автора как есть;
  longonly    — то же самое, но всё LONG (бета-контроль: «просто был в лонге тогда же»);
  placebo_dir — направления перемешаны детерминированной перестановкой (доля LONG та же);
  placebo_ts  — вход сдвинут на детерминированные ±(1..30) суток, направление своё.

Повторяется вся предобработка движка (ClientSweep.RUN_FN):
  фильтр по символу -> сортировка по ts -> отброс NEUTRAL -> DEDUPE 8 ч на автора+сторону
  -> слот на автора (идея внутри своей же открытой позиции пропускается)
  -> вход по открытию минуты ПОСЛЕ публикации, слиппедж в цене входа и выхода,
     комиссия 2 x CC_PERCENT_FEE.
Обрезка профиля тоже как в движке: свечи читаются чанками по 1000 минут, первый
неполный чанк = конец истории (ClientSweep.ITERATE_CANDLES_FN), профиль обрезается по
границе последнего полного чанка.

Выход: panel_nv/trdnv_<вариант>.tsv и panel_nv/autnv_<вариант>.tsv в формате панелей
фазы A/B (правило пишется как 0/99/100, чтобы строка сравнивалась с движком дословно),
плюс отчёт по обрезке профилей.
"""
import json, os, sys, time
from array import array
from collections import defaultdict

ROOT = "/data/backtests/dataset-master/content"
CROOT = "/data/backtests/_agent/phaseC"
UNION = f"{CROOT}/union"
OUT = f"{CROOT}/panel_nv"
TASKS = "/data/backtests/_agent/phaseA/tasks.tsv"
SKIP_SYMBOLS = {"HYPEUSDT"}          # делистнут с Binance spot, хвост докачать неоткуда

MIN_MS = 60_000
CHUNK = 1000                          # CC_MAX_CANDLES_PER_REQUEST
DEDUPE_MS = 8 * 60 * MIN_MS           # AUTHOR_DEDUPE_MINUTES
FEE = 0.1                             # CC_PERCENT_FEE, %
SLIP = 0.1                            # CC_PERCENT_SLIPPAGE, %
# ПОЛ СТОПА. В углу «стоп 99» стоп формально не выключен: уровень лонга 0.01 от входа,
# уровень шорта 1.99 — то есть шорт на утроившейся цене движок выбивает, а модель
# «досидеть до конца» досиживает и показывает -205 %. Сверка с движком на всём датасете
# (xcheck.py) вскрыла ровно это. Своих таких сделок 2-5 на холд, но в ШОРТ-колонке их
# 16-31, а перестановочный тест назначает шорты случайно — без пола нулевое распределение
# занижалось бы. Уровни выведены из SIMULATE_TRADE_FN, движок отдаёт ровно -99.399.
# Обратная половина (трейл 100 взводится на шорте при -50 % цены) затрагивает 2-5 сделок
# на холд, из них своих 0-1 — не моделируется, оговорено в отчёте.
FLOOR_L, FLOOR_S = -99.2, -99.399
HOLDS = [14 * 1440, 18 * 1440, 21 * 1440, 24 * 1440, 27 * 1440]
# placebo_ts сдвигает КАЖДУЮ идею на свой случайный срок — это ломает не только
# привязку к рынку, но и кучность постов (у автора они идут пачками) и вместе с ней
# работу слота: сделок становится больше, и контроль перестаёт быть сопоставимым.
# placebo_shift сдвигает ВЕСЬ тикеро-месяц одним общим смещением: дедуп, кучность и
# слоты сохраняются один в один, ломается ровно привязка входов к рынку. Это и есть
# правильная форма плацебо по времени; placebo_ts оставлен для сравнения.
VARIANTS = ["real", "longonly", "placebo_dir", "placebo_ts", "placebo_shift"]
SHIFT_DAYS = 30                       # плацебо по времени: сдвиг из ±(1..SHIFT_DAYS) суток


def rnd(x):
    """Детерминированный хеш (fmix32). Своё ГПСЧ — чтобы результат воспроизводился
    в точности при повторе; урок стенда news: случайность без фиксации не проверяется."""
    x &= 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x


# ---------------------------------------------------------------- склад свечей
class Store:
    """Поминутный склад одного символа: битовая карта наличия + префиксные суммы,
    чтобы «полон ли чанк из 1000 минут» стоило две операции, а не тысячу."""

    def __init__(self, symbol):
        self.symbol = symbol
        self.dir = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
        ts = []
        with os.scandir(self.dir) as it:
            for e in it:
                ts.append(int(e.name[:-5]))
        ts.sort()
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
        self.count = len(ts)

    def idx(self, ts):
        return (ts - self.lo) // MIN_MS

    def have(self, ts):
        i = self.idx(ts)
        return 0 <= i < self.n and self.pref[i + 1] - self.pref[i] == 1

    def profile_len(self, entry_ts, horizon):
        """Длина профиля по правилу движка: целые чанки по 1000 минут, первый
        неполный чанк обрывает историю."""
        got = 0
        while got < horizon:
            a = self.idx(entry_ts + got * MIN_MS)
            b = a + CHUNK
            if a < 0 or b > self.n or self.pref[b] - self.pref[a] != CHUNK:
                return got
            got += CHUNK
        return horizon

    def candle(self, ts):
        try:
            with open(f"{self.dir}/{ts}.json") as fh:
                return json.load(fh)
        except FileNotFoundError:
            return None


# ---------------------------------------------------------------- идеи
ONLY = sys.argv[1] if len(sys.argv) > 1 else None   # смоук на одном символе
if ONLY:
    OUT += f"_{ONLY}"

tasks = defaultdict(list)              # symbol -> [month, …]
for line in open(TASKS):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0 and s not in SKIP_SYMBOLS and (ONLY is None or s == ONLY):
        tasks[s].append(m)

os.makedirs(OUT, exist_ok=True)
fh_trd = {v: open(f"{OUT}/trdnv_{v}.tsv", "w") for v in VARIANTS}
fh_aut = {v: open(f"{OUT}/autnv_{v}.tsv", "w") for v in VARIANTS}
# ПОШТУЧНАЯ выгрузка сделок варианта real. Нужна для перестановочного теста: у real,
# longonly и placebo_dir набор сделок СОВПАДАЕТ до одной (в этом углу выход всегда по
# концу окна, поэтому слот автора не зависит от направления), значит направление можно
# честно перемешивать тысячу раз, а не один. Колонки: месяц, символ, автор, холд,
# сторона (1/-1), pnl в лонг, pnl в шорт по той же паре свечей.
fh_one = open(f"{OUT}/trades_real.tsv", "w")
RULE = "0\t99\t100"                     # лок 0, стоп 99, трейл 100 — «досидеть до конца»

stat = dict(ideas=0, dedup=0, trades=0, trunc=0, nocandle=0)
trunc_by_hold = defaultdict(int)
t_start = time.time()

for symbol in sorted(tasks):
    st = Store(symbol)
    print(f"{symbol}: склад {st.count:,} минуток "
          f"[{st.lo} … {st.hi}], собран за {time.time() - t_start:.0f} с", flush=True)
    for month in sorted(tasks[symbol]):
        f = f"{ROOT}/{month}/assets/tv-ideas.normalize.jsonl"
        try:
            raw = [json.loads(x) for x in open(f) if x.strip()]
        except FileNotFoundError:
            continue
        ideas = sorted((i for i in raw
                        if i["symbol"] == symbol and i["direction"] != "NEUTRAL"),
                       key=lambda i: i["ts"])
        stat["ideas"] += len(ideas)
        # DEDUPE_IDEAS_FN: на пару автор+сторона живёт первая идея восьмичасового окна
        last = {}
        ded = []
        for i in ideas:
            k = f'{i["author"]}:{i["direction"]}'
            if k in last and i["ts"] - last[k] < DEDUPE_MS:
                continue
            last[k] = i["ts"]
            ded.append(i)
        stat["dedup"] += len(ded)
        if not ded:
            continue

        # профили: вход, длина, цена входа
        prof = []
        for i in ded:
            e0 = (i["ts"] // MIN_MS) * MIN_MS + MIN_MS
            ln = st.profile_len(e0, max(HOLDS))
            if ln == 0:
                stat["nocandle"] += 1
                continue
            c0 = st.candle(e0)
            if c0 is None:
                stat["nocandle"] += 1
                continue
            prof.append((i, e0, ln, c0["open"]))
            if ln < max(HOLDS):
                stat["trunc"] += 1

        if not prof:
            continue
        # одно общее смещение на весь тикеро-месяц — для placebo_shift
        pkg_shift = rnd(prof[0][0]["id"] ^ 0x5BF03635)
        # перестановка направлений внутри тикеро-месяца: доля LONG сохраняется точно
        dirs = [p[0]["direction"] for p in prof]
        order = sorted(range(len(prof)), key=lambda k: rnd(prof[k][0]["id"] ^ 0x9E3779B9))
        perm = [None] * len(prof)
        for pos, k in enumerate(order):
            perm[k] = dirs[pos]

        for variant in VARIANTS:
            # slot на автора считается отдельно в каждом варианте: сдвиг времени и
            # смена стороны меняют, какая идея кем поглощается
            for hold in HOLDS:
                busy = {}
                # author -> сделок, pnl, плюсовых, pnl тех же сделок в LONG, плюсовых в LONG,
                # сумма парных разностей (pnl - pnlLONG) и сумма их квадратов — для t-статистики
                agg = defaultdict(lambda: [0, 0.0, 0, 0.0, 0, 0.0, 0.0])
                nid = defaultdict(int)                       # author -> идей (профилей)
                for k, (idea, e0, ln, open0) in enumerate(prof):
                    au = idea["author"]
                    nid[au] += 1
                    if variant == "longonly":
                        d = 1
                    elif variant == "placebo_dir":
                        d = 1 if perm[k] == "LONG" else -1
                    else:
                        d = 1 if idea["direction"] == "LONG" else -1
                    ent, length, price = e0, ln, open0
                    if variant in ("placebo_ts", "placebo_shift"):
                        # ts: своё смещение на каждую идею; shift: одно на весь пакет
                        h = rnd(idea["id"]) if variant == "placebo_ts" else pkg_shift
                        step = (h % SHIFT_DAYS) + 1
                        sign = 1 if (h >> 16) & 1 else -1
                        ent = e0 + sign * step * 1440 * MIN_MS
                        if not st.have(ent):
                            continue
                        c = st.candle(ent)
                        if c is None:
                            continue
                        price = c["open"]
                        length = st.profile_len(ent, max(HOLDS))
                        if length == 0:
                            continue
                    if ent < busy.get(au, -1):
                        continue                             # skippedBusy
                    exit_i = min(hold, length) - 1
                    ce = st.candle(ent + exit_i * MIN_MS)
                    if ce is None:
                        continue
                    entry_fill = price * (1 + d * SLIP / 100)
                    exit_fill = ce["close"] * (1 - d * SLIP / 100)
                    pnl = max(d * ((exit_fill - entry_fill) / entry_fill) * 100 - 2 * FEE,
                              FLOOR_L if d > 0 else FLOOR_S)
                    # парный бета-контроль: ТА ЖЕ сделка, но в лонг. Вход и выход те же,
                    # отбор авторов тот же — разница ровно в направлении, и только она.
                    ef_l = price * (1 + SLIP / 100)
                    xf_l = ce["close"] * (1 - SLIP / 100)
                    pnl_l = max(((xf_l - ef_l) / ef_l) * 100 - 2 * FEE, FLOOR_L)
                    if variant == "real":
                        ef_s = price * (1 - SLIP / 100)
                        xf_s = ce["close"] * (1 + SLIP / 100)
                        pnl_s = max(-((xf_s - ef_s) / ef_s) * 100 - 2 * FEE, FLOOR_S)
                        fh_one.write(f"{month}\t{symbol}\t{au}\t{hold}\t{d}"
                                     f"\t{pnl_l:.4f}\t{pnl_s:.4f}\n")
                    q = agg[au]
                    q[0] += 1
                    q[1] += pnl
                    if pnl > 0:
                        q[2] += 1
                    q[3] += pnl_l
                    if pnl_l > 0:
                        q[4] += 1
                    q[5] += pnl - pnl_l
                    q[6] += (pnl - pnl_l) ** 2
                    busy[au] = ent + exit_i * MIN_MS + MIN_MS
                    if variant == "real" and hold == HOLDS[0]:
                        stat["trades"] += 1
                    if min(hold, length) < hold:
                        trunc_by_hold[(variant, hold)] += 1
                head = f"{month}\t{symbol}\t{hold}\t{RULE}"
                for au, q in agg.items():
                    fh_trd[variant].write(f"{head}\t{au}\t{q[0]}\t{q[1]:.4f}\t{q[2]}"
                                          f"\t{q[3]:.4f}\t{q[4]}\t{q[5]:.4f}\t{q[6]:.4f}\n")
                for au, c in nid.items():
                    fh_aut[variant].write(f"{head}\t{au}\t{c}\t0\n")

for v in VARIANTS:
    fh_trd[v].close()
    fh_aut[v].close()
fh_one.close()

print(f"\nидей направленных {stat['ideas']:,}, после дедупа {stat['dedup']:,}, "
      f"без свечей {stat['nocandle']:,}, обрезанных профилей {stat['trunc']:,}")
print(f"сделок real@14сут {stat['trades']:,}, всего {time.time() - t_start:.0f} с")
print("\nобрезанных сделок по вариантам и холду:")
for (v, h), n in sorted(trunc_by_hold.items()):
    print(f"  {v:<12} {h // 1440:>3} сут: {n:,}")
print(f"\nпанели: {OUT}/trdnv_*.tsv, {OUT}/autnv_*.tsv")
