---
title: docs/function/listenSignalWaiting
group: docs
---

# listenSignalWaiting

```ts
declare function listenSignalWaiting(fn: (event: IStrategyTickResultWaiting) => void): () => void;
```

Subscribes to waiting tick results (live + backtest).

Fires on every tick while a scheduled signal has not yet activated. High volume:
one event per tick per waiting signal. Use the `listenSignalWaitingPerSignal`
form to collapse that down to one callback per signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving waiting events |
