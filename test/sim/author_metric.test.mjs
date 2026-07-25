import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Метрика авторского hit'а — параметр правила бана (authorMetric):
 *  - "close": hit по знаку закрытия 5-дневного горизонта;
 *  - "reach": hit по собираемости замком — MFE дошла до уровня
 *    profitLockPercent, а худший откат ДО пика не достал хардстоп.
 *
 * Мир «спайкер»: каждая идея взлетает до +4% за полчаса и к
 * горизонту умирает в -3%. По close автор — тотальный лузер
 * (hitRate 0, бан), по reach — идеальный (hitRate 1, допуск), и
 * ровно на нём точка с замком зарабатывает: та самая ситуация, где
 * close-фильтр банит авторов, кормящих lock-механику.
 *
 * Сетка 2 точки (metric close|reach при одинаковых прочих осях):
 * close-точка не торгует вовсе, reach-точка снимает все 5 идей по
 * profit_lock. Победители всех рейтингов — reach-точка, и её
 * per-best артефакт несёт spiker в белом списке.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

// фаза цикла: 0..1 база, 2..30 линейный взлёт к +4%,
// 31..200 линейный слив к -3%, дальше -3% до конца цикла
const factorAt = (phase) => {
  if (phase <= 1) return 1;
  if (phase <= 30) return 1 + (0.04 * (phase - 1)) / 29;
  if (phase <= 200) return 1.04 - (0.07 * (phase - 30)) / 170;
  return 0.97;
};

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  return 1000 * (1 + 1e-6 * m) * factorAt(m % CYCLE);
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: reach metric allows the spiker the close metric bans — and the lock point feeds on him", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-metric-exchange",
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

  const trainedStats = [];
  const reportsByMetric = new Map();
  addSimulatorSchema({
    simulatorName: "sim_metric",
    exchangeName: "sim-metric-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      profitLockPercent: [2.5],
      authorMetric: ["close", "reach"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
      onGridPoint: (_symbol, report, trades) => {
        reportsByMetric.set(report.point.authorMetric, { report, trades });
      },
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_metric",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, "LONG", "spiker")),
  });

  if (Object.values(result.reports).flatMap((b) => b.reports).length !== 2 || reportsByMetric.size !== 2) {
    fail(`grid must have exactly 2 points (close|reach), got ${Object.values(result.reports).flatMap((b) => b.reports).length}`);
    return;
  }

  // трек обучен дважды — по разу на метрику, с разными hits;
  // onAuthorsTrained теперь отдаёт tracks[]
  if (trainedStats.length !== 2) {
    fail(`expected 2 rule trainings (one per metric), got ${trainedStats.length}`);
    return;
  }
  const hitCounts = trainedStats
    .map((tracks) => tracks.find(({ author }) => author === "spiker")?.hits)
    .sort((a, b) => a - b);
  if (hitCounts[0] !== 0 || hitCounts[1] !== 5) {
    fail(`spiker must be 0/5 hits by close and 5/5 by reach, got ${JSON.stringify(hitCounts)}`);
    return;
  }

  // банов больше нет — обе точки торгуют все 5 идей спайкера; метрика
  // задаёт только ТРЕК (hits), а не допуск к торговле
  const closePoint = reportsByMetric.get("close");
  if (closePoint.report.tradesList.length !== 5) {
    fail(`close point must trade all 5 (no ban), got ${closePoint.report.tradesList.length}`);
    return;
  }
  const reachPoint = reportsByMetric.get("reach");
  if (reachPoint.report.tradesList.length !== 5 || reachPoint.report.exitReasons.profit_lock !== 5) {
    fail(`reach point must harvest all 5 by profit_lock, got ${JSON.stringify(reachPoint.report.exitReasons)}`);
    return;
  }

  // корзины несут раздельный ТРЕК: у close спайкер 0/5, у reach 5/5 —
  // ключевое различие метрик, теперь в tracks[]
  const closeTrack = result.reports.close.tracks.find(({ author }) => author === "spiker");
  const reachTrack = result.reports.reach.tracks.find(({ author }) => author === "spiker");
  if (!closeTrack || closeTrack.hits !== 0 || closeTrack.hitRate !== 0) {
    fail(`close track must have spiker 0/5, got ${JSON.stringify(closeTrack)}`);
    return;
  }
  if (!reachTrack || reachTrack.hits !== 5 || reachTrack.hitRate !== 1 || reachTrack.profitLockPercent !== 2.5) {
    fail(`reach track must have spiker 5/5 at lock 2.5, got ${JSON.stringify(reachTrack)}`);
    return;
  }

  pass(
    `author metric splits the track: spiker 0/5 by close, 5/5 by reach; ` +
    `both points trade all 5 (no ban), reach takes 5/5 profit_lock exits, ` +
    `pnl=${reachPoint.report.totalPnlPercent.toFixed(2)}%`
  );
});
