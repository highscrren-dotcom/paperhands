import { queued, Operator } from "functools-kit";
import backtest from "../lib";
import {
  signalEmitter,
  signalLiveEmitter,
  signalBacktestEmitter,
} from "../config/emitters";
import {
  IStrategyTickResult,
  IStrategyTickResultIdle,
  IStrategyTickResultScheduled,
  IStrategyTickResultWaiting,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
} from "../interfaces/Strategy.interface";

/**
 * ============================================================================
 * ACTION-SCOPED SIGNAL LISTENERS
 * ============================================================================
 *
 * `listenSignal` / `listenSignalLive` / `listenSignalBacktest` deliver the whole
 * {@link IStrategyTickResult} union, which forces every subscriber to re-open the
 * same `if (event.action === "...")` branch before it can touch a variant-specific
 * field. These aliases pre-split each emitter by the `action` discriminator, so the
 * callback receives an already-narrowed member of the union: `pnl` and `closeReason`
 * are simply present on a `listenSignalClosed` event, no guard required.
 *
 * Three families, one per emitter:
 * - `listenSignal<Action>`         — all events (live + backtest)
 * - `listenSignalLive<Action>`     — Live.run() only
 * - `listenSignalBacktest<Action>` — Backtest.run() only
 *
 * Seven actions: Idle, Scheduled, Waiting, Opened, Active, Closed, Cancelled.
 *
 * Each also ships a `...PerSignal` variant taking `(filterFn, fn)`, which fires the
 * callback once per NEW signal id rather than on every emission — the same pipeline
 * used in `function/event.ts`:
 *
 *   emitter
 *     .filter(action match && filterFn)     // 1. condition
 *     .operator(Operator.distinct(id))      // 2. collapse repeats
 *     .connect(queued(fn))                  // 3. sequential delivery
 *
 * The filter MUST precede the distinct: `Operator.distinct` remembers only the
 * previous compare value, so letting unmatched events through first would reset the
 * comparison and leak duplicates. Deduplication is against the previous accepted id,
 * meaning a signal reports again if another signal's matching event interleaved
 * between two of its own.
 *
 * `Idle` has no per-signal variant — `IStrategyTickResultIdle.signal` is `null`, so
 * there is no identity to deduplicate on. Use {@link listenSignalIdle} instead.
 *
 * These are plain stream subscriptions: they do not consult `hasPendingSignal`
 * before delivery. Every function returns an unsubscribe function.
 */

const LISTEN_SIGNAL_IDLE_METHOD_NAME = "alias.listenSignalIdle";
const LISTEN_SIGNAL_SCHEDULED_METHOD_NAME = "alias.listenSignalScheduled";
const LISTEN_SIGNAL_WAITING_METHOD_NAME = "alias.listenSignalWaiting";
const LISTEN_SIGNAL_OPENED_METHOD_NAME = "alias.listenSignalOpened";
const LISTEN_SIGNAL_ACTIVE_METHOD_NAME = "alias.listenSignalActive";
const LISTEN_SIGNAL_CLOSED_METHOD_NAME = "alias.listenSignalClosed";
const LISTEN_SIGNAL_CANCELLED_METHOD_NAME = "alias.listenSignalCancelled";

const LISTEN_SIGNAL_LIVE_IDLE_METHOD_NAME = "alias.listenSignalLiveIdle";
const LISTEN_SIGNAL_LIVE_SCHEDULED_METHOD_NAME = "alias.listenSignalLiveScheduled";
const LISTEN_SIGNAL_LIVE_WAITING_METHOD_NAME = "alias.listenSignalLiveWaiting";
const LISTEN_SIGNAL_LIVE_OPENED_METHOD_NAME = "alias.listenSignalLiveOpened";
const LISTEN_SIGNAL_LIVE_ACTIVE_METHOD_NAME = "alias.listenSignalLiveActive";
const LISTEN_SIGNAL_LIVE_CLOSED_METHOD_NAME = "alias.listenSignalLiveClosed";
const LISTEN_SIGNAL_LIVE_CANCELLED_METHOD_NAME = "alias.listenSignalLiveCancelled";

