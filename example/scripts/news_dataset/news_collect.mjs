// news_collect.mjs — шаг 1 конвейера NEWS→ParserItem (ТЗ автора 13.07, DECISIONS №71).
// Tavily по пулу-13 (карта источников 7.1), 4 clean-запроса классов A.3.
// БЕЗ порога score: берём ВСЕ результаты с валидной датой (не 00:00 UTC).
// Дедуп по url против всего news-raw.jsonl. Инкрементальная запись после каждого запроса.
//
// Usage: node news_collect.mjs [day|week]
//   day  — ежедневный цикл (дефолт, крон)
//   week — ретро-затравка первого прогона (~7 дней)
// Бюджет: 4 запроса × advanced = 8 кредитов.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { tavily } from "@tavily/core";

const envRaw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
// --from-service <url>: забор через news-service (Tavily, лимитер и журнал внутри
// сервиса, /dev/quant/news-service). Дефолт — прямой Tavily: боевой крон 09:40 не меняется.
const argv = process.argv.slice(2);
const svcIdx = argv.indexOf("--from-service");
const SERVICE = svcIdx >= 0
  ? (argv[svcIdx + 1]?.startsWith("http") ? argv[svcIdx + 1] : "http://localhost:8080")
  : null;
const positional = argv.filter((a, i) => i !== svcIdx && !(svcIdx >= 0 && i === svcIdx + 1 && a.startsWith("http")));
if (!SERVICE && !process.env.TAVILY_TOKEN) { console.error("TAVILY_TOKEN not found in example/.env"); process.exit(1); }

const DATA_DIR = new URL("../../../agent/notes/news-dataset/", import.meta.url);
const RAW_PATH = new URL("news-raw.jsonl", DATA_DIR);
mkdirSync(DATA_DIR, { recursive: true });

// Пул-13 волны 1 без изменений (tavily-sources-map.md 7.1). Новый состав — только
// после валидационной пробы (правило №65в: состав может переключить индекс).
const POOL13 = [
  "theblock.co", "decrypt.co", "coingape.com", "beincrypto.com",
  "kitco.com",
  "cnbc.com", "forbes.com", "finance.yahoo.com", "fortune.com",
  "investing.com", "marketwatch.com", "thestreet.com", "benzinga.com",
];

// 4 clean-запроса лучших классов по отдаче аллоулиста (tavily-queries.md A.3/A.5):
// ETF → FOMC → крах/ралли → регуляторка. Формулировки дословно из batch_main волны 1.
const QUERIES = [
  { cls: "etf",         query: "Bitcoin ETF outflows inflows institutional demand" },
  { cls: "fomc",        query: "Federal Reserve FOMC interest rate decision inflation crypto" },
  { cls: "crash-rally", query: "Bitcoin crypto sell-off crash rally price plunge surge" },
  { cls: "regulation",  query: "Bitcoin SEC CFTC crypto regulation CLARITY Act MiCA ruling" },
];

const WINDOW = positional[0] === "week" ? "week" : "day";
const client = SERVICE ? null : tavily({ apiKey: process.env.TAVILY_TOKEN });
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "?"; } };
// Валидная дата = не полуночная 00:00 UTC (полуночные — артефакт индекса, см. монитор №66).
const hasValidDate = (r) => {
  if (!r.publishedDate) return false;
  const d = new Date(r.publishedDate);
  return !Number.isNaN(d.getTime()) && !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
};

const seen = new Set();
if (existsSync(RAW_PATH)) {
  for (const line of readFileSync(RAW_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { seen.add(JSON.parse(line).url); } catch { /* битую строку не считаем */ }
  }
}

const startedAt = new Date().toISOString();
let totalCredits = 0, totalNew = 0;
console.log(`[collect] ${startedAt} window=${WINDOW} pool=${POOL13.length} known_urls=${seen.size}`);

if (SERVICE) {
  // Сервис сам ходит в Tavily (или отдаёт журнал при NEWS_SERVICE_DRY=1);
  // здесь только дедуп против jsonl и запись в прежнем формате.
  const since = new Date(Date.now() - (WINDOW === "week" ? 7 : 1) * 864e5).toISOString();
  const resp = await fetch(`${SERVICE}/api/v1/news?vendor=tavily&since=${encodeURIComponent(since)}`);
  if (!resp.ok) { console.error(`[collect] service ${resp.status}: ${(await resp.text()).slice(0, 200)}`); process.exit(1); }
  let added = 0;
  for (const r of await resp.json()) {
    if (!hasValidDate(r) || seen.has(r.url)) continue;
    seen.add(r.url);
    added++;
    appendFileSync(RAW_PATH, JSON.stringify({
      url: r.url, domain: r.domain, title: r.title || "", content: r.content || "",
      publishedDate: r.publishedDate, class: r.cls, score: r.score == null ? null : +(+r.score).toFixed(3),
      collectedAt: startedAt, window: WINDOW, source: "service",
    }) + "\n");
  }
  console.log(`[collect] done (service ${SERVICE}): new=${added} total_dataset=${seen.size}`);
  process.exit(0);
}

console.log("cls\tn\tvalid\tnew\tcredits");

for (const q of QUERIES) {
  let resp;
  try {
    resp = await client.search(q.query, {
      includeAnswer: false, topic: "news", maxResults: 20, maxTokens: 25000,
      searchDepth: "advanced", includeDomains: POOL13, timeRange: WINDOW, includeUsage: true,
    });
  } catch (e) {
    console.log(`${q.cls}\tERR\t${String(e?.message || e).slice(0, 100)}`);
    continue;
  }
  const credits = resp?.usage?.credits ?? 2;
  totalCredits += credits;
  const rs = resp.results || [];
  const valid = rs.filter(hasValidDate);
  let added = 0;
  for (const r of valid) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    added++;
    appendFileSync(RAW_PATH, JSON.stringify({
      url: r.url,
      domain: domainOf(r.url),
      title: r.title || "",
      content: r.content || "",
      publishedDate: r.publishedDate,
      class: q.cls,
      score: +(+r.score).toFixed(3),
      collectedAt: startedAt,
      window: WINDOW,
    }) + "\n");
  }
  totalNew += added;
  console.log(`${q.cls}\t${rs.length}\t${valid.length}\t${added}\t${credits}`);
}

console.log(`[collect] done: new=${totalNew} total_dataset=${seen.size} credits=${totalCredits}`);
