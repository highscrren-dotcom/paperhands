---
title: docs/function/getPositionMaxDrawdownPrice
group: docs
---

# getPositionMaxDrawdownPrice

```ts
declare function getPositionMaxDrawdownPrice(symbol: string): Promise<number>;
```

Returns the worst price reached in the loss direction during this position's life.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
