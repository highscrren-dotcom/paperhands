---
title: docs/interface/IMCPSignalNotifyCommand
group: docs
---

# IMCPSignalNotifyCommand

Command payload for MCP.commitSignalNotify (MCP — Model Context Protocol).
Emits a `signal.info` notification for the active pending position of a
symbol enabled in live trading for the schema's strategy. The engine
resolves the pending signal id by symbol.

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

### note

```ts
note: string
```

Human-readable note attached to the notification
