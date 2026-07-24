// Часовые свечи из 1m-файлов датасета (Ф0). Gap-aware: свеча часа несёт n =
// число минут; оценочный слой сам решает, что делать с n<60 (Binance не зовём).
// Выход: data/<SYMBOL>/hourly.jsonl, строки {t, o, h, l, c, n}, t = начало часа.
// Запуск: node build_hourly.mjs [SYMBOL] [FROM-YYYY] [TO-YYYY]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDLES_DIR = process.env.TV_CANDLES_DIR || "/home/s1dd1/dev/quant/tradingview-ideas-signals/data/candles";
const OUT = process.env.SWARM_DATA || join(HERE, "..", "data");
const SYMBOL = process.argv[2] || "BTCUSDT";
const FROM_Y = Number(process.argv[3] || "2024");
const TO_Y = Number(process.argv[4] || "2026");
const HOUR = 3600000;

const hours = new Map(); // hourStart -> {o, h, l, c, n, lastT}
for (let y = FROM_Y; y <= TO_Y; y++) {
  const p = join(CANDLES_DIR, `${SYMBOL}-${y}.jsonl`);
  if (!existsSync(p)) { console.log(`[skip] нет ${p}`); continue; }
  let n = 0;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    if (!line) continue;
    const d = JSON.parse(line);
    const hStart = d.t - (d.t % HOUR);
    let agg = hours.get(hStart);
    if (!agg) { agg = { o: d.o, h: d.h, l: d.l, c: d.c, n: 0, lastT: -1 }; hours.set(hStart, agg); }
    if (d.t <= agg.lastT) continue; // дубль минуты в датасете
    if (agg.n === 0 || d.t < agg.firstT) { agg.o = d.o; agg.firstT = d.t; }
    if (d.h > agg.h) agg.h = d.h;
    if (d.l < agg.l) agg.l = d.l;
    if (d.t > agg.lastT) { agg.c = d.c; agg.lastT = d.t; }
    agg.n += 1;
    n += 1;
  }
  console.log(`[${SYMBOL}-${y}] минут ${n}`);
}

const keys = [...hours.keys()].sort((a, b) => a - b);
mkdirSync(join(OUT, SYMBOL), { recursive: true });
const out = keys.map((t) => {
  const a = hours.get(t);
  return JSON.stringify({ t, o: a.o, h: a.h, l: a.l, c: a.c, n: a.n });
});
writeFileSync(join(OUT, SYMBOL, "hourly.jsonl"), out.join("\n") + "\n");
const full = keys.filter((t) => hours.get(t).n === 60).length;
console.log(`часов ${keys.length}, полных (n=60) ${full} (${(100 * full / keys.length).toFixed(1)}%) → ${join(OUT, SYMBOL, "hourly.jsonl")}`);
