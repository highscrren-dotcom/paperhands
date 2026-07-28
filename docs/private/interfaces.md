---
title: private/interfaces
group: private
---

# backtest-kit api reference

![schema](../../assets/uml.svg)

**Overview:**

Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.

**Core Concepts:**

* **Signal Lifecycle:** Type-safe state machine (idle → opened → active → closed) with discriminated unions
* **Execution Modes:** Backtest mode (historical data) and Live mode (real-time with crash recovery)
* **VWAP Pricing:** Volume Weighted Average Price from last 5 1-minute candles for all entry/exit decisions
* **Signal Validation:** Comprehensive validation ensures TP/SL logic, positive prices, and valid timestamps
* **Interval Throttling:** Prevents signal spam with configurable intervals (1m, 3m, 5m, 15m, 30m, 1h)
* **Crash-Safe Persistence:** Atomic file writes with automatic state recovery for live trading
* **Async Generators:** Memory-efficient streaming for backtest and live execution
* **Accurate PNL:** Calculation with fees (0.1%) and slippage (0.1%) for realistic simulations
* **Event System:** Signal emitters for backtest/live/global signals, errors, and completion events
* **Graceful Shutdown:** Live.background() waits for open positions to close before stopping
* **Pluggable Persistence:** Custom adapters for Redis, MongoDB, or any storage backend

**Architecture Layers:**

* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency
* **Service Layer:** DI-based services organized by responsibility:
  * **Schema Services:** Registry pattern for configuration with shallow validation (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)
  * **Validation Services:** Runtime existence validation with memoization (StrategyValidationService, ExchangeValidationService, FrameValidationService)
  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)
  * **Markdown Services:** Auto-generated reports with tick-based event log (BacktestMarkdownService, LiveMarkdownService)
* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper, extensible via PersistBase
* **Event Layer:** Subject-based emitters (signalEmitter, errorEmitter, doneEmitter) with queued async processing

**Key Design Patterns:**

* **Discriminated Unions:** Type-safe state machines without optional fields
* **Async Generators:** Stream results without memory accumulation, enable early termination
* **Dependency Injection:** Custom DI container with Symbol-based tokens
* **Memoization:** Client instances cached by schema name using functools-kit
* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)
* **Registry Pattern:** Schema services use ToolRegistry for configuration management
* **Singleshot Initialization:** One-time operations with cached promise results
* **Persist-and-Restart:** Stateless process design with disk-based state recovery
* **Pluggable Adapters:** PersistBase as base class for custom storage backends
* **Queued Processing:** Sequential event handling with functools-kit queued wrapper

**Data Flow (Backtest):**

1. User calls Backtest.background(symbol, context) or Backtest.run(symbol, context)
2. Validation services check strategyName, exchangeName, frameName existence
3. BacktestLogicPrivateService.run(symbol) creates async generator with yield
4. MethodContextService.runInContext sets strategyName, exchangeName, frameName
5. Loop through timeframes, call StrategyGlobalService.tick()
6. ExecutionContextService.runInContext sets symbol, when, backtest=true
7. ClientStrategy.tick() checks VWAP against TP/SL conditions
8. If opened: fetch candles and call ClientStrategy.backtest(candles)
9. Yield closed result and skip timeframes until closeTimestamp
10. Emit signals via signalEmitter, signalBacktestEmitter
11. On completion emit doneEmitter with { backtest: true, symbol, strategyName, exchangeName }

**Data Flow (Live):**

1. User calls Live.background(symbol, context) or Live.run(symbol, context)
2. Validation services check strategyName, exchangeName existence
3. LiveLogicPrivateService.run(symbol) creates infinite async generator with while(true)
4. MethodContextService.runInContext sets schema names
5. Loop: create when = new Date(), call StrategyGlobalService.tick()
6. ClientStrategy.waitForInit() loads persisted signal state from PersistSignalAdaper
7. ClientStrategy.tick() with interval throttling and validation
8. setPendingSignal() persists state via PersistSignalAdaper.writeSignalData()
9. Yield opened and closed results, sleep(TICK_TTL) between ticks
10. Emit signals via signalEmitter, signalLiveEmitter
11. On stop() call: wait for lastValue?.action === 'closed' before breaking loop (graceful shutdown)
12. On completion emit doneEmitter with { backtest: false, symbol, strategyName, exchangeName }

**Event System:**

* **Signal Events:** listenSignal, listenSignalBacktest, listenSignalLive for tick results (idle/opened/active/closed)
* **Error Events:** listenError for background execution errors (Live.background, Backtest.background)
* **Completion Events:** listenDone, listenDoneOnce for background execution completion with DoneContract
* **Queued Processing:** All listeners use queued wrapper from functools-kit for sequential async execution
* **Filter Predicates:** Once listeners (listenSignalOnce, listenDoneOnce) accept filter function for conditional triggering

**Performance Optimizations:**

* Memoization of client instances by schema name
* Prototype methods (not arrow functions) for memory efficiency
* Fast backtest method skips individual ticks
* Timeframe skipping after signal closes
* VWAP caching per tick/candle
* Async generators stream without array accumulation
* Interval throttling prevents excessive signal generation
* Singleshot initialization runs exactly once per instance
* LiveMarkdownService bounded queue (MAX_EVENTS = 25) prevents memory leaks
* Smart idle event replacement (only replaces if no open/active signals after last idle)

**Use Cases:**

* Algorithmic trading with backtest validation and live deployment
* Strategy research and hypothesis testing on historical data
* Signal generation with ML models or technical indicators
* Portfolio management tracking multiple strategies across symbols
* Educational projects for learning trading system architecture
* Event-driven trading bots with real-time notifications (Telegram, Discord, email)
* Multi-exchange trading with pluggable exchange adapters

**Test Coverage:**

The framework includes comprehensive unit tests using worker-testbed (tape-based testing):

* **exchange.test.mjs:** Tests exchange helper functions (getCandles, getAveragePrice, getDate, getMode, formatPrice, formatQuantity) with mock candle data and VWAP calculations
* **event.test.mjs:** Tests Live.background() execution and event listener system (listenSignalLive, listenSignalLiveOnce, listenDone, listenDoneOnce) for async coordination
* **validation.test.mjs:** Tests signal validation logic (valid long/short positions, invalid TP/SL relationships, negative price detection, timestamp validation) using listenError for error handling
* **pnl.test.mjs:** Tests PNL calculation accuracy with realistic fees (0.1%) and slippage (0.1%) simulation
* **backtest.test.mjs:** Tests Backtest.run() and Backtest.background() with signal lifecycle verification (idle → opened → active → closed), listenDone events, early termination, and all close reasons (take_profit, stop_loss, time_expired)
* **callbacks.test.mjs:** Tests strategy lifecycle callbacks (onOpen, onClose, onTimeframe) with correct parameter passing, backtest flag verification, and signal object integrity
* **report.test.mjs:** Tests markdown report generation (Backtest.getReport, Live.getReport) with statistics validation (win rate, average PNL, total PNL, closed signals count) and table formatting

All tests follow consistent patterns:
* Unique exchange/strategy/frame names per test to prevent cross-contamination
* Mock candle generator (getMockCandles.mjs) with forward timestamp progression
* createAwaiter from functools-kit for async coordination
* Background execution with Backtest.background() and event-driven completion detection


# backtest-kit interfaces

## Interface WalkerStopContract

This interface defines what happens when a walker is told to stop. It's used to signal that a specific trading strategy, running within a walker, needs to be interrupted. 

When a walker is halted, this signal is sent out, telling you which symbol, strategy, and specifically which walker is being stopped. 

Because you might have several walkers active at once, the signal includes a walker name so you can precisely target the one you want to halt. Think of it as a notification that a trading process has been paused.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present the results of backtesting trading strategies. Think of it as a container for all the data you need to compare different strategies against each other. It builds upon the IWalkerResults interface, adding extra information to make it easier to analyze how your strategies performed. 

Specifically, it holds an array called strategyResults. This array contains detailed information about each strategy you tested, allowing you to examine metrics and outcomes side-by-side.

## Interface WalkerContract

The WalkerContract represents a progress update during strategy comparisons. It's like a notification sent whenever a strategy finishes its backtest and its results are available.

Each notification includes key details such as the name of the strategy, the exchange and frame it was tested on, and the specific symbol it evaluated.

You'll also get performance statistics – like metrics – and how that strategy’s results compare to the best strategy seen so far.

Essentially, this contract gives you a running tally of the backtest process, showing you which strategies have been run, their results, and how they stack up against each other as the comparison progresses. You can track the number of strategies tested versus the total number planned.

## Interface WalkerCompleteContract

This interface, `WalkerCompleteContract`, represents the final notification sent when a full backtesting process concludes. It signals that all strategies have been evaluated and comprehensive results are ready.

Think of it as the finish line notification for a backtesting run.

The notification includes details about the specific backtest, like the name of the walker, the trading symbol, the exchange and timeframe used. You'll also find information about the optimization metric, the total number of strategies tested, and importantly, the name and performance of the best-performing strategy.

Within the notification, you can access the exact metric value achieved by the best strategy, along with its complete statistical breakdown.

## Interface ValidationErrorNotification

This notification type signals that a validation check has failed during the backtesting or live trading process. It's a way for the system to communicate when a rule or constraint you’ve set up, like maximum position size or margin requirements, has been violated. 

Each notification includes a unique identifier, a detailed error object with its stack trace for debugging, and a clear, human-readable message explaining the validation failure.  You'll also find that the `backtest` property is always false, indicating the error occurred in a live context, not during a simulated backtest. These notifications help you understand and resolve issues with your trading rules and constraints.


## Interface ValidateArgs

This interface, `ValidateArgs`, is like a blueprint for ensuring that the names of different components in your backtesting setup are all correct and consistent. Think of it as a way to double-check that you’re using the right names for things like exchanges, timeframes, trading strategies, risk profiles, actions, sizing methods, and parameter sweep configurations. Each property within `ValidateArgs` expects a type `T` which represents an enumeration – a defined list of allowed names. This helps catch errors early on, ensuring everything works smoothly during your backtest.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's a detailed record of what happened, including a unique ID, the exact time, and whether it occurred during a backtest or live trading. You'll find information about the trading pair, the strategy involved, and the exchange where the action took place.

The notification provides key pricing details like the current price, entry price, and adjusted take profit/stop loss levels, along with the original values before any trailing adjustments. It also breaks down the position details - whether it was a long or short trade.

You can see how many entries were used for averaging and partial closes, along with the overall profit and loss, peak profit, and maximum drawdown figures, all including relevant pricing and percentage calculations. There's also a field for any notes explaining the reason behind the signal. Finally, timestamps indicate when the signal was scheduled, became pending, and when the notification itself was created.

## Interface TrailingTakeCommit

This describes a trailing take profit event that occurs within a trading strategy. It signifies that the take profit level has been adjusted based on a trailing mechanism, moving it dynamically with the price.

The event includes key information about the trade, such as the direction (long or short), entry price, and the adjusted take profit and stop-loss prices. You'll also find the original, unchanged take profit and stop-loss prices for comparison.

Detailed performance metrics are also provided, including the current price at the time of the adjustment, the position's profit and loss (PNL), peak profit achieved, and maximum drawdown experienced. The timestamps of when the signal was created and the position was activated are also recorded. The 'percentShift' property explains how much the take profit level was modified relative to the current price.

## Interface TrailingStopCommitNotification

This notification is triggered whenever a trailing stop order is executed, providing a detailed record of the event. It's a way to track when your trailing stop adjustments lead to a trade being opened or closed.

The notification includes key details like a unique ID, timestamp, whether it's from a backtest or live trading, and the trading symbol involved. You'll also find the strategy and exchange that generated the signal, along with specifics of the trade itself: entry price, stop loss, take profit levels (original and adjusted), position direction (long or short), and details about any DCA (Dollar Cost Averaging) and partial closes that might have been involved.

Beyond the immediate trade information, the notification also summarizes the performance of the position up to that point, including peak profit, maximum drawdown, and detailed P&L breakdowns – both in USD and as percentages.  You can see the entry and exit prices used for P&L calculations, taking into account slippage and fees. Finally, there's a field for optional notes to provide extra context or explain the reasoning behind the signal. Timestamps indicate when the signal was created, became pending, and when this notification was generated.

## Interface TrailingStopCommit

This interface represents an event triggered when a trailing stop order is executed. It provides comprehensive information about the trade's performance and configuration. 

The `action` property confirms that this event specifically relates to a trailing stop adjustment.  You'll find the `percentShift` which defines how the stop loss price is being adjusted based on market movements. 

The event also includes crucial pricing details like the `currentPrice` at the time of the trailing stop, and the original and adjusted `priceTakeProfit` and `priceStopLoss` values. Understanding `priceOpen`, `priceTakeProfit`, and `priceStopLoss` allows you to review the entry and exit conditions.

For performance analysis, the event provides a snapshot of the position's profit and loss (`pnl`), peak profit achieved (`peakProfit`), and maximum drawdown (`maxDrawdown`). `position` indicates whether the trade was a long or short. Timestamps, `scheduledAt` and `pendingAt`, allow you to track the timing of the trade’s execution.

## Interface TickEvent

This describes the data structure for a `TickEvent`, which is used to record what happens during trading. Think of it as a single log entry for a specific event related to a trade.

Each `TickEvent` contains a wealth of information, including when the event occurred (`timestamp`), what kind of event it was (`action`), and details specific to that event. For instance, it includes information like the trading symbol (`symbol`), signal ID (`signalId`), and the prices involved (like `currentPrice`, `priceTakeProfit`, and `priceStopLoss`).

If a trade involved averaging entries (DCA), the event details include information about the total number of entries (`totalEntries`) and partial closes (`totalPartials`). You'll also find metrics related to profit and loss (`pnlCost`, `pnl`), and details like the reason a trade was closed or cancelled. The `pendingAt` and `scheduledAt` properties track specific timings within the trade lifecycle. Finally, certain fields like `peakPnl` and `fallPnl` provide insights into performance during the trade's duration. Not every field is relevant to every event type; for example, price-related fields are mostly for scheduled, waiting, opened, active, closed, or cancelled events.

## Interface SyncStatisticsModel

This model helps you understand how your signals are syncing. It keeps track of every syncing event, giving you a detailed list of each one. You’ll also get a total count of all syncing events, as well as separate counts for when signals are opened and when they are closed. Essentially, it gives you a clear picture of the lifecycle of your signals and how they are being managed.

## Interface SyncEvent

This data structure holds all the key details about events happening during a trade, making it easier to generate reports. It includes the exact time of the event, the trading symbol involved, and the name of the strategy and exchange used.

You'll find information about the signal itself, like its unique ID and the direction of the trade (long or short). 

It also tracks financial details such as entry prices, take profit levels, stop losses, and how much profit or loss has been made. 

Furthermore, it provides data related to DCA (Dollar Cost Averaging) – the number of entries and partial closes – as well as peak profit and maximum drawdown. 

Finally, it indicates if the event occurred during a backtest and includes a timestamp of when the event was created.

## Interface StrategyStatisticsModel

This model holds all the data about how your trading strategy performed, broken down into specific event types. It essentially gives you a detailed accounting of everything that happened during a backtest.

You’ll find a complete list of events, each with its own information, stored in the `eventList`. 

The `totalEvents` property simply tells you how many events occurred overall.

Several properties like `cancelScheduledCount`, `closePendingCount`, and `partialProfitCount` track the number of times each particular type of event occurred. This helps you understand the behavior of your strategy.

You can see how often your strategy used techniques like trailing stops or breakeven orders by examining counts for `trailingStopCount`, `breakevenCount`, and so on.

The `averageBuyCount` specifically tracks the use of dollar-cost averaging (DCA) strategies.

## Interface StrategyPauseNotification

This notification lets you know when a trading strategy has been paused or resumed. It's a signal that the strategy isn't actively opening new trades – any new signal requests are put on hold until the strategy is running again. Importantly, existing trades and scheduled actions still work as expected; they’ll continue to be monitored and closed normally.

The notification provides several key details: a unique identifier, the timestamp of the change, whether it's happening during a backtest or live trading, the specific trading symbol affected, the strategy's name, the exchange and frame used, and most crucially, the new paused state (true for paused, false for resumed). It also includes a creation timestamp.

## Interface StrategyEvent

This `StrategyEvent` object holds all the details about actions taken by your trading strategy, whether it's a backtest or a live trade. Think of it as a detailed log entry for every buy, sell, or adjustment your strategy makes. It includes information like the exact time of the event, the trading pair involved, the strategy and exchange names, and whether it’s a backtest or live execution.

For each action, you’ll find the signal ID, the type of action performed, and the current market price at the time.  You'll also see relevant details like percentages for profit/loss closures or trailing stops, and unique IDs for scheduled or pending actions.

It also keeps track of position specifics—direction (long or short), entry price, take profit/stop loss levels (both effective and original), and DCA information (if applicable) including total entries, total partials, cost and effective price.  Finally, a note field allows for adding optional information. This whole object provides a complete picture of how your strategy operates.

## Interface SignalScheduledNotification

This notification type signals that a trading signal has been planned for future execution. It's essentially a heads-up that something’s going to happen later.

Each notification has a unique ID and timestamp indicating when the signal was scheduled. You’ll see whether the signal originates from a backtest or live trading environment. It also includes key details like the trading pair (symbol), the strategy that generated it, and the exchange it will be executed on.

The notification provides the specifics of the trade itself: the signal ID, the trade direction (long or short), and target prices for entry, take profit, and stop loss.  Crucially, it includes the original prices for these targets *before* any adjustments like trailing stop losses are applied.

For strategies employing dollar-cost averaging (DCA), you can see the total number of entries and partial closes planned for the trade. You'll also find the total cost of the initial position, along with detailed performance data like profit and loss (PNL), peak profit, and maximum drawdown – all calculated up to the point the signal was created. This includes percentages and the effective prices used for PNL calculation.

Finally, you'll find details about the signal's scheduling time, the current market price at that moment, and an optional note explaining the reasoning behind the signal. A timestamp reflects the creation time of the notification itself.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of detail about the trade, including when it happened (indicated by the `timestamp`) and whether it occurred during a backtest or live trading (`backtest`). You'll find key information like the trading pair (`symbol`), the strategy that triggered the trade (`strategyName`), and the exchange used (`exchangeName`).

The notification includes details about the position itself: the direction (`position`, either long or short), the entry price (`priceOpen`), and any take profit or stop loss levels set. You can see the original price levels before any trailing stop adjustments.

It also breaks down the trade’s financial aspects. This includes the total cost of entry (`cost`), profit and loss data (`pnl`, `peakProfit`, `maxDrawdown`), and details about DCA averaging (`totalEntries`, `totalPartials`). It further tracks relevant pricing information (`pnlPriceOpen`, `pnlPriceClose`), along with the total invested capital and individual entry prices.  Finally, it provides data points regarding peak profit and maximum drawdown, including the prices and costs at which they were reached, and a field for adding a human-readable note (`note`) to describe the reasoning behind the signal.

## Interface SignalInfoNotification

This notification provides information about a strategy's open position, specifically when a strategy wants to share a note about it. It’s like a friendly update from your trading bot. The `type` field confirms this is an informational signal. Each notification has a unique `id` and `timestamp` for tracking, and tells you if it’s from a backtest or live trading. 

You’ll find details about the trade itself, like the `symbol` being traded (e.g., BTCUSDT), the `strategyName` that initiated it, and the `exchangeName` used. Crucially, it includes the `signalId`, `currentPrice`, trade `position` (long or short), and original entry `priceOpen`, `takeProfit`, and `stopLoss` prices. 

The notification also includes advanced data such as total `entries` and `partials` which provide insights into DCA and partial closing actions. It also shows performance metrics like `pnl` (profit and loss), `peakProfit`, and `maxDrawdown`, offering a snapshot of the position’s performance. The `pnlPercentage` offers a clear view of profitability, while `pnlCost`, `pnlEntries`, and associated price metrics give a more complete picture of the trade's financial health.

Finally, a descriptive `note` field allows the strategy to communicate custom information, and `notificationId` allows correlation with external systems, and `scheduledAt`, `pendingAt`, and `createdAt` timestamps offer a view of the position's lifecycle.

