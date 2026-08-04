---
title: docs/interface/IMCPAverageBuyCommand
group: docs
---

# IMCPAverageBuyCommand

Command payload for MCP.commitAverageBuy (MCP — Model Context Protocol).
Adds a DCA entry at the current market price to the active pending position
of a symbol enabled in live trading for the schema's strategy. The engine
resolves the pending signal id by symbol; the entry cost comes from the
schema's positionCost.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### mcpName

```ts
mcpName: string
```

Name of the registered MCP (Model Context Protocol) schema issuing the command
