---
title: docs/function/overrideMCPSchema
group: docs
---

# overrideMCPSchema

```ts
declare function overrideMCPSchema(mcpSchema: TMCPSchema): Promise<IMCPSchema>;
```

Overrides an existing MCP configuration in the framework.

This function partially updates a previously registered MCP with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `mcpSchema` | Partial MCP configuration object |
