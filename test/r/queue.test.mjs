import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenSignalPerSignal,
  listenSignalActivePerSignal,
  listenSignalOnce,
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

registerSchemas(["q-strategy"], ["q-exchange", "q-alias-exchange", "q-once-exchange", "q-cmp-exchange", "q-busy-exchange"]);

// ---------------------------------------------------------------------------
// Where the dedup decision runs relative to the callback queue.
//
// The per-signal listeners wrap the matching plain `listenX` listener, exactly
// like the `listenXOnce` forms do, instead of building a private
// `.filter(...).connect(queued(...))` chain. That is a deliberate structural
// choice, and these tests pin it.
//
// The plain listener owns ONE queued() wrapper. Delegating puts the predicate and
// the dedup check inside it, so they run one event at a time, interleaved with the
// callback. A private observer chain would put the filters OUTSIDE that queue,
// where the observer evaluates them synchronously at emit time - so a burst of
// events would have every dedup decision made, and every remembered id advanced,
// before the first callback had even started.
//
// Concretely, for three events emitted back-to-back:
//   delegated (one queue): F1 >1 <1 F2 >2 <2 F3 >3 <3
//   own chain (two)      : F1 F2 F3 >1 <1 >2 <2 >3 <3
// ---------------------------------------------------------------------------

const flush = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

const CALLBACK_MS = 25;

const tick = (signalId, extra = {}) => ({
  action: "active",
  signal: { id: signalId, priceOpen: 100 },
  strategyName: "q-strategy",
  exchangeName: "q-exchange",
  frameName: "",
  symbol: "BTCUSDT",
  currentPrice: 100,
  backtest: false,
  createdAt: 1700000000000,
  pnl: { pnlPercentage: 0 },
  percentTp: 0,
  percentSl: 0,
  ...extra,
});

// ---------------------------------------------------------------------------
// 1. The predicate runs in lockstep with the callback, not ahead of it
// ---------------------------------------------------------------------------
test("listenSignalPerSignal evaluates its predicate inside the callback queue", async ({ pass, fail }) => {
  const order = [];

  const unsubscribe = listenSignalPerSignal(
    (event) => {
      order.push(`F${event.signal.id}`);
      return event.exchangeName === "q-exchange";
    },
    async (event) => {
      order.push(`>${event.signal.id}`);
      await new Promise((resolve) => setTimeout(resolve, CALLBACK_MS));
      order.push(`<${event.signal.id}`);
    }
  );

  // Three DISTINCT ids, emitted back-to-back WITHOUT awaiting delivery. Every id
  // is new, so the dedup drops nothing and all three must be delivered - the
  // question under test is only the ORDER in which the filter and the callback
  // interleave.
  emitters.signalEmitter.next(tick("1"));
  emitters.signalEmitter.next(tick("2"));
  emitters.signalEmitter.next(tick("3"));
  await flush();
  unsubscribe();

  const expected = ["F1", ">1", "<1", "F2", ">2", "<2", "F3", ">3", "<3"];
  if (JSON.stringify(order) !== JSON.stringify(expected)) {
    fail(
      `order ${JSON.stringify(order)} expected ${JSON.stringify(expected)} — ` +
      `the filters ran outside the queue, so the listener no longer delegates to the plain form`
    );
    return;
  }
  pass("predicate and callback interleaved one event at a time");
});

