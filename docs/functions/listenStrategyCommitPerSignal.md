---
title: docs/function/listenStrategyCommitPerSignal
group: docs
---

# listenStrategyCommitPerSignal

```ts
declare function listenStrategyCommitPerSignal(filterFn: (event: StrategyCommitContract) => boolean, fn: (event: StrategyCommitContract) => void): () => void;
```

Subscribes to strategy management events, delivering the callback once per new signal id.

Deduplicates on `event.signalId`. Trailing commits repeat many times per
position, so this reports the first commit matching the predicate per signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
