---
title: docs/function/getPositionHighestProfitBreakeven
group: docs
---

# getPositionHighestProfitBreakeven

```ts
declare function getPositionHighestProfitBreakeven(symbol: string): Promise<boolean>;
```

Returns whether breakeven was mathematically reachable at the highest profit price.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
