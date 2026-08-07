---
title: docs/function/listenSignalLiveWaiting
group: docs
---

# listenSignalLiveWaiting

```ts
declare function listenSignalLiveWaiting(fn: (event: IStrategyTickResultWaiting) => void): () => void;
```

Subscribes to waiting tick results from live executions only.

Fires on every tick while a scheduled signal has not activated yet. `event.signal`
describes the resting entry and `pnl` is theoretical - the position is not open,
so nothing is at risk. This is a high-volume channel: one event per tick per
waiting signal for as long as the entry rests.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving waiting events |
