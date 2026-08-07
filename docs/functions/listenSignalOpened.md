---
title: docs/function/listenSignalOpened
group: docs
---

# listenSignalOpened

```ts
declare function listenSignalOpened(fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results (live + backtest).

Fires when a position is opened — either directly or by activation of a scheduled
signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving opened events |
