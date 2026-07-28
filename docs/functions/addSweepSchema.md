---
title: docs/function/addSweepSchema
group: docs
---

# addSweepSchema

```ts
declare function addSweepSchema(sweepSchema: ISweepSchema): void;
```

Registers a sweep in the framework — a parameter sweep engine
over crowd trading ideas (see Sweep.run).

The sweep profiles every idea with one candle pass through the
referenced exchange, trains the author whitelist/ban list on the
simulated range and evaluates the grid of exit/entry parameters
arithmetically from the profiles. Grid axes are optional — bounded
defaults apply when omitted.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `sweepSchema` | Sweep configuration object |
