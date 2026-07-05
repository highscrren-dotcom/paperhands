/**
 * walk_forward — честный OOS-тест pump-anomaly на полном логе Crypto Yoda.
 *
 * Дизайн (по доктрине agent/PLAN.md Phase 2 + два гейта из
 * agent/notes/author-stack-analysis.md §E-2):
 *   TRAIN: посты apr-2025..dec-2025 → PumpMatrix.fit() (exit-конфиг выбирается
 *          ТОЛЬКО на этих данных; nested-CV/DSR/PBO/SPA — внутри fit)
 *   OOS:   посты jan-2026..apr-2026 → model.backtest() с замороженными весами
 *
 * Гейт 1 (автора): model.certification.certified
 * Гейт 2 (наш, правило владельца): OVERFIT, если OOS Sharpe<0 ИЛИ return<0
 *        ИЛИ проигрыш buy&hold корзине затронутых символов; плюс флаг
 *        деградации oos_mean < 0.3×in_mean (как в agent/tools/oos-gate.mjs).
 *
 * pnl СЫРОЙ (без комиссии/слиппеджа/фандинга/спреда) — haircut-варианты в отчёте.
 * Запуск из example/: node scripts/pump_bench/walk_forward.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PumpMatrix } from "pump-anomaly";

import { aggregate, pct, writeJsonl } from "./lib.mjs";
// тяжёлый прогон → быстрый адаптер (движковый шов провалидирован в index.mjs;
// данные те же — публичный OHLCV Binance, см. шапку fast_candles.mjs)
import { getCandles } from "./fast_candles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

// CLI: node walk_forward.mjs [trainEndISO] [oosEndISO] [tag]
// дефолт — основной сплит: train apr..dec-2025, OOS jan..apr-2026, файлы wf-*
const [, , trainEndArg, oosEndArg, tagArg] = process.argv;
const SPLIT_TRAIN_END = Date.parse(trainEndArg ?? "2026-01-01T00:00:00Z"); // train < этой даты
const OOS_END = Date.parse(oosEndArg ?? "2026-05-01T00:00:00Z"); // OOS ∈ [trainEnd, oosEnd)
const TAG = tagArg ?? "wf";
const F = (name) => join(OUT, `${TAG}-${name}`); // префикс артефактов сплита

const all = JSON.parse(readFileSync(join(HERE, "assets/parser-items-full.json"), "utf8"));
const train = all.filter((i) => i.ts < SPLIT_TRAIN_END);
const oos = all.filter((i) => i.ts >= SPLIT_TRAIN_END && i.ts < OOS_END);
console.log(`[${TAG}] train: ${train.length} items (< ${new Date(SPLIT_TRAIN_END).toISOString().slice(0, 10)}), oos: ${oos.length} items (до ${new Date(OOS_END).toISOString().slice(0, 10)})`);

// ---------- FIT (только train) ----------
console.log(`[${TAG}] fit() — лейблинг 1m-реплеем + грид + nested-CV… (долго, свечи кэшируются)`);
const t0 = Date.now();
const model = await PumpMatrix.fit(train, getCandles);
console.log(`[${TAG}] fit за ${((Date.now() - t0) / 60000).toFixed(1)} мин`);
writeFileSync(F("model-weights.json"), model.save());

const cert = (() => {
  try { return model.certification; } catch (e) { return { error: e.message }; }
})();
const modelInfo = {
  mode: model.mode,
  modeReason: model.modeReason,
  reliable: model.reliable,
  confidence: model.confidence,
  historySize: model.historySize,
  effectiveTrials: model.effectiveTrials,
  fitAttempts: model.fitAttempts,
  labeling: model.labeling,
  exitGlobal: JSON.parse(model.save()).exit?.global,
  certification: cert,
};
writeFileSync(F("model-info.json"), JSON.stringify(modelInfo, null, 2));
console.log(`[${TAG}] mode=${model.mode}; reliable=${model.reliable}; certified=${cert.certified}`);
console.log(`[${TAG}] cert reasons: ${JSON.stringify(cert.reasons ?? [])}`);

// ---------- реплей: in-sample (train) и OOS ----------
console.log(`[${TAG}] backtest(train) — in-sample референс…`);
const btTrain = await model.backtest(train, getCandles);
writeJsonl(F("backtest-train.jsonl"), btTrain);

console.log(`[${TAG}] backtest(oos) — замороженные веса на невиданных месяцах…`);
const btOos = await model.backtest(oos, getCandles);
writeJsonl(F("backtest-oos.jsonl"), btOos);

const pnlsOf = (rows) =>
  rows.filter((s) => s.result && s.result.entered).sort((a, b) => a.ts - b.ts)
    .map((s) => s.result.pnl);

const inAgg = aggregate(pnlsOf(btTrain));
const oosAgg = aggregate(pnlsOf(btOos));

// помесячный OOS
const byMonth = {};
for (const s of btOos.filter((s) => s.result && s.result.entered)) {
  const ym = new Date(s.ts).toISOString().slice(0, 7);
  (byMonth[ym] ??= []).push(s.result.pnl);
}
const oosMonthly = Object.fromEntries(
  Object.entries(byMonth).sort().map(([ym, p]) => [ym, aggregate(p)]),
);

// ---------- buy & hold на OOS-окне ----------
const staleMs = (JSON.parse(model.save()).exit?.global?.staleMinutes ?? 720) * 60000;
const from = Math.min(...oos.map((i) => i.ts));
const to = Math.max(...oos.map((i) => i.ts)) + staleMs;
const buyHold = {};
const holds = [];
for (const sym of [...new Set(oos.map((i) => i.symbol))].sort()) {
  try {
    const candles = await getCandles(sym, "1h", undefined, from, to);
    if (candles.length >= 2) {
      const hold = candles.at(-1).close / candles[0].open - 1;
      buyHold[sym] = pct(hold);
      holds.push(hold);
    } else buyHold[sym] = "no data";
  } catch (e) {
    buyHold[sym] = `error: ${e.message}`;
  }
}
const basket = holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : null;
if (basket != null) buyHold["EQUAL_WEIGHT_BASKET"] = pct(basket);

// ---------- вердикты ----------
const FRICTION = 0.004; // консервативный haircut за раунд-трип
const oosNetMean = (oosAgg.meanPct ?? 0) - FRICTION * 100;
const sharpeNum = typeof oosAgg.perTradeSharpe === "number" ? oosAgg.perTradeSharpe : 0;
const oosSumFrac = (oosAgg.sumPct ?? 0) / 100;

const ourGate = {
  rule: "OVERFIT если OOS Sharpe<0 ИЛИ return<0 ИЛИ проигрыш buy&hold корзине",
  oosSharpe: oosAgg.perTradeSharpe,
  oosReturnPct: oosAgg.sumPct,
  basketHoldPct: pct(basket),
  beatsHold: basket == null ? "n/a" : oosSumFrac > basket,
  degradation:
    inAgg.meanPct && oosAgg.meanPct != null
      ? `${oosAgg.meanPct}% vs in-sample ${inAgg.meanPct}% (${
          oosAgg.meanPct < 0.3 * inAgg.meanPct ? "ДЕГРАДАЦИЯ >70%" : "ок"
        })`
      : "n/a",
  verdict:
    sharpeNum < 0 || (oosAgg.sumPct ?? 0) < 0 || (basket != null && oosSumFrac <= basket)
      ? "OVERFIT/FRAGILE"
      : "HOLDS UP (на этом сплите; не доказательство эджа)",
};

const report = {
  disclaimer:
    "pnl СЫРОЙ (без fees/slippage/funding/спреда). Один канал → mode=single. Один сплит — не полный walk-forward.",
  split: {
    trainRange: `2025-04..${new Date(SPLIT_TRAIN_END - 1).toISOString().slice(0, 7)}`,
    oosRange: `${new Date(SPLIT_TRAIN_END).toISOString().slice(0, 7)}..${new Date(OOS_END - 1).toISOString().slice(0, 7)}`,
    trainItems: train.length,
    oosItems: oos.length,
  },
  authorGate: {
    certified: cert.certified ?? null,
    dsr: cert.dsr,
    pbo: cert.pbo,
    spaPValue: cert.spaPValue,
    reasons: cert.reasons ?? [],
    reliable: model.reliable,
  },
  inSample: inAgg,
  oos: oosAgg,
  oosAfterFriction04: aggregate(pnlsOf(btOos).map((x) => x - FRICTION)),
  oosMonthly,
  oosNetMeanPctAfterFriction: Math.round(oosNetMean * 100) / 100,
  buyHold,
  ourGate,
};

writeFileSync(F("report.json"), JSON.stringify(report, null, 2));
console.log("\n===== WALK-FORWARD REPORT =====");
console.log(JSON.stringify(report, null, 2));
