"""Сколько сделок в контролях уходят ниже уровня, где движок бы выбил по стопу 99.

В углу «стоп 99» стоп ФОРМАЛЬНО есть: для лонга он на 0.01 от входа, для шорта на 1.99 —
то есть шорт на утроившейся цене движок выбивает примерно на -99.4 %, а моя модель
«досидеть до конца» досиживает и показывает -205 %. Надо знать, сколько таких строк и
как они двигают выводы."""
from collections import defaultdict
D = "/data/backtests/_agent/phaseC/panel_nv/trades_real.tsv"
FLOOR = -99.4
n = defaultdict(int); bad_own = defaultdict(int); bad_l = defaultdict(int); bad_s = defaultdict(int)
sum_own = defaultdict(float); sum_own_cap = defaultdict(float)
for line in open(D):
    p = line.rstrip("\n").split("\t")
    h = int(p[3]); d = int(p[4]); pl = float(p[5]); ps = float(p[6])
    own = pl if d > 0 else ps
    n[h] += 1
    if own < FLOOR: bad_own[h] += 1
    if pl < FLOOR: bad_l[h] += 1
    if ps < FLOOR: bad_s[h] += 1
    sum_own[h] += own
    sum_own_cap[h] += max(own, FLOOR)
print(f"{'холд':>6}{'сделок':>9}{'ниже -99.4 своих':>18}{'в лонг':>9}{'в шорт':>9}"
      f"{'ср. как есть':>14}{'ср. с полом':>13}")
for h in sorted(n):
    print(f"{h//1440:>4}сут{n[h]:>9}{bad_own[h]:>18}{bad_l[h]:>9}{bad_s[h]:>9}"
          f"{sum_own[h]/n[h]:>+14.3f}{sum_own_cap[h]/n[h]:>+13.3f}")
