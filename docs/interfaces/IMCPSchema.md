---
title: docs/interface/IMCPSchema
group: docs
---

# IMCPSchema

Registration schema of an MCP (Model Context Protocol) instance.

Binds an MCP name to a strategy: status and position commands operate on
every live instance of that strategy.
- mcpName — registry key; duplicate registration is a validation error.
- strategyName — the strategy whose live instances the MCP observes and
  trades. Optional: when omitted, the SINGLE registered strategy is used;
  with two or more strategies registered every MCP call throws until the
  schema names one explicitly — ambiguity is an error, not a guess.
- positionCost — entry cost in USD for commitPositionOpen; defaults to
  GLOBAL_CONFIG.CC_POSITION_ENTRY_COST when omitted.
- permissions — access levels granted to the agent; defaults to BOTH
  "read" and "write" when omitted. Without "read" status/history throw,
  without "write" open/close throw — the check runs per call, so an
  overridden schema applies immediately.
- getMessages — renders the portfolio snapshot into agent messages; when
  omitted the default renderer emits one text message per symbol.
- callbacks — all optional; an omitted callback is simply never fired.

## Properties

### mcpName

```ts
mcpName: string
```

Unique MCP (Model Context Protocol) identifier for the schema registry

### strategyName

```ts
strategyName: string
```

Strategy whose live instances this MCP observes and trades. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it

### positionCost

```ts
positionCost: number
```

Entry cost in USD for opened positions. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

Estimated time in minutes for a position to reach its TP or SL.

### permissions

```ts
permissions: MCPPermission[]
```

Access levels granted to the agent: "read" gates status/history, "write" gates open/close. Default: both

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
