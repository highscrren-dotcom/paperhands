---
title: docs/function/listenSignalBacktestPerSignal
group: docs
---

# listenSignalBacktestPerSignal

```ts
declare function listenSignalBacktestPerSignal(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to backtest signal events, delivering the callback once per new signal id.

Only receives events from Backtest.run() execution. Idle events (`signal: null`)
are skipped. See the per-signal section header for the dedup semantics.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
