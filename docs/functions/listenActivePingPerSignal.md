---
title: docs/function/listenActivePingPerSignal
group: docs
---

# listenActivePingPerSignal

```ts
declare function listenActivePingPerSignal(filterFn: (event: ActivePingContract) => boolean, fn: (event: ActivePingContract) => void): () => void;
```

Subscribes to active ping events, delivering the callback once per new signal id.

Active pings fire on every tick of a monitored position, so this is the
canonical use of the per-signal form: react the first tick a position meets a
condition, then stay silent for the rest of its life.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
