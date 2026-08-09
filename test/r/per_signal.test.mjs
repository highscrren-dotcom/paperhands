import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenSignalPerSignal,
  listenSignalLivePerSignal,
  listenSignalBacktestPerSignal,
  listenSignalEventPerSignal,
  listenHighestProfitPerSignal,
  listenMaxDrawdownPerSignal,
  listenStrategyCommitPerSignal,
  emitters,
} from "../../build/index.mjs";

// Every signal-carrying listener now confirms the signal is still live via
// hasPendingSignal / hasScheduledSignal, and that lookup resolves the strategy
// through the schema registry - an unknown name throws. These tests drive the
// subjects directly, so the strategies they name must exist. No position is ever
// opened, so the gate answers "no" and only the ungated (terminal / idle)
// channels deliver.
// The files in test/r share one process and some name the same strategy, while
// add*Schema throws on a duplicate. globalThis keeps the bookkeeping shared across
// the modules so whichever loads first wins and the rest skip.
const REGISTERED =
  (globalThis.__rSuiteRegistered ??= { exchanges: new Set(), strategies: new Set() });

const registerSchemas = (strategyNames, exchangeNames) => {
  for (const exchangeName of exchangeNames) {
    if (REGISTERED.exchanges.has(exchangeName)) continue;
    REGISTERED.exchanges.add(exchangeName);
    addExchangeSchema({
      exchangeName,
      getCandles: async () => [],
      formatPrice: async (_symbol, price) => price.toFixed(2),
      formatQuantity: async (_symbol, quantity) => quantity.toFixed(2),
    });
  }
  for (const strategyName of strategyNames) {
    if (REGISTERED.strategies.has(strategyName)) continue;
    REGISTERED.strategies.add(strategyName);
    addStrategySchema({ strategyName, interval: "1m", getSignal: async () => null });
  }
};

registerSchemas(["r-strategy", "r-gated-strategy", "alpha", "beta"], ["r-exchange", "r-gated-exchange", "ex"]);

// ---------------------------------------------------------------------------
// The `...PerSignal` listeners in src/function/event.ts all share one pipeline:
//
//   subject.filter(filterFn).operator(Operator.distinct(id)).connect(queued(fn))
//
// These tests drive the real exported subjects directly. That is deliberate:
// the behaviour under test is pure stream wiring (predicate, dedup key, operator
// ORDER, unsubscribe), none of which depends on a running strategy. Feeding the
// subjects keeps each case deterministic and free of candle/timing flake.
//
// Note the per-signal listeners deliberately skip the `hasPendingSignal` gate
// that the plain `listenX` forms apply, so no strategy state is needed here.
// ---------------------------------------------------------------------------

// Subject.next() resolves once the value is dispatched, but every listener is
// wrapped in queued(...), so the user callback runs on a later turn. Awaiting a
// macrotask is what makes the collected arrays stable.
const flush = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// worker-testbed runs the tests in this file against ONE shared set of subjects,
// and a listener stays attached for as long as its test is in flight, so another
// test's events pass through this test's predicate. Every emitted event carries
// a full tick shape so no neighbouring listener can throw on it.
const tick = (action, id, extra = {}) => ({
  action,
  signal: id === null ? null : { id, priceOpen: 100 },
  strategyName: "r-strategy",
  exchangeName: "r-exchange",
  frameName: "",
  symbol: "BTCUSDT",
  currentPrice: 100,
  backtest: false,
  createdAt: 1700000000000,
  pnl: { pnlPercentage: 0 },
  ...extra,
});

const signalRow = (id) => ({
  id,
  strategyName: "r-strategy",
  exchangeName: "r-exchange",
  frameName: "",
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

// ---------------------------------------------------------------------------
// 1. Core dedup contract on the global signal emitter
// ---------------------------------------------------------------------------
test("listenSignalPerSignal fires once per new signal id", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active",
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "B"));
  await emitters.signalEmitter.next(tick("active", "B"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["A", "B"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["A","B"]`);
    return;
  }
  pass("three A ticks collapsed to one delivery, B delivered separately");
});

// ---------------------------------------------------------------------------
// 2. Operator ORDER regression: filter must precede distinct
//
// `Operator.distinct` remembers only the PREVIOUS compare value. If the user
// predicate ran after it, a non-matching event would advance that stored value
// and the next matching event of the same signal would look new. Interleaving a
// filtered-out event between two identical matching ones is the exact case that
// separates the two orderings.
// ---------------------------------------------------------------------------
test("listenSignalPerSignal: a filtered-out event does not reset the dedup state", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active",
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "X"));
  // fails the predicate; with distinct placed first this would advance prevValue
  // and leak the repeat below
  await emitters.signalEmitter.next(tick("closed", "Y"));
  await emitters.signalEmitter.next(tick("active", "X"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["X"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["X"] — filter/distinct ordering regression`);
    return;
  }
  pass("interleaved non-matching event did not leak a duplicate");
});

