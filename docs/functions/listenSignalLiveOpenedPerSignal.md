---
title: docs/function/listenSignalLiveOpenedPerSignal
group: docs
---

# listenSignalLiveOpenedPerSignal

```ts
declare function listenSignalLiveOpenedPerSignal(filterFn: (event: IStrategyTickResultOpened) => boolean, fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results from live executions only,
delivering the callback at most once per signal.

Fires once per position that satisfies the predicate, at the moment it opens.
Since "opened" already fires only once per signal, the dedup here is mainly a
safety net against a repeated emission.

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
| `filterFn` | Predicate selecting which opened events are considered |
| `fn` | Callback invoked at most once per signal |
