---
title: docs/function/getPositionHighestProfitPrice
group: docs
---

# getPositionHighestProfitPrice

```ts
declare function getPositionHighestProfitPrice(symbol: string): Promise<number>;
```

Returns the best price reached in the profit direction during this position's life.

Initialized at position open with the entry price and timestamp.
Updated on every tick/candle when VWAP moves beyond the previous record toward TP:
- LONG: tracks the highest price seen above effective entry
- SHORT: tracks the lowest price seen below effective entry

Throws if no pending signal exists.
Never returns null when a signal is active — always contains at least the entry price.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
