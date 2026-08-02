#!/usr/bin/env python3
"""Этап 0б: тот же бэктест сигналов йоды, но в ФЬЮЧЕРСНОМ исполнении (вопрос
владельца: «а если посчитать фьючи?»).

Три сценария поверх той же симуляции (свечи из кэша yodaback.py):
  A. СПОТ только ЛОНГИ — что физически может риг Петра (его брокер — Binance spot,
     шорт на споте не открыть); шорты выброшены.
  B. ФЬЮЧИ с плечом ИЗ СИГНАЛА (где не указано — X1).
  C. ФЬЮЧИ с плечом X25 — дефолт канала (в его же сигналах SOL/PENGU стоит X25,
     и его рапорты сходятся только при таком плече).

Учитывается ЛИКВИДАЦИЯ: при изолированной марже и плече L позиция умирает на
движении против примерно (100/L - MAINT)%, где MAINT ~0.5% (поддерживающая маржа
Binance USDⓈ-M для мелких позиций). Если стоп канала ДАЛЬШЕ ликвидации —
реальный результат не «стоп», а −100% маржи.

Funding учитывается грубо: FUNDING_DAY% в сутки удержания (типовые 0.01% каждые
8 ч на спокойном рынке); на фоне остальных чисел это шум, но пусть будет.

usage: yodafut.py
"""
import json, os, re, time, urllib.request, urllib.error
from collections import Counter

STORE = "/data/backtests/_agent/feed/tg/stores/crypto_yoda_channel.jsonl"
CACHE = "/data/backtests/_agent/yoda/candles"
HOLD_D, ENTRY_WAIT_H = 7, 24
FEE_ROUND = 0.4
MAINT = 0.5
FUNDING_DAY = 0.03
TF_MS = 5 * 60_000
DEFAULT_LEV = 25

exec(open("/data/backtests/_agent/yoda/yodaback.py").read().split("rows = [json.loads")[0]
     .replace('print(f"распознано', '# print(f"распознано'))


def sim(sig, lev_mode):
    sym = f"{sig['coin']}USDT"
    start = sig["ts"]
    end = start + (ENTRY_WAIT_H * 3600 + HOLD_D * 86400) * 1000
    kl = fetch_klines(sym, start, min(end, int(time.time() * 1000)))
    if not kl:
        return None
    d = 1 if sig["direction"] == "long" else -1
    entry = sig["hi"] if d > 0 else sig["lo"]
    lev = sig["lev"] if lev_mode == "signal" else DEFAULT_LEV
    liq_move = 100.0 / lev - MAINT if lev > 1 else 1e9      # % против входа
    wait_until = start + ENTRY_WAIT_H * 3600 * 1000
    ei = None
    for i, (ts, o, h, l, c) in enumerate(kl):
        if ts > wait_until:
            break
        if l <= sig["hi"] and h >= sig["lo"]:
            ei = i
            break
    if ei is None:
        return None
    tp1, stop = sig["targets"][0], sig["stop"]
    liq_price = entry * (1 - d * liq_move / 100)
    exit_ts = kl[ei][0] + HOLD_D * 86400 * 1000
    outcome, px, hold_ms = "окно", kl[-1][4], kl[-1][0] - kl[ei][0]
    for ts, o, h, l, c in kl[ei:]:
        if ts > exit_ts:
            break
        hit_liq = (l <= liq_price) if d > 0 else (h >= liq_price)
        hit_sl = (l <= stop) if d > 0 else (h >= stop)
        hit_tp = (h >= tp1) if d > 0 else (l <= tp1)
        # порядок пессимистичный: сначала смерть, потом прибыль
        if hit_liq and liq_move < abs((stop - entry) / entry * 100):
            outcome, px, hold_ms = "ЛИКВИДАЦИЯ", liq_price, ts - kl[ei][0]
            break
        if hit_sl and hit_tp:
            outcome, px, hold_ms = "стоп(спорн)", stop, ts - kl[ei][0]
            break
        if hit_sl:
            outcome, px, hold_ms = "стоп", stop, ts - kl[ei][0]
            break
        if hit_tp:
            outcome, px, hold_ms = "цель", tp1, ts - kl[ei][0]
            break
        px = c
    move = d * (px - entry) / entry * 100
    days = max(hold_ms / 86400000, 0.01)
    if outcome == "ЛИКВИДАЦИЯ":
        pnl = -100.0
    else:
        pnl = move * lev - FEE_ROUND * lev - (FUNDING_DAY * days * lev if lev > 1 else 0)
        pnl = max(pnl, -100.0)
    return dict(outcome=outcome, pnl=pnl, lev=lev, move=move, days=days,
                direction=sig["direction"])


