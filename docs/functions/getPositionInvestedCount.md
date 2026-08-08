---
title: docs/function/getPositionInvestedCount
group: docs
---

# getPositionInvestedCount

```ts
declare function getPositionInvestedCount(symbol: string): Promise<number>;
```

Returns the number of DCA entries made for the current pending signal.

1 = original entry only (no DCA).
Increases by 1 with each successful commitAverageBuy().

Throws if no pending signal exists.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
