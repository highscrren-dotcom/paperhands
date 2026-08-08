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
getHistoryMessages: (when: Date, mcpName: string, limit?: number) => Promise<IMCPMessage[]>
```

Renders the trade history of the MCP (Model Context Protocol)
instance's strategy into agent messages:
the CLOSED positions from the live signal
storage, newest first — dollar/percent result, direction, close reason,
open/close times and the opening note per trade.

Complements getStatus for stateless agents: the status shows what is
open, the history shows what was already traded and how it ended, so
the agent does not re-enter the same idea right after closing it.

Depth defaults to {@link DEFAULT_HISTORY_LIMIT }; the newest trades are
the ones kept when `limit` cuts the feed.

### getAgentMessages

```ts
getAgentMessages: (when: Date, mcpName: string, limit?: number) => Promise<IMCPMessage[]>
```

Renders the messages the STRATEGY CODE addressed to the agent into agent
messages: the `agent`-level entries of the log history written via
`Log.agent(...)` under the MCP (Model Context Protocol) instance's
strategy in LIVE mode, newest first — symbol, emit time and the message
text per entry.

This is the strategy talking to the agent, the reverse direction of every
other renderer: getStatus reports numbers, getNotificationMessages
replays the agent's own notes, and this channel carries directives the
strategy raised on its own — a position stagnating for an hour, collapsed
volatility, an approaching session close. The agent reads them as
instructions from the trading system.

Backtest entries and entries of other strategies are filtered out; rows
accumulate only while a Log adapter is enabled. Depth defaults to
{@link DEFAULT_AGENT_LIMIT }; the newest directives are the ones kept when
`limit` cuts the feed.

### getNotificationMessages

```ts
getNotificationMessages: (when: Date, mcpName: string, limit?: number) => Promise<IMCPMessage[]>
```

Renders the DESCRIBED trading events of the MCP (Model Context Protocol)
instance's strategy into agent messages: position opens, position closes
and mid-position notes that carry a description, newest first — symbol,
direction, signal id, the prices and PnL of the moment, and the reasoning
itself.

Events without a description are dropped. This is the anti-whipsaw half
of the agent's memory: a bare "opened LONG / closed LONG" pair says
nothing about intent and invites the agent to re-enter what it just left,
while "opened: breakout on volume" followed by "closed: volume dried up,
thesis void" reads as a finished thought. Unlike getStatus, the feed is
not limited to what is open right now — a close only means something next
to the open it terminates.

Rows accumulate only while a NotificationLive backend is enabled. Depth
defaults to {@link DEFAULT_NOTIFICATION_LIMIT }; the newest events are the
ones kept when `limit` cuts the feed.

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
