import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { readFileSync, writeFileSync } from "fs";
import { singleshot } from "functools-kit";
import { createWriteStream } from 'fs';
import { once } from 'events';
import ccxt from "ccxt";

async function writeLines(path, arr) {
  const ws = createWriteStream(path, {
    flags: 'w',
    encoding: 'utf8',
    highWaterMark: 1024 * 1024, // 1 МБ
  });
  for (let i = 0; i < arr.length; i++) {
    if (!ws.write(JSON.stringify(arr[i]) + '\n')) {
      await once(ws, 'drain');
    }
    arr[i] = null; // освобождаем ссылку, если массив больше не нужен
  }
  ws.end();
  await once(ws, 'finish');
}

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
  exchangeName: "ccxt_cached",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
});

addSimulatorSchema({
  simulatorName: "tv_probe",
  exchangeName: "ccxt_cached",
  reportOrder: "sharpe",
  callbacks: {
    onProgress(symbol, stage, processed, total) {
      console.log(`symbol=${symbol} stage=${stage} processed=${processed} total=${total}`)
    }
  }
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const result = await Simulator.run({
  symbol: "BTCUSDT",
  simulatorName: "tv_probe",
  ideas,
});

const { reports, ...other } = result;

// единственная метрика profit-before-stop: одна корзина, три ленты
await writeFileSync("./result.json", JSON.stringify(other, null, 2))

await writeLines("./result_tracks.jsonl", reports.tracks);
await writeLines("./result_best.jsonl", reports.best);
await writeLines("./result_reports.jsonl", reports.reports);

process.exit(0);
