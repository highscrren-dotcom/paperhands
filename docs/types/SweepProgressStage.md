---
title: docs/type/SweepProgressStage
group: docs
---

# SweepProgressStage

```ts
type SweepProgressStage = "profiles" | "grid";
```

Long-running stage of a simulation run reported by onProgress:
"profiles" — one candle pass per idea (dominated by candle IO),
"grid" — arithmetic evaluation of grid points.
