---
title: docs/function/listenSignalActivePerSignal
group: docs
---

# listenSignalActivePerSignal

```ts
declare function listenSignalActivePerSignal(filterFn: (event: IStrategyTickResultActive) => boolean, fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results, once per new signal id (live + backtest).

Active ticks repeat for the whole life of a position, so this fires the first tick
the position meets the condition and then goes silent for it.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which active events are considered |
| `fn` | Callback invoked once per new signal id |
