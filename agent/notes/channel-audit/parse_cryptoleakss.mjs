/**
 * parse_cryptoleakss — regex-парсер @cryptoleakss (два формата):
 *  A) карточка: «NEW SIGNAL — NEAR/USDT … Entry: $1.74 … Stop Loss: $1.5268 …
 *     TP1: $1.7703 …» (одиночный вход → зона нулевой ширины);
 *  B) inline: «$MITO/USDT ENTRY 0.0392 - 0.0394 TARGETS a - b - … STOP LOSS
 *     ON DAILY CLOSE BELOW 0.0349» (стоп условный по дневному закрытию —
 *     помечаем conditionalStop, в replay трактуем как обычный, консервативно).
 * Направление: по положению TP1 к входу (targets[0] > entry → long),
 * эмодзи/слово — только кросс-чек. Дедуп по (symbol, entry, stop).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const posts = readFileSync(join(HERE, "raw_cryptoleakss.jsonl"), "utf8")
  .trim().split("\n").map(JSON.parse);

const num = (s) => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : null;
};

const parse = (p) => {
  const t = p.text;
  let symbol, entryFrom, entryTo, targets = [], stoploss, conditionalStop = false;

  const symM = t.match(/(?:NEW SIGNAL\s*[—-]\s*|\$)([A-Z0-9]{2,})\s*\/\s*USDT/);
  if (!symM) return null;
  symbol = `${symM[1]}USDT`;

  const entryZone = t.match(/ENTRY:?\s*\$?([0-9][0-9.,]*)\s*(?:-|–|—)\s*\$?([0-9][0-9.,]*)/i);
  const entrySingle = t.match(/Entry:?\s*\$?([0-9][0-9.,]*)/i);
  if (entryZone) { entryFrom = num(entryZone[1]); entryTo = num(entryZone[2]); }
  else if (entrySingle) { entryFrom = entryTo = num(entrySingle[1]); }

  const tpMatches = [...t.matchAll(/TP\d+:?\s*\$?([0-9][0-9.,]*)/gi)].map((m) => num(m[1]));
  if (tpMatches.length) targets = tpMatches;
  else {
    const tgtBlock = t.match(/TARGETS?\s+([0-9][0-9.,\s\-–—]*)/i);
    if (tgtBlock) targets = tgtBlock[1].split(/\s*(?:-|–|—)\s*/).map(num).filter((x) => x != null);
  }

  const slCond = t.match(/STOP\s*LOSS\s*(?:ON\s*DAILY\s*CLOSE\s*)?(?:BELOW|ABOVE)\s*\$?([0-9][0-9.,]*)/i);
  const slPlain = t.match(/Stop\s*Loss:?\s*\$?([0-9][0-9.,]*)/i);
  if (slCond) { stoploss = num(slCond[1]); conditionalStop = /DAILY/i.test(t); }
  else if (slPlain) stoploss = num(slPlain[1]);

  if (entryFrom == null || !targets.length || stoploss == null) return null;
  const mid = (entryFrom + entryTo) / 2;
  const direction = targets[0] > mid ? "long" : "short";

  return {
    id: `cryptoleakss-${p.id}`,
    channel: "cryptoleakss",
    symbol,
    quote: "USDT",
    direction,
    ts: new Date(p.date).getTime(),
    date: p.date,
    entryFromPrice: Math.min(entryFrom, entryTo),
    entryToPrice: Math.max(entryFrom, entryTo),
    targets,
    stoploss,
    conditionalStop,
    messageId: p.id,
  };
};

const parsed = [];
const skipped = [];
for (const p of posts) {
  const item = parse(p);
  if (item) parsed.push(item);
  else if (/Entry|ENTRY/i.test(p.text) && /\/USDT/.test(p.text)) skipped.push({ id: p.id, head: p.text.slice(0, 100) });
}

// дедуп (repost/edit): один (symbol, entry, stop) — берём самый ранний
const key = (i) => `${i.symbol}|${i.entryFromPrice}|${i.entryToPrice}|${i.stoploss}`;
const byKey = new Map();
for (const i of parsed.sort((a, b) => a.ts - b.ts)) if (!byKey.has(key(i))) byKey.set(key(i), i);
const unique = [...byKey.values()];

const sane = unique.filter((i) =>
  i.direction === "long" ? i.stoploss < i.entryFromPrice : i.stoploss > i.entryToPrice,
);

writeFileSync(join(HERE, "parsed_cryptoleakss.jsonl"), sane.map((r) => JSON.stringify(r)).join("\n") + "\n");

console.log(JSON.stringify({
  postsTotal: posts.length,
  parsedRaw: parsed.length,
  afterDedup: unique.length,
  saneFinal: sane.length,
  skippedSignalLike: skipped.length,
  longShort: { long: sane.filter((i) => i.direction === "long").length, short: sane.filter((i) => i.direction === "short").length },
  conditionalStops: sane.filter((i) => i.conditionalStop).length,
  byMonth: sane.reduce((a, i) => { a[i.date.slice(0, 7)] = (a[i.date.slice(0, 7)] || 0) + 1; return a; }, {}),
}, null, 2));
for (const s of skipped.slice(0, 5)) console.log("skip:", JSON.stringify(s));
console.log("\n[примеры]"); for (const i of sane.slice(0, 2)) console.log(JSON.stringify(i));
