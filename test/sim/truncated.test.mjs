import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Обрезка горизонта концом данных (truncated):
 *  1) профиль, чей 5-дневный горизонт упирается в конец свечей,
 *     помечается truncated, а его сделка при холде больше остатка
 *     данных закрывается с exitReason = "data_truncated";
 *  2) кончились свечи = ПОТЕРЯ: обрезанная идея считается в треке как
 *     miss (не исключается). Автор cut: 4 идеи (3 полных + 1 обрезана)
 *     -> трек 4, hits 0 (дрейф не даёт фиксации). Автор shadow: 3
 *     идеи, все обрезаны -> трек 3, hits 0 — не пустой, а полный
 *     промахов.
 *
 * Мир: дрейф вверх, свечи существуют только до END (дальше пустые
 * чанки). Замок выключен, трейлинг инертен -> фиксации нет ни у кого,
 * все идеи — промахи; сам факт учёта обрезанных идей и есть проверка.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 7220; // > hold 7200: слот всегда свободен к следующей идее
// у 4-й идеи cut остаётся 3030 минут данных. Контракт Exchange строг
// (ровно limit свечей, иначе исключение), поэтому конец истории
// приходит ошибкой на неполном чанке, симулятор гасит её и обрезает
// профиль по границе последнего ПОЛНОГО чанка: 3030 -> 3000 минут.
const END_M = 3 * SPACING + 3031;
const END_TS = START + END_M * MINUTE;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: end-of-data truncation — data_truncated exit and no track credit for unfinished ideas", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-trunc-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        if (timestamp >= END_TS) {
          break; // мир свечей закончился
        }
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        result.push({ timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_trunc",
    exchangeName: "sim-trunc-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [7200],
      profitLockPercent: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  const ideas = [
    // cut: 3 полных горизонта + 1 обрезанный
    ...Array.from({ length: 4 }, (_, k) => idea(10 + k, k * SPACING, "LONG", "cut")),
    // shadow: все идеи в последних минутах мира — каждая обрезана
    // (остатки 1990/1509/1028 минут — не кратны чанку)
    ...Array.from({ length: 3 }, (_, k) => idea(20 + k, END_M - 1990 + k * 481, "LONG", "shadow")),
  ];

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_trunc",
    ideas,
  });

  // 4 обрезанных профиля: последняя идея cut + все три shadow
  if (result.profileCount !== 7 || result.truncatedCount !== 4) {
    fail(`expected 7 profiles / 4 truncated, got ${result.profileCount}/${result.truncatedCount}`);
    return;
  }

  const stats = Object.fromEntries(result.reports.tracks.map((s) => [s.author, s]));
  // cut: все 4 идеи в треке (обрезанная = miss, а не исключение);
  // дрейф без фиксации -> 0 hits
  if (stats.cut.ideas !== 4 || stats.cut.hits !== 0) {
    fail(`cut must have track=4 hits=0 (truncated idea counts as a miss), got ${JSON.stringify(stats.cut)}`);
    return;
  }
  // shadow: 3 обрезанные идеи учтены как промахи — трек не пустой
  if (stats.shadow.ideas !== 3 || stats.shadow.hits !== 0) {
    fail(`shadow must have track=3 hits=0 (all truncated => all misses), got ${JSON.stringify(stats.shadow)}`);
    return;
  }

  // сделки cut: 4 идеи торгуются, последняя режется концом данных
  // (shadow тоже торгует теперь — банов нет; берём только cut)
  const [{ trades: allTrades }] = captured;
  const trades = allTrades.filter((t) => t.author === "cut");
  if (trades.length !== 4) {
    fail(`expected 4 trades from cut, got ${trades.length}`);
    return;
  }
  const last = trades[trades.length - 1];
  if (last.exitReason !== "data_truncated") {
    fail(`last trade must exit as data_truncated, got ${last.exitReason}`);
    return;
  }
  // 3030 минут остатка обрезаются до последнего полного чанка (3000)
  if (last.holdMinutesActual !== 3000) {
    fail(`truncated trade hold must be the last full chunk boundary 3000m, got ${last.holdMinutesActual}`);
    return;
  }
  for (const trade of trades.slice(0, 3)) {
    if (trade.exitReason !== "time_expired") {
      fail(`full-horizon trades must exit by time, got ${trade.exitReason}`);
      return;
    }
  }

  pass(
    `truncation is a loss: 4/7 profiles truncated, cut track=4 hits=0 (truncated idea counted as miss), ` +
    `shadow track=3 hits=0, last trade data_truncated at ${last.holdMinutesActual}m`
  );
});
