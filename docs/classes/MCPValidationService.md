---
title: docs/class/MCPValidationService
group: docs
---

# MCPValidationService

Existence and dependency validation of MCP instances.

Tracks every registered MCP and verifies at use time that a
referenced MCP exists and its strategy dependency is valid.
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

### strategyValidationService

```ts
strategyValidationService: any
```

### _mcpMap

```ts
_mcpMap: any
```

### addMCP

```ts
addMCP: (mcpName: string, mcpSchema: IMCPSchema) => void
```

Tracks an MCP for validation. Called on schema
registration; duplicate names are rejected.

### validate

```ts
validate: (mcpName: string, source: string) => void
```

Validates that an MCP is registered and its strategy
dependency passes validation. Memoized by MCP name — the
check runs once per name, later calls are no-ops.

### list

```ts
list: () => Promise<IMCPSchema[]>
```

Lists every tracked MCP schema.
