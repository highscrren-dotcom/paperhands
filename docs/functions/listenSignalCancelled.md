---
title: docs/function/listenSignalCancelled
group: docs
---

# listenSignalCancelled

```ts
declare function listenSignalCancelled(fn: (event: IStrategyTickResultCancelled) => void): () => void;
```

Subscribes to cancelled tick results (live + backtest).

Fires when a scheduled signal is dropped before ever opening a position.
`reason` carries the cancellation cause.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving cancelled events |
