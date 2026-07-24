// Этап 3 PLAN-petr — walk-forward тест месяца M (ФИНАЛ по demo/tune@17.0.0).
// authorStats = помесячный трек роя ТОЛЬКО по месяцам < M (ЕДИНИЦЫ = МЕСЯЦЫ:
// ideas = сыгранные, hits = прибыльные; lib_track). Баны перевыводит движок:
// ideas>=minAuthorTrack, hits/ideas>=minAuthorHitRate, невиданные забанены.
// Идеи месяца M целиком; dump/test.json = полный ISimulatorTestResult.
// ЗАПУСКАТЬ ИЗ КОРНЯ ДАННЫХ (data/btc_2025/) — общий persist-кеш свечей.
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import ccxt from "ccxt";
import { monthlyTrackBefore } from "../../../../tools/lib_track.mjs";

const SRC = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(SRC, "..");
const MONTH = basename(FOLDER);
const POINT = JSON.parse(readFileSync(join(SRC, "..", "..", "..", "..", "point.json"), "utf-8"));
delete POINT._comment;
if (!POINT.authorMetric) { console.error("authorMetric не откалиброван (этап 1) — стоп"); process.exit(2); }

const authorStats = monthlyTrackBefore(join(FOLDER, ".."), MONTH);
if (!authorStats.length) { console.error(`трек до ${MONTH} пуст — тестировать нечем (минимальный трек копится, этап 4)`); process.exit(2); }

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
    timeout: 15000,
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

// сетка инертна для test(): одна замороженная точка, оси зеркалят POINT
addSimulatorSchema({
  simulatorName: "swarm_month",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [POINT.hardStopPercent],
    trailingTakePercent: [POINT.trailingTakePercent],
    holdMinutes: [POINT.holdMinutes],
    minAuthorTrack: [POINT.minAuthorTrack],
    minAuthorHitRate: [POINT.minAuthorHitRate],
    profitLockPercent: [POINT.profitLockPercent],
    authorMetric: [POINT.authorMetric],
  },
  reportOrder: "sharpe",
});

const ideas = readFileSync(join(FOLDER, "assets", "tv_ideas.jsonl"), "utf-8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const result = await Simulator.test({
  symbol: "BTCUSDT",
  simulatorName: "swarm_month",
  ideas,
  point: POINT,
  authorStats,
});
writeFileSync(join(FOLDER, "dump", "test.json"), JSON.stringify(result, null, 1));
console.log(`[${MONTH}] OOS: allowed ${result.allowedAuthors?.length ?? 0}, banned ${result.bannedAuthors?.length ?? 0} — dump/test.json`);
process.exit(0);
