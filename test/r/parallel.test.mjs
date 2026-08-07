import { test } from "worker-testbed";

import {
  listenSignalPerSignal,
  listenActivePingPerSignal,
  listenSignalActivePerSignal,
  emitters,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// Parallel-strategy behaviour of the per-signal dedup.
//
// The other files in test/r drive events one `await` at a time, which proves the
// key is composite but never actually interleaves executions the way a running
// fleet does. Here several strategies push through the SAME process-global
// subject concurrently, so their events land interleaved in a non-trivial order.
//
// This is what the LimitedMap replaced Operator.distinct for: `distinct` keeps a
// single "previous compare value" for the whole stream, so any other execution's
// event resets the baseline and lets the next repeat through as new. A per-key
// map gives each execution its own slot.
// ---------------------------------------------------------------------------

const flush = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

const tick = (extra) => ({
  action: "active",
  currentPrice: 100,
  backtest: false,
  createdAt: 1700000000000,
  pnl: { pnlPercentage: 0 },
  percentTp: 0,
  percentSl: 0,
  frameName: "r-frame",
  ...extra,
  signal: { id: extra.signalId, priceOpen: 100 },
});

// Yield to the event loop so concurrently started producers actually interleave
// instead of each draining its own loop synchronously.
const yieldTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// 1. N strategies monitoring their own position, all ticking concurrently
// ---------------------------------------------------------------------------
test("parallel strategies each get exactly one callback per signal", async ({ pass, fail }) => {
  const STRATEGIES = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const TICKS_PER_STRATEGY = 20;

  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active" && event.exchangeName === "par-1",
    (event) => seen.push(`${event.strategyName}/${event.signal.id}`)
  );

  // Every strategy monitors ONE signal and emits many ticks for it, exactly like
  // a live position being re-evaluated each minute.
  await Promise.all(
    STRATEGIES.map(async (strategyName) => {
      for (let i = 0; i < TICKS_PER_STRATEGY; i += 1) {
        await emitters.signalEmitter.next(
          tick({
            strategyName,
            exchangeName: "par-1",
            symbol: "BTCUSDT",
            signalId: `sig-${strategyName}`,
          })
        );
        await yieldTick();
      }
    })
  );
  await flush();
  unsubscribe();

  // One delivery per strategy, regardless of how the 100 ticks interleaved.
  const expected = STRATEGIES.map((s) => `${s}/sig-${s}`).sort();
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(
      `delivered ${JSON.stringify([...seen])} (${seen.length} of ${STRATEGIES.length * TICKS_PER_STRATEGY} ticks) ` +
      `expected one per strategy: ${JSON.stringify(expected)}`
    );
    return;
  }
  pass(
    `${STRATEGIES.length} strategies x ${TICKS_PER_STRATEGY} interleaved ticks collapsed to ` +
    `${seen.length} callbacks (one each)`
  );
});

// ---------------------------------------------------------------------------
// 2. Same strategy across parallel symbols
//
// One strategy name fanned out over several symbols is the common live layout;
// each symbol is a separate execution and must not suppress the others.
// ---------------------------------------------------------------------------
test("one strategy across parallel symbols keeps per-symbol dedup", async ({ pass, fail }) => {
  const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active" && event.exchangeName === "par-2",
    (event) => seen.push(`${event.symbol}/${event.signal.id}`)
  );

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      for (let i = 0; i < 15; i += 1) {
        await emitters.signalEmitter.next(
          tick({
            strategyName: "shared-strategy",
            exchangeName: "par-2",
            symbol,
            signalId: `sig-${symbol}`,
          })
        );
        await yieldTick();
      }
    })
  );
  await flush();
  unsubscribe();

  const expected = SYMBOLS.map((s) => `${s}/sig-${s}`).sort();
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify([...seen])} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass(`${SYMBOLS.length} parallel symbols under one strategy deduped independently`);
});

