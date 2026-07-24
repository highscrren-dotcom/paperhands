// Готовит полный годовой фид для split_months.mjs из HF-датасета Петра:
// канонизация символа = to_binance_symbol аудита №101 (фиат-фильтр, ренеймы
// TON→GRAM/MATIC→POL/FTM→S, срез .P/.PS), drop isScript, дедуп по id,
// СТРОГО контракт ISimulatorIdea: {id, ts, symbol, direction, author} —
// ничего лишнего (требование PLAN-petr этап 0). NEUTRAL сохраняется
// (этап 5: NEUTRAL = автор молчит). Сортировка (ts, id).
// Запуск: node build_feed.mjs <SYMBOL> <YEAR> <out.jsonl>
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATASET_DIR = process.env.TV_DATASET_DIR || "/home/s1dd1/dev/quant/tradingview-ideas-signals/data";
const [SYMBOL, YEAR, OUT] = process.argv.slice(2);
if (!SYMBOL || !YEAR || !OUT) { console.error("usage: node build_feed.mjs <SYMBOL> <YEAR> <out.jsonl>"); process.exit(1); }

const binance = new Set(JSON.parse(readFileSync(join(DATASET_DIR, "binance-symbols.json"), "utf-8")));
const FIAT = new Set(["EUR", "GBP", "AUD", "NZD", "JPY", "CHF", "CAD", "TRY", "XAU", "XAG", "XTI", "XPT"]);
const RENAMES = { TON: "GRAM", MATIC: "POL", FTM: "S" };
const RE = /^([A-Z0-9]{2,15}?)(USDT|USDC|USD)$/;
export function toBinanceSymbol(short) {
  const s = String(short || "").toUpperCase().replace(/\.P[S]?$/, "");
  const m = RE.exec(s);
  if (!m || FIAT.has(m[1])) return null;
  const cand = (RENAMES[m[1]] ?? m[1]) + "USDT";
  return binance.has(cand) ? cand : null;
}

const from = Date.UTC(Number(YEAR), 0, 1);
const to = Date.UTC(Number(YEAR) + 1, 0, 1);
const seen = new Set();
const rows = [];
const dirs = { LONG: 0, SHORT: 0, NEUTRAL: 0 };
for (const line of readFileSync(join(DATASET_DIR, "tv-ideas.jsonl"), "utf-8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.isScript) continue;
  if (r.ts < from || r.ts >= to) continue;
  if (toBinanceSymbol(r.symbol) !== SYMBOL) continue;
  if (seen.has(r.id)) continue;
  seen.add(r.id);
  if (!(r.direction in dirs)) throw new Error(`неизвестный direction: ${r.direction} (id=${r.id})`);
  dirs[r.direction] += 1;
  rows.push({ id: r.id, ts: r.ts, symbol: SYMBOL, direction: r.direction, author: r.author });
}
rows.sort((a, b) => a.ts - b.ts || a.id - b.id);
writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`${SYMBOL} ${YEAR}: идей ${rows.length} (${JSON.stringify(dirs)}), авторов ${new Set(rows.map((r) => r.author)).size} → ${OUT}`);
