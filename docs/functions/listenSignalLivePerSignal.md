---
title: docs/function/listenSignalLivePerSignal
group: docs
---

# listenSignalLivePerSignal

```ts
declare function listenSignalLivePerSignal(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to live signal events, delivering the callback once per new signal id.

Only receives events from Live.run() execution. Idle events (`signal: null`)
are skipped. See the per-signal section header for the dedup semantics.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