// ---------------------------------------------------------------------------
// 3. Dedup survives an interleaved signal on the SAME execution
//
// Within one execution the map holds a single slot, so A -> B -> A does report A
// twice: the slot legitimately moved to B in between. What must NOT happen is a
// repeat of the CURRENT signal, which test 1 covers.
// ---------------------------------------------------------------------------
test("listenSignalPerSignal tracks the latest signal id per execution", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active",
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "B"));
  await emitters.signalEmitter.next(tick("active", "A"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["A", "B", "A"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["A","B","A"]`);
    return;
  }
  pass("one slot per execution: A reported again after the slot moved to B");
});

// ---------------------------------------------------------------------------
// 4. Idle events carry `signal: null` and must never reach the callback
// ---------------------------------------------------------------------------
test("listenSignalPerSignal skips idle events (signal is null)", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    () => true,
    (event) => seen.push(event.signal === null ? "NULL" : event.signal.id)
  );

  await emitters.signalEmitter.next(tick("idle", null));
  await emitters.signalEmitter.next(tick("idle", null));
  await emitters.signalEmitter.next(tick("opened", "A"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["A"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["A"] — idle leaked and would crash consumers reading event.signal.id`);
    return;
  }
  pass("idle events filtered out, only the signal-bearing event delivered");
});

