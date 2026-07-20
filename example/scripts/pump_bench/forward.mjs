/**
 * forward — ФОРВАРД-ОКНО pump-пути: живой ingest → замороженная модель → леджер.
 * Это начало этапа A дорожной карты live (протокол: agent/notes/forward-protocol.md).
 *
 * Один прогон делает две фазы:
 *
 *  DECIDE:  Mongo backtest-pro.parser-items (живой Telegram-ingest
 *           backtest-ollama-crontab) → конвертация в ParserItem →
 *           plan() на ЗАМОРОЖЕННОЙ forward-model-v1
 *           (deployment=paper → acknowledgeUncertified:true — осознанный
 *           бумажный форвард, решение владельца от 2026-07-08) →
 *           каждое решение (вошли/отсечены+почему через explainSignals)
 *           дописывается в out/forward-ledger.jsonl. Идемпотентно по item.id.
 *
 *  EVALUATE: записи леджера с сигналом, «созревшие» (прошло ≥ staleMinutes·2+5
 *           от ts), реплеятся planForAt() по фактическим 1m-свечам →
 *           реализованный pnl в out/forward-results.jsonl + сводка (наша
 *           aggregate с epsilon-guard). pnl СЫРОЙ — фрикшн-haircut в сводке.
 *
 * Запуск из example/: node scripts/pump_bench/forward.mjs
 * Автоматизация: cron ежечасно (см. forward-protocol.md).
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PumpMatrix, PaperTrader } from "pump-anomaly";

import { getCandles } from "./fast_candles.mjs";
import { getFactors } from "./factors.mjs";
import { aggregate, pct } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const LEDGER = join(OUT, "forward-ledger.jsonl");
const RESULTS = join(OUT, "forward-results.jsonl");
const MODEL_FILE = join(HERE, "assets/forward-model-v1.json");
const MONGO = process.env.MONGO_URL || "mongodb://localhost:27017/backtest-pro";
// mongoose берём из живого ingest-форка (у example его нет в deps — не тащим дубль)
const ingestRequire = createRequire(process.env.INGEST_PKG || "/home/s1dd1/dev/quant/backtest-ollama-crontab/package.json");

const readJsonl = (f) =>
  existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

const model = PumpMatrix.load(readFileSync(MODEL_FILE, "utf8"));
console.log(`[forward] model v1: deployment=${model.deployment.verdict}, reliable=${model.reliable}`);

// ---------- DECIDE ----------
const mongoose = ingestRequire("mongoose");
await mongoose.connect(MONGO);
const docs = await mongoose.connection.db
  .collection("parser-items").find({}).sort({ publishedAt: 1 }).toArray();
await mongoose.disconnect();

const toParserItem = (d) => ({
  id: String(d._id),
  channel: d.channel,
  symbol: d.symbol,
  direction: d.direction,
  ts: new Date(d.publishedAt).getTime(),
  entryFromPrice: d.entry?.from,
  entryToPrice: d.entry?.to,
  targets: d.targets,
  stoploss: d.stoploss,
  messageId: d.messageId,
});

const seen = new Set(readJsonl(LEDGER).map((r) => r.item.id));
let fresh = docs.map(toParserItem).filter((i) => !seen.has(i.id));
console.log(`[forward] в Mongo: ${docs.length}, новых для решения: ${fresh.length}`);

// стоп-флаг дрейф-монитора: alarm → новых решений не принимаем до решения
// владельца (EVALUATE продолжается — созревшие сделки дооцениваем всегда)
const ALARM_FLAG = join(OUT, "DRIFT-ALARM");
if (fresh.length && existsSync(ALARM_FLAG)) {
  console.log(`[forward] ДРЕЙФ-АЛАРМ активен (${ALARM_FLAG}) — DECIDE пропущен для ${fresh.length} новых постов`);
  fresh = [];
}

if (fresh.length) {
  // live-семантика: свечи строго до сигнала; ack — задокументированное решение
  const signals = await model.plan(fresh, getCandles, { acknowledgeUncertified: true });
  const bySigKey = new Map(signals.map((s) => [`${s.symbol}|${s.ts}`, s]));
  // словарь свечей для честного explain: без него buildSignalCore получает
  // null и rejectedBy ВСЕГДА «momentum-gate: нет свечей» (артефакт, вскрыт
  // 10.07 на TAO/SOL — настоящая причина была «momentum ниже порога»).
  // Свечи заканчиваются НА минуте сигнала (как в plan) — explain на партию
  // из одного item, чтобы не подмешивать чужое время. Lookback — той же
  // формулой, что plan(): momentum-окно (если фильтр включён) поверх
  // базового lookbackMinutes модели.
  const MIN_MS = 60_000;
  const pol = model.params?.policy ?? {};
  const momWin = pol.minMomentum24hPct !== undefined ? (pol.momentumWindowMinutes ?? 1440) + 5 : 0;
  const EXPLAIN_LOOKBACK = Math.max(model.lookbackMinutes ?? 0, momWin, 65);
  for (const item of fresh) {
    const key = `${item.symbol}|${item.ts}`;
    // факторы demo/ccxt (volume-skew + garch) — observation-only: пишем рядом
    // с решением для будущей оценки их ценности, на решение НЕ влияют
    const factors = await getFactors(item.symbol);
    let explain = null;
    if (model.explainSignals) {
      let dict;
      try {
        const start = Math.floor(item.ts / MIN_MS) * MIN_MS;
        dict = {
          [item.symbol]: await getCandles(
            item.symbol, "1m", undefined,
            new Date(start - EXPLAIN_LOOKBACK * MIN_MS), new Date(start + MIN_MS),
          ),
        };
      } catch {
        dict = undefined; // битый символ: explain без свечей честно скажет «нет свечей»
      }
      // та же политика, что и в plan(): иначе explain врёт «uncertified-model»
      explain = model.explainSignals([item], dict, { acknowledgeUncertified: true })[0] ?? null;
    }
    const rec = {
      decidedAt: new Date().toISOString(),
      modelVersion: "forward-v1",
      item,
      signal: bySigKey.get(key) ?? null,
      explain,
      factors,
    };
    appendFileSync(LEDGER, JSON.stringify(rec) + "\n");
    console.log(`[forward] ${item.symbol} ${item.direction} @${new Date(item.ts).toISOString()} → ${
      rec.signal ? `SIGNAL ${rec.signal.action} ${rec.signal.direction}` : `отсечён (${rec.explain?.rejectedBy ?? "?"})`
    }`);
  }
}

// ---------- EVALUATE ----------
const staleMs = ((JSON.parse(readFileSync(MODEL_FILE, "utf8")).exit?.global?.staleMinutes ?? 720) * 2 + 5) * 60000;
const done = new Set(readJsonl(RESULTS).map((r) => r.id));
const ripe = readJsonl(LEDGER).filter(
  (r) => r.signal && !done.has(r.item.id) && Date.now() - r.item.ts > staleMs,
);
console.log(`[forward] созревших для оценки: ${ripe.length}`);

for (const r of ripe) {
  try {
    const candles = await getCandles(r.item.symbol, "1m", undefined, r.item.ts, Math.min(Date.now(), r.item.ts + staleMs));
    // реплеим направление СИГНАЛА, не поста: при action=invert они противоположны
    // (вскрыто 13.07 на первом инверте WLD — реплей по item.direction оценивал
    // несуществующий лонг вместо модельного шорта)
    const bt = model.planForAt(
      r.item.symbol, r.signal.direction ?? r.item.direction, r.item.channel, candles, r.item.ts,
      { acknowledgeUncertified: true },
    );
    const rec = {
      id: r.item.id,
      evaluatedAt: new Date().toISOString(),
      symbol: r.item.symbol,
      direction: r.signal.direction,
      action: r.signal.action,
      ts: r.item.ts,
      result: bt?.result ?? null,
    };
    appendFileSync(RESULTS, JSON.stringify(rec) + "\n");
    console.log(`[forward] оценка ${rec.symbol}: pnl=${rec.result ? pct(rec.result.pnl) + "%" : "нет входа"} (${rec.result?.reason ?? "-"})`);
  } catch (e) {
    console.log(`[forward] оценка ${r.item.symbol} не удалась: ${e.message.slice(0, 100)}`);
  }
}

// ---------- сводка ----------
const results = readJsonl(RESULTS).filter((r) => r.result && r.result.entered);
if (results.length) {
  const pnls = results.sort((a, b) => a.ts - b.ts).map((r) => r.result.pnl);
  console.log("[forward] ФОРВАРД-СВОДКА (сырая):", JSON.stringify(aggregate(pnls)));
  console.log("[forward] после 0.4% haircut:", JSON.stringify(aggregate(pnls.map((x) => x - 0.004))));

  // ---------- дрейф-монитор (PaperTrader: CUSUM + KS против history модели) ----------
  // planForAt() отдаёт БРУТТО-pnl (replay без издержек), baseline history —
  // НЕТТО (roundTripCostPct вшит в разметку fit) → перед record вычитаем COST
  // модели, чтобы монитор сравнивал яблоки с яблоками. 0.4% haircut выше —
  // отдельный консервативный сценарий сводки, в монитор его не тащим.
  const COST = (JSON.parse(readFileSync(MODEL_FILE, "utf8")).exit?.global?.roundTripCostPct ?? 0) / 100;
  const pt = new PaperTrader(model);
  for (const r of results) pt.record({ ts: r.ts, pnl: r.result.pnl - COST, symbol: r.symbol });
  const drift = pt.status();
  console.log("[forward] ДРЕЙФ:", JSON.stringify({
    alarm: drift.alarm,
    n: drift.n,
    cusum: drift.cusum.stat,
    ksPValue: drift.ks?.pValue ?? null,
    meanForward: drift.meanForward,
    meanBaseline: drift.meanBaseline,
    tradesToSignificance: drift.tradesToSignificance,
  }));
  for (const line of drift.reasons) console.log("[forward]   " + line);
  if (drift.alarm && !existsSync(ALARM_FLAG)) {
    // стоп-флаг: DECIDE замирает со следующего прогона; снятие — решение
    // владельца (rm флага); авто-refit НЕ делаем (cadence-guard + протокол)
    writeFileSync(ALARM_FLAG, JSON.stringify({ raisedAt: new Date().toISOString(), drift }, null, 2));
    console.log(`[forward] ⚠️ ДРЕЙФ-АЛАРМ: записан стоп-флаг ${ALARM_FLAG}`);
  }
} else {
  console.log("[forward] реализованных форвард-сделок пока нет");
}

// ---------- shadow (№67: тень фьючей/инверта, observation-only) ----------
// на том же часовом кроне; ошибки тени не валят форвард
try {
  const { runShadow } = await import("./shadow.mjs");
  await runShadow();
} catch (e) {
  console.log(`[forward] shadow пропущен: ${String(e.message).slice(0, 100)}`);
}
