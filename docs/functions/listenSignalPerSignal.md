---
title: docs/function/listenSignalPerSignal
group: docs
---

# listenSignalPerSignal

```ts
declare function listenSignalPerSignal(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to signal events, delivering the callback once per new signal id.

Filters by the predicate first, then collapses repeats sharing the same execution
identity and `event.signal.id`. Idle events carry `signal: null` and are skipped,
so the callback always receives an event with a signal attached.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