// ---------------------------------------------------------------------------
// 3. The exact Operator.distinct failure mode, under real concurrency
//
// Two strategies alternate ticks for their own long-lived signals. With a single
// shared "previous value" every tick would be delivered (each one differs from
// the one before it), so the callback count would equal the tick count.
// ---------------------------------------------------------------------------
test("alternating parallel strategies do not resurrect each other's signals", async ({ pass, fail }) => {
  const ROUNDS = 25;

  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active" && event.exchangeName === "par-3",
    (event) => seen.push(`${event.strategyName}/${event.signal.id}`)
  );

  // Strict A,B,A,B,... alternation — the worst case for a single-slot dedup.
  for (let i = 0; i < ROUNDS; i += 1) {
    await emitters.signalEmitter.next(
      tick({ strategyName: "alpha", exchangeName: "par-3", symbol: "BTCUSDT", signalId: "sig-alpha" })
    );
    await emitters.signalEmitter.next(
      tick({ strategyName: "beta", exchangeName: "par-3", symbol: "BTCUSDT", signalId: "sig-beta" })
    );
  }
  await flush();
  unsubscribe();

  const expected = ["alpha/sig-alpha", "beta/sig-beta"];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    fail(
      `delivered ${seen.length} callbacks ${JSON.stringify(seen.slice(0, 6))}... ` +
      `expected exactly ${JSON.stringify(expected)} — a single-slot dedup would deliver all ${ROUNDS * 2}`
    );
    return;
  }
  pass(`${ROUNDS * 2} strictly alternating ticks collapsed to 2 callbacks`);
});

// ---------------------------------------------------------------------------
// 4. Parallel executions rotating through a sequence of signals
//
// Each strategy closes one position and opens the next. Every strategy must
// report every one of ITS signals, exactly once, with no cross-talk.
// ---------------------------------------------------------------------------
test("parallel strategies rotating signals report each of their own exactly once", async ({ pass, fail }) => {
  const STRATEGIES = ["alpha", "beta", "gamma"];
  const SIGNALS_PER_STRATEGY = 6;
  const TICKS_PER_SIGNAL = 4;

  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active" && event.exchangeName === "par-4",
    (event) => seen.push(`${event.strategyName}/${event.signal.id}`)
  );

  await Promise.all(
    STRATEGIES.map(async (strategyName) => {
      for (let s = 0; s < SIGNALS_PER_STRATEGY; s += 1) {
        for (let t = 0; t < TICKS_PER_SIGNAL; t += 1) {
          await emitters.signalEmitter.next(
            tick({
              strategyName,
              exchangeName: "par-4",
              symbol: "BTCUSDT",
              signalId: `${strategyName}-s${s}`,
            })
          );
          await yieldTick();
        }
      }
    })
  );
  await flush();
  unsubscribe();

  const expected = [];
  for (const strategyName of STRATEGIES) {
    for (let s = 0; s < SIGNALS_PER_STRATEGY; s += 1) {
      expected.push(`${strategyName}/${strategyName}-s${s}`);
    }
  }
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected.sort())) {
    fail(
      `delivered ${seen.length} callbacks, expected ${expected.length} ` +
      `(one per signal per strategy). got=${JSON.stringify([...seen].sort())}`
    );
    return;
  }

  // Per strategy the order must follow its own rotation, untouched by the others.
  for (const strategyName of STRATEGIES) {
    const own = seen.filter((entry) => entry.startsWith(`${strategyName}/`));
    const ownExpected = Array.from(
      { length: SIGNALS_PER_STRATEGY },
      (_, s) => `${strategyName}/${strategyName}-s${s}`
    );
    if (JSON.stringify(own) !== JSON.stringify(ownExpected)) {
      fail(`${strategyName} sequence ${JSON.stringify(own)} expected ${JSON.stringify(ownExpected)}`);
      return;
    }
  }

  pass(
    `${STRATEGIES.length} strategies rotated ${SIGNALS_PER_STRATEGY} signals each ` +
    `(${STRATEGIES.length * SIGNALS_PER_STRATEGY * TICKS_PER_SIGNAL} ticks) -> ${seen.length} callbacks in per-strategy order`
  );
});

