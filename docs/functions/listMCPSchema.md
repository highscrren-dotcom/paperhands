---
title: docs/function/listMCPSchema
group: docs
---

# listMCPSchema

```ts
declare function listMCPSchema(): Promise<IMCPSchema[]>;
```

Returns a list of all registered MCP (Model Context Protocol) schemas.

Retrieves all MCP instances that have been registered via addMCPSchema().
Useful for debugging, documentation, or building dynamic UIs.
