"""Значимость самой оси холда: точечная оценка без разброса вводит в заблуждение."""
import math
from collections import defaultdict
D = "/data/backtests/_agent/phaseC/panel_nv/trades_real.tsv"
acc = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])   # hold -> n, sum, sum2, sumL, sum2L
for line in open(D):
    p = line.rstrip("\n").split("\t")
    h = int(p[3]); d = int(p[4]); pl = float(p[5]); ps = float(p[6])
    v = pl if d > 0 else ps
    q = acc[h]; q[0] += 1; q[1] += v; q[2] += v*v; q[3] += pl; q[4] += pl*pl
def stat(n, s, s2):
    m = s/n; var = (s2 - s*s/n)/(n-1); sd = math.sqrt(var); se = sd/math.sqrt(n)
    return m, sd, se, m/se
print(f"{'холд':>6}{'сделок':>8}{'на сделку':>11}{'ст.откл.':>10}{'ст.ошибка':>11}{'t':>7}"
      f"{'на сутки':>11}{'t сутки':>9}")
for h in sorted(acc):
    n, s, s2, sl, s2l = acc[h]
    m, sd, se, t = stat(n, s, s2)
    d = h/1440
    print(f"{h//1440:>4}сут{n:>8}{m:>+11.3f}{sd:>10.2f}{se:>11.3f}{t:>+7.2f}"
          f"{m/d:>+11.4f}{t:>+9.2f}")
print()
print("тот же расчёт для «та же сделка в LONG»:")
for h in sorted(acc):
    n, s, s2, sl, s2l = acc[h]
    m, sd, se, t = stat(n, sl, s2l)
    print(f"{h//1440:>4}сут{n:>8}{m:>+11.3f}{sd:>10.2f}{se:>11.3f}{t:>+7.2f}")
