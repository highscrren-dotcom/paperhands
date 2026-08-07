import { test } from "worker-testbed";

import {
  listenSignalPerSignal,
  listenSignalLivePerSignal,
  listenSignalBacktestPerSignal,
  listenSignalEventPerSignal,
  listenScheduleEventPerSignal,
  listenActivePingPerSignal,
  listenSchedulePingPerSignal,
  listenPartialProfitAvailablePerSignal,
  listenPartialLossAvailablePerSignal,
  listenBreakevenAvailablePerSignal,
  listenHighestProfitPerSignal,
  listenMaxDrawdownPerSignal,
  listenSignalNotifyPerSignal,
  listenStrategyCommitPerSignal,
  emitters,
} from "../../build/index.mjs";

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
  frameName: "r-frame",
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
// 3. Documented caveat: dedup is against the PREVIOUS accepted id only
// ---------------------------------------------------------------------------
test("listenSignalPerSignal re-reports a signal when another matching signal interleaves", async ({ pass, fail }) => {
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
    fail(`delivered ${JSON.stringify(seen)} expected ["A","B","A"] — distinct is not a full seen-set and must not behave like one`);
    return;
  }
  pass("A re-reported after B interleaved, matching the documented semantics");
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
// ---------------------------------------------------------------------------
test("data.id channels dedup per signal (signalEvent, scheduleEvent, pings, partials, breakeven, notify)", async ({ pass, fail }) => {
  const cases = [
    {
      name: "listenSignalEventPerSignal",
      listen: listenSignalEventPerSignal,
      subject: emitters.signalEventSubject,
      match: { action: "opened" },
      skip: { action: "closed" },
      filter: (event) => event.action === "opened",
    },
    {
      name: "listenScheduleEventPerSignal",
      listen: listenScheduleEventPerSignal,
      subject: emitters.scheduleEventSubject,
      match: { action: "scheduled" },
      skip: { action: "cancelled" },
      filter: (event) => event.action === "scheduled",
    },
    {
      name: "listenActivePingPerSignal",
      listen: listenActivePingPerSignal,
      subject: emitters.activePingSubject,
      match: { backtest: true },
      skip: { backtest: false },
      filter: (event) => event.backtest === true,
    },
    {
      name: "listenSchedulePingPerSignal",
      listen: listenSchedulePingPerSignal,
      subject: emitters.schedulePingSubject,
      match: { backtest: true },
      skip: { backtest: false },
      filter: (event) => event.backtest === true,
    },
    {
      name: "listenPartialProfitAvailablePerSignal",
      listen: listenPartialProfitAvailablePerSignal,
      subject: emitters.partialProfitSubject,
      match: { level: 10 },
      skip: { level: 20 },
      filter: (event) => event.level === 10,
    },
    {
      name: "listenPartialLossAvailablePerSignal",
      listen: listenPartialLossAvailablePerSignal,
      subject: emitters.partialLossSubject,
      match: { level: 10 },
      skip: { level: 20 },
      filter: (event) => event.level === 10,
    },
    {
      name: "listenBreakevenAvailablePerSignal",
      listen: listenBreakevenAvailablePerSignal,
      subject: emitters.breakevenSubject,
      match: { backtest: true },
      skip: { backtest: false },
      filter: (event) => event.backtest === true,
    },
    {
      name: "listenSignalNotifyPerSignal",
      listen: listenSignalNotifyPerSignal,
      subject: emitters.signalNotifySubject,
      match: { note: "keep" },
      skip: { note: "drop" },
      filter: (event) => event.note === "keep",
    },
  ];

  for (const testCase of cases) {
    const seen = [];
    const unsubscribe = testCase.listen(testCase.filter, (event) => seen.push(event.data.id));

    const envelope = {
      strategyName: "r-strategy",
      exchangeName: "r-exchange",
      frameName: "r-frame",
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
// 8. Channels keyed on `event.signal.id`
// ---------------------------------------------------------------------------
test("signal.id channels dedup per signal (highestProfit, maxDrawdown)", async ({ pass, fail }) => {
  const cases = [
    {
      name: "listenHighestProfitPerSignal",
      listen: listenHighestProfitPerSignal,
      subject: emitters.highestProfitSubject,
    },
    {
      name: "listenMaxDrawdownPerSignal",
      listen: listenMaxDrawdownPerSignal,
      subject: emitters.maxDrawdownSubject,
    },
  ];

  for (const testCase of cases) {
    const seen = [];
    const unsubscribe = testCase.listen(
      (event) => event.backtest === true,
      (event) => seen.push(event.signal.id)
    );

    const base = {
      strategyName: "r-strategy",
      exchangeName: "r-exchange",
      frameName: "r-frame",
      symbol: "BTCUSDT",
      currentPrice: 100,
      timestamp: 1700000000000,
    };
    await testCase.subject.next({ ...base, backtest: true, signal: signalRow("H1") });
    await testCase.subject.next({ ...base, backtest: true, signal: signalRow("H1") });
    await testCase.subject.next({ ...base, backtest: false, signal: signalRow("H1") });
    await testCase.subject.next({ ...base, backtest: true, signal: signalRow("H1") });
    await testCase.subject.next({ ...base, backtest: true, signal: signalRow("H2") });
    await flush();
    unsubscribe();

    if (JSON.stringify(seen) !== JSON.stringify(["H1", "H2"])) {
      fail(`${testCase.name}: delivered ${JSON.stringify(seen)} expected ["H1","H2"]`);
      return;
    }
  }

  pass("highestProfit and maxDrawdown dedup on signal.id");
});

// ---------------------------------------------------------------------------
// 9. The one remaining channel keyed on `event.signalId`
//
// Trailing/partial commits repeat many times per position, so the dedup here is
// what turns a stream of commits into a single per-signal notification.
// ---------------------------------------------------------------------------
test("listenStrategyCommitPerSignal dedups on signalId and honours the predicate", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenStrategyCommitPerSignal(
    (event) => event.action === "trailing-stop",
    (event) => seen.push(event.signalId)
  );

  const commit = (action, signalId) => ({
    action,
    signalId,
    strategyName: "r-strategy",
    exchangeName: "r-exchange",
    frameName: "r-frame",
    symbol: "BTCUSDT",
    currentPrice: 100,
    backtest: false,
    timestamp: 1700000000000,
    signal: signalRow(signalId),
    position: "long",
    priceOpen: 100,
    priceTakeProfit: 110,
    priceStopLoss: 90,
    originalPriceOpen: 100,
    originalPriceTakeProfit: 110,
    originalPriceStopLoss: 90,
    scheduledAt: 1700000000000,
    pendingAt: 1700000000000,
    percentShift: 1,
    totalEntries: 1,
    totalPartials: 0,
    pnl: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    peakProfit: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
    maxDrawdown: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
  });

  await emitters.strategyCommitSubject.next(commit("trailing-stop", "O1"));
  await emitters.strategyCommitSubject.next(commit("trailing-stop", "O1"));
  // a different commit action for the SAME signal must not reset the dedup state
  await emitters.strategyCommitSubject.next(commit("partial-profit", "O1"));
  await emitters.strategyCommitSubject.next(commit("trailing-stop", "O1"));
  await emitters.strategyCommitSubject.next(commit("trailing-stop", "O2"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["O1", "O2"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["O1","O2"]`);
    return;
  }
  pass("trailing-stop commits collapsed to one callback per signal");
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
