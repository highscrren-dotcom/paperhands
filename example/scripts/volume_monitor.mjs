// Монитор объёмных аномалий (источник B, volume-anomaly автора) — read-only.
// Авторский паттерн из README/quickstart: подать 15-30+ мин aggTrades в scan()
// и прочитать explain(). Никакой торговли — только лог кандидатов.
//   node scripts/volume_monitor.mjs [SYM1,SYM2,...]
// Кроном раз в 15 мин; аномалии → out/volume-anomalies.jsonl (+ консоль).
import { scan, explain } from "volume-anomaly";
import ccxt from "ccxt";
import { appendFileSync, mkdirSync } from "node:fs";

const SYMBOLS = (process.argv[2] || process.env.VM_SYMBOLS || "SOLUSDT,PENGUUSDT,TAOUSDT,ZECUSDT")
  .split(",").map((s) => s.trim()).filter(Boolean);
const WINDOW_MIN = 35;          // 30 мин baseline + хвост (README: 15-30+)
const MAX_PAGES = 40;           // потолок пагинации (40k сделок) на символ

const exchange = new ccxt.binance({
  options: { defaultType: "spot", adjustForTimeDifference: true },
  enableRateLimit: true,
});

mkdirSync(new URL("../out", import.meta.url).pathname, { recursive: true });
const OUT = new URL("../out/volume-anomalies.jsonl", import.meta.url).pathname;

const fetchWindow = async (symbol) => {
  const from = Date.now() - WINDOW_MIN * 60_000;
  const trades = [];
  let since = from;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await exchange.fetchTrades(symbol, since, 1000);
    if (!batch.length) break;
    for (const t of batch) {
      trades.push({
        id: String(t.id),
        price: t.price,
        qty: t.amount,
        timestamp: t.timestamp,
        isBuyerMaker: t.info?.m ?? t.side === "sell",
      });
    }
    const last = batch[batch.length - 1].timestamp;
    if (last >= Date.now() - 1000 || batch.length < 1000) break;
    since = last + 1;
  }
  return trades;
};

for (const symbol of SYMBOLS) {
  try {
    const trades = await fetchWindow(symbol);
    const spanMin = trades.length
      ? (trades[trades.length - 1].timestamp - trades[0].timestamp) / 60_000
      : 0;
    if (spanMin < 15) {
      console.log(`${symbol}: окно ${spanMin.toFixed(1)} мин < 15 — пропуск (мало сделок или упёрлись в потолок пагинации)`);
      continue;
    }
    const r = scan(trades);
    const line = `${symbol}: anomaly=${r.anomaly} severity=${r.severity} confidence=${r.confidence.toFixed(3)} moveScore=${r.moveScore.toFixed(3)} (${trades.length} сделок / ${spanMin.toFixed(0)} мин)`;
    console.log(line);
    if (r.anomaly) {
      console.log(explain(r));
      appendFileSync(OUT, JSON.stringify({
        at: new Date().toISOString(), symbol,
        severity: r.severity, confidence: r.confidence, moveScore: r.moveScore,
        trades: trades.length, spanMin: Math.round(spanMin),
      }) + "\n");
    }
  } catch (e) {
    console.log(`${symbol}: ERR ${String(e.message).slice(0, 120)}`);
  }
}
