---
title: docs/interface/ISweepResult
group: docs
---

# ISweepResult

Final result of a simulation run: one report bucket (the single
profit-before-stop grading) with its reports, ranking winners and
author tracks, plus the run-level idea/profile/hold counters.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol the simulation ran for.

### ideasTotal

```ts
ideasTotal: number
```

Total ideas of the symbol received (including NEUTRAL).

### ideasDirectional

```ts
ideasDirectional: number
```

Directional ideas simulated (NEUTRAL and flood duplicates excluded).

### profileCount

```ts
profileCount: number
```

Number of idea profiles built (ideas with candle data).

### truncatedCount

```ts
truncatedCount: number
```

Profiles cut short by end of candle data.

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time across all trades of every grid point, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time across the whole grid, minutes.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result.

### reports

```ts
reports: ISweepMetricReport
```

The single report bucket: every grid point graded by the one
profit-before-stop metric. Carries the point reports (sorted by
reportOrder), the ranking winners in best[], and the per-author
tracks[].
