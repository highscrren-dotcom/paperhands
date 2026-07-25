import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Слот НА АВТОРА: занятая позиция автора поглощает только ЕГО же
 * следующую идею, попавшую в окно холда; идея другого автора в тот
 * же момент торгуется в своём слоте (перекрытий между авторами нет).
 *
 * Мир плоский (цена 1000). Холд большой — 600м (10ч), чтобы окно
 * холда перекрыло анти-флуд дедуп (8ч на автора+направление):
 *  - X идея A @ 0ч: вход м1, выход м601, слот X занят до м602;
 *  - X идея B @ 9ч (540м): переживает дедуп (>8ч после A), но вход
 *    541 < 602 -> ПОГЛОЩЕНА слотом X;
 *  - Y идея C @ 9ч: свой слот Y свободен -> ТОРГУЕТСЯ параллельно X;
 *  - X идея D @ 20ч (1200м): слот X давно свободен -> ТОРГУЕТСЯ.
 *
 * Итог: 3 сделки (A, C, D), 1 поглощение (B съедена A, с автором X).
 */

const START = 1704067200000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

test("SIM: a slot is per-author — an author's hold absorbs only his own overlapping idea, others trade in parallel", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-slot-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => ({
        timestamp: alignedSince + i * MINUTE,
        open: 1000,
        high: 1000,
        low: 1000,
        close: 1000,
        volume: 100,
      }));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_slot",
    exchangeName: "sim-slot-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [600],
      profitLockPercent: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_slot",
    ideas: [
      { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "X" },
      { id: 2, ts: START + 9 * HOUR, symbol: "TESTUSDT", direction: "LONG", author: "X" },
      { id: 3, ts: START + 9 * HOUR, symbol: "TESTUSDT", direction: "LONG", author: "Y" },
      { id: 4, ts: START + 20 * HOUR, symbol: "TESTUSDT", direction: "LONG", author: "X" },
    ],
  });

  const [{ report, trades }] = captured;

  // A, C, D торгуют; B поглощена слотом X
  if (report.tradesList.length !== 3 || report.skippedBusy !== 1) {
    fail(`expected 3 trades + 1 absorbed, got ${report.trades}/${report.skippedBusy}`);
    return;
  }
  const tradedIds = trades.map((t) => t.ideaId).sort((a, b) => a - b);
  if (JSON.stringify(tradedIds) !== JSON.stringify([1, 3, 4])) {
    fail(`traded ideas must be [1,3,4] (X-A, Y-C, X-D), got ${JSON.stringify(tradedIds)}`);
    return;
  }

  // поглощение — на сделке X-A, именно идея 2, автор X (свой слот)
  const tradeA = trades.find((t) => t.ideaId === 1);
  if (JSON.stringify(tradeA.absorbedIdeas) !== JSON.stringify([{ ideaId: 2, author: "X" }])) {
    fail(`X's hold must absorb exactly his own idea 2, got ${JSON.stringify(tradeA.absorbedIdeas)}`);
    return;
  }

  // идея Y торговалась ПАРАЛЛЕЛЬНО занятому слоту X — доказательство
  // изоляции слотов: entry C внутри окна холда A
  const tradeC = trades.find((t) => t.ideaId === 3);
  const tradeD = trades.find((t) => t.ideaId === 4);
  if (!(tradeC.entryTimestamp < tradeA.exitTimestamp)) {
    fail(`Y's trade must overlap X's busy slot (slots are per-author)`);
    return;
  }
  // никого не поглотили ни Y, ни поздняя X-идея
  if (tradeC.absorbedIdeas.length !== 0 || tradeD.absorbedIdeas.length !== 0) {
    fail(`Y and the late X idea must absorb nothing, got ${tradeC.absorbedIdeas.length}/${tradeD.absorbedIdeas.length}`);
    return;
  }

  pass(
    `per-author slot: X's hold ate only his own idea 2; Y traded in parallel with X's busy slot; ` +
    `late X idea traded after his slot freed — 3 trades, 1 absorbed`
  );
});
