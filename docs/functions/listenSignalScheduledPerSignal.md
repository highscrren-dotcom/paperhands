---
title: docs/function/listenSignalScheduledPerSignal
group: docs
---

# listenSignalScheduledPerSignal

```ts
declare function listenSignalScheduledPerSignal(filterFn: (event: IStrategyTickResultScheduled) => boolean, fn: (event: IStrategyTickResultScheduled) => void): () => void;
```

Subscribes to scheduled tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which scheduled events are considered |
| `fn` | Callback invoked once per new signal id |
