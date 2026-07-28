#!/usr/bin/env python3
"""Поминутная проверка полноты объединённого склада под горизонт 27 суток.

Разведка recon27.py считала посуточно: сутки числились «есть», если существовала хотя бы
одна минутка. У Петра в крауле были дыры ВНУТРИ суток (по DECISIONS №129: SOL-2025 22 дня,
DOGE 18, ETH 1), и посуточный счёт их не видит. Здесь считаем именно минутки.

Дыра в кэше = движок пойдёт в сеть на каждом прогоне (докачанное он не сохраняет),
поэтому перед фазой C надо знать точное число недостающих минуток, а не суток.
"""
import json, os, sys, time
from collections import defaultdict

ROOT = "/data/backtests/dataset-master/content"
UNION = "/data/backtests/_agent/phaseC/union"
HOLD_MIN = 27 * 1440
MIN_MS = 60_000
now_ms = int(time.time() * 1000)

tasks = defaultdict(list)
for line in open("/data/backtests/_agent/phaseA/tasks.tsv"):
    m, s, n = line.rstrip("\n").split("\t")
    if int(n) > 0:
        tasks[s].append(m)

print(f"{'символ':<12}{'нужно минут':>14}{'есть':>14}{'дыр':>12}{'дыр в прошлом':>16}")
grand = grand_past = 0
detail = {}
for symbol in sorted(tasks):
    d = f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
    if not os.path.isdir(d):
        print(f"{symbol:<12}{'склада нет':>14}")
        continue
    have = set()
    with os.scandir(d) as it:
        for e in it:
            have.add(int(e.name[:-5]))

    need = set()
    for m in tasks[symbol]:
        f = f"{ROOT}/{m}/assets/tv-ideas.normalize.jsonl"
        try:
            fh = open(f)
        except FileNotFoundError:
            continue
        for line in fh:
            if f'"symbol":"{symbol}"' not in line or '"direction":"NEUTRAL"' in line:
                continue
            ts = json.loads(line)["ts"]
            e0 = (ts // MIN_MS + 1) * MIN_MS          # вход — минута ПОСЛЕ публикации
            need |= set(range(e0, e0 + HOLD_MIN * MIN_MS, MIN_MS))
    miss = need - have
    past = {x for x in miss if x < now_ms}
    grand += len(miss)
    grand_past += len(past)
    detail[symbol] = sorted(past)
    print(f"{symbol:<12}{len(need):>14,}{len(have & need):>14,}{len(miss):>12,}{len(past):>16,}")

print(f"\nВСЕГО дыр: {grand:,}, из них в прошлом (докачиваемы): {grand_past:,}")
print(f"Запросов к Binance по 1000 свечей: ~{grand_past // 1000 + len(detail)}")
with open("/data/backtests/_agent/phaseC/missing_minutes.json", "w") as fh:
    json.dump({k: v for k, v in detail.items() if v}, fh)
print("Список дыр записан: /data/backtests/_agent/phaseC/missing_minutes.json")
