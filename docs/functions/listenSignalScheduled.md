---
title: docs/function/listenSignalScheduled
group: docs
---

# listenSignalScheduled

```ts
declare function listenSignalScheduled(fn: (event: IStrategyTickResultScheduled) => void): () => void;
```

Subscribes to scheduled tick results (live + backtest).

Fires once when a scheduled signal is created — a resting entry waiting for price
to reach `signal.priceOpen`. Subsequent monitoring ticks arrive as "waiting".

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving scheduled events |
