---
title: docs/class/SweepCoreService
group: docs
---

# SweepCoreService

Implements `TSweep`

Core layer of the Sweep entity.

Validates the sweep reference (existence + exchange
dependency) and delegates to the connection layer. Sits between
the global entry point and the memoized ClientSweep instances
owned by SweepConnectionService.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### sweepConnectionService

```ts
sweepConnectionService: any
```

### sweepValidationService

```ts
sweepValidationService: any
```

### run

```ts
run: (dto: { symbol: string; sweepName: string; ideas: ISweepIdea[]; }) => Promise<ISweepResult>
```

Runs the full simulation for a symbol after validating the
sweep reference: profiles -&gt; author filter -&gt; grid
evaluation -&gt; rankings.
