---
title: docs/function/listenSignalBacktestActive
group: docs
---

# listenSignalBacktestActive

```ts
declare function listenSignalBacktestActive(fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results from backtest executions only.

Fires on every tick while a position is open, carrying the live `pnl` plus
`percentTp` / `percentSl` - how far price has travelled toward take-profit or
stop-loss. This is a high-volume channel: one event per tick per open position,
for the whole life of the position.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving active events |
