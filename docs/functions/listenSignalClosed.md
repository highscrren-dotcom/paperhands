---
title: docs/function/listenSignalClosed
group: docs
---

# listenSignalClosed

```ts
declare function listenSignalClosed(fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results (live + backtest).

Fires when a position closes. `pnl`, `closeReason` and `closeTimestamp` are
guaranteed present on the narrowed type.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving closed events |
