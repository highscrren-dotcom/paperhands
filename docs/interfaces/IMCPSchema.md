---
title: docs/interface/IMCPSchema
group: docs
---

# IMCPSchema

Registration schema of an MCP instance.

Binds an MCP name to a strategy: status and position commands operate on
every live instance of that strategy.
- mcpName — registry key; duplicate registration is a validation error.
- strategyName — the strategy whose live instances the MCP observes and trades.
- positionCost — entry cost in USD for commitPositionOpen; defaults to
  GLOBAL_CONFIG.CC_POSITION_ENTRY_COST when omitted.
- getMessages — renders the portfolio snapshot into agent messages; when
  omitted the default renderer emits one text message per symbol.
- callbacks — all optional; an omitted callback is simply never fired.

## Properties

### mcpName

```ts
mcpName: string
```

Unique MCP identifier for the schema registry

### strategyName

```ts
strategyName: string
```

Strategy whose live instances this MCP observes and trades

### positionCost

```ts
positionCost: number
```

Entry cost in USD for opened positions. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST

### getMessages

```ts
getMessages: (context: IMCPContext, when: Date, mcpName: string) => IMCPMessage[] | Promise<IMCPMessage[]>
```

Renders the portfolio snapshot into messages for the MCP agent (default: text per symbol)

### callbacks

```ts
callbacks: Partial<IMCPCallbacks>
```

Lifecycle callbacks (all optional)
