---
title: docs/class/MCPUtils
group: docs
---

# MCPUtils

Utility class exposing live trading to an MCP agent.

Provides static-like methods (via singleton instance) to observe every
live instance of the schema's strategy and to open/close positions on
the agent's command.

Features:
- Portfolio status rendered as human-readable agent messages
- Manual position open (moonbag levels, grid-snapped hard stop)
- Manual close of the pending position

Every method validates the full MCP -&gt; strategy -&gt; risk/action chain
before touching the live state.

## Constructor

```ts
constructor();
```

## Properties

### getDefaultMessages

```ts
getDefaultMessages: (context: IMCPContext, when: Date, mcpName: string) => IMCPMessage[]
```

Renders a portfolio snapshot with the DEFAULT text renderer, regardless
of the schema's getMessages.

Emits one header message with the snapshot time plus one text message per
traded symbol: capital balance, the queued entry order, the active
position with its unrealized PnL and the queued close order.

The signature matches IMCPSchema.getMessages, so a custom renderer can
delegate here and extend the default output instead of rebuilding it.

### getStatus

```ts
getStatus: (mcpName: string) => Promise<IMCPMessage[]>
```

Renders the current portfolio of the MCP's strategy into agent messages.

Builds a per-symbol snapshot (current price, queued entry, active
position with PnL, queued close) over every live instance of the bound
strategy and passes it to the schema's getMessages (or the default
text renderer). Fires the schema's onStatus callback with the snapshot
and the rendered messages.

### commitPositionOpen

```ts
commitPositionOpen: (dto: IMCPPositionOpenCommand) => Promise<void>
```

Opens a position for a symbol on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have no pending signal. Levels are moonbag: fixed 50% take profit,
hard stop-loss snapped one notch below CC_MAX_STOPLOSS_DISTANCE_PERCENT;
entry cost comes from the schema's positionCost.

### commitPositionClose

```ts
commitPositionClose: (dto: IMCPPositionCloseCommand) => Promise<void>
```

Closes the pending position of a symbol on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have a pending signal; its id is consumed by the close commit.
