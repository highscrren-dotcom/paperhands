---
title: docs/function/getPositionHighestPnlCost
group: docs
---

# getPositionHighestPnlCost

```ts
declare function getPositionHighestPnlCost(symbol: string): Promise<number>;
```

Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
