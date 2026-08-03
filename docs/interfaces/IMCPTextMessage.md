---
title: docs/interface/IMCPTextMessage
group: docs
---

# IMCPTextMessage

Plain text message for the MCP (Model Context Protocol) agent.

## Properties

### id

```ts
id: MCPMessageId
```

Unique identifier for the message (used to track delivery and deduplication)

### type

```ts
type: "text"
```

Discriminator for type-safe union

### text

```ts
text: string
```

Human-readable message text
