// Этап 2 PLAN-petr — тренировка месяца (ФИНАЛ по demo/simulator@17.0.0).
//  1) общий Simulator.run месяца — справочные цифры (dump/train.common.json);
//  2) ЦИКЛ ПО АВТОРАМ: изолированный Simulator.run идей одного логина на
//     одноточечных осях POINT — слот собственный, букашки друг друга не видят;
//  3) dump/train.json = {month, point, authors:[{author, ideas, trades,
//     pnlPercent, exitReasons}]} — сырые данные (формат PLAN-petr).
// Прибыльный месяц: pnlPercent > 0 СТРОГО; месяц без сделок не играет.
//
// Калибровка (этап 1): SWARM_METRICS="close,pnl,trail" гоняет несколько
// метрик ОДНИМ прогоном (корзины 17.0.0); пишется dump/train.<metric>.json
// на каждую. Без env — одна метрика из point.json (после фиксации).
// ⚠️ При profitLockPercent=0 движок исключает reach/retain из сетки
// (BREAKING §6) — с точкой Петра калибруемы только close/pnl/trail.
//
// ЗАПУСКАТЬ ИЗ КОРНЯ ДАННЫХ (data/btc_2025/): persist-кеш свечей движка
// пишется в ./dump от cwd — общий на все папки («скачиваются один раз»).
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import ccxt from "ccxt";

const SRC = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(SRC, "..");
const MONTH = basename(FOLDER);
const POINT = JSON.parse(readFileSync(join(SRC, "..", "..", "..", "..", "point.json"), "utf-8"));
delete POINT._comment;

const METRICS = process.env.SWARM_METRICS
  ? process.env.SWARM_METRICS.split(",").map((s) => s.trim())
  : [POINT.authorMetric];
if (!METRICS[0]) { console.error("authorMetric не задан: калибровка — SWARM_METRICS, после — point.json"); process.exit(2); }

// биржа — дословно из demo/simulator (persist-кеш движка сам качает один раз)
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

// оси зеркалят POINT одноточечно (правило: молчаливых дефолтов нет);
// метрики — корзинами одного прогона
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
    authorMetric: METRICS,
  },
  reportOrder: "sharpe",
});

const SYMBOL = "BTCUSDT";
const ideas = readFileSync(join(FOLDER, "assets", "tv_ideas.jsonl"), "utf-8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

// 1) общий прогон — справочно
const common = await Simulator.run({ symbol: SYMBOL, simulatorName: "swarm_month", ideas });
writeFileSync(join(FOLDER, "dump", "train.common.json"), JSON.stringify(common, null, 1));

// 2) цикл по авторам — изолированные прогоны, букашки друг друга не видят
const authors = [...new Set(ideas.map((i) => i.author))].sort();
const perMetric = new Map(METRICS.map((m) => [m, []]));
for (const author of authors) {
  const mine = ideas.filter((i) => i.author === author);
  const r = await Simulator.run({ symbol: SYMBOL, simulatorName: "swarm_month", ideas: mine });
  for (const metric of METRICS) {
    const bucket = r.reports[metric];
    const rep = bucket?.reports?.[0]; // одна точка на корзину
    perMetric.get(metric).push({
      author,
      ideas: mine.length,
      trades: rep?.trades ?? 0,
      pnlPercent: rep?.totalPnlPercent ?? 0,
      exitReasons: rep?.exitReasons ?? {},
    });
  }
  console.log(`[${MONTH}] ${author}: ${METRICS.map((m) => `${m}=${(perMetric.get(m).at(-1).pnlPercent).toFixed(2)}%/${perMetric.get(m).at(-1).trades}тр`).join(" ")}`);
}

// 3) дампы формата PLAN-petr (сырые данные)
for (const metric of METRICS) {
  const dump = { month: MONTH, point: { ...POINT, authorMetric: metric }, authors: perMetric.get(metric) };
  const name = METRICS.length === 1 ? "train.json" : `train.${metric}.json`;
  writeFileSync(join(FOLDER, "dump", name), JSON.stringify(dump, null, 1));
}
console.log(`[${MONTH}] готово: авторов ${authors.length}, метрики ${METRICS.join(",")}`);
process.exit(0);
