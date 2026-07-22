// simulator_oos.mjs — честный OOS-тест симулятора Петра (вариант А, №110).
//
// TRAIN-артефакт НЕ вычисляем — берём ЕГО опубликованный demo/simulator/assets/
// simulator.done.json (июнь 2026, BTCUSDT): вайтлист авторов + параметры
// победителей. TEST: июль 2026 (01–15.07, фид из HF-датасета, фильтры = аудит
// tv_universe A−), параметры и вайтлист ЗАМОРОЖЕНЫ (обучение отключено:
// minAuthorTrack=0, minAuthorHitRate=0 → банов нет; фид заранее отфильтрован
// вайтлистом — прод-семантика «apply allowedAuthors as-is»).
//
// Контроли:
//  - crowd-baseline: те же exit-параметры, весь июльский фид (без вайтлиста);
//  - placebo: M случайных 13-авторских подмножеств из eligible-пула июня
//    (track>=2 по его же authorStats), тот же замороженный прогон. PRNG
//    mulberry32 с фикс-сидами — воспроизводимо.
//
// Сравнение по totalPnl / trades / WR; time-based Sharpe между прогонами с
// разными окнами НЕ сравниваем (rangeDays зависит от фида).
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import ccxt from "ccxt";

const SCRATCH = process.env.OOS_DIR || "./scratch";
const ARTIFACT = `${SCRATCH}/simulator.done.json`;
const JULY_FEED = `${SCRATCH}/ts-ideas.july.jsonl`;
const OUT = `${SCRATCH}/oos-result.json`;
const PLACEBO_RUNS = Number(process.env.OOS_PLACEBO_RUNS ?? "20");

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt_exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
});

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf-8"));
const july = readFileSync(JULY_FEED, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const sharpeBest = artifact.best.find((b) => b.criterion === "sharpe").report.point;
const pnlBest = artifact.best.find((b) => b.criterion === "pnl").report.point;
const wlSharpe = artifact.allowedAuthors; // прод-артефакт (правило Sharpe-победителя)
const wlPnl = artifact.authorStats
  .filter((s) => s.ideas >= pnlBest.minAuthorTrack && s.hitRate >= pnlBest.minAuthorHitRate)
  .map((s) => s.author);
const eligible = artifact.authorStats
  .filter((s) => s.ideas >= sharpeBest.minAuthorTrack)
  .map((s) => s.author);

// mulberry32 — детерминированный PRNG для placebo-подмножеств
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sample = (arr, k, rnd) => {
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
};

// замороженный прогон: одна точка сетки, обучение отключено
let schemaN = 0;
const frozenRun = async (point, feed, label) => {
  const simulatorName = `oos_frozen_${schemaN++}`;
  addSimulatorSchema({
    simulatorName,
    exchangeName: "ccxt_exchange",
    gridAxes: {
      hardStopPercent: [point.hardStopPercent],
      trailingTakePercent: [point.trailingTakePercent],
      holdMinutes: [point.holdMinutes],
      minIdeasAligned: [point.minIdeasAligned],
      minAuthorTrack: [0],
      minAuthorHitRate: [0],
    },
  });
  const res = await Simulator.run({ symbol: "BTCUSDT", simulatorName, ideas: feed });
  const r = res.reports[0];
  const trades = res.best.find((b) => b.criterion === "sharpe")?.trades ?? [];
  const out = {
    label,
    ideasFed: feed.length,
    trades: r.trades,
    skippedBusy: r.skippedBusy,
    totalPnlPercent: +r.totalPnlPercent.toFixed(3),
    avgPnlPercent: +r.avgPnlPercent.toFixed(3),
    winRate: +r.winRate.toFixed(3),
    exitReasons: r.exitReasons,
    tradeList: trades.map((t) => ({
      dir: t.direction, entry: new Date(t.entryTimestamp).toISOString().slice(5, 16),
      exit: t.exitReason, pnl: +t.pnlPercent.toFixed(2),
    })),
  };
  console.log(`[${label}] ideas=${out.ideasFed} trades=${out.trades} pnl=${out.totalPnlPercent}% wr=${out.winRate}`);
  return out;
};

const byAuthors = (authors) => {
  const set = new Set(authors);
  return july.filter((r) => set.has(r.author));
};

const result = { generatedAtNote: "run on server, see run dir mtime", sharpeBest, pnlBest, wlSharpe, wlPnlSize: wlPnl.length, eligiblePool: eligible.length };

console.log(`июльский фид: ${july.length} идей; вайтлист sharpe=${wlSharpe.length}, pnl=${wlPnl.length}, eligible=${eligible.length}`);

// 1) OOS его прод-артефакта (главный тест)
result.oosSharpeWinner = await frozenRun(sharpeBest, byAuthors(wlSharpe), "OOS sharpe-winner WL13");
// 2) OOS PnL-победителя (его самый громкий процент)
result.oosPnlWinner = await frozenRun(pnlBest, byAuthors(wlPnl), "OOS pnl-winner");
// 3) crowd-baseline: без вайтлиста, те же exits
result.crowdBaseline = await frozenRun(sharpeBest, july, "crowd baseline (no WL)");
// 4) placebo-пучок
result.placebo = [];
for (let i = 0; i < PLACEBO_RUNS; i++) {
  const rnd = mulberry32(1000 + i);
  const wl = sample(eligible, wlSharpe.length, rnd);
  const run = await frozenRun(sharpeBest, byAuthors(wl), `placebo s${i}`);
  result.placebo.push({ seed: 1000 + i, wl, ...run });
}

const pnls = result.placebo.map((p) => p.totalPnlPercent).sort((a, b) => a - b);
result.placeboSummary = {
  n: pnls.length,
  min: pnls[0], max: pnls[pnls.length - 1],
  mean: +(pnls.reduce((a, b) => a + b, 0) / pnls.length).toFixed(3),
  realRankAmongPlacebo: pnls.filter((x) => x < result.oosSharpeWinner.totalPnlPercent).length,
};
console.log("placebo:", JSON.stringify(result.placeboSummary));

mkdirSync(SCRATCH, { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`saved: ${OUT}`);
process.exit(0);
