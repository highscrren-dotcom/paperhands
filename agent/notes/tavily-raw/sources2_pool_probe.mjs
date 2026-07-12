// Wave-2 pool probe: runs a batch of labeled queries against ONE domain pool.
// Usage: node pool_probe.mjs <queries.json> <domainsCSV-file> <depth> <runTag> <out.jsonl>
// queries.json: [{label, cls, style, query}, ...]
// Aggregates to stdout (TSV), raw (no content) to JSONL. Survivor = valid date & score>0.68.
import { readFileSync, appendFileSync } from "node:fs";
import { tavily as makeTavily } from "/home/s1dd1/dev/quant/paperhands/example/node_modules/@tavily/core/dist/index.mjs";
const envRaw = readFileSync("/home/s1dd1/dev/quant/paperhands/example/.env", "utf8");
const m = envRaw.match(/^\s*TAVILY_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) { console.error("TAVILY_TOKEN not found"); process.exit(1); }
const client = makeTavily({ apiKey: m[1] });

const [,, queriesPath, domainsPath, depth, runTag, outPath] = process.argv;
const queries = JSON.parse(readFileSync(queriesPath, "utf8"));
const domains = readFileSync(domainsPath, "utf8").trim().split(",").map(s => s.trim()).filter(Boolean);
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return "?"; } };
const median = (a) => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); const i=s.length>>1; return s.length%2?s[i]:(s[i-1]+s[i])/2; };

let totalCredits = 0;
const now = Date.now();
console.log(`runTag=${runTag} pool=${domains.length} depth=${depth} window=week`);
console.log("label\tcls\tstyle\tn\tvalid\tfresh24h\tmedian\tmax\tmaxDomain\tsurvivors\tcr");

for (const q of queries) {
  let resp;
  try {
    resp = await client.search(q.query, {
      includeAnswer: false, topic: "news", maxResults: 20, maxTokens: 25000,
      searchDepth: depth, includeDomains: domains, timeRange: "week", includeUsage: true,
    });
  } catch (e) { console.log(`${q.label}\tERR\t${String(e.message||e).slice(0,80)}`); continue; }
  const credits = resp?.usage?.credits ?? (depth === "advanced" ? 2 : 1);
  totalCredits += credits;
  const rs = resp.results || [];
  const valid = rs.filter(r => { if (!r.publishedDate) return false; const d = new Date(r.publishedDate); return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0); });
  const fresh24 = valid.filter(r => now - new Date(r.publishedDate).getTime() <= 24*36e5).length;
  const survivors = valid.filter(r => r.score > 0.68);
  const scores = rs.map(r => r.score);
  const maxIdx = scores.indexOf(Math.max(...scores));
  appendFileSync(outPath, JSON.stringify({
    runTag, ts: new Date(now).toISOString(), label: q.label, cls: q.cls, style: q.style,
    query: q.query, depth, pool: domains, credits, n: rs.length,
    results: rs.map(r => ({ score: +r.score.toFixed(3), publishedDate: r.publishedDate || null, domain: domainOf(r.url), title: (r.title || "").slice(0, 90) })),
  }) + "\n");
  console.log([q.label, q.cls, q.style, rs.length, valid.length, fresh24,
    median(scores)?.toFixed(3) ?? "-", scores.length ? Math.max(...scores).toFixed(3) : "-",
    rs.length ? domainOf(rs[maxIdx].url) : "-",
    survivors.map(s => `${domainOf(s.url)}:${s.score.toFixed(3)}`).join(",") || "0", credits].join("\t"));
}
console.log(`TOTAL_CREDITS=${totalCredits}`);
