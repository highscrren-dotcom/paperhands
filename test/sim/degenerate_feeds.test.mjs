import { test } from "worker-testbed";

import { addExchangeSchema, addSweepSchema, Sweep } from "../../build/index.mjs";

/**
 * Вырожденные фиды:
 *  1) пустой массив идей — прогон завершается структурированно:
 *     нулевые счётчики, полная сетка нулевых точек, рейтинги
 *     разрешены, ничего не падает;
 *  2) идея без единой свечи (за краем данных / битый getCandles) —
 *     это НЕ тихий дроп, а ФАТАЛ: прогон на отсутствующих свечах
 *     мусор, поэтому Sweep.run обязан упасть с внятной ошибкой,
 *     а не выдать нулевой профиль и наёбалово из нулей.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const END_M = 500; // мир свечей: всего 500 минут
const END_TS = START + END_M * MINUTE;

const registerBoundedExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        if (timestamp >= END_TS) {
          break;
        }
        result.push({ timestamp, open: 1000, high: 1000, low: 1000, close: 1000, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

const GRID_AXES = {
  hardStopPercent: [5, 50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  profitLockPercent: [0],
};

test("SIM: empty ideas feed resolves structurally — zero counters, zero grid, rankings intact", async ({ pass, fail }) => {
  registerBoundedExchange("sim-empty-exchange");
  addSweepSchema({
    sweepName: "sim_empty",
    exchangeName: "sim-empty-exchange",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  const result = await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_empty",
    ideas: [],
  });

  if (result.ideasTotal !== 0 || result.ideasDirectional !== 0 || result.profileCount !== 0) {
    fail(`counters must be zero, got ${result.ideasTotal}/${result.ideasDirectional}/${result.profileCount}`);
    return;
  }
  if (result.reports.reports.length !== 2 || result.reports.reports.some((r) => r.tradesList.length !== 0 || r.totalPnlPercent !== 0)) {
    fail(`grid must be full of zero points, got ${JSON.stringify(result.reports.reports.map((r) => r.tradesList.length))}`);
    return;
  }
  if (result.reports.best.length !== 4 || result.reports.best.some((b) => !b.report)) {
    fail("rankings must resolve on an empty feed");
    return;
  }
  if (result.reports.tracks.length !== 0) {
    fail(`author tracks must be empty on an empty feed, got ${result.reports.tracks.length}`);
    return;
  }
  if (result.avgHoldMinutes !== 0 || result.p99HoldMinutes !== 0) {
    fail(`hold stats must be zero, got ${result.avgHoldMinutes}/${result.p99HoldMinutes}`);
    return;
  }

  pass("empty feed: zero counters, 2 zero points, 4 rankings resolved, no crash");
});

test("SIM: an idea with no candles is FATAL — the run throws loudly, not silently zeros", async ({ pass, fail }) => {
  registerBoundedExchange("sim-beyond-exchange");
  addSweepSchema({
    sweepName: "sim_beyond",
    exchangeName: "sim-beyond-exchange",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  let error = null;
  try {
    await Sweep.run({
      symbol: "TESTUSDT",
      sweepName: "sim_beyond",
      ideas: [
        // целиком за краем данных: ни одной свечи -> прогон обязан упасть
        { id: 7, ts: END_TS + 1000 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "ghost" },
      ],
    });
  } catch (e) {
    error = e;
  }

  if (!error) {
    fail("an idea with no candles must abort the run, but it resolved");
    return;
  }
  const msg = String(error.message ?? error);
  if (!msg.includes("no candles for") || !msg.includes("idea 7")) {
    fail(`error must name the missing-candles idea, got: ${msg}`);
    return;
  }

  pass("idea with zero candles aborts the run loudly (idea 7 named), no silent zero profile");
});
