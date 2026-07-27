import { test } from "worker-testbed";

import { addExchangeSchema, addSweepSchema, Sweep } from "../../build/index.mjs";

/**
 * Граничные случаи метрик и правила бана:
 *  1) Sortino без убыточных ДНЕЙ бесконечен (Infinity, как у
 *     profitFactor) при конечном положительном Sharpe — конечный
 *     сентинель вводил бы в заблуждение: реальные значения Sortino
 *     могут превышать любую константу;
 *  2) hitRate — точный сырой ratio без порога и без бана: coin 2/4 =
 *     0.5, quarter 1/4 = 0.25; движок только считает, кого банить —
 *     дело userspace.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 962; // 2 x 481: две идеи одного направления вне дедупа

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: profitable series with no losing day yields infinite Sortino", async ({ pass, fail }) => {
  // пила из eternal_hold: всплеск +1% на минутах 2..61 каждого цикла
  const CYCLES = 10;
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 0) return 1000;
    const base = 1000 * (1 + 1e-6 * m);
    const phase = m % 481;
    const cycle = Math.floor(m / 481);
    if (cycle < CYCLES && phase >= 2 && phase <= 61) {
      return base * 1.01;
    }
    return base;
  };
  addExchangeSchema({
    exchangeName: "sim-sortino-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addSweepSchema({
    sweepName: "sim_sortino",
    exchangeName: "sim-sortino-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      profitLockPercent: [0],
    },
    callbacks: {},
  });

  const result = await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_sortino",
    ideas: Array.from({ length: CYCLES }, (_, k) => idea(1 + k, k * 481, "LONG", "prophet")),
  });

  const [report] = result.reports.reports;
  if (report.tradesList.length !== CYCLES || report.totalPnlPercent <= 0) {
    fail(`expected ${CYCLES} profitable trades, got ${report.trades} / ${report.totalPnlPercent}`);
    return;
  }
  if (report.sortino !== Number.POSITIVE_INFINITY) {
    fail(`no-losing-day series must have infinite Sortino, got ${report.sortino}`);
    return;
  }
  if (!(Number.isFinite(report.sharpe) && report.sharpe > 0)) {
    fail(`sharpe must stay finite and positive, got ${report.sharpe}`);
    return;
  }
  // кривая без просадки при положительном PnL: Calmar и recovery
  // бесконечны по той же конвенции, что profitFactor/sortino
  if (report.calmarRatio !== Number.POSITIVE_INFINITY || report.recoveryFactor !== Number.POSITIVE_INFINITY) {
    fail(`drawdown-free profitable curve must have infinite calmar/recovery, got ${report.calmarRatio}/${report.recoveryFactor}`);
    return;
  }

  pass(`sortino=Infinity, calmar=Infinity, recovery=Infinity with finite sharpe=${report.sharpe.toFixed(2)} on ${report.trades} clean trades`);
});

test("SIM: track hitRate is the exact raw ratio — 2/4 = 0.5, 1/4 = 0.25 (no ban, userspace decides)", async ({ pass, fail }) => {
  // резкий рост +3% за 40 минут, затем плато. LONG фиксируется замком
  // +2% РАНЬШЕ хардстопа = hit; SHORT ловит хардстоп на том же росте =
  // miss (единственная метрика profit-before-stop)
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 0) return 1000;
    const phase = m % 481;
    const drift = 1 + 1e-9 * m; // микродрейф для уникальности цен
    if (phase <= 1) return 1000 * drift;
    if (phase <= 41) return 1000 * drift * (1 + (0.03 * (phase - 1)) / 40);
    return 1000 * drift * 1.03;
  };
  addExchangeSchema({
    exchangeName: "sim-boundary-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addSweepSchema({
    sweepName: "sim_boundary",
    exchangeName: "sim-boundary-exchange",
    gridAxes: {
      // замок +2% берётся LONG'ом на росте раньше хардстопа = hit;
      // SHORT ловит хардстоп +2% на том же росте = miss
      hardStopPercent: [2],
      trailingTakePercent: [100],
      holdMinutes: [60],
      profitLockPercent: [2],
    },
    callbacks: {},
  });

  // каждая идея выровнена на начало цикла (phase 0), чтобы войти
  // прямо перед +3% рампой: LONG = hit (замок), SHORT = miss (стоп)
  const result = await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_boundary",
    ideas: [
      // coin: ровно 2 hit (LONG) + 2 miss (SHORT) = 0.5
      idea(1, 0, "LONG", "coin"),
      idea(2, 481, "LONG", "coin"),
      idea(3, 962, "SHORT", "coin"),
      idea(4, 1443, "SHORT", "coin"),
      // quarter: 1 hit + 3 miss = 0.25
      idea(11, 1924, "LONG", "quarter"),
      idea(12, 2405, "SHORT", "quarter"),
      idea(13, 2886, "SHORT", "quarter"),
      idea(14, 3367, "SHORT", "quarter"),
    ],
  });

  // трек — сырой ratio, без порога/бана; userspace сам режет
  const tracks = Object.fromEntries(result.reports.tracks.map((t) => [t.author, t]));
  if (tracks.coin.hitRate !== 0.5 || tracks.coin.ideas !== 4) {
    fail(`coin must have exactly 0.5 on 4 ideas, got ${JSON.stringify(tracks.coin)}`);
    return;
  }
  if (tracks.quarter.hitRate !== 0.25 || tracks.quarter.ideas !== 4) {
    fail(`quarter must be 0.25 on 4 ideas, got ${JSON.stringify(tracks.quarter)}`);
    return;
  }
  // банов нет — обе идеи всех авторов торгуются
  const traded = result.reports.reports[0].tradesList.length;
  if (traded !== 8) {
    fail(`all 8 ideas must trade (no ban), got ${traded}`);
    return;
  }

  pass(`raw track ratio exact: coin 2/4 = 0.50, quarter 1/4 = 0.25; no ban, all 8 trade`);
});