## Interface SignalInfoContract

This interface describes the information shared when a trading strategy sends a custom notification about its positions. Think of it as a way for strategies to broadcast messages related to trades, like annotations or debugging information. 

Each notification includes details about the trading symbol, the strategy generating the message, the exchange and frame being used, and the specific data associated with the signal. You'll also find the current price at the time of the notification, a user-defined note for extra context, and an optional ID to link the event to external systems. 

Finally, the notification specifies whether the event originated from a backtest (using historical data) or live trading. The timestamp indicates when the notification occurred – either the real-time moment in live mode or the candle's timestamp during a backtest.

## Interface SignalEventContract

This describes a way to track the lifecycle of pending trades – when they're first created and when they’re actually closed – without having to constantly monitor all the signal data. It's like getting notified only when a trade becomes active or is finalized.

These events, called `SignalEventContract`, are emitted when a pending trade is either opened or closed. They provide information about *why* a trade was opened (new signal, scheduled activation, etc.) and *how* it was closed (take profit, stop loss, user action, etc.).

The event provides key details like the trading pair, the strategy involved, the timeframe used, and the complete signal data. If a trade is closed, you’ll also get a reason for the closure. You’ll also learn the current price at the time of the event - the entry price for opened events, and the closing price for closed ones.

Finally, a flag indicates whether this event happened during a backtest or in live trading, and a timestamp marks precisely when it occurred. This allows you to build tools that react to specific trade events and understand their context.

## Interface SignalData$1

This structure holds the data needed to build a Profit and Loss (PNL) table during a backtest. Think of it as a single, completed trade – it tells you everything you need to know about that specific trade's performance. Each entry represents a signal that has been closed, and it includes key details like which strategy created the signal, a unique identifier for the signal itself, the asset being traded (like "BTC/USDT"), and whether it was a long or short position.

You’ll also find the percentage profit or loss for that trade, the reason it was closed, and the timestamps of when the trade opened and closed. This information allows you to analyze how well your trading strategies performed.

## Interface SignalCommitBase

This defines the basic information shared by every signal event in the backtest kit. Each signal event includes the trading symbol, the name of the strategy that generated it, and the exchange it was executed on. 

You’ll also find details about the timeframe, whether it's a backtest or live trade, and a unique identifier for each signal. 

The event also tracks how many entries and partial exits have occurred, the original entry price, the complete signal data at that moment, and an optional note to explain why the signal was generated.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it's from a backtest or a live trade. It provides a wealth of information about the trade, including a unique ID, the exact time it closed, and whether it was a long or short position. You’ll find details like the entry and exit prices, take profit and stop-loss levels (both original and adjusted), and how many entries were used.

It also provides key performance metrics like profit/loss (both as a percentage and in USD), peak profit, and maximum drawdown figures, alongside the prices and entry counts associated with those moments. The notification includes information on slippage and fees that affected the final P&L calculation. Finally, you can see when the signal was scheduled and when the position became pending, as well as a description of why the position closed.

## Interface SignalCancelledNotification

This notification indicates that a signal, which was previously scheduled for execution, has been cancelled. It provides detailed information about the cancelled signal, useful for understanding why it didn't activate.

The notification includes a unique identifier, a timestamp marking when the cancellation occurred, and flags to distinguish between backtest and live trading environments.

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where it was scheduled.

It also contains specifics about the intended trade, such as the position type (long or short), take profit and stop-loss prices, and the entry price. You’ll also see information regarding any DCA averaging that was intended, partial closes that may have happened and reasons for the cancellation. 

Additional fields clarify the signal's creation and pending status, along with a note field for any extra description.

## Interface Signal

This section describes the `Signal` object, which holds information about a trading signal. 

The `priceOpen` property stores the initial entry price for a trade.

The `_entry` property is an array of objects, each representing a specific entry point for a position.  Each entry includes the price, the total cost of that entry, a timestamp indicating when it occurred.

Similarly, `_partial` is an array tracking partial exits from a position. It contains details like whether the partial was taken for profit or loss, the percentage of the position exited, the price at the time of the partial, the cost basis at the time of the partial, the entry count at the time, and a timestamp.

## Interface Signal$2

The `Signal` class represents a trading signal, holding essential information about a trade. It tracks the initial entry price using the `priceOpen` property, providing a quick reference to the price at which the position was established.

The `_entry` array stores a history of entry events, including the price, cost, and timestamp for each. This gives you a detailed timeline of how the position was initially built.

Similarly, the `_partial` array logs partial exits, specifying the type (profit or loss), percentage, current price, cost basis, entry count at the time of exit, and the corresponding timestamp. This provides insight into how the position was scaled down over time.

## Interface Signal$1

This `Signal` object holds key information about a trading position. 

It includes the `priceOpen`, which is the price at which you initially entered the trade.

You'll also find `_entry`, a history of all entry points into the position, including the price, cost, and timestamp for each entry.

Lastly, there's `_partial`, which tracks partial exits from the position, noting the type (profit or loss), percentage, price, cost basis, entry count, and timestamp of each partial closing.

## Interface ScheduledEvent

This data structure holds all the important details about events related to trading signals—when they were scheduled, opened, or cancelled. It's designed to provide a complete picture for generating reports and analyzing trading activity.

Each event includes information like the exact time it happened, the type of action (scheduled, cancelled, or opened), and which trading pair was involved. You’ll also find key pricing details like the entry price, take profit levels, and stop loss orders, along with any modifications made to those prices.

For signals that involve DCA (Dollar Cost Averaging), the total number of entries and partial closes are tracked. You can even see the original prices before any averaging occurred, plus the total executed percentage of partial closes. Profit and loss (PNL) information is also included, showing the unrealized gains or losses at the time of the event.

If a signal was cancelled, the reason for cancellation and a unique ID (for user-initiated cancellations) are provided. Furthermore, the duration of the event, the time it became active, and the original creation timestamp are also stored.

## Interface ScheduleStatisticsModel

This model holds statistics about signals scheduled through your trading framework. 

It lets you see how many signals were scheduled, how many were activated, and how many were cancelled. 

You’ll find details of each scheduled event in the `eventList` property.

The model also provides key performance indicators like cancellation and activation rates, expressed as percentages, to help you evaluate your signal scheduling strategy.

Finally, it includes average waiting times for both cancelled and activated signals, allowing for insights into the efficiency of your system.

## Interface SchedulePingContract

This defines how the backtest-kit trading framework communicates about scheduled signals. It's a way to get notified about signals that are actively being monitored – those that haven't been cancelled or activated yet. Think of it as a regular heartbeat for signals in progress.

Every minute, when a scheduled signal is being monitored, this event is sent out. It provides a lot of information.

You'll get details like the trading symbol (e.g., BTCUSDT), the strategy being used, the exchange involved, and the timeframe.  The signal’s full data is included, encompassing all its parameters. There’s also a current price available to let you create custom logic – for example, automatically cancelling a signal if the price moves significantly. You can choose to respond to these events with your own custom actions. Finally, you’ll know whether the event is coming from a backtest (historical data) or live trading.

## Interface ScheduleEventContract

This contract helps you keep track of scheduled trading signals without needing to monitor every single signal. It lets you know when a signal is initially scheduled and when it's removed before it ever becomes active.

Think of it as a notification system for signals waiting to be triggered – you'll get notified when one is created and when one is canceled.

Here's a breakdown of what the notifications tell you:

*   **Action:** Whether a new signal was scheduled or an existing one was canceled.
*   **Symbol:**  The trading pair involved (e.g., BTCUSDT).
*   **Strategy Name:** The strategy that generated the signal.
*   **Exchange Name:** The exchange where the signal is active.
*   **Frame Name:** The timeframe or date range the signal applies to.
*   **Data:**  All the details of the signal itself, like its ID, target price, and stop-loss levels.
*   **Reason (for cancellations only):** Why the signal was canceled (e.g., timeout, price rejection, or user intervention).
*   **Current Price:** The market price at the time of the event.
*   **Backtest:**  Indicates if the event happened during a backtest or in live trading.
*   **Timestamp:** When the event occurred.

You can subscribe to these notifications using `listenScheduleEvent()` or `listenScheduleEventOnce()` to stay informed about the lifecycle of your scheduled signals. It's important to note that you won't receive a notification when a scheduled signal *activates* – that's signaled through the regular signal stream.

## Interface RiskStatisticsModel

This model holds information about risk statistics gathered from risk rejection events. 

It allows you to track how often risk rejections occur.

You’ll find a detailed list of each rejection event in the `eventList` property, providing complete information for each instance. 

The `totalRejections` property gives you the overall count of risk rejections. 

To understand where the rejections are happening, you can analyze `bySymbol` to see how many rejections are associated with each trading symbol. Similarly, `byStrategy` breaks down the rejections by the strategies used.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It's a way for the system to tell you why a trade didn't happen. 

Each notification has a unique ID and timestamp, and tells you if it occurred during a backtest or a live trading session. It includes details like the trading pair (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange involved.

The most helpful part is likely the `rejectionNote`, which provides a clear explanation for why the signal was rejected. You'll also find information about your current open positions, the market price at the time, and specifics about the potential trade, including its entry price, take profit, and stop-loss levels. If there was a specific reason attached to the signal itself, you can find it in the `signalNote`.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked because it violated a risk limit. It’s essentially a record of a rejected signal.

You'll find details such as the exact time of the rejection, the trading pair involved (symbol), and the specifics of the signal itself (currentSignal). It also includes the name of the strategy that generated the signal, which exchange it was intended for, and the timeframe being used.

The current market price at the time of rejection and the number of active positions are also recorded. A unique ID identifies each rejected signal, along with a note explaining why it was blocked. Finally, it indicates whether the rejection occurred during a backtest or live trading scenario.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. It's a way to keep track of when your trading strategies hit risk limits and get stopped.

This contract provides detailed information about each rejected signal, including the trading pair (symbol), the signal itself (price, position size, etc.), the name of the strategy that generated it, the timeframe used, the exchange involved, and the current market price at the time.

You'll also find the number of existing positions when the rejection happened, a unique ID for tracking the rejection, a human-readable explanation of why it was rejected, the exact time of rejection, and whether it occurred during a backtest or live trading.

Services like report generators and user notifications use this data to monitor risk management effectiveness and understand why signals are being rejected.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` lets you follow along with what’s happening as a background process, like a test of many trading strategies, runs. It provides key details about the process.

You'll see information like the name of the specific process running (`walkerName`), the exchange being used (`exchangeName`), and the frame being utilized (`frameName`). Each update tells you which trading symbol, like BTCUSDT, is currently being evaluated. 

The data also includes the total number of strategies being tested (`totalStrategies`), how many have already been processed (`processedStrategies`), and the overall percentage of completion (`progress`), displayed as a value between 0 and 1. This helps you understand how far along the testing is and get a sense of how long it might take to finish.


## Interface ProgressBacktestContract

This interface helps you monitor the progress of a backtest as it runs. It provides details about which exchange and strategy are being tested, and for which trading symbol. You’ll see the total number of historical data points (frames) being analyzed, along with how many have already been processed. Most importantly, it gives you a percentage completion value so you can gauge how much longer the backtest will take. Essentially, it’s a report card showing you how far along the backtest is.

## Interface PerformanceStatisticsModel

This model holds the combined performance data for a specific trading strategy. It tells you the name of the strategy, the total number of performance events that were tracked, and the overall time it took to gather all the performance metrics. 

It also organizes performance data into categories based on metric type, allowing you to analyze different aspects of the strategy's performance. Finally, it provides access to the raw performance event data, which can be useful for detailed investigation.

## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies are performing. It's like a detailed log that records events during trading, letting you pinpoint areas where things might be running slow or could be optimized. Each entry in this log captures key details:

*   When the event happened, and when the previous one occurred.
*   What type of action was being performed (like order placement or market data updates).
*   How long that action took to complete.
*   The name of the strategy, exchange, and the timeframe being used.
*   Which symbol was being traded.
*   Whether the event occurred during a backtest or a live trading session.

By analyzing these performance records, you can identify bottlenecks, improve the efficiency of your strategies, and gain a better understanding of their behavior.

## Interface PauseContract

The PauseContract represents changes in a strategy's paused state, letting you know when trading is temporarily stopped or resumed. When a strategy is paused, it won't generate new trading signals or place new orders, but any pending signals will still be handled normally.

This contract includes important details like the trading symbol involved, whether the strategy is now paused or resumed, and the exact time of the change. You'll also find the strategy's name, the exchange used, and the timeframe involved (like "1m" or "5m"). 

Finally, a 'backtest' flag indicates whether this update refers to a historical simulation or a live trading session, allowing you to adjust your responses accordingly. You can use this information to inform users about these trading interruptions, for example, through messaging apps.

## Interface PartialStatisticsModel

This model holds key statistics about your trading backtests, specifically focusing on events where partial profits or losses were realized. It gives you a detailed look at the events that occurred during the backtest, allowing you to analyze how frequently profits and losses happened. 

The `eventList` property contains a comprehensive record of each individual event, including all the details related to it. `totalEvents` simply tells you the total number of profit and loss events. `totalProfit` tracks how many times a profit event occurred, and `totalLoss` counts the number of loss events. This information is extremely useful for assessing the risk and reward profile of your strategies.

## Interface PartialProfitContract

This interface defines a notification about a trading strategy achieving a partial profit milestone. When a strategy reaches a specific profit level, like 10%, 20%, or 30%, this notification is triggered. It’s designed to help track the progress of a strategy and how well it’s performing.

The notification includes key details like the trading symbol, the strategy's name, the exchange being used, and the current market price at which the profit level was achieved. Importantly, you’ll find the precise profit level (like 10%, 20%) and whether the event occurred during a backtest or live trading. This information is vital for understanding the performance of your trading strategies, particularly in historical or real-time scenarios.  The complete signal information is also available, offering a comprehensive view of the trade’s details.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken, whether it's during a backtest or live trading. It provides a wealth of information about the trade, including a unique identifier, the time it happened, and whether it was a backtest or live signal. You'll find details like the trading pair, the strategy name, and the exchange used.

It goes into great detail about the position itself, showing the entry price, take profit levels (original and adjusted), stop loss levels, and the number of entries and partials. The notification also includes comprehensive performance metrics like total profit and loss (both absolute and percentage), peak profit, maximum drawdown, and associated prices and costs. Finally, you'll find extra details like any notes associated with the signal, and timestamps for when it was created and scheduled. Essentially, this notification gives you a complete snapshot of a partial profit-taking event and its associated performance data.

## Interface PartialProfitCommit

This describes an event where a trading strategy takes a partial profit on a position. It’s essentially a signal to close a portion of your open trade. 

The `action` property confirms this is a partial profit event. 

The `percentToClose` specifies what percentage of the position is being closed.  You’ll also find details about the current market price at the time of the action (`currentPrice`), and the profit and loss (`pnl`) associated with the closed portion of the trade. 

For context, you can see the position’s peak profit and maximum drawdown achieved so far (`peakProfit`, `maxDrawdown`). Information about the trade direction (`position`), entry price (`priceOpen`), and original take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`) are also provided. 

Finally, timestamps (`scheduledAt`, `pendingAt`) indicate when the signal was created and when the position initially became active.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has hit a profit milestone – like reaching 10%, 20%, or another defined level. It's a way to track progress and understand how your strategy is performing.  The notification includes a unique identifier, the exact time it occurred, and whether it's from a backtest or live trading.

You'll find key details like the trading pair, the strategy's name, which exchange was used, and the signal's unique ID. It also provides information about the trade itself, including the entry price, trade direction (long or short), and the current market price at the time of the milestone.

The notification also includes information on the take profit and stop loss levels, both original and adjusted for trailing.  Detailed financial data is present too, such as the total entries, partials, profit/loss (both absolute and percentage), peak profit details, and maximum drawdown information.  Finally, it includes the reason for the signal, and timestamps related to the signal's creation and processing.

## Interface PartialLossContract

This describes a `PartialLossContract`, which is a notification that a trading strategy has hit a pre-defined loss level, like a 10% or 20% drawdown. It’s used to keep track of how much a strategy is losing during trading.

Each time a strategy hits one of these loss levels, this contract is created and sent out. You'll find details like the trading pair (e.g., BTCUSDT), the strategy's name, which exchange it's running on, and the specific loss level reached (e.g., -10%). The notification also includes the current price when that level was triggered, and the original data associated with the signal that led to the trade.

You can subscribe to these notifications to monitor your strategies and build reports. These events are designed to be consistent – a given signal won't trigger a level event more than once, even if the price moves quickly. Finally, a flag indicates whether the event originates from a backtest (using historical data) or live trading.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It provides a wealth of detail about that closure, including a unique identifier, when it happened, and whether it occurred during a backtest or live trading. You’ll find information about the trading pair, the strategy involved, and the exchange used.

The notification breaks down specifics like the percentage of the position closed, the current price at execution, and the trade direction (long or short). You’ll also get a complete history of the position's pricing, from the initial entry price to the take profit and stop-loss levels, both original and adjusted.

It dives deep into the position’s performance, giving you the total profit and loss (both absolute and percentage), peak profit metrics, maximum drawdown, and details about the price and cost at those critical points.  You'll also see how many entries were made, how many partial closes occurred, and any notes explaining the reasoning behind the signal. Finally, it includes timestamps for when the signal was created, became pending, and when this particular notification was generated.

## Interface PartialLossCommit

This object represents a partial loss event that occurs during backtesting. It details what happened when a portion of a trading position was closed out.

The `action` property clearly identifies this as a partial loss. 

You'll find the `percentToClose` value, which tells you what percentage of the position was closed.  It also includes the `currentPrice` at the time the partial loss was executed.

The `pnl` property provides the total profit and loss from the entire position up to this point, accounting for all entry and partial closing transactions.  You can also see the `peakProfit` and `maxDrawdown` realized during the position’s lifetime.

The object specifies the trade direction (`position`), the initial entry price (`priceOpen`), and the target and stop-loss prices. Both the original and adjusted take profit and stop-loss prices are included as well.

Finally, the `scheduledAt` and `pendingAt` timestamps record when the signal was created and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has hit a predefined loss level, such as -10% or -20% of the initial investment. It’s a way to track how a trade is performing and provides detailed information about the position's status.

Each notification has a unique ID and timestamp, indicating precisely when the loss level was reached. You can tell if the signal originated from a backtest simulation or a live trading environment.  The notification includes the trading pair symbol, the strategy name, and the exchange where the trade took place.

The `level` property indicates exactly which loss threshold has been triggered. It also provides crucial details about the trade itself, including the entry price, trade direction (long or short), and any take profit or stop loss prices – both the initially set prices and the adjusted values if trailing was enabled.

You'll find data about the trade's history, such as the total number of DCA entries, partial closes, and a comprehensive breakdown of the position's profit and loss. This includes the peak profit achieved, the maximum drawdown experienced, and various price points and costs associated with those events.

Finally, there's an optional note field for a human-readable explanation of why the signal was triggered, along with timestamps for when the signal was created, became pending, and when the notification itself was generated.

## Interface PartialEvent

This data structure, called `PartialEvent`, bundles together all the key information about a profit or loss milestone achieved during a trade. It's designed to help generate reports summarizing a trading strategy's performance. Each `PartialEvent` record holds details like the exact time of the event, whether it's a profit or a loss, the trading pair involved, the name of the strategy used, and a unique ID for the signal that triggered the trade.

You'll also find information about the specific price levels reached (like 10%, 20%, etc.), the initial entry price, take profit and stop loss targets, and their original values when the signal was first generated. If the strategy used a dollar-cost averaging (DCA) approach, details about the total entries and original entry price are provided. It also includes details of any partial closes performed and how much has been executed. 

Other important data includes the unrealized profit and loss (PNL) at the time of the event, a human-readable explanation of why the signal was created, and timestamps indicating when the position became active and when the signal was initially scheduled. A flag indicates whether the trade was part of a backtest or a live trading scenario.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, whether it's an immediate order or one placed as part of a scheduled signal. It provides a lot of detail about the trade, including when it happened, which exchange and strategy were involved, and key data points like the entry price and stop-loss levels. You'll find information about the position's performance too, like profit, loss, peak profit, and maximum drawdown, alongside details about the cost and number of entries. The notification also includes timestamps for when the signal was created and the position was activated, alongside an optional note explaining the reasoning behind the signal.

