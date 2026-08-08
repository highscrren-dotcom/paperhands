---
title: docs/function/listenOrderSchedule
group: docs
---

# listenOrderSchedule

```ts
declare function listenOrderSchedule(fn: (event: ScheduleEventContract) => void): () => void;
```

Subscribes to resting-entry (scheduled order) lifecycle events with queued async processing.

Emitted when a scheduled signal is created (action "scheduled") - the strategy asked for an
entry at a specific price and the engine now waits for the market to reach it - or when that
entry is dropped before activating (action "cancelled" with reason "timeout" / "price_reject" /
"user"). Fires in both live and backtest.

IMPORTANT: The scheduled -&gt; active transition (activation) is NOT reported here. Activation
produces an "opened" event on the regular signal emitters (listenSignal) instead.

SYSTEM CHANNEL. This is the same stream the framework itself consumes: Broker subscribes to it
and fans each event out to the registered adapter as `onSignalScheduleOpen` (action "scheduled",
payload BrokerScheduleOpenPayload) or `onSignalScheduleCancelled` (action "cancelled", payload
BrokerScheduleCancelledPayload, carrying `reason`). Because it is systemic it is NOT gated on
"is a scheduled signal still live" - every emission is delivered, including the cancellation that
reports the entry is already gone.

For exchange integration prefer Broker.useBrokerAdapter with those two hooks; this listener is
for observation - logging, notifications, audit.

Events are processed sequentially in order received, even if callback is async.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle scheduled lifecycle events |
