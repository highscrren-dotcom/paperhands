---
title: concept/05_ai_signal_scoring_agent
group: concept
---

# 👾 AI Agent for Scoring Trading Signals

> The source code discussed in this article is [published here](https://github.com/backtest-kit/ai-trading-mcp)

![cover_ai_signal_scoring_agent](../../assets/images/cover_ai_signal_scoring_agent.png)

The internet is full of people telling you to buy or sell an asset, showing off their win rate and pretty equity curves. The problem is that their statistics belong to them: a bad signal can be deleted, a good one kept, and the result measured from whatever entry point is convenient. Looking at the final feed, there is no way to tell talent from a well-edited history.

## Trading signals

![ai_signal_channel_feed](../../assets/images/ai_signal_channel_feed.jpg)

Two things are unclear.

**1. Does the author delete signals after the fact**

A high win rate on its own means nothing: you get one just as easily with a tight TP as by retroactively deleting the losing posts. In the final feed these two cases are indistinguishable. The only thing you can count on is a feed captured at the moment of publication and stored on your own side.

**2. How to parse it**

Not everyone uses a rigid format with TP/SL stated up front. The free-form case is more interesting: the agent has to extract the trading intent from whatever the author actually wrote.

## Automating the process

![Connecting a data source over MCP](../../assets/images/ai_signal_mcp_source.png)

Using the Model Context Protocol, the agent connects to an external data source. Per the spec, the data source passes along not just text but images as well.

![Scheduling a repeating task via /loop](../../assets/images/ai_signal_loop_schedule.png)

The `/loop` command hands the AI agent a task to be repeated on an interval. The account is a test one — trades are executed as a simulation inside the engine — and stating that in the prompt is consistent with safety policies.

![Active position state in the agent's context](../../assets/images/ai_signal_position_state.png)

The agent knows which positions are open, their peak profit, maximum drawdown, and current PnL. Constraints such as "only trade alts" and "never hold more than three positions at once" are written out in plain text.

![Agent iterations on an interval](../../assets/images/ai_signal_iterations.jpg)

The interval works. The exit condition is either written into the prompt as a pullback from peak profit, or programmed statically — more on that below.

## Token cost

To optimize token consumption, generating the per-channel summary is delegated to a subagent. That way heavy images never reach the global context. Below are the numbers for the unoptimized variant on a $200 Claude Max subscription, measured against the weekly limit. The 5-hour window is not hit by any of the models.

1. **Fable 5:** 2 days of operation at a 15-minute polling interval, consumes the entire limit (on Max it is capped at half the weekly allowance)
2. **Opus 5:** 8 days at a 15-minute polling interval, weekly limit not exhausted
3. **Sonnet 5:** 20 days at a 15-minute polling interval, weekly limit not exhausted
4. **Haiku 4.5:** 40 days at a 15-minute polling interval, weekly limit not exhausted

So Sonnet — the Claude Code default, if you never switched it to Opus — lets you check the chat every 15 minutes with no context optimization whatsoever. Add prompt optimizations or widen the interval and you can cover more sources by opening several console chats in tmux.

## Why the agent doesn't compute the returns

If you simply ask an AI chat to backtest a trading strategy, it will fit the result to expectations: it has no external check, and it doesn't want to finish the job on a bad number. But if an external tool computes the returns and the agent only has two buttons — buy or sell — then cheating with a close-to-close backtest is off the table.

## Evaluation methodology

An author's final rating is assembled not from a single number but from a summary table across every ticker they recommended. That breakdown immediately exposes what aggregate returns hide: an author may run a couple of coins confidently and hand out everything else at random. The analysis is performed not by the AI agent but by its MCP execution engine. Everything is computed there: position drawdowns, Sharpe ratio, Calmar ratio. Separately from the agent.

## The outcome

An author of trading signals always shows up with their own statistics: win rate, a streak of profits, a screenshot of the equity curve. Instead of taking their word for it, you can trade their entries yourself and derive a rating from that. Judged on substance, not on credentials. And you can do it automatically, handing the job to an AI in a way that keeps it from deceiving you either.

## Local hosting

Architecturally, the AI agent makes a binary decision and never passes an exact entry size when opening or closing a position. All the arithmetic lives in the script, so a weak model can't break risk management. That makes local LLMs viable: ollama implements tool calling for them, and Claude Code connects to it through a proxy exposing an Anthropic-compatible endpoint, with no Anthropic cloud involved.

The exact TP/SL and trailing take are set by the script through lifecycle events. They are derived from current market volatility and are always different — a fixed window is inefficient.

On top of that, so the backtest isn't slowed down waiting on agent iterations, the signal history is dumped to disk and the strategy is verified in isolation, with no chat at all.

> ***Minimal code, agent-only***

```javascript
import { addStrategySchema } from "backtest-kit";

addStrategySchema({
  strategyName: "main_strategy",
});
```

Everything else the agent does through MCP tools: the schema exists only so the engine knows what name to log trades under.

> ***Manual early close***

```javascript
import {
  listenActivePing,
  commitClosePending,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestPnlPercentage,
  getPositionPnlPercent,
  getPositionHighestProfitMinutes,
} from "backtest-kit";

import { str } from "functools-kit";

const TRAILING_TAKE_DISTANCE = 1.0;
const PEAK_STALENESS_SINCE_PROFIT = 1.0;
const PEAK_STALENESS_SINCE_MINUTES = 240;

listenActivePing(async ({ symbol }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < 0) {
    return;
  }
  if (peakProfitDistance < TRAILING_TAKE_DISTANCE) {
    return;
  }
  await commitClosePending(symbol, {
    id: "trailing_take",
    note: str.newline(
      "# Position closed by trailing take",
    ),
  });
});

listenActivePing(async ({ symbol }) => {
  const peakProfitCost = await getPositionHighestPnlPercentage(symbol);
  const peakProfitMinutes = await getPositionHighestProfitMinutes(symbol);
  if (peakProfitCost < PEAK_STALENESS_SINCE_PROFIT) {
    return;
  }
  if (peakProfitMinutes < PEAK_STALENESS_SINCE_MINUTES) {
    return;
  }
  await commitClosePending(symbol, {
    id: "peak_staleness",
    note: str.newline(
      "# Position closed by peak staleness",
    ),
  });
});
```

The thresholds here are illustrative; production values depend on the ticker's volatility.

## Dashboard

The `backtest-kit` library handles buying via a limit order on its own, waiting for a seller and rolling the transaction back if none is found. The agent's interface is identical in both modes: it doesn't know whether it's running paper or full live trading. This isn't just convenience, it's protection against behavior fitting — a safeguard won't break a flow like this. Charts and notifications are additionally provided for every position.

![Charts and notifications for active positions](../../assets/images/ai_signal_charts_notifications.jpg)

If something goes wrong, the agent documents what happened. For example, a trader may want to add to a position. That is accounted for in the math: the average entry price is computed as a volume-weighted average and PnL is recalculated from it rather than from the first order. And the agent writes a text comment on how the trader justified the decision.

![Position event log with averaging](../../assets/images/ai_signal_event_log.jpg)

## Thanks for reading!