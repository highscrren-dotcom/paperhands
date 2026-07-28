---
title: docs/class/SweepValidationService
group: docs
---

# SweepValidationService

Existence and dependency validation of sweeps.

Tracks every registered sweep and verifies at use time that a
referenced sweep exists and its exchange dependency is valid.
Registration here is uniqueness-guarded, unlike the schema
registry where re-registering replaces the record.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### _sweepMap

```ts
_sweepMap: any
```

### addSweep

```ts
addSweep: (sweepName: string, sweepSchema: ISweepSchema) => void
```

Tracks a sweep for validation. Called on schema
registration; duplicate names are rejected.

### validate

```ts
validate: (sweepName: string, source: string) => void
```

Validates that a sweep is registered and its exchange
dependency passes validation. Memoized by sweep name — the
check runs once per name, later calls are no-ops.

### list

```ts
list: () => Promise<ISweepSchema[]>
```

Lists every tracked sweep schema.
