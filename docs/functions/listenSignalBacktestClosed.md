---
title: docs/function/listenSignalBacktestClosed
group: docs
---

# listenSignalBacktestClosed

```ts
declare function listenSignalBacktestClosed(fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results from backtest executions only.

Fires when a position closes, for any reason. `closeReason` says which
("take_profit", "stop_loss", "time_expired" or "closed" for a user-initiated
close), `closeTimestamp` says when, and `pnl` holds the realised result with fees
and slippage already applied. Terminal for that signal - no further events for
it will arrive on this channel.

Receives events from Backtest.run() only. Live trading never reaches this
callback, so it is the right channel for replay analysis and reporting that must
not be polluted by production traffic.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving closed events |
