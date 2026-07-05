/**
 * lib — общий слой стенда pump_bench: ccxt-схема биржи (по образцу
 * example/scripts/run_forecast.ts), адаптер getCandles (движковый
 * Exchange.getRawCandles → GetCandles pump-anomaly, порядок аргументов 1-в-1)
 * и честная агрегация метрик (epsilon-guard на Sharpe — урок walk-forward
 * dec2025, см. agent/notes/walk-forward-dec2025.md).
 *
 * Запускать потребителей из example/ (cwd): read-through кэш свечей ядро
 * пишет в ./dump/data/candle относительно cwd.
 */
import { writeFileSync } from "node:fs";

import { addExchangeSchema, Exchange, roundTicks } from "backtest-kit";
import { singleshot } from "functools-kit";
import ccxt from "ccxt";

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

export const exchangeName = "ccxt-exchange";

addExchangeSchema({
  exchangeName,
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: async (symbol, price) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const tickSize = market.limits?.price?.min || market.precision?.price;
    if (tickSize !== undefined) return roundTicks(price, tickSize);
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const stepSize = market.limits?.amount?.min || market.precision?.amount;
    if (stepSize !== undefined) return roundTicks(quantity, stepSize);
    return exchange.amountToPrecision(symbol, quantity);
  },
});

/** Адаптер: движковый getRawCandles → GetCandles pump-anomaly. */
export const getCandles = (symbol, interval, limit, sDate, eDate) =>
  Exchange.getRawCandles(symbol, interval, { exchangeName }, limit, sDate, eDate);

export const pct = (x) =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 100; // доля → %

export const writeJsonl = (file, rows) =>
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));

/** Агрегация pnl-долей (в порядке времени): winrate/mean/median/Sharpe/maxDD. */
export function aggregate(pnls) {
  const n = pnls.length;
  if (!n) return { n: 0 };
  const sorted = [...pnls].sort((a, b) => a - b);
  const mean = pnls.reduce((s, x) => s + x, 0) / n;
  const median =
    n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const std = Math.sqrt(variance);
  // std≈0 → Sharpe = N/A, а не 1e14 («фейковая Sharpe», rake #10)
  const EPS = 1e-9;
  const sharpe = std < EPS ? null : mean / std;
  let cum = 0, peak = 0, maxDD = 0;
  for (const x of pnls) {
    cum += x;
    peak = Math.max(peak, cum);
    maxDD = Math.min(maxDD, cum - peak);
  }
  const wins = pnls.filter((x) => x > 0).length;
  return {
    n,
    winRatePct: Math.round((wins / n) * 10000) / 100,
    meanPct: pct(mean),
    medianPct: pct(median),
    stdPct: pct(std),
    perTradeSharpe: sharpe == null ? "N/A (std≈0)" : Math.round(sharpe * 100) / 100,
    sumPct: pct(cum),
    maxDDPct: pct(maxDD),
  };
}
