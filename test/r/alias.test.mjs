import { test } from "worker-testbed";

import {
  listenSignalIdle,
  listenSignalScheduled,
  listenSignalWaiting,
  listenSignalOpened,
  listenSignalActive,
  listenSignalClosed,
  listenSignalCancelled,
  listenSignalLiveIdle,
  listenSignalLiveScheduled,
  listenSignalLiveWaiting,
  listenSignalLiveOpened,
  listenSignalLiveActive,
  listenSignalLiveClosed,
  listenSignalLiveCancelled,
  listenSignalBacktestIdle,
  listenSignalBacktestScheduled,
  listenSignalBacktestWaiting,
  listenSignalBacktestOpened,
  listenSignalBacktestActive,
  listenSignalBacktestClosed,
  listenSignalBacktestCancelled,
  listenSignalScheduledPerSignal,
  listenSignalWaitingPerSignal,
  listenSignalOpenedPerSignal,
  listenSignalActivePerSignal,
  listenSignalClosedPerSignal,
  listenSignalCancelledPerSignal,
  listenSignalLiveActivePerSignal,
  listenSignalLiveClosedPerSignal,
  listenSignalBacktestActivePerSignal,
  listenSignalBacktestClosedPerSignal,
  emitters,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// src/function/alias.ts splits each signal emitter by the `action` discriminator
// so subscribers get an already-narrowed tick result instead of the whole union.
//
// What matters behaviourally (types are checked by tsc, not here):
//   - each alias receives ONLY its own action,
//   - the three emitter families never bleed into each other,
//   - the PerSignal forms dedup on signal.id after the predicate.
//
// The subjects are driven directly: this is stream wiring, independent of any
// running strategy, so feeding them keeps the assertions deterministic.
// ---------------------------------------------------------------------------

const flush = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// worker-testbed runs the tests in this file against ONE shared set of emitters,
// and a listener stays attached for as long as its test is in flight. Another
// test's events therefore pass through this test's predicate. Every emitted
// event carries a full tick shape (and every predicate is written defensively)
// so no listener can throw on a neighbouring test's payload.
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

// One event of every action, pushed through an emitter in a fixed order.
const emitAllActions = async (emitter) => {
  await emitter.next(tick("idle", null));
  await emitter.next(tick("scheduled", "S"));
  await emitter.next(tick("waiting", "S"));
  await emitter.next(tick("opened", "S"));
  await emitter.next(tick("active", "S"));
  await emitter.next(tick("closed", "S", { closeReason: "take_profit", closeTimestamp: 1700000000000 }));
  await emitter.next(tick("cancelled", "S", { reason: "timeout", closeTimestamp: 1700000000000 }));
};

// ---------------------------------------------------------------------------
// 1. Every alias on the global emitter receives exactly its own action
// ---------------------------------------------------------------------------
test("global action aliases each receive only their own action", async ({ pass, fail }) => {
  const received = {
    idle: [], scheduled: [], waiting: [], opened: [],
    active: [], closed: [], cancelled: [],
  };

  const unsubscribes = [
    listenSignalIdle((event) => received.idle.push(event.action)),
    listenSignalScheduled((event) => received.scheduled.push(event.action)),
    listenSignalWaiting((event) => received.waiting.push(event.action)),
    listenSignalOpened((event) => received.opened.push(event.action)),
    listenSignalActive((event) => received.active.push(event.action)),
    listenSignalClosed((event) => received.closed.push(event.action)),
    listenSignalCancelled((event) => received.cancelled.push(event.action)),
  ];

  await emitAllActions(emitters.signalEmitter);
  await flush();
  unsubscribes.forEach((unsubscribe) => unsubscribe());

  for (const action of Object.keys(received)) {
    if (JSON.stringify(received[action]) !== JSON.stringify([action])) {
      fail(`listenSignal${action}: received ${JSON.stringify(received[action])} expected ["${action}"]`);
      return;
    }
  }
  pass("all 7 global aliases routed exactly one matching event each");
});

// ---------------------------------------------------------------------------
// 2. Narrowed variant fields arrive intact (no guard needed at the call site)
// ---------------------------------------------------------------------------
test("closed and cancelled aliases deliver their variant-specific fields", async ({ pass, fail }) => {
  let closeReason = null;
  let cancelReason = null;

  const unsubscribeClosed = listenSignalClosed((event) => {
    closeReason = event.closeReason;
  });
  const unsubscribeCancelled = listenSignalCancelled((event) => {
    cancelReason = event.reason;
  });

  await emitters.signalEmitter.next(
    tick("closed", "S", { closeReason: "stop_loss", pnl: { pnlPercentage: -2 } })
  );
  await emitters.signalEmitter.next(tick("cancelled", "S", { reason: "price_reject" }));
  await flush();
  unsubscribeClosed();
  unsubscribeCancelled();

  if (closeReason !== "stop_loss") {
    fail(`closeReason: got ${closeReason} expected "stop_loss"`);
    return;
  }
  if (cancelReason !== "price_reject") {
    fail(`cancel reason: got ${cancelReason} expected "price_reject"`);
    return;
  }
  pass("closeReason and reason delivered on the narrowed events");
});

// ---------------------------------------------------------------------------
// 3. Idle carries signal: null and must still be delivered
//
// listenSignalIdle is the one alias whose event has no signal, which is exactly
// why it has no PerSignal counterpart.
// ---------------------------------------------------------------------------
test("listenSignalIdle delivers events whose signal is null", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalIdle((event) => seen.push(event.signal));

  await emitters.signalEmitter.next(tick("idle", null));
  await emitters.signalEmitter.next(tick("active", "A"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify([null])) {
    fail(`delivered ${JSON.stringify(seen)} expected [null]`);
    return;
  }
  pass("idle delivered once with a null signal, active did not leak in");
});

// ---------------------------------------------------------------------------
// 4. Live aliases only see the live emitter
// ---------------------------------------------------------------------------
test("live action aliases receive only live emitter events", async ({ pass, fail }) => {
  const received = {
    idle: [], scheduled: [], waiting: [], opened: [],
    active: [], closed: [], cancelled: [],
  };

  const unsubscribes = [
    listenSignalLiveIdle((event) => received.idle.push(event.action)),
    listenSignalLiveScheduled((event) => received.scheduled.push(event.action)),
    listenSignalLiveWaiting((event) => received.waiting.push(event.action)),
    listenSignalLiveOpened((event) => received.opened.push(event.action)),
    listenSignalLiveActive((event) => received.active.push(event.action)),
    listenSignalLiveClosed((event) => received.closed.push(event.action)),
    listenSignalLiveCancelled((event) => received.cancelled.push(event.action)),
  ];

  await emitAllActions(emitters.signalLiveEmitter);
  // neither the global nor the backtest emitter may reach a live alias
  await emitAllActions(emitters.signalEmitter);
  await emitAllActions(emitters.signalBacktestEmitter);
  await flush();
  unsubscribes.forEach((unsubscribe) => unsubscribe());

  for (const action of Object.keys(received)) {
    if (JSON.stringify(received[action]) !== JSON.stringify([action])) {
      fail(`listenSignalLive${action}: received ${JSON.stringify(received[action])} expected ["${action}"] — cross-emitter bleed`);
      return;
    }
  }
  pass("all 7 live aliases isolated from the global and backtest emitters");
});

// ---------------------------------------------------------------------------
// 5. Backtest aliases only see the backtest emitter
// ---------------------------------------------------------------------------
test("backtest action aliases receive only backtest emitter events", async ({ pass, fail }) => {
  const received = {
    idle: [], scheduled: [], waiting: [], opened: [],
    active: [], closed: [], cancelled: [],
  };

  const unsubscribes = [
    listenSignalBacktestIdle((event) => received.idle.push(event.action)),
    listenSignalBacktestScheduled((event) => received.scheduled.push(event.action)),
    listenSignalBacktestWaiting((event) => received.waiting.push(event.action)),
    listenSignalBacktestOpened((event) => received.opened.push(event.action)),
    listenSignalBacktestActive((event) => received.active.push(event.action)),
    listenSignalBacktestClosed((event) => received.closed.push(event.action)),
    listenSignalBacktestCancelled((event) => received.cancelled.push(event.action)),
  ];

  await emitAllActions(emitters.signalBacktestEmitter);
  await emitAllActions(emitters.signalEmitter);
  await emitAllActions(emitters.signalLiveEmitter);
  await flush();
  unsubscribes.forEach((unsubscribe) => unsubscribe());

  for (const action of Object.keys(received)) {
    if (JSON.stringify(received[action]) !== JSON.stringify([action])) {
      fail(`listenSignalBacktest${action}: received ${JSON.stringify(received[action])} expected ["${action}"] — cross-emitter bleed`);
      return;
    }
  }
  pass("all 7 backtest aliases isolated from the global and live emitters");
});

// ---------------------------------------------------------------------------
// 6. PerSignal aliases dedup within their action
// ---------------------------------------------------------------------------
test("global PerSignal aliases fire once per new signal id", async ({ pass, fail }) => {
  const cases = [
    { name: "Scheduled", listen: listenSignalScheduledPerSignal, action: "scheduled" },
    { name: "Waiting", listen: listenSignalWaitingPerSignal, action: "waiting" },
    { name: "Opened", listen: listenSignalOpenedPerSignal, action: "opened" },
    { name: "Active", listen: listenSignalActivePerSignal, action: "active" },
    { name: "Closed", listen: listenSignalClosedPerSignal, action: "closed" },
    { name: "Cancelled", listen: listenSignalCancelledPerSignal, action: "cancelled" },
  ];

  for (const testCase of cases) {
    const seen = [];
    const unsubscribe = testCase.listen(() => true, (event) => seen.push(event.signal.id));

    await emitters.signalEmitter.next(tick(testCase.action, "A"));
    await emitters.signalEmitter.next(tick(testCase.action, "A"));
    // a different action must not advance this listener's dedup state
    await emitters.signalEmitter.next(tick("idle", null));
    await emitters.signalEmitter.next(tick(testCase.action, "A"));
    await emitters.signalEmitter.next(tick(testCase.action, "B"));
    await flush();
    unsubscribe();

    if (JSON.stringify(seen) !== JSON.stringify(["A", "B"])) {
      fail(`listenSignal${testCase.name}PerSignal: delivered ${JSON.stringify(seen)} expected ["A","B"]`);
      return;
    }
  }

  pass(`${cases.length} PerSignal aliases dedup within their own action`);
});

// ---------------------------------------------------------------------------
// 7. PerSignal aliases honour the predicate before deduplicating
// ---------------------------------------------------------------------------
test("PerSignal aliases apply the predicate before the distinct operator", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalActivePerSignal(
    (event) => event.pnl?.pnlPercentage > 5,
    (event) => seen.push(event.signal.id)
  );

  // below threshold: filtered out, must not become the dedup baseline
  await emitters.signalEmitter.next(tick("active", "A", { pnl: { pnlPercentage: 1 } }));
  await emitters.signalEmitter.next(tick("active", "A", { pnl: { pnlPercentage: 9 } }));
  await emitters.signalEmitter.next(tick("active", "A", { pnl: { pnlPercentage: 2 } }));
  // still A, still filtered-then-matching: must NOT be re-reported
  await emitters.signalEmitter.next(tick("active", "A", { pnl: { pnlPercentage: 12 } }));
  await emitters.signalEmitter.next(tick("active", "B", { pnl: { pnlPercentage: 7 } }));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["A", "B"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["A","B"] — filter/distinct ordering regression`);
    return;
  }
  pass("only the first qualifying tick per signal delivered");
});

// ---------------------------------------------------------------------------
// 8. Scoped PerSignal aliases keep their emitter isolation
// ---------------------------------------------------------------------------
test("live and backtest PerSignal aliases stay on their own emitter", async ({ pass, fail }) => {
  const liveActive = [];
  const liveClosed = [];
  const backtestActive = [];
  const backtestClosed = [];

  const unsubscribes = [
    listenSignalLiveActivePerSignal(() => true, (event) => liveActive.push(event.signal.id)),
    listenSignalLiveClosedPerSignal(() => true, (event) => liveClosed.push(event.signal.id)),
    listenSignalBacktestActivePerSignal(() => true, (event) => backtestActive.push(event.signal.id)),
    listenSignalBacktestClosedPerSignal(() => true, (event) => backtestClosed.push(event.signal.id)),
  ];

  await emitters.signalLiveEmitter.next(tick("active", "L1"));
  await emitters.signalLiveEmitter.next(tick("active", "L1"));
  await emitters.signalLiveEmitter.next(tick("closed", "L1"));
  await emitters.signalBacktestEmitter.next(tick("active", "B1"));
  await emitters.signalBacktestEmitter.next(tick("closed", "B1"));
  await emitters.signalBacktestEmitter.next(tick("closed", "B1"));
  await emitters.signalEmitter.next(tick("active", "G1"));
  await emitters.signalEmitter.next(tick("closed", "G1"));
  await flush();
  unsubscribes.forEach((unsubscribe) => unsubscribe());

  const checks = [
    ["liveActive", liveActive, ["L1"]],
    ["liveClosed", liveClosed, ["L1"]],
    ["backtestActive", backtestActive, ["B1"]],
    ["backtestClosed", backtestClosed, ["B1"]],
  ];
  for (const [name, got, want] of checks) {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`${name}: delivered ${JSON.stringify(got)} expected ${JSON.stringify(want)}`);
      return;
    }
  }
  pass("scoped PerSignal aliases deduped and stayed isolated from the global emitter");
});

// ---------------------------------------------------------------------------
// 9. Unsubscribe works for both alias shapes
// ---------------------------------------------------------------------------
test("alias unsubscribe stops delivery for plain and PerSignal forms", async ({ pass, fail }) => {
  const plain = [];
  const perSignal = [];

  const unsubscribePlain = listenSignalActive((event) => plain.push(event.signal.id));
  const unsubscribePerSignal = listenSignalActivePerSignal(
    () => true,
    (event) => perSignal.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "P"));
  await flush();
  unsubscribePlain();
  unsubscribePerSignal();
  await emitters.signalEmitter.next(tick("active", "Q"));
  await flush();

  if (JSON.stringify(plain) !== JSON.stringify(["P"])) {
    fail(`plain delivered ${JSON.stringify(plain)} expected ["P"]`);
    return;
  }
  if (JSON.stringify(perSignal) !== JSON.stringify(["P"])) {
    fail(`perSignal delivered ${JSON.stringify(perSignal)} expected ["P"]`);
    return;
  }
  pass("both alias shapes stopped delivering after unsubscribe");
});
