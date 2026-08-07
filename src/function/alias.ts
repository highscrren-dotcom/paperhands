import { queued, LimitedMap } from "functools-kit";
import backtest from "../lib";
import {
  signalEmitter,
  signalLiveEmitter,
  signalBacktestEmitter,
} from "../config/emitters";
import {
  IStrategyTickResultIdle,
  IStrategyTickResultScheduled,
  IStrategyTickResultWaiting,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
} from "../interfaces/Strategy.interface";

/**
 * How many execution identities one `listenXPerSignal` subscription remembers.
 *
 * Each entry maps an execution key to the last signal id delivered for it, so one
 * entry per strategy/exchange/frame/mode/symbol combination being monitored. The
 * bound only matters for a subscription spanning an unusually wide fleet; the
 * oldest entry is evicted first, and an evicted identity simply reports its
 * current signal one more time.
 */
const SEEN_MAP_LIMIT = 200;

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
 * one event per tick per waiting signal. Use the `listenSignalWaitingPerSignal`
 * form to collapse that down to one callback per signal.
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
 * `percentSl`. High volume: one event per tick per open position. Use the
 * `listenSignalActivePerSignal` form to collapse that down to one callback per
 * position.
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
 * Subscribes to idle tick results from live executions only.
 *
 * Fires on every tick where the strategy holds no position and nothing scheduled.
 * `event.signal` is always `null` here, so there is nothing to inspect beyond
 * `currentPrice`, `symbol` and the strategy/exchange/frame identity. Useful for
 * heartbeat logging or for noticing that a strategy has gone quiet.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving idle events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveIdle(fn: (event: IStrategyTickResultIdle) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_IDLE_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "idle")
    .connect(queued(async (event) => fn(event as IStrategyTickResultIdle)));
}

