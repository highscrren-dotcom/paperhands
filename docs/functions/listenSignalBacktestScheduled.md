---
title: docs/function/listenSignalBacktestScheduled
group: docs
---

# listenSignalBacktestScheduled

```ts
declare function listenSignalBacktestScheduled(fn: (event: IStrategyTickResultScheduled) => void): () => void;
```

Subscribes to scheduled tick results from backtest executions only.

Fires once, at the moment a scheduled signal is created: the strategy asked for
an entry at a specific price and the engine is now waiting for the market to
reach it. No position exists yet. Every later tick of that same waiting entry
arrives as a "waiting" event instead, so this action marks the start of the
wait, not the wait itself.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving scheduled events |
