---
title: docs/interface/ISweepParams
group: docs
---

# ISweepParams

Runtime parameters of a sweep client: the schema with defaults
resolved plus injected infrastructure dependencies.

## Properties

### logger

```ts
logger: ILogger
```

Logger instance for debug output.

### gridAxes

```ts
gridAxes: ISweepGridAxes
```

Grid axes with defaults applied (no longer optional).

### reportOrder

```ts
reportOrder: SweepRankingCriterion
```

Report order with the default applied (no longer optional).
