# Event Listeners

All listeners return an unsubscribe function. All have `Once` variants (fire exactly once for first matching event).

```typescript
const unsubscribe = listenSignal((event) => { /* ... */ });
unsubscribe(); // remove listener

// Once variant with filter
const cancel = listenPartialProfitAvailableOnce(
  (event) => event.level === 50,
  async (event) => { await commitPartialProfit(event.symbol, 50); }
);
cancel(); // cancel before it fires
```

## Signal Events

### `listenSignal(fn)` — all signal events (backtest + live)
### `listenSignalBacktest(fn)` — backtest only
### `listenSignalLive(fn)` — live only

Callback receives `IStrategyTickResult` — discriminated union on `action`:
- `"opened"` — new position created
- `"closed"` — position exited (has `pnl`, `closeReason`, `closeTimestamp`)
- `"active"` — monitoring tick
- `"idle"` — no position
- `"scheduled"` — waiting for entry price
- `"cancelled"` — scheduled order cancelled

```typescript
listenSignalLive((event) => {
  if (event.action === 'closed') {
    console.log(event.closeReason, event.pnl.pnlPercentage);
  }
});
```

## Lifecycle Events

### `listenDoneBacktest(fn)` — fires when `Backtest.background()` finishes
Callback receives `{ strategyName, exchangeName, symbol, frameName }`.

### `listenDoneLive(fn)` — fires when `Live.background()` terminates
### `listenDoneWalker(fn)` — fires when `Walker.background()` finishes
### `listenBacktestProgress(fn)` — progress during backtest
Callback receives `{ progress, processedFrames, totalFrames, strategyName, symbol }`.

## Position Events

### `listenPartialProfitAvailable(fn)`
Fires when signal price reaches a profit milestone (10%, 20%, 30%...).
Callback: `{ symbol, level, currentPrice, backtest, strategyName, exchangeName, frameName, data }`.

### `listenPartialLossAvailable(fn)`
Fires when signal price crosses a loss milestone.

### `listenBreakevenAvailable(fn)`
Fires when price has moved far enough in profit direction to cover costs.

## Trading Events

### `listenRisk(fn)` — signal rejected by risk rule
Callback: `{ symbol, strategyName, pendingSignal, activePositionCount, comment, currentPrice }`.

### `listenError(fn)` — recoverable errors (execution continues)
### `listenExit(fn)` — fatal errors (runner terminates)

### `listenStrategyCommit(fn)` — any commit action
Actions: `cancel-scheduled` | `close-pending` | `partial-profit` | `partial-loss` |
         `trailing-stop` | `trailing-take` | `breakeven` | `activate-scheduled` | `average-buy`

## Timing Events (heartbeats)

### `listenSchedulePing(fn)` — every minute while scheduled signal waiting
Callback: `{ symbol, timestamp, backtest, data }`.

### `listenActivePing(fn)` — every minute while position is open
Callback: `{ symbol, timestamp, backtest, data }` where `data` is the pending signal.
Use for time-based trailing stops or custom monitoring.

### `listenIdlePing(fn)` — every tick when no position
Callback: `{ symbol, timestamp, backtest, strategyName, exchangeName, frameName }`.

## Performance Events

### `listenPerformance(fn)`
Callback: `{ metricType, duration }`. Use to find bottlenecks.
```typescript
listenPerformance((event) => {
  if (event.duration > 100) console.warn('Slow:', event.metricType, `${event.duration}ms`);
});
```

### `listenWalkerProgress(fn)` — progress after each strategy tested in Walker
### `listenWalkerComplete(fn)` — Walker run finished

## Sync / Advanced Events

### `listenSync(fn)` — blocks position state mutation until async callback resolves
Use only for external audit systems. If it throws, open/close doesn't execute.

### `listenHighestProfit(fn)` — new profit high reached during signal
Callback: `{ highestPnlPercentage, ... }`.

### `listenMaxDrawdown(fn)` — new drawdown low during signal
Callback: `{ maxDrawdownPnlPercentage, ... }`.

### `listenSignalNotify(fn)` — fired by `commitSignalNotify`
Callback: `{ symbol, notificationNote, notificationId, strategyName, ... }`.

## Full Once Variant Table

| Listener | Once variant |
|---|---|
| `listenSignal` | `listenSignalOnce` |
| `listenSignalBacktest` | `listenSignalBacktestOnce` |
| `listenSignalLive` | `listenSignalLiveOnce` |
| `listenDoneBacktest` | `listenDoneBacktestOnce` |
| `listenDoneLive` | `listenDoneLiveOnce` |
| `listenDoneWalker` | `listenDoneWalkerOnce` |
| `listenPartialProfitAvailable` | `listenPartialProfitAvailableOnce` |
| `listenPartialLossAvailable` | `listenPartialLossAvailableOnce` |
| `listenBreakevenAvailable` | `listenBreakevenAvailableOnce` |
| `listenRisk` | `listenRiskOnce` |
| `listenSchedulePing` | `listenSchedulePingOnce` |
| `listenActivePing` | `listenActivePingOnce` |
| `listenIdlePing` | `listenIdlePingOnce` |
| `listenStrategyCommit` | `listenStrategyCommitOnce` |
| `listenHighestProfit` | `listenHighestProfitOnce` |
| `listenMaxDrawdown` | `listenMaxDrawdownOnce` |
| `listenSignalNotify` | `listenSignalNotifyOnce` |
