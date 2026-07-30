import json, os, sys, datetime
from array import array
from collections import defaultdict
ROOT="/data/backtests/dataset-master/content"; UNION="/data/backtests/_agent/phaseC/union"
TASKS="/data/backtests/_agent/phaseA/tasks.tsv"; MIN_MS=60_000; CHUNK=1000
DEDUPE_MS=8*60*MIN_MS
tasks=defaultdict(list)
for line in open(TASKS):
    m,s,n=line.rstrip("\n").split("\t")
    if int(n)>0 and s!="HYPEUSDT": tasks[s].append(m)
def ymd(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime("%Y-%m-%d %H:%M")
bad=0
for symbol in sorted(tasks):
    d=f"{UNION}/{symbol}/dump/data/candle/ccxt_cached/{symbol}/1m"
    ts=sorted(int(e.name[:-5]) for e in os.scandir(d))
    lo,hi=ts[0],ts[-1]; n=(hi-lo)//MIN_MS+1
    pres=bytearray(n)
    for t in ts: pres[(t-lo)//MIN_MS]=1
    pref=array("i",[0])*(n+1); acc=0
    for i in range(n): acc+=pres[i]; pref[i+1]=acc
    for month in sorted(tasks[symbol]):
        try: raw=[json.loads(x) for x in open(f"{ROOT}/{month}/assets/tv-ideas.normalize.jsonl") if x.strip()]
        except FileNotFoundError: continue
        ideas=sorted((i for i in raw if i["symbol"]==symbol and i["direction"]!="NEUTRAL"), key=lambda i:i["ts"])
        last={}; ded=[]
        for i in ideas:
            k=f'{i["author"]}:{i["direction"]}'
            if k in last and i["ts"]-last[k]<DEDUPE_MS: continue
            last[k]=i["ts"]; ded.append(i)
        for i in ded:
            e0=(i["ts"]//MIN_MS)*MIN_MS+MIN_MS
            a=(e0-lo)//MIN_MS; b=a+CHUNK
            ok = 0<=a and b<=n and pref[b]-pref[a]==CHUNK
            if not ok:
                bad+=1
                print(f"{month}\t{symbol}\tid={i['id']}\t{ymd(e0)}\tавтор={i['author']}")
print(f"ИТОГО идей с пустым ПЕРВЫМ чанком: {bad}")
