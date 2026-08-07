---
title: docs/function/listenSignalEventPerSignal
group: docs
---

# listenSignalEventPerSignal

```ts
declare function listenSignalEventPerSignal(filterFn: (event: SignalEventContract) => boolean, fn: (event: SignalEventContract) => void): () => void;
```

Subscribes to pending lifecycle events, delivering the callback once per new signal id.

Deduplicates on `event.data.id`. Note that a single signal legitimately produces
both an "opened" and a "closed" event: filter by `action` if only one of the two
transitions should reach the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
