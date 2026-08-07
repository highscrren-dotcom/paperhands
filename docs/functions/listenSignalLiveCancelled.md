---
title: docs/function/listenSignalLiveCancelled
group: docs
---

# listenSignalLiveCancelled

```ts
declare function listenSignalLiveCancelled(fn: (event: IStrategyTickResultCancelled) => void): () => void;
```

Subscribes to cancelled tick results from live executions only.

Fires when a scheduled signal is dropped before it ever became a position, so no
money was ever at risk. `reason` explains why (the wait timed out, price moved
through the entry in the wrong direction, or a user cancelled it) and `cancelId`
is set for user-initiated cancellations. Terminal for that signal.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving cancelled events |