## Interface OrderSyncCloseNotification

This notification tells you when a trading signal has been closed – whether it hit a take profit or stop loss, timed out, or was closed manually. It provides a ton of detail about the closed trade, including a unique identifier, when it happened, and whether it occurred in backtest or live mode. You’ll find information about the trading pair, the strategy used, and the exchange involved.

The notification also breaks down the performance of the trade, including total profit and loss, peak profit achieved, maximum drawdown, and key price points. It also specifies the trade direction (long or short) and details about entry, take profit, and stop loss prices, along with any original values before adjustments. You can also see the number of entries and partial closes that occurred. Finally, timestamps related to signal creation, pending activation, and notification creation are included, along with the reason for closing and a potential human-readable note for added clarity.

## Interface OrderSyncCheckNotification

This notification provides information about the status of an order backing a trading signal, primarily used in live trading environments. It's a check to ensure that an order placed by your strategy still exists on the exchange. The framework sends these "order ping" notifications periodically, but it’s designed to avoid sending them too frequently (capped at roughly every 15 minutes per signal) to prevent overwhelming your system.

Each notification contains a lot of data related to the trade, including details about the symbol, strategy, exchange, trade direction (long or short), and the pricing of the position including original and adjusted prices for take profit and stop loss.  You’ll find performance metrics too, like realized and unrealized profit & loss (PNL), peak profit, and maximum drawdown, which reflect the position’s journey to its current state. 

The notification includes details about DCA (Dollar-Cost Averaging) and partial closes, indicating how many entries were used and how many partial positions were closed.  You'll also see timestamps covering the signal creation, when it went pending, and when the notification was generated. There's also a space for a note, which allows the strategy to include human-readable context explaining why the signal was triggered. This helps in understanding and troubleshooting trades. Finally, the `backtest` flag shows whether this notification originated from a backtest or a live trading session.

## Interface OrderSyncBase

OrderSyncBase provides the foundational information common to all order synchronization events within the trading framework. Think of it as a basic package of data that accompanies every action related to an order – whether it’s being placed, activated, or closed.

This base includes details such as the type of order involved ("active" for immediate actions or "schedule" for orders associated with scheduled signals), the trading symbol (like "BTCUSDT"), the name of the strategy that triggered the order, and the exchange being used.  It also notes whether the event originates from a backtest or live trading environment.

Crucially, it tracks the signal identifier, timestamp, and the full details of the public signal that led to the order. A key feature is the 'attempt' number, which indicates how many times a previous attempt to open or close the order has failed, helping manage retries within defined limits. This mechanism prevents endless retries and ensures the system handles errors gracefully.

## Interface OrderStopContract

This event signifies that a trading order, initially monitored, is no longer active on the exchange. It's a terminal notification, meaning the framework has definitively decided the order is finished – whether it’s closed, canceled, or otherwise handled. Think of it as a final confirmation that the order isn't being tracked anymore.

There are two main reasons why this event occurs: either the order was found to be missing (perhaps filled, canceled, or liquidated elsewhere), or the system has reached its limit on retry attempts due to temporary problems.

Crucially, this event is only sent in live trading environments; backtesting doesn’t involve order checks.  If something goes wrong with the listener for this event, it won't interrupt the trading process itself – it's logged but doesn’t impact the decisions already made.

The event provides a wealth of information about the signal and position, including the trading symbol, strategy name, exchange, timeframe, a unique signal ID, the timestamp, the full signal details, current price, unrealized profit and loss (PNL), peak profit achieved, maximum drawdown, trade direction, and important price levels like entry, take profit, and stop-loss prices – both their original and adjusted values.  It also includes details about DCA averaging and partial closes, if they were used. The `attempt` property indicates how many failures occurred before the termination.

## Interface OrderStopCheckNotification

This notification signals a critical event regarding an order check – essentially, it means the check process has reached a terminal state. It’s a rare event, meaning it doesn't happen often.

It’s triggered when an order check fails definitively, either because the order was not found or because the system exceeded its retry attempts. You’ll receive this notification only when the order is live, not in backtesting.

The notification carries a wealth of information about the order and its performance. You’ll find details about the trading pair, the strategy used, key price points like entry, take profit, and stop-loss, along with all relevant performance metrics like profit & loss, drawdown, and slippage. 

The `reason` property tells you precisely why the check ended – "deleted" indicates the order was no longer found, while "exhausted" means the system gave up retrying.  The `type` is always `order_stop.check`, and the notification has a unique ID and timestamp.  The `orderType` indicates whether it's an "active" order (a regular trade) or a "schedule" order (a limit order placed to enter a position). You'll also see details like total entries (DCA averaging) and partial closes performed, alongside a detailed breakdown of P&L metrics.

## Interface OrderRejectOpenNotification

This notification signals that an order placement failed definitively—it's a rejection from the exchange, not a temporary problem that will retry. You'll only see this when the system permanently can’t fulfill an order. It's exclusive to live trading environments and won't appear during backtests.

The notification provides a lot of detail about why the order was rejected, including the exchange name, a human-readable error message, and a unique identifier for the signal. It also includes a snapshot of the position's performance up to that point, detailing P&L, peak profit, and maximum drawdown. You’ll find information about the entry and exit prices, costs, and even the number of entries and partial closures. Finally, the notification includes timestamps related to signal creation and order activation. This data is valuable for troubleshooting issues and understanding why your orders aren't being filled.


## Interface OrderRejectOpenContract

This event signifies that an order to either open a new position or schedule a future entry has been definitively rejected and will not be executed. It's a terminal rejection, meaning the trade attempt is completely abandoned. The `action` property tells you whether the rejection relates to an attempt to open a position or a scheduled entry. The `cost` property indicates the financial cost associated with the attempted order.

## Interface OrderRejectCloseNotification

This notification signals that a closing order for a position was rejected by the broker. It happens only when the system tries to close a position and the broker refuses the order, typically due to an error on their end. The engine then handles the closing process internally, keeping track of the original reason for the closure.

You'll see this notification in live trading environments only; it doesn't occur during backtesting. 

The notification contains a wealth of information about the rejected order, including details like the unique identifier, the timestamp of the rejection, the strategy that generated the signal, and a descriptive error message from the broker. 

It also includes comprehensive performance data for the position, such as profit/loss, peak profit, and maximum drawdown, providing a complete picture of the position’s performance up to the point of rejection.  You can find details on the order's original settings like take profit, stop loss, and DCA entries, alongside timestamps related to the signal's lifecycle. Finally, a `closeReason` indicates why the closing process was forced.

## Interface OrderRejectCloseContract

When a trading strategy attempts to close a position, but the system definitively rejects the order, this `OrderRejectCloseContract` is used. Think of it as the system saying "No, you can't close that position right now."

It's important to understand that this rejection means the system will automatically handle the closing of the position, using the original reason for attempting the close.

The `action` property will always be "signal-close" to indicate this type of rejection.  The `closeReason` property tells you *why* the closing order was refused.

## Interface OrderRejectBase

This event signifies that an order placed by your trading strategy was definitively rejected by the exchange, and no further attempts will be made. It’s a terminal event, meaning it's a final notification about a failed order – the system won't try to resubmit it. 

It can occur for either orders placed immediately or for orders scheduled to be placed later. The event provides a wealth of information about the rejected order, including details like the trading symbol, strategy name, the exchange involved, the exact time of the rejection, and the reason for the rejection as provided by the exchange. You’ll also find a snapshot of the position’s performance at the time of the rejection, including its current price, profit/loss, and drawdown.

It's important to understand that this event doesn't happen during backtesting simulations. It’s strictly a live-only notification. Also, temporary errors are handled automatically and don't trigger this event – you won't see it unless the exchange absolutely refuses the order.

## Interface OrderOpenContract

This event lets you know when a limit order has been filled, marking the start of a new trade. It's particularly useful for synchronizing your trading system with external services or logging activity. 

During backtesting, this event occurs when the candle price meets the criteria for opening a position – a low price for long positions or a high price for short positions. In a live trading environment, it’s triggered when the exchange confirms the order has been executed.

The event provides a wealth of information about the trade, including the price at which the position was opened, the current market price, the position's profit and loss (both overall and peak profit), the maximum drawdown experienced, and the original take profit and stop loss prices. You’ll also find details about the number of entries and partial closes, offering insights into any averaging or partial exits that occurred. The timestamps of signal creation and position activation are also included for precise tracking.

## Interface OrderFillOpenNotification

This notification confirms that a trade has been executed or a resting order has been placed on an exchange. It's a definitive signal, only sent *after* the exchange has confirmed the order – unlike the initial synchronization signal. This notification is exclusive to live trading environments, and it contains a wealth of information about the trade, including the timestamp, the exchange used, the signal identifier, and trade specifics.

Key details you'll find within this notification include:

*   **Order Type:** Whether it's an active order (filled immediately) or a resting order (placed to be filled later).
*   **Performance Metrics:**  Current profit/loss (PNL), peak profit, and maximum drawdown figures, along with related prices and percentages.
*   **Entry & Exit Prices:**  The price the trade was entered at (and how it was averaged), and potential take profit and stop loss prices.
*   **Trade Details:**  The position size, trade direction (long or short), and how many entries or partial closes were involved.
*   **Signal Context:**  Details about the signal itself, including its creation and activation timestamps, and any optional notes explaining why it was triggered.



The notification also includes information about trade attempts and the current market price at the time of confirmation, offering a comprehensive view of the trade’s lifecycle and performance.

## Interface OrderFillOpenContract

This describes what happens when a trading order is filled or placed. 

Essentially, it confirms that a trade has either happened (an "active" fill) or a request to enter a trade has been sent ("schedule").

The `action` property simply identifies whether it's an open fill or a scheduled order. 

The `cost` represents the total amount spent to initiate the position.

## Interface OrderFillCloseNotification

This notification confirms a trade has actually completed and been executed on an exchange. It's a final confirmation after an initial attempt to close a position.

Here's a breakdown of what it tells you:

*   **Details:** It provides a unique ID, a timestamp of when the trade was confirmed, and information about the strategy and exchange involved.
*   **Trade specifics:** It includes the trading symbol, order type, and the number of attempts it took to get the trade confirmed.
*   **Performance Data:** Crucially, it contains a snapshot of the position's performance, including profit/loss, peak profit, maximum drawdown, and associated prices and entry counts. This helps in evaluating the strategy’s effectiveness.
*   **Trade parameters:** You'll find the original and effective entry, take profit, and stop-loss prices used during the trade.
*   **Reason for closure:**  It tells you *why* the position was closed – was it a take profit, stop loss, or due to time expiration? An optional note can provide extra context.
*   **Timestamps:** It includes when the signal was initially created and when the position was activated.
*   **Important Note:** This notification only happens for real, live trades—it's never generated in backtesting environments.

## Interface OrderFillCloseContract

When a trade is closed and confirmed by the broker, this data structure represents the details of that closure. It indicates that the closure was triggered by a signal, meaning it wasn't a manual intervention. 

The `closeReason` property provides more specific information about *why* the position was closed – was it a take-profit event, a stop-loss trigger, a time-based exit, or something else? 

This information is crucial for understanding the complete lifecycle of a trade and analyzing the effectiveness of your trading strategy.


## Interface OrderFillBase

This interface describes the information provided when an order is actually filled, meaning it's confirmed by the broker – it’s not just an order attempt. These events are crucial for tracking actual trades and auditing performance. Keep in mind, you won't see these fills during backtesting because the process is simulated directly.

Here's a breakdown of the key details:

*   **`type`**: Indicates whether the fill is for an active order (opening or closing a position) or a scheduled order placed when a signal was initially created.
*   **`symbol`**: The trading pair like BTCUSDT.
*   **`strategyName`**: The name of the strategy that triggered the trade.
*   **`exchangeName`**: The exchange where the trade took place.
*   **`frameName`**:  The timeframe used for the trade (usually empty in live environments).
*   **`backtest`**: Always `false` because these fills are only real events.
*   **`signalId`**: A unique identifier for the signal, matching the adapter’s client order ID.
*   **`timestamp`**:  The exact time the order was confirmed.
*   **`signal`**:  All the data related to the signal that triggered the order.
*   **`attempt`**: The number of previous unsuccessful attempts before this successful order fill.
*   **`currentPrice`**: The market price at the moment of the fill.
*   **`pnl`**: The current profit and loss of the position.
*   **`peakProfit`**: The highest profit achieved by this position so far.
*   **`maxDrawdown`**: The largest loss experienced by this position.
*   **`position`**:  Whether the trade is a long (buy) or short (sell) position.
*   **`priceOpen`**: The average entry price, considering any DCA (Dollar Cost Averaging).
*   **`priceTakeProfit`**: The target price for selling, potentially adjusted by trailing stop-loss.
*   **`priceStopLoss`**: The price level where the position will be closed to limit losses, also potentially trailing.
*   **`originalPriceTakeProfit`**, **`originalPriceStopLoss`**, **`originalPriceOpen`**: These represent the initial values of the take profit, stop loss, and entry prices before any trailing or averaging adjustments.
*   **`scheduledAt`**: When the initial signal was created.
*   **`pendingAt`**: When the position was activated.
*   **`totalEntries`**: The total number of times the position has been averaged in.
*   **`totalPartials`**: The number of partial closes that have been executed.

## Interface OrderContinueContract

This event signals that the framework is continuing to monitor an order—it hasn't stopped or rejected it. It's a follow-up to an earlier check, indicating the order is still considered open on the exchange. The `type` property tells you whether it's an order backing an open position (`active`) or a resting order related to a scheduled signal (`schedule`).

The `attempt` value is crucial – it tracks how many times a check has temporarily failed before being tolerated. A value of `0` means the order check passed successfully, resetting any failure count. Values greater than `0` indicate transient failures were allowed, but the streak is tracked; too many failures will trigger a different event to stop the order.

Importantly, this event only happens in live trading, as backtesting doesn't perform these ongoing order checks. The data within the event – like symbol, strategy name, exchange, timestamp, and signal details – provides a snapshot of the order’s state at the moment the check occurred, including details like current price, unrealized profit/loss, and original/effective stop-loss and take-profit prices. You’ll also find information about the order's history, such as the number of DCA entries and partial closes.

## Interface OrderContinueCheckNotification

This notification signals that an order check has resolved, but isn't a terminal failure – meaning the order is still active or a temporary problem was tolerated. It's like a check-in to see if everything's still okay with an order, and it happens after a ping request is sent.

The notification contains a wealth of information about the order and its performance, including details like the trading symbol, strategy name, exchange, signal ID, and the type of order being monitored (active position or a scheduled entry). 

You'll find information about the order’s details like its entry and exit prices, take profit and stop loss levels, and the number of entries and partial closes. It also provides a detailed view of the position’s profitability, including realized and unrealized P&L, peak profit, and maximum drawdown metrics, plus all their associated prices and entry counts.

Finally, timestamps track when the signal was created and when it entered a pending state, along with any optional notes that describe the signal's reasoning. This notification is strictly for live orders and isn't used in backtesting environments.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiration, or a manual close. It's designed to help external systems, like order management tools or audit logs, stay in sync with what's happening in the trading process.

The event provides a wealth of information about the closed position. You'll see the current market price when the signal was closed, the overall profit and loss (PNL) realized, the highest profit achieved during the position's life, and the largest drawdown experienced. It also details the original and adjusted take profit and stop loss prices, along with the entry and activation timestamps.

Furthermore, the event includes details about how the position was built, indicating the number of initial entries and any partial closes that occurred. The `closeReason` property clearly explains why the signal was closed. This comprehensive data allows you to track the entire lifecycle of a trade and manage related operations accurately.

## Interface OrderCheckContract

This event, `OrderCheckContract`, is a signal sent during live trading to verify that an order placed by a strategy is still active on the exchange. It's crucial for ensuring that pending orders (like those for open positions) and scheduled orders (waiting to be triggered) haven't been unexpectedly filled, canceled, or liquidated externally.

The `type` property tells you whether you're checking on an active position ("active") or a waiting order ("schedule"). The `attempt` property tracks consecutive failures – a successful check resets this counter, while repeated failures can trigger automatic actions like canceling a scheduled order or closing a pending position.

The information provided includes details about the trade, like the symbol, strategy name, prices, profit/loss, and position direction. A critical aspect is how you respond to this event; returning true confirms the order is still valid, while throwing specific errors (like `OrderDeletedError`) allows the framework to handle the situation. Transient errors (false returns or generic errors) are tolerated with retries, up to a defined limit. This whole process doesn't happen during backtesting.


## Interface MetricStats

This object holds the summarized statistics for a particular metric during a backtest. It tells you how many times that metric was recorded and provides a detailed breakdown of its performance. 

You'll find information like the total time spent, the average duration, and the minimum and maximum values observed for the metric. To understand the spread of the data, it also includes the standard deviation, median, and various percentiles (like the 95th and 99th percentiles). 

Finally, it offers insights into the timing of events by showing average, minimum, and maximum wait times between occurrences. Essentially, it’s a complete picture of how a specific metric behaved throughout the backtest.

## Interface MessageModel

This describes a message within a chat history, like those you'd see in a conversation with an AI. Each message has a role, which tells you who sent it—whether it's a system instruction, a user's question, the AI's reply, or even the results from a tool the AI used.

The message also contains the actual text content, although sometimes an AI message might be empty if it only includes tool usage details.  For some AI providers, you might also see reasoning or step-by-step thought processes displayed alongside the content. 

If the AI used a tool, the message will list the specific tool calls made.  Images can be attached to messages too, and these can be provided as blobs, raw bytes, or encoded strings. Finally, a message can refer to a specific tool call ID, indicating a response related to a particular action.

## Interface MaxDrawdownStatisticsModel

The MaxDrawdownStatisticsModel helps you track and understand the maximum drawdowns experienced during a trading backtest. It essentially keeps a record of the worst drops in your portfolio's equity.

The `eventList` property holds a chronological list of these drawdown events, with the most recent ones appearing first.  Each entry in this list provides details about a specific drawdown.

Finally, `totalEvents` gives you a simple count of all the drawdown events that have been recorded during the backtest.

## Interface MaxDrawdownEvent

This event represents a single instance of maximum drawdown experienced during a trading position. It holds detailed information about the circumstances surrounding that drawdown.

You'll find the exact timestamp, the trading symbol involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade. It also specifies whether the position was a long or short one.

The record contains financial data, including the total profit and loss (PNL) of the trade, the highest profit achieved, and the amount of the maximum drawdown itself.  

Beyond that, you'll see the price at which the drawdown occurred, the initial entry price, and the specified take profit and stop loss levels. Finally, it indicates whether this event happened during a backtesting simulation.

## Interface MaxDrawdownContract

This contract provides updates whenever a new maximum drawdown occurs on a trading position. It’s designed to give you the data you need to react to significant losses and manage risk effectively.

The updates include essential details like the trading symbol, the current price, and the precise timestamp of the drawdown event. You’ll also see information about the strategy, exchange, and timeframe involved, alongside the public signal data that triggered the position.

A crucial flag indicates whether the drawdown event happened during a backtest or in live trading, letting you tailor your response accordingly. Tracking these max drawdown events is a vital part of proactive risk management and adapting to changing market conditions.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed breakdown of your trading performance, offering a wealth of data for analysis. It tracks every event – from initial setup to closed positions – and calculates numerous metrics to assess your strategy's effectiveness. 

You'll find basic counts like total trades, wins, and losses, alongside key profitability measures such as average and total profit/loss.  More sophisticated indicators, including Sharpe and Sortino ratios, assess risk-adjusted returns, while volatility metrics like standard deviation help gauge the consistency of your trades. 

Duration statistics provide insight into how long trades typically last, and metrics like buyer/seller pressure and trend strength give clues about prevailing market sentiment.  Finally, the model also tracks consecutive win/loss streaks and median values for a more complete view of the trade distribution. All numerical values are carefully handled, set to null when calculations are potentially unreliable, guaranteeing data integrity.

## Interface InfoErrorNotification

