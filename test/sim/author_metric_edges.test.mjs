import { test } from "worker-testbed";

import { addExchangeSchema, addSweepSchema, Sweep } from "../../build/index.mjs";

/**
 * Границы математики единственной метрики profit-before-stop
 * (AUTHOR_HIT_FN), формульно:
 *
 *  1) Пороги строгие ровно там, где заявлено:
 *     - hit требует, чтобы благоприятная экскурсия дотянулась до
 *       замка: касание РОВНО +2.5% — hit (>= lock), +2.49% — miss;
 *     - hit требует, чтобы просадка ДО фиксации не задела хардстоп:
 *       откат ровно -5% при стопе 5 — miss (стоп выбивает первым),
 *       -4.9% — hit.
 *     Каждый паттерн — СВОЙ мир и свой прогон: смешение паттернов в
 *     одной ленте отравило бы просадку всем (проверено — отравляет).
 *     Горизонт профиля = max(holdMinutes) = 120м — один паттерн
 *     внутри одного цикла. Миры без дрейфа (база 1000) — проценты
 *     точны в плавучке.
 *  2) lock=0 теперь ВАЛИДЕН: замок выключен, фиксация — только взвод
 *     трейлинга; грид с lock=0 не пуст и не падает.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

// один паттерн на весь мир, повторяется каждый цикл:
// подъём к peak за фазы 2..30, возврат к floor... к 100, дальше база
const patternFactor = (rise, p) => {
  if (p <= 1) return 1;
  if (p <= 30) return 1 + (rise * (p - 1)) / 29;
  if (p <= 100) return 1 + rise - (rise * (p - 30)) / 70;
  return 1;
};

// яма к dip за фазы 2..30, подъём к 1.04 к фазе 100, дальше 1.04
const shakeFactor = (dip, p) => {
  if (p <= 1) return 1;
  if (p <= 30) return 1 - (dip * (p - 1)) / 29;
  if (p <= 100) return 1 - dip + ((0.04 + dip) * (p - 30)) / 70;
  return 1.04;
};

const WORLDS = {
  touch: (p) => patternFactor(0.025, p),
  under: (p) => patternFactor(0.0249, p),
  shake: (p) => shakeFactor(0.05, p),
  shakeok: (p) => shakeFactor(0.049, p),
};

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const registerWorld = (exchangeName, priceAt) => {
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

test("SIM: profit-before-stop thresholds are exact — >= on the lock touch, strictly > on the shakeout stop", async ({ pass, fail }) => {
  // ожидание по каждому миру: hit-счёт автора (трек, без бана)
  const EXPECT = {
    touch: { hits: 5 },   // +2.5 ровно: >= lock -> hit
    under: { hits: 0 },   // +2.49: < lock -> miss
    shake: { hits: 0 },   // shakeout -5.0 ровно: НЕ > -stop -> miss
    shakeok: { hits: 5 }, // shakeout -4.9: > -stop -> hit
  };

  for (const [name, factor] of Object.entries(WORLDS)) {
    registerWorld(`sim-reach-${name}-exchange`, (timestamp) => {
      const m = Math.floor((timestamp - START) / MINUTE);
      return m < 0 ? 1000 : 1000 * factor(m % CYCLE);
    });

    const trainedStats = [];
    addSweepSchema({
      sweepName: `sim_reach_${name}`,
      exchangeName: `sim-reach-${name}-exchange`,
      gridAxes: {
        hardStopPercent: [5],
        trailingTakePercent: [100],
        // горизонт профиля = max(holdMinutes): 120м накрывает и яму
        // встряски (фаза 30), и восстановление к пику (фаза 100)
        holdMinutes: [120],
        profitLockPercent: [2.5],
      },
      callbacks: {
        onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
      },
    });

    await Sweep.run({
      symbol: "TESTUSDT",
      sweepName: `sim_reach_${name}`,
      ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, name)),
    });

    const stat = trainedStats[0]?.find(({ author }) => author === name);
    const expected = EXPECT[name];
    if (!stat || stat.hits !== expected.hits) {
      fail(`${name}: expected ${expected.hits}/5 hits, got ${JSON.stringify(stat)}`);
      return;
    }
  }

  pass("profit-before-stop edges exact: +2.5 hit / +2.49 miss (>= lock), shakeout -4.9 hit / -5.0 miss (stop wins the tie)");
});

test("SIM: lock=0 is valid — fixation is the trailing arm alone, the grid is non-empty", async ({ pass, fail }) => {
  // спайкер: +4% за полчаса, к горизонту -3% (все циклы одинаковы).
  // Пик +4% взводит трейлинг 3% (arm = entry/(1-0.03) ~ +3.09%)
  // раньше стопа -> hit по одному лишь трейлингу, замок выключен.
  registerWorld("sim-lock0-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 0) return 1000;
    const p = m % CYCLE;
    let f;
    if (p <= 1) f = 1;
    else if (p <= 30) f = 1 + (0.04 * (p - 1)) / 29;
    else if (p <= 200) f = 1.04 - (0.07 * (p - 30)) / 170;
    else f = 0.97;
    return 1000 * f;
  });

  const trainedStats = [];
  addSweepSchema({
    sweepName: "sim_lock0",
    exchangeName: "sim-lock0-exchange",
    gridAxes: {
      hardStopPercent: [5],
      // живой трейлинг: его взвод — единственная фиксация при lock=0
      trailingTakePercent: [3],
      holdMinutes: [240],
      // lock=0 валиден: замок выключен, фиксация — только взвод трейлинга
      profitLockPercent: [0],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
    },
  });

  const result = await Sweep.run({
    symbol: "TESTUSDT",
    sweepName: "sim_lock0",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, "spiker")),
  });

  // грид НЕ пуст: ровно одна точка
  if (result.reports.reports.length !== 1) {
    fail(`lock=0 grid must produce exactly one point, got ${result.reports.reports.length}`);
    return;
  }
  // фиксация только по трейлингу (замок выключен): спайкер 5/5
  const track = trainedStats[0]?.find(({ author }) => author === "spiker");
  if (!track || track.hits !== 5 || track.profitLockPercent !== 0) {
    fail(`lock=0: spiker must be 5/5 by trailing arm alone, got ${JSON.stringify(track)}`);
    return;
  }

  pass("lock=0 is valid: grid non-empty, fixation is the trailing arm alone (spiker 5/5)");
});
