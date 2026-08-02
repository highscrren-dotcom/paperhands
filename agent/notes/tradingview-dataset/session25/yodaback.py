#!/usr/bin/env python3
"""Этап 0 эксперимента ai-trading-mcp: бэктест сигналов канала @crypto_yoda_channel
на реальных свечах ДО постройки рига (доктрина backtest -> paper -> live).

ГЕЙТ ОБЪЯВЛЕН ДО ПРОГОНА (сессия 25, владельцу и Петру):
  - если спот-исполнение сигналов даёт минус ИЛИ
  - если заявленные каналом результаты не сходятся с фактом по свечам
  => риг на этом канале не строим.

Данные: наш TG-стор (52 поста, 11.07-01.08, собраны своим сборщиком, №146),
свечи — публичный Binance klines 5m (без ключей), кэш на диске.

Модель исполнения (консервативная, как считает сам канал):
  - вход ЛИМИТОМ в объявленный диапазон: ждём касания до ENTRY_WAIT_H часов;
    не коснулось -> сигнал не сработал (ни прибыли, ни убытка);
  - цена входа = дальний край диапазона (для лонга верхний, для шорта нижний) —
    так же, как канал считает свои проценты;
  - далее гонка: первая цель (ТП1) против СТОПа, максимум HOLD_D суток;
  - если в ОДНОЙ свече задеты и цель, и стоп — засчитываем СТОП (пессимизм);
  - не закрылось за окно -> выход по последней цене окна;
  - издержки 0.4% на круг (наш стандарт, как у движка).

СПОТ без плеча: канал торгует X5-X25, риг Петра — спот, поэтому основная
метрика — спотовый PnL. Плечевой эквивалент печатается только для сверки
с рапортами канала.

usage: yodaback.py [--hold 7] [--wait 24]
"""
import json, os, re, sys, time, urllib.request, urllib.error
from collections import Counter

STORE = "/data/backtests/_agent/feed/tg/stores/crypto_yoda_channel.jsonl"
CACHE = "/data/backtests/_agent/yoda/candles"
HOLD_D = 7
ENTRY_WAIT_H = 24
FEE_ROUND = 0.4          # % на круг (0.1 комиссия + 0.1 слиппедж) x2
TF_MS = 5 * 60_000       # 5m свечи

os.makedirs(CACHE, exist_ok=True)


# ------------------------------------------------------------------ свечи
def fetch_klines(symbol, start_ms, end_ms):
    """Публичный Binance klines 5m с кэшем по (symbol,start,end)."""
    key = f"{CACHE}/{symbol}_{start_ms}_{end_ms}.json"
    if os.path.exists(key):
        with open(key) as fh:
            return json.load(fh)
    out = []
    cur = start_ms
    while cur < end_ms:
        url = (f"https://api.binance.com/api/v3/klines?symbol={symbol}"
               f"&interval=5m&startTime={cur}&limit=1000")
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                batch = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 400:
                return None          # символа нет на Binance
            raise
        if not batch:
            break
        out.extend([[c[0], float(c[1]), float(c[2]), float(c[3]), float(c[4])] for c in batch])
        cur = batch[-1][0] + TF_MS
        if len(batch) < 1000:
            break
        time.sleep(0.15)
    with open(key, "w") as fh:
        json.dump(out, fh)
    return out


# ------------------------------------------------------------------ парсер
SIG_RE = re.compile(r"СИГНАЛ\s+#([A-Z0-9]+)/USDT", re.I)
REP_RE = re.compile(r"^#([A-Z0-9]+)/USDT", re.I | re.M)
DIR_RE = re.compile(r"Открыть\s+(ЛОНГ|ШОРТ)", re.I)
RANGE_RE = re.compile(r"диапазоне\s*\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)")
LEV_RE = re.compile(r"плечо\s*X(\d+)", re.I)
TARGET_RE = re.compile(r"Закрыть по\s*\$?([\d.]+)")
STOP_RE = re.compile(r"СТОП\s*ЛОСС:\s*\$?([\d.]+)", re.I)
RISK_RE = re.compile(r"Риск сигнала:\s*(\d+)/10")
PROFIT_RE = re.compile(r"Прибыль:\s*([\d.]+)%")
TP_HIT_RE = re.compile(r"Тейк-профит\s*(\d)\s*✅")
STOPHIT_RE = re.compile(r"(стоп[- ]?лосс|stop)\s*(сработал|❌|🔴)", re.I)


