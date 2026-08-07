---
title: docs/function/listenSignalLiveClosedPerSignal
group: docs
---

# listenSignalLiveClosedPerSignal

```ts
declare function listenSignalLiveClosedPerSignal(filterFn: (event: IStrategyTickResultClosed) => boolean, fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results from live executions only,
delivering the callback at most once per signal.

Fires once per closed position that satisfies the predicate. Since "closed" is
terminal and already fires once per signal, the dedup here is mainly a safety net
against a repeated emission.

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
| `filterFn` | Predicate selecting which closed events are considered |
| `fn` | Callback invoked at most once per signal |