const LISTEN_SIGNAL_BACKTEST_IDLE_METHOD_NAME = "alias.listenSignalBacktestIdle";
const LISTEN_SIGNAL_BACKTEST_SCHEDULED_METHOD_NAME = "alias.listenSignalBacktestScheduled";
const LISTEN_SIGNAL_BACKTEST_WAITING_METHOD_NAME = "alias.listenSignalBacktestWaiting";
const LISTEN_SIGNAL_BACKTEST_OPENED_METHOD_NAME = "alias.listenSignalBacktestOpened";
const LISTEN_SIGNAL_BACKTEST_ACTIVE_METHOD_NAME = "alias.listenSignalBacktestActive";
const LISTEN_SIGNAL_BACKTEST_CLOSED_METHOD_NAME = "alias.listenSignalBacktestClosed";
const LISTEN_SIGNAL_BACKTEST_CANCELLED_METHOD_NAME = "alias.listenSignalBacktestCancelled";

const LISTEN_SIGNAL_SCHEDULED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalScheduledPerSignal";
const LISTEN_SIGNAL_WAITING_PER_SIGNAL_METHOD_NAME = "alias.listenSignalWaitingPerSignal";
const LISTEN_SIGNAL_OPENED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalOpenedPerSignal";
const LISTEN_SIGNAL_ACTIVE_PER_SIGNAL_METHOD_NAME = "alias.listenSignalActivePerSignal";
const LISTEN_SIGNAL_CLOSED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalClosedPerSignal";
const LISTEN_SIGNAL_CANCELLED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalCancelledPerSignal";

const LISTEN_SIGNAL_LIVE_SCHEDULED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveScheduledPerSignal";
const LISTEN_SIGNAL_LIVE_WAITING_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveWaitingPerSignal";
const LISTEN_SIGNAL_LIVE_OPENED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveOpenedPerSignal";
const LISTEN_SIGNAL_LIVE_ACTIVE_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveActivePerSignal";
const LISTEN_SIGNAL_LIVE_CLOSED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveClosedPerSignal";
const LISTEN_SIGNAL_LIVE_CANCELLED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalLiveCancelledPerSignal";

const LISTEN_SIGNAL_BACKTEST_SCHEDULED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestScheduledPerSignal";
const LISTEN_SIGNAL_BACKTEST_WAITING_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestWaitingPerSignal";
const LISTEN_SIGNAL_BACKTEST_OPENED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestOpenedPerSignal";
const LISTEN_SIGNAL_BACKTEST_ACTIVE_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestActivePerSignal";
const LISTEN_SIGNAL_BACKTEST_CLOSED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestClosedPerSignal";
const LISTEN_SIGNAL_BACKTEST_CANCELLED_PER_SIGNAL_METHOD_NAME = "alias.listenSignalBacktestCancelledPerSignal";

/**
 * Subscribes to idle tick results (live + backtest).
 *
 * Fires on every tick where the strategy holds no signal at all. `event.signal` is
 * always `null` here — there is no position to inspect, only `currentPrice` and the
 * strategy/exchange/frame identity.
 *
 * @param fn - Callback receiving idle events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalIdle } from "backtest-kit";
 *
 * const unsubscribe = listenSignalIdle((event) => {
 *   console.log(`${event.symbol} idle at ${event.currentPrice}`);
 * });
 * ```
 */
export function listenSignalIdle(fn: (event: IStrategyTickResultIdle) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_IDLE_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "idle")
    .connect(queued(async (event) => fn(event as IStrategyTickResultIdle)));
}

