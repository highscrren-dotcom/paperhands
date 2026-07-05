/**
 * fast_candles — быстрый GetCandles-адаптер для ТЯЖЁЛЫХ прогонов стенда
 * (fit/walk-forward: сотни тысяч 1m-свечей).
 *
 * Зачем: движковый read-through кэш backtest-kit пишет КАЖДУЮ свечу отдельным
 * JSON-файлом (~30s на задачу разметки, fit 834 задач ≈ 7 часов). Здесь —
 * прямой ccxt.binance + компактный дневной кэш (1 файл = 1 символ-день 1m,
 * JSON-массив), та же биржа и те же данные.
 *
 * Семантика контракта GetCandles pump-anomaly (src/candle.ts): библиотека
 * вызывает ТОЛЬКО форму (symbol, "1m", limit, sDate) — forward от align(sDate),
 * sDate inclusive; чанкинг/дедуп/сортировку делает сама (fetchCandlesChunked).
 * Мы дополнительно поддерживаем (limit, sDate, eDate) и (_, sDate, eDate)
 * для B&H-расчётов.
 *
 * Движковый шов (Exchange.getRawCandles, lib.mjs) остаётся эталонным путём —
 * он провалидирован на jan-2026 (index.mjs); данные идентичны (публичный OHLCV).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ccxt from "ccxt";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, "cache_1m");

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

let exchangePromise = null;
const getExchange = () =>
  (exchangePromise ??= (async () => {
    const exchange = new ccxt.binance({
      options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
      enableRateLimit: true,
    });
    await exchange.loadMarkets();
    return exchange;
  })());

const memory = new Map(); // `${symbol}|${dayStartMs}` → candle[] (в т.ч. пустой)
const MEMORY_CAP = 240; // LRU-кап: ~240 дней × 1440 свечей; излишек перечитывается с диска (OOM-фикс)
const deadSymbols = new Set(); // символы, по которым биржа стабильно кидает

function memorySet(key, rows) {
  if (memory.size >= MEMORY_CAP) {
    // Map хранит порядок вставки — выселяем самый старый
    memory.delete(memory.keys().next().value);
  }
  memory.set(key, rows);
}

function dayFile(symbol, dayStart) {
  const d = new Date(dayStart).toISOString().slice(0, 10);
  return join(CACHE_DIR, symbol, `${d}.json`);
}

/** Полный день 1m-свечей [dayStart, dayStart+24h): кэш → диск → биржа (2×720). */
async function loadDay(symbol, dayStart) {
  const key = `${symbol}|${dayStart}`;
  if (memory.has(key)) return memory.get(key);

  const file = dayFile(symbol, dayStart);
  if (existsSync(file)) {
    const rows = JSON.parse(readFileSync(file, "utf8"));
    memorySet(key, rows);
    return rows;
  }

  if (deadSymbols.has(symbol)) throw new Error(`symbol ${symbol} unavailable (cached failure)`);
  const exchange = await getExchange();
  const rows = [];
  try {
    for (const offset of [0, 720 * MIN_MS]) {
      const chunk = await exchange.fetchOHLCV(symbol, "1m", dayStart + offset, 720);
      for (const [timestamp, open, high, low, close, volume] of chunk) {
        if (timestamp >= dayStart && timestamp < dayStart + DAY_MS)
          rows.push({ timestamp, open, high, low, close, volume });
      }
    }
  } catch (e) {
    if (/symbol|market/i.test(String(e.message))) deadSymbols.add(symbol);
    throw e;
  }
  rows.sort((a, b) => a.timestamp - b.timestamp);
  // дедуп по timestamp (границы чанков)
  const dedup = rows.filter((c, i) => i === 0 || c.timestamp !== rows[i - 1].timestamp);
  // не кэшируем на диск текущий (незакрытый) день
  if (dayStart + DAY_MS <= Date.now()) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(dedup));
  }
  memorySet(key, dedup);
  return dedup;
}

async function range1m(symbol, fromMs, toMs) {
  const out = [];
  for (let day = Math.floor(fromMs / DAY_MS) * DAY_MS; day < toMs; day += DAY_MS) {
    const rows = await loadDay(symbol, day);
    for (const c of rows) if (c.timestamp >= fromMs && c.timestamp < toMs) out.push(c);
  }
  return out;
}

/** GetCandles pump-anomaly. Для "1m" — через дневной кэш; прочие ТФ — прямой fetch. */
export async function getCandles(symbol, interval, limit, sDate, eDate) {
  if (interval === "1m") {
    const step = MIN_MS;
    if (sDate != null) {
      const from = Math.floor(sDate / step) * step;
      const to = eDate != null ? eDate : from + (limit ?? 500) * step;
      const rows = await range1m(symbol, from, to);
      return limit != null ? rows.slice(0, limit) : rows;
    }
    if (eDate != null && limit != null) {
      const to = eDate;
      const from = Math.floor(eDate / step) * step - limit * step;
      return (await range1m(symbol, from, to)).slice(-limit);
    }
    throw new Error("fast_candles: (limit) без sDate/eDate не поддержан (в стенде не используется)");
  }
  // редкий путь (B&H "1h"): прямой fetch без кэша
  const exchange = await getExchange();
  const stepMs = { "1h": 3_600_000, "15m": 900_000, "4h": 14_400_000 }[interval];
  if (!stepMs) throw new Error(`fast_candles: interval ${interval} не поддержан`);
  const from = sDate ?? (eDate != null && limit != null ? eDate - limit * stepMs : undefined);
  if (from == null) throw new Error("fast_candles: нужен sDate или (eDate,limit)");
  const want = limit ?? (eDate != null ? Math.ceil((eDate - from) / stepMs) : 500);
  const out = [];
  let cursor = from;
  while (out.length < want) {
    const chunk = await exchange.fetchOHLCV(symbol, interval, cursor, Math.min(1000, want - out.length));
    if (!chunk.length) break;
    for (const [timestamp, open, high, low, close, volume] of chunk) {
      if (eDate != null && timestamp >= eDate) break;
      out.push({ timestamp, open, high, low, close, volume });
    }
    const last = chunk.at(-1)[0];
    if (last + stepMs <= cursor) break;
    cursor = last + stepMs;
    if (eDate != null && cursor >= eDate) break;
  }
  return out;
}
