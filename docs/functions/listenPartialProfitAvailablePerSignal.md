---
title: docs/function/listenPartialProfitAvailablePerSignal
group: docs
---

# listenPartialProfitAvailablePerSignal

```ts
declare function listenPartialProfitAvailablePerSignal(filterFn: (event: PartialProfitContract) => boolean, fn: (event: PartialProfitContract) => void): () => void;
```

Subscribes to partial profit level events, delivering the callback once per new signal id.

Deduplicates on `event.data.id`, so only the FIRST matching profit level of a
signal is reported. To react to each distinct level of the same signal, key on
the level instead by using the plain `listenPartialProfitAvailable` form with
your own bookkeeping, or narrow `filterFn` to a single level.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