/**
 * Subscribes to scheduled tick results (live + backtest).
 *
 * Fires once when a scheduled signal is created — a resting entry waiting for price
 * to reach `signal.priceOpen`. Subsequent monitoring ticks arrive as "waiting".
 *
 * @param fn - Callback receiving scheduled events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalScheduled(fn: (event: IStrategyTickResultScheduled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_SCHEDULED_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "scheduled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results (live + backtest).
 *
 * Fires on every tick while a scheduled signal has not yet activated. High volume:
 * one event per tick per waiting signal — see {@link listenSignalWaitingPerSignal}
 * to collapse it to one callback per signal.
 *
 * @param fn - Callback receiving waiting events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalWaiting(fn: (event: IStrategyTickResultWaiting) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_WAITING_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "waiting")
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results (live + backtest).
 *
 * Fires when a position is opened — either directly or by activation of a scheduled
 * signal.
 *
 * @param fn - Callback receiving opened events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalOpened } from "backtest-kit";
 *
 * listenSignalOpened((event) => {
 *   // no action guard needed: signal is always present
 *   console.log("Opened", event.signal.id, "at", event.signal.priceOpen);
 * });
 * ```
 */
export function listenSignalOpened(fn: (event: IStrategyTickResultOpened) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_OPENED_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "opened")
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results (live + backtest).
 *
 * Fires on every tick while a position is open, carrying live `pnl`, `percentTp` and
 * `percentSl`. High volume — see {@link listenSignalActivePerSignal}.
 *
 * @param fn - Callback receiving active events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalActive(fn: (event: IStrategyTickResultActive) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_ACTIVE_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "active")
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results (live + backtest).
 *
 * Fires when a position closes. `pnl`, `closeReason` and `closeTimestamp` are
 * guaranteed present on the narrowed type.
 *
 * @param fn - Callback receiving closed events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalClosed } from "backtest-kit";
 *
 * listenSignalClosed((event) => {
 *   console.log(`${event.closeReason}: ${event.pnl.pnlPercentage}%`);
 * });
 * ```
 */
export function listenSignalClosed(fn: (event: IStrategyTickResultClosed) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_CLOSED_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "closed")
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results (live + backtest).
 *
 * Fires when a scheduled signal is dropped before ever opening a position.
 * `reason` carries the cancellation cause.
 *
 * @param fn - Callback receiving cancelled events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalCancelled(fn: (event: IStrategyTickResultCancelled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_CANCELLED_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "cancelled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to live idle tick results. Only Live.run() execution.
 * See {@link listenSignalIdle}.
 */
export function listenSignalLiveIdle(fn: (event: IStrategyTickResultIdle) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_IDLE_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "idle")
    .connect(queued(async (event) => fn(event as IStrategyTickResultIdle)));
}

/**
 * Subscribes to live scheduled tick results. Only Live.run() execution.
 * See {@link listenSignalScheduled}.
 */
export function listenSignalLiveScheduled(fn: (event: IStrategyTickResultScheduled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_SCHEDULED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "scheduled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to live waiting tick results. Only Live.run() execution.
 * See {@link listenSignalWaiting}.
 */
export function listenSignalLiveWaiting(fn: (event: IStrategyTickResultWaiting) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_WAITING_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "waiting")
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to live opened tick results. Only Live.run() execution.
 * See {@link listenSignalOpened}.
 */
export function listenSignalLiveOpened(fn: (event: IStrategyTickResultOpened) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_OPENED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "opened")
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to live active tick results. Only Live.run() execution.
 * See {@link listenSignalActive}.
 */
export function listenSignalLiveActive(fn: (event: IStrategyTickResultActive) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_ACTIVE_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "active")
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to live closed tick results. Only Live.run() execution.
 * See {@link listenSignalClosed}.
 */
export function listenSignalLiveClosed(fn: (event: IStrategyTickResultClosed) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CLOSED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "closed")
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to live cancelled tick results. Only Live.run() execution.
 * See {@link listenSignalCancelled}.
 */
export function listenSignalLiveCancelled(fn: (event: IStrategyTickResultCancelled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CANCELLED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "cancelled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to backtest idle tick results. Only Backtest.run() execution.
 * See {@link listenSignalIdle}.
 */
export function listenSignalBacktestIdle(fn: (event: IStrategyTickResultIdle) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_IDLE_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "idle")
    .connect(queued(async (event) => fn(event as IStrategyTickResultIdle)));
}

/**
 * Subscribes to backtest scheduled tick results. Only Backtest.run() execution.
 * See {@link listenSignalScheduled}.
 */
export function listenSignalBacktestScheduled(fn: (event: IStrategyTickResultScheduled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_SCHEDULED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "scheduled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to backtest waiting tick results. Only Backtest.run() execution.
 * See {@link listenSignalWaiting}.
 */
export function listenSignalBacktestWaiting(fn: (event: IStrategyTickResultWaiting) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_WAITING_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "waiting")
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to backtest opened tick results. Only Backtest.run() execution.
 * See {@link listenSignalOpened}.
 */
export function listenSignalBacktestOpened(fn: (event: IStrategyTickResultOpened) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_OPENED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "opened")
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to backtest active tick results. Only Backtest.run() execution.
 * See {@link listenSignalActive}.
 */
export function listenSignalBacktestActive(fn: (event: IStrategyTickResultActive) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_ACTIVE_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "active")
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to backtest closed tick results. Only Backtest.run() execution.
 * See {@link listenSignalClosed}.
 */
export function listenSignalBacktestClosed(fn: (event: IStrategyTickResultClosed) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CLOSED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "closed")
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to backtest cancelled tick results. Only Backtest.run() execution.
 * See {@link listenSignalCancelled}.
 */
export function listenSignalBacktestCancelled(fn: (event: IStrategyTickResultCancelled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CANCELLED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "cancelled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to scheduled tick results, once per new signal id (live + backtest).
 *
 * @param filterFn - Predicate selecting which scheduled events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalScheduledPerSignal(
  filterFn: (event: IStrategyTickResultScheduled) => boolean,
  fn: (event: IStrategyTickResultScheduled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_SCHEDULED_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results, once per new signal id (live + backtest).
 *
 * The canonical use: "waiting" repeats every tick, so this reports the first tick a
 * resting entry satisfies the predicate and then stays quiet for that signal.
 *
 * @param filterFn - Predicate selecting which waiting events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalWaitingPerSignal(
  filterFn: (event: IStrategyTickResultWaiting) => boolean,
  fn: (event: IStrategyTickResultWaiting) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_WAITING_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results, once per new signal id (live + backtest).
 *
 * @param filterFn - Predicate selecting which opened events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalOpenedPerSignal(
  filterFn: (event: IStrategyTickResultOpened) => boolean,
  fn: (event: IStrategyTickResultOpened) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_OPENED_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results, once per new signal id (live + backtest).
 *
 * Active ticks repeat for the whole life of a position, so this fires the first tick
 * the position meets the condition and then goes silent for it.
 *
 * @param filterFn - Predicate selecting which active events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalActivePerSignal } from "backtest-kit";
 *
 * // Alert once per position when it first crosses 5% unrealized profit
 * listenSignalActivePerSignal(
 *   (event) => event.pnl.pnlPercentage > 5,
 *   (event) => console.log("Up 5%:", event.signal.id)
 * );
 * ```
 */
