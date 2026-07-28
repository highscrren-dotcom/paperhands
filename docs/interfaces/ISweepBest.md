---
title: docs/interface/ISweepBest
group: docs
---

# ISweepBest

Winner of one ranking criterion — just the criterion and the
winning point's report. Everything else lives on the report and is
never duplicated here: the trades in `report.tradesList`; the
author track lives deduplicated in the bucket's tracks[].

## Properties

### criterion

```ts
criterion: SweepRankingCriterion
```

The ranking criterion this winner belongs to.

### report

```ts
report: ISweepPointReport
```

Winning point report; null when the bucket produced no reports.
