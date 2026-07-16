// news_mongo_sync.mjs — шаг 4 конвейера NEWS→ParserItem (канон автора 14.07, DECISIONS №76/№84).
// Идемпотентное зеркало журнала news-classified.jsonl → Mongo `news-audit`.verdicts
// (localhost:27017). JSONL остаётся ИСТОЧНИКОМ ИСТИНЫ; mongo — read-модель под будущие
// getSignal(when)-запросы (см. news_query.mjs) и фит pump-anomaly.
// Пишутся ВСЕ вердикты, включая rejected — иначе отсев/фит не пересчитать задним числом.
// База news-audit — НЕ backtest-pro (боевая база live-бота; «прод пишется отдельно» — автор).
//
// Времена — ДВА поля (канон + урок Vibe «knowable date»):
//   publishedAt — когда новость случилась (канон getSignal: publishedAt ≤ when);
//   fetchedAt   — когда новость появилась у НАС (= collectedAt шага collect;
//                 фолбэк classifiedAt, если raw-записи вдруг нет);
//   backfill    — true для записей week-затравки (в live они стали бы доступны лишь
//                 с fetchedAt, спустя дни после publishedAt — фит может исключить).
// promptVersion: записи журнала без поля = "v1" (переход крона на v2.1 — DECISIONS №84).
// midnightUtc: полуночная 00:00Z дата — артефакт индекса Tavily (правило №66);
//   в зеркало пишем со status как есть, фильтрация — правило ПОТРЕБИТЕЛЯ (news_query.mjs).
//   Сейчас таких 0 (collect их отбрасывает), флаг — на случай других путей пополнения.
// syncedAt ставится $setOnInsert: повторный прогон по неизменному журналу даёт
//   upserted=0 modified=0 — настоящий дрейф контента виден по счётчику modified.
//
// Usage: node news_mongo_sync.mjs   (cwd не важен, пути зашиты относительно скрипта)
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const DATA_DIR = new URL("../../../agent/notes/news-dataset/", import.meta.url);
const RAW_PATH = new URL("news-raw.jsonl", DATA_DIR);
const CLS_PATH = new URL("news-classified.jsonl", DATA_DIR);

// mongoose из живого ingest-форка (прецедент pump_bench/forward.mjs:41 — дублей в deps не тащим)
const ingestRequire = createRequire("/home/s1dd1/dev/quant/backtest-ollama-crontab/package.json");
const mongoose = ingestRequire("mongoose");

const MONGO = "mongodb://localhost:27017/news-audit"; // НЕ backtest-pro!

const readJsonl = (u) => existsSync(u)
  ? readFileSync(u, "utf8").split("\n").filter((l) => l.trim())
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

const cls = readJsonl(CLS_PATH);
const rawByUrl = new Map(readJsonl(RAW_PATH).map((r) => [r.url, r]));

const syncedAt = new Date();
const ops = [];
const counters = { journal: cls.length, prepared: 0, bad_date: 0, no_raw: 0, backfill: 0, midnight: 0 };
for (const c of cls) {
  const publishedAt = new Date(c.publishedDate);
  if (Number.isNaN(publishedAt.getTime())) {
    counters.bad_date++;
    console.log(`SKIP bad_date\t${c.url}`);
    continue;
  }
  const raw = rawByUrl.get(c.url);
  if (!raw) counters.no_raw++;
  const fetchedAt = raw?.collectedAt ? new Date(raw.collectedAt) : new Date(c.classifiedAt);
  const backfill = raw?.window === "week";
  const midnightUtc = publishedAt.getUTCHours() === 0 && publishedAt.getUTCMinutes() === 0;
  if (backfill) counters.backfill++;
  if (midnightUtc) counters.midnight++;
  ops.push({
    updateOne: {
      filter: { url: c.url },
      update: {
        $set: {
          domain: c.domain,
          title: c.title,
          class: c.class,
          tavilyScore: raw?.score ?? null,
          publishedAt,
          fetchedAt,
          backfill,
          midnightUtc,
          symbolRaw: c.symbolRaw,
          symbol: c.symbol,
          direction: c.direction,
          confidence: c.confidence,
          eventType: c.eventType ?? null,
          llmReason: c.llmReason ?? null,
          status: c.status,
          rejectReason: c.reason ?? null,
          model: c.model,
          promptVersion: c.promptVersion ?? "v1",
          classifiedAt: new Date(c.classifiedAt),
        },
        $setOnInsert: { syncedAt },
      },
      upsert: true,
    },
  });
  counters.prepared++;
}

await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10_000 });
const col = mongoose.connection.db.collection("verdicts");
await col.createIndex({ url: 1 }, { unique: true });
await col.createIndex({ symbol: 1, publishedAt: 1 });
await col.createIndex({ domain: 1, publishedAt: 1 });

let res = { upsertedCount: 0, matchedCount: 0, modifiedCount: 0 };
if (ops.length) res = await col.bulkWrite(ops, { ordered: false });

const total = await col.countDocuments();
const okN = await col.countDocuments({ status: "ok" });
const stats = await mongoose.connection.db.stats();
await mongoose.disconnect();

console.log(`[mongo-sync] ${syncedAt.toISOString()} journal=${counters.journal} prepared=${counters.prepared} bad_date=${counters.bad_date} no_raw=${counters.no_raw}`);
console.log(`[mongo-sync] upserted=${res.upsertedCount} matched=${res.matchedCount} modified=${res.modifiedCount} | collection: total=${total} ok=${okN} backfill=${counters.backfill} midnightUtc=${counters.midnight}`);
console.log(`[mongo-sync] db=news-audit dataSize=${(stats.dataSize / 1024).toFixed(1)}KB storageSize=${(stats.storageSize / 1024).toFixed(1)}KB indexSize=${(stats.indexSize / 1024).toFixed(1)}KB`);
