---
title: docs/function/listenSignalLiveActive
group: docs
---

# listenSignalLiveActive

```ts
declare function listenSignalLiveActive(fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results from live executions only.

Fires on every tick while a position is open, carrying the live `pnl` plus
`percentTp` / `percentSl` - how far price has travelled toward take-profit or
stop-loss. This is a high-volume channel: one event per tick per open position,
for the whole life of the position.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving active events |
