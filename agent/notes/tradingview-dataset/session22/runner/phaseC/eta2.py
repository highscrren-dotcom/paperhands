"""Срок по РАЗМЕРУ задачи, а не по средней.

Мелкая задача стоит на идею в разы дороже крупной: у крупного тикеро-месяца окна идей
перекрываются и свечи ложатся в страничный кэш, у мелкого каждая свеча читается заново.
Оставшийся хвост — сплошь мелкие задачи, поэтому средняя по прогону тут врёт."""
import glob, os, re, json
C = "/data/backtests/_agent/phaseC"
pat = re.compile(r"task (\S+) (\S+) ideas=(\d+) rc=(\d+) sec=(\d+)")
by = {}
for f in glob.glob(f"{C}/logs/w*_c.log"):
    for line in open(f):
        m = pat.search(line)
        if m and m.group(4) == "0":
            by[(m.group(1), m.group(2))] = (int(m.group(3)), int(m.group(5)))
bands = [(1, 3), (4, 6), (7, 12), (13, 30), (31, 80), (81, 10**9)]
print(f"{'идей в задаче':>16}{'задач':>8}{'ср. сек':>10}{'сек/идея':>11}")
cost = {}
for lo, hi in bands:
    g = [(i, s) for (i, s) in by.values() if lo <= i <= hi]
    if not g: continue
    si = sum(i for i, _ in g); ss = sum(s for _, s in g)
    cost[(lo, hi)] = ss / len(g)
    lab = f"{lo}-{hi}" if hi < 10**9 else f"{lo}+"
    print(f"{lab:>16}{len(g):>8}{ss/len(g):>10.0f}{ss/si:>11.1f}")
done = {os.path.basename(x)[5:-7] for x in glob.glob(f"{C}/out_c/done_*.json")}
left = []
for sh in glob.glob(f"{C}/shard_*.tsv"):
    for line in open(sh):
        m, s, k = line.rstrip("\n").split("\t")
        if f"{m}_{s}" not in done:
            left.append(int(k))
tot = 0.0
for k in left:
    for (lo, hi), c in cost.items():
        if lo <= k <= hi:
            tot += c
            break
print(f"\nосталось {len(left)} задач, {sum(left)} идей, распределение размеров:")
for lo, hi in bands:
    n = sum(1 for k in left if lo <= k <= hi)
    if n: print(f"  {lo}-{hi if hi < 10**9 else '+'}: {n} задач")
print(f"\nоценка по стоимости РАЗМЕРА: {tot:.0f} машино-секунд / 3 воркера = {tot/3/3600:.1f} ч")
