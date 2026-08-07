---
title: docs/function/listenSignalClosedPerSignal
group: docs
---

# listenSignalClosedPerSignal

```ts
declare function listenSignalClosedPerSignal(filterFn: (event: IStrategyTickResultClosed) => boolean, fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which closed events are considered |
| `fn` | Callback invoked once per new signal id |
