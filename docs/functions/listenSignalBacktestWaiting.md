---
title: docs/function/listenSignalBacktestWaiting
group: docs
---

# listenSignalBacktestWaiting

```ts
declare function listenSignalBacktestWaiting(fn: (event: IStrategyTickResultWaiting) => void): () => void;
```

Subscribes to waiting tick results from backtest executions only.

Fires on every tick while a scheduled signal has not activated yet. `event.signal`
describes the resting entry and `pnl` is theoretical - the position is not open,
so nothing is at risk. This is a high-volume channel: one event per tick per
waiting signal for as long as the entry rests.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving waiting events |
