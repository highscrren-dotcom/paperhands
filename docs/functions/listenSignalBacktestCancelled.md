---
title: docs/function/listenSignalBacktestCancelled
group: docs
---

# listenSignalBacktestCancelled

```ts
declare function listenSignalBacktestCancelled(fn: (event: IStrategyTickResultCancelled) => void): () => void;
```

Subscribes to cancelled tick results from backtest executions only.

Fires when a scheduled signal is dropped before it ever became a position, so no
money was ever at risk. `reason` explains why (the wait timed out, price moved
through the entry in the wrong direction, or a user cancelled it) and `cancelId`
is set for user-initiated cancellations. Terminal for that signal.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving cancelled events |
