---
title: docs/function/getPositionEstimateMinutes
group: docs
---

# getPositionEstimateMinutes

```ts
declare function getPositionEstimateMinutes(symbol: string): Promise<number>;
```

Returns the original estimated duration for the current pending signal.

Reflects `minuteEstimatedTime` as set in the signal DTO — the maximum
number of minutes the position is expected to be active before `time_expired`.

Throws if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
