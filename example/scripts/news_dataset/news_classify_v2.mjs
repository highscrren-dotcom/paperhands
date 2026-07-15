// news_classify_v2.mjs — ЭКСПЕРИМЕНТ (vibe-mining, DECISIONS №75/79): v2-промпт
// классификатора новостей с приёмами HKUDS/Vibe-Trading (event-driven SKILL.md:
// якорёная шкала, таксономия событий, reason-предложение; social-media-intelligence
// §3.1). БОЕВОЙ news_classify.mjs НЕ ТРОГАЕТ и не заменяет: читает тот же
// news-raw.jsonl, пишет в agent/notes/vibe-mining/news-classified-v2.jsonl.
// Паттерн вызова Ollama намеренно ИДЕНТИЧЕН v1 (модель, format-схема, think:false,
// jsonrepair, 3 ретрая, клип 4000) — в A/B меняется только промпт.
// Инвариант: классификатор видит ТОЛЬКО title+content — ни цены, ни даты.
//
// Usage: node news_classify_v2.mjs
import { readFileSync, existsSync, appendFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { Ollama } from "ollama";
import { jsonrepair } from "jsonrepair";

const envRaw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.OLLAMA_TOKEN) { console.error("OLLAMA_TOKEN not found in example/.env"); process.exit(1); }

const DATA_DIR = new URL("../../../agent/notes/news-dataset/", import.meta.url);
const OUT_DIR = new URL("../../../agent/notes/vibe-mining/", import.meta.url);
const RAW_PATH = new URL("news-raw.jsonl", DATA_DIR);
const BINANCE_CACHE = new URL("binance-usdt-symbols.json", DATA_DIR);
const CLS_PATH = new URL("news-classified-v2.jsonl", OUT_DIR);
mkdirSync(OUT_DIR, { recursive: true });

const MODEL_NAME = "minimax-m2.7:cloud";
const PROMPT_VERSION = "v2-vibe-2026-07-15";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;
const CALL_TIMEOUT_MS = 120_000;
const CONTENT_CLIP = 4_000;

// --- Binance-листинг: тот же кэш, что у v1 (TTL 7 дней) ---
async function loadBinanceSymbols() {
  const WEEK = 7 * 24 * 36e5;
  if (existsSync(BINANCE_CACHE) && Date.now() - statSync(BINANCE_CACHE).mtimeMs < WEEK) {
    return new Set(JSON.parse(readFileSync(BINANCE_CACHE, "utf8")));
  }
  const resp = await fetch("https://api.binance.com/api/v3/exchangeInfo");
  if (!resp.ok) throw new Error(`Binance exchangeInfo HTTP ${resp.status}`);
  const info = await resp.json();
  const symbols = info.symbols
    .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING" && s.isSpotTradingAllowed)
    .map((s) => s.symbol);
  writeFileSync(BINANCE_CACHE, JSON.stringify(symbols));
  return new Set(symbols);
}

// --- v2-схема: контракт {symbol,direction,confidence} + аудит event_type/reason ---
const SCHEMA = {
  type: "object",
  properties: {
    symbol: { type: ["string", "null"] },
    direction: { type: ["string", "null"], enum: ["long", "short", null] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    event_type: {
      type: "string",
      enum: ["etf-flow", "regulation", "legal", "macro", "security", "adoption", "market-structure", "other"],
    },
    reason: { type: "string" },
  },
  required: ["symbol", "direction", "confidence", "event_type", "reason"],
};

// v2-промпт. Отличия от v1 (приёмы Vibe-Trading, event-driven/SKILL.md):
//  - пошаговость symbol → direction → confidence;
//  - ЯКОРЯ направлений (конкретные примеры событий long/short/null);
//  - калиброванная шкала confidence 0.9/0.6/0.3 с примерами (вместо «на глаз»);
//  - таксономия event_type + reason одним предложением (аудит, дисциплинирует);
//  - «null — правильный и частый ответ» (event sparsity: не выдумывать сигнал).
const SYSTEM_PROMPT = [
  "You are a crypto news classifier. You will be given one news article (title and excerpt).",
  "Answer with STRICT JSON only, matching this schema:",
  '{"symbol": string|null, "direction": "long"|"short"|null, "confidence": number, "event_type": string, "reason": string}',
  "",
  "Work in steps:",
  "",
  'Step 1 — "symbol": the ticker of the SINGLE main crypto asset the article is about (e.g. "BTC", "ETH", "SOL", "XRP", "DOGE").',
  "- Broad crypto-market or macro news (Fed, inflation, regulation of the whole market) counts as \"BTC\" ONLY if",
  "  Bitcoin or the crypto market as a whole is the explicit subject of expected impact; otherwise null.",
  "- If the article is not about a crypto asset at all, or covers many assets with no single main one: null.",
  "",
  'Step 2 — "direction": the expected effect of this news on the PRICE of that asset. Calibration anchors:',
  '- "long": spot-ETF approval or large documented ETF inflows; a major company, fund or state buying the asset;',
  "  a court ruling or regulation explicitly favorable to the asset; a large supply reduction.",
  '- "short": exchange hack or protocol exploit; a regulator lawsuit or ban targeting the asset; a major holder',
  "  selling or forced liquidation; delisting or loss of market access.",
  '- null: routine price commentary with no new fact; mixed news with bullish and bearish elements of similar',
  "  weight; pure technical-analysis opinion.",
  "",
  'Step 3 — "confidence": how strongly the text itself supports the direction call. Calibrated scale:',
  "- 0.9: a major, concrete, dated event directly about the asset (ETF approved, exchange hacked, lawsuit filed).",
  "- 0.6: clear directional news but indirect, partial or second-hand (analyst-reported flows, rumored decision,",
  "  industry-wide policy that includes the asset).",
  '- 0.3: weak or speculative hints (opinions, forecasts, "could/may" phrasing).',
  "Intermediate values are allowed. If direction is null, confidence is your confidence that NO call should be made.",
  "",
  '- "event_type": one of "etf-flow", "regulation", "legal", "macro", "security", "adoption", "market-structure", "other".',
  '- "reason": ONE short sentence quoting the decisive fact from the text.',
  "",
  "Rules:",
  "- Judge ONLY from the given text. Do not use any knowledge of current prices or later events.",
  "- Do not force a call: null is a correct and common answer — most general finance news has no single crypto asset.",
].join("\n");

const ollama = new Ollama({
  host: "https://ollama.com",
  headers: { Authorization: `Bearer ${process.env.OLLAMA_TOKEN}` },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function classifyOne(title, content) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await Promise.race([
        ollama.chat({
          model: MODEL_NAME,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `TITLE: ${title}\n\nEXCERPT: ${content.slice(0, CONTENT_CLIP)}` },
          ],
          format: SCHEMA,
          think: false,
          stream: false,
        }),
        sleep(CALL_TIMEOUT_MS).then(() => { throw new Error("completion timed out"); }),
      ]);
      const parsed = JSON.parse(jsonrepair(resp.message?.content ?? ""));
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      const { symbol, direction, confidence, event_type, reason } = parsed;
      if (symbol !== null && typeof symbol !== "string") throw new Error("bad symbol");
      if (direction !== null && direction !== "long" && direction !== "short") throw new Error("bad direction");
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) throw new Error("bad confidence");
      if (typeof event_type !== "string") throw new Error("bad event_type");
      if (typeof reason !== "string") throw new Error("bad reason");
      return { symbol, direction, confidence, event_type, reason };
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

