---
title: docs/type/TMCPSchema
group: docs
---

# TMCPSchema

```ts
type TMCPSchema = {
    mcpName: IMCPSchema["mcpName"];
} & Partial<IMCPSchema>;
```

Partial MCP (Model Context Protocol) schema for override operations.

Requires only the MCP name identifier, all other fields are optional.
Used by overrideMCPSchema() to perform partial updates without replacing entire configuration.
