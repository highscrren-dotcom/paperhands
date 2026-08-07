---
title: docs/function/listenSignalOpenedPerSignal
group: docs
---

# listenSignalOpenedPerSignal

```ts
declare function listenSignalOpenedPerSignal(filterFn: (event: IStrategyTickResultOpened) => boolean, fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which opened events are considered |
| `fn` | Callback invoked once per new signal id |
