---
title: docs/function/getPositionCountdownMinutes
group: docs
---

# getPositionCountdownMinutes

```ts
declare function getPositionCountdownMinutes(symbol: string): Promise<number>;
```

Returns the remaining time before the position expires, clamped to zero.

Computes elapsed minutes since `pendingAt` and subtracts from `minuteEstimatedTime`.
Returns 0 once the estimate is exceeded (never negative).

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
