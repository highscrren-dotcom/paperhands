import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Грейдинг в окне холда СВОЕЙ точки: одна сетка с двумя холдами
 * обязана судить одного и того же автора по-разному. Мир «поздний
 * старт»: цена стоит на базе почти четыре часа, затем на фазах
 * 200..240 растёт на +3% и держит уровень до конца цикла.
 *
 *  - точка hold=120: окно кончается ДО роста — ни замок, ни трейлинг
 *    не сработали -> автор 0/5 (таймаут = miss);
 *  - точка hold=720: окно захватывает рост — замок +2% фиксируется
 *    раньше стопа -> автор 5/5;
 *  - тренировки ДВЕ (окно входит в ключ правила), треки
 *    самоидентифицируются полем holdMinutes.
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
  if (phase <= 200) return 1000;
  if (phase <= 240) return 1000 + (30 * (phase - 200)) / 40; // +3% к фазе 240
  return 1030;
};

test("SIM: hits are graded inside each point's own hold window — two holds, two verdicts", async ({ pass, fail }) => {
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
      profitLockPercent: [2],
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
  const shortTrack = result.reports.tracks.find(({ author, holdMinutes }) => author === "sprinter" && holdMinutes === 120);
  const longTrack = result.reports.tracks.find(({ author, holdMinutes }) => author === "sprinter" && holdMinutes === 720);
  // hold=120: окно кончается до роста — фиксации нет, 0/5 (таймаут)
  if (!shortTrack || shortTrack.hits !== 0 || shortTrack.hitRate !== 0) {
    fail(`120m window must score the sprinter 0/5 (window ends before the move), got ${JSON.stringify(shortTrack)}`);
    return;
  }
  // hold=720: окно захватывает рост — замок +2% фиксируется, 5/5
  if (!longTrack || longTrack.hits !== 5 || longTrack.hitRate !== 1) {
    fail(`720m window must credit the sprinter 5/5, got ${JSON.stringify(longTrack)}`);
    return;
  }

  // банов нет — ОБЕ точки торгуют все 5 идей; окно меняет только трек
  const shortPoint = result.reports.reports.find(({ point }) => point.holdMinutes === 120);
  const longPoint = result.reports.reports.find(({ point }) => point.holdMinutes === 720);
  if (shortPoint.tradesList.length !== 5 || longPoint.tradesList.length !== 5) {
    fail(`both windows trade all 5 (no ban), got ${shortPoint.tradesList.length}/${longPoint.tradesList.length}`);
    return;
  }

  pass(
    `hold-window grading: sprinter 0/5 at 120m (window ends before the +3% move), ` +
    `5/5 at 720m (window catches the +2% lock); 2 tracks self-identified by holdMinutes; no ban -> both trade 5`
  );
});