/**
 * Subscribes to scheduled tick results from live executions only.
 *
 * Fires once, at the moment a scheduled signal is created: the strategy asked for
 * an entry at a specific price and the engine is now waiting for the market to
 * reach it. No position exists yet. Every later tick of that same waiting entry
 * arrives as a "waiting" event instead, so this action marks the start of the
 * wait, not the wait itself.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving scheduled events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveScheduled(fn: (event: IStrategyTickResultScheduled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_SCHEDULED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "scheduled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results from live executions only.
 *
 * Fires on every tick while a scheduled signal has not activated yet. `event.signal`
 * describes the resting entry and `pnl` is theoretical - the position is not open,
 * so nothing is at risk. This is a high-volume channel: one event per tick per
 * waiting signal for as long as the entry rests.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving waiting events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveWaiting(fn: (event: IStrategyTickResultWaiting) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_WAITING_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "waiting")
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results from live executions only.
 *
 * Fires when a position actually opens, either because the strategy returned an
 * immediate signal or because a scheduled entry finally activated. `event.signal`
 * carries the stored row with its generated id, entry price and TP/SL levels. This
 * is the point from which the position starts costing money.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving opened events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveOpened(fn: (event: IStrategyTickResultOpened) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_OPENED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "opened")
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results from live executions only.
 *
 * Fires on every tick while a position is open, carrying the live `pnl` plus
 * `percentTp` / `percentSl` - how far price has travelled toward take-profit or
 * stop-loss. This is a high-volume channel: one event per tick per open position,
 * for the whole life of the position.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving active events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveActive(fn: (event: IStrategyTickResultActive) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_ACTIVE_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "active")
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results from live executions only.
 *
 * Fires when a position closes, for any reason. `closeReason` says which
 * ("take_profit", "stop_loss", "time_expired" or "closed" for a user-initiated
 * close), `closeTimestamp` says when, and `pnl` holds the realised result with fees
 * and slippage already applied. Terminal for that signal - no further events for
 * it will arrive on this channel.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving closed events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveClosed(fn: (event: IStrategyTickResultClosed) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CLOSED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "closed")
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results from live executions only.
 *
 * Fires when a scheduled signal is dropped before it ever became a position, so no
 * money was ever at risk. `reason` explains why (the wait timed out, price moved
 * through the entry in the wrong direction, or a user cancelled it) and `cancelId`
 * is set for user-initiated cancellations. Terminal for that signal.
 *
 * Receives events from Live.run() only. Backtest replays never reach this callback,
 * which is what makes it safe for anything with real-world side effects - order
 * placement mirrors, alerting, notifications.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving cancelled events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveCancelled(fn: (event: IStrategyTickResultCancelled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CANCELLED_METHOD_NAME);
  return signalLiveEmitter
    .filter((event) => event.action === "cancelled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to idle tick results from backtest executions only.
 *
 * Fires on every tick where the strategy holds no position and nothing scheduled.
 * `event.signal` is always `null` here, so there is nothing to inspect beyond
 * `currentPrice`, `symbol` and the strategy/exchange/frame identity. Useful for
 * heartbeat logging or for noticing that a strategy has gone quiet.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving idle events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestIdle(fn: (event: IStrategyTickResultIdle) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_IDLE_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "idle")
    .connect(queued(async (event) => fn(event as IStrategyTickResultIdle)));
}

/**
 * Subscribes to scheduled tick results from backtest executions only.
 *
 * Fires once, at the moment a scheduled signal is created: the strategy asked for
 * an entry at a specific price and the engine is now waiting for the market to
 * reach it. No position exists yet. Every later tick of that same waiting entry
 * arrives as a "waiting" event instead, so this action marks the start of the
 * wait, not the wait itself.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving scheduled events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestScheduled(fn: (event: IStrategyTickResultScheduled) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_SCHEDULED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "scheduled")
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results from backtest executions only.
 *
 * Fires on every tick while a scheduled signal has not activated yet. `event.signal`
 * describes the resting entry and `pnl` is theoretical - the position is not open,
 * so nothing is at risk. This is a high-volume channel: one event per tick per
 * waiting signal for as long as the entry rests.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving waiting events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestWaiting(fn: (event: IStrategyTickResultWaiting) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_WAITING_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "waiting")
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results from backtest executions only.
 *
 * Fires when a position actually opens, either because the strategy returned an
 * immediate signal or because a scheduled entry finally activated. `event.signal`
 * carries the stored row with its generated id, entry price and TP/SL levels. This
 * is the point from which the position starts costing money.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving opened events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestOpened(fn: (event: IStrategyTickResultOpened) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_OPENED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "opened")
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results from backtest executions only.
 *
 * Fires on every tick while a position is open, carrying the live `pnl` plus
 * `percentTp` / `percentSl` - how far price has travelled toward take-profit or
 * stop-loss. This is a high-volume channel: one event per tick per open position,
 * for the whole life of the position.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving active events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestActive(fn: (event: IStrategyTickResultActive) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_ACTIVE_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "active")
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results from backtest executions only.
 *
 * Fires when a position closes, for any reason. `closeReason` says which
 * ("take_profit", "stop_loss", "time_expired" or "closed" for a user-initiated
 * close), `closeTimestamp` says when, and `pnl` holds the realised result with fees
 * and slippage already applied. Terminal for that signal - no further events for
 * it will arrive on this channel.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving closed events
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestClosed(fn: (event: IStrategyTickResultClosed) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CLOSED_METHOD_NAME);
  return signalBacktestEmitter
    .filter((event) => event.action === "closed")
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results from backtest executions only.
 *
 * Fires when a scheduled signal is dropped before it ever became a position, so no
 * money was ever at risk. `reason` explains why (the wait timed out, price moved
 * through the entry in the wrong direction, or a user cancelled it) and `cancelId`
 * is set for user-initiated cancellations. Terminal for that signal.
 *
 * Receives events from Backtest.run() only. Live trading never reaches this
 * callback, so it is the right channel for replay analysis and reporting that must
 * not be polluted by production traffic.
 *
 * Because the emitter is already split by action, the callback receives the
 * narrowed variant directly - no `if (event.action === ...)` guard is needed
 * before reading the fields described above.
 *
 * @param fn - Callback receiving cancelled events
 * @returns Unsubscribe function to stop listening
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
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

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to scheduled tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per resting entry that satisfies the predicate, at the moment it is
 * created. Since "scheduled" already fires only once per signal, the dedup here is
 * mainly a safety net against a repeated emission.
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which scheduled events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveScheduledPerSignal(
  filterFn: (event: IStrategyTickResultScheduled) => boolean,
  fn: (event: IStrategyTickResultScheduled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_SCHEDULED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * "Waiting" repeats on every tick for as long as a resting entry has not activated,
 * so this is where the dedup earns its keep: the callback runs on the FIRST tick
 * where the entry satisfies the predicate and then stays silent for that entry, no
 * matter how long it keeps waiting.
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which waiting events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveWaitingPerSignal(
  filterFn: (event: IStrategyTickResultWaiting) => boolean,
  fn: (event: IStrategyTickResultWaiting) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_WAITING_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per position that satisfies the predicate, at the moment it opens.
 * Since "opened" already fires only once per signal, the dedup here is mainly a
 * safety net against a repeated emission.
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which opened events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveOpenedPerSignal(
  filterFn: (event: IStrategyTickResultOpened) => boolean,
  fn: (event: IStrategyTickResultOpened) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_OPENED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * "Active" repeats on every tick for the whole life of a position, so this is the
 * canonical use of the per-signal form: the callback runs on the FIRST tick where
 * the position satisfies the predicate and then stays silent for that position.
 * Ideal for one-shot alerts such as "this trade crossed 5% profit".
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which active events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveActivePerSignal(
  filterFn: (event: IStrategyTickResultActive) => boolean,
  fn: (event: IStrategyTickResultActive) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_ACTIVE_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per closed position that satisfies the predicate. Since "closed" is
 * terminal and already fires once per signal, the dedup here is mainly a safety net
 * against a repeated emission.
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which closed events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveClosedPerSignal(
  filterFn: (event: IStrategyTickResultClosed) => boolean,
  fn: (event: IStrategyTickResultClosed) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CLOSED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results from live executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per dropped resting entry that satisfies the predicate. Since
 * "cancelled" is terminal and already fires once per signal, the dedup here is
 * mainly a safety net against a repeated emission.
 *
 * Receives events from Live.run() only, so backtest replays can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which cancelled events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLiveCancelledPerSignal(
  filterFn: (event: IStrategyTickResultCancelled) => boolean,
  fn: (event: IStrategyTickResultCancelled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_CANCELLED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalLiveEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}

/**
 * Subscribes to scheduled tick results from backtest executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per resting entry that satisfies the predicate, at the moment it is
 * created. Since "scheduled" already fires only once per signal, the dedup here is
 * mainly a safety net against a repeated emission.
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which scheduled events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestScheduledPerSignal(
  filterFn: (event: IStrategyTickResultScheduled) => boolean,
  fn: (event: IStrategyTickResultScheduled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_SCHEDULED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "scheduled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultScheduled)));
}

/**
 * Subscribes to waiting tick results from backtest executions only,
 * delivering the callback at most once per signal.
 *
 * "Waiting" repeats on every tick for as long as a resting entry has not activated,
 * so this is where the dedup earns its keep: the callback runs on the FIRST tick
 * where the entry satisfies the predicate and then stays silent for that entry, no
 * matter how long it keeps waiting.
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which waiting events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestWaitingPerSignal(
  filterFn: (event: IStrategyTickResultWaiting) => boolean,
  fn: (event: IStrategyTickResultWaiting) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_WAITING_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "waiting" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultWaiting)));
}

/**
 * Subscribes to opened tick results from backtest executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per position that satisfies the predicate, at the moment it opens.
 * Since "opened" already fires only once per signal, the dedup here is mainly a
 * safety net against a repeated emission.
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which opened events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestOpenedPerSignal(
  filterFn: (event: IStrategyTickResultOpened) => boolean,
  fn: (event: IStrategyTickResultOpened) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_OPENED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "opened" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultOpened)));
}

/**
 * Subscribes to active tick results from backtest executions only,
 * delivering the callback at most once per signal.
 *
 * "Active" repeats on every tick for the whole life of a position, so this is the
 * canonical use of the per-signal form: the callback runs on the FIRST tick where
 * the position satisfies the predicate and then stays silent for that position.
 * Ideal for one-shot alerts such as "this trade crossed 5% profit".
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which active events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestActivePerSignal(
  filterFn: (event: IStrategyTickResultActive) => boolean,
  fn: (event: IStrategyTickResultActive) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_ACTIVE_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "active" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultActive)));
}

/**
 * Subscribes to closed tick results from backtest executions only, delivering the
 * callback at most once per signal.
 *
 * Fires once per closed position that satisfies the predicate. Since "closed" is
 * terminal and already fires once per signal, the dedup here is mainly a safety net
 * against a repeated emission.
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which closed events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestClosedPerSignal(
  filterFn: (event: IStrategyTickResultClosed) => boolean,
  fn: (event: IStrategyTickResultClosed) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CLOSED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "closed" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultClosed)));
}

/**
 * Subscribes to cancelled tick results from backtest executions only,
 * delivering the callback at most once per signal.
 *
 * Fires once per dropped resting entry that satisfies the predicate. Since
 * "cancelled" is terminal and already fires once per signal, the dedup here is
 * mainly a safety net against a repeated emission.
 *
 * Receives events from Backtest.run() only, so live trading can never trigger it.
 *
 * Deduplication is per execution identity - strategy, exchange, frame, mode and
 * symbol - so parallel strategies never suppress one another. Within one execution
 * the listener remembers the last signal id it delivered and drops any repeat of
 * it; a new signal id reports again.
 *
 * The predicate runs BEFORE the dedup, so events the predicate rejects are never
 * remembered and cannot hide a later matching event.
 *
 * @param filterFn - Predicate selecting which cancelled events are considered
 * @param fn - Callback invoked at most once per signal
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestCancelledPerSignal(
  filterFn: (event: IStrategyTickResultCancelled) => boolean,
  fn: (event: IStrategyTickResultCancelled) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_CANCELLED_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  return signalBacktestEmitter
    .filter((event) => event.action === "cancelled" && filterFn(event))
    .filter((event) => {
      const parts = [event.strategyName, event.exchangeName];
      if (event.frameName) parts.push(event.frameName);
      parts.push(event.backtest ? "backtest" : "live");
      parts.push(event.symbol);
      const key = parts.join(":");
      const signalId = event.signal?.id;
      if (seenMap.get(key) === signalId) {
        return false;
      }
      seenMap.set(key, signalId);
      return true;
    })
    .connect(queued(async (event) => fn(event as IStrategyTickResultCancelled)));
}
