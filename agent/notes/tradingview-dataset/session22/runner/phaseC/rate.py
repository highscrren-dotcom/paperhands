"""Скорость по факту за последний час, а не в среднем по прогону.

Средняя по прогону обманывает: у крупного тикеро-месяца окна идей перекрываются и свечи
попадают в страничный кэш, у мелкого — нет, и каждая свеча читается с диска заново.
Поэтому хвост из мелких задач идёт в разы медленнее середины."""
import glob, os, re, json
from datetime import datetime, timedelta
C = "/data/backtests/_agent/phaseC"
pat = re.compile(r"task (\S+) (\S+) ideas=(\d+) rc=(\d+) sec=(\d+) (\d\d:\d\d:\d\d)")
ev = []
for f in glob.glob(f"{C}/logs/w*_c.log"):
    for line in open(f):
        m = pat.search(line)
        if m:
            ev.append((m.group(6), int(m.group(3)), int(m.group(5)), int(m.group(4))))
ev.sort()
print(f"закрыто задач: {len(ev)}, с ненулевым rc: {sum(1 for e in ev if e[3])}")
for n in (10, 25, 50):
    tail = ev[-n:]
    t0 = datetime.strptime(tail[0][0], "%H:%M:%S")
    t1 = datetime.strptime(tail[-1][0], "%H:%M:%S")
    span = (t1 - t0).total_seconds()
    if span <= 0:
        continue
    ideas = sum(e[1] for e in tail)
    print(f"  последние {n:>3} задач: {span/60:6.1f} мин, {ideas:>5} идей "
          f"-> {span/max(ideas,1):6.1f} с/идея (общая), {span/n:6.1f} с/задача")
# остаток
done = {os.path.basename(x)[5:-7] for x in glob.glob(f"{C}/out_c/done_*.json")}
left_t = left_i = 0
for sh in glob.glob(f"{C}/shard_*.tsv"):
    for line in open(sh):
        m, s, k = line.rstrip("\n").split("\t")
        if f"{m}_{s}" not in done:
            left_t += 1; left_i += int(k)
print(f"\nосталось задач {left_t}, идей {left_i}")
tail = ev[-25:]
span = (datetime.strptime(tail[-1][0], "%H:%M:%S") - datetime.strptime(tail[0][0], "%H:%M:%S")).total_seconds()
rate_task = span / 25
print(f"по темпу последних 25 задач: ещё {left_t*rate_task/3600:.1f} ч")
