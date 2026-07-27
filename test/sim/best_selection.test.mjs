import { test } from "worker-testbed";

import { addExchangeSchema, addSweepSchema, Sweep } from "../../build/index.mjs";

/**
 * Победитель рейтинга без анти-флюк порога: критерий решает сам.
 * Точка с 1 монструозной сделкой доминирует по СЫРОМУ PnL и обязана
 * выиграть рейтинг "pnl" — но риск-скорректированные критерии
 * (sharpe/sortino/recovery) НЕ выбирают её: одна концентрированная
 * сделка даёт высокую дисперсию дневных приращений, и по ним
 * побеждает точка с ровным треком. Так честнее любого жёсткого порога.
 * Заодно проверяется порядок sorted в onRanking (невозрастание).
 *
 * Мир "лестница": каждый цикл (481м) даёт всплеск +1% (минуты 2..61)
 * и поднимает базу на +3% навсегда (12 ступеней). Точка hold=60
 * снимает всплески: 12 скромных сделок ~ +0.6%. Точка hold=7200
 * въезжает в лестницу целиком: ОДНА сделка ~ +42%, остальные идеи
 * поглощены слотом автора.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481;
const CYCLES = 12;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / SPACING);
  const base = 1000 * Math.pow(1.03, Math.min(cycle, CYCLES));
  const phase = m % SPACING;
  if (cycle < CYCLES && phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  return base;
};

test("SIM: pnl ranking takes the monster single trade, risk-adjusted rankings take the steady track", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-best-exchange",
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

  const rankings = [];
  addSweepSchema({
    sweepName: "sim_best",
    exchangeName: "sim-best-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60, 7200],
      profitLockPercent: [0],
    },
    callbacks: {
      onRanking: (_symbol, criterion, sorted, best) => {
        rankings.push({ criterion, sorted, best });
      },
    },
  });

  const result = await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_best",
    ideas: Array.from({ length: CYCLES }, (_, k) => ({
      id: 1 + k,
      ts: START + k * SPACING * MINUTE,
      symbol: "TESTUSDT",
      direction: "LONG",
      author: "steady",
    })),
  });

  const steady = result.reports.reports.find(({ point }) => point.holdMinutes === 60);
  const fluke = result.reports.reports.find(({ point }) => point.holdMinutes === 7200);
  if (!steady || !fluke) {
    fail("both points must be evaluated");
    return;
  }

  // флюк: одна сделка, но тотальное доминирование по PnL
  if (fluke.tradesList.length !== 1 || fluke.totalPnlPercent < 30) {
    fail(`fluke point must have 1 monster trade (>+30%), got ${fluke.trades}/${fluke.totalPnlPercent.toFixed(2)}`);
    return;
  }
  if (steady.tradesList.length !== CYCLES || !(fluke.totalPnlPercent > steady.totalPnlPercent)) {
    fail(`steady must have ${CYCLES} modest trades below fluke pnl, got ${steady.trades}/${steady.totalPnlPercent.toFixed(2)}`);
    return;
  }

  // pnl-рейтинг берёт флюк (сырой PnL выше), риск-скорректированные —
  // steady (одна сделка = высокая дисперсия, худший sharpe/sortino/rec)
  const winnerHold = (criterion) =>
    result.reports.best.find((b) => b.criterion === criterion)?.report?.point.holdMinutes;
  if (winnerHold("pnl") !== 7200) {
    fail(`pnl ranking must take the monster point (hold=7200), got hold=${winnerHold("pnl")}`);
    return;
  }
  for (const criterion of ["sharpe", "sortino", "recovery"]) {
    if (winnerHold(criterion) !== 60) {
      fail(`${criterion} ranking must take the steady 12-trade point (hold=60), got hold=${winnerHold(criterion)}`);
      return;
    }
  }

  // sorted в onRanking невозрастает по своему критерию
  const valueOf = (criterion, report) =>
    criterion === "pnl" ? report.totalPnlPercent : report[criterion];
  for (const { criterion, sorted } of rankings) {
    for (let i = 1; i < sorted.length; i++) {
      if (valueOf(criterion, sorted[i - 1]) < valueOf(criterion, sorted[i])) {
        fail(`onRanking(${criterion}) sorted must be non-increasing`);
        return;
      }
    }
  }

  pass(
    `fluke +${fluke.totalPnlPercent.toFixed(1)}% (1 trade) won the pnl ranking; ` +
    `steady +${steady.totalPnlPercent.toFixed(1)}% (${steady.trades} trades) won sharpe/sortino/recovery; sorted order verified`
  );
});
