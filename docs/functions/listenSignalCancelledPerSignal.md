---
title: docs/function/listenSignalCancelledPerSignal
group: docs
---

# listenSignalCancelledPerSignal

```ts
declare function listenSignalCancelledPerSignal(filterFn: (event: IStrategyTickResultCancelled) => boolean, fn: (event: IStrategyTickResultCancelled) => void): () => void;
```

Subscribes to cancelled tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which cancelled events are considered |
| `fn` | Callback invoked once per new signal id |
