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
  exchangeName: "ccxt_exchange",
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

await writeFileSync("./result.json", JSON.stringify(other, null, 2))

{
  await writeLines("./result_close_tracks.jsonl", result.reports.close.tracks);
  await writeLines("./result_close_best.jsonl", result.reports.close.best);
  await writeLines("./result_close_reports.jsonl", result.reports.close.reports);
}

{
  await writeLines("./result_pnl_tracks.jsonl", result.reports.pnl.tracks);
  await writeLines("./result_pnl_best.jsonl", result.reports.pnl.best);
  await writeLines("./result_pnl_reports.jsonl", result.reports.pnl.reports);
}

{
  await writeLines("./result_reach_tracks.jsonl", result.reports.reach.tracks);
  await writeLines("./result_reach_best.jsonl", result.reports.reach.best);
  await writeLines("./result_reach_reports.jsonl", result.reports.reach.reports);
}

{
  await writeLines("./result_retain_tracks.jsonl", result.reports.retain.tracks);
  await writeLines("./result_retain_best.jsonl", result.reports.retain.best);
  await writeLines("./result_retain_reports.jsonl", result.reports.retain.reports);
}

{
  await writeLines("./result_trail_tracks.jsonl", result.reports.trail.tracks);
  await writeLines("./result_trail_best.jsonl", result.reports.trail.best);
  await writeLines("./result_trail_reports.jsonl", result.reports.trail.reports);
}

process.exit(0);
