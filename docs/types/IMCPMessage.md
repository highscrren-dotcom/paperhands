---
title: docs/type/IMCPMessage
group: docs
---

# IMCPMessage

```ts
type IMCPMessage = IMCPTextMessage | IMCPImageMessage;
```

Message emitted to the MCP (Model Context Protocol) agent by getMessages.
Discriminated union of text and image messages.
