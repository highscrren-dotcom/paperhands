// news_query.mjs — read-side помощник над зеркалом `news-audit`.verdicts (шаг 4,
// news_mongo_sync.mjs). Демонстрация канона автора (№76): «на стороне backtest-kit —
// запрос в mongo через getSignal, последний аргумент when: Date — виртуальное время
// бэктеста». НЕ подключён ни к какой стратегии — инструмент будущего фита pump-anomaly.
//
// Look-ahead невозможен по построению: publishedAt ≤ when вшит в фильтр, when обязателен.
//
// itemsFor({symbol?, domain?, when, promptVersion?, includeBackfill?, includeMidnight?})
//   → массив ParserItem-подобных (channel=domain, ts=publishedAt.getTime(), id=url,
//   + extra-поля confidence/class как в news_dataset.mjs), сортировка по ts.
//   Строгие дефолты:
//   - status:"ok" — всегда;
//   - publishedAt ≤ when — всегда;
//   - backfill:{$ne:true} — week-затравка исключена (в live была бы доступна лишь
//     с fetchedAt); includeBackfill:true возвращает и её;
//   - midnightUtc:{$ne:true} — правило №66 на стороне потребителя; includeMidnight:true снимает;
//   - ОДНА promptVersion за запрос (дрейф-урок Vibe: версии не смешивать);
//     дефолт — версия самой свежей записи зеркала (max classifiedAt).
//
// CLI: node news_query.mjs --when <ISO> [--symbol BTCUSDT] [--domain kitco.com]
//        [--prompt-version v1] [--include-backfill] [--include-midnight]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// mongoose из живого ingest-форка (прецедент pump_bench/forward.mjs:41 — дублей в deps не тащим)
const ingestRequire = createRequire("/home/s1dd1/dev/quant/backtest-ollama-crontab/package.json");
const mongoose = ingestRequire("mongoose");

const MONGO = "mongodb://localhost:27017/news-audit"; // НЕ backtest-pro!

let connected = false;
async function verdicts() {
  if (!connected) {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10_000 });
    connected = true;
  }
  return mongoose.connection.db.collection("verdicts");
}

export async function close() {
  if (connected) { await mongoose.disconnect(); connected = false; }
}

// Дефолт promptVersion = версия самой свежей записи зеркала (свежесть = classifiedAt).
export async function newestPromptVersion() {
  const col = await verdicts();
  const last = await col.find({}).sort({ classifiedAt: -1 }).limit(1)
    .project({ promptVersion: 1 }).next();
  return last?.promptVersion ?? "v1";
}

export async function itemsFor({
  symbol, domain, when, promptVersion,
  includeBackfill = false, includeMidnight = false,
} = {}) {
  const at = when instanceof Date ? when : new Date(when);
  if (when == null || Number.isNaN(at.getTime())) {
    throw new Error("itemsFor: обязателен валидный when (Date|ISO) — виртуальное время бэктеста");
  }
  const col = await verdicts();
  const pv = promptVersion ?? await newestPromptVersion();
  const filter = { status: "ok", publishedAt: { $lte: at }, promptVersion: pv };
  if (!includeBackfill) filter.backfill = { $ne: true };
  if (!includeMidnight) filter.midnightUtc = { $ne: true };
  if (symbol) filter.symbol = symbol;
  if (domain) filter.domain = domain;
  const docs = await col.find(filter).sort({ publishedAt: 1 }).toArray();
  return docs.map((d) => ({
    channel: d.domain,
    symbol: d.symbol,
    direction: d.direction,
    ts: d.publishedAt.getTime(),
    id: d.url,
    confidence: d.confidence,
    class: d.class,
    eventType: d.eventType ?? null, // v2.1; у v1-записей null
  }));
}

// --- CLI ---
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const has = (name) => argv.includes(name);
  try {
    const params = {
      when: opt("--when"),
      symbol: opt("--symbol"),
      domain: opt("--domain"),
      promptVersion: opt("--prompt-version"),
      includeBackfill: has("--include-backfill"),
      includeMidnight: has("--include-midnight"),
    };
    const items = await itemsFor(params);
    for (const i of items) console.log(JSON.stringify(i));
    console.log(`[query] when=${new Date(params.when).toISOString()} promptVersion=${params.promptVersion ?? (await newestPromptVersion()) + " (дефолт)"} backfill=${params.includeBackfill ? "included" : "excluded"} → items=${items.length}`);
  } catch (e) {
    console.error(`[query] ${e.message}`);
    process.exitCode = 1;
  } finally {
    await close();
  }
}
