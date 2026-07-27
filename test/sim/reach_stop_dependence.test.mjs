import { test } from "worker-testbed";

import { addExchangeSchema, addSweepSchema, Sweep } from "../../build/index.mjs";

/**
 * Hits единственной метрики profit-before-stop зависят от СТОПА
 * точки: ось hardStopPercent [3, 5] обязана дать ДВЕ тренировки
 * фильтра (ключ кеша включает stop), и автор с ямой -4% до пика:
 *  - при стопе 3 — miss (яма глубже стопа: хардстоп выбивает раньше
 *    фиксации), ноль hits у правила H=3;
 *  - при стопе 5 — hit (яма пережита, замок +2.5% собран раньше
 *    стопа), 5/5 hits у правила H=5.
 * Регрессия, выкинувшая стоп из ключа/грейдинга, молча приравняет
 * эти правила — тест это ловит.
 *
 * Мир per cycle: яма до -4% (фазы 2..30), пик +4% (31..60), откат к
 * базе (61..100) — яма НЕ задевает стоп 5 в торговле (960 > 950.95).
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % CYCLE;
  if (p <= 1) return 1000;
  if (p <= 30) return 1000 - (40 * (p - 1)) / 29;
  if (p <= 60) return 960 + (80 * (p - 30)) / 30;
  if (p <= 100) return 1040 - (40 * (p - 60)) / 40;
  return 1000;
};

const idea = (id, minute) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author: "dipper",
});

test("SIM: hit counts follow the point's stop — two trainings for H=[3,5]", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-reachstop-exchange",
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

  const trainings = [];
  const byStop = new Map();
  addSweepSchema({
    sweepName: "sim_reachstop",
    exchangeName: "sim-reachstop-exchange",
    gridAxes: {
      hardStopPercent: [3, 5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      profitLockPercent: [2.5],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainings.push(stats),
      onGridPoint: (_symbol, report) => byStop.set(report.point.hardStopPercent, report),
    },
  });

  await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_reachstop",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE)),
  });

  // две тренировки — по одной на каждый reach-контекст стопа
  if (trainings.length !== 2) {
    fail(`H=[3,5] must train the filter twice (stop is in the rule key), got ${trainings.length}`);
    return;
  }
  const hitCounts = trainings
    .map((stats) => stats.find(({ author }) => author === "dipper")?.hits)
    .sort((a, b) => a - b);
  if (hitCounts[0] !== 0 || hitCounts[1] !== 5) {
    fail(`dipper must be 0/5 hits vs stop 3 and 5/5 vs stop 5, got ${JSON.stringify(hitCounts)}`);
    return;
  }

  // банов нет — обе точки торгуют все 5; различие стопа видно в
  // ТРЕКЕ (0/5 vs 5/5 hits) и в исходах сделок:
  // H=3: узкий стоп режет сделки в hard_stop
  const strict = byStop.get(3);
  if (strict.tradesList.length !== 5 || strict.exitReasons.hard_stop !== 5) {
    fail(`stop 3 point trades all 5 but the dip (-4) stops them out, got ${JSON.stringify(strict.exitReasons)}`);
    return;
  }
  // H=5: широкий стоп переживает яму, все 5 сняты замком
  const soft = byStop.get(5);
  if (soft.tradesList.length !== 5 || soft.exitReasons.profit_lock !== 5) {
    fail(`stop 5 point must harvest 5/5 by profit_lock, got ${JSON.stringify(soft.exitReasons)}`);
    return;
  }

  pass("hits follow the stop in the TRACK: 0/5 vs stop 3, 5/5 vs stop 5, two distinct trainings; no ban -> both trade 5 (stop 3 -> hard_stop, stop 5 -> profit_lock)");
});
