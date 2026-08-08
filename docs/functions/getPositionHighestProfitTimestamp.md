---
title: docs/function/getPositionHighestProfitTimestamp
group: docs
---

# getPositionHighestProfitTimestamp

```ts
declare function getPositionHighestProfitTimestamp(symbol: string): Promise<number>;
```

Returns the timestamp when the best profit price was recorded during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
