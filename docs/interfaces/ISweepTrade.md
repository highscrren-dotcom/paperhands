---
title: docs/interface/ISweepTrade
group: docs
---

# ISweepTrade

## Properties

### ideaId

```ts
ideaId: number
```

Identifier of the idea that triggered the trade.

### symbol

```ts
symbol: string
```

Trading pair of the trade — carried on the trade itself so a
multi-symbol dump (score over many tickers concatenates
per-symbol runs) stays grep-distinguishable: trades of different
symbols never blur into one another.

### author

```ts
author: string
```

Author of the triggering idea — carried on the trade itself so
per-author analysis (score, voting, top performers) reads
straight off the artifact, without joining ideaId back to the
ideas feed. The whole strategy is about authors; the trade
names its own.

### direction

```ts
direction: SweepIdeaDirection
```

Position direction inherited from the idea.

### entryTimestamp

```ts
entryTimestamp: number
```

Unix timestamp in milliseconds of the trade entry minute.

### exitTimestamp

```ts
exitTimestamp: number
```

Unix timestamp in milliseconds of the exit candle.

### exitReason

```ts
exitReason: SweepExitReason
```

Why the trade was closed.

### holdMinutesActual

```ts
holdMinutesActual: number
```

Actual holding time, minutes (entry candle inclusive).

### pnlPercent

```ts
pnlPercent: number
```

Trade PnL percent, net of fees on both legs.

### absorbedIdeas

```ts
absorbedIdeas: ISweepAbsorbedIdea[]
```

Ideas that qualified for entry but were ABSORBED by this trade
holding the slot — each {ideaId, author}, so which author's
signals a long hold ate is visible idea by idea, no feed join.
