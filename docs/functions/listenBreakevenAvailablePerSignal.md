---
title: docs/function/listenBreakevenAvailablePerSignal
group: docs
---

# listenBreakevenAvailablePerSignal

```ts
declare function listenBreakevenAvailablePerSignal(filterFn: (event: BreakevenContract) => boolean, fn: (event: BreakevenContract) => void): () => void;
```

Subscribes to breakeven events, delivering the callback once per new signal id.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
