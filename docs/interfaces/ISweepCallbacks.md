---
title: docs/interface/ISweepCallbacks
group: docs
---

# ISweepCallbacks

Lifecycle callbacks of a simulation run. Every progress point the
reference Sweep script printed to console is exposed here instead.

## Methods

### onProgress

```ts
onProgress: (symbol: string, stage: SweepProgressStage, processed: number, total: number) => void
```

Progress of a long-running stage: fires after every processed
item — idea (stage "profiles") or grid point (stage "grid").
processed grows from 1 to total within a stage.

### onIdeas

```ts
onIdeas: (symbol: string, ideasTotal: number, ideasDirectional: number) => void
```

Ideas received: total vs directional (NEUTRAL excluded).

### onProfiles

```ts
onProfiles: (symbol: string, profiles: ISweepIdeaProfile[], truncatedCount: number) => void
```

All idea profiles built (one candle pass per idea).
truncatedCount — profiles cut short by end of candle data.

### onAuthorsTrained

```ts
onAuthorsTrained: (symbol: string, tracks: ISweepTrack[]) => void
```

Author track trained for one grading rule of the grid (fires
once per unique grading rule = hold x lock x stop x trailing):
the raw per-author track (ideas/hits/hitRate) under that rule. No
ban verdict — the engine grades, userspace decides who to trust.

### onGridPoint

```ts
onGridPoint: (symbol: string, report: ISweepPointReport, trades: ISweepTrade[]) => void
```

One grid point evaluated.

### onRanking

```ts
onRanking: (symbol: string, criterion: SweepRankingCriterion, sorted: ISweepPointReport[], best: ISweepBest) => void
```

Ranking computed over the single report bucket: the reports
sorted by the criterion (descending) and the winner. Fires once
per criterion.

### onDone

```ts
onDone: (symbol: string, result: ISweepResult) => void
```

Simulation finished.
