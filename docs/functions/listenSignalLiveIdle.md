---
title: docs/function/listenSignalLiveIdle
group: docs
---

# listenSignalLiveIdle

```ts
declare function listenSignalLiveIdle(fn: (event: IStrategyTickResultIdle) => void): () => void;
```

Subscribes to idle tick results from live executions only.

Fires on every tick where the strategy holds no position and nothing scheduled.
`event.signal` is always `null` here, so there is nothing to inspect beyond
`currentPrice`, `symbol` and the strategy/exchange/frame identity. Useful for
heartbeat logging or for noticing that a strategy has gone quiet.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving idle events |
