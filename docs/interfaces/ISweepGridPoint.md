---
title: docs/interface/ISweepGridPoint
group: docs
---

# ISweepGridPoint

Single point of the grid (scalar per axis).

## Properties

### hardStopPercent

```ts
hardStopPercent: number
```

Hard stop level, percent from entry.

### trailingTakePercent

```ts
trailingTakePercent: number
```

Trailing take pullback, percent from the running peak.

### holdMinutes

```ts
holdMinutes: number
```

Maximum position hold duration, minutes.

### profitLockPercent

```ts
profitLockPercent: number
```

Profit lock: fixed floor armed when price touches +X% from
entry, exit on pullback to the floor; 0 = disabled.
