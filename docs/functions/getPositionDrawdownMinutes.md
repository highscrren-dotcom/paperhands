---
title: docs/function/getPositionDrawdownMinutes
group: docs
---

# getPositionDrawdownMinutes

```ts
declare function getPositionDrawdownMinutes(symbol: string): Promise<number>;
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Measures how long the position has been pulling back from its peak profit level.
Zero when called at the exact moment the peak was set.
Grows continuously as price moves away from the peak without setting a new record.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
