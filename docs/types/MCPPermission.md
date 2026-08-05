---
title: docs/type/MCPPermission
group: docs
---

# MCPPermission

```ts
type MCPPermission = "getStatus" | "commitPositionOpen" | "commitPositionClose" | "commitAverageBuy" | "commitSignalNotify";
```

Per-method access grant of an MCP (Model Context Protocol) instance.
Each permission name matches the agent-facing MCP method it gates 1:1.
A schema without the permissions field grants ALL of them; listing
permissions explicitly narrows the agent to exactly those methods.
Composition helpers the user calls from getMessages
(getDefaultMessages, getHistoryMessages, getNotificationMessages) are
not gated — they only reshape data the caller already holds, and reach
the agent through getStatus, which carries its own permission.
