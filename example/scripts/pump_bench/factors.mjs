/**
 * factors — факторы volume-anomaly (skew executed trades) и garch (прогноз
 * волатильности) ПО ОБРАЗЦУ demo/ccxt/src/index.mjs автора (его прямой ответ
 * 2026-07-09 на вопрос «как стыкуются garch/volume/pump»). Функции и константы
 * перенесены дословно; схема биржи — общая из lib.mjs (там же живёт
 * getAggregatedTrades). Ничего своего: это канон интеграции.
 *
 * Использование: observation-only слой paper-контура (forward.mjs пишет
 * факторы в леджер рядом с решением; торговые решения НЕ меняет).
 *
 * Смоук: node scripts/pump_bench/factors.mjs BTCUSDT   (из example/)
 */
import { Exchange } from "backtest-kit";
import * as volume from "volume-anomaly";
import * as volatility from "garch";

import { exchangeName } from "./lib.mjs";

const ANOMALY_CONFIDENCE = 0.75; // volume-anomaly composite score
const N_TRAIN = 1200; // baseline count
const N_DETECT = 200; // detection window

export const getExecutedTradesSkew = async (symbol) => {
  const all = await Exchange.getAggregatedTrades(symbol, {
    exchangeName,
  }, N_TRAIN + N_DETECT);
  return volume.predict(
    all.slice(0, N_TRAIN),
    all.slice(N_TRAIN),
    ANOMALY_CONFIDENCE,
  );
};

export const getVolatilityForecast = async (symbol) => {
  const candles_1m = await Exchange.getCandles(symbol, "1m", 1_500, { exchangeName });
  const candles_5m = await Exchange.getCandles(symbol, "5m", 1_500, { exchangeName });
  const candles_15m = await Exchange.getCandles(symbol, "15m", 1_000, { exchangeName });
  const candles_30m = await Exchange.getCandles(symbol, "30m", 1_000, { exchangeName });
  const candles_1h = await Exchange.getCandles(symbol, "1h", 500, { exchangeName });
  const candles_4h = await Exchange.getCandles(symbol, "4h", 500, { exchangeName });
  const candles_6h = await Exchange.getCandles(symbol, "6h", 300, { exchangeName });
  const candles_8h = await Exchange.getCandles(symbol, "8h", 300, { exchangeName });

  const { sigma: sigma_1m, reliable: reliable_1m } = await volatility.predict(candles_1m, "1m");
  const { sigma: sigma_5m, reliable: reliable_5m } = await volatility.predict(candles_5m, "5m");
  const { sigma: sigma_15m, reliable: reliable_15m } = await volatility.predict(candles_15m, "15m");
  const { sigma: sigma_30m, reliable: reliable_30m } = await volatility.predict(candles_30m, "30m");
  const { sigma: sigma_1h, reliable: reliable_1h } = await volatility.predict(candles_1h, "1h");
  const { sigma: sigma_4h, reliable: reliable_4h } = await volatility.predict(candles_4h, "4h");
  const { sigma: sigma_6h, reliable: reliable_6h } = await volatility.predict(candles_6h, "6h");
  const { sigma: sigma_8h, reliable: reliable_8h } = await volatility.predict(candles_8h, "8h");

  return {
    volatility_1m: { sigma_1m, reliable_1m },
    volatility_5m: { sigma_5m, reliable_5m },
    volatility_15m: { sigma_15m, reliable_15m },
    volatility_30m: { sigma_30m, reliable_30m },
    volatility_1h: { sigma_1h, reliable_1h },
    volatility_4h: { sigma_4h, reliable_4h },
    volatility_6h: { sigma_6h, reliable_6h },
    volatility_8h: { sigma_8h, reliable_8h },
  };
};

/** Оба фактора разом; ошибки не валят вызывающего (fapi-шум HYPE/FARTCOIN). */
export const getFactors = async (symbol) => {
  const [skew, vol] = await Promise.allSettled([
    getExecutedTradesSkew(symbol),
    getVolatilityForecast(symbol),
  ]);
  return {
    tradesSkew: skew.status === "fulfilled" ? skew.value : { error: String(skew.reason?.message ?? skew.reason).slice(0, 120) },
    volatility: vol.status === "fulfilled" ? vol.value : { error: String(vol.reason?.message ?? vol.reason).slice(0, 120) },
  };
};

// смоук-режим: node scripts/pump_bench/factors.mjs [SYMBOL]
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const symbol = process.argv[2] || "BTCUSDT";
  console.log(JSON.stringify(await getFactors(symbol), null, 2));
}
