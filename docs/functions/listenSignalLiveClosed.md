---
title: docs/function/listenSignalLiveClosed
group: docs
---

# listenSignalLiveClosed

```ts
declare function listenSignalLiveClosed(fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results from live executions only.

Fires when a position closes, for any reason. `closeReason` says which
("take_profit", "stop_loss", "time_expired" or "closed" for a user-initiated
close), `closeTimestamp` says when, and `pnl` holds the realised result with fees
and slippage already applied. Terminal for that signal - no further events for
it will arrive on this channel.

Receives events from Live.run() only. Backtest replays never reach this callback,
which is what makes it safe for anything with real-world side effects - order
placement mirrors, alerting, notifications.

Because the emitter is already split by action, the callback receives the
narrowed variant directly - no `if (event.action === ...)` guard is needed
before reading the fields described above.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback receiving closed events |
