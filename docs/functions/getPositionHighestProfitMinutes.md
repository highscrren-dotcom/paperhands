---
title: docs/function/getPositionHighestProfitMinutes
group: docs
---

# getPositionHighestProfitMinutes

```ts
declare function getPositionHighestProfitMinutes(symbol: string): Promise<number>;
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Alias for getPositionDrawdownMinutes — measures how long the position has been
pulling back from its peak profit level.
Zero when called at the exact moment the peak was set.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
