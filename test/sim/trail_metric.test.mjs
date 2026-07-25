import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Метрика "trail" — собираемость трейлингом: hit, когда лучшая
 * экскурсия окна дотянулась до уровня ВЗВОДА трейлинга точки
 * (long: peak >= entry/(1-r)) — та же формула, что в машинерии
 * сделок. Симметрия reach для замка: trail отвечает «заработает ли
 * на этом авторе trailing-точка».
 *
 *  1) порог включительный и точный: автор armer (спайк РОВНО до
 *     entry/(1-r)) — 5/5, допуск; автор under (на копейку ниже) —
 *     0/5, бан; торгует только armer; словарь банов trail-корзины
 *     несёт trailingTakePercent и не несёт lock/stop;
 *  2) trail без живого трейлинга не существует: сетка с TT=[100]
 *     (инертный трейлинг) обязана упасть пустой, громко.
 *
 * Мир: цикл 1440м = горизонт. Чётные циклы — плато armer на фазах
 * 2..60, нечётные — плато under. Вне плато база 1000: close-исход
 * у обоих нулевой, грейдит только взвод.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 1440;

const TT_RATIO = 2 / 100;
const ARM_PRICE = 1000 / (1 - TT_RATIO);

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / CYCLE);
  const phase = m % CYCLE;
  if (phase < 2 || phase > 60) return 1000;
  // чётный цикл: плато ровно на уровне взвода; нечётный: чуть ниже
  return cycle % 2 === 0 ? ARM_PRICE : ARM_PRICE - 0.01;
};

const idea = (id, cycle, author) => ({
  id,
  ts: START + cycle * CYCLE * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const IDEAS = [
  ...Array.from({ length: 5 }, (_, k) => idea(10 + k, 2 * k, "armer")),
  ...Array.from({ length: 5 }, (_, k) => idea(20 + k, 2 * k + 1, "under")),
];

const registerExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
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
};

test("SIM: trail metric grades trailing-arm reachability — exact touch hits, a hair under misses", async ({ pass, fail }) => {
  registerExchange("sim-trail-exchange");

  const trained = [];
  addSimulatorSchema({
    simulatorName: "sim_trail",
    exchangeName: "sim-trail-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [2],
      holdMinutes: [CYCLE],
      profitLockPercent: [0],
      authorMetric: ["trail"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_trail",
    ideas: IDEAS,
  });

  if (result.reports.trail.reports.length !== 1) {
    fail(`the point must land in reports.trail, got ${result.reports.trail.reports.length}`);
    return;
  }
  if (trained.length !== 1) {
    fail(`expected 1 training (single trail rule), got ${trained.length}`);
    return;
  }
  const stats = Object.fromEntries(trained[0].map((s) => [s.author, s]));
  // armer: плато РОВНО на entry/(1-r) — взвод включительный, 5/5
  if (stats.armer.hits !== 5) {
    fail(`armer (exact arm-level touch) must be 5/5 allowed, got ${JSON.stringify(stats.armer)}`);
    return;
  }
  // under: на 0.01 ниже уровня — взвода нет, 0/5, бан
  if (stats.under.hits !== 0) {
    fail(`under (a hair below the arm level) must be 0/5 banned, got ${JSON.stringify(stats.under)}`);
    return;
  }

  // трек trail-корзины: armer 5/5, under 0/5; уровень правила —
  // trailing (у trail нет lock, profitLockPercent = 0)
  const armerTrack = result.reports.trail.tracks.find(({ author }) => author === "armer");
  const underTrack = result.reports.trail.tracks.find(({ author }) => author === "under");
  if (!armerTrack || armerTrack.hits !== 5 || armerTrack.hitRate !== 1) {
    fail(`armer track must be 5/5, got ${JSON.stringify(armerTrack)}`);
    return;
  }
  if (!underTrack || underTrack.hits !== 0 || underTrack.hitRate !== 0) {
    fail(`under track must be 0/5, got ${JSON.stringify(underTrack)}`);
    return;
  }
  if (underTrack.holdMinutes !== CYCLE || underTrack.profitLockPercent !== 0) {
    fail(`trail track rule identity must be {hold=CYCLE, lock=0}, got ${JSON.stringify(underTrack)}`);
    return;
  }

  // банов нет — торгуют ОБА автора (10 идей), метрика задаёт трек
  const [report] = result.reports.trail.reports;
  if (report.tradesList.length !== 10) {
    fail(`both authors' 10 ideas must trade (no ban), got ${report.tradesList.length}`);
    return;
  }

  pass(
    `trail metric exact: armer 5/5 at the inclusive arm touch, under 0/5; ` +
    `no ban -> both trade (10), track carries the trailing rule identity`
  );
});

test("SIM: trail without a live trailing does not exist — trail-only grid with TT=[100] throws loudly", async ({ pass, fail }) => {
  registerExchange("sim-trail-inert");

  addSimulatorSchema({
    simulatorName: "sim_trail_inert",
    exchangeName: "sim-trail-inert",
    gridAxes: {
      hardStopPercent: [50],
      // инертный трейлинг: уровня взвода не существует — комбинация
      // исключается из сетки, чисто trail-грид обязан упасть пустым
      trailingTakePercent: [100],
      holdMinutes: [CYCLE],
      profitLockPercent: [0],
      authorMetric: ["trail"],
    },
  });

  let error = null;
  try {
    await Simulator.run({
      symbol: "TESTUSDT",
      simulatorName: "sim_trail_inert",
      ideas: IDEAS,
    });
  } catch (e) {
    error = e;
  }
  if (!error || !String(error.message ?? error).includes("the grid is empty")) {
    fail(`trail-only grid with TT=[100] must throw the empty-grid error, got: ${error?.message ?? "no error"}`);
    return;
  }

  pass("trail x inert trailing excluded from the grid; an all-excluded grid throws loudly");
});
