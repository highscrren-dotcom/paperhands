---
title: docs/interface/IMCPPositionCloseCommand
group: docs
---

# IMCPPositionCloseCommand

Command payload for MCP.commitPositionClose.
Closes the pending position of a symbol enabled in live trading
for the schema's strategy.

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

Name of the registered MCP schema issuing the command

### note

```ts
note: string
```

Human-readable reason attached to the close commit
