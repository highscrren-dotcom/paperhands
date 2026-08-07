---
title: docs/function/listenMaxDrawdownPerSignal
group: docs
---

# listenMaxDrawdownPerSignal

```ts
declare function listenMaxDrawdownPerSignal(filterFn: (event: MaxDrawdownContract) => boolean, fn: (event: MaxDrawdownContract) => void): () => void;
```

Subscribes to max drawdown events, delivering the callback once per new signal id.

Deduplicates on `event.signal.id` — the first drawdown matching the predicate
is reported, later deeper drawdowns of the same signal are suppressed.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
