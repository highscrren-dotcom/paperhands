// Tavily probe harness — session 9 Tavily-query research.
// RAM discipline: raw responses -> JSONL on disk; ONLY aggregates to stdout.
// Replicates example/logic/api/fetchNews.ts search params EXACTLY (advanced=2cr).
// Usage: node tavily_probe.mjs <batch.json> <out.jsonl>
import { readFileSync, appendFileSync } from "node:fs";
import { tavily as makeTavily } from "/home/s1dd1/dev/quant/paperhands/example/node_modules/@tavily/core/dist/index.mjs";

// --- load TAVILY_TOKEN from example/.env WITHOUT printing it ---
const envRaw = readFileSync("/home/s1dd1/dev/quant/paperhands/example/.env", "utf8");
const m = envRaw.match(/^\s*TAVILY_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) { console.error("TAVILY_TOKEN not found in example/.env"); process.exit(1); }
const client = makeTavily({ apiKey: m[1] });

// identical to fetchNews.ts ALLOWED_DOMAINS
// News/regulator subset — drops date-less persona domains (stocktwits/truthsocial)
// to isolate the query's effect on DATED sources. Toggle via ALL9=1 env.
const ALLOWED_DOMAINS = process.env.ALL9 ? [
  "cointelegraph.com", "theblock.co", "decrypt.co", "blockworks.co",
  "sec.gov", "federalreserve.gov", "whitehouse.gov",
  "truthsocial.com", "stocktwits.com",
] : [
  "cointelegraph.com", "theblock.co", "decrypt.co", "blockworks.co",
  "sec.gov", "federalreserve.gov", "whitehouse.gov",
];

const fmt = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
const median = (a) => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); const i=s.length>>1; return s.length%2?s[i]:(s[i-1]+s[i])/2; };
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return "?"; } };

const [,, batchPath, outPath] = process.argv;
const batch = JSON.parse(readFileSync(batchPath, "utf8"));

const now = new Date();
const freshCut = now.getTime() - 24*36e5; // 24h window (advisor's effective filter)
const onList = (u) => ALLOWED_DOMAINS.some(d => domainOf(u).endsWith(d));

let totalCredits = 0;
// days:2 instead of startDate/endDate — honors the allowlist (start/end silently disables it)
console.log(`dateParam=days:2 domains=${ALLOWED_DOMAINS.length} depth=advanced maxResults=20`);
console.log("label\tasset\tstyle\tn\toffList\tvalidDate\tfresh24h\tn>0.68\tmedian\tmax\ttopDomains\tquery");

for (const p of batch) {
  let resp;
  try {
    resp = await client.search(p.query, {
      includeAnswer: false, topic: "news", maxResults: 20, maxTokens: 25000,
      searchDepth: "advanced", includeDomains: ALLOWED_DOMAINS,
      timeRange: "week", includeUsage: true,
    });
  } catch (e) {
    console.log(`${p.label}\t${p.asset}\t${p.style}\tERR\t${String(e.message||e).slice(0,80)}`);
    continue;
  }
  const credits = resp?.usage?.credits ?? 2; // advanced = 2
  totalCredits += credits;
  const results = resp.results || [];
  // replicate advisor date-validity filter: publishedDate present & not 00:00 UTC
  const valid = results.filter(r => {
    if (!r.publishedDate) return false;
    const d = new Date(r.publishedDate);
    return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
  });
  const scores = results.map(r => r.score);
  const fresh = valid.filter(r => new Date(r.publishedDate).getTime() >= freshCut);
  const pass = results.filter(r => r.score > 0.68);
  const passValid = valid.filter(r => r.score > 0.68);
  const offList = results.filter(r => !onList(r.url)).length;
  const domCount = {};
  for (const r of results) domCount[domainOf(r.url)] = (domCount[domainOf(r.url)]||0)+1;
  const topDomains = Object.entries(domCount).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([d,c])=>`${d}:${c}`).join(",");

  // full raw (compact) to JSONL — url/score/date/domain/title only, NO content (RAM)
  appendFileSync(outPath, JSON.stringify({
    label: p.label, asset: p.asset, style: p.style, query: p.query, credits,
    n: results.length,
    results: results.map(r => ({ score: +r.score.toFixed(3), publishedDate: r.publishedDate||null, domain: domainOf(r.url), title: (r.title||"").slice(0,90) })),
  }) + "\n");

  console.log([
    p.label, p.asset, p.style, results.length, offList, valid.length, fresh.length,
    `${pass.length}(${passValid.length}v)`,
    median(scores)?.toFixed(3) ?? "-", scores.length?Math.max(...scores).toFixed(3):"-",
    topDomains || "-", p.query.slice(0,60),
  ].join("\t"));
}
console.log(`\nTOTAL_CREDITS=${totalCredits}`);
