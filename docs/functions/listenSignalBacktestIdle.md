---
title: docs/function/listenSignalBacktestIdle
group: docs
---

# listenSignalBacktestIdle

```ts
declare function listenSignalBacktestIdle(fn: (event: IStrategyTickResultIdle) => void): () => void;
```

Subscribes to idle tick results from backtest executions only.

Fires on every tick where the strategy holds no position and nothing scheduled.
`event.signal` is always `null` here, so there is nothing to inspect beyond
`currentPrice`, `symbol` and the strategy/exchange/frame identity. Useful for
heartbeat logging or for noticing that a strategy has gone quiet.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving idle events |
