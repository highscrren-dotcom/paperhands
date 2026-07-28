---
title: docs/class/SweepGlobalService
group: docs
---

# SweepGlobalService

Implements `TSweep$1`

Global entry point of the Sweep entity.

The outermost service layer the public API talks to: validates the
referenced sweep (existence + exchange dependency) and
delegates to the connection layer, which owns the memoized
ClientSweep instances.

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
