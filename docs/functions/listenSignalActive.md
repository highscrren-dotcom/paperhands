---
title: docs/function/listenSignalActive
group: docs
---

# listenSignalActive

```ts
declare function listenSignalActive(fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results (live + backtest).

Fires on every tick while a position is open, carrying live `pnl`, `percentTp` and
`percentSl`. High volume: one event per tick per open position. Use the
`listenSignalActivePerSignal` form to collapse that down to one callback per
position.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving active events |