This component handles notifications about errors that occur during background processes, but aren't critical enough to halt everything. 

Each notification has a unique identifier (`id`) to help track it. 

The `error` property contains detailed information about the error, including the stack trace and any extra data that might be useful for debugging.  A human-friendly explanation of the problem is provided in the `message` field. 

Importantly, these errors originate from the live trading environment, so `backtest` is always `false`. The `type` field confirms the notification's category as an "error.info" message.

## Interface IdlePingContract

The IdlePingContract represents notifications sent when a trading strategy isn't actively making trades. It's a signal that the strategy is in an idle state, meaning it's not responding to any current trading signals.

This notification includes key details about the idle strategy: the trading symbol, its name, the exchange it's running on, the frame name (if it's a backtest), and the current price of the asset.

You can subscribe to these idle ping events to monitor the lifecycle of your trading strategies and understand when they are waiting for new trading opportunities.

The notification also indicates whether the event originates from a backtest (historical data) or live trading. Finally, it includes a timestamp, reflecting when the ping occurred – either the tick time in live mode or the candle timestamp during backtesting.

## Interface IWarmCandlesParams

This interface defines the settings needed to pre-load historical candle data. Think of it as telling the system what data it needs to have ready before a backtest begins. You specify the trading pair like "BTCUSDT," which exchange you're using, the timeframe of the candles (e.g., 1-minute candles, 4-hour candles), and the starting and ending dates for the data you want to download. This helps ensure your backtest runs smoothly with all the necessary historical information.

## Interface IWalkerStrategyResult

This interface defines the result you get when running a trading strategy within backtest-kit. Each strategy run produces a result object containing the strategy's name, detailed statistics about its performance (like profit, drawdown, and Sharpe ratio), a specific metric value used for comparing it against other strategies, and a rank indicating its overall position in the comparison. The rank signifies which strategy performed the best, second best, and so on, based on the chosen metric.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up an A/B test comparing different trading strategies. Think of it as a blueprint for running a controlled experiment on your strategies. 

You specify a unique name for the test itself, and can add a note to describe what the test is for. 

The schema also dictates which exchange and timeframe will be used for all strategies involved in the comparison. 

Most importantly, you list the names of the strategies you want to test – these strategies must have been previously registered in the system.

You can choose what metric will be used to evaluate the performance of each strategy, with a default of "sharpeRatio". Finally, you have the option to define callbacks to trigger specific actions at different points during the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtest run across different strategies. It essentially summarizes the entire testing process. 

You'll find details like the specific trading symbol that was evaluated. It also records which exchange was used for the backtest and the name of the walker that performed the analysis. Finally, it tells you which timeframe (or "frame") was used in the backtest.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtest process. Think of it as a way to listen in on what’s happening as the backtest kit compares different trading strategies. 

You can define functions to be run when a strategy begins (`onStrategyStart`), when it finishes successfully (`onStrategyComplete`), or when it encounters a problem (`onStrategyError`). 

Finally, `onComplete` is called once all strategies have been tested, giving you the overall results. This provides detailed insights into the performance of each strategy and the overall backtest.

## Interface ITrailingTakeCommitRow

This interface represents a single action queued for a trailing take commit strategy. It describes a specific instruction to adjust a trade based on a trailing price.

The `action` property identifies this as a "trailing-take" action, clearly indicating its purpose within the trading strategy.  The `percentShift` defines the percentage change from the current price that triggers the action – essentially, the amount the price needs to move to execute the take commit. Finally, `currentPrice` records the price level at which the trailing stop was initially established, providing context for the shift calculation.

## Interface ITrailingStopCommitRow

This interface represents a queued action for a trailing stop order. Think of it as a record of a change you want to make to a trailing stop. 

It includes information like the type of action being performed ("trailing-stop"), the percentage shift you're applying to the stop price, and the price at which the trailing stop was initially set. 

Essentially, it's a snapshot of the data needed to update a trailing stop order.

## Interface ISweepTrade

The `ISweepTrade` interface defines the structure of a single trade executed within the backtesting framework. Each trade is linked back to the original idea that prompted it, identified by `ideaId` and the `author` who created it.  The `symbol` property clearly identifies the trading pair used.

Trades are also tracked with important timing information, including `entryTimestamp` and `exitTimestamp` (both in milliseconds since the Unix epoch), and a `exitReason` to explain why the trade was closed.  `holdMinutesActual` represents the trade's duration in minutes.

The trade's profitability is recorded as `pnlPercent`, reflecting the percentage profit or loss after fees.

Finally, the `absorbedIdeas` array lists any other trading ideas that were temporarily blocked from executing because this trade occupied the necessary entry slot, allowing for a detailed view of which ideas were superseded.

## Interface ISweepTrack

This interface represents a single trading track, essentially a record of how an author performed under a specific set of trading rules. Think of it as a detailed report card for a trader's strategy.

Each track contains a full set of rule parameters – how long the position is held, the lock percentage, the hard stop percentage, and the trailing take percentage – alongside the author’s login. 

The track then records key performance metrics: the total number of ideas the author generated, the number of those ideas that resulted in a "hit" (where the lock or trailing arm triggered before the stop), and the resulting hit rate (hits divided by ideas). 

Importantly, this isn't a simple pass/fail system; it’s a continuous record allowing you to assess an author's reliability based on their track record. No ideas are excluded, even if they were cut short due to data limitations, and those are considered misses. The goal is to provide raw data to evaluate performance, rather than applying pre-defined thresholds.

## Interface ISweepSchema

This schema defines how to register a sweep, which is essentially a configuration for testing a trading strategy. Each sweep needs a unique name to identify it within the system.

It also specifies which exchange will provide the historical candle data for evaluating the strategy—be mindful that the exchange must provide the exact number of candles expected or an error will occur. Any incomplete data results in a "truncated" profile, which impacts the backtest results.

The `gridAxes` section lets you fine-tune specific aspects of the trading grid, overriding the default settings. You can freeze an entire axis by providing a single value, or selectively adjust parts of the grid. Each axis has its own set of rules on how tuning works.

The `reportOrder` property dictates how the backtest results are sorted when generating reports; by default, it's sorted by Sharpe Ratio. This sorting doesn't impact how the best trades are selected or how tracking data is handled.

Finally, the `callbacks` section offers optional functions that can be triggered during the sweep process, such as when a new set of trading rules is applied. These callbacks are not required and can be omitted without impacting the sweep’s functionality.

## Interface ISweepResult

The `ISweepResult` object represents the outcome of a backtest simulation. It contains a summary of the simulation's performance and details about the trades executed.

It tells you the trading symbol the simulation focused on, along with the total number of ideas (signals) received and those used for directional trades.

You'll also find information on how many "profiles" were constructed from the idea data – these represent individual trade setups.  It tracks how many profiles were incomplete due to the end of available data.

The result includes statistics about trade durations, such as the average holding time and the 95th and 99th percentile holding times, providing insight into how long trades typically lasted.

Finally, the `reports` property bundles all the detailed scoring and ranking information for each grid point, including the top-performing trades and the contribution of different sources ("authors") to those trades.

## Interface ISweepPointReport

This report summarizes the performance of a specific grid point within a trading strategy backtest. It provides a comprehensive view of the trades executed at that point, going beyond simple profit and loss.

The report includes metrics like the total and average profit percentages, the win rate, and key risk measures such as maximum drawdown and recovery factor. It also details how long trades were held, using averages and percentiles to show typical and outlier holding times.

Performance ratios like Sharpe and Sortino are calculated to assess risk-adjusted returns, factoring in the time capital was tied up in trades. It also breaks down how often trades ended, categorized by the reason for exit.

Crucially, the report includes a complete list of all trades executed at that grid point, allowing for detailed investigation into individual trade outcomes and their contribution to the overall result. This complete trade list enables in-depth analysis and troubleshooting of the strategy's behavior at that particular grid level.

## Interface ISweepParams

The `ISweepParams` object holds all the settings your sweep client needs to run. Think of it as a collection of configurations, including how to log messages with the `logger` property.

It also defines the `gridAxes`, which specifies how the sweep will explore different parameter combinations—you'll use this to control the scope of your testing. 

Finally, `reportOrder` determines how the sweep results are sorted and presented, making it easy to analyze the best-performing strategies. These properties are all set up and ready to go.

## Interface ISweepMetricReport

This report summarizes the results of a backtesting sweep. It contains all the data for each grid point, ranked by a single metric—profit before stop. 

The core of the report is the `reports` array, which lists each grid point's performance and is sorted to highlight the best performers. 

Alongside the individual reports, the `best` section identifies the top performers based on four different ranking criteria.

Finally, `tracks` provide a detailed log of how different trading rules (like stop-loss strategies or trailing stops) affected the results, attributed to specific authors. This allows for examination of rule combinations without needing to look at every individual data point. Essentially, it provides a compact, ready-to-analyze snapshot of trading rule performance.

## Interface ISweepIdeaProfile

This data structure represents the performance of a trading idea over a specific period. Think of it as a detailed record of how an idea's price moved, from its initial entry point to the end of the observation window. 

It contains the original trading idea, the exact time and price when the trade was initiated, and a series of historical price data points (candles) representing the trade's journey.

Crucially, the data includes metrics to assess the idea's effectiveness. These metrics cover whether the idea was ultimately profitable, the largest positive and negative price swings, the time it took to reach those extremes, and a measure of how consistently the price moved in the expected direction. These metrics are calculated across the entire observation period, providing a comprehensive view of the idea’s behavior. Finally, a flag indicates if the data was cut short.

## Interface ISweepIdea

An `ISweepIdea` represents a single trading suggestion or forecast made publicly by someone. Think of it as a single, specific trading idea. Each idea focuses on a particular trading pair, like BTCUSDT, and predicts whether the price will go up or down. 

When running simulations with this framework, the calculations and testing are done for each idea individually, not for broader grid configurations.

Each idea has a unique ID, the date and time it was published, the symbol it relates to, the predicted direction, and the username of the person who made the forecast.


## Interface ISweepGridPoint

This interface defines a single point within a sweep grid, essentially a specific trading setup. Each point has a hard stop level, which is a percentage away from your entry price where you’ll exit if the price moves against you. It also includes a trailing take level, a percentage below the highest price seen since entering the trade that triggers a profit-taking exit. You can set a maximum time, in minutes, for how long a position will be held, and configure a profit lock mechanism that aims to secure gains once a certain price level is reached. If a feature is disabled, set its value to zero.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines how different parameters are explored when creating a trading grid. Think of a grid as a series of possible trade setups, and this interface describes the ranges of values you'll test for key settings.

Each property—`hardStopPercent`, `trailingTakePercent`, `holdMinutes`, and `profitLockPercent`—represents a configurable element of a trade.  `hardStopPercent` controls the maximum allowable loss; `trailingTakePercent` defines how much price pullback is permitted before a trailing stop is activated; `holdMinutes` sets the maximum duration a position can be held; and `profitLockPercent` establishes a profit level that, once reached, locks in a portion of the gains.

These aren't arbitrary settings. Each one affects how a trade is evaluated and graded, influencing factors like loss protection, profit capture, and trading frequency.  The "Ignored" section for each property details the rare situations where a particular setting wouldn't be applied. Importantly, every axis is actively used, and there's a rationale explained for why.

## Interface ISweepCallbacks

The `ISweepCallbacks` interface lets you hook into the different stages of a backtesting simulation, allowing you to monitor its progress and receive detailed information. Think of it as a way to get real-time updates on what's happening behind the scenes during the backtest.

You can track the progress of long-running tasks like profile creation, with the `onProgress` callback, which tells you how many items have been processed and how many are left.

The `onIdeas` callback provides information about the total number of ideas generated and how many of those are directional.

When the simulation builds profiles for each idea, the `onProfiles` callback is triggered, letting you know if any profiles were truncated due to limitations in candle data.

The `onAuthorsTrained` callback gives you insights into the performance of individual authors for each unique grading rule, providing raw data about their ideas and hit rates.

For each grid point evaluated, the `onGridPoint` callback delivers a report along with the resulting trades.

After a report bucket is evaluated, the `onRanking` callback sorts the reports based on a given criterion and identifies the best performer.

Finally, when the entire simulation completes, the `onDone` callback provides the overall result.

## Interface ISweepBest

This interface represents the best result within a sweep, focusing solely on the ranking criterion that determined the winner. It provides the criterion used for ranking and a link to the complete report associated with that winning point. The actual trades and author tracks are not included here; they're found within the report itself to avoid redundancy. Think of it as a pointer to the details of the top-performing point for a specific ranking method. If no winning point is found, the report will be null.

## Interface ISweepAbsorbedIdea

This interface represents a trading idea that wasn't executed because a previous trade by the same author already occupied the available slot. Think of it as a signal that was "missed" due to existing commitments. It includes the unique identifier of the idea and the author who generated it, allowing for straightforward analysis without needing to combine separate data sources. It's designed to simplify tracking why certain ideas didn’t result in a trade.

## Interface ISweep

The `ISweep` interface lets you kick off a complete backtesting simulation. You provide a stock ticker symbol and a list of testing ideas – these ideas will guide the entire process. The `run` method executes the full sweep, encompassing everything from initial profile creation and filtering, to grid evaluations, and finally producing ranked results. Essentially, it's your one-stop method for running a full backtest with custom ideas.

## Interface IStrategyTickResultWaiting

This interface describes the data you receive when a trading strategy is waiting for a signal to activate. It happens repeatedly, after the signal is initially created.

Essentially, it means the strategy is keeping an eye on the price to see if it matches the conditions needed to trigger the signal.

The data includes details about the signal itself, the current price being monitored, which strategy and exchange are involved, the timeframe, the trading pair, and some financial information like potential profit and loss.  You'll also see whether the data is coming from a backtest or a live trading environment, and a timestamp.  Importantly, progress towards take profit and stop loss is always zero in this "waiting" state.

## Interface IStrategyTickResultScheduled

This interface represents a tick result when a strategy generates a scheduled signal—essentially, it’s waiting for the price to reach a specific point. Think of it as a notification that the strategy wants to act, but isn't quite ready yet. 

It includes key information for tracking and debugging, such as the strategy’s name, the exchange, the timeframe, and the symbol being traded. You’ll find the current price at the time the signal was scheduled, and a flag to indicate whether this is happening in a backtest or live trading environment. It also includes a timestamp marking when this result was created. The `action` property is a key identifier, confirming that the action taken was a "scheduled" one.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It's a notification that a signal has been successfully generated and saved.

You'll receive this notification after a signal is validated and persists in the system. 

The notification includes important details such as:

*   The name of the strategy that generated the signal
*   The exchange and timeframe the signal relates to
*   The trading symbol (like BTCUSDT)
*   The price at the time the signal was created
*   Whether it's a backtest or a live signal
*   A timestamp indicating when the signal was created 
*   And, most importantly, the newly created signal itself, complete with its unique identifier.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an idle state, meaning it's not currently acting on any signals. It provides a record of the conditions at the time, including the strategy's name, the exchange being used, the timeframe of the data, and the trading symbol. You'll find the current price at that moment, whether the data comes from a backtest or live trading, and the exact time the event was recorded. Essentially, it's a snapshot of the market conditions when your strategy is patiently waiting for a new opportunity.

## Interface IStrategyTickResultClosed

This data represents the outcome when a trading signal is closed, providing a comprehensive snapshot of the event. It includes details like the reason for the closure – whether it was due to a time limit, a stop-loss, a take-profit target, or a manual close. 

You'll find information about the completed signal itself, the closing price, and a full breakdown of the profit and loss, including any fees or slippage encountered. 

The record also tracks the strategy's name, the exchange used, the timeframe involved, and whether the trade occurred during a backtest. A unique ID is assigned for manually closed trades, and the record contains the timestamp of its creation.

## Interface IStrategyTickResultCancelled

This interface describes a special kind of trading result – one where a planned signal was cancelled before it could actually lead to a trade. This happens, for instance, if the signal's conditions aren’t met or a stop-loss is triggered before a position can be opened.

The `action` property clearly indicates this is a cancellation.

You’ll find details about the cancelled signal itself under the `signal` property, allowing you to see exactly what was intended. 

Along with this, the `currentPrice` tells you the final price at the moment of cancellation. You'll also see the exact timestamp (`closeTimestamp`) and identifying information – the strategy's name, exchange, time frame, and the trading pair (`strategyName`, `exchangeName`, `frameName`, `symbol`).

The `backtest` flag lets you distinguish between simulated and real-time trading results.

The `reason` property explains *why* the signal was cancelled. A unique `cancelId` is included if the cancellation was initiated by a user request. Finally, `createdAt` notes the time the result itself was generated, linking it to the original candle or execution context.

## Interface IStrategyTickResultActive

This interface describes the result when a trading strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It provides detailed information about the ongoing situation.

The `action` property confirms the result is in an "active" state. You'll find the `signal` being monitored, along with the `currentPrice` used for comparison.

Information about the strategy and trade itself is included, like `strategyName`, `exchangeName`, `frameName`, and `symbol`.  The `percentTp` and `percentSl` show how close the trade is to its target profit or loss levels.

The `pnl` property gives the unrealized profit and loss, accounting for factors like fees and slippage.  A `backtest` flag indicates whether this result is from a historical simulation or live trading. Timestamps, `createdAt` and `_backtestLastTimestamp`, track when the result was generated and the last candle processed, useful for backtesting coordination.

## Interface IStrategySchema

The `IStrategySchema` defines how a trading strategy is set up and registered within the backtest-kit framework.  Each strategy needs a unique identifier, `strategyName`, to be recognized.

You can also add a `note` for developers to provide extra context or documentation.

The `interval` property controls how frequently the strategy attempts to generate signals, preventing overwhelming the system.  By default, this is set to once a minute.

The core logic of the strategy resides in the `getSignal` function.  This function receives market data (symbol, timestamp, current price) and must return a signal or null if no action is warranted. It can be configured to wait for a specific entry price (`priceOpen`).

You can customize a strategy's behavior further using `callbacks` for events like trade opening and closing. 

`riskName` and `riskList` allow you to associate the strategy with a defined risk profile for risk management purposes.  Multiple risk profiles can be linked with `riskList`.

Finally, `actions` enables linking a strategy to specific actions and `info` allows including runtime data for custom monitoring or external processes.

## Interface IStrategyResult

This interface represents a single row in a comparison table when evaluating trading strategies. Each entry describes a strategy and includes its name, a detailed set of backtesting statistics, and the value of the metric used to rank the strategies. To help understand the strategy's activity over time, it also records the timestamps of the first and last trade signals generated. If a strategy didn’t produce any signals, those timestamp fields will be empty.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss result of a trading strategy. 

It breaks down the performance by showing you the percentage gain or loss, which is how much your investment grew or shrank.

You'll also find the entry and exit prices, but keep in mind these have been adjusted to factor in typical trading costs like fees (0.1%) and slippage (0.1%).

The `pnlCost` property shows the actual dollar amount of profit or loss you made.  Finally, `pnlEntries` tells you the total amount of capital you initially put into the trades.

## Interface IStrategyCallbacks

This interface provides a way to receive notifications about significant events happening within your trading strategy. You can use these callbacks to monitor your strategy's activity, log data, or trigger custom actions.

The `onTick` callback is triggered on every price update, giving you continuous access to the latest market data. 

You'll get notifications when a new signal is `onOpen`, when a signal enters an `onActive` monitoring state, and when the system transitions to an `onIdle` state with no active signals.

The `onClose` callback is called when a signal is closed, providing the final closing price.  You'll also be notified when a signal is `onSchedule` (created with a delayed entry), `onCancel` (cancelled without a position), or when it hits `onPartialProfit`, `onPartialLoss`, or `onBreakeven` states.

For signals scheduled for later entry, `onSchedulePing` is called every minute, allowing for custom monitoring. Similarly, `onActivePing` provides minute-by-minute updates for actively pending signals, allowing you to perform dynamic adjustments. The `onWrite` callback is specifically for persisting data during backtesting.

## Interface IStrategy

The `IStrategy` interface defines the core methods a trading strategy needs to function. It's all about how the strategy reacts to market ticks and manages its positions.

**Key Responsibilities:**

