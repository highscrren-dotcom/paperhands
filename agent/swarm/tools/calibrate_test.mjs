// Этап 1 PLAN-petr — OOS калибровочного хвоста (критерий (б) выбора метрики):
// трек по обучающим месяцам из train.<metric>.json (ЕДИНИЦЫ = МЕСЯЦЫ:
// ideas = сыгранные, hits = прибыльные) → Simulator.test на идеях хвостового
// месяца с authorMetric=<metric>. Зеркало src/test.mjs — механика Петра
// неизменна, параметризовано лишь метрикой-кандидатом (этап 1, ДО фиксации).
// Баны перевыводит движок из замороженных чисел точки.
//
// ЗАПУСКАТЬ ИЗ data/btc_2025/ (общий persist-кеш свечей движка).
// Запуск: node ../../tools/calibrate_test.mjs <metric> <trainMonth>... --test <месяц>
// Дамп: ./calibrate.test.<metric>.json (полный ISimulatorTestResult).
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ccxt from "ccxt";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ti = args.indexOf("--test");
const METRIC = args[0];
const TRAIN_MONTHS = ti > 1 ? args.slice(1, ti) : [];
const TEST_MONTH = args[ti + 1];
if (!METRIC || !TRAIN_MONTHS.length || !TEST_MONTH) {
  console.error("usage: node calibrate_test.mjs <metric> <trainMonth>... --test <месяц>");
  process.exit(1);
}

const POINT = JSON.parse(readFileSync(join(HERE, "..", "point.json"), "utf-8"));
delete POINT._comment;
POINT.authorMetric = METRIC; // кандидат калибровки

// помесячный трек из train.<metric>.json (та же арифметика, что lib_track)
const track = new Map();
for (const m of TRAIN_MONTHS) {
  const dump = JSON.parse(readFileSync(join(process.cwd(), m, "dump", `train.${METRIC}.json`), "utf-8"));
  for (const a of dump.authors) {
    if (!(a.trades > 0)) continue; // месяц без сделок не играет
    const t = track.get(a.author) ?? { months: 0, wins: 0 };
    t.months += 1;
    if (a.pnlPercent > 0) t.wins += 1; // строго больше нуля
    track.set(a.author, t);
  }
}
const authorStats = [...track.entries()].map(([author, t]) => ({ author, ideas: t.months, hits: t.wins }));

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

const ideas = readFileSync(join(process.cwd(), TEST_MONTH, "assets", "tv_ideas.jsonl"), "utf-8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const result = await Simulator.test({
  symbol: "BTCUSDT",
  simulatorName: "swarm_month",
  ideas,
  point: POINT,
  authorStats,
});
writeFileSync(join(process.cwd(), `calibrate.test.${METRIC}.json`), JSON.stringify(result, null, 1));
console.log(`[cal:${METRIC}] трек: авторов=${authorStats.length}; тест ${TEST_MONTH}: allowed=${result.allowedAuthors?.length ?? "?"} banned=${result.bannedAuthors?.length ?? "?"} pnl=${result.totalPnlPercent ?? "?"} sharpe=${result.sharpeRatio ?? "?"} trades=${result.trades ?? "?"} — calibrate.test.${METRIC}.json`);
process.exit(0);
