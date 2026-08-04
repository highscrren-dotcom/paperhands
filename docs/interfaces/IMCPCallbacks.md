---
title: docs/interface/IMCPCallbacks
group: docs
---

# IMCPCallbacks

Lifecycle callbacks of an MCP (Model Context Protocol) instance (all optional).

Fire AFTER the corresponding engine effect succeeds, with the raw data
the effect was built from — a test registers them to observe what the
MCP actually did (rendered snapshot, submitted signal, consumed pending
id) without mocking the live machinery. An omitted callback is simply
never fired; a callback that throws is logged and does not fail the
operation.

## Methods

### onStatus

```ts
onStatus: (mcpName: string, context: IMCPContext, messages: IMCPMessage[]) => void
```

Fired after getStatus renders the portfolio: the snapshot the
renderer received and the messages it produced.

### onPositionOpen

```ts
onPositionOpen: (symbol: string, signal: ISignalDto, dto: IMCPPositionOpenCommand) => void
```

Fired after a position open commit is accepted: the exact signal DTO
submitted to the live strategy (moonbag TP/SL levels, cost, note).

### onPositionClose

```ts
onPositionClose: (symbol: string, signalId: string, dto: IMCPPositionCloseCommand) => void
```

Fired after a close commit is accepted: the id of the pending signal
the close was queued for.

### onAverageBuy

```ts
onAverageBuy: (symbol: string, signalId: string, dto: IMCPAverageBuyCommand) => void
```

Fired after a DCA entry commit is accepted: the id of the pending
signal the entry was averaged into.

### onSignalNotify

```ts
onSignalNotify: (symbol: string, signalId: string, dto: IMCPSignalNotifyCommand) => void
```

Fired after a signal notification is emitted: the id of the pending
signal the note was attached to.