def parse_signal(t):
    m = SIG_RE.search(t)
    if not m:
        return None
    rng = RANGE_RE.search(t)
    stop = STOP_RE.search(t)
    tgts = [float(x) for x in TARGET_RE.findall(t)]
    if not rng or not stop or not tgts:
        return None
    lo, hi = sorted((float(rng.group(1)), float(rng.group(2))))
    d = DIR_RE.search(t)
    direction = "short" if (d and d.group(1).upper() == "ШОРТ") else "long"
    lev = LEV_RE.search(t)
    risk = RISK_RE.search(t)
    return dict(coin=m.group(1).upper(), direction=direction, lo=lo, hi=hi,
                targets=sorted(tgts) if direction == "long" else sorted(tgts, reverse=True),
                stop=float(stop.group(1)), lev=int(lev.group(1)) if lev else 1,
                risk=int(risk.group(1)) if risk else None)


rows = [json.loads(l) for l in open(STORE)]
rows.sort(key=lambda r: r["ts"])
signals, reports = [], []
for r in rows:
    t = r["text"] or ""
    s = parse_signal(t)
    if s:
        s["ts"] = r["ts"]
        s["id"] = r["id"]
        signals.append(s)
        continue
    if "Тейк-профит" in t or STOPHIT_RE.search(t):
        m = REP_RE.search(t)
        p = PROFIT_RE.search(t)
        tps = [int(x) for x in TP_HIT_RE.findall(t)]
        reports.append(dict(coin=m.group(1).upper() if m else None, ts=r["ts"],
                            profit=float(p.group(1)) if p else None,
                            tps=tps, stop=bool(STOPHIT_RE.search(t)), text=t[:80]))

print(f"распознано: сигналов {len(signals)}, отчётов {len(reports)}")
print(f"окно: {time.strftime('%d.%m', time.gmtime(rows[0]['ts']/1000))} .. "
      f"{time.strftime('%d.%m.%Y', time.gmtime(rows[-1]['ts']/1000))}")
print(f"модель: вход лимитом (ожидание {ENTRY_WAIT_H} ч), холд до {HOLD_D} сут, "
      f"издержки {FEE_ROUND}% на круг, СПОТ без плеча\n")


# ------------------------------------------------------------------ симуляция
def simulate(sig):
    sym = f"{sig['coin']}USDT"
    start = sig["ts"]
    end = start + (ENTRY_WAIT_H * 3600 + HOLD_D * 86400) * 1000
    kl = fetch_klines(sym, start, min(end, int(time.time() * 1000)))
    if kl is None:
        return dict(status="нет на Binance")
    if not kl:
        return dict(status="нет свечей")
    d = 1 if sig["direction"] == "long" else -1
    entry_price = sig["hi"] if d > 0 else sig["lo"]
    wait_until = start + ENTRY_WAIT_H * 3600 * 1000
    entry_i = None
    for i, (ts, o, h, l, c) in enumerate(kl):
        if ts > wait_until:
            break
        if l <= sig["hi"] and h >= sig["lo"]:      # свеча задела диапазон
            entry_i = i
            break
    if entry_i is None:
        return dict(status="вход не состоялся")
    tp1 = sig["targets"][0]
    stop = sig["stop"]
    exit_ts = kl[entry_i][0] + HOLD_D * 86400 * 1000
    outcome, exit_price = "окно кончилось", kl[-1][4]
    for ts, o, h, l, c in kl[entry_i:]:
        if ts > exit_ts:
            break
        hit_tp = (h >= tp1) if d > 0 else (l <= tp1)
        hit_sl = (l <= stop) if d > 0 else (h >= stop)
        if hit_tp and hit_sl:
            outcome, exit_price = "СТОП (спорная свеча)", stop
            break
        if hit_sl:
            outcome, exit_price = "стоп", stop
            break
        if hit_tp:
            outcome, exit_price = "цель 1", tp1
            break
        exit_price = c
    pnl = d * (exit_price - entry_price) / entry_price * 100 - FEE_ROUND
    return dict(status=outcome, entry=entry_price, exit=exit_price, pnl=pnl,
                pnl_lev=pnl * sig["lev"], lev=sig["lev"])


