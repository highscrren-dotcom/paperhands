---
title: docs/interface/ISweepMetricReport
group: docs
---

# ISweepMetricReport

The single report bucket of a run: every grid point graded by the
one profit-before-stop metric, its ranking winners, and its author
TRACKS. One bucket — there is no per-metric split.

## Properties

### reports

```ts
reports: ISweepPointReport[]
```

Grid point reports, sorted descending by the schema's reportOrder
criterion (default sharpe).

### best

```ts
best: ISweepBest[]
```

Winners of the four ranking criteria. Empty only when the grid
produced no reports.

### tracks

```ts
tracks: ISweepTrack[]
```

Author tracks — one line per (rule x author), deduplicated by
grading rule (hold x lock x stop x trailing). This is the RAW
continuous track (ideas/hits/hitRate), not a 0/1 ban verdict: the
engine grades, userspace decides who to trust. Far more compact
than repeating the track on every point's report, and every line
is self-contained (carries hold/lock/stop/trailing/author) for grep/jq
without a join.
