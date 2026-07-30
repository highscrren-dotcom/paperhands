import json, os, glob
D = "/data/backtests/_agent/phaseC/out_c"
fs = sorted(glob.glob(f"{D}/done_*.json"))
tot_net = tot_sec = tot_pts = 0
bad = []
print(f"{'задача':<30}{'точек':>7}{'правил':>8}{'идей':>6}{'обрез':>7}{'net':>6}{'сек':>7}")
for f in fs:
    d = json.load(open(f))
    n = os.path.basename(f)[5:-5]
    tot_net += d["netCalls"]; tot_sec += d["seconds"]; tot_pts += d["points"]
    if d["points"] != 840 or d["rules"] != 840:
        bad.append(n)
    print(f"{n:<30}{d['points']:>7}{d['rules']:>8}{d['profileCount']:>6}"
          f"{d['truncatedCount']:>7}{d['netCalls']:>6}{d['seconds']:>7}")
print(f"\nзадач {len(fs)}, суммарно netCalls {tot_net}, машино-секунд {tot_sec}")
print(f"точек не 840: {bad if bad else 'нет'}")
ideas = sum(json.load(open(f))["profileCount"] for f in fs)
print(f"профилей построено {ideas}, среднее {tot_sec/ideas:.1f} с на идею")
