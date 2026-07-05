/**
 * pump_bench — исследовательский стенд pump-anomaly (backtest-only, без денег).
 *
 * Реплей исторических ParserItem (январь-2026, канал Crypto Yoda) через
 * претрен-модель автора (assets/model-weights.json, version 3):
 *   1) model.plan()     — live-решения (свечи СТРОГО ДО сигнала, look-ahead нет)
 *   2) model.backtest() — форвард-реплей выходов по 1m свечам → реализованный pnl
 *   3) агрегация: winrate / mean / median / per-trade Sharpe (epsilon-guard) /
 *      maxDD по кумулятивной кривой + benchmark buy&hold по каждому символу
 *
 * Свечи — через движковый Exchange.getRawCandles (backtest-kit): сигнатура
 * совпадает с GetCandles pump-anomaly один-в-один (README pump-anomaly §Integration).
 * Read-through кэш свечей ядро пишет в ./dump/data/candle относительно cwd —
 * запускать из example/: `node scripts/pump_bench/index.mjs`.
 *
 * ЧЕСТНОСТЬ: pump-anomaly НЕ моделирует комиссию/слиппедж/фандинг/спред.
 * result.pnl = сырое движение цены. В summary даём варианты с haircut
 * 0.2% и 0.4% за раунд-трип (доктрина backtest-kit: 0.1% fee + 0.1% slippage).
 * Модель обучена на этих же 32 постах → ЭТО IN-SAMPLE. Цифры не являются
 * доказательством эджа ни при каком исходе (см. agent/PLAN.md, OOS-гейт).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PumpMatrix } from "pump-anomaly";

import { getCandles, aggregate, pct, writeJsonl } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

const items = JSON.parse(readFileSync(join(HERE, "assets/parser-items.json"), "utf8"));
const weights = readFileSync(join(HERE, "assets/model-weights.json"), "utf8");

// ---------- 0) модель ----------
console.log(`[bench] items: ${items.length}, символов: ${new Set(items.map((i) => i.symbol)).size}`);
const model = PumpMatrix.load(weights);

const modelInfo = {
  mode: model.mode,
  modeReason: model.modeReason,
  reliable: model.reliable,
  confidence: model.confidence,
  historySize: model.historySize,
  effectiveTrials: model.effectiveTrials,
  innerTrials: model.innerTrials,
  fitAttempts: model.fitAttempts,
  lookbackMinutes: model.lookbackMinutes,
  impactHorizonMinutes: model.impactHorizonMinutes,
  policy: model.policy,
  riskReward: model.riskReward,
  pnl: model.pnl,
  labeling: model.labeling,
  certification: (() => {
    try { return model.certification; } catch (e) { return `unavailable: ${e.message}`; }
  })(),
};
writeFileSync(join(OUT, "model-info.json"), JSON.stringify(modelInfo, null, 2));
console.log(`[bench] mode=${model.mode} (${model.modeReason}); reliable=${model.reliable}; confidence=${model.confidence}`);

// Разметка авторства/вердикты без свечей
const explain = model.explain(items);
writeFileSync(join(OUT, "explain.json"), JSON.stringify(explain, null, 2));

// Реализованные сделки обучающей истории (лейблы автора) — для сверки
try {
  writeFileSync(join(OUT, "model-dump.json"), JSON.stringify(model.dump(), null, 2));
} catch (e) {
  console.log(`[bench] model.dump() недоступен: ${e.message}`);
}

// ---------- 1) plan(): live-решения ----------
console.log("[bench] plan() — live-решения (свечи строго до сигнала)…");
const t0 = Date.now();
const planSignals = await model.plan(items, getCandles);
writeJsonl(join(OUT, "plan.jsonl"), planSignals);
console.log(`[bench] plan: ${planSignals.length} сигналов за ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---------- 2) backtest(): форвард-реплей ----------
console.log("[bench] backtest() — форвард-реплей exit-примитивов по 1m…");
const t1 = Date.now();
const btSignals = await model.backtest(items, getCandles);
writeJsonl(join(OUT, "backtest.jsonl"), btSignals);
console.log(`[bench] backtest: ${btSignals.length} сигналов за ${((Date.now() - t1) / 1000).toFixed(1)}s`);

// ---------- 3) агрегация ----------
const entered = btSignals
  .filter((s) => s.result && s.result.entered)
  .sort((a, b) => a.ts - b.ts);
const skipped = btSignals.length - entered.length;
const pnls = entered.map((s) => s.result.pnl);

const FRICTION = [0.002, 0.004]; // haircut за раунд-трип: 0.2% и 0.4%
const summary = {
  disclaimer:
    "IN-SAMPLE (модель обучена на этих же 32 постах). pnl СЫРОЙ: без комиссии/слиппеджа/фандинга/спреда.",
  items: items.length,
  planSignals: planSignals.length,
  planActions: Object.fromEntries(
    [...planSignals.reduce((m, s) => m.set(s.action, (m.get(s.action) || 0) + 1), new Map())],
  ),
  backtestSignals: btSignals.length,
  entered: entered.length,
  skipped,
  truncated: entered.filter((s) => s.result.truncated).length,
  exitReasons: Object.fromEntries(
    [...entered.reduce((m, s) => m.set(s.result.reason, (m.get(s.result.reason) || 0) + 1), new Map())],
  ),
  raw: aggregate(pnls),
  afterFriction: Object.fromEntries(
    FRICTION.map((f) => [
      `${(f * 100).toFixed(1)}%_за_раундтрип`,
      aggregate(pnls.map((x) => x - f)),
    ]),
  ),
  bySymbol: {},
  buyHold: {},
};

for (const sym of [...new Set(entered.map((s) => s.symbol))].sort()) {
  const symPnls = entered.filter((s) => s.symbol === sym).map((s) => s.result.pnl);
  summary.bySymbol[sym] = aggregate(symPnls);
}

// ---------- 4) benchmark buy & hold ----------
// Окно: от первого сигнала до последнего + staleMinutes (котёл всех сделок).
const staleMs = (JSON.parse(weights).exit?.global?.staleMinutes ?? 720) * 60000;
const from = Math.min(...items.map((i) => i.ts));
const to = Math.max(...items.map((i) => i.ts)) + staleMs;
console.log(`[bench] buy&hold окно: ${new Date(from).toISOString()} → ${new Date(to).toISOString()}`);
const holds = [];
for (const sym of [...new Set(items.map((i) => i.symbol))].sort()) {
  try {
    const candles = await getCandles(sym, "1h", undefined, from, to);
    if (candles.length >= 2) {
      const hold = candles.at(-1).close / candles[0].open - 1;
      summary.buyHold[sym] = pct(hold);
      holds.push(hold);
    } else {
      summary.buyHold[sym] = "no data";
    }
  } catch (e) {
    summary.buyHold[sym] = `error: ${e.message}`;
  }
}
if (holds.length) {
  summary.buyHold["EQUAL_WEIGHT_BASKET"] = pct(holds.reduce((s, x) => s + x, 0) / holds.length);
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("\n===== SUMMARY (in-sample, сырой pnl) =====");
console.log(JSON.stringify(summary, null, 2));
console.log(`\n[bench] артефакты: ${OUT}/{model-info,explain,summary}.json + {plan,backtest}.jsonl`);
