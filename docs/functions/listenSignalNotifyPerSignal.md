---
title: docs/function/listenSignalNotifyPerSignal
group: docs
---

# listenSignalNotifyPerSignal

```ts
declare function listenSignalNotifyPerSignal(filterFn: (event: SignalInfoContract) => boolean, fn: (event: SignalInfoContract) => void): () => void;
```

Subscribes to signal info events, delivering the callback once per new signal id.

Deduplicates on `event.data.id`, so a strategy spamming commitSignalInfo() for
the same position notifies the subscriber only once.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