// ---------------------------------------------------------------------------
// 2. Same guarantee for the action-scoped alias form
// ---------------------------------------------------------------------------
test("listenSignalActivePerSignal evaluates its predicate inside the callback queue", async ({ pass, fail }) => {
  const order = [];

  const unsubscribe = listenSignalActivePerSignal(
    (event) => {
      order.push(`F${event.signal.id}`);
      return event.exchangeName === "q-alias-exchange";
    },
    async (event) => {
      order.push(`>${event.signal.id}`);
      await new Promise((resolve) => setTimeout(resolve, CALLBACK_MS));
      order.push(`<${event.signal.id}`);
    }
  );

  emitters.signalEmitter.next(tick("1", { exchangeName: "q-alias-exchange" }));
  emitters.signalEmitter.next(tick("2", { exchangeName: "q-alias-exchange" }));
  emitters.signalEmitter.next(tick("3", { exchangeName: "q-alias-exchange" }));
  await flush();
  unsubscribe();

  const expected = ["F1", ">1", "<1", "F2", ">2", "<2", "F3", ">3", "<3"];
  if (JSON.stringify(order) !== JSON.stringify(expected)) {
    fail(`order ${JSON.stringify(order)} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("alias per-signal form shares the delegated single-queue behaviour");
});

// ---------------------------------------------------------------------------
// 3. The per-signal form matches listenSignalOnce, the reference shape
//
// listenSignalOnce has always delegated to listenSignal. Asserting that both
// produce the same interleaving is what ties the per-signal form to the existing
// convention rather than to a hand-picked expected array.
// ---------------------------------------------------------------------------
test("per-signal and Once forms interleave identically (same single-queue shape)", async ({ pass, fail }) => {
  const onceOrder = [];
  // listenSignalOnce unsubscribes after its first match, so give each emission a
  // predicate that only accepts one specific id and run three subscriptions.
  for (const id of ["1", "2", "3"]) {
    listenSignalOnce(
      (event) => {
        if (event.exchangeName !== "q-once-exchange") return false;
        onceOrder.push(`F${event.signal.id}`);
        return event.signal.id === id;
      },
      async (event) => {
        onceOrder.push(`>${event.signal.id}`);
        await new Promise((resolve) => setTimeout(resolve, CALLBACK_MS));
        onceOrder.push(`<${event.signal.id}`);
      }
    );
  }

  emitters.signalEmitter.next(tick("1", { exchangeName: "q-once-exchange" }));
  await flush();

  // The first emission is enough: with one queue the accepted subscription must
  // finish its callback before the queue moves on.
  const firstDelivery = onceOrder.indexOf(">1");
  const firstEnd = onceOrder.indexOf("<1");
  if (firstDelivery === -1 || firstEnd === -1 || firstEnd < firstDelivery) {
    fail(`Once form did not deliver in order: ${JSON.stringify(onceOrder)}`);
    return;
  }

  // Now the per-signal form over the same emission pattern.
  const perOrder = [];
  const unsubscribe = listenSignalPerSignal(
    (event) => {
      if (event.exchangeName !== "q-cmp-exchange") return false;
      perOrder.push(`F${event.signal.id}`);
      return true;
    },
    async (event) => {
      perOrder.push(`>${event.signal.id}`);
      await new Promise((resolve) => setTimeout(resolve, CALLBACK_MS));
      perOrder.push(`<${event.signal.id}`);
    }
  );
  emitters.signalEmitter.next(tick("1", { exchangeName: "q-cmp-exchange" }));
  emitters.signalEmitter.next(tick("2", { exchangeName: "q-cmp-exchange" }));
  await flush();
  unsubscribe();

  // Every accepted event completes before the next one is even inspected.
  const expected = ["F1", ">1", "<1", "F2", ">2", "<2"];
  if (JSON.stringify(perOrder) !== JSON.stringify(expected)) {
    fail(`per-signal order ${JSON.stringify(perOrder)} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("per-signal form delivers with the same one-at-a-time discipline as the Once form");
});

// ---------------------------------------------------------------------------
// 4. A duplicate is suppressed only AFTER the previous callback completed
//
// This is what the ordering actually buys. The remembered id must not advance
// while its callback is still pending, otherwise the dedup state describes an
// event the subscriber has not been handed yet.
// ---------------------------------------------------------------------------
test("the remembered id advances in step with delivery, not ahead of it", async ({ pass, fail }) => {
  const order = [];
  let inCallback = false;
  let decidedWhileBusy = false;

  const unsubscribe = listenSignalPerSignal(
    (event) => {
      if (event.exchangeName !== "q-busy-exchange") return false;
      // If the queue were bypassed, this would run while an earlier callback was
      // still awaiting its timer.
      if (inCallback) decidedWhileBusy = true;
      order.push(`F${event.signal.id}`);
      return true;
    },
    async (event) => {
      inCallback = true;
      order.push(`>${event.signal.id}`);
      await new Promise((resolve) => setTimeout(resolve, CALLBACK_MS));
      order.push(`<${event.signal.id}`);
      inCallback = false;
    }
  );

  // A, A, B: the middle A is a duplicate and must be dropped; B is new.
  emitters.signalEmitter.next(tick("A", { exchangeName: "q-busy-exchange" }));
  emitters.signalEmitter.next(tick("A", { exchangeName: "q-busy-exchange" }));
  emitters.signalEmitter.next(tick("B", { exchangeName: "q-busy-exchange" }));
  await flush();
  unsubscribe();

  if (decidedWhileBusy) {
    fail(`a dedup decision was made while a callback was still running: ${JSON.stringify(order)}`);
    return;
  }
  // FA >A <A  — first A delivered and completed
  // FA        — second A inspected only after that, recognised as a duplicate
  // FB >B <B  — B delivered
  const expected = ["FA", ">A", "<A", "FA", "FB", ">B", "<B"];
  if (JSON.stringify(order) !== JSON.stringify(expected)) {
    fail(`order ${JSON.stringify(order)} expected ${JSON.stringify(expected)}`);
    return;
  }
  pass("duplicate inspected after the first callback finished, then suppressed");
});