*   **`tick`**: This is the heart of the strategy - what happens on each price update. It checks for signals, potential profit targets (TP), and stop-loss levels (SL).
*   **Signal Retrieval**: `getPendingSignal` and `getScheduledSignal` fetch existing signals, essential for ongoing TP/SL monitoring and time expiration checks.
*   **Risk Management**: Functions like `getBreakeven`, `getStopped`, and `getPaused` are crucial for controlling risk and the strategy's operational state.
*   **Position Management**: Methods like `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionInvestedCost`, and the `*Position*` functions reveal details about a pending position, like DCA entries and estimated profit/loss.
*   **Backtesting**: The `backtest` method lets you test a strategy against historical data to evaluate its performance.
*   **Control & Intervention**:  `stopStrategy`, `cancelScheduled`, `activateScheduled`, `closePending` provide external control points for pausing, stopping, or manipulating signals.
*   **Signal Creation and Modification**: `createSignal`, `createTakeProfit`, `createStopLoss`, `partialProfit`, and `trailingStop` allow controlled signal generation and adjustments.
*   **Status and Metrics**: Several methods (`getStatus`, `getPositionEstimateMinutes`, etc.) provide insight into the strategy's internal state, helpful for debugging and understanding how the strategy is behaving.

Essentially, this interface lays out the blueprint for a trading strategy's lifecycle – from receiving market data to managing positions and reacting to various conditions.

## Interface IStorageUtils

The `IStorageUtils` interface defines the core functions that any storage system used with backtest-kit must provide. It's essentially a contract ensuring consistent data handling across different storage solutions. 

This interface includes methods for reacting to different signal events like when a position is opened, closed, scheduled, or cancelled.

You'll also find functions for retrieving signals: one to look up a specific signal by its ID and another to list all signals that are currently stored.

Finally, there are mechanisms to handle "ping" events related to active and scheduled signals, which are used to keep track of signal activity and update timestamps. These ping handlers keep your data current.

## Interface IStorageSignalRowScheduled

This interface represents a signal that has been scheduled for execution. 

It includes two key pieces of information: the signal's status, which is always "scheduled," and the price at the time the signal was scheduled. This price, `currentPrice`, is essentially a snapshot of the market conditions when the signal was planned, and it's directly linked to the `IStrategyTickResultScheduled` data.

## Interface IStorageSignalRowOpened

This interface represents a signal row specifically for when a trade is opened. It tells you the signal is in an "opened" state. You'll also find the current price at the moment the signal triggered, which is the VWAP price at that opening time – think of it as a record of the price when the trade began. This data helps track and analyze trade entries.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed and finalized. It holds all the information about how the signal performed when it ended, including its profit and loss. You’ll find details like the final price at which the signal was closed, the reason for the closure, and the exact time it occurred. This record is essential for understanding the complete lifecycle and profitability of a closed trading signal.


## Interface IStorageSignalRowCancelled

This describes a record representing a trading signal that has been cancelled. Specifically, it confirms that the signal's `status` is "cancelled," indicating that the signal is no longer active or valid. It’s a simple way to track when a signal is marked as cancelled within a trading system.

## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, defines the fundamental structure for storing signals within the backtest-kit framework. It serves as the blueprint for all signal storage rows, ensuring consistency across different signal states.

Each signal row will include a `createdAt` timestamp, marking precisely when the signal was generated. 
An `updatedAt` timestamp tracks the last time the signal was modified.
Finally, a `priority` field determines the order in which signals are processed, defaulting to the current time to ensure fair handling during both live trading and backtesting scenarios.


## Interface IStateParams

`IStateParams` helps you set up how your signals will store and manage their data. Think of it as defining a container, `bucketName`, to organize related information – like “trade” for trade-specific data or “metrics” for performance indicators. You also specify a starting point, `initialValue`, which is used when no prior data is available for that signal; this ensures your signal always begins with a known state. This lets you structure and initialize your signals effectively.

## Interface IStateInstance

The `IStateInstance` interface describes how state is managed within the backtest-kit framework. It's designed to provide a place to store information that changes over time for each trading signal, particularly useful for strategies that use AI to make decisions and track how those decisions play out. Think of it as a customizable container for data relevant to a single trade, like its highest unrealized profit, how long it's been open, and when to cut losses.

This interface lets you manage and retrieve this evolving data, ensuring that older data isn't accessed prematurely.  You can initialize the state, read its current values, and update it with new information. Updates are cleverly handled so that tests can restart and reset this data without problems.  Finally, you can release any resources the state instance might be using when you’re finished with it.

## Interface ISizingSchemaKelly

This schema defines how much of your capital to risk on each trade using the Kelly Criterion. 

The `method` is always "kelly-criterion" to identify this specific sizing approach.

The `kellyMultiplier` controls the aggressiveness of your sizing. It’s a number between 0 and 1; a lower number like 0.25 (the default) means you’re risking a smaller fraction of your capital per trade, while a higher number increases the risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading strategy where the size of each trade is determined by a fixed percentage of your available capital. 

The `method` property is always set to "fixed-percentage" to identify this sizing approach.

The `riskPercentage` property specifies the maximum percentage of your capital you're willing to risk on a single trade. This value should be between 0 and 100.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, often used to distinguish different sizing strategies. You can also add a note to provide context or documentation for developers working with the configuration.

To manage risk, sizing schemas specify limits: a maximum percentage of the account that can be used for a position, a minimum absolute size for a position, and a maximum absolute size.

Finally, you can optionally include callback functions to customize the sizing behavior at different points in the process. This allows for more complex and dynamic sizing logic.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). 

It includes a `method` property, which is always set to "atr-based" to indicate the sizing approach. 

You also specify a `riskPercentage` – the portion of your capital you're willing to risk on each trade, expressed as a number between 0 and 100. Finally, `atrMultiplier` determines how far your stop-loss will be placed based on the ATR value; a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes within the backtest-kit framework. It's primarily used when creating a `ClientSizing` object. 

The `logger` property allows you to specify a logger service. This is useful for outputting debugging information and insights related to the sizing calculations.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for sizing trades using a fixed percentage of your capital. It ensures you have a way to log debugging information related to the sizing process, which is helpful for understanding how your trades are being sized. The `logger` property is where you'll provide the logging service.

## Interface ISizingParamsATR

This interface defines the parameters needed to control how much of your capital is used for each trade when using an ATR-based sizing strategy. It includes a `logger` property, which is important for receiving helpful debugging information about your sizing calculations. The logger helps you understand how your sizing parameters are impacting your trades and troubleshoot any issues.

## Interface ISizingCallbacks

This section defines how you can get notified when the framework determines how much of an asset to trade. The `onCalculate` callback function is triggered immediately after the size calculation process is complete. You can use this function to inspect the calculated size, log details for auditing, or even perform checks to ensure the size is reasonable – essentially, to keep an eye on how your sizing logic is behaving. The function receives the calculated quantity and a set of parameters related to the sizing calculation as input.

## Interface ISizingCalculateParamsKelly

When you're using the Kelly Criterion to determine your trade sizes, you'll need to provide some information. This `ISizingCalculateParamsKelly` interface defines what's needed. Specifically, you'll need to tell the system that you're using the "kelly-criterion" method.  Then, you need to input your win rate, expressed as a number between 0 and 1. Finally, you'll provide the average win/loss ratio you've observed from your trading.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the settings needed for a trading sizing strategy that uses a fixed percentage of your capital for each trade. 

It requires you to specify the `method` as "fixed-percentage" to indicate you're using this sizing approach. You also need to set the `priceStopLoss`, which represents the price level at which a stop-loss order will be triggered.

## Interface ISizingCalculateParamsBase

This defines the basic information needed for calculating how much to trade – the sizing process. Every sizing calculation will need to know the symbol of the trading pair, like BTCUSDT. It also requires the current balance in your account and the price at which you plan to enter the trade. Think of it as the foundation for determining your trade size.

## Interface ISizingCalculateParamsATR

This section details the parameters used when sizing trades using an ATR (Average True Range) based method. 

The `method` property must be set to "atr-based" to indicate you're using this sizing approach.

You'll also need to provide the `atr` value itself, which represents the current Average True Range and is a numerical value. This value will be used in the calculations to determine the appropriate trade size.

## Interface ISizing

The `ISizing` interface is crucial for determining how much of an asset to trade in a backtest. Think of it as the logic that decides your position size.

It has one core method, `calculate`, which takes parameters defining your risk tolerance and trading goals. This method returns a promise that resolves to the calculated position size – a number representing how much to buy or sell. This calculation happens behind the scenes during strategy execution, allowing your strategy to adapt its size based on market conditions and your risk preferences.


## Interface ISignalRow

This `ISignalRow` interface represents a complete trading signal within the backtest-kit framework. Think of it as a finalized, validated signal ready for execution. Each signal has a unique identifier (`id`) and a cost associated with it.

It contains all the key details needed to execute a trade, including the entry price (`priceOpen`), expected holding time (`minuteEstimatedTime`), and identifiers for the exchange, strategy, and frame used (`exchangeName`, `strategyName`, `frameName`). You'll also find the time it was initially created (`scheduledAt`) and when it became pending (`pendingAt`).

Beyond the basic details, the signal also tracks its performance and history. It stores partial closing information (`_partial`) to allow for accurate Profit and Loss (PNL) calculations.  Trailing stop-loss and take-profit prices are also managed here (`_trailingPriceStopLoss`, `_trailingPriceTakeProfit`), which dynamically adjust based on price movement.

The `_entry` property holds a record of any Dollar Cost Averaging (DCA) entries made. The `_peak` and `_fall` properties track the highest and lowest prices seen during the position's lifetime, for calculating VWAP and determining profit/loss potential. Finally, the `timestamp` represents when the signal was created or retrieved.


## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to retrieve them in batches. Think of it as a container for a signal, identified by a unique ID. It’s used within a system that delays the next signal until a specific time interval has passed, allowing for more efficient signal delivery. The `id` property simply assigns a unique identifier to each signal.

## Interface ISignalDto

The ISignalDto represents a trading signal, essentially a set of instructions for a trade. 
It contains all the necessary information to execute a trade, including the ticker symbol, whether you're buying (long) or selling (short), and a description of why you're taking the trade. 

You'll find details like the entry price, target take profit price, stop loss price and the expected duration of the trade.
A unique ID is automatically generated for each signal, so you don't need to provide one.
The signal also includes the cost of the trade in USD, which has a default value if not specified.

## Interface ISignalCloseRow

This interface represents a signal row, but specifically when a trade has been closed. 

It builds upon the standard `ISignalRow` and adds information about how the close was triggered – namely, if it was initiated by the user. 

If a user closed a position, you'll find a `closeId` indicating the unique identifier of that close event, and a `closeNote` containing any explanation or details the user provided. If it was not a user-initiated close, these properties will be absent.

## Interface ISessionInstance

The `ISessionInstance` interface is like a temporary workspace for your trading strategies. It's designed to hold information specific to a combination of symbol, strategy, exchange, and time frame. Think of it as a place to store things like the results of complex calculations, intermediate indicator values, or even the output from an AI model used for signal generation.

This space is meant to be mutable, so you can change the data as your strategy runs.

Here’s what you can do with an `ISessionInstance`:

*   **Initialization:** You can signal when the session is ready.
*   **Store data:** You can write new data to the session, along with a timestamp indicating when that data is valid.
*   **Retrieve data:** You can read data from the session, but importantly, it prevents looking ahead in time – you can't access data from the future.
*   **Cleanup:**  When you're done with the session, you can release any resources it's holding.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that’s set to trigger only when the price reaches a specific level. Think of it as a signal on hold, waiting for a price target. It builds upon the standard `ISignalRow` to incorporate a delayed entry. 

Once the price hits the defined `priceOpen` value, this signal transforms into a normal, pending signal ready to execute.

A key feature is that the `pendingAt` time will initially reflect the scheduled time but will later update to the actual time when the signal activates based on the price.

The `priceOpen` property defines the target price that needs to be reached before the signal becomes active.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might be cancelled by the user. 

It builds upon the standard scheduled signal information, adding details specific to cancellations.

If a user initiates a cancellation, it includes a unique `cancelId` to identify the cancellation request, and a `cancelNote` to provide additional context about why the signal was cancelled. These fields are only present when a user has requested the cancellation.

## Interface IScheduledSignalActivateRow

This interface represents a scheduled signal, but with an added feature: it allows for user-triggered activations. If a signal is activated by a user, it will include an `activateId` to identify the specific activation event and an `activateNote` to provide a brief explanation or reason for the user's action. These extra details are not present for signals that activate automatically according to their schedule.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, essentially defines the timeframe your backtest covers. 

It tells the backtest system *when* to run your trading strategy – specifying both a starting date and an ending date. 

Think of it as setting the boundaries for your historical data analysis.  The `from` property holds the start date, and the `to` property holds the end date.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides vital details about the current trading situation. It tells you what symbol you're trading, like "BTCUSDT," and defines the time period being analyzed during a backtest. 

If you're using custom strategies, you can pass along extra information using the `info` property for things like custom monitoring or reporting. 

You'll also get context, including the exchange and strategy names, alongside the precise timestamp (`when`) and the current market price (`currentPrice`). Finally, `IRuntimeInfo` confirms whether the strategy is running in backtest mode.

## Interface IRunContext

The `IRunContext` acts like a central hub, providing all the necessary information when running code within the backtest-kit framework. It bundles together details about where the code is running – which exchange, strategy, and frame – along with runtime data like the asset being traded, the specific point in time, and whether it's a backtest or live run. Think of it as a single package containing everything a function needs to operate correctly within the trading system. It’s designed to be easily passed around, allowing different parts of the framework to access and utilize this combined context.

## Interface IRiskValidationPayload

This data structure holds the information needed when checking if a trading signal is safe to execute. 

It builds on the basic signal information with extra context about your portfolio.

You'll find details about the signal itself in the `currentSignal` property, which includes all the necessary data like the opening price. 

The `activePositionCount` tells you how many positions are already open, and `activePositions` provides a complete list of those positions with their specifics.


## Interface IRiskValidationFn

This defines a function that's used to check if a trading decision is safe to make. It’s like a gatekeeper for your trades. 

If the check passes – meaning the trade *is* safe – the function does nothing obvious and just moves on. 

If the check finds a problem – for example, the trade would violate a risk rule – it either returns a special error message (an `IRiskRejectionResult`) or throws an error, which is then automatically turned into that same error message. This allows you to clearly communicate why a trade was rejected.

## Interface IRiskValidation

This interface helps you set up rules to make sure your risk assessments are done correctly. 
It lets you define a specific function – the `validate` property – that will actually perform the check on the data. 

You can also add a `note` to explain what that validation is doing. 
This note helps others (or even yourself later on!) understand why that particular check is in place.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, holds key information about a trade signal, specifically designed for risk management purposes. It builds upon the existing `ISignalDto` and adds details crucial for validating trade risk. You'll find the entry price of the position (`priceOpen`), as well as the original stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels that were initially set when the signal was generated. These values help ensure proper risk controls are in place throughout the backtest.


## Interface IRiskSchema

The `IRiskSchema` helps you create and manage rules for how your trading portfolio behaves. 

Think of it as a way to define custom constraints and safeguards for your portfolio.

Each schema represents a specific risk profile, identified by a unique name. 

You can add notes to document the purpose of each risk profile for clarity. 

It allows for optional callbacks triggered during certain events, such as when a trade is rejected or approved.

Most importantly, it lets you define a series of custom validations, which are functions or objects that check if your portfolio meets specific criteria. These validations are the heart of your risk control logic.


## Interface IRiskRejectionResult

The `IRiskRejectionResult` provides details when a risk validation check fails. Think of it as a report card when something goes wrong during a validation process. 

It includes a unique `id` to specifically identify the rejection, useful for tracking and debugging. 

You’ll also find a `note`, which is a plain-language explanation of *why* the validation failed – essentially, a human-readable reason for the rejection.

## Interface IRiskParams

This interface defines the configuration used when setting up the risk management system. It includes essential details like the exchange you're working with, a way to log messages for debugging, and a time context to ensure accurate calculations, especially during backtesting. 

You can also specify whether you're in a backtesting environment or live trading. 

Finally, you can provide a function that gets called when a trading signal is blocked due to risk limits, allowing you to respond to these situations and potentially broadcast that information.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple things are happening at once. Specifically, the `reserve` property is a boolean that helps ensure data consistency. When set to `true`, it temporarily marks a position as being used during the risk check. This prevents other parts of the system from seeing an inconsistent state before the check is fully complete, especially important in scenarios with lots of activity.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface defines the information passed to a risk check function. Think of it as a set of data provided *before* a trading signal is generated, to ensure that opening a new position makes sense based on current conditions. 

It includes details like the trading symbol (e.g., BTCUSDT), the signal being considered, the name of the strategy making the request, and the exchange being used. 

You'll also find information about the risk profile applied, the timeframe being analyzed, the current price, and a timestamp reflecting the moment this check is performed. Basically, it's a snapshot of the context surrounding a potential trade.


## Interface IRiskCallbacks

This interface defines optional callbacks you can use to monitor and react to risk assessments during trading. Think of these as event listeners specifically for risk-related decisions. 

You can provide an `onRejected` callback that gets triggered whenever a trading signal is blocked because it exceeds your defined risk limits. 

Alternatively, you can use the `onAllowed` callback to be notified when a trading signal successfully passes all the risk checks and is approved for execution. These callbacks help you stay informed about why certain trades are happening or being prevented.

## Interface IRiskActivePosition

IRiskActivePosition represents a single, active trade being managed by a trading strategy. It holds all the key details about that trade, allowing for a comprehensive view of risk across different strategies and exchanges. 

You'll find information here like the name of the strategy that initiated the trade, the exchange it’s on, and the specific trading symbol involved (like BTCUSDT). 

It also tracks the direction of the trade – whether it's a long or short position – and the prices associated with it: the entry price, stop-loss, and take-profit levels. 

Finally, it contains timing data, including an estimate of how long the position is expected to last and the exact timestamp when the trade was opened. This allows you to understand how long a position has been open and how it's performing over time.


## Interface IRisk

This interface, `IRisk`, helps manage the risk associated with your trading strategies. It’s central to ensuring your trading stays within defined limits and accurately tracks open positions.

The `checkSignal` function lets you verify if a trading signal is permissible based on pre-set risk rules. 

`checkSignalAndReserve` is a special function that combines risk checking with a reservation system to prevent race conditions when multiple strategies try to execute signals simultaneously. It's designed to be extra safe when dealing with shared risk profiles. Think of it as locking a spot before committing to a trade. If this function succeeds, it’s *essential* that you follow up with either `addSignal` to finalize the position or `removeSignal` to cancel the reservation.

`addSignal` records the details of a newly opened position, effectively confirming the trade.

Finally, `removeSignal` cleans up when a position is closed, removing its record from the system.

## Interface IReportTarget

This interface lets you finely control which types of data are recorded during your trading simulations. Think of it as a checklist to specify what information you want to see in your reports. 

You can turn on or off logging for things like strategy decisions, risk assessments, breakeven calculations, partial order executions, performance metrics, scheduled events, live trading data, backtest completions, signal synchronization, and milestones like reaching peak profits or experiencing maximum drawdown. 

By enabling only the relevant services, you can keep your reports focused and easier to analyze.

## Interface IReportDumpOptions

This interface lets you control which pieces of data are saved when generating reports. Think of it as a way to filter and label your backtest results. 

It includes details like the trading pair (symbol), the name of the strategy being tested, the exchange used, the timeframe, a unique ID for the signal, and the name of the optimization walker—all helping you keep your reports organized and focused on the data you need. By providing these values, you're essentially adding metadata to your data dumps, making analysis much easier later on.


## Interface IRecentUtils

IRecentUtils provides the foundation for managing recent trading signals. It allows you to keep track of the most up-to-date signals generated by your strategies.

The `handleActivePing` method is used to receive and store new signal information as it comes in.

`getLatestSignal` retrieves the most recent signal based on specific criteria like the symbol, strategy, exchange, and timeframe, ensuring you’re not using information from the future.

Finally, `getMinutesSinceLatestSignalCreated` helps you determine how long ago a particular signal was generated, useful for analyzing signal frequency and responsiveness.

