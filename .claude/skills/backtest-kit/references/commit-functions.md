# Commit Functions

All commit functions require an active execution context (call from event listeners or strategy callbacks only).
All return `Promise<boolean>` (false = skipped, no position) unless noted.

## Partial Close

### `commitPartialProfit(symbol, percentToClose)` → `Promise<boolean>`
Close `percentToClose`% of position while in profit direction. Rejected if price not in profit direction.

### `commitPartialLoss(symbol, percentToClose)` → `Promise<boolean>`
Close `percentToClose`% while in loss direction.

### `commitPartialProfitCost(symbol, dollarAmount)` → `Promise<boolean>`
Wrapper around `commitPartialProfit` — converts dollar amount to % using current invested cost.

### `commitPartialLossCost(symbol, dollarAmount)` → `Promise<boolean>`
Wrapper around `commitPartialLoss`.

## DCA Entry

### `commitAverageBuy(symbol, cost?)` → `Promise<boolean>`
Add DCA entry at current VWAP. Default cost: `CC_POSITION_ENTRY_COST`.
- Default behavior: only accepted when price is a new low since entry (anti-record).
- With `CC_ENABLE_DCA_EVERYWHERE=true`: accepted any time price < priceOpen.

## Trailing Adjustments

### `commitTrailingStop(symbol, percentShift, currentPrice)` → `Promise<boolean>`
Shift SL by `percentShift` of **original** SL distance (not current). Negative = tighten.
Absorption rule: only a more protective SL is accepted (higher for long, lower for short).

```typescript
// LONG: entry=100, original SL=90 (10% distance)
// Shift by -5%: new distance = 5%, new SL = 95
await commitTrailingStop('BTCUSDT', -5, currentPrice);
```

### `commitTrailingTake(symbol, percentShift, currentPrice)` → `Promise<boolean>`
Shift TP by `percentShift` of original TP distance. Absorption: only closer-to-entry TP accepted.

### `commitTrailingStopCost(symbol, newStopLossPrice)` → `Promise<boolean>`
Convenience: accepts absolute price, converts to percentShift internally. Fetches price via `getAveragePrice`.

### `commitTrailingTakeCost(symbol, newTakeProfitPrice)` → `Promise<boolean>`
Convenience: absolute TP price.

## Breakeven

### `commitBreakeven(symbol)` → `Promise<boolean>`
Move SL to effective entry price. Only valid when position profit > `CC_BREAKEVEN_THRESHOLD` (default 0.2%).
Returns false if threshold not reached or no pending signal.

## Scheduled Signal Management

### `commitActivateScheduled(symbol, payload?)` → `Promise<void>`
Activate a scheduled signal immediately (skip waiting for priceOpen).

### `commitCancelScheduled(symbol, payload?)` → `Promise<void>`
Cancel the scheduled signal. Strategy continues and can generate new signals.

### `commitClosePending(symbol, payload?)` → `Promise<void>`
Force-close the active pending signal. Strategy continues.

## Notifications

### `commitSignalNotify(symbol, payload?)` → `Promise<void>`
Broadcast a user-defined note for the current pending signal. Emits `listenSignalNotify` event.
Throws if no pending signal exists.

```typescript
await commitSignalNotify('BTCUSDT', {
  notificationNote: 'RSI crossed 70 — consider closing',
  notificationId: 'msg-123',
});
```

## Common Pattern

```typescript
import {
  listenPartialProfitAvailable,
  listenBreakevenAvailable,
  listenActivePing,
  commitPartialProfit,
  commitBreakeven,
  commitTrailingStopCost,
  getAveragePrice,
} from 'backtest-kit';

// Take 30% profit every time price hits a 30% milestone
listenPartialProfitAvailable(async (event) => {
  if (event.level % 30 === 0) {
    await commitPartialProfit(event.symbol, 30);
  }
});

// Move SL to breakeven when eligible
listenBreakevenAvailable(async (event) => {
  await commitBreakeven(event.symbol);
});

// Dynamic trailing stop every minute
listenActivePing(async (event) => {
  const price = await getAveragePrice(event.symbol);
  await commitTrailingStopCost(event.symbol, price * 0.98);
});
```
