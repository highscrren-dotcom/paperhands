import os, glob, json
C = "/data/backtests/_agent/phaseC"
done = {os.path.basename(f)[5:-7] for f in glob.glob(f"{C}/out_c/done_*.json")}
tot_left = 0
print(f"{'шард':<10}{'задач всего':>13}{'осталось':>10}{'идей всего':>12}{'идей осталось':>15}")
for sh in sorted(glob.glob(f"{C}/shard_*.tsv")):
    n = t = ln = lt = 0
    for line in open(sh):
        m, s, k = line.rstrip("\n").split("\t")
        k = int(k)
        n += 1; t += k
        if f"{m}_{s}" not in done:
            ln += 1; lt += k
    tot_left += lt
    print(f"{os.path.basename(sh)[6:-4]:<10}{n:>13}{ln:>10}{t:>12}{lt:>15}")
# средняя скорость по факту
secs = ideas = 0
for f in glob.glob(f"{C}/out_c/done_*.json"):
    d = json.load(open(f)); secs += d["seconds"]; ideas += d["profileCount"]
rate = secs / ideas
print(f"\nфакт: {ideas} профилей за {secs} машино-секунд = {rate:.1f} с на идею")
print(f"осталось идей (до дедупа) {tot_left}")
worst = max((sum(int(l.split(chr(9))[2]) for l in open(sh)
                 if f"{l.split(chr(9))[0]}_{l.split(chr(9))[1]}" not in done)
             for sh in glob.glob(f"{C}/shard_*.tsv")))
print(f"самый нагруженный шард: {worst} идей -> {worst*rate/3600:.1f} ч до конца")
