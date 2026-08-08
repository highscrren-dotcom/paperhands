---
title: docs/function/getPositionMaxDrawdownMinutes
group: docs
---

# getPositionMaxDrawdownMinutes

```ts
declare function getPositionMaxDrawdownMinutes(symbol: string): Promise<number>;
```

Returns the number of minutes elapsed since the worst loss price was recorded.

Measures how long ago the deepest drawdown point occurred.
Zero when called at the exact moment the trough was set.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
