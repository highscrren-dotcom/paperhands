---
title: docs/function/getPositionMaxDrawdownPnlPercentage
group: docs
---

# getPositionMaxDrawdownPnlPercentage

```ts
declare function getPositionMaxDrawdownPnlPercentage(symbol: string): Promise<number>;
```

Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
