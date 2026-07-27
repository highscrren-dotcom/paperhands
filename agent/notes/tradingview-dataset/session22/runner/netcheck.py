import json, glob, sys
files = glob.glob(sys.argv[1] if len(sys.argv) > 1 else "out/done_*.json")
n = 0
tot = 0
who = []
for f in files:
    d = json.load(open(f))
    c = d.get("netCalls", 0)
    tot += c
    if c:
        n += 1
        who.append((c, f.split("done_")[1][:-5]))
print(f"прогонов всего {len(files)}, с сетевыми докачками {n}, вызовов суммарно {tot}")
who.sort(reverse=True)
for c, w in who[:15]:
    print(f"  {w}: {c}")
