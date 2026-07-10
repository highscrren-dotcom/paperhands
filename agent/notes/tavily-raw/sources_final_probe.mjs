// Final combined-allowlist probe. Usage:
// node final_probe.mjs <query> <domainsCSV> <depth> <label> <out.jsonl>
import { readFileSync, appendFileSync } from "node:fs";
import { tavily as makeTavily } from "/home/s1dd1/dev/quant/paperhands/example/node_modules/@tavily/core/dist/index.mjs";
const envRaw = readFileSync("/home/s1dd1/dev/quant/paperhands/example/.env", "utf8");
const m = envRaw.match(/^\s*TAVILY_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
const client = makeTavily({ apiKey: m[1] });
const [,, query, domainsCSV, depth, label, outPath] = process.argv;
const domains = domainsCSV.split(",");
const resp = await client.search(query, {
  includeAnswer: false, topic: "news", maxResults: 20, maxTokens: 25000,
  searchDepth: depth, includeDomains: domains, timeRange: "week", includeUsage: true,
});
const rs = resp.results || [];
const credits = resp?.usage?.credits ?? (depth === "advanced" ? 2 : 1);
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "?"; } };
const valid = rs.filter(r => { if (!r.publishedDate) return false; const d = new Date(r.publishedDate); return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0); });
const now = Date.now();
const fresh24 = valid.filter(r => now - new Date(r.publishedDate).getTime() <= 24*36e5);
appendFileSync(outPath, JSON.stringify({ label, depth, query, domains, credits, n: rs.length,
  results: rs.map(r => ({ score: +r.score.toFixed(3), publishedDate: r.publishedDate || null, domain: domainOf(r.url), title: (r.title || "").slice(0, 90) })) }) + "\n");
const survivors = valid.filter(r => r.score > 0.68);
console.log(`${label} depth=${depth} n=${rs.length} valid=${valid.length} fresh24h=${fresh24.length} pass0.68=${rs.filter(r=>r.score>0.68).length} SURVIVORS(valid&>0.68)=${survivors.length} cr=${credits}`);
const byDomain = {};
for (const r of rs) { const k = domainOf(r.url); byDomain[k] = byDomain[k] || []; byDomain[k].push(r.score); }
for (const [k, ss] of Object.entries(byDomain).sort((a,b)=>Math.max(...b[1])-Math.max(...a[1])))
  console.log(`  ${k}: n=${ss.length} max=${Math.max(...ss).toFixed(3)}`);
for (const s of survivors) console.log(`  JACKPOT: ${s.score.toFixed(3)} ${domainOf(s.url)} ${s.publishedDate}`);
