// ab_compare.mjs — сравнение боевого журнала v1 (news-classified.jsonl) с
// экспериментальным v2 (news-classified-v2.jsonl) по url. Только чтение.
// Usage: node ab_compare.mjs
import { readFileSync } from "node:fs";

const load = (p) => {
  const map = new Map();
  for (const line of readFileSync(new URL(p, import.meta.url), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const it = JSON.parse(line); map.set(it.url, it); } catch { /* skip */ }
  }
  return map;
};
const v1 = load("../news-dataset/news-classified.jsonl");
const v2 = load(process.argv[2] ?? "./news-classified-v2.jsonl");

const both = [...v1.keys()].filter((u) => v2.has(u));
console.log(`v1=${v1.size} v2=${v2.size} joined=${both.length}\n`);

const tally = (m, urls) => {
  const t = {};
  for (const u of urls) { const k = m.get(u).reason ?? "ok"; t[k] = (t[k] || 0) + 1; }
  return t;
};
console.log("outcome v1:", tally(v1, both));
console.log("outcome v2:", tally(v2, both));

let agreeFull = 0, agreeStatus = 0;
const diffs = [];
for (const u of both) {
  const a = v1.get(u), b = v2.get(u);
  const sameStatus = a.status === b.status && (a.reason ?? null) === (b.reason ?? null);
  const sameCall = a.symbol === b.symbol && a.direction === b.direction;
  if (sameStatus) agreeStatus++;
  if (sameStatus && sameCall) agreeFull++;
  else diffs.push({ u, a, b });
}
console.log(`\nagreement: status ${agreeStatus}/${both.length}, full(status+symbol+direction) ${agreeFull}/${both.length}\n`);

// confidence на пересечении ok∩ok
const okBoth = both.filter((u) => v1.get(u).status === "ok" && v2.get(u).status === "ok");
if (okBoth.length) {
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`ok∩ok=${okBoth.length}: conf v1 mean=${mean(okBoth.map((u) => v1.get(u).confidence)).toFixed(2)}`
    + ` v2 mean=${mean(okBoth.map((u) => v2.get(u).confidence)).toFixed(2)}`);
  console.log(`conf spread v1: ${[...new Set(okBoth.map((u) => v1.get(u).confidence))].sort().join(", ")}`);
  console.log(`conf spread v2: ${[...new Set(okBoth.map((u) => v2.get(u).confidence))].sort().join(", ")}\n`);
}

console.log(`=== расхождения (${diffs.length}) ===`);
for (const { u, a, b } of diffs) {
  console.log(`- ${a.domain} | ${a.title.slice(0, 90)}`);
  console.log(`  v1: ${a.status}${a.reason ? "/" + a.reason : ""} ${a.symbol ?? a.symbolRaw ?? ""} ${a.direction ?? ""} conf=${a.confidence}`);
  console.log(`  v2: ${b.status}${b.reason ? "/" + b.reason : ""} ${b.symbol ?? b.symbolRaw ?? ""} ${b.direction ?? ""} conf=${b.confidence} [${b.eventType}] ${b.llmReason?.slice(0, 110) ?? ""}`);
  console.log(`  url: ${u.slice(0, 100)}`);
}
