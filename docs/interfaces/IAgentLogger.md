---
title: docs/interface/IAgentLogger
group: docs
---

# IAgentLogger

Interface representing the AI agent logging channel.
Kept separate from {@link ILogger} on purpose: `ILogger` is the framework's internal diagnostics sink wired through `setLogger`, whose four severity levels describe the health of the framework itself.
Agent output is a different concern — it records what a model did (reasoning steps, tool calls, completions), not how the framework is behaving, and it is addressed to the user reading the log history rather than to whoever is debugging the engine.
Splitting the interface also keeps `ILogger` implementations supplied by users source-compatible: adding agent logging to the log history never widens the contract they implement.

## Methods

### agent

```ts
agent: (topic: string, ...args: any[]) => void
```

Logs an AI agent message.
Used to record model-driven activity — reasoning, tool invocations, and completions — so it stays distinguishable from framework diagnostics when reviewing the log history.
