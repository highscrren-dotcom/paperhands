/**
 * shadow — ТЕНЕВОЙ леджер обеих спорных механик (решение владельца 12.07,
 * DECISIONS №67): каждый пост канала после заморозки модели, НЕЗАВИСИМО от
 * гейтов и направления, оценивается авторским planForAt (он гейтов не имеет,
 * №25) в двух ветках:
 *
 *   A "asis"    — модельная оценка, направление как есть (шорт как шорт) =
 *                 «модель + фьючерсы». ВАЖНО: planForAt гонит вердикт через
 *                 буквально тот же конвейер гейтов (buildSignal) — null
 *                 значит «модель отказалась» (momentum и др.), не «нет филла»;
 *   B "flipped" — модельная оценка, направление перевёрнуто = «модель +
 *                 channelPlan=invert» (сейчас канал классифицирован enter);
 *   C "rawshort"— MODEL-FREE replay поста по его же зонам/целям/стопу
 *                 (механика аудита каналов: тач зоны 24ч → TP1-vs-SL,
 *                 одна свеча = SL консервативно, таймаут 72ч) = «кормит ли
 *                 СЫРОЙ поток канала при фьючах, без модели вообще».
 *                 Инверт model-free не меряем: у перевёрнутого поста нет
 *                 честной разметки целей (изобретать зеркальные = отсебятина).
 *
 * НИЧЕГО НЕ ТОРГУЕТ. Меряет. Гейты решений — в DECISIONS №67: ≥4 недели или
 * ≥20 сделок/ветку; C в плюс нетто → разговор о futures live; B в плюс →
 * РЕФИТ (пусть channelPlan сам решит), не форсирование.
 *
 * Только форвард-посты (ts > FORWARD_START): история до заморозки — in-sample
 * фита, её оценка вводила бы в заблуждение.
 *
 * Запуск: node scripts/pump_bench/shadow.mjs (из example/), либо авто —
 * хвостом forward.mjs (ежечасный крон). Идемпотентно по (item.id, branch).
 * pnl planForAt — БРУТТО; в сводке отдельно haircut 0.4% (как в форварде).
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PumpMatrix } from "pump-anomaly";

import { getCandles } from "./fast_candles.mjs";
import { aggregate, pct } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const LEDGER = join(OUT, "shadow-ledger.jsonl");
const MODEL_FILE = join(HERE, "assets/forward-model-v1.json");
const MONGO = process.env.MONGO_URL || "mongodb://localhost:27017/backtest-pro";
const FORWARD_START = Date.parse("2026-07-07T00:00:00Z"); // заморозка forward-model-v1
const ingestRequire = createRequire(process.env.INGEST_PKG || "/home/s1dd1/dev/quant/backtest-ollama-crontab/package.json");

const readJsonl = (f) =>
  existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

const flip = (d) => (d === "short" ? "long" : "short");

// --- ветка C: model-free replay по разметке ПОСТА (как replay_channel.mjs) ---
const RAW_ENTRY_MIN = 1440;
const RAW_EVAL_MIN = 4320;
const MIN_MS = 60_000;

function rawReplay(item, candles) {
  if (!candles || candles.length < 5) return { entered: false, reason: "no-data" };
  const long = item.direction === "long";
  const lo = Math.min(item.entryFromPrice, item.entryToPrice);
  const hi = Math.max(item.entryFromPrice, item.entryToPrice);
  const deadline = item.ts + RAW_ENTRY_MIN * MIN_MS;
  let fillIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.timestamp > deadline) break;
    if (c.low <= hi && c.high >= lo) { fillIdx = i; break; }
  }
  if (fillIdx < 0)
    return { entered: false, reason: Date.now() < deadline ? "pending" : "no-fill" };
  const entry = long ? hi : lo; // консервативно: худший край зоны
  const tp1 = item.targets?.[0];
  const sl = item.stoploss;
  if (tp1 == null || sl == null) return { entered: false, reason: "no-markup" };
  const evalEnd = candles[fillIdx].timestamp + RAW_EVAL_MIN * MIN_MS;
  for (let i = fillIdx; i < candles.length; i++) {
    const c = candles[i];
    if (c.timestamp > evalEnd) break;
    const hitSL = long ? c.low <= sl : c.high >= sl;
    const hitTP = long ? c.high >= tp1 : c.low <= tp1;
    if (hitSL) // одна свеча оба тача → SL, консервативно
      return { entered: true, reason: "sl", pnl: long ? sl / entry - 1 : entry / sl - 1, minutes: Math.round((c.timestamp - candles[fillIdx].timestamp) / MIN_MS) };
    if (hitTP)
      return { entered: true, reason: "tp1", pnl: long ? tp1 / entry - 1 : entry / tp1 - 1, minutes: Math.round((c.timestamp - candles[fillIdx].timestamp) / MIN_MS) };
  }
  const last = candles[candles.length - 1];
  if (Date.now() < evalEnd && last.timestamp < evalEnd - 5 * MIN_MS)
    return { entered: false, reason: "open" };
  return { entered: true, reason: "timeout", pnl: long ? last.close / entry - 1 : entry / last.close - 1, minutes: Math.round((last.timestamp - candles[fillIdx].timestamp) / MIN_MS) };
}

export async function runShadow() {
  const model = PumpMatrix.load(readFileSync(MODEL_FILE, "utf8"));
  const staleMs =
    ((JSON.parse(readFileSync(MODEL_FILE, "utf8")).exit?.global?.staleMinutes ?? 720) * 2 + 5) * 60000;

  const mongoose = ingestRequire("mongoose");
  await mongoose.connect(MONGO);
  const docs = await mongoose.connection.db
    .collection("parser-items").find({}).sort({ publishedAt: 1 }).toArray();
  await mongoose.disconnect();

  const items = docs
    .map((d) => ({
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
    }))
    .filter((i) => i.ts > FORWARD_START);

  const done = new Set(readJsonl(LEDGER).map((r) => `${r.id}|${r.branch}`));
  // созревание: для модельных веток — как forward EVALUATE (staleMs);
  // для rawshort окно длиннее (вход 24ч + оценка 72ч), зреет позже
  const ripeModel = items.filter((i) => Date.now() - i.ts > staleMs);
  const ripeRaw = items.filter((i) => Date.now() - i.ts > (RAW_ENTRY_MIN + RAW_EVAL_MIN + 5) * MIN_MS);

  // lookback для объяснимости модельных отказов (формула plan(), как в forward)
  const pol = model.params?.policy ?? {};
  const momWin = pol.minMomentum24hPct !== undefined ? (pol.momentumWindowMinutes ?? 1440) + 5 : 0;
  const EXPLAIN_LOOKBACK = Math.max(model.lookbackMinutes ?? 0, momWin, 65);

  let evaluated = 0;
  for (const it of ripeModel) {
    for (const branch of ["asis", "flipped"]) {
      if (done.has(`${it.id}|${branch}`)) continue;
      const direction = branch === "asis" ? it.direction : flip(it.direction);
      try {
        const candles = await getCandles(
          it.symbol, "1m", undefined, it.ts, Math.min(Date.now(), it.ts + staleMs),
        );
        const bt = model.planForAt(
          it.symbol, direction, it.channel, candles, it.ts,
          { acknowledgeUncertified: true },
        );
        // null = конвейер модели отказал; берём честную причину из explainSignals
        let rejectedBy = null;
        if (!bt) {
          try {
            const start = Math.floor(it.ts / MIN_MS) * MIN_MS;
            const before = await getCandles(
              it.symbol, "1m", undefined, start - EXPLAIN_LOOKBACK * MIN_MS, start + MIN_MS,
            );
            const ex = model.explainSignals(
              [{ ...it, direction }], { [it.symbol]: before }, { acknowledgeUncertified: true },
            )[0];
            // emitted в explain + null в planForAt = гейты пройдены, но
            // разметка replay не дала входа — модельный no-fill
            rejectedBy = !ex ? null
              : ex.emitted ? "гейты пройдены — вход не налился (no-fill)"
              : `${ex.rejectedBy}: ${(ex.detail ?? "").slice(0, 90)}`;
          } catch { /* объяснение опционально */ }
        }
        appendFileSync(LEDGER, JSON.stringify({
          id: it.id,
          branch,
          symbol: it.symbol,
          dirOrig: it.direction,
          dirEval: direction,
          ts: it.ts,
          messageId: it.messageId,
          evaluatedAt: new Date().toISOString(),
          result: bt?.result ?? null,
          rejectedBy,
        }) + "\n");
        evaluated++;
      } catch (e) {
        console.log(`[shadow] ${it.symbol} ${branch}: ошибка оценки — ${String(e.message).slice(0, 90)}`);
      }
    }
  }
  for (const it of ripeRaw) {
    if (done.has(`${it.id}|rawshort`)) continue;
    try {
      const candles = await getCandles(
        it.symbol, "1m", undefined, it.ts,
        Math.min(Date.now(), it.ts + (RAW_ENTRY_MIN + RAW_EVAL_MIN) * MIN_MS),
      );
      const r = rawReplay(it, candles);
      if (r.reason === "pending" || r.reason === "open") continue; // дозреет — оценим
      appendFileSync(LEDGER, JSON.stringify({
        id: it.id,
        branch: "rawshort",
        symbol: it.symbol,
        dirOrig: it.direction,
        dirEval: it.direction,
        ts: it.ts,
        messageId: it.messageId,
        evaluatedAt: new Date().toISOString(),
        result: r.entered ? { entered: true, pnl: r.pnl, reason: r.reason, minutes: r.minutes } : null,
        rejectedBy: r.entered ? null : r.reason,
      }) + "\n");
      evaluated++;
    } catch (e) {
      console.log(`[shadow] ${it.symbol} rawshort: ошибка — ${String(e.message).slice(0, 90)}`);
    }
  }

  const rows = readJsonl(LEDGER);
  const NAMES = {
    asis: "A модель+фьючи (as-is)",
    flipped: "B модель+инверт (flipped)",
    rawshort: "C сырой канал+фьючи (model-free)",
  };
  console.log(`[shadow] постов после заморозки: ${items.length}, созревших model/raw: ${ripeModel.length}/${ripeRaw.length}, новых оценок: ${evaluated}`);
  for (const branch of ["asis", "flipped", "rawshort"]) {
    const bRows = rows.filter((r) => r.branch === branch);
    const entered = bRows.filter((r) => r.result?.entered).sort((a, b) => a.ts - b.ts);
    const pnls = entered.map((r) => r.result.pnl);
    const rejects = bRows.filter((r) => !r.result?.entered);
    console.log(`[shadow] ${NAMES[branch]}: сделок ${entered.length}, отказов ${rejects.length}`);
    for (const r of rejects)
      console.log(`[shadow]   − ${r.symbol} ${r.dirEval} @${new Date(r.ts).toISOString().slice(5, 16)}: ${r.rejectedBy ?? "нет входа"}`);
    if (pnls.length) {
      console.log(`[shadow]   сырая: ${JSON.stringify(aggregate(pnls))}`);
      console.log(`[shadow]   haircut 0.4%: ${JSON.stringify(aggregate(pnls.map((x) => x - 0.004)))}`);
      for (const r of entered)
        console.log(`[shadow]   + ${r.symbol} ${r.dirOrig}→${r.dirEval} @${new Date(r.ts).toISOString().slice(5, 16)} pnl=${pct(r.result.pnl)}% (${r.result.reason}, ${r.result.minutes ?? "-"}м)`);
    }
  }
  return { evaluated };
}

// CLI-запуск: node scripts/pump_bench/shadow.mjs
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  await runShadow();
}