rows = [json.loads(l) for l in open(STORE)]
rows.sort(key=lambda r: r["ts"])
signals = []
for r in rows:
    s = parse_signal(r["text"] or "")
    if s:
        s["ts"] = r["ts"]
        signals.append(s)

DEP_RE = re.compile(r"(\d+)%\s*депозита")
for r in rows:
    s = parse_signal(r["text"] or "")
    if s:
        m = DEP_RE.search(r["text"])
        for x in signals:
            if x["ts"] == r["ts"]:
                x["size"] = int(m.group(1)) if m else 5

print(f"сигналов: {len(signals)} | лонгов "
      f"{sum(1 for s in signals if s['direction']=='long')}, шортов "
      f"{sum(1 for s in signals if s['direction']=='short')}")
print(f"ликвидация: движение против ~(100/плечо − {MAINT})%, funding {FUNDING_DAY}%/сут\n")


def report(title, rs):
    if not rs:
        print(f"{title}: сделок нет")
        return
    pn = [r["pnl"] for r in rs]
    wins = sum(1 for x in pn if x > 0)
    liq = sum(1 for r in rs if r["outcome"] == "ЛИКВИДАЦИЯ")
    print(f"{title}")
    print(f"  сделок {len(pn)} | сумма {sum(pn):+8.1f}% | на сделку {sum(pn)/len(pn):+7.2f}% | "
          f"винрейт {100*wins/len(pn):3.0f}% | ликвидаций {liq}")
    print(f"  лучшая {max(pn):+7.2f} | худшая {min(pn):+7.2f} | "
          f"статусы {dict(Counter(r['outcome'] for r in rs))}")


# A. спот, только лонги
a = [sim(s, "signal") for s in signals if s["direction"] == "long"]
a = [r for r in a if r]
for r in a:
    r["pnl"] = r["move"] - FEE_ROUND        # спот: без плеча и funding
report("A. СПОТ, ТОЛЬКО ЛОНГИ (что реально может риг Петра — брокер спотовый)", a)
print()

# B. фьючи, плечо из сигнала
b = [r for r in (sim(s, "signal") for s in signals) if r]
report("B. ФЬЮЧИ, плечо как указано в сигнале (X1 если не указано)", b)
print()

# C. фьючи, плечо X25 (дефолт канала)
c = [r for r in (sim(s, "fixed") for s in signals) if r]
report(f"C. ФЬЮЧИ, плечо X{DEFAULT_LEV} на всех сигналах (дефолт канала)", c)
print()

# разбивка C по сторонам
for side in ("long", "short"):
    report(f"   C/{side}", [r for r in c if r["direction"] == side])

print()
print("=" * 78)
print("ДЕПОЗИТ $50 ПО ПРАВИЛАМ САМОГО КАНАЛА (размер позиции = его же «N% депозита»)")
sizes = [s.get("size", 5) for s in signals]
print(f"размеры позиций из сигналов: {dict(Counter(sizes))}")
for label, series, lev_mode in (("B (плечо из сигнала)", b, "signal"),
                                (f"C (плечо X{DEFAULT_LEV})", c, "fixed")):
    cap = 50.0
    sized = [s for s in signals]
    k = 0
    for r in series:
        while k < len(sized) and sized[k].get("_used"):
            k += 1
        size = sized[k].get("size", 5) if k < len(sized) else 5
        if k < len(sized):
            sized[k]["_used"] = True
        cap *= (1 + (r["pnl"] / 100) * (size / 100))
    for s in signals:
        s.pop("_used", None)
    print(f"  {label}: $50 -> ${cap:.2f}  ({(cap/50-1)*100:+.1f}% за 3 недели)")
