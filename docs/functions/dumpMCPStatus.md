---
title: docs/function/dumpMCPStatus
group: docs
---

# dumpMCPStatus

```ts
declare function dumpMCPStatus(dto: {
    bucketName: string;
    dumpId: string;
    messages: IMCPMessage[];
    description: string;
}): Promise<void>;
```

Dumps an MCP (Model Context Protocol) status snapshot scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

With the default markdown backend, image messages are decoded from base64
and written to ./dump/image/{message.id}.png; the whole message list is
rendered into a single ./dump/mcp/{dumpId}.md - text messages inlined
in order, images embedded via ![{id}](../image/{id}.png) relative links.
The snapshot follows the swappable Dump backend: useDummy() silences it,
useMemory() keeps a searchable text-only projection.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
