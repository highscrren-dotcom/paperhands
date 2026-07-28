---
title: docs/interface/ISweepTrack
group: docs
---

# ISweepTrack

One author's TRACK under ONE grading rule (rule = the point's
hold x lock x stop x trailing, the four levels the single
profit-before-stop outcome depends on). The raw continuous
evidence — ideas, hits, hitRate — over the whole simulated range.
There is NO ban verdict and NO threshold: the engine grades, and
userspace decides who to trust (that is the whole point of cutting
the minAuthorTrack/minAuthorHitRate step — it turned a continuous
track into a 0/1 flag and lost information). One line per
(rule x author), self-contained for grep/jq.

## Properties

### holdMinutes

```ts
holdMinutes: number
```

Grading window of the rule — the point's holdMinutes. The track
depends on it: the same author has different hits in different
windows. On every track line so a grep by author shows the rule.

### profitLockPercent

```ts
profitLockPercent: number
```

Grading lock level of the rule, percent (0 = lock off, fixation is
the trailing arm alone). Part of the rule identity — the hit
depends on it — so it is on the line. NO thresholds: a track is
continuous trust, not a 0/1 flag.

### hardStopPercent

```ts
hardStopPercent: number
```

Grading STOP of the rule, percent. The hit depends on it — a MISS
is the hard stop firing before any fixation, so the same
(hold, lock, trailing, author) has DIFFERENT hits at different
stops. A full part of the rule identity and MUST be on the line,
else those rows are indistinguishable.

### trailingTakePercent

```ts
trailingTakePercent: number
```

Grading TRAILING take of the rule, percent. The hit depends on it
— the trailing arm level (entry/(1 - dir*r)) is one of the two
fixations raced against the hard stop, so the same
(hold, lock, stop, author) has DIFFERENT hits at different
trailing values. A full part of the rule identity and MUST be on
the line, else those rows are indistinguishable.

### author

```ts
author: string
```

Author login on the source platform.

### ideas

```ts
ideas: number
```

All the author's directional ideas — every idea counts. An idea
cut short by the candle data edge is NOT excluded: running out of
candles is a loss (a miss), exactly like the hold window timing
out.

### hits

```ts
hits: number
```

Number of the author's hits — ideas whose lock or trailing arm
fixation fired BEFORE the hard stop inside the rule's window. A
miss is the hard stop firing first, the window expiring, or the
candles running out before any fixation. The same author has
different hit counts under different rules.

### hitRate

```ts
hitRate: number
```

hits / ideas, 0..1; zero when the author has no known outcomes.
A derived convenience kept on the final product (one number per
track line, no duplication) so userspace filters by trust
directly (jq 'select(.hitRate &gt; 0.5)') instead of the engine
baking a threshold into a banned flag.
