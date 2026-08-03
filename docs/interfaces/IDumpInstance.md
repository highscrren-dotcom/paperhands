---
title: docs/interface/IDumpInstance
group: docs
---

# IDumpInstance

Interface for dump instance implementations.
Instances are scoped to (signalId, bucketName) via constructor.
Methods receive only the payload and dumpId.

## Methods

### dumpAgentAnswer

```ts
dumpAgentAnswer: (messages: MessageModel<MessageRole>[], dumpId: string, description: string) => Promise<void>
```

Persist the full message history of one agent invocation.

### dumpRecord

```ts
dumpRecord: (record: Record<string, unknown>, dumpId: string, description: string) => Promise<void>
```

Persist a flat key-value record.

### dumpTable

```ts
dumpTable: (rows: Record<string, unknown>[], dumpId: string, description: string) => Promise<void>
```

Persist an array of objects as a table.
Column headers are derived from the union of all keys across all rows.

### dumpText

```ts
dumpText: (content: string, dumpId: string, description: string) => Promise<void>
```

Persist a raw text or markdown string.

### dumpError

```ts
dumpError: (content: string, dumpId: string, description: string) => Promise<void>
```

Persist an error description.

### dumpJson

```ts
dumpJson: (json: object, dumpId: string, description: string) => Promise<void>
```

Persist an arbitrary nested object as a fenced JSON block.

### dumpMCPStatus

```ts
dumpMCPStatus: (messages: IMCPMessage[], dumpId: string, description: string) => Promise<void>
```

Persist an MCP (Model Context Protocol) status snapshot.

### dispose

```ts
dispose: () => void
```

Releases any resources held by this instance.
