// news_rss.mjs — RSS-коллектор датированных крипто-новостей (альтернативный шаг 1).
// Решение владельца 21.07 (session 16): датированный индекс Tavily голодает
// (kitco ~1 ok-новость/нед, week-прогон 21.07 дал 11 raw / 0 ok) — RSS-фиды
// крипто-СМИ отдают pubDate у КАЖДОГО айтема и закрывают дату-голод напрямую.
// Пишет в тот же news-raw.jsonl (формат news_collect.mjs), дедуп по url;
// news_classify.mjs подхватывает новые raw автоматически (todo = raw без вердикта).
// Zero-dep: RSS 2.0 парсится регэкспами (fetch нативный).
//
// Usage: node news_rss.mjs            — пул фидов по умолчанию
//        node news_rss.mjs --feeds https://a/rss,https://b/feed
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";

const DATA_DIR = new URL("../../../agent/notes/news-dataset/", import.meta.url);
const RAW_PATH = new URL("news-raw.jsonl", DATA_DIR);
mkdirSync(DATA_DIR, { recursive: true });

// Пул по умолчанию: крипто-СМИ, которых НЕТ в датированном индексе Tavily
// (карта источников 7.1: cointelegraph в индексе мёртв, coindesk забанен — а RSS у них жив).
const DEFAULT_FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://www.theblock.co/rss.xml",
  "https://cryptoslate.com/feed/",
  "https://bitcoinmagazine.com/.rss/full/",
];

const argv = process.argv.slice(2);
const fIdx = argv.indexOf("--feeds");
const FEEDS = fIdx >= 0 && argv[fIdx + 1] ? argv[fIdx + 1].split(",") : DEFAULT_FEEDS;

// --- дедуп по всему журналу (как в news_collect.mjs) ---
const known = new Set();
if (existsSync(RAW_PATH)) {
  for (const line of readFileSync(RAW_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { known.add(JSON.parse(line).url); } catch { /* skip */ }
  }
}

const unCdata = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
const unEnt = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unEnt(unCdata(m[1]).trim()) : "";
};

let totalNew = 0;
for (const feed of FEEDS) {
  let xml = "";
  try {
    const r = await fetch(feed, {
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "Mozilla/5.0 (news-dataset rss collector)" },
    });
    if (!r.ok) { console.log(`[rss] ${feed} HTTP ${r.status} — пропуск`); continue; }
    xml = await r.text();
  } catch (e) {
    console.log(`[rss] ${feed} сбой: ${String(e?.message || e).slice(0, 60)}`);
    continue;
  }
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  let added = 0, noDate = 0, dup = 0;
  for (const it of items) {
    const url = tag(it, "link") || tag(it, "guid");
    const title = tag(it, "title");
    const pub = tag(it, "pubDate") || tag(it, "dc:date");
    if (!url || !title) continue;
    if (known.has(url)) { dup++; continue; }
    const d = new Date(pub);
    if (!pub || isNaN(d.getTime())) { noDate++; continue; }
    const desc = stripTags(unEnt(unCdata(tag(it, "description") || tag(it, "content:encoded") || "")));
    const rec = {
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      title,
      content: desc.slice(0, 4000),
      publishedDate: d.toISOString(),
      class: "rss",
      score: null,
      collectedAt: new Date().toISOString(),
      window: "rss",
      source: "rss",
    };
    appendFileSync(RAW_PATH, JSON.stringify(rec) + "\n");
    known.add(url);
    added++; totalNew++;
  }
  console.log(`[rss] ${new URL(feed).hostname}: items=${items.length} new=${added} dup=${dup} no_date=${noDate}`);
}
console.log(`[rss] done: new=${totalNew} known_total=${known.size}`);
