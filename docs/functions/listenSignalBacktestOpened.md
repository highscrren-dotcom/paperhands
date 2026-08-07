---
title: docs/function/listenSignalBacktestOpened
group: docs
---

# listenSignalBacktestOpened

```ts
declare function listenSignalBacktestOpened(fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results from backtest executions only.

Fires when a position actually opens, either because the strategy returned an
immediate signal or because a scheduled entry finally activated. `event.signal`
carries the stored row with its generated id, entry price and TP/SL levels. This
is the point from which the position starts costing money.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving opened events |
