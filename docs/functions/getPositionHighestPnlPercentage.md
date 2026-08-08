---
title: docs/function/getPositionHighestPnlPercentage
group: docs
---

# getPositionHighestPnlPercentage

```ts
declare function getPositionHighestPnlPercentage(symbol: string): Promise<number>;
```

Returns the PnL percentage at the moment the best profit price was recorded during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
