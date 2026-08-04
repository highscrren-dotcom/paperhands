---
title: docs/type/MCPPermission
group: docs
---

# MCPPermission

```ts
type MCPPermission = "getStatus" | "getHistoryMessages" | "getNotificationMessages" | "commitPositionOpen" | "commitPositionClose" | "commitAverageBuy" | "commitSignalNotify";
```

Per-method access grant of an MCP (Model Context Protocol) instance.
Each permission name matches the MCP method it gates 1:1. A schema
without the permissions field grants ALL methods; listing permissions
explicitly narrows the agent to exactly those methods.
