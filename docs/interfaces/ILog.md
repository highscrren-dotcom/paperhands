---
title: docs/interface/ILog
group: docs
---

# ILog

Extended logger interface with log history access.
Combines the framework severity levels ({@link ILogger}) with the AI agent channel ({@link IAgentLogger}).

## Methods

### getList

```ts
getList: () => Promise<ILogEntry[]>
```

Returns all stored log entries.
