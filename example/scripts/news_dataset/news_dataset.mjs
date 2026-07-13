// news_dataset.mjs — шаг 3 конвейера NEWS→ParserItem (ТЗ автора 13.07, DECISIONS №71).
// Маппинг news-classified.jsonl (status=ok) → news-parser-items.jsonl строго по
// структуре ParserItem из pump-anomaly (channel = ДОМЕН источника, ts = publishedDate мс,
// id = url; entryFrom/ToPrice у новостей нет — не выдумываем; confidence/class — extra-поля,
// pump-anomaly их игнорирует). Файл перезаписывается целиком (детерминированный,
// сортировка по ts). + сводка: домены/символы/направления, глубина по датам, отсев.
//
// Usage: node news_dataset.mjs
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const DATA_DIR = new URL("../../../agent/notes/news-dataset/", import.meta.url);
const CLS_PATH = new URL("news-classified.jsonl", DATA_DIR);
const OUT_PATH = new URL("news-parser-items.jsonl", DATA_DIR);
mkdirSync(DATA_DIR, { recursive: true });

const rows = [];
if (existsSync(CLS_PATH)) {
  for (const line of readFileSync(CLS_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
}

const rejects = { no_symbol: 0, no_direction: 0, not_listed: 0 };
const items = [];
const seen = new Set();
let badTs = 0;
for (const r of rows) {
  if (r.status !== "ok") { if (r.reason in rejects) rejects[r.reason]++; continue; }
  if (seen.has(r.url)) continue;
  const ts = new Date(r.publishedDate).getTime();
  if (!Number.isFinite(ts)) { badTs++; continue; }
  seen.add(r.url);
  items.push({
    channel: r.domain,
    symbol: r.symbol,
    direction: r.direction,
    ts,
    id: r.url,
    confidence: r.confidence,
    class: r.class,
  });
}
items.sort((a, b) => a.ts - b.ts);
writeFileSync(OUT_PATH, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));

// --- Сводка ---
const by = (arr, key) => {
  const m = new Map();
  for (const i of arr) m.set(i[key], (m.get(i[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const dirsOf = (arr, key, val) => {
  const sub = arr.filter((i) => i[key] === val);
  const long = sub.filter((i) => i.direction === "long").length;
  return `long=${long} short=${sub.length - long}`;
};

console.log(`[dataset] ${new Date().toISOString()} items=${items.length} (journal=${rows.length}, rejected: no_symbol=${rejects.no_symbol}, no_direction=${rejects.no_direction}, not_listed=${rejects.not_listed}${badTs ? `, bad_ts=${badTs}` : ""})`);
if (items.length) {
  const tsMin = items[0].ts, tsMax = items[items.length - 1].ts;
  const days = new Set(items.map((i) => new Date(i.ts).toISOString().slice(0, 10)));
  console.log(`[dataset] depth: ${new Date(tsMin).toISOString().slice(0, 16)} .. ${new Date(tsMax).toISOString().slice(0, 16)} UTC, distinct days=${days.size}, span=${((tsMax - tsMin) / 864e5).toFixed(1)}d`);
  console.log("channel\tn\tdirections");
  for (const [ch, n] of by(items, "channel")) console.log(`${ch}\t${n}\t${dirsOf(items, "channel", ch)}`);
  console.log("symbol\tn\tdirections");
  for (const [sym, n] of by(items, "symbol")) console.log(`${sym}\t${n}\t${dirsOf(items, "symbol", sym)}`);
  const long = items.filter((i) => i.direction === "long").length;
  console.log(`[dataset] total directions: long=${long} short=${items.length - long}`);
  // Гейт фита (№71): n>=10 на топ-домен и 2+ недели глубины — фит отдельной сессией.
  const topN = by(items, "channel")[0]?.[1] ?? 0;
  const spanDays = (tsMax - tsMin) / 864e5;
  console.log(`[dataset] fit-gate: top-domain n=${topN}/10, depth=${spanDays.toFixed(1)}/14d → ${topN >= 10 && spanDays >= 14 ? "READY (фит отдельной сессией)" : "копим дальше"}`);
}
