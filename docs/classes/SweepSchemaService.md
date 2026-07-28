---
title: docs/class/SweepSchemaService
group: docs
---

# SweepSchemaService

Registry of sweep schemas.

Stores ISweepSchema records by sweep name with shallow
validation on registration. The connection service reads schemas
from here when building ClientSweep instances.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### _registry

```ts
_registry: any
```

### validateShallow

```ts
validateShallow: any
```

Shallow structural validation of a schema: required string
fields only, no deep checks — grid axes and callbacks are
validated by their consumers.

## Methods

### register

```ts
register(key: SweepName, value: ISweepSchema): void;
```

Registers a sweep schema under its name after shallow
validation. Registering the same key twice replaces the record.

### override

```ts
override(key: SweepName, value: Partial<ISweepSchema>): ISweepSchema;
```

Partially overrides a registered schema and returns the merged
record. Used by overrideSweepSchema-style public APIs.

### get

```ts
get(key: SweepName): ISweepSchema;
```

Returns the registered schema by sweep name.
