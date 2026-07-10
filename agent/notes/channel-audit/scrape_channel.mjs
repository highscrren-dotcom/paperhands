/**
 * scrape_channel — история публичного TG-канала через t.me/s/<ch>?before=<id>.
 * Без логина и без TDLib: не трогает session.txt live-контура (урок №44).
 * Нежный к API: 1 запрос / 3с + джиттер, ретраи с бэкоффом, стоп по 429/капче.
 *
 *   node scrape_channel.mjs <channel> <cutoffISO> [maxPages]
 *
 * Пишет agent/notes/channel-audit/raw_<channel>.jsonl (id, date, text),
 * прогресс — в stdout. Идемпотентно: дописывает только новые id.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const [, , CHANNEL, CUTOFF_ISO, MAX_PAGES_ARG] = process.argv;
if (!CHANNEL || !CUTOFF_ISO) {
  console.error("usage: node scrape_channel.mjs <channel> <cutoffISO> [maxPages]");
  process.exit(1);
}
const CUTOFF = new Date(CUTOFF_ISO).getTime();
const MAX_PAGES = Number(MAX_PAGES_ARG || 400);
const OUT = join(HERE, `raw_${CHANNEL}.jsonl`);
const SLEEP_MS = 3000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = new Set(
  existsSync(OUT)
    ? readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id)
    : [],
);

const strip = (h) =>
  h
    .replace(/<br\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#33;/g, "!")
    .replace(/&#036;|&#36;/g, "$")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();

const fetchPage = async (before) => {
  const url = `https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ""}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) research/1.0" },
      });
      if (res.status === 429) throw new Error("429 rate limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.log(`[scrape] ${url} попытка ${attempt}: ${e.message}`);
      if (attempt === 3) throw e;
      await sleep(SLEEP_MS * 4 * attempt); // бэкофф 12с/24с
    }
  }
};

const parsePage = (html) => {
  const posts = [];
  const chunks = html.split('class="tgme_widget_message_wrap');
  for (const chunk of chunks.slice(1)) {
    const idM = chunk.match(new RegExp(`data-post="${CHANNEL}/(\\d+)"`, "i"));
    const dtM = chunk.match(/<time datetime="([^"]+)"/);
    const txtM = chunk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)<\/div>/s);
    if (!idM || !dtM) continue;
    posts.push({
      id: Number(idM[1]),
      date: dtM[1],
      text: txtM ? strip(txtM[1]) : "",
    });
  }
  return posts;
};

console.log(`[scrape] канал=${CHANNEL}, cutoff=${CUTOFF_ISO}, уже в файле: ${seen.size}`);
let before = null;
let total = 0;
let oldest = null;

for (let page = 1; page <= MAX_PAGES; page++) {
  const html = await fetchPage(before);
  if (/captcha|Cloudflare/i.test(html.slice(0, 2000))) {
    console.log("[scrape] СТОП: капча/блок в ответе");
    break;
  }
  const posts = parsePage(html);
  if (!posts.length) {
    console.log(`[scrape] страница ${page}: постов нет — конец истории`);
    break;
  }
  posts.sort((a, b) => b.id - a.id);
  const fresh = posts.filter((p) => !seen.has(p.id));
  for (const p of fresh) {
    appendFileSync(OUT, JSON.stringify(p) + "\n");
    seen.add(p.id);
  }
  total += fresh.length;
  const minId = posts[posts.length - 1].id;
  oldest = posts[posts.length - 1].date;
  if (page % 10 === 0 || page === 1)
    console.log(`[scrape] стр.${page}: +${fresh.length} (всего ${total}), старейший ${oldest} id=${minId}`);
  if (new Date(oldest).getTime() < CUTOFF) {
    console.log(`[scrape] ДОСТИГНУТ cutoff: ${oldest} < ${CUTOFF_ISO}`);
    break;
  }
  before = minId;
  await sleep(SLEEP_MS + Math.floor(Math.random() * 1500));
}
console.log(`[scrape] ГОТОВО: канал=${CHANNEL}, новых=${total}, всего в файле=${seen.size}, старейший=${oldest}`);
