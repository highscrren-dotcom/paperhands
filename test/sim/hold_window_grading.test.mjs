import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Грейдинг в окне холда СВОЕЙ точки: одна сетка с двумя холдами
 * обязана судить одного и того же автора по-разному. Мир «спринтер»:
 * каждая идея даёт +2% и держит уровень два часа, к 5-му часу цена
 * сливается в -3% и стоит там до конца цикла.
 *
 *  - точка hold=120: close окна = +2% -> автор 5/5, допущен, 5 сделок;
 *  - точка hold=720: close окна = -3% -> автор 0/5, забанен, 0 сделок;
 *  - тренировки ДВЕ (окно входит в ключ правила), словари банов
 *    close-корзины самоидентифицируются полем holdMinutes.
 *
 * Профиль при этом один на идею (fetch = max(holdMinutes) = 720) —
 * различие только в окне арифметики.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 1440;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const phase = m % CYCLE;
  if (phase < 2) return 1000;
  if (phase <= 120) return 1020;
  if (phase <= 300) return 1020 - (50 * (phase - 120)) / 180;
  return 970;
};

test("SIM: author metrics are graded inside each point's own hold window — two holds, two verdicts", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-holdwindow-exchange",
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

  const trained = [];
  const pointReports = [];
  addSimulatorSchema({
    simulatorName: "sim_holdwindow",
    exchangeName: "sim-holdwindow-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      // два окна грейдинга в одной сетке — сердце теста
      holdMinutes: [120, 720],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
      onGridPoint: (_symbol, report) => pointReports.push(report),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_holdwindow",
    ideas: Array.from({ length: 5 }, (_, k) => ({
      id: 1 + k,
      ts: START + k * CYCLE * MINUTE,
      symbol: "TESTUSDT",
      direction: "LONG",
      author: "sprinter",
    })),
  });

  // окно — часть правила: два холда обязаны дать ДВЕ тренировки
  if (trained.length !== 2) {
    fail(`expected 2 trainings (one per hold window), got ${trained.length}`);
    return;
  }

  // трек самоидентифицируется окном: одна строка на (окно x автор),
  // holdMinutes прямо в треке
  const shortTrack = result.reports.close.tracks.find(({ author, holdMinutes }) => author === "sprinter" && holdMinutes === 120);
  const longTrack = result.reports.close.tracks.find(({ author, holdMinutes }) => author === "sprinter" && holdMinutes === 720);
  // hold=120: close окна +2% — 5/5
  if (!shortTrack || shortTrack.hits !== 5 || shortTrack.hitRate !== 1) {
    fail(`120m window must credit the sprinter 5/5, got ${JSON.stringify(shortTrack)}`);
    return;
  }
  // hold=720: close окна -3% — 0/5 (то же самое окно судит иначе)
  if (!longTrack || longTrack.hits !== 0 || longTrack.hitRate !== 0) {
    fail(`720m window must score the sprinter 0/5, got ${JSON.stringify(longTrack)}`);
    return;
  }

  // банов нет — ОБЕ точки торгуют все 5 идей; окно меняет только трек
  const shortPoint = result.reports.close.reports.find(({ point }) => point.holdMinutes === 120);
  const longPoint = result.reports.close.reports.find(({ point }) => point.holdMinutes === 720);
  if (shortPoint.tradesList.length !== 5 || longPoint.tradesList.length !== 5) {
    fail(`both windows trade all 5 (no ban), got ${shortPoint.tradesList.length}/${longPoint.tradesList.length}`);
    return;
  }

  pass(
    `hold-window grading: sprinter 5/5 at 120m (+2% window close), 0/5 at 720m ` +
    `(-3% window close); 2 tracks self-identified by holdMinutes; no ban -> both trade 5`
  );
});
