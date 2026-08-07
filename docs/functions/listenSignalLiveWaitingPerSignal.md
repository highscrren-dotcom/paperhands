---
title: docs/function/listenSignalLiveWaitingPerSignal
group: docs
---

# listenSignalLiveWaitingPerSignal

```ts
declare function listenSignalLiveWaitingPerSignal(filterFn: (event: IStrategyTickResultWaiting) => boolean, fn: (event: IStrategyTickResultWaiting) => void): () => void;
```

Subscribes to waiting tick results from live executions only,
delivering the callback at most once per signal.

"Waiting" repeats on every tick for as long as a resting entry has not activated,
so this is where the dedup earns its keep: the callback runs on the FIRST tick
where the entry satisfies the predicate and then stays silent for that entry, no
matter how long it keeps waiting.

Receives events from Live.run() only, so backtest replays can never trigger it.

Deduplication is per execution identity - strategy, exchange, frame, mode and
symbol - so parallel strategies never suppress one another. Within one execution
the listener remembers the last signal id it delivered and drops any repeat of
it; a new signal id reports again.

The predicate runs BEFORE the dedup, so events the predicate rejects are never
remembered and cannot hide a later matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which waiting events are considered |
| `fn` | Callback invoked at most once per signal |