## Interface IPublicSignalRow

The `IPublicSignalRow` interface helps you see exactly what a trading signal looked like when it was created, even if things like trailing stop-loss and take-profit orders have adjusted the actual prices in use. It's designed to make things transparent for users by showing both the original stop-loss and take-profit levels, alongside the currently effective ones.

Here’s what you'll find in this interface:

*   **`cost`**: This tells you the initial cost to get into the position.
*   **`originalPriceStopLoss`**: This is the stop-loss price that was set initially. It doesn't change, even if trailing stop-loss is in effect.
*   **`originalPriceTakeProfit`**:  Similar to the stop-loss, this is the original take-profit price. It remains constant regardless of any modifications.
*   **`partialExecuted`**:  Shows how much of the original position has already been closed through partial closes, expressed as a percentage.
*   **`totalEntries`**:  Tells you how many times the position has been entered, useful for understanding dollar-cost averaging.
*   **`totalPartials`**:  Indicates how many times the position has been partially closed.
*   **`originalPriceOpen`**:  This is the initial entry price for the position.
*   **`pnl`**:  Gives you the current unrealized profit and loss.
*   **`peakProfit`**: Shows the highest profit achieved so far.
*   **`maxDrawdown`**:  Represents the biggest loss experienced.



Essentially, it’s a comprehensive snapshot of a trading signal, providing key details about its entry, risk management, and performance.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, which is a common way to represent price data over a specific time period. Each candlestick contains information about when it started (timestamp), the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trades that occurred. Essentially, it's a snapshot of market activity captured within a defined timeframe. You'll use this to represent a single bar of data when backtesting or analyzing trading strategies.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the information needed to calculate position sizes using the Kelly Criterion.  Essentially, you provide two key pieces of data: your win rate, expressed as a number between zero and one, and your average win/loss ratio. These values allow the backtest kit to determine an appropriate amount of capital to allocate to each trade based on your historical performance. The win rate represents the proportion of winning trades, while the win/loss ratio reflects the average profit compared to the average loss on individual trades.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage to determine position size. It’s really straightforward – you only need to specify a stop-loss price. This price will be used to manage risk and limit potential losses for each trade. Think of it as setting the maximum you're willing to lose on a single trade, and the system will automatically adjust the size of the position based on that.

## Interface IPositionSizeATRParams

This defines the parameters needed to calculate your position size using the Average True Range (ATR) method. The core of this is the `atr` property, which represents the current ATR value. This value is crucial for determining how much of your capital you'll allocate to a trade, as it reflects the volatility of the asset.

## Interface IPositionOverlapLadder

IPositionOverlapLadder helps you define how closely together your dollar-cost average (DCA) purchases can be before they're considered overlapping. It's like setting a safety net around each DCA level.

You control this with two values: `upperPercent` and `lowerPercent`.

`upperPercent` determines how much higher than a DCA level is still considered an overlap.

`lowerPercent` defines how much lower than a DCA level is still considered an overlap.

Both percentages are expressed as values between 0 and 100, where 5 represents 5%.

## Interface IPersistStrategyInstance

This interface defines how your custom adapters can handle saving and loading strategy data. Think of it as a way to manage the information your trading strategy needs to remember between sessions or to handle situations where data might not be immediately available.

It lets you control how strategy-specific data—like learned parameters or historical calculations—is stored and retrieved for a particular trading strategy on a particular exchange.

The `waitForInit` method is called to prepare the storage location, essentially getting things ready before any data is loaded or saved.  `readStrategyData` retrieves the previously saved data, allowing you to load the strategy’s state. Finally, `writeStrategyData` allows you to persist the current state of your strategy. Setting the data to `null` would clear out the saved information.

## Interface IPersistStorageInstance

This interface lets you customize how backtest-kit stores and retrieves trading signals. Think of it as a way to replace the default file-based storage with something else, like a database or in-memory solution.

The system manages a separate storage instance for backtesting and live trading, ensuring each mode operates independently.

When you read data, the system goes through every stored signal and returns them all at once as a list.

To use this, you'll build your own storage adapter and make it conform to this interface.

The `waitForInit` method prepares the storage for either the backtest or live mode. 

`readStorageData` retrieves all the saved signals – essentially pulling all the data.

`writeStorageData` is how you save the signals, and they are organized by their unique signal IDs.


## Interface IPersistStateInstance

This interface defines how to manage persistent state for a specific trading context. Think of it as a way to save and load data related to a particular signal and bucket, so your strategy doesn't lose progress if things go wrong.

If you're building a custom way to store this data – maybe using a database instead of files – you'll need to create a class that implements this interface.

The `waitForInit` method is called to set up the storage when needed.
`readStateData` lets you retrieve previously saved state.
`writeStateData` is how you update and save the state, along with a timestamp.
Finally, `dispose` provides a way to clean up any resources the storage uses, although it's often safe to ignore if you don't need to do anything special.

## Interface IPersistSignalInstance

This interface defines how to manage saved signal data for a specific trading setup – think of it as a dedicated place to store information related to a particular symbol, strategy, and exchange. It allows you to customize how this data is handled, moving beyond the default file-based storage.

The `waitForInit` method is used to prepare the storage space when things get started.  `readSignalData` retrieves the previously saved information. Finally, `writeSignalData` lets you store updated data or clear the stored information altogether.

## Interface IPersistSessionInstance

This interface defines how to manage persistent data for a specific trading session. Think of it as a way to safely store information related to a particular strategy, exchange, and timeframe, so that it doesn't get lost if something goes wrong.

If you want to customize how this data is stored – perhaps using a database instead of a file – you can create your own implementation of this interface. 

The `waitForInit` method prepares the storage when the session begins. `readSessionData` retrieves any previously saved data. `writeSessionData` saves the current state of your session, and `dispose` cleans up resources when the session ends.

## Interface IPersistScheduleInstance

This interface helps manage how trading signals are saved and loaded for specific strategies and symbols. Think of it as a way to customize where and how your backtest-kit stores the signals that trigger trades. 

Each strategy, for each symbol and exchange, can have its own persistence instance.

If you want to use a database or a different storage method instead of files, you can create a custom adapter that implements this interface.

The `waitForInit` method allows you to set up the storage when the test starts.  `readScheduleData` retrieves the previously saved signal, and `writeScheduleData` saves a new one or clears the existing signal.

## Interface IPersistRiskInstance

This interface defines how backtest-kit manages and saves your risk positions for a particular trading context. Think of it as a way to customize where and how your active positions are stored.

If you want to move away from the default file-based storage, you can create your own adapter that implements this interface.

The `waitForInit` method allows you to prepare the storage when it's needed, indicating whether initialization is required.

The `readPositionData` method is used to load previously saved positions, allowing your backtest to pick up where it left off.

Finally, `writePositionData` lets you save the current state of your positions so they can be recovered later.


## Interface IPersistRecentInstance

This interface defines how to save and retrieve the most recent trading signal for a specific setup. Think of it as a way to remember the last signal generated for a particular symbol, strategy, exchange, and timeframe.

It allows you to customize how this information is stored – instead of using a default method, you can create your own way to persist these signals, perhaps using a database or other storage mechanism.

The `waitForInit` method gets things started, setting up the storage for a particular context. `readRecentData` fetches the last saved signal, and `writeRecentData` saves a new one, associating it with a timestamp. This separation makes it possible to handle signals differently during backtesting versus live trading.


## Interface IPersistPartialInstance

This interface helps manage how partial profit and loss information is saved and loaded for a specific trading setup. Think of it as a way to keep track of progress on a particular trade, within a defined context like a symbol, a specific trading strategy, and an exchange.

Each trade, identified by a unique signal ID, has its partial data stored separately.

You can use this interface to customize how this data is stored, potentially moving away from the default file-based storage system.

The `waitForInit` method sets up the storage area for your trading context.

The `readPartialData` method retrieves previously saved partial data for a particular trade and a specific point in time.

Finally, the `writePartialData` method allows you to save the current partial data for a trade.

## Interface IPersistNotificationInstance

This interface lets you customize how notifications are stored during backtesting or live trading. It essentially provides a way to manage those notifications—like order confirmations or error messages—by persisting them and retrieving them later.

You can think of it as providing your own storage system for notifications, potentially replacing the default file-based approach.

To implement this, you'll need to initialize the storage, retrieve all existing notifications, and then be able to save new ones. The storage is specific to either backtest mode or live mode, ensuring notifications are handled appropriately for each scenario. Notifications are uniquely identified, so reading involves going through all stored notifications and writing involves adding or updating them.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area of your application, identified by a signal and a bucket. Think of it as a way to customize where and how your application remembers things.

It allows you to initialize the storage, read existing memory entries by their unique ID, and check if a particular entry even exists.

You can also write new entries, which includes setting a timestamp to show when the data was added, and remove entries, which is done in a "soft delete" way – the data remains on disk but is hidden from regular searches.

Finally, it provides a way to list all the existing (non-deleted) memory entries and a method to properly release any resources your custom storage might be using. If you want to build your own unique way of managing memory data, you'll implement this interface.

## Interface IPersistMeasureInstance

This interface defines how to persistently store and retrieve cached data for a specific trading bucket. Think of it as a way to save information about API responses so you don't have to constantly fetch them again.

It allows for a feature called "soft delete," which means when you remove a piece of data, it's not actually erased from storage, but marked as deleted. This allows for easier recovery or auditing.

If you want to customize how this data is stored (maybe you want to use a database instead of a file), you can implement this interface.

Here's what you'll need to do:

*   Initialize the storage when the bucket starts.
*   Provide a way to read cached data based on a unique key.
*   Implement writing (saving) data to the cache, including a timestamp.
*   Provide a way to virtually remove data by marking it as deleted.
*   List all the keys of the cached data that are not marked as deleted.

## Interface IPersistLogInstance

This interface defines how your application can store and retrieve log data persistently. Think of it as a central place to keep track of all your logs, accessible globally within your running program. 

The `waitForInit` method lets you ensure the log storage is ready before you start writing to it. It's like waiting for a system to fully load before starting your work.

`readLogData` retrieves all the existing log entries that have been saved, allowing you to load a historical record.

Finally, `writeLogData` is used to add new log entries to the storage, appending them to the existing record. It’s important to avoid overwriting existing entries; only add new ones.


## Interface IPersistIntervalInstance

This interface defines how backtest-kit manages markers indicating when a specific trading interval has already occurred. Think of it as a way to remember "we've already processed this time period for this particular trade."

If you want to customize how this tracking happens – maybe using a database instead of a file – you’ll implement this interface. 

The `waitForInit` method handles setting up the storage for each interval. `readIntervalData` retrieves the marker for a specific key (like a trade signal), `writeIntervalData` creates or updates a marker, and `removeIntervalData` temporarily disables a marker, allowing the interval to be triggered again. Finally, `listIntervalData` allows you to see which intervals have been processed. Soft-deleting markers (using `removeIntervalData`) is a key feature, providing a way to re-trigger intervals when necessary.

## Interface IPersistCandleInstance

This interface defines how backtest-kit stores candle data for a particular trading symbol, timeframe, and exchange combination. Think of it as a way to save and load historical price data efficiently. 

The `waitForInit` method prepares the storage area for this specific set of data. 

`readCandlesData` is used to retrieve a chunk of historical data.  Crucially, if even one expected candle is missing from the cache, it returns null – this signals to your backtesting system that it needs to go fetch that data from a live source. 

Finally, `writeCandlesData` is how you save new or updated candle data. It's designed to be smart; it can avoid saving partial or duplicate data, making sure you only have complete and accurate records.


## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data is saved and loaded for a specific trading setup – think of it as a dedicated storage space for a particular symbol, strategy, and exchange. It’s designed to hold information about when a trade breaks even, tracking this data separately for each signal.

You can use it to customize how this data is stored, moving away from the default file-based system. 

The `waitForInit` method allows you to prepare the storage area when it's needed.

The `readBreakevenData` method retrieves previously saved breakeven information for a specific signal and a point in time. 

Finally, `writeBreakevenData` is used to save the breakeven data for a given signal.

## Interface IPersistBase

This interface provides a basic set of functions for interacting with persistent storage, like files or a database. It’s designed to be implemented by custom adapters that handle saving and loading data. 

The `waitForInit` method performs an initial setup, ensuring that the persistence area exists and any necessary files are present. `readValue` retrieves a specific data item, while `hasValue` quickly checks whether a data item is already stored. 

`writeValue` is for saving data, making sure updates happen reliably. Finally, the `keys` method gives you a way to list all the data items that are currently stored, which can be helpful for checking and managing your data.

## Interface IPartialProfitCommitRow

This interface describes a single instruction to take a partial profit on a trade. Think of it as a record of a specific order to close a portion of your position.

Each instruction specifies that the action being taken is a "partial-profit" action.

It also includes the percentage of the position that should be closed, and the price at which the partial profit was actually executed. This information helps in precisely tracking performance and validating the backtest results.

## Interface IPartialLossCommitRow

This interface represents a single instruction to partially close a position. Think of it as a single step in a larger plan to reduce your exposure in a trade. 

It contains information about what action is being taken - in this case, a partial loss - and how much of the position should be closed, expressed as a percentage. 

You’ll also find the price at which this partial closure actually happened, useful for tracking performance and understanding execution details.

## Interface IPartialData

IPartialData helps save and load important parts of your trading signal’s progress. It's designed to be easily stored and retrieved, even when dealing with large amounts of data. Think of it as a snapshot of key information, specifically the profit and loss levels hit during trading.

It takes the profit and loss levels, which are initially stored as collections, and transforms them into simple lists that can be saved. When you load this data back in, it’s used to recreate a complete trading state.

The `profitLevels` property holds an array representing the profit levels reached.
The `lossLevels` property holds an array representing the loss levels reached.

## Interface IPartial

The `IPartial` interface manages how your trading signals track profits and losses. It's used by the system to keep tabs on milestones like reaching 10%, 20%, or 30% profit or loss.

When a signal is making money, the `profit` method is used to calculate and announce these milestones. Conversely, the `loss` method does the same when a signal is losing. Importantly, these methods avoid repetitive announcements, only reporting new levels achieved.

Finally, when a signal closes – whether through a take-profit, stop-loss, or time expiry – the `clear` method is triggered. This cleans up the signal's tracked state, saves the changes, and prepares the system for the next signal.

## Interface IParseArgsResult

The `IParseArgsResult` interface holds the information gathered when you parse command-line arguments. It essentially combines the original input parameters with extra flags that dictate how your trading system will operate. This object tells you whether you're running a backtest using historical data, a paper trading simulation with live data, or actual live trading with real money. It provides clear signals about the operational mode of your trading system.


## Interface IParseArgsParams

This interface outlines the expected input when setting up command-line arguments for your backtesting process. Think of it as a blueprint for what information the system needs to know to run a specific trading strategy.

It defines key pieces of information:

*   The `symbol` which is the trading pair you're interested in, like "BTCUSDT" or "ETHUSDT".
*   The `strategyName` identifies the specific trading algorithm you want to test.
*   The `exchangeName` tells the system which exchange to pull data from, such as "binance" or "bybit".
*   Finally, `frameName` specifies the timeframe of the data, for instance "1h" for one-hour candles or "15m" for fifteen-minute intervals.

## Interface IOrderBookData

This interface, `IOrderBookData`, represents the data you receive from an order book, which shows the current buying and selling activity for a particular trading pair. It holds the `symbol` of the trading pair, like "BTCUSDT". 

You'll find the `bids` property, containing an array of details for all the current buy orders.  Similarly, the `asks` property provides an array with information about all the current sell orders. Each element in these arrays contains data about a single bid or ask order.

## Interface INotificationUtils

This interface defines the core functionality for any system that wants to send notifications from the backtest kit. It's essentially a contract that notification adapters must follow.

The interface provides methods for handling various events, such as when a trade is opened or closed, when partial profit or loss targets are reached, and when the strategy is committed to certain actions. It also includes methods for dealing with order synchronization, checks, fills, rejections, and ongoing monitoring of orders.

Furthermore, it has specific handlers for risk management, pausing the strategy, and various types of errors. The `getData` method allows you to retrieve a list of all stored notifications, and `dispose` provides a way to clear those notifications when the adapter is no longer needed. It provides a structured way for your notifications to adapt to the backtest kit’s event system.

## Interface INotificationTarget

This interface lets you fine-tune which notifications you receive from the backtest or live trading environment. Think of it as a way to only listen for the specific events you’re interested in, rather than receiving everything. If you don't provide this interface at all, you’ll get all notifications by default.

Here's a breakdown of the different notification types you can subscribe to:

*   **Signal Events:** Track the lifecycle of signals, including when they’re opened, scheduled, closed, or cancelled.
*   **Partial Profit/Loss:** Get notified when price targets for partial profits or losses are hit before a trade is fully committed.
*   **Breakeven:** Receive updates when the price reaches the breakeven point.
*   **Strategy Commit:** Track the confirmation of various actions taken by the strategy, such as partial profits, cancellations, or order placements.
*   **Order Synchronization:** Monitor the status of orders as they’re placed and filled, particularly important for live trading.
*   **Order Checks:**  Help ensure orders remain active with the exchange – periodically checks if an order is still open.
*   **Order Fills & Rejects:**  Receive final confirmation of order fills or, if an order fails, understand why it was rejected.
*   **Order Continues & Stops:** Track the outcome of order checks, either confirming the order remains active or indicating a problem.
*   **Risk Management:**  Be alerted if the risk manager blocks a new trade due to risk limits.
*   **Informational Messages:**  Get optional notes or messages associated with signals.
*   **Strategy Pauses:**  Know when the strategy enters or exits a paused state, preventing new trades.
*   **Errors:**  Receive information about errors, distinguishing between recoverable problems and critical, fatal errors.
*   **Validation Errors:**  If there's a problem with your strategy's configuration or data, you’ll get a validation error notification.

## Interface IMethodContext

The `IMethodContext` object acts like a little guide for your backtesting process, making sure everything connects correctly. It holds the names of the key components involved: the exchange, the trading strategy, and the frame (or timeframe) you're using. Think of it as a set of labels that tell the system where to find the right instances of each of these elements during a backtest. If you're running a live test, the frame name will be blank.

## Interface IMemoryInstance

The `IMemoryInstance` interface sets the rules for how memory is managed within the backtest-kit framework. It provides a standard way to interact with different types of memory storage, whether that’s in-memory, persistent storage, or a testing dummy.

You can use `waitForInit` to get things started, ensuring the memory is ready to be used. `writeMemory` is your tool for adding new data to memory, allowing you to specify what's being stored, a description, and a timestamp.

If you need to find specific information, `searchMemory` lets you search the memory using keywords and gets a score to represent the relevance of the results, while respecting the time filter.  `listMemory` is for retrieving all entries up to a certain point in time. 

`removeMemory` allows you to delete individual entries, and `readMemory` brings back a single, specific entry – but only if it was created before the specified time. Finally, `dispose` is used to clean up and release any resources held by the memory instance when it’s no longer needed.

## Interface IMarkdownTarget

This interface lets you fine-tune the markdown reports generated by the backtest kit. It's like a checklist to decide what kind of detailed information you want to see about your trading strategy.

You can choose to enable reports for specific events like strategy entries and exits, risk rejections, breakeven points, or partial profits. 

There are also options for broader analysis, such as portfolio heatmaps, performance bottlenecks, and walker strategy comparisons. 

For more comprehensive views, you can enable reports showing scheduled signals, live trading events, or full backtest results including trade history. 

Finally, you can monitor key milestones like the highest profit achieved and the maximum drawdown experienced. Selecting the appropriate boolean values for each property controls which reports are created.

## Interface IMarkdownDumpOptions

This interface defines the configuration for generating markdown reports, often used for documenting backtesting results. It lets you specify exactly which files and directories the report should target, allowing for highly organized documentation. You can pinpoint a specific file, trade symbol, strategy, exchange, timeframe, and even a unique signal identifier to filter and present just the relevant data. This precise control simplifies the process of creating detailed and targeted reports on your trading system's performance.

## Interface IMCPTextMessage

The IMCPTextMessage represents a simple text-based message intended for communication with the MCP agent. It's a straightforward way to send a plain text message.

