"""Срок хвоста: линейная подгонка «накладные + цена идеи» по МЕЛКИМ задачам.

Таблица по бэндам молча теряла задачи тех размеров, которых ещё не считали, и давала
0.9 ч вместо реальных часов. Здесь модель sec = a + b*ideas подгоняется по задачам
<= 12 идей (хвост состоит именно из таких) методом наименьших квадратов, и по ней
считается остаток. Плюс печатается диапазон, а не одно число."""
import glob, os, re
C = "/data/backtests/_agent/phaseC"
pat = re.compile(r"task (\S+) (\S+) ideas=(\d+) rc=(\d+) sec=(\d+)")
pts = []
for f in glob.glob(f"{C}/logs/w*_c.log"):
    for line in open(f):
        m = pat.search(line)
        if m and m.group(4) == "0":
            i, s = int(m.group(3)), int(m.group(5))
            if i <= 12:
                pts.append((i, s))
n = len(pts)
sx = sum(i for i, _ in pts); sy = sum(s for _, s in pts)
sxx = sum(i * i for i, _ in pts); sxy = sum(i * s for i, s in pts)
b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
a = (sy - b * sx) / n
print(f"подгонка по {n} задачам <= 12 идей: sec = {a:.0f} + {b:.0f} * идей")
print(f"  проверка: 2 идеи -> {a+2*b:.0f} с, 5 идей -> {a+5*b:.0f} с, 10 -> {a+10*b:.0f} с")
done = {os.path.basename(x)[5:-7] for x in glob.glob(f"{C}/out_c/done_*.json")}
left = []
for sh in glob.glob(f"{C}/shard_*.tsv"):
    for line in open(sh):
        mm, s, k = line.rstrip("\n").split("\t")
        if f"{mm}_{s}" not in done:
            left.append(int(k))
tot = sum(a + b * k for k in left)
print(f"\nосталось {len(left)} задач / {sum(left)} идей")
print(f"оценка: {tot:.0f} машино-секунд / 3 воркера = {tot/3/3600:.1f} ч")
print(f"вилка (накладные +-30 %): {tot*0.7/3/3600:.1f} .. {tot*1.3/3/3600:.1f} ч")
