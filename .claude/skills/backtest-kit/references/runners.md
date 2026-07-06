# Backtest, Live, and Walker Classes

## Backtest

```typescript
import { Backtest } from 'backtest-kit';
```

### `Backtest.background(symbol, context)` → `() => void`
Runs backtest in background. Returns stop function.
- Throws if same instance is already running.
- Context: `{ strategyName, exchangeName, frameName }`

### `Backtest.run(symbol, context)` → `AsyncIterableIterator<IStrategyTickResultClosed>`
Returns async generator, finite — completes when frame exhausted. Each value has `action: "closed"`.

```typescript
for await (const result of Backtest.run('BTCUSDT', { strategyName, exchangeName, frameName })) {
  console.log(result.closeReason, result.pnl.pnlPercentage);
}
```

### `Backtest.getData(symbol, context)` → `Promise<BacktestStatisticsModel>`
Returns aggregated stats: win rate, avg PNL, Sharpe ratio, per-signal details.

### `Backtest.getReport(symbol, context, columns?)` → `Promise<string>`
Returns markdown string of the report.

### `Backtest.dump(symbol, context, path?, columns?)` → `Promise<void>`
Saves markdown to `./dump/backtest/<strategyName>.md` (default) or custom path.

### `Backtest.clear(symbol, context)` → `void`
Clears accumulated data. Call between sequential backtests on same strategy.

---

## Live

```typescript
import { Live } from 'backtest-kit';
```

Context: `{ strategyName, exchangeName }` (no `frameName`)

### Key differences from Backtest

| | Backtest | Live |
|---|---|---|
| Generator | Finite | Infinite |
| Time source | Frame timestamps | `new Date()` |
| frameName | Required | Not used |
| Crash recovery | N/A | Auto (atomic file writes) |

### `Live.background(symbol, context)` → `() => void`
Returns stop function. Calling it stops new signals; open positions continue monitoring.

### `Live.run(symbol, context)` → `AsyncIterableIterator<IStrategyTickResult>`
Yields `opened` and `closed` events. `active` and `idle` consumed internally.

### `IStrategyTickResult` actions

| action | When | Extra fields |
|---|---|---|
| `opened` | New position | `signal`, `currentPrice` |
| `closed` | Exit | `signal`, `pnl`, `closeReason`, `closeTimestamp` |
| `active` | Monitoring (not yielded) | `signal`, `pnl`, `percentTp`, `percentSl` |
| `idle` | No position (not yielded) | `currentPrice` |
| `scheduled` | Waiting for entry price | `signal` |
| `cancelled` | Scheduled order cancelled | `signal`, `reason` |

### `Live.getData`, `Live.getReport`, `Live.dump`, `Live.clear`
Same signatures as Backtest but without `frameName`.

---

## Walker

Walker runs A/B comparison across multiple strategy variants.

```typescript
import { addWalkerSchema, Walker } from 'backtest-kit';

addWalkerSchema({
  walkerName: 'rsi-optimizer',
  exchangeName: 'binance',
  frameName: '30d-backtest',
  strategies: ['rsi-9', 'rsi-14', 'rsi-21'],
  metric: 'sharpeRatio',   // default
  callbacks: {
    onStrategyComplete: (name, symbol, stats, metric) => console.log(name, metric),
    onComplete: (results) => console.log('Winner:', results.bestStrategy),
  },
});

for await (const progress of Walker.run('BTCUSDT', { walkerName: 'rsi-optimizer' })) {
  console.log(`${progress.strategiesTested}/${progress.totalStrategies}`);
}
await Walker.dump('BTCUSDT', { walkerName: 'rsi-optimizer' });
```

### WalkerMetric values
`"sharpeRatio"` | `"annualizedSharpeRatio"` | `"winRate"` | `"totalPnl"` | `"certaintyRatio"` | `"avgPnl"` | `"expectedYearlyReturns"`

### Walker methods
Same pattern: `Walker.run`, `Walker.background`, `Walker.getData`, `Walker.getReport`, `Walker.dump`

### `IStrategyTickResultClosed` fields

| Field | Type | Description |
|---|---|---|
| `action` | `"closed"` | Always closed for backtest |
| `signal` | `IPublicSignalRow` | Full signal row |
| `closeReason` | `"take_profit" \| "stop_loss" \| "time_expired" \| "closed"` | Why it closed |
| `closeTimestamp` | `number` | Unix ms |
| `pnl` | `IStrategyPnL` | PnL with fees/slippage |
| `currentPrice` | `number` | VWAP at close |
| `backtest` | `true` | Mode flag |
| `createdAt` | `number` | Tick creation ms |