// ---------------------------------------------------------------------------
// 5. Unsubscribe detaches the whole chain
// ---------------------------------------------------------------------------
test("listenSignalPerSignal unsubscribe stops delivery", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    () => true,
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "P"));
  await flush();
  unsubscribe();
  await emitters.signalEmitter.next(tick("active", "Q"));
  await flush();

  if (JSON.stringify(seen) !== JSON.stringify(["P"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["P"]`);
    return;
  }
  pass("no delivery after unsubscribe");
});

// ---------------------------------------------------------------------------
// 6. Live / backtest emitter isolation
// ---------------------------------------------------------------------------
test("listenSignalLivePerSignal and listenSignalBacktestPerSignal stay on their own emitter", async ({ pass, fail }) => {
  const live = [];
  const backtested = [];
  const unsubscribeLive = listenSignalLivePerSignal(
    () => true,
    (event) => live.push(event.signal.id)
  );
  const unsubscribeBacktest = listenSignalBacktestPerSignal(
    () => true,
    (event) => backtested.push(event.signal.id)
  );

  await emitters.signalLiveEmitter.next(tick("active", "L1"));
  await emitters.signalLiveEmitter.next(tick("active", "L1"));
  await emitters.signalBacktestEmitter.next(tick("active", "B1"));
  // the global emitter must not feed either of the scoped listeners
  await emitters.signalEmitter.next(tick("active", "G1"));
  await flush();
  unsubscribeLive();
  unsubscribeBacktest();

  if (JSON.stringify(live) !== JSON.stringify(["L1"])) {
    fail(`live delivered ${JSON.stringify(live)} expected ["L1"]`);
    return;
  }
  if (JSON.stringify(backtested) !== JSON.stringify(["B1"])) {
    fail(`backtest delivered ${JSON.stringify(backtested)} expected ["B1"]`);
    return;
  }
  pass("live and backtest streams isolated, global emitter did not bleed in");
});

// ---------------------------------------------------------------------------
// 7. Channels keyed on `event.data.id`
//
// Each case emits: match(S1), duplicate(S1), filtered-out(S1), duplicate(S1),
// match(S2) — so one pass covers dedup, the predicate, and the ordering guard.
//
// Only the UNGATED channels are driven with synthetic events. The per-signal forms
// delegate to their plain listener, and the ping / partial / breakeven / notify /
// commit listeners first confirm the position is live via hasPendingSignal, which
// needs a registered strategy and real stored state - see test/e2e for those. A
// synthetic event on a gated channel is correctly dropped, so asserting delivery
// here would only be asserting the fixture.
// ---------------------------------------------------------------------------
test("data.id channels dedup per signal (signalEvent)", async ({ pass, fail }) => {
  const cases = [
    {
      name: "listenSignalEventPerSignal",
      listen: listenSignalEventPerSignal,
      subject: emitters.signalEventSubject,
      match: { action: "opened" },
      skip: { action: "closed" },
      filter: (event) => event.action === "opened",
    },
  ];

  for (const testCase of cases) {
    const seen = [];
    const unsubscribe = testCase.listen(testCase.filter, (event) => seen.push(event.data.id));

    const envelope = {
      strategyName: "r-strategy",
      exchangeName: "r-exchange",
      frameName: "",
      symbol: "BTCUSDT",
      currentPrice: 100,
      backtest: false,
      timestamp: 1700000000000,
    };
    // `data` must look like a real signal row: the framework's own report
    // services subscribe to these subjects too and read data.pnl / prices.
    const emit = (patch, id) =>
      testCase.subject.next({
        ...envelope,
        ...patch,
        data: {
          id,
          strategyName: "r-strategy",
          exchangeName: "r-exchange",
          frameName: "",
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
          pnl: {
            pnlPercentage: 0,
            pnlCost: 0,
            pnlEntries: 0,
            priceOpen: 100,
            priceClose: 100,
          },
          peakProfit: {
            pnlPercentage: 0,
            pnlCost: 0,
            pnlEntries: 0,
            priceOpen: 100,
            priceClose: 100,
          },
          maxDrawdown: {
            pnlPercentage: 0,
            pnlCost: 0,
            pnlEntries: 0,
            priceOpen: 100,
            priceClose: 100,
          },
        },
      });

    await emit(testCase.match, "S1");
    await emit(testCase.match, "S1");
    await emit(testCase.skip, "S1");
    await emit(testCase.match, "S1");
    await emit(testCase.match, "S2");
    await flush();
    unsubscribe();

    if (JSON.stringify(seen) !== JSON.stringify(["S1", "S2"])) {
      fail(`${testCase.name}: delivered ${JSON.stringify(seen)} expected ["S1","S2"]`);
      return;
    }
  }

  pass(`${cases.length} data.id channels dedup correctly and honour the predicate`);
});

// ---------------------------------------------------------------------------
// 8. Gated channels inherit their plain listener's hasPendingSignal check
//
// Because the per-signal forms delegate, the gate the plain listener applies is
// still in force. highestProfit / maxDrawdown / commit / ping / partial /
// breakeven / notify all confirm the position is live first, so a synthetic event
// for a strategy that owns no position must NOT reach the callback. That is the
// contract; end-to-end delivery on these channels is covered in test/e2e where a
// real position exists.
// ---------------------------------------------------------------------------
test("gated per-signal channels drop events with no live position behind them", async ({ pass, fail }) => {
  const delivered = [];
  const unsubscribes = [
    listenHighestProfitPerSignal(() => true, () => delivered.push("highestProfit")),
    listenMaxDrawdownPerSignal(() => true, () => delivered.push("maxDrawdown")),
    listenStrategyCommitPerSignal(() => true, () => delivered.push("commit")),
  ];

  const base = {
    strategyName: "r-gated-strategy",
    exchangeName: "r-gated-exchange",
    frameName: "",
    symbol: "BTCUSDT",
    currentPrice: 100,
    backtest: false,
    timestamp: 1700000000000,
  };

  await emitters.highestProfitSubject.next({ ...base, signal: signalRow("G1") });
  await emitters.maxDrawdownSubject.next({ ...base, signal: signalRow("G1") });
  await emitters.strategyCommitSubject.next({
    ...base,
    action: "trailing-stop",
    signalId: "G1",
    signal: signalRow("G1"),
    percentShift: 1,
    priceOpen: 100,
    priceTakeProfit: 110,
    priceStopLoss: 90,
    originalPriceOpen: 100,
    originalPriceTakeProfit: 110,
    originalPriceStopLoss: 90,
    position: "long",
    scheduledAt: 1700000000000,
    pendingAt: 1700000000000,
    totalEntries: 1,
    totalPartials: 0,
    pnl: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    peakProfit: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    maxDrawdown: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
  });
  await flush(150);
  unsubscribes.forEach((unsubscribe) => unsubscribe());

  if (delivered.length !== 0) {
    fail(`gated channels delivered ${JSON.stringify(delivered)} for a strategy with no position — the plain listener's hasPendingSignal gate was bypassed`);
    return;
  }
  pass("all three gated channels withheld delivery without a live position");
});