export function listenSignalActivePerSignal(
  filterFn: (event: IStrategyTickResultActive) => boolean,
  fn: (event: IStrategyTickResultActive) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_ACTIVE_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results, once per new signal id (live + backtest).
 *
 * @param filterFn - Predicate selecting which closed events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalClosedPerSignal(
  filterFn: (event: IStrategyTickResultClosed) => boolean,
  fn: (event: IStrategyTickResultClosed) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_CLOSED_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results, once per new signal id (live + backtest).
 *
 * @param filterFn - Predicate selecting which cancelled events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalCancelledPerSignal(
  filterFn: (event: IStrategyTickResultCancelled) => boolean,
  fn: (event: IStrategyTickResultCancelled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_CANCELLED_PER_SIGNAL_METHOD_NAME);
  return signalEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to live scheduled tick results, once per new signal id.
 * See {@link listenSignalScheduledPerSignal}.
 */
export function listenSignalLiveScheduledPerSignal(
  filterFn: (event: IStrategyTickResultScheduled) => boolean,
  fn: (event: IStrategyTickResultScheduled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_SCHEDULED_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to live waiting tick results, once per new signal id.
 * See {@link listenSignalWaitingPerSignal}.
 */
export function listenSignalLiveWaitingPerSignal(
  filterFn: (event: IStrategyTickResultWaiting) => boolean,
  fn: (event: IStrategyTickResultWaiting) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_WAITING_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to live opened tick results, once per new signal id.
 * See {@link listenSignalOpenedPerSignal}.
 */
export function listenSignalLiveOpenedPerSignal(
  filterFn: (event: IStrategyTickResultOpened) => boolean,
  fn: (event: IStrategyTickResultOpened) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_OPENED_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to live active tick results, once per new signal id.
 * See {@link listenSignalActivePerSignal}.
 */
export function listenSignalLiveActivePerSignal(
  filterFn: (event: IStrategyTickResultActive) => boolean,
  fn: (event: IStrategyTickResultActive) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_ACTIVE_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to live closed tick results, once per new signal id.
 * See {@link listenSignalClosedPerSignal}.
 */
export function listenSignalLiveClosedPerSignal(
  filterFn: (event: IStrategyTickResultClosed) => boolean,
  fn: (event: IStrategyTickResultClosed) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CLOSED_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to live cancelled tick results, once per new signal id.
 * See {@link listenSignalCancelledPerSignal}.
 */
export function listenSignalLiveCancelledPerSignal(
  filterFn: (event: IStrategyTickResultCancelled) => boolean,
  fn: (event: IStrategyTickResultCancelled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CANCELLED_PER_SIGNAL_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to backtest scheduled tick results, once per new signal id.
 * See {@link listenSignalScheduledPerSignal}.
 */
export function listenSignalBacktestScheduledPerSignal(
  filterFn: (event: IStrategyTickResultScheduled) => boolean,
  fn: (event: IStrategyTickResultScheduled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_SCHEDULED_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to backtest waiting tick results, once per new signal id.
 * See {@link listenSignalWaitingPerSignal}.
 */
export function listenSignalBacktestWaitingPerSignal(
  filterFn: (event: IStrategyTickResultWaiting) => boolean,
  fn: (event: IStrategyTickResultWaiting) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_WAITING_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to backtest opened tick results, once per new signal id.
 * See {@link listenSignalOpenedPerSignal}.
 */
export function listenSignalBacktestOpenedPerSignal(
  filterFn: (event: IStrategyTickResultOpened) => boolean,
  fn: (event: IStrategyTickResultOpened) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_OPENED_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to backtest active tick results, once per new signal id.
 * See {@link listenSignalActivePerSignal}.
 */
export function listenSignalBacktestActivePerSignal(
  filterFn: (event: IStrategyTickResultActive) => boolean,
  fn: (event: IStrategyTickResultActive) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_ACTIVE_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to backtest closed tick results, once per new signal id.
 * See {@link listenSignalClosedPerSignal}.
 */
export function listenSignalBacktestClosedPerSignal(
  filterFn: (event: IStrategyTickResultClosed) => boolean,
  fn: (event: IStrategyTickResultClosed) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CLOSED_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to backtest cancelled tick results, once per new signal id.
 * See {@link listenSignalCancelledPerSignal}.
 */
export function listenSignalBacktestCancelledPerSignal(
  filterFn: (event: IStrategyTickResultCancelled) => boolean,
  fn: (event: IStrategyTickResultCancelled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CANCELLED_PER_SIGNAL_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .operator(Operator.distinct((event: IStrategyTickResult) => event.signal?.id))
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}
