import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import ccxt from "ccxt";

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

// Проба осуществимости, НЕ поиск заработка: вся собирающая прибыль
// механика выключена (замок, трейлинг). Вопрос — даёт ли удержание
// идей толпы прибыльный КОРИДОР по стопу x холду, и как выглядит
// СЫРОЙ трек авторов (ideas/hits/hitRate). Бана нет: движок грейдит,
// кому верить — юзерспейс
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    // грубая шкала катастрофы: коридор должен быть широким, не точкой
    hardStopPercent: [2, 3, 5, 7],
    // инертен (взводится с пика entry/(1-1) = бесконечность):
    // проба не собирает прибыль, выход — по времени или стопу
    trailingTakePercent: [100],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    profitLockPercent: [0],
    // close: закрытие окна холда в сторону идеи — у пробы замок
    // выключен (lock=0), уровневым метрикам грейдить нечем
    authorMetric: ["close"],
  },
  reportOrder: "sharpe",
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

const result = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "tv_simulator", ideas });
writeFileSync("./dump/simulator.done.json", JSON.stringify(result, null, 2));
// проба пинует authorMetric: ["close"] — её точки и треки в этой корзине
const bucket = result.reports.close;
const profitable = bucket.reports.filter(({ totalPnlPercent }) => totalPnlPercent > 0).length;
const proven = bucket.tracks.filter(({ ideas, hitRate }) => ideas >= 3 && hitRate >= 0.5).length;
console.log(
  "saved; profiles:", result.profileCount,
  "| profitable:", `${profitable}/${bucket.reports.length}`,
  "| tracks:", bucket.tracks.length,
  "| proven (ideas>=3, hitRate>=0.5):", proven,
);
process.exit(0);
