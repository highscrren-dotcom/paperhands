---
title: docs/interface/ISweepGridAxes
group: docs
---

# ISweepGridAxes

Value lists per grid axis. The grid is the cartesian product of
all axes; the trading rule (stop, trailing, hold, lock) is searched,
not hardcoded.

Every field below states what it TUNES and under which conditions
it is IGNORED — no axis is allowed to be a silent no-op without
that being documented here.

## Properties

### hardStopPercent

```ts
hardStopPercent: number[]
```

Hard stop levels to sweep, percent from entry.
Tunes: the catastrophe exit — how deep a position may sink
before a forced loss; the stop WINS when the stop and any profit
floor are reachable inside one candle (pessimism contract). Also
the loss side of the profit-before-stop grading: an author's idea
is a MISS when this stop fires before any fixation (see
ISweepGradingRule).
Ignored: never — every trade checks it and it is part of the
grading rule for every point.

### trailingTakePercent

```ts
trailingTakePercent: number[]
```

Trailing take pullback levels to sweep, percent from the peak.
Tunes: how much of a runner's peak is given back. Arms only from
PREVIOUS-candle peaks and only when the locked level is not
worse than entry (peak &gt;= entry/(1 - r)). Its arm level is also
one of the two fixations the profit-before-stop grading races
against the hard stop.
Ignored: inert for any trade whose peak never reaches the arm
level — such trades exit by stop, lock, or the hold cap. A value
of 0 or &gt;= 100 makes the arm unreachable, so the trailing arm
never counts as a fixation for that point (grading then relies on
the lock alone, if lock &gt; 0).

### holdMinutes

```ts
holdMinutes: number[]
```

Maximum position hold durations to sweep, minutes.
Tunes: slot turnover — one open position PER AUTHOR, and an
author's busy slot ABSORBS his own qualified ideas (per-trade
absorbedIdeas), so longer holds trade less often; the cap is the
worst-case exit (time_expired) when neither stop nor floor fires.
Authors never collide — each trades his own slot.
Ignored: never — the hold serves BOTH layers: it caps the trade
AND is the grading window of the point's rule (the
profit-before-stop outcome is computed inside the first
holdMinutes of the idea's trajectory — the window the point
actually trades). This axis's
MAXIMUM additionally defines the candle fetch depth of every
idea profile (the schema owns the horizon, the engine has no
hidden constant).

### profitLockPercent

```ts
profitLockPercent: number[]
```

Profit lock levels to sweep, percent from entry. When price
TOUCHES +X% a fixed floor arms at that level and the trade exits
only on a PULLBACK to the floor — unlike a plain fixed take, a
runner keeps running and is later handled by the trailing take
(whose floor rises above the lock once the peak clears it).
Covers the zone where the trailing take is not armed yet (peak
below entry/(1 - r)) and profit would otherwise bleed back.
Tunes: harvesting the crowd-liquidity step without cutting
runners. Also part of the grading rule (the fixation the hit is
checked against), so it appears in tracks[]. lock = 0 is VALID:
the mechanism is off for trading and fixation then means the
trailing arm alone — a hit is the trailing arming before the
hard stop.
