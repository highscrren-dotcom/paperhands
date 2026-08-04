---
title: docs/interface/IMCPPositionOpenCommand
group: docs
---

# IMCPPositionOpenCommand

Command payload for MCP.commitPositionOpen (MCP — Model Context Protocol).
Opens a moonbag position (fixed 50% TP, grid-snapped hard SL) for a symbol
enabled in live trading for the schema's strategy.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### mcpName

```ts
mcpName: string
```

Name of the registered MCP (Model Context Protocol) schema issuing the command

### note

```ts
note: string
```

Human-readable reason attached to the created signal