It has two key parts: the `type`, which is always "text" to identify it as a text message, and the `text` property, which contains the actual human-readable message content. This allows you to easily send clear and concise instructions or information.

## Interface IMCPSchema

The `IMCPSchema` defines how a Master Control Program (MCP) connects to and interacts with a specific trading strategy. Think of it as a blueprint that links a name for your MCP to the strategy it will manage.

Each schema tells the system which strategy it’s responsible for, and gives it a unique name so the system can identify it. 

You can customize how the MCP receives information about the portfolio – typically, the system provides default updates, but you can define your own way to format that data.

You also have the option to set an entry cost for trades; if you don’t specify one, a default value is used.

Finally, you can define callbacks for different lifecycle events – these are optional and will simply be ignored if you don't include them.

## Interface IMCPPositionOpenCommand

This command is used to initiate a position in a trading pair, essentially telling the system to open a trade. It instructs the system to create a "moonbag" position, which means it automatically sets a 50% take-profit level and a hard stop-loss based on grid calculations.

You'll specify which trading symbol you want to trade, such as "BTCUSDT," and whether you're going long (buying) or short (selling).

It's also important to identify the MCP schema responsible for this command through the `mcpName` property. Finally, you can add a brief note to explain why this trade is being opened, providing context for future analysis.


## Interface IMCPPositionCloseCommand

This defines the information needed to close a trading position using the backtest-kit framework. 

Specifically, it’s used when you want to finalize a position that's already open and being tracked.

The `symbol` property tells the system which trading pair – like BTCUSDT – you’re closing.

`mcpName` identifies the specific trading strategy or setup that's issuing the command.

Finally, the `note` allows you to add a description, like "Manual close due to market conditions," for record-keeping and understanding why the position was closed.


## Interface IMCPImageMessage

This interface defines a message used by the MCP agent, specifically for sending image data. Think of it as a way to transmit things like charts or rendered visuals.

The message always has a `type` of "image" to identify it clearly.

It includes the `mimeType`, which tells you exactly what kind of image it is (like "image/png" or "image/jpeg").

Finally, the `data` property holds the actual image content, encoded in base64 so it can be easily transmitted as text.

## Interface IMCPContext

The `IMCPContext` interface holds a record of your portfolio's state at a specific point in time. Think of it as a snapshot. This snapshot is organized by the symbols of the assets you're trading, allowing each trading strategy to access the relevant information. Each live instance of a strategy receives its own unique `IMCPContext`.

## Interface IMCPCallbacks

The `IMCPCallbacks` interface lets you observe what an MCP (Market Capture Process) is doing without actually changing how it works. Think of it as a way to peek behind the curtain and see the data flowing through the system.

These callbacks are optional; you only need to provide the ones you're interested in.

*   **`onStatus`**: This gets called after the `getStatus` command completes. You'll receive the portfolio snapshot that the renderer produced and any messages that were generated during the process.

*   **`onPositionOpen`**:  You’ll get this when a new position is successfully opened.  It provides the details of the signal that triggered the order – things like target price, stop-loss levels, cost, and any notes associated with it.

*   **`onPositionClose`**: This callback fires when a position is successfully closed. You'll learn the ID of the signal that initiated the closing order.

If a callback isn't provided, it won’t be executed. If one throws an error, it will be logged but won't interrupt the overall process.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's essentially a standard way to record information about the system's activities.

You can use it to log messages at different levels of importance, from general events (`log`) to detailed debugging information (`debug`) and informational updates (`info`). 

It's also useful to flag potential issues with warnings (`warn`) – things that aren’t critical errors, but might need a closer look.

These log messages help with tracking what the system is doing, finding problems, and keeping an audit trail.

## Interface ILogEntry

The `ILogEntry` interface describes a single entry in the backtest kit’s logging history. Each log entry has a unique identifier (`id`) to distinguish it from others. 

The `type` property indicates the level of the log message, whether it's a standard `log`, a `debug` message for developers, an `info` message, or a `warn`ing.  A `priority` timestamp is included for managing log storage.

Alongside a `createdAt` date and a `timestamp` for convenience, the `methodContext` and `executionContext` properties offer richer information about where and how the log was generated, potentially including details about the execution environment or state.  A `topic` property defines the category of the log, typically a method name, and `args` hold any additional data passed with the log message.

## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtests. Think of it as a record of events.

It gives you a way to retrieve a complete list of log entries that have been recorded, allowing you to examine the sequence of actions and decisions made. This is useful for debugging and analyzing your trading strategies.

## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a collection of key performance indicators for a single trading symbol, like BTCUSDT. It provides a detailed breakdown of how a strategy performed on that specific pair, aggregating data across all strategies used.

You'll find metrics covering profitability (totalPnl, avgPnl, profitFactor), risk management (maxDrawdown, sharpeRatio, sortinoRatio), and trading efficiency (totalTrades, winRate, avgDuration).  It also delves into win/loss specifics with averages, streaks (maxWinStreak, maxLossStreak), and expectancy.

Beyond simple returns, it digs into the nuances of trade behavior, exploring peak and fall PNL, duration of winning/losing trades, and even assesses market pressures (buyerPressure, sellerPressure) to understand the forces at play. Finally, it includes trend analysis to see if the symbol exhibited a distinct upward, downward, or sideways movement. This provides a comprehensive view of a symbol’s trading profile.

## Interface IFrameSchema

This `IFrameSchema` defines a specific timeframe used within the backtesting process. Think of it as a blueprint for creating a set of historical data.

Each schema has a unique name to identify it, along with an optional note for clarity. 

It specifies the interval (like 1 minute, 1 hour, or 1 day) for generating the data and clearly defines the start and end dates of the backtesting period. If you don't specify an interval, the default is one minute.

You can also provide lifecycle callbacks to perform actions at different stages of the frame’s lifecycle.


## Interface IFrameParams

The `IFramesParams` object is used when creating a ClientFrame, essentially setting up the environment for your backtesting. It combines the frame's identification details with a logging mechanism to help you understand what's happening during the backtest. Think of it as the initial configuration for a specific frame of your backtest, allowing you to track its activity and any issues that arise through the provided logger. The `interval` property defines a unique name for this frame, making it easy to distinguish between different parts of your backtesting process.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you tap into what's happening during the process of setting up your backtest’s timeframe. Specifically, the `onTimeframe` function gets called right after the timeframe array is created. This is a great spot to log information about the timeframes that were generated, or to do some quick checks to make sure they look right for your strategy. You'll receive the timeframe array itself, the start and end dates for the entire period, and the interval used (like daily, weekly, etc.).

## Interface IFrame

The `IFrame` interface is the core for creating the timeline your backtest will run on. It's responsible for generating the sequence of dates and times that represent each tick in your historical data.

Think of it as defining the rhythm of your backtest. 

The key method, `getTimeframe`, is what actually does this.  You provide a symbol (like 'AAPL') and a frame name (e.g., 'daily', 'hourly') and it returns an array of timestamps that represent that timeframe. These timestamps are spaced according to how often data is available for that timeframe.

## Interface IExecutionContext

The `IExecutionContext` interface provides a shared context for your trading strategies and exchanges during execution. Think of it as a little packet of information passed around, ensuring everything knows the current situation.

It contains essential details like:

*   The `symbol` being traded, such as "BTCUSDT".
*   The `when` – which is the current timestamp, representing the precise moment in time for the operation.
*   A `backtest` flag. This tells the strategy whether it's running a simulated test (backtest) or a real-time trade. 

This context is automatically managed by the framework and is used by functions like fetching historical data, handling market ticks, and performing backtests, making sure all operations are aligned with the correct timeframe and mode.


## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint for connecting to and retrieving data from an exchange. 

You'll provide a unique identifier for the exchange – the `exchangeName` – to distinguish it from others. You can also include a `note` for your own documentation.

The core of the schema is the `getCandles` function. This is responsible for pulling historical price data (candles) for a given trading pair and time range from the exchange's API or database. You can optionally define `formatQuantity` and `formatPrice` functions to handle the complexities of how the exchange represents quantities and prices, ensuring precision.

Beyond candles, you can provide optional functions to retrieve order book data (`getOrderBook`) and aggregated trade data (`getAggregatedTrades`). If these are missing, the system will indicate that they’re not supported.

Finally, you can hook into certain events using `callbacks`, allowing for custom actions during data processing.

## Interface IExchangeParams

This interface defines the essential configuration needed when connecting to an exchange within the backtest-kit framework. Think of it as a set of rules and tools your backtesting engine needs to interact with a specific trading platform. 

You’ll need to provide functions to retrieve historical candle data, format trade quantities and prices according to the exchange’s rules, and fetch order book and trade history information. 

These functions are crucial because they allow your backtesting system to simulate real trading conditions.  The framework provides default implementations for some of these functions, but overriding them is often necessary to accurately replicate the behavior of a specific exchange. 

The `logger` property allows you to track debug information during your backtesting process, while the `execution` property provides context like the trading symbol and whether the test is being run in backtest mode.  Essentially, it’s a standardized way to tell the backtesting engine how to get data and format trades for a particular exchange.

## Interface IExchangeCallbacks

This lets you react to the arrival of new candlestick data from an exchange. You'll receive details like the symbol, the time interval (e.g., 1 minute, 1 hour), a timestamp indicating when the data started, a limit on the amount of data received, and an array containing the actual candlestick data points. This is useful for real-time visualizations or triggering actions based on price movements.

When new trade information becomes available, this callback gets triggered. You’ll get the symbol the trades relate to and an array of trade data points. Use this to monitor market activity and build indicators.

## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with an exchange API. It provides methods to retrieve historical and future candle data, which are essential for analyzing price movements and simulating trades. You can use it to fetch the latest order book information and aggregated trade data for a specific trading pair.

The framework also helps with formatting trade quantities and prices according to the exchange's specific rules. It offers a convenient way to calculate the VWAP (Volume Weighted Average Price) based on recent trading activity.

Retrieving candle data offers flexibility with `getRawCandles`, allowing you to specify start and end dates or just a limit, while ensuring data respects the execution context to prevent look-ahead bias. This helps ensure a fair and accurate backtesting environment.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for any data object that's meant to be saved or retrieved from storage. Think of it as a common starting point ensuring all persisted objects have a unique identifier. It's essential for consistency when working with data that lives beyond your application's memory.

## Interface IDumpInstance

This interface defines how components save data during a backtest run. Think of it as a way to capture different pieces of information, like chat histories, simple records, tables of data, text notes, error messages, and even complex JSON objects. Each save is linked to a specific `dumpId` to keep things organized.

The `dumpAgentAnswer` method is designed to save entire conversations between agents. 

`dumpRecord` allows you to store straightforward key-value data.

`dumpTable` is used to preserve data presented in a tabular format.

`dumpText` is for saving simple text or markdown notes.

`dumpError` is for recording error details.

`dumpJson` handles saving more complex data structures as JSON.

Finally, the `dispose` method ensures that any resources used by the dumping component are properly released when it’s no longer needed.

## Interface IDumpContext

The `IDumpContext` object provides all the information needed to understand where a data dump came from. Think of it as a tag that attaches to a dump of information, letting you know which trade it relates to, what strategy or agent generated it, and whether it's from a backtest run or live trading. It contains a unique identifier for the dump itself, a descriptive label to help you understand its contents, and a flag to indicate whether it's from a backtest or live environment. This context is essential for organizing and searching through large volumes of data generated during trading.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for tracking events that need to be committed later, especially when dealing with situations where the timing isn't ideal for immediate processing. Think of it as a way to queue up actions until everything is ready. It includes essential information like the `symbol` of the trading pair involved and a boolean flag, `backtest`, indicating whether the operation is part of a historical simulation or live trading.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your trading data (candles) are already stored and available. Think of it as a way to quickly verify if you have the historical data needed for a backtest, without having to search through all your files. You'll provide the trading pair (like BTCUSDT), the exchange it's from, the timeframe (like 1 minute or 4 hours), and the date range you're interested in. This lets the system efficiently check your data storage.

## Interface ICandleData

This interface defines the structure for a single candlestick, a common way to represent price data over time. Each candlestick holds information about the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trades that occurred. The `timestamp` tells you exactly when the candle began, and the other properties – `open`, `high`, `low`, `close`, and `volume` – give you a snapshot of the price action and trading activity within that specific time interval. It's a fundamental building block for analyzing price trends and building trading strategies.


## Interface ICacheCandlesParams

This interface helps manage the process of validating and pre-loading historical data for trading strategies. It gives you control points – callbacks – to run custom logic before the validation and warm-up stages begin. Specifically, `onWarmStart` lets you take action right before the warm-up starts, and `onCheckStart` triggers before the validation process kicks off. You can use these callbacks for tasks like logging, preparing data, or setting up monitoring. These callbacks provide a way to customize and monitor the data caching workflow.

## Interface IBrokerOrderVerdictTransient

This represents a temporary setback encountered while trying to place or manage an order. It’s a signal that something went wrong, but it's likely a temporary problem, like a network hiccup or a brief issue with the exchange.

The system will automatically attempt to retry the order a limited number of times, or will temporarily halt checks, before giving up. 

It includes information about the specific error that occurred, allowing for investigation if the issue persists. 


## Interface IBrokerOrderVerdictRejected

When an order fails due to a business-level issue, this verdict is used to communicate that failure. It signifies a permanent rejection – meaning retrying the order won’t help. 

Essentially, it's a signal from the backtest kit that the order couldn't be processed, and it's not something that can be automatically fixed. 

If an order is “rejected” in this way, open orders will be dropped without further attempts, and closing orders will be closed immediately. The `error` property contains the specific `OrderRejectedError` that caused the rejection, providing more detail about the problem.

## Interface IBrokerOrderVerdictDeleted

This describes a situation where an order, that the system was expecting, has disappeared – essentially, it's no longer available. This often happens when a user manually cancels an order directly on the exchange. 

The system doesn't allow for any back-and-forth on this; the order is definitively gone. Any checks associated with this order will be immediately marked as completed (either "closed" or "cancelled by user").

The `reason` property simply confirms that the order has been deleted. 

You'll also find an `error` property, which contains the specific error that triggered the deletion, like an `OrderDeletedError`. This error provides more details about why the order vanished.

## Interface IBrokerOrderVerdictConfirmed

This interface represents the framework's final decision on whether an order should proceed. It’s essentially a notification to listeners about the outcome of a previous request, either a "gate" check or a verification of an existing order. Listeners don’t create this verdict directly; instead, they signal their intent by returning a value or throwing an error. A normal return or `true` confirms the order, a non-typed error indicates a temporary problem, and specific error types (like `OrderRejectedError`) signal a permanent issue.  When the `reason` is "confirmed", it means the order gate was cleared or the order being checked remains valid.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` interface acts as a foundation for how the backtest-kit trading framework handles order decisions. It’s a way to consistently represent the outcome of checks or synchronization processes related to orders. 

Think of it as a base template that ensures different types of order verdicts can be recognized and processed in a unified manner. 

The `__type__` property is a special marker that helps the system identify precisely which type of order verdict is being used. It’s important for correctly interpreting the verdict's meaning and taking appropriate action.


## Interface IBroker

The `IBroker` interface acts as the bridge between the trading framework and a real exchange or broker. It allows the framework to execute orders and manage positions.

`waitForInit` is a crucial initialization step that reconciles any existing orders or positions on the exchange, preventing trading on "orphaned" orders. It's called before any trading activity and should handle a thorough check and synchronization with the exchange.

`onOrderCloseCommit` handles closing positions (take-profit, stop-loss, manual close).  It's the gatekeeper for closing and allows you to place the actual closing order, tracking PnL. Errors can lead to retries or force closures, depending on the type of error.

`onOrderOpenCommit` handles opening new positions. It's the open gate. Errors lead to retries or rejection.  It’s vital to tag orders with unique IDs for tracking.

`onOrderActiveCheck` periodically checks the status of active positions.  It's used to confirm order existence and correct potential discrepancies. Errors here can lead to position closures.

`onOrderScheduleCheck` works similarly to `onOrderActiveCheck`, but for pending (scheduled) orders.

`onSignalActivePing` is for monitoring open positions. It allows reacting to events like gap moves and proactively manage the position based on real-time exchange data.

`onSignalSchedulePing` monitors scheduled orders and allows proactive order management.

`onSignalIdlePing` provides an opportunity for maintenance during periods of inactivity.

`onSignalScheduleOpen` handles placing resting orders for scheduled signals.

`onSignalScheduleCancelled` handles the cancellation of scheduled orders.

`onSignalPendingOpen` triggers the placement of confirmation and protection orders when a position is opened.

`onSignalPendingClose` handles closing existing positions and performing cleanup.

`onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, and `onAverageBuyCommit` are hooks for handling partial profit, partial loss, trailing stops, breakevens, and average buys, respectively. These provide opportunities to manage specific trading strategies.


## Interface IBreakevenData

IBreakevenData is a simple way to save information about whether a breakeven point has been achieved for a particular trading signal. It's essentially a record that stores a single piece of data: a boolean value indicating if the breakeven has been reached. Think of it as a snapshot of a more complex state, designed to be easily stored and retrieved, particularly when saving data for later use. The data is kept in a format that can be easily converted into a JSON format for storage and then back into a full trading state.

## Interface IBreakevenCommitRow

This describes a single row of data related to a breakeven calculation within the backtest framework. It represents a specific action taken – in this case, a "breakeven" event.  The `currentPrice` property indicates the price level at which the breakeven point was determined. Essentially, it's a record of when and at what price a breakeven was calculated during a trading simulation.

## Interface IBreakeven

The `IBreakeven` interface manages the tracking of when a trade's stop-loss should be moved to the entry price, essentially achieving a breakeven point. It helps automate this process and ensures it happens at the right time.

This interface is used by components that monitor trading signals, primarily during backtesting or live trading.

The `check` method is the core function, periodically evaluating whether a signal has met the conditions to move its stop-loss to breakeven. It considers factors like whether breakeven has already been achieved, if the price has moved sufficiently to cover fees, and whether moving the stop-loss is feasible.  Upon confirmation, it records the event, notifies any connected services, and saves the updated state.

The `clear` method is used when a trade concludes – either reaching a take-profit or stop-loss level or expiring.  It removes the breakeven tracking state and ensures resources are cleaned up properly.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book. 

It contains two key pieces of information: the `price` at which the bid or ask is offered, and the `quantity` of the asset available at that price. Both price and quantity are stored as strings. This allows for precision and handling of decimal values.

## Interface IAverageBuyCommitRow

This interface describes a single step within a queued average-buy strategy. It represents one instance where an order was placed to acquire more of an asset at a particular price. 

Each entry holds information about the price at which it was bought, the total cost of that purchase, and the cumulative number of entries accumulated so far. Think of it as a record of each step in a dollar-cost averaging process.


## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. It’s designed for detailed examination and backtesting, giving you specifics like the price and amount traded. Each trade has a unique ID, and a timestamp marking exactly when it happened. You’ll also find a flag indicating whether the buyer or seller initiated the trade, useful for understanding trade direction.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading activity, whether it's a backtest or a live trade. Think of it as a record of what's currently happening. 

It's created when an activity starts, like when a backtest begins or a strategy executes a trade, and it’s removed when that activity finishes or encounters an error. This allows the system to keep track of what’s running and avoid conflicts.

The entry includes the trading symbol (like "BTCUSDT"), details about the strategy and exchange being used, and whether the activity is a backtest or a live operation. It's used to make sure different parts of the system aren't trying to do the same thing at the same time.

## Interface IActivateScheduledCommitRow

This interface represents a task that's been added to a queue for activation of a previously scheduled commitment. 

It contains information about which signal needs to be activated.

The `signalId` property specifies the unique identifier of the signal.

The `activateId` is an optional identifier that can be used when an activation is triggered directly by a user, rather than automatically.

The `action` property confirms this is an activation scheduled commit request.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current trading signals. It lets you quickly determine if a signal is actively pending or if one is scheduled to arrive later.

Think of it as a tool to help your action logic decide whether to proceed with certain steps, like adjusting profit targets or checking for active signals. 

It provides two key functions: `hasPendingSignal` which verifies if there's an open position based on a signal, and `hasScheduledSignal` which checks for signals that are waiting to be triggered. These functions take into account whether it's a backtest and provide context about the strategy and exchange being used.

## Interface IActionSchema

The `IActionSchema` helps you extend your trading strategies with custom functionality. Think of it as a way to hook into your strategy's execution and perform actions based on what's happening. 

You can use these actions to manage state – integrating with tools like Redux or MobX – or to log events and send notifications via Telegram, Discord, or email. 

Each action is unique, identified by an `actionName`, and you can add a `note` for yourself to explain what it does.  

The `handler` defines what actually happens when the action is triggered. It's essentially a constructor that gets a new instance for each strategy run. 

Finally, `callbacks` let you define special functions that run at certain points, like when the action is initialized or finalized, giving you even more control over its lifecycle. You can register several actions to a single strategy.

## Interface IActionParams

This interface, `IActionParams`, is designed to hold all the information an action needs to function correctly. Think of it as a package of essential data passed when creating an action.

It bundles together configuration details, like the strategy and timeframe it belongs to, and runtime information – whether it's a backtest or not.

Crucially, it also includes a `logger` for tracking what the action is doing, allowing for better debugging and performance monitoring.  The `strategy` property provides access to important data like the current signal and position information needed to make decisions. Finally, it includes the names of the strategy and the exchange being used.


## Interface IActionCallbacks

This section describes the callback functions you can use when building action handlers within the backtest-kit framework. These callbacks provide opportunities to hook into various stages of the trading process, from initialization to signal processing and order management.

Initialization and Disposal:

*   `onInit` is triggered when an action handler is created. It's the place to set things up like opening database connections or loading initial data.
*   `onDispose` is called when the action handler is removed. Use it to clean up resources, like closing connections or saving data.

Signal Handling:

*   `onSignal` is a general-purpose callback that receives signal events from both live and backtest modes.
*   `onSignalLive` handles signal events specifically from live trading.
*   `onSignalBacktest` is for signal events occurring during backtesting.
*   `onBreakevenAvailable` fires when a breakeven point is reached.
*   `onPartialProfitAvailable` gets triggered when a partial profit level is hit.
*   `onPartialLossAvailable` is called when a partial loss level is reached.
*   `onPingScheduled` executes during scheduled signal monitoring.
*   `onScheduleEvent` is called during lifecycle events of a scheduled signal.

Manual Event Wiring:

*   `onPendingEvent` is invoked for pending position lifecycle events (open/close) and allows for manual exchange interaction.  It’s a chance to place orders and handle protective stops.
*   `onPingActive` executes every minute while an active position is held.
*   `onPingIdle` is called every tick when no signal is active.

Risk Management and Order Management:

*   `onRiskRejection` is triggered when a signal is rejected by the risk management system.
*   `onOrderSync` is a critical gate for confirming order operations.  You must throw an error to reject an operation, and this behavior is strictly controlled with retry limits.
*   `onOrderCheck` is called to confirm order status during live trading, allowing you to handle potential order failures.



These callbacks provide a flexible way to customize and extend the behavior of action handlers within your trading framework.

## Interface IAction

This interface, `IAction`, acts as a central hub for handling events related to your trading strategies, whether you're backtesting or live trading. It’s designed to let you plug in your own custom logic – like Redux actions, logging, or monitoring – in response to various events.

There are several methods within `IAction` that correspond to different kinds of events.

*   `signal`, `signalLive`, and `signalBacktest` are triggered every time the strategy evaluates a tick or candle, providing data for each mode.
*   `breakevenAvailable`, `partialProfitAvailable`, and `partialLossAvailable` handle events related to profit-taking and stop-loss adjustments.
*   `pingScheduled`, `scheduleEvent`, `pendingEvent`, `pingActive`, and `pingIdle` manage the lifecycle of scheduled and pending signals.
*   `riskRejection` signals when a signal is flagged for risk reasons.
*   `orderSync` handles order placement and closures, letting you influence how orders are handled, and is critical for live trading.
*   `orderCheck` is vital for confirming the existence of orders while pending signals are being monitored.
*   Finally, `dispose` lets you clean up any resources when you’re done with the action handler.



Think of it as a series of callbacks that you can implement to build your own custom trading systems and monitoring tools.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable trading events observed during a backtest. 

It keeps track of all the events that resulted in the highest profit, listing them in chronological order, with the most recent ones appearing first. 

Alongside the list of events, it also provides the total count of all recorded highest profit events. This lets you quickly see not just the single best event, but understand the overall pattern of peak profitability.

## Interface HighestProfitEvent

This object represents the single most profitable moment for a specific trade. 

It holds key details about that peak performance, including exactly when it happened (the timestamp). You'll find information like the trading pair involved, the strategy that generated the trade, and a unique ID for the signal that triggered it. 

The object also tracks whether the trade was a long or short position, and provides a snapshot of the position's profit and loss (both total and the maximum drawdown it experienced). 

Crucially, it records the price at which that highest profit was reached, alongside the opening price, take profit level, and stop-loss level set for the trade. Finally, a flag indicates if this peak profit event occurred during a backtest simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading position reaches a new peak profit level. 
It's a standardized way for the backtest-kit framework to communicate this significant event.

You'll receive this data when a position performs particularly well. 
It contains details like the trading symbol, the current price, and the exact time the profit was achieved. 

The data also includes the strategy and exchange involved, and the timeframe being used. 
Crucially, it specifies the signal that triggered the position.

Finally, a flag indicates whether this profit milestone occurred during a backtest simulation or live trading, allowing you to adjust how you react to the event accordingly.

## Interface HeatmapStatisticsModel

This structure holds a summary of your portfolio's performance across all the assets you're tracking. It gives you a high-level view of how your trading strategy is doing overall.

You'll find key statistics like the total number of symbols in your portfolio, the total profit and loss (PNL), and important risk-adjusted return metrics like the Sharpe and Sortino ratios.

It also provides insight into the characteristics of your trades. You can see the average peak and fall PNL, trade durations, and information about winning and losing streaks.

Finally, there's a collection of advanced performance indicators such as Calmar and Recovery ratios, expectancy, and expected yearly returns – providing a complete picture of your portfolio's potential and risk profile.



The `symbols` property contains individual statistics for each asset in the portfolio, allowing for a deeper dive if needed.

## Interface DoneContract

This interface describes what's sent when a background task finishes, whether it’s a backtest or a live trading execution. It gives you details about the context of that finished task, like the exchange it used, the name of the strategy, and the frame it ran within (or an empty string if it was a live execution). You'll see this data to know when a process is fully complete and to understand what happened during that process, including the symbol being traded. Essentially, it's a notification with key information about a completed task.

## Interface CronHandle

This `CronHandle` is like a little key you get when you schedule a task to run regularly using the framework's cron system.  Think of it as a way to cancel that scheduled task later. When you're done with it, you just need to get rid of this handle – it automatically tells the system to stop the recurring task, just like manually removing it from the schedule. It provides a clean and simple way to manage and cancel your automated processes.

## Interface CronEntry

A CronEntry defines when and how a specific function will be executed within the backtesting framework. Each entry needs a unique name, used to identify and manage it. 

You also specify an interval – this determines how frequently the function runs, such as every minute, every hour, or daily. If you skip the interval, the function executes only once, immediately upon the first matching data point.

The symbols property acts as a filter. If you leave it empty, the function runs once for all backtests. Otherwise, the function will run for each specific symbol you list. 

Finally, you provide the actual function (the handler) that will be executed at the defined time and for the filtered symbols.

## Interface CriticalErrorNotification

This notification signals a critical, unrecoverable error that requires the application to stop immediately. It's essentially a last resort alert, indicating something went severely wrong.

Each notification has a unique identifier (`id`) to help track and investigate specific incidents.

You’ll also find a human-readable explanation of the problem in the `message` field.

The `error` property contains a detailed report, including the error's stack trace and any relevant information.

Importantly, the `backtest` flag is always false; these notifications originate from the live trading environment, not a backtest simulation.


## Interface ColumnModel

This defines how data is displayed in tables. Think of it as a blueprint for each column you want to show. 

Each column has a unique identifier, a user-friendly label that appears in the table header, and a function to transform the raw data into a readable string. 

You can also specify whether a column should be shown or hidden, which can be dynamic and change based on certain conditions. This allows for very flexible and customizable table generation.

## Interface ClosePendingCommitNotification

This notification tells you when a pending signal is closed before it actually turns into a trade. It's like a heads-up that a potential trade wasn't activated.

The notification has a unique ID and timestamp to track it.  You'll see details like whether it happened during a backtest or live trading, the symbol being traded (like BTCUSDT), and the name of the strategy that generated the signal. It also includes the signal's unique identifier and an optional reason for the closure.

You can also access performance data related to what *would have* been the trade, including total profit/loss, peak profit, maximum drawdown, and relevant prices and costs, giving you insights even though the trade didn't happen. There’s a note field for any extra explanations. Finally, it includes the creation timestamp for tracking purposes.

## Interface ClosePendingCommit

This signal indicates that a previously opened position has been closed. It provides detailed information about the closure, including an identifier for the reason behind the closure, which can be helpful for tracking and analysis. You'll also find key performance metrics associated with the position’s lifecycle, such as the total profit and loss, the highest profit achieved, and the largest drawdown experienced. These figures represent the position's performance from its inception until the point the closing signal was generated.

## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trading signal has been cancelled before it could be executed. It provides a wealth of information about the signal and its potential performance. You’ll find details like a unique identifier, the timestamp of cancellation, and whether the cancellation occurred during a backtest or live trading.

The notification includes key data about the intended trade itself, such as the trading pair (e.g., BTCUSDT), the strategy responsible, and details on DCA entries and partial closes. You'll also find original entry price, and comprehensive profit and loss information including peak profit, maximum drawdown, and associated prices and costs.

Crucially, it details the number of entries and partial closes planned, along with the effective entry and exit prices reflecting potential slippage and fees. A user-provided cancellation reason can also be included for clarity, alongside a timestamp indicating when the notification was created. This notification helps track and understand why signals weren't executed.

## Interface CancelScheduledCommit

This interface defines a signal event used to cancel a previously scheduled action. It's essentially a way to tell the system to disregard a commitment that was made earlier.

The `action` property clearly indicates that this is a cancellation request. You can provide a `cancelId` to help track why you're canceling—it's like a reference number for the cancellation.

Alongside the cancellation details, the event also provides information about the closed position, including its total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown encountered (`maxDrawdown`). This data can be useful for analysis and understanding the context of the cancellation.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that have occurred during a backtest. It's essentially a record of when your trading strategy reached a breakeven point.

You’ll find a list of all the individual breakeven events, each with its own details, within the `eventList` property. 

The `totalEvents` property simply tells you how many breakeven events were recorded overall, providing a quick count of these milestones.

## Interface BreakevenEvent

This data structure holds all the key details about when a trade reached its breakeven point. It's designed to make generating reports and analyzing trading performance much easier.

You'll find information like the exact time the breakeven occurred, the trading symbol involved, the name of the strategy used, and the unique identifier of the signal that triggered the trade.

It also includes pricing details such as the entry price, take profit and stop loss levels, both the original values set when the trade began and any updated values. If you used a dollar-cost averaging (DCA) strategy, you'll find data about the number of entries and partial closes. 

You can also see the unrealized profit and loss (PNL) at the breakeven point, a description of why the signal was generated, and timestamps related to when the trade became active and was scheduled. Finally, a flag indicates whether the trade occurred during a backtest or in live trading.

## Interface BreakevenContract

The `BreakevenContract` represents when a trading signal’s stop-loss is moved to the original entry price, a key milestone for managing risk. This event signals that the trade has become profitable enough to cover its initial costs.

It's a one-time notification per signal, meaning it won't be repeated for the same signal.

The contract provides crucial details like the trading pair symbol (`symbol`), the name of the strategy used (`strategyName`), the exchange and frame involved (`exchangeName`, `frameName`), and all the original signal data (`data`). You’ll also find the price at which breakeven was achieved (`currentPrice`), whether it came from a backtest or live trading (`backtest`), and the precise timestamp of the event (`timestamp`). 

This information is used by systems to generate reports and can be listened to directly through callbacks.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached for a trading position. It provides a wealth of details about the trade, including when it happened, whether it was a backtest or live trade, and key information like the trading pair, strategy name, and exchange involved. You'll find identifiers for the signal and notification, along with a timestamp of when the breakeven action occurred.

The notification also breaks down the specifics of the trade itself - its entry and exit prices, take profit and stop loss levels (both original and adjusted for trailing), and information about any averaging (DCA) or partial closes.  Detailed profit and loss (PNL) data is provided, including peak profit, maximum drawdown, and the associated prices and costs. Finally, it includes notes about when the signal was scheduled and created, and a human-readable explanation of why the signal was triggered.

## Interface BreakevenCommit

The BreakevenCommit represents a signal generated when a trading strategy reaches a breakeven point. It provides detailed information about the position’s performance and parameters at that moment. You’ll find key metrics like the current market price, the position’s total profit and loss, and the peak profit and maximum drawdown achieved throughout its lifetime. 

The signal also includes details about the original entry price, and the current take profit and stop loss prices, along with their original values before any trailing adjustments.  Furthermore, it specifies the trade direction (long or short) and timestamps related to when the signal was created and when the position was activated. This comprehensive data allows for a clear understanding of the trade's history and current state.

## Interface BreakevenAvailableNotification

This notification signals that your position now has the potential to break even, meaning your stop-loss can be moved to your initial entry price. It provides a wealth of information about the trade, including a unique identifier, the exact time this opportunity arose, and whether it's happening in a backtest or live trading environment.

You'll find details about the trading pair, the strategy used, and the exchange involved, along with the signal's unique ID. The notification also gives you the current market price and your original entry price, and indicates whether you're in a long (buy) or short (sell) position.

Beyond the basics, it provides key performance metrics like total profit/loss (PNL), peak profit achieved, and maximum drawdown experienced, all broken down with associated prices and percentages. You can also see details about any averaging (DCA) and partial closes performed, plus original price points and numbers of entries. Finally, there’s an optional note for extra context about why the signal was triggered and timestamps related to the signal’s lifecycle.

## Interface BeforeStartContract

This event signals the very beginning of a trading strategy's execution for a specific symbol. It happens right before the engine starts processing any historical data or live market information. Think of it as a setup phase – you can use this moment to prepare for the run, like initializing log files, resetting counters that track performance, or even notifying someone that a trading run has begun.

Importantly, this `BeforeStartContract` is always matched with an `AfterEndContract` event later on, even if something unexpected happens during the run.  Errors that occur within this listener won't interrupt the whole process.

When running a backtest, the `when` property reflects the intended start time of the historical data you’re replaying, rounded to the nearest minute.  However, in live trading, `when` represents the actual current time, also rounded to the nearest minute.  You’ll also find the `timestamp` property, which is simply the numeric representation of the `when` value.


## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtesting results, offering a wealth of information to evaluate strategy performance. It includes a comprehensive list of closed trades (`signalList`) alongside key statistics like the total number of trades, wins, and losses. You'll find metrics to assess profitability (average PNL, total PNL) and risk (standard deviation, Sharpe Ratio), with higher values generally indicating better performance, although lower volatility is often preferred.

Several ratios, like the Certainty Ratio, Sortino Ratio, and Calmar Ratio, offer nuanced perspectives on risk-adjusted returns.  The model also includes data on trade duration and distribution, like the median PNL and consecutive win/loss streaks. 

Further analysis dives into market pressure dynamics with `buyerPressure`, `sellerPressure`, and their strength metrics. Finally, a simple trend analysis with strength and confidence scores offers insights into the broader market context during your backtest. Remember that many of these values might be null if the calculation isn’t possible due to unsafe data.

## Interface AverageBuyCommitNotification

This notification tells you when a new "average buy" (or DCA) order has been executed as part of a larger strategy. It’s essentially a confirmation that another piece of your averaging plan is in place. 

The notification provides a lot of detailed information about this specific averaging entry, including a unique ID, when it happened, and whether it's a backtest or live trade. You'll also find details like the symbol being traded, the strategy used, and the price at which the new order was placed. 

Beyond the immediate trade, you get a comprehensive look at the position’s current state: the effective average entry price, the total number of averaging entries made, and even a breakdown of partial closures. It also includes key performance metrics like total profit and loss, peak profit, and maximum drawdown, providing a complete picture of how this position is performing. Finally, optional notes can provide extra context about the reason behind the trade.

## Interface AverageBuyCommit

This event signals a new addition to an existing averaging (DCA) position. It’s emitted each time a new buy or sell order is executed as part of an averaging strategy.

The event provides detailed information about the averaging action, including the price at which the new order was placed and the total cost of that order.  You'll also find the updated, average entry price for the position after this action, along with profit and loss figures.

Furthermore, the data includes performance metrics like peak profit and maximum drawdown realized so far for the position. It also retains details about the original entry price and the original, unadjusted take profit and stop-loss levels. Finally, timestamps indicate when the signal was created and when the position became active.

## Interface AfterEndContract

This interface signals the end of a strategy's execution, whether that’s due to reaching the end of the data, an interruption, or an error. It's designed to provide a guaranteed, one-time notification for cleanup tasks like flushing data, closing files, or sending completion notices. You can rely on this event happening precisely once for each strategy run, paired with its corresponding `BeforeStartContract` event. Any errors occurring within the listener for this event won’t impact the original calling code.

The `when` property gives you the time of completion. In backtesting, it represents the time of the last processed candle, or the frame's start date if no candles were processed. In live trading, it’s the current time rounded down to the nearest minute.

The information provided includes details like the trading symbol (`symbol`), the strategy name (`strategyName`), the exchange (`exchangeName`), the frame (`frameName`), whether it was a backtest or live run (`backtest`), the average price at the end (`currentPrice`), a `Date` object representing the event time (`when`), and the corresponding timestamp (`timestamp`). This data allows subscribers to understand the context of the strategy execution and perform appropriate actions.

## Interface ActivePingContract

The ActivePingContract represents periodic updates you receive while a pending signal is still active. Think of it as a heartbeat, letting you know the signal is still being monitored. These events are sent roughly every minute.

They’re helpful for tracking the lifespan of your pending signals and allows you to create custom logic to manage them.

The contract contains important information, including:

*   The trading symbol (e.g., BTCUSDT)
*   The name of the strategy that created the signal
*   The exchange where the signal is being monitored
*   The timeframe being used (or an empty string if in live mode)
*   The complete data of the pending signal itself
*   The current market price at the time of the ping. This is useful to determine if something has changed significantly and needs adjusting.
*   Whether the event is from a backtest or live trading session
*   The precise timestamp of the event.



You can subscribe to these ping events to react to their updates, allowing you to implement custom trading behaviors.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning it's being put into action by the user. It's like a confirmation that the system is starting to execute a previously planned trade.

The notification provides a ton of details about the trade being executed. You’ll find information such as a unique ID for the notification, the exact time it was triggered, and whether it's happening in a test environment or live trading.

It includes specifics like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, the exchange used, and the trade direction (long or short). You'll also get the intended entry price, take profit, and stop-loss levels, along with potentially adjusted original values.

Beyond the basic trade parameters, the notification also includes performance metrics. You’ll find profit and loss (PNL) details, peak profit and drawdown information, and even the number of entries and partial closes executed. The information includes details about the original entry price, number of entries, total investment, and a current market price. 

Finally, the notification gives you the time it was scheduled initially, when it became pending, and a timestamp for when the notification itself was created.  A note field allows for an optional explanation for the signal.

## Interface ActivateScheduledCommit

This interface describes the data sent when a scheduled trading signal is activated. Think of it as a detailed report about what’s happening as the system executes a pre-planned trade. 

It confirms the action being taken is an "activate-scheduled" event and includes a unique identifier if you’ve specified one to track the reason for the activation. Crucially, it provides real-time market data such as the current price, and information about the trade's performance so far, including total profit and loss, peak profit, and maximum drawdown.

You'll also find details about the trade itself: whether it's a long (buy) or short (sell) position, the initial entry price, and the take profit and stop-loss levels, both as originally set and after any adjustments. Finally, timestamps show when the signal was created and when the position activation actually occurred.

