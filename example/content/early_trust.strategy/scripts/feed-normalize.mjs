#!/usr/bin/env node
/**
 * Сливает сторы скрейпера (tv-ideas.firstseen.mjs --store) в фид стратегии
 * assets/tv-ideas.normalized.jsonl. Маппинг тикеров: BTCUSD -> BTCUSDT
 * (короткое имя TV -> спот-пара Binance), готовые *USDT не трогаются,
 * прочие котировки (EUR, BTC-кроссы и т.п.) отбрасываются.
 * Запись атомарная (tmp + rename).
 *
 * usage: node feed-normalize.mjs <out.jsonl> <store1.jsonl> [store2.jsonl ...]
 */
import { readFile, writeFile, rename } from "node:fs/promises";

const [out, ...stores] = process.argv.slice(2);
if (!out || stores.length === 0) {
  console.error("usage: node feed-normalize.mjs <out.jsonl> <store...>");
  process.exit(1);
}

const mapSymbol = (shortName) => {
  const m = /^([A-Z0-9]+?)USDT?$/.exec(shortName || "");
  return m ? `${m[1]}USDT` : null;
};

const byId = new Map();
for (const path of stores) {
  let file;
  try {
    file = await readFile(path, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") continue;
    throw e;
  }
  for (const line of file.split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const symbol = mapSymbol(r.shortName);
    if (!symbol) continue;
    byId.set(r.id, {
      id: r.id,
      ts: r.ts,
      symbol,
      fullName: r.symbol,
      direction: r.direction,
      author: r.author,
      authorIsPro: r.authorIsPro,
      isScript: r.isScript,
      title: r.title,
      url: r.url,
      firstSeen: r.firstSeen,
    });
  }
}

const rows = [...byId.values()].sort((a, b) => a.ts - b.ts);
const tmp = `${out}.tmp`;
await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
await rename(tmp, out);
console.log(`${out}: ${rows.length} идей из ${stores.length} сторов`);
