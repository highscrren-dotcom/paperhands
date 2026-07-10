/**
 * parse_topslivs — детерминированный regex-парсер сигналов @topslivs
 * (клон формата Yoda: МОНЕТА/НАПРАВЛЕНИЕ/ВХОД/ЦЕЛИ/СТОП-ЛОСС) → ParserItem.
 * Паттерн как в example/scripts/pump_bench/parse_signals.mjs: без LLM,
 * воспроизводимо. Фильтры: *USDT, есть вход (from/to), есть стоп, ≥1 цель.
 *
 *   node parse_topslivs.mjs           # из channel-audit/
 *
 * Выход: parsed_topslivs.jsonl + агрегаты в stdout + unparsed_topslivs.jsonl
 * (сигналоподобные, но не распарсенные — для ручного досмотра шаблона).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const posts = readFileSync(join(HERE, "raw_topslivs.jsonl"), "utf8")
  .trim().split("\n").map(JSON.parse);

const num = (s) => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

const parse = (p) => {
  const t = p.text;
  const coin = t.match(/МОНЕТА:\s*\$?([A-Z0-9]+)\s*\/\s*([A-Z]+)/i);
  if (!coin) return null;
  const dirM = t.match(/НАПРАВЛЕНИЕ:\s*(ЛОНГ|ШОРТ|LONG|SHORT)/i);
  const entryM = t.match(/ВХОД:\s*([0-9][0-9.,]*)\s*(?:-|–|—)\s*([0-9][0-9.,]*)/);
  const entrySingle = t.match(/ВХОД:\s*([0-9][0-9.,]*)/);
  const targetsM = t.match(/ЦЕЛИ:\s*([0-9][0-9.,\s\-–—]*)/);
  const stopM = t.match(/СТОП[-\s]?ЛОСС:\s*([0-9][0-9.,]*)/i);

  const direction = dirM ? (/ЛОНГ|LONG/i.test(dirM[1]) ? "long" : "short") : null;
  const entryFrom = entryM ? num(entryM[1]) : entrySingle ? num(entrySingle[1]) : null;
  const entryTo = entryM ? num(entryM[2]) : entrySingle ? num(entrySingle[1]) : null;
  const targets = targetsM
    ? targetsM[1].split(/\s*(?:-|–|—)\s*/).map(num).filter((x) => x != null)
    : [];
  const stoploss = stopM ? num(stopM[1]) : null;

  return {
    id: `topslivs-${p.id}`,
    channel: "topslivs",
    symbol: `${coin[1].toUpperCase()}${coin[2].toUpperCase()}`,
    quote: coin[2].toUpperCase(),
    direction,
    ts: new Date(p.date).getTime(),
    date: p.date,
    entryFromPrice: entryFrom != null && entryTo != null ? Math.min(entryFrom, entryTo) : entryFrom,
    entryToPrice: entryFrom != null && entryTo != null ? Math.max(entryFrom, entryTo) : entryTo,
    targets,
    stoploss,
    messageId: p.id,
  };
};

const signalLike = posts.filter((p) => /МОНЕТА|НАПРАВЛЕНИЕ:/i.test(p.text));
const parsed = [];
const unparsed = [];
for (const p of signalLike) {
  const item = parse(p);
  if (item) parsed.push(item);
  else unparsed.push({ id: p.id, date: p.date, head: p.text.slice(0, 120) });
}

const usable = parsed.filter(
  (i) =>
    i.quote === "USDT" &&
    i.direction &&
    i.entryFromPrice != null &&
    i.entryToPrice != null &&
    i.stoploss != null &&
    i.targets.length >= 1,
);
const rejected = parsed.filter((i) => !usable.includes(i));

// санити: стоп по правильную сторону от входа
const sane = usable.filter((i) =>
  i.direction === "long" ? i.stoploss < i.entryFromPrice : i.stoploss > i.entryToPrice,
);
const insane = usable.filter((i) => !sane.includes(i));

writeFileSync(join(HERE, "parsed_topslivs.jsonl"), sane.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(join(HERE, "unparsed_topslivs.jsonl"), unparsed.map((r) => JSON.stringify(r)).join("\n") + (unparsed.length ? "\n" : ""));

const months = {};
for (const i of sane) months[i.date.slice(0, 7)] = (months[i.date.slice(0, 7)] || 0) + 1;
const dirs = { long: sane.filter((i) => i.direction === "long").length, short: sane.filter((i) => i.direction === "short").length };
const symbols = {};
for (const i of sane) symbols[i.symbol] = (symbols[i.symbol] || 0) + 1;

console.log(JSON.stringify({
  postsTotal: posts.length,
  signalLike: signalLike.length,
  parsedOk: parsed.length,
  unparsed: unparsed.length,
  usable: usable.length,
  rejectedWhy: {
    notUSDT: parsed.filter((i) => i.quote !== "USDT").length,
    noDirection: parsed.filter((i) => !i.direction).length,
    noEntry: parsed.filter((i) => i.entryFromPrice == null || i.entryToPrice == null).length,
    noStop: parsed.filter((i) => i.stoploss == null).length,
    noTargets: parsed.filter((i) => !i.targets.length).length,
  },
  saneFinal: sane.length,
  insaneStopSide: insane.length,
  longShort: dirs,
  byMonth: months,
  topSymbols: Object.entries(symbols).sort((a, b) => b[1] - a[1]).slice(0, 10),
}, null, 2));

console.log("\n[примеры для глаза]");
for (const i of [sane[0], sane[Math.floor(sane.length / 2)], sane[sane.length - 1]].filter(Boolean))
  console.log(JSON.stringify(i));