// ---------------------------------------------------------------------------
// 5. Live and backtest of the SAME strategy+symbol run side by side
//
// The mode is part of the key, so a backtest replay must not suppress the live
// position it shadows.
// ---------------------------------------------------------------------------
test("live and backtest of the same strategy dedup separately", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active" && event.exchangeName === "par-5",
    (event) => seen.push(`${event.backtest ? "backtest" : "live"}/${event.signal.id}`)
  );

  await Promise.all(
    [false, true].map(async (backtest) => {
      for (let i = 0; i < 12; i += 1) {
        await emitters.signalEmitter.next(
          tick({
            strategyName: "dual",
            exchangeName: "par-5",
            symbol: "BTCUSDT",
            backtest,
            signalId: "same-id",
          })
        );
        await yieldTick();
      }
    })
  );
  await flush();
  unsubscribe();

  // Identical signal id in both modes: both must be reported, once each.
  const expected = ["backtest/same-id", "live/same-id"];
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify([...seen])} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("same signal id in live and backtest reported once per mode");
});

// ---------------------------------------------------------------------------
// 6. Parallel executions on a data.id channel (active pings)
//
// Pings read their identity from event.data.* rather than the envelope, so the
// key is built from a different place and deserves its own parallel case.
// ---------------------------------------------------------------------------
test("parallel strategies on the activePing channel dedup per execution", async ({ pass, fail }) => {
  const STRATEGIES = ["alpha", "beta", "gamma"];

  const seen = [];
  const unsubscribe = listenActivePingPerSignal(
    (event) => event.exchangeName === "par-6",
    (event) => seen.push(`${event.data.strategyName}/${event.data.id}`)
  );

  const pingRow = (strategyName, id) => ({
    id,
    strategyName,
    exchangeName: "par-6",
    frameName: "r-frame",
    symbol: "BTCUSDT",
    position: "long",
    priceOpen: 100,
    priceTakeProfit: 110,
    priceStopLoss: 90,
    originalPriceOpen: 100,
    originalPriceTakeProfit: 110,
    originalPriceStopLoss: 90,
    cost: 100,
    totalEntries: 1,
    totalPartials: 0,
    partialExecuted: 0,
    _partial: [],
    note: "r-test",
    scheduledAt: 1700000000000,
    pendingAt: 1700000000000,
    minuteEstimatedTime: 60,
    pnl: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    peakProfit: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    maxDrawdown: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
  });

  await Promise.all(
    STRATEGIES.map(async (strategyName) => {
      for (let i = 0; i < 15; i += 1) {
        await emitters.activePingSubject.next({
          strategyName,
          exchangeName: "par-6",
          frameName: "r-frame",
          symbol: "BTCUSDT",
          currentPrice: 100,
          backtest: false,
          timestamp: 1700000000000,
          data: pingRow(strategyName, `ping-${strategyName}`),
        });
        await yieldTick();
      }
    })
  );
  await flush();
  unsubscribe();

  const expected = STRATEGIES.map((s) => `${s}/ping-${s}`).sort();
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify([...seen])} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("activePing (data.* identity) deduped per parallel strategy");
});

// ---------------------------------------------------------------------------
// 7. The same guarantee on an action-scoped alias
// ---------------------------------------------------------------------------
test("listenSignalActivePerSignal holds up across parallel strategies", async ({ pass, fail }) => {
  const STRATEGIES = ["alpha", "beta", "gamma", "delta"];

  const seen = [];
  const unsubscribe = listenSignalActivePerSignal(
    (event) => event.exchangeName === "par-7",
    (event) => seen.push(`${event.strategyName}/${event.signal.id}`)
  );

  await Promise.all(
    STRATEGIES.map(async (strategyName) => {
      for (let i = 0; i < 15; i += 1) {
        await emitters.signalEmitter.next(
          tick({
            strategyName,
            exchangeName: "par-7",
            symbol: "BTCUSDT",
            signalId: `alias-${strategyName}`,
          })
        );
        await yieldTick();
      }
    })
  );
  await flush();
  unsubscribe();

  const expected = STRATEGIES.map((s) => `${s}/alias-${s}`).sort();
  const got = [...seen].sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify([...seen])} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass(`alias per-signal form deduped ${STRATEGIES.length} parallel strategies`);
});
