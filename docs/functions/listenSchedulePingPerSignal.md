---
title: docs/function/listenSchedulePingPerSignal
group: docs
---

# listenSchedulePingPerSignal

```ts
declare function listenSchedulePingPerSignal(filterFn: (event: SchedulePingContract) => boolean, fn: (event: SchedulePingContract) => void): () => void;
```

Subscribes to schedule ping events, delivering the callback once per new signal id.

Schedule pings fire every tick while a resting entry waits for activation;
this collapses them to one callback per scheduled signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
