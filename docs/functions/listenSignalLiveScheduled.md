---
title: docs/function/listenSignalLiveScheduled
group: docs
---

# listenSignalLiveScheduled

```ts
declare function listenSignalLiveScheduled(fn: (event: IStrategyTickResultScheduled) => void): () => void;
```

Subscribes to scheduled tick results from live executions only.

Fires once, at the moment a scheduled signal is created: the strategy asked for
an entry at a specific price and the engine is now waiting for the market to
reach it. No position exists yet. Every later tick of that same waiting entry
arrives as a "waiting" event instead, so this action marks the start of the
wait, not the wait itself.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving scheduled events |