// Нормализация тикера — копия v1 (v1 не экспортирует, а редактировать его нельзя).
function normalizeTicker(raw) {
  let t = String(raw).trim().toUpperCase().replace(/^\$/, "");
  t = t.replace(/[-_/](USDT|USD|USDC)$/, "");
  const pair = t.match(/^([A-Z0-9]{2,10})(USDT|USD)$/);
  if (pair) t = pair[1];
  return /^[A-Z0-9]{2,10}$/.test(t) ? t : null;
}

// --- Основной цикл: идемпотентно по url, фиксация после каждой новости ---
const done = new Set();
if (existsSync(CLS_PATH)) {
  for (const line of readFileSync(CLS_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).url); } catch { /* skip */ }
  }
}
const rawItems = [];
if (existsSync(RAW_PATH)) {
  for (const line of readFileSync(RAW_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const it = JSON.parse(line); if (!done.has(it.url)) rawItems.push(it); } catch { /* skip */ }
  }
}
console.log(`[classify-v2] ${new Date().toISOString()} model=${MODEL_NAME} prompt=${PROMPT_VERSION} already=${done.size} todo=${rawItems.length}`);

const binance = await loadBinanceSymbols();
console.log(`[classify-v2] binance USDT spot pairs: ${binance.size}`);

const counters = { ok: 0, no_symbol: 0, no_direction: 0, not_listed: 0, failed: 0 };
for (const it of rawItems) {
  let verdict;
  try {
    verdict = await classifyOne(it.title, it.content);
  } catch (e) {
    counters.failed++;
    console.log(`FAIL\t${it.domain}\t${String(e?.message || e).slice(0, 80)}\t${it.url.slice(0, 90)}`);
    continue;
  }
  let status = "ok", reason = null, pair = null;
  const base = verdict.symbol === null ? null : normalizeTicker(verdict.symbol);
  if (base === null) {
    status = "rejected"; reason = "no_symbol";
  } else if (verdict.direction === null) {
    status = "rejected"; reason = "no_direction";
  } else if (!binance.has(base + "USDT")) {
    status = "rejected"; reason = "not_listed";
  } else {
    pair = base + "USDT";
  }
  counters[reason ?? "ok"]++;
  appendFileSync(CLS_PATH, JSON.stringify({
    url: it.url,
    domain: it.domain,
    title: it.title,
    publishedDate: it.publishedDate,
    class: it.class,
    symbolRaw: verdict.symbol,
    symbol: pair,
    direction: verdict.direction,
    confidence: verdict.confidence,
    eventType: verdict.event_type,
    llmReason: verdict.reason,
    status, reason,
    model: MODEL_NAME,
    promptVersion: PROMPT_VERSION,
    classifiedAt: new Date().toISOString(),
  }) + "\n");
  console.log(`${status === "ok" ? "OK" : "REJ"}\t${it.domain}\t${pair ?? verdict.symbol}\t${verdict.direction}\tconf=${verdict.confidence}\t${verdict.event_type}\t${reason ?? ""}`);
}

console.log(`[classify-v2] done: ok=${counters.ok} rejected(no_symbol=${counters.no_symbol}, no_direction=${counters.no_direction}, not_listed=${counters.not_listed}) failed=${counters.failed}`);
