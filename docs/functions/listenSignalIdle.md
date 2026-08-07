---
title: docs/function/listenSignalIdle
group: docs
---

# listenSignalIdle

```ts
declare function listenSignalIdle(fn: (event: IStrategyTickResultIdle) => void): () => void;
```

Subscribes to idle tick results (live + backtest).

Fires on every tick where the strategy holds no signal at all. `event.signal` is
always `null` here — there is no position to inspect, only `currentPrice` and the
strategy/exchange/frame identity.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving idle events |
