---
title: docs/class/MCPUtils
group: docs
---

# MCPUtils

Utility class exposing live trading to an MCP (Model Context Protocol) agent.

Provides static-like methods (via singleton instance) to observe every
live instance of the schema's strategy and to open/close positions on
the agent's command.

Features:
- Portfolio status rendered as human-readable agent messages
- Manual position open (moonbag levels, grid-snapped hard stop)
- Manual close of the pending position

Every method validates the full MCP -&gt; strategy -&gt; risk/action chain
before touching the live state.

## Constructor

```ts
constructor();
```

## Properties

### getDefaultMessages

```ts
getDefaultMessages: (context: IMCPContext, when: Date, mcpName: string) => Promise<IMCPMessage[]>
```

Renders a portfolio snapshot with the DEFAULT text renderer, regardless
of the schema's getMessages.

Emits one header message — snapshot time plus the portfolio summary
(open position count, total invested, total and per-position dollar
PnL) — plus one text message per traded symbol: prices, PnL/peak/
drawdown percents with timing, DCA entries, capital balance and the
entry/position/close slots.

The signature matches IMCPSchema.getMessages (async variant), so a
custom renderer can await this method and extend the default output
instead of rebuilding it.

### getHistoryMessages

```ts
getHistoryMessages: (mcpName: string) => Promise<IMCPMessage[]>
```

Renders the trade history of the MCP (Model Context Protocol)
instance's strategy into agent messages:
the last {@link MAX_HISTORY_ROWS } CLOSED positions from the live signal
storage, newest first — dollar/percent result, direction, close reason,
open/close times and the opening note per trade.

Complements getStatus for stateless agents: the status shows what is
open, the history shows what was already traded and how it ended, so
the agent does not re-enter the same idea right after closing it.

### getNotificationMessages

```ts
getNotificationMessages: (context: IMCPContext, when: Date, mcpName: string) => Promise<IMCPMessage[]>
```

Renders the `signal.info` notifications of the active positions of the
MCP (Model Context Protocol) instance's strategy into agent messages:
reads the pending signal id of every symbol from the portfolio snapshot
the caller already holds — no extra exchange or live state requests —
and keeps only the notifications emitted via commitSignalNotify for
those signal ids, newest first (at most {@link MAX_HISTORY_ROWS }) —
note, market price and unrealized PnL at the moment of the event and
the emit time per notification.

Complements getStatus: the status shows what is open, this method shows
what the agent (or the strategy) annotated on the open positions, so a
stateless agent can pick up its own prior reasoning about the exact
position it is holding. Notifications of already-closed positions are
filtered out automatically — their signal ids no longer match any
pending signal in the snapshot.

The signature matches IMCPSchema.getMessages (async variant), so a
custom renderer can await this method and append the notifications to
the default output without re-fetching anything.

Rows accumulate only while a NotificationLive backend is enabled.

### getStatus

```ts
getStatus: (mcpName: string) => Promise<IMCPMessage[]>
```

Renders the current portfolio of the MCP (Model Context Protocol)
instance's strategy into agent messages.

Builds a per-symbol snapshot (current price, queued entry, active
position with PnL, queued close) over every live instance of the bound
strategy and passes it to the schema's getMessages (or the default
text renderer). Fires the schema's onStatus callback with the snapshot
and the rendered messages.

Requires the "getStatus" permission on the schema.

### commitPositionOpen

```ts
commitPositionOpen: (dto: IMCPPositionOpenCommand) => Promise<void>
```

Opens a position for a symbol on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have no pending signal. Levels are moonbag: fixed 50% take profit,
hard stop-loss snapped one notch below CC_MAX_STOPLOSS_DISTANCE_PERCENT;
entry cost comes from the schema's positionCost.

### commitPositionClose

```ts
commitPositionClose: (dto: IMCPPositionCloseCommand) => Promise<void>
```

Closes the pending position of a symbol on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have a pending signal; its id is consumed by the close commit.

### commitAverageBuy

```ts
commitAverageBuy: (dto: IMCPAverageBuyCommand) => Promise<boolean>
```

Adds a DCA entry to the pending position of a symbol on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have a pending signal — its id is resolved by symbol from the live
strategy state, no method context is required. The entry executes at the
current market price with the cost from the schema's positionCost.

### commitSignalNotify

```ts
commitSignalNotify: (dto: IMCPSignalNotifyCommand) => Promise<void>
```

Emits a `signal.info` notification for the pending position of a symbol
on the agent's command.

The symbol must be enabled in live trading for the schema's strategy and
must have a pending signal — its id is resolved by symbol from the live
strategy state, no method context is required. The notification lands in
the live notification storage and is later readable via
getNotificationMessages.
