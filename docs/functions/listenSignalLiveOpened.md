---
title: docs/function/listenSignalLiveOpened
group: docs
---

# listenSignalLiveOpened

```ts
declare function listenSignalLiveOpened(fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results from live executions only.

Fires when a position actually opens, either because the strategy returned an
immediate signal or because a scheduled entry finally activated. `event.signal`
carries the stored row with its generated id, entry price and TP/SL levels. This
is the point from which the position starts costing money.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving opened events |