res = []
for s in signals:
    r = simulate(s)
    res.append((s, r))
    tag = f"{s['coin']:>10} {s['direction']:<5} X{s['lev']:<2}"
    if "pnl" in r:
        print(f"{time.strftime('%d.%m %H:%M', time.gmtime(s['ts']/1000))} {tag} "
              f"{r['status']:<20} спот {r['pnl']:+7.2f}%  (с плечом {r['pnl_lev']:+8.2f}%)")
    else:
        print(f"{time.strftime('%d.%m %H:%M', time.gmtime(s['ts']/1000))} {tag} {r['status']}")

traded = [(s, r) for s, r in res if "pnl" in r]
print()
print("=" * 78)
if traded:
    pn = [r["pnl"] for _, r in traded]
    print(f"СПОТ-ИТОГ: сделок {len(pn)}, сумма {sum(pn):+.2f}%, "
          f"на сделку {sum(pn)/len(pn):+.3f}%, лучший {max(pn):+.2f}, худший {min(pn):+.2f}")
    wins = sum(1 for x in pn if x > 0)
    print(f"винрейт {100*wins/len(pn):.0f}% ({wins}/{len(pn)})")
    lev = [r["pnl_lev"] for _, r in traded]
    print(f"С ПЛЕЧОМ КАНАЛА (как он сам считает): сумма {sum(lev):+.2f}%, "
          f"на сделку {sum(lev)/len(lev):+.2f}%")
print("статусы:", dict(Counter(r["status"] for _, r in res)))

# ------------------------------------------------------------------ сверка отчётов
print()
print("=" * 78)
print("СВЕРКА РАПОРТОВ КАНАЛА С ФАКТОМ")
rep_by_coin = Counter(r["coin"] for r in reports)
sig_by_coin = Counter(s["coin"] for s in signals)
print(f"сигналов {len(signals)} по {len(sig_by_coin)} монетам; "
      f"отчётов {len(reports)}, из них о стопе: {sum(1 for r in reports if r['stop'])}")
losers = [(s, r) for s, r in traded if r["status"].startswith(("стоп", "СТОП"))]
print(f"по свечам ушло в СТОП: {len(losers)} сигналов")
for s, r in losers:
    later = [x for x in reports if x["coin"] == s["coin"] and x["ts"] > s["ts"]]
    said = "ЕСТЬ отчёт" if later else "ОТЧЁТА НЕТ"
    print(f"  {s['coin']:>10} {time.strftime('%d.%m', time.gmtime(s['ts']/1000))} "
          f"{r['pnl']:+7.2f}% спот -> {said}")
print()
for rep in reports[:12]:
    src = [s for s in signals if s["coin"] == rep["coin"] and s["ts"] < rep["ts"]]
    if not src or rep["profit"] is None:
        continue
    s = src[-1]
    d = 1 if s["direction"] == "long" else -1
    entry = s["hi"] if d > 0 else s["lo"]
    tp_idx = max(rep["tps"]) if rep["tps"] else 1
    tp = s["targets"][min(tp_idx, len(s["targets"])) - 1]
    calc = d * (tp - entry) / entry * 100 * s["lev"]
    print(f"{rep['coin']:>10} заявлено {rep['profit']:+7.2f}% | "
          f"пересчёт по его же уровням (ТП{tp_idx}, плечо X{s['lev']}) {calc:+7.2f}% | "
          f"спот-эквивалент {calc/s['lev']:+6.2f}%")
