---
title: docs/function/listenSignalLiveActivePerSignal
group: docs
---

# listenSignalLiveActivePerSignal

```ts
declare function listenSignalLiveActivePerSignal(filterFn: (event: IStrategyTickResultActive) => boolean, fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results from live executions only,
delivering the callback at most once per signal.

"Active" repeats on every tick for the whole life of a position, so this is the
canonical use of the per-signal form: the callback runs on the FIRST tick where
the position satisfies the predicate and then stays silent for that position.
Ideal for one-shot alerts such as "this trade crossed 5% profit".

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
| `filterFn` | Predicate selecting which active events are considered |
| `fn` | Callback invoked at most once per signal |
