---
title: docs/class/MCPSchemaService
group: docs
---

# MCPSchemaService

Registry of MCP (Model Context Protocol) schemas.

Stores IMCPSchema records by MCP name with shallow validation on
registration. MCPUtils reads schemas from here when resolving the
target strategy and rendering agent messages.

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
fields only, no deep checks — getMessages and callbacks are
validated by their consumers. strategyName is optional (the
single registered strategy is resolved at use time) but must
be a string when present.

## Methods

### register

```ts
register(key: MCPName, value: IMCPSchema): void;
```

Registers an MCP (Model Context Protocol) schema under its name after shallow
validation. Registering the same key twice replaces the record.

### override

```ts
override(key: MCPName, value: Partial<IMCPSchema>): IMCPSchema;
```

Partially overrides a registered schema and returns the merged
record. Used by overrideMCPSchema-style public APIs.

### get

```ts
get(key: MCPName): IMCPSchema;
```

Returns the registered schema by MCP (Model Context Protocol) name.
