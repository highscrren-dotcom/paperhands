---
title: docs/function/addMCPSchema
group: docs
---

# addMCPSchema

```ts
declare function addMCPSchema(mcpSchema: IMCPSchema): void;
```

Registers an MCP instance in the framework — the bridge exposing
live trading of a strategy to an MCP agent (see MCP.getStatus).

The MCP binds to a strategy: status snapshots and position commands
operate on every live instance of that strategy. getMessages renders
the portfolio for the agent; when omitted the default renderer emits
one text message per traded symbol.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `mcpSchema` | MCP configuration object |
