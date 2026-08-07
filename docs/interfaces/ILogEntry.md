---
title: docs/interface/ILogEntry
group: docs
---

# ILogEntry

Single log entry stored in the log history.

## Properties

### id

```ts
id: string
```

Unique entry identifier generated via randomString

### type

```ts
type: "log" | "debug" | "info" | "warn" | "agent"
```

Log level

### priority

```ts
priority: number
```

Current Unix timestamp in milliseconds for storage rotate

### createdAt

```ts
createdAt: string
```

Date taken from backtest context to improve user experience

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds taken from backtest context to improve user experience

### methodContext

```ts
methodContext: IMethodContext
```

Optional method context associated with the log entry, providing additional details about the execution environment or state when the log was recorded

### executionContext

```ts
executionContext: IExecutionContext
```

Optional execution context associated with the log entry, providing additional details about the execution environment or state when the log was recorded

### topic

```ts
topic: string
```

Log topic / method name

### args

```ts
args: unknown[]
```

Additional arguments passed to the log call
