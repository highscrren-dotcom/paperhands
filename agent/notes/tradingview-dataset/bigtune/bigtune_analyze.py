#!/usr/bin/env python3
"""Агрегат big-tune (№116): по-парная таблица + общая статистика real vs placebo.
Usage: bigtune_analyze.py bigtune-result.json"""
import json, sys
from math import comb

d = json.load(open(sys.argv[1]))
rows = d["rows"]
done = [r for r in rows if r.get("real")]
skipped = [r for r in rows if r.get("skipped")]
errors = [r for r in rows if r.get("error")]

def med(xs):
    s = sorted(xs)
    n = len(s)
    return None if not n else (s[n//2] if n % 2 else (s[n//2-1]+s[n//2])/2)

real_pnls = [r["real"]["pnl"] for r in done]
real_trades = [r["real"]["trades"] for r in done]
plac_pnls = [p["pnl"] for r in done for p in r["placebo"]]
wins = sum(1 for r in done if r["realBeatsMedian"])
n = len(done)
# знаковый тест: H0 P(real>placeboMed)=0.5
p_sign = sum(comb(n, k) for k in range(wins, n+1)) / 2**n if n else None

pos = sum(1 for x in real_pnls if x > 0)
zero_trades = sum(1 for t in real_trades if t == 0)

print(f"пар оценено: {n} (скип: {len(skipped)}, ошибок: {len(errors)}) из {len(rows)}")
print(f"real:    медиана PnL {med(real_pnls):+.2f}% | в плюсе {pos}/{n} | медиана сделок {med(real_trades)} | пар с 0 сделок {zero_trades}")
print(f"placebo: медиана PnL {med(plac_pnls):+.2f}% (пул {len(plac_pnls)} прогонов)")
print(f"real бьёт медиану placebo: {wins}/{n} (знаковый тест p={p_sign:.3f})")
print()
print("Хвосты (top-3 / bottom-3 пар по real PnL):")
for r in sorted(done, key=lambda r: -r["real"]["pnl"])[:3]:
    print(f"  + {r['pair']}: real {r['real']['pnl']:+.2f}% ({r['real']['trades']}тр), placeboMed {r['placeboMedian']:+.2f}%")
for r in sorted(done, key=lambda r: r["real"]["pnl"])[:3]:
    print(f"  - {r['pair']}: real {r['real']['pnl']:+.2f}% ({r['real']['trades']}тр), placeboMed {r['placeboMedian']:+.2f}%")
print()
print("По годам (медиана real PnL):")
for y in ("2022","2023","2024","2025","2026"):
    ys = [r["real"]["pnl"] for r in done if r["pair"].startswith(y)]
    if ys: print(f"  {y}: {med(ys):+.2f}% ({len(ys)} пар)")
