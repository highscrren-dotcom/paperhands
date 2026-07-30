"""Вторая половина упрощения: трейл 100 на ШОРТАХ.
armLevel для шорта = entryFill/2, то есть трейлинг взводится, когда цена вдвое ниже входа
(шорт в плюсе на ~50 %). После взвода выход по возврату к 2*peak. Модель «досидеть до
конца» этого не делает. Считаем, скольких сделок это МОЖЕТ касаться (у скольких шорт-нога
дала больше +50 %) — верхняя граница, а не факт: движок смотрит фитили внутри окна."""
from collections import defaultdict
D = "/data/backtests/_agent/phaseC/panel_nv/trades_real.tsv"
n = defaultdict(int); cand_s = defaultdict(int); cand_own = defaultdict(int)
for line in open(D):
    p = line.rstrip("\n").split("\t")
    h = int(p[3]); d = int(p[4]); ps = float(p[6])
    n[h] += 1
    if ps > 50: cand_s[h] += 1
    if d < 0 and ps > 50: cand_own[h] += 1
print(f"{'холд':>6}{'сделок':>9}{'шорт-нога >+50 %':>19}{'из них свои шорты':>20}")
for h in sorted(n):
    print(f"{h//1440:>4}сут{n[h]:>9}{cand_s[h]:>19}{cand_own[h]:>20}")
