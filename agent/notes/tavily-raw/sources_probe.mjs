// Adaptive Tavily per-domain probe v2 — after P1 findings (dates are a per-domain
// property of Tavily's index; date-less high-score domains are "stocktwits-class").
// Logic per domain:
//   1) ETF basic (1cr); if n==0 -> ETF advanced (2cr)
//   2) FOMC probe only when it can change the verdict:
//      - domain showed valid dates on ETF  -> FOMC basic (retry advanced if 0) [full workup]
//      - ETF empty on both depths          -> FOMC basic (different-query check)
//      - n>0 but 0<n<3 and no dates        -> FOMC basic (firm up small sample)
//      - n>=3 and no dates                 -> SKIP FOMC (verdict already clear)
// RAM: raw -> JSONL on disk, aggregates to stdout.
// Usage: node probe_sources2.mjs <domains.json> <out.jsonl>
import { readFileSync, appendFileSync } from "node:fs";
import { tavily as makeTavily } from "/home/s1dd1/dev/quant/paperhands/example/node_modules/@tavily/core/dist/index.mjs";

const envRaw = readFileSync("/home/s1dd1/dev/quant/paperhands/example/.env", "utf8");
const m = envRaw.match(/^\s*TAVILY_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) { console.error("TAVILY_TOKEN not found"); process.exit(1); }
const client = makeTavily({ apiKey: m[1] });

const Q = {
  ETF:  "Bitcoin ETF outflows inflows institutional demand",
  FOMC: "Federal Reserve FOMC interest rate decision inflation crypto",
};
const median = (a) => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); const i=s.length>>1; return s.length%2?s[i]:(s[i-1]+s[i])/2; };
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return "?"; } };

const [,, domainsPath, outPath] = process.argv;
const domains = JSON.parse(readFileSync(domainsPath, "utf8"));
const now = Date.now();
let totalCredits = 0;

const run = async (domain, cls, depth) => {
  const resp = await client.search(Q[cls], {
    includeAnswer: false, topic: "news", maxResults: 20, maxTokens: 25000,
    searchDepth: depth, includeDomains: [domain], timeRange: "week", includeUsage: true,
  });
  const credits = resp?.usage?.credits ?? (depth === "advanced" ? 2 : 1);
  totalCredits += credits;
  const rs = resp.results || [];
  const valid = rs.filter(r => {
    if (!r.publishedDate) return false;
    const d = new Date(r.publishedDate);
    return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
  });
  appendFileSync(outPath, JSON.stringify({
    domain, cls, depth, credits, n: rs.length,
    results: rs.map(r => ({ score: +r.score.toFixed(3), publishedDate: r.publishedDate || null, domain: domainOf(r.url), title: (r.title || "").slice(0, 90) })),
  }) + "\n");
  const scores = rs.map(r => r.score);
  const fresh24 = valid.filter(r => now - new Date(r.publishedDate).getTime() <= 24*36e5).length;
  const passValid = valid.filter(r => r.score > 0.68).length;
  console.log([domain, cls, depth, rs.length, valid.length, fresh24,
    median(scores)?.toFixed(3) ?? "-", scores.length ? Math.max(...scores).toFixed(3) : "-",
    rs.filter(r => r.score > 0.68).length, passValid, credits].join("\t"));
  return { n: rs.length, valid: valid.length };
};

console.log("domain\tclass\tdepth\tn\tvalidDate\tfresh24h\tmedian\tmax\tn>0.68\tvalid>0.68\tcr");
for (const d of domains) {
  let etf;
  try {
    etf = await run(d, "ETF", "basic");
    if (etf.n === 0) etf = await run(d, "ETF", "advanced");
  } catch (e) { console.log(`${d}\tETF\tERR\t${String(e.message||e).slice(0,80)}`); continue; }
  try {
    if (etf.valid > 0) {
      const f = await run(d, "FOMC", "basic");
      if (f.n === 0) await run(d, "FOMC", "advanced");
    } else if (etf.n === 0 || etf.n < 3) {
      await run(d, "FOMC", "basic");
    } else {
      console.log(`${d}\tFOMC\tSKIP\t(n=${etf.n}, dates=0 — вердикт ясен)`);
    }
  } catch (e) { console.log(`${d}\tFOMC\tERR\t${String(e.message||e).slice(0,80)}`); }
}
console.log(`\nTOTAL_CREDITS=${totalCredits}`);
