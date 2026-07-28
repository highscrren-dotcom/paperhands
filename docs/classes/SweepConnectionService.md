---
title: docs/class/SweepConnectionService
group: docs
---

# SweepConnectionService

Implements `TSweep$2`

Connection layer of the Sweep entity.

Owns the ClientSweep lifecycle: resolves the registered schema
by sweepName, applies grid axes defaults, injects the logger
and memoizes one client instance per sweep name. Public
methods accept flat DTOs and delegate to the memoized client.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### sweepSchemaService

```ts
sweepSchemaService: any
```

### getSweep

```ts
getSweep: ((sweepName: string) => ClientSweep) & IClearableMemoize<string> & IControlMemoize<string, ClientSweep>
```

Returns the ClientSweep for a sweep name, creating it on
first access. Memoized by sweep name — one client instance
per registered sweep; gridAxes fall back to
DEFAULT_GRID_AXES when the schema omits them.

### run

```ts
run: (dto: { symbol: string; sweepName: string; ideas: ISweepIdea[]; }) => Promise<ISweepResult>
```

Runs the full simulation for a symbol through the memoized
client: profiles -&gt; author filter -&gt; grid evaluation -&gt; rankings.

### clear

```ts
clear: (sweepName?: string) => void
```

Drops memoized client instances: a specific one by name or all
of them when called without arguments. The next getSweep
call re-reads the schema and builds a fresh client.
