---
title: docs/function/getPositionMaxDrawdownTimestamp
group: docs
---

# getPositionMaxDrawdownTimestamp

```ts
declare function getPositionMaxDrawdownTimestamp(symbol: string): Promise<number>;
```

Returns the timestamp when the worst loss price was recorded during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
