---
title: docs/class/RecentAdapter
group: docs
---

# RecentAdapter

Main recent signal adapter that manages both backtest and live recent signal storage.

Features:
- Subscribes to activePingSubject for automatic storage updates
- Provides unified access to the latest signal for any context
- Singleshot enable pattern prevents duplicate subscriptions
- Cleanup function for proper unsubscription

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables recent signal storage by subscribing to activePingSubject.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables recent signal storage by unsubscribing from all emitters.
Safe to call multiple times.

### getLatestSignal

```ts
getLatestSignal: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, when: Date) => Promise<IPublicSignalRow>
```

Retrieves the latest active signal for the given symbol and context.
Searches backtest storage first, then live storage.
Returns null if the stored signal's `timestamp` is greater than the requested `when`
(look-ahead bias protection).

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, when: Date) => Promise<number>
```

Returns the number of whole minutes elapsed since the latest signal's creation timestamp.
Searches backtest storage first, then live storage.
`when` doubles as the look-ahead cutoff — a signal whose `timestamp` exceeds
`when.getTime()` is treated as not yet visible — and as the "now" against
which elapsed minutes are computed.

### hasNoLatestSignal

```ts
hasNoLatestSignal: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, when: Date) => Promise<boolean>
```

Returns true if NO signal was recorded for the given context.

Inverse of getLatestSignal presence: searches backtest storage first, then
live storage, and reports whether both came back empty. A signal whose
`timestamp` exceeds `when` counts as absent (look-ahead bias protection).

Use it to guard the getters that throw on an empty history —
`getMinutesSinceLatestSignalCreated` raises rather than returning null, so
checking first is what keeps a fresh context from looking like a failure:

```typescript
if (await Recent.hasNoLatestSignal(symbol, context, when)) {
  return; // nothing traded yet, no cooldown to respect
}
const minutes = await Recent.getMinutesSinceLatestSignalCreated(symbol, context, when);
```
