---
title: docs/interface/ISweepSchema
group: docs
---

# ISweepSchema

Registration schema of a sweep instance.

Field-by-field contract — what each parameter allows to tune and
when it is ignored:
- sweepName — registry key; duplicate registration is a
  validation error.
- exchangeName — candle source for idea profiles. The Exchange
  contract is strict (exactly `limit` candles or throw): end of
  history surfaces as an exception and becomes a truncated
  profile — truncated ideas are traded to the data edge but are
  IGNORED as track evidence (their outcome is not fully observed).
- gridAxes — PER-AXIS override merged over the engine defaults:
  an omitted axis takes the default LIST and is therefore swept;
  a single-value list freezes an axis. Pinning example:
  profitLockPercent: [0] disables the lock (fixation is then the
  trailing arm alone). Each axis documents its own tune/ignore
  conditions in ISweepGridAxes.
- callbacks — all optional; an omitted callback is simply never
  fired (silent run). onAuthorsTrained fires once per unique
  grading RULE (hold x lock x stop x trailing), not per grid point.

## Properties

### sweepName

```ts
sweepName: string
```

Unique sweep identifier for the schema registry.

### exchangeName

```ts
exchangeName: string
```

Exchange schema to fetch candles through.

### gridAxes

```ts
gridAxes: Partial<ISweepGridAxes>
```

Grid axes override, merged per-axis over the defaults at params
creation — a schema may override only the axes it cares about.

### reportOrder

```ts
reportOrder: SweepRankingCriterion
```

Ranking criterion ordering the reports list (descending). The
return value of run() is the consumer
contract — callbacks are a side channel — so the order is
declared here, not derived. Sorting uses the tie-guarded
comparator (naive subtraction breaks on Infinity
sortino/recovery of loss-free series). Default: "sharpe".
Does not affect best[] or tracks in any way.

### callbacks

```ts
callbacks: Partial<ISweepCallbacks>
```

Lifecycle callbacks (all optional).