// ---------------------------------------------------------------------------
// 9b. The dedup key is the full execution identity, not the bare signal id
//
// These subjects are process-global: several strategies / symbols / modes push
// through them concurrently and their events interleave. With a bare-id key, an
// event from execution B would become the dedup baseline and let execution A's
// next event through as "new" (and vice versa). The composite key
//   strategyName:exchangeName[:frameName]:backtest|live:symbol:signalId
// keeps each execution's stream independent.
// ---------------------------------------------------------------------------
test("dedup key is scoped by execution identity, not just the signal id", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active",
    (event) => seen.push(`${event.strategyName}/${event.symbol}/${event.signal.id}`)
  );

  // SAME signal id "SHARED" under four different execution identities: every one
  // of them is a distinct stream and must be reported.
  await emitters.signalEmitter.next(tick("active", "SHARED", { strategyName: "alpha", symbol: "BTCUSDT" }));
  await emitters.signalEmitter.next(tick("active", "SHARED", { strategyName: "beta", symbol: "BTCUSDT" }));
  await emitters.signalEmitter.next(tick("active", "SHARED", { strategyName: "alpha", symbol: "ETHUSDT" }));
  await emitters.signalEmitter.next(tick("active", "SHARED", { strategyName: "alpha", symbol: "BTCUSDT", backtest: true }));
  await flush();
  unsubscribe();

  const expected = [
    "alpha/BTCUSDT/SHARED",
    "beta/BTCUSDT/SHARED",
    "alpha/ETHUSDT/SHARED",
    "alpha/BTCUSDT/SHARED",
  ];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify(seen)} expected ${JSON.stringify(expected)} — a bare-id dedup key collapses distinct executions`);
    return;
  }
  pass("same signal id under 4 execution identities reported separately");
});

// ---------------------------------------------------------------------------
// 9c. Interleaving two executions must not break either one's dedup
// ---------------------------------------------------------------------------
test("interleaved executions keep independent dedup state", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => event.action === "active",
    (event) => seen.push(`${event.strategyName}:${event.signal.id}`)
  );

  // alpha/S1, beta/S2, alpha/S1 — the middle event belongs to a different
  // execution and must leave alpha's dedup slot untouched.
  await emitters.signalEmitter.next(tick("active", "S1", { strategyName: "alpha" }));
  await emitters.signalEmitter.next(tick("active", "S2", { strategyName: "beta" }));
  await emitters.signalEmitter.next(tick("active", "S1", { strategyName: "alpha" }));
  await flush();
  unsubscribe();

  // alpha:S1 is NOT re-reported: alpha and beta own separate map slots, so
  // beta's event cannot displace alpha's remembered id. A single shared
  // "previous value" (Operator.distinct) would have leaked a third delivery.
  const expected = ["alpha:S1", "beta:S2"];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    fail(`delivered ${JSON.stringify(seen)} expected ${JSON.stringify(expected)} — interleaved executions must not clobber each other's dedup state`);
    return;
  }
  pass("interleaved executions kept independent dedup state");
});

// ---------------------------------------------------------------------------
// 10. Async callbacks are queued, never run concurrently
// ---------------------------------------------------------------------------
test("listenSignalPerSignal serialises async callbacks", async ({ pass, fail }) => {
  const order = [];
  let inFlight = 0;
  let overlapped = false;

  const unsubscribe = listenSignalPerSignal(
    () => true,
    async (event) => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      order.push(`start:${event.signal.id}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end:${event.signal.id}`);
      inFlight -= 1;
    }
  );

  // deliberately not awaited one-by-one: push them back to back
  emitters.signalEmitter.next(tick("active", "A"));
  emitters.signalEmitter.next(tick("active", "B"));
  emitters.signalEmitter.next(tick("active", "C"));
  await flush(300);
  unsubscribe();

  if (overlapped) {
    fail(`callbacks overlapped, queued() not applied: ${order.join(" ")}`);
    return;
  }
  const expected = ["start:A", "end:A", "start:B", "end:B", "start:C", "end:C"];
  if (JSON.stringify(order) !== JSON.stringify(expected)) {
    fail(`order ${JSON.stringify(order)} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("async callbacks ran strictly sequentially");
});
