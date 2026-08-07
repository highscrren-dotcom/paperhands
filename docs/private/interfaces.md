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

This interface describes the signal sent when a walker, which is essentially a component executing a trading strategy, needs to be stopped. Think of it as an alert that a specific trading process is being paused or halted.

The signal includes crucial information: the trading symbol involved, the name of the strategy being used, and the specific name of the walker being stopped.  This is especially helpful when multiple walkers are running on the same asset, allowing you to target a particular one for interruption. It allows for precise control and interruption of trading activities.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting trading strategies. It's essentially a way to bundle together all the performance data from your strategies, making it easier to compare them. 

This model includes a list of `strategyResults`, which is an array containing the results for each strategy you've backtested. You'll use these results to analyze which strategies performed best and identify areas for improvement.

## Interface WalkerContract

The WalkerContract represents progress updates during strategy comparisons. It signals when a strategy finishes testing and its performance ranking is determined.

Each update includes details like the walker's name, the exchange and frame being used, the symbol being tested, and the name of the strategy that just completed its run.

You'll receive performance statistics (like returns, drawdown, etc.) for the completed strategy, along with a single value representing the metric being optimized. 

The contract also provides insight into the overall comparison process, including the best metric value seen so far, the strategy currently holding that top spot, the number of strategies tested, and the total number of strategies scheduled for evaluation.

## Interface WalkerCompleteContract

This contract represents the culmination of a backtesting walk, signaling that all strategies have been evaluated and the final results are ready. It bundles together a wealth of information about the backtest run. 

You'll find details like the name of the walker, the trading symbol being tested, the exchange and timeframe used, and the optimization metric that guided the process. 

Crucially, it includes data about the total number of strategies tested, and most importantly, identifies the best performing strategy along with its corresponding metric value and associated statistics. This provides a complete snapshot of the backtest's outcome.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your trading strategy's checks. It happens when the risk validation functions you've set up encounter a problem. 

Each notification has a unique identifier, and it includes a detailed error object, complete with a stack trace and extra information to help you pinpoint the issue. 

You’ll also find a clear, human-readable message describing the validation error. 

Importantly, the `backtest` flag will always be false for these notifications, indicating that the error originated from a live trading context, not a backtesting simulation.

## Interface ValidateArgs

This interface, `ValidateArgs`, acts as a central blueprint for ensuring the correctness of names used throughout the backtest kit. It's all about making sure you're using the right terminology when referring to things like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweep configurations.

Each property within `ValidateArgs`—`ExchangeName`, `FrameName`, `StrategyName`, `RiskName`, `ActionName`, `SizingName`, and `WalkerName`—expects a type `T`, which should be an enum. This ensures that the names you provide are one of the officially recognized options, preventing errors and maintaining consistency in your backtesting setup. Think of it as a set of rules to catch typos or incorrect references early on.


## Interface TrailingTakeCommitNotification

This notification gets triggered when a trailing take profit order is executed, letting you know a specific trade has reached its target price. It contains a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it was part of a backtest or a live trade. You'll find details like the trading pair (e.g., BTCUSDT), the name of the strategy that initiated the trade, and the current market price at the time of execution.

The notification also provides key data regarding the take profit and stop loss prices, both original and adjusted by trailing. It includes details about the trade's entry and exit prices, the number of entries used (helpful for understanding averaging strategies), and a comprehensive breakdown of the profit and loss, including peak profit, maximum drawdown, and associated prices and percentages. Finally, there's an optional note field for providing additional context or explanations for the signal. Timestamps are included to track the entire lifecycle of the signal and trade.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit order is executed. It contains all the details about the trade that resulted in this take profit event.

You'll find key information like the trade direction (long or short) and the original entry price.  The current market price when the take profit was triggered is also included.

Crucially, this event details how the take profit price has been adjusted – showing both the final take profit and stop loss prices, as well as the original values before any trailing adjustments occurred.

The interface also tracks performance metrics for the position, like the total profit and loss, the highest profit achieved, and the maximum drawdown experienced. Finally, timestamps mark when the signal was created and when the position was activated.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It's like a detailed report card for a trailing stop event, providing a wealth of information about what happened. 

The `type` clearly identifies this as a trailing stop commit notification. You'll find a unique identifier (`id`) and a timestamp (`timestamp`) so you can track when it occurred. It also tells you whether the trade happened in backtesting mode or live trading.

The notification includes key details about the trade itself: the trading pair (`symbol`), the strategy that generated the signal (`strategyName`), the exchange used (`exchangeName`), and a unique signal identifier (`signalId`).

You'll see details about the trailing stop parameters, like how much the price shifted (`percentShift`).  It also provides information about the current price at the time of execution, along with the trade direction (`position`), entry price (`priceOpen`), and take profit/stop loss levels. 

Beyond the immediate execution, you get a full financial picture of the trade, including profit and loss (PNL), peak profit, maximum drawdown, and even the number of entries and partial closes involved. You can examine the invested capital (`pnlEntries`), the total profit or loss in USD (`pnlCost`), and more.

Finally, there's an optional descriptive note (`note`) for more context, along with timestamps for signal creation and execution (`scheduledAt`, `pendingAt`, `createdAt`). This gives you a comprehensive record of the trailing stop’s activity and its impact.

## Interface TrailingStopCommit

This describes an event that occurs when a trailing stop order is triggered. It provides comprehensive details about the trade and its performance. 

The `action` property confirms this is a trailing-stop event. The `percentShift` tells you how much the stop loss was adjusted by as a percentage. 

You can see the `currentPrice` at the time the trailing stop was activated and gain insight into the position's profitability with `pnl`, `peakProfit`, and `maxDrawdown`. The `position` indicates whether it’s a long (buy) or short (sell) trade. 

Key pricing information such as the `priceOpen`, `priceTakeProfit`, and `priceStopLoss` are included.  You'll also find the original `priceTakeProfit` and `priceStopLoss` values, which represent the prices before any trailing adjustments took place.  Finally, the timestamps `scheduledAt` and `pendingAt` provide when the signal was created and the position started.

## Interface TickEvent

This interface, `TickEvent`, is designed to hold all the data about a single event that happens within your trading system – whether it's a signal being scheduled, a trade being opened, or a position being closed. Think of it as a standardized way to record everything that's going on.

It includes details like the exact time of the event (`timestamp`), what type of event it was (`action`), and all the relevant information associated with that event. For example, if it's a scheduled trade, you'll have the symbol, signal ID, position type, and note.  If it's a closed trade, you'll have details like the close reason, duration, and peak/fall P&L.

Many fields are specific to certain event types – like open price or take profit levels are only available for trades that are scheduled, waiting, open, active or closed. This single object helps you build reports and analyze your trading history consistently, regardless of what triggered the event. You'll find information on price levels, profit/loss calculations, and more, all neatly organized.

## Interface SyncStatisticsModel

This model holds information about synchronization events within your trading system. It essentially gives you a snapshot of how signals are being synced.

You’ll find a detailed list of each individual sync event in the `eventList` property – this is perfect for digging into specifics.

The `totalEvents` property simply tells you the overall number of sync events that have occurred. 

To understand the flow of your signals, you can check the `openCount` to see how many signals are currently active and the `closeCount` to see how many have been closed.

## Interface SyncEvent

This data structure holds all the key details about events happening during a trading signal's lifecycle, useful for creating reports and understanding what's happening. Each event, like a signal being created, filled, or closed, is recorded here.

You’ll find information like the exact time of the event, which trading pair was involved, the name of the strategy and exchange used, and a unique ID for the signal. It also tracks important pricing details, including the entry price, take profit levels, and stop loss levels, as well as how they might have been initially set versus any later adjustments.

Further details include when the signal was scheduled, when it became active, the total entries and partials, and vital performance metrics such as profit and loss, peak profit, and maximum drawdown. If a signal was closed, the reason for closure is also included.  You can also determine if the event occurred during a backtest or live trading. Finally, a timestamp of when the event was created is also available.

## Interface StrategyStatisticsModel

This model holds a collection of statistics generated during a backtesting run, giving you insight into how your trading strategy behaved. 

It includes a detailed list of every event your strategy produced, alongside overall counts of specific event types like canceled orders, pending closures, partial profits and losses, trailing stop adjustments, and more. You’ll find numbers representing the occurrences of actions like taking partial profits, setting trailing stops, or activating scheduled orders. 

It also tracks the number of average-buy (Dollar-Cost Averaging) events your strategy triggered. Essentially, this model gives you a granular view of your strategy's activity and helps analyze its performance.

## Interface StrategyPauseNotification

This notification signals a change in a strategy's pause state. Essentially, it tells you when a strategy has started or stopped temporarily suspending its trading activity. When a strategy is paused, it won’t start any new trades, but any existing orders or signals will continue to be managed as usual.

The notification provides details such as a unique identifier, the timestamp of the change, whether it occurred during a backtest or live trading, the trading symbol involved, the strategy's name, and the exchange and frame it's associated with. Most importantly, it confirms the new pause state – whether trading is currently suspended (true) or resumed (false). A timestamp also indicates when this notification was generated.

## Interface StrategyEvent

This data structure holds all the key information about actions taken by your trading strategy, whether it's a buy, sell, or adjustment. It's designed to be a central place to record what happened during a trade.

Each event includes details like the timestamp, the trading pair, the strategy's name, and whether it’s a backtest or live trade. You’ll find specifics about the action itself, like the signal ID, current price, and any percentage adjustments used for profit/loss or stop-loss/take-profit orders.

For scheduled or pending actions, you'll have IDs related to those operations. If you’re using DCA (Dollar Cost Averaging), information about the total entries, the averaged entry price, and the total cost are also included. Finally, a note field allows you to add extra context, like explanations for specific actions. This comprehensive record makes it easy to analyze your strategy’s performance and understand its behavior.

## Interface SignalScheduledNotification

This notification type tells you about a trading signal that’s been planned for execution in the future. It's essentially a heads-up that a trade is going to happen, not happening *right now*.

Each notification has a unique identifier, a timestamp marking when it was scheduled, and a flag indicating whether it’s part of a backtest or live trading.

The signal details include the trading pair (like BTCUSDT), the strategy that generated it, the exchange it'll be executed on, and specifics about the trade itself – including position (long or short), target entry price, take profit, and stop-loss levels.

You'll also find details on any DCA (Dollar-Cost Averaging) that might be involved and details regarding partial exits.

Furthermore, it provides performance metrics associated with the signal like PNL, peak profit, and max drawdown, along with the entry and exit prices used to calculate those metrics. A note field is also present for any relevant reason.

Finally, you'll see the schedule time and current market price at the time of scheduling, plus a timestamp indicating when the notification itself was created.

## Interface SignalOpenedNotification

This notification signals that a new trade has been opened. It provides a wealth of information about the trade, including a unique identifier and timestamp to track it. Whether it’s a backtest simulation or a real-time trade, you’ll find details like the symbol involved (e.g., BTCUSDT), the strategy that triggered the signal, and the exchange used.

The notification also breaks down the specifics of the trade, like whether it's a long (buy) or short (sell) position, and details the entry price, take profit targets, and stop-loss levels. You can even see the original prices before any adjustments like trailing stops.

For more in-depth analysis, the notification includes information about how the position was built, like the number of entries and partial closes. It also provides key performance metrics like profit and loss (both absolute and percentage), peak profit, and maximum drawdown, including the prices and costs associated with those events. Lastly, there's a field for optional notes that describe the signal’s reasoning.

## Interface SignalInfoNotification

This notification provides information about a strategy's position, allowing you to track its performance and receive custom messages. It's essentially a broadcast from a strategy to inform you about what's happening with a trade.

The notification includes key details like the strategy's name, the trading symbol, and a unique ID for both the notification and the signal. You'll find information on the position itself, including its direction (long or short), entry and stop-loss/take-profit prices—both original and adjusted for trailing.

The notification also provides detailed performance metrics: total profit and loss (PNL), peak profit achieved, maximum drawdown, and corresponding prices. It breaks down the PNL calculation, shows the number of entries and partial closes executed, and provides information regarding the entry and exit prices.

Finally, the notification includes a custom note you can use to describe certain events, as well as timestamps to track the notification's lifecycle, from creation to scheduling and pending status. This allows for very detailed insight and customization for your trading experience.

## Interface SignalInfoContract

This defines a standardized way for strategies to communicate informational messages about their trading activity. When a strategy wants to share something like a debugging message, custom annotation, or send a notification externally, it uses this structure. The information includes details like the trading pair, the strategy's name, the exchange and frame being used (if it's a backtest), and a user-defined note. It also provides the current market price and a unique identifier if needed, along with whether it's a backtest or live trade. Essentially, it's a consistent method for strategies to "shout out" relevant data during their execution.

## Interface SignalEventContract

This interface helps you keep track of when trading positions are opened and closed within the backtest-kit framework. Instead of constantly monitoring all signal data, you can use this to get notified specifically when a position starts or ends.

It provides information about the action taken – whether a position was opened or closed. You’ll also learn details like the trading pair (symbol), the strategy that generated the signal, and the exchange used. The `frameName` identifies the timeframe the signal relates to.

A complete snapshot of the signal data is included, giving you all the relevant information at the time of the event, like entry price, stop-loss levels, and potential profit. When a position closes, you’ll also receive a reason for the closure (take profit, stop loss, time expiration, user action, or broker fill).  The `currentPrice` tells you the price at which the position was opened or closed. A flag indicates whether the event is from a backtest run or live trading. Finally, a timestamp provides the exact time the event occurred, referencing either a live tick or a backtest candle.

## Interface SignalData$1

This interface, `SignalData`, describes the data used to build performance reports, specifically focusing on closed trading signals. Think of it as a record of a single trade that has finished.

It contains key details about that trade, like which strategy created the signal, a unique ID for that signal, and the symbol being traded (like BTC/USDT).  

You'll find information about whether the trade was a long or short position, the percentage profit or loss (PNL), and the reason the signal was closed. It also holds timestamps marking when the signal initially opened and when it was closed, allowing you to analyze trading performance over time. Essentially, it's all the important facts needed to understand the outcome of one closed signal.


## Interface SignalCommitBase

This defines the basic information shared by all signal commit events within the backtest-kit framework. Each signal commit includes details like the trading pair’s symbol, the name of the strategy that generated it, and the exchange where the trade happened. 

You’ll also find information about whether the signal is part of a backtest or live trading session. 

Each signal receives a unique ID, a timestamp reflecting when it occurred, and a count of entries and partial closes to represent the DCA process. Crucially, the original entry price is preserved, even with DCA averaging. 

Finally, the signal commit carries the signal's data itself and an optional note for explaining the signal's reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was due to a take profit or stop-loss trigger, or some other reason. It provides a wealth of details about the trade, including a unique identifier, the exact time it closed, and whether it occurred during a backtest or live trading.

You'll find information like the symbol traded (e.g., BTCUSDT), the strategy used, and the entry and exit prices. It also includes important metrics like profit and loss, peak profit achieved, and maximum drawdown experienced – along with the specific prices and costs associated with these values.

Furthermore, the notification details any DCA (Dollar-Cost Averaging) used, partial closes executed, and the overall duration of the position. A 'note' field allows for additional context or explanations about the trade’s closure. Essentially, it’s a comprehensive record of a completed trading position.

## Interface SignalCancelledNotification

This notification tells you when a signal that was planned to be executed was cancelled before it actually happened. It's like a heads-up that a trade didn't go through as expected.

The notification includes a lot of details to help you understand why the signal was cancelled, such as the signal’s unique ID, the strategy that created it, the exchange it was meant for, and the reason for the cancellation (like a timeout or user intervention).

You’ll also find information about the intended trade itself, including the trade direction (long or short), the planned take profit and stop-loss prices, and the original entry price.  Data about any DCA averaging (how many entries were planned) and partial closes are also present. 

Furthermore, it provides timing information—when the signal was created, when it was scheduled, and how long it was pending—along with an optional note to explain the reason for the cancellation and the ID of the cancellation request. This allows you to investigate and understand why signals are sometimes cancelled.


## Interface Signal

The `Signal` object holds vital information about a trading position.

It tracks the initial entry price through the `priceOpen` property, giving you a clear reference point.

Internally, the `_entry` array keeps a record of each individual entry made for the position, including the price, associated cost, and the time of entry. This allows for detailed analysis of how the position was built up.

Similarly, the `_partial` array documents any partial exits from the position, specifying whether they were profit-taking or loss-limiting actions, the percentage of the position closed, the price at which the partial exit occurred, the cost basis at the time of the closure, the entry count at the time of closure, and the timestamp. Having this data helps you understand the risk management strategies employed during the trade.

## Interface Signal$2

The `Signal$2` object represents a trading signal and holds key information about a position. It includes the `priceOpen`, which is the price at which the position was initially entered.

The `_entry` property stores a history of each entry point for the position, detailing the price, associated costs, and the timestamp of the entry.

Similarly, `_partial` tracks any partial exits from the position, specifying the type of exit (profit or loss), the percentage of the position closed, the price at the time of the partial exit, the cost basis at that point, the number of units entered at that time, and the timestamp.

## Interface Signal$1

This `Signal` object holds important information about a trade. 

It tracks the initial entry price, represented by `priceOpen`. 

You'll also find a record of all entry events, including the price, cost, and timestamp of each, stored within the `_entry` array.

Furthermore, it maintains a history of any partial exits taken during the trade, detailing the type of exit (profit or loss), the percentage gained or lost, the price at the time, the cost basis, the number of shares at the time, and the timestamp.

## Interface ScheduledEvent

This data structure holds all the key information about events related to trading signals – whether they were scheduled, opened, or cancelled. It's designed to provide a complete picture for creating reports and analyzing performance.

You'll find details like the exact time of the event, the type of action taken (scheduled, cancelled, or opened), and the symbol being traded.

Important pricing information is included, such as the entry price, take profit levels, stop loss levels, and how they may have changed.

If a strategy used DCA (Dollar Cost Averaging), it will also include details about the number of entries and partial closes.

For cancelled events, you’ll find the reason for the cancellation, along with IDs related to user actions or system rejections. Open events include when the position became active, and cancelled events give the duration and close timestamp. Finally, it also provides the unrealized profit and loss at the time of the event.

## Interface ScheduleStatisticsModel

This model holds key statistics about your scheduled trading signals, giving you insight into their performance. It tracks every event – when signals are scheduled, activated, or cancelled – and summarizes them into easy-to-understand metrics.

You can see the complete history of scheduled events through the `eventList`. 

The model also provides totals for scheduled, opened, and cancelled signals, along with overall counts. 

To gauge the effectiveness of your scheduling, it calculates cancellation and activation rates expressed as percentages. 

Finally, you'll find average waiting times for both cancelled and activated signals, measured in minutes, allowing you to identify potential delays or inefficiencies in your strategy.

## Interface SchedulePingContract

This contract defines the information you receive when a scheduled signal is being actively monitored. Think of it as a regular heartbeat indicating the signal is still running.

You'll get these "schedule ping" events roughly every minute while the signal is active—that is, not cancelled or fully activated.

Each event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy involved, and the exchange being used.

You’ll also find the frame (timeframe) associated with the signal, along with the complete signal data including all its parameters.

The event also provides the current market price, letting you build custom logic. For instance, you could automatically cancel a signal if the price deviates significantly from its initial open price.

Finally, the event tells you whether the signal is being monitored in backtest mode (using historical data) or live trading mode.  The timestamp indicates when the ping was generated – either the real-time time for live trading or the timestamp of the candle being used in backtesting.


## Interface ScheduleEventContract

This contract helps you keep track of when signals are scheduled for execution and when they are canceled before they ever become active trades. Think of it as a notification system – it lets you know when a signal is planned or removed without needing to constantly monitor the entire signal stream.

It provides information about what happened to a signal: whether it was initially scheduled, or if it was canceled before activation. You can use this to build custom logic or displays to show the lifecycle of your signals.

The information includes details like the symbol being traded, the strategy that created the signal, the timeframe being used, and the complete data associated with the signal. You'll also find out *why* a signal was canceled, such as a timeout or a price rejection, and the current market price at the time of the event. Finally, it tells you whether the event occurred during a backtest or live trading session.

This contract doesn’t tell you when a signal *activates* and becomes a trade. That's handled by other parts of the system. It's specifically for tracking signals that are scheduled or canceled before they are ever opened. You can subscribe to these events using `listenScheduleEvent()` or `listenScheduleEventOnce()`.


## Interface RiskStatisticsModel

This model holds statistics about risk events, giving you insights into how often and where risks are being triggered. 

It tracks every individual risk rejection event in detail within the `eventList`.

You’ll find the total count of rejections in the `totalRejections` property.

To understand which assets or strategies are facing the most risk, the data is also broken down by symbol in the `bySymbol` property and by strategy in the `byStrategy` property.


## Interface RiskRejectionNotification

This notification informs you when a trading signal was blocked by your risk management rules. It provides details about why the signal couldn't be executed.

You’ll find a unique identifier for the notification itself, as well as the timestamp of when the rejection occurred. It will also tell you if this rejection happened during a backtest or in live trading.

The notification includes crucial context like the symbol being traded, the name of the strategy that generated the signal, and the exchange involved. A helpful explanation of *why* the signal was rejected is also included in the `rejectionNote` field.

It also provides data about the potential trade, such as the intended direction (long or short), proposed entry and stop-loss prices, and the number of active positions you had open at the time.  If a signal ID was associated with the rejected signal, you’ll see that here too. Some additional fields, like `signalNote`, offer more information about the signal itself. Finally, you’ll see the timestamp of when the notification was generated.

## Interface RiskEvent

This data describes events where trading signals were blocked due to risk management rules. 

Each event includes the exact time it occurred, the trading pair involved, and the details of the signal that was rejected. You’ll also find information about the strategy and exchange used, the timeframe considered, the current market price, and how many positions were already open at the time. 

A unique ID tracks each rejection, along with a specific reason why the signal was rejected. Finally, a flag indicates whether the event originated from a backtesting simulation or live trading.

## Interface RiskContract

This interface describes a risk rejection event, which happens when a trading signal is blocked because it violates pre-defined risk limits. It's designed to help you monitor and understand exactly when and why risk controls are intervening.

Each event contains crucial details about the rejected signal, including the trading pair involved (symbol), the specifics of the signal itself (currentSignal), which trading strategy tried to execute it (strategyName), and the timeframe it was for (frameName).

You’ll also find information about the exchange, the market price at the time of the rejection (currentPrice), the number of existing open positions (activePositionCount), and a unique ID to track the specific event (rejectionId).  A human-readable explanation of why the signal was rejected is provided as well (rejectionNote). The timestamp indicates exactly when the rejection occurred and whether it originated from a backtest or live trading environment (backtest). These events are primarily used by reporting services and user callbacks to gain insight into risk management activity.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive as a background task, like testing strategies, runs. 

It provides key details about what's happening: the name of the task, the exchange being used, the specific frame being processed, and the trading symbol involved.

You'll also see the total number of strategies being handled, how many have already been processed, and a percentage indicating how far along the process is. Essentially, it's a progress report to keep you informed.

## Interface ProgressBacktestContract

This interface helps you monitor the progress of a backtest as it runs. It provides details about the backtest, including which exchange and strategy are being used, and the specific trading symbol involved. You'll see information about the total number of historical data points (frames) the backtest will analyze, and how many have already been processed. Most importantly, it gives you a percentage representing how far along the backtest is, ranging from 0% to 100%. This allows you to track the backtest's advancement and estimate its remaining duration.


## Interface PerformanceStatisticsModel

This model holds a collection of performance data related to a specific trading strategy. 

It includes the strategy's name for easy identification. 

You’ll also find the total number of performance events that were tracked, as well as the total time it took to calculate all the performance metrics.

The `metricStats` property groups data by different metric types, allowing for more organized analysis.

Finally, it provides a list of all the individual performance events, giving you access to the raw data if needed.

## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies are performing. It's like a little report card, generated as your strategies run. 

Each report card entry, or PerformanceContract, records details like when it happened, how long an operation took, and which strategy, exchange, and symbol it relates to. 

You’ll find the timestamp, which is just the exact date and time the event occurred, and a previous timestamp so you can calculate time differences. 

The 'metricType' tells you what kind of task was being performed (like order placement or data retrieval).  It also includes the strategy and exchange names involved and indicates whether it was a backtest or live trading session. The 'frameName' is relevant mainly during backtesting.

## Interface PauseContract

The PauseContract describes when a trading strategy is paused or resumed. This happens when the `setPaused` function is used to temporarily stop the strategy's automatic trading.

While a strategy is paused, it won't initiate any new trades – though existing trades that are already in progress (like pending orders) will still be handled normally.

You can use this information to notify users, like sending a message on Telegram, when a strategy starts or stops trading automatically.

The `backtest` property is particularly helpful because it lets you know whether the pause event is occurring during a simulated backtest or in live, active trading.

Here's a breakdown of what the contract tells you:

*   **symbol:** The trading pair involved, like BTC/USDT.
*   **paused:** Whether the strategy is now paused (true) or active (false).
*   **timestamp:**  When the pause or resume occurred.
*   **strategyName:** The name of the strategy that was paused or resumed.
*   **exchangeName:** The name of the exchange being used.
*   **frameName:** The timeframe used in the strategy.
*   **backtest:** If this is a backtest simulation or a live trading situation.

## Interface PartialStatisticsModel

This model holds statistical information gathered during a backtest, specifically related to partial profit and loss events. It gives you a breakdown of how many profit events occurred, how many loss events occurred, and the overall count of all events. The `eventList` property contains a detailed record of each individual event, while `totalEvents` gives you the grand total, and `totalProfit` and `totalLoss` show you the numbers for each outcome type.

## Interface PartialProfitContract

This interface, `PartialProfitContract`, represents a signal reaching a predefined profit level during trading. It's how the system communicates when a strategy has achieved, for example, 10%, 20%, or 30% profit on a trade.

Think of it as a notification – the system is letting you know “Hey, this trade has now hit a 50% profit milestone!”.

Each notification includes key details: the trading symbol (like BTCUSDT), the name of the strategy that generated the signal, the exchange being used, the timeframe of the trade, and the original data associated with the signal. Crucially, it also specifies the current price when the profit level was reached and which level was triggered.

The `backtest` flag indicates whether this event occurred during a historical simulation or during live trading. Timestamps also differ depending on whether it's a backtest or live event, aligning with either the candle time or the real-time detection time. This lets you track how strategies perform at different profit stages and in different environments.

## Interface PartialProfitCommitNotification

This notification signals that a partial profit has been taken on a trade. It provides a wealth of information about that event, including a unique ID and timestamp. You’ll find details about whether it occurred during a backtest or live trading, the trading pair involved, the strategy that triggered the action, and the exchange where it happened.

The notification also gives you the specifics of the trade itself: the signal ID, the percentage of the position closed, the current price, trade direction (long or short), and original entry and stop-loss/take-profit prices. You'll see details regarding DCA averaging like the number of entries, total partials, and crucial performance metrics such as peak profit, maximum drawdown, and their associated prices, costs, and percentages.

Finally, a 'note' field allows for optional human-readable explanations, and timestamps track the signal’s creation and pending phases. This comprehensive data allows you to thoroughly analyze partial profit executions and understand their impact on your trading strategy.

## Interface PartialProfitCommit

This object represents a partial profit-taking event within a backtest or trading simulation. It details a situation where a portion of an existing trade is closed to secure some gains. 

The `action` property confirms this is a partial profit event. The `percentToClose` specifies what percentage of the trade is being closed. 

Alongside this, the data includes key information about the trade itself: the current market price (`currentPrice`), the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the maximum drawdown experienced (`maxDrawdown`). The trade direction (`position`), entry price (`priceOpen`), and intended stop-loss and take-profit prices (both original and potentially adjusted for trailing) are also provided. Finally, timestamps track when the partial profit signal was created (`scheduledAt`) and when the position was initially activated (`pendingAt`).

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a profit milestone, like 10%, 20%, or 30% gain. It’s essentially a progress update on your open trade.

Here's a breakdown of the key details you'll find in this notification:

*   **Identification:** It includes a unique ID and timestamp to track when this event occurred, plus it tells you if it's from a backtest or live trading.
*   **Trade Details:** You'll find the symbol (e.g., BTCUSDT), the strategy name, the exchange used, and the original entry price.
*   **Position Information:** It confirms whether it’s a long (buy) or short (sell) position, the current price, the original take profit and stop loss prices, and how much trailing was applied.
*   **Averaging and Entries:** You can see the number of DCA entries used (if any) and the number of partial closes that have been executed.
*   **Performance Metrics:** It provides a snapshot of the trade's performance – the total profit/loss (in USD and as a percentage), peak profit, maximum drawdown, and the prices associated with those metrics.
*   **Additional Context:** The note field lets you see any extra explanation about the signal. You'll also find the timestamps when the signal was initially created, became pending, and when this notification was generated.

## Interface PartialLossContract

This describes a `PartialLossContract`, which is a notification that a trading strategy has reached a predefined loss level, like -10%, -20%, or -30% from its initial entry price. Think of it as a signal that a strategy is experiencing drawdown.

It’s triggered by the partial loss subject and provides a wealth of information about the event, including the trading symbol (e.g., BTCUSDT), the name of the strategy involved, and the exchange being used. You’ll also find details like the frame name (which is empty when trading live) and the data associated with the original signal.

Crucially, it includes the current price at the time the loss level was triggered and the specific loss level reached (e.g., level=20 means a 20% loss). It also distinguishes between live and backtest (historical data) executions, along with the timestamp of the event. This information is used by services to generate reports and by users who are monitoring strategy performance. Events are designed to avoid duplicates, even if multiple levels are triggered within the same price movement.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It provides a detailed snapshot of the trade, including when it happened, where it occurred (exchange and strategy), and crucial details like the symbol traded and the direction of the trade (long or short). 

You'll find key information like the original entry price, take profit and stop loss levels (both original and adjusted for trailing), and the total number of entries and partial closes performed.

The notification also includes performance metrics, like the profit and loss (both in USD and percentage), peak profit, and maximum drawdown – giving you a clear view of the position's financial journey.  It even breaks down those metrics by entry and price levels to help you analyze performance in detail.  A note field allows for a brief explanation of why the partial closure occurred. Finally, timestamps reveal when the signal was initially created and when it became active.

## Interface PartialLossCommit

This object represents a partial loss event that occurred during a trading strategy's execution. It provides a snapshot of the position's performance and details leading up to the partial closure. 

You'll find information here about how much of the position was closed (percentToClose), the price at the time of the action (currentPrice), and the overall profit and loss (pnl) accumulated by that position. It also includes the highest profit (peakProfit) and largest loss (maxDrawdown) seen by the position.

Furthermore, you can see the trade’s direction (position - long or short), its original entry price (priceOpen), and the originally set take profit and stop loss prices, along with any adjustments made to them. Lastly, timestamps like when the signal was created (scheduledAt) and the position started (pendingAt) are included for tracking purposes.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has hit a predefined loss milestone, like a 10% or 20% drawdown. It’s essentially a heads-up about the position's performance.

Each notification has a unique ID and timestamp, letting you track when and why it was triggered. It indicates whether this notification originates from a backtest (simulated trading) or a live trading environment.

You'll find key details about the trade itself, including the symbol being traded, the strategy name, the exchange used, the trade direction (long or short), and the original entry price.

The notification also provides insight into price levels – the original take profit and stop-loss prices, as well as any adjustments made by trailing. It details the trade's history, showing the number of entries and partial closes.

Furthermore, it gives a comprehensive view of the position’s financial performance, including the total profit/loss, peak profit achieved, maximum drawdown experienced, and related price points.  Detailed data regarding investment capital, and performance percentages are all present, along with the number of entries at peak profit and maximum drawdown.  Finally, a note field allows for an optional human-readable explanation of why the signal was triggered.  Timestamps document the creation and pending stages of the signal.

## Interface PartialEvent

The `PartialEvent` holds all the key details about profit or loss milestones during a trade. It's designed to give you a clear picture of how a trade is performing.

Each event includes the exact time it happened, whether it was a profit or a loss, the trading symbol involved, and the name of the strategy that triggered it. You’ll also find the signal ID, position type, and the current market price.

Crucially, it tracks the profit/loss level reached, along with the original entry price, take profit target, and stop-loss levels that were initially set.

For strategies using DCA (Dollar-Cost Averaging), it provides the total number of entries and the original entry price before averaging.  You’ll also see details about partial closes, like the total number executed and the executed percentage.

Further information like unrealized profit and loss (PNL), a human-readable note explaining the signal's reasoning, when the position became active, when the signal was created, and a flag indicating whether it's a backtest or live trade are also available.


## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or as part of a scheduled signal. It provides a wealth of information about the trade, including when it happened, the trading symbol, the strategy that initiated it, and whether it occurred during a backtest or live trading. You'll find details about the price at which the position was entered, along with key performance metrics like profit and loss, peak profit, and maximum drawdown, all calculated in USD and as percentages. 

The notification also breaks down the specifics of the order, like the original take profit and stop-loss prices before any adjustments, and gives details about any averaging or partial closes. Essentially, it’s a comprehensive record of the signal’s execution and initial performance. The `type` property clearly identifies this as an "order_sync.open" event, and the `orderType` property specifies if this was triggered by an immediate order ("active") or a scheduled order.


## Interface OrderSyncCloseNotification

This notification tells you when a trading signal has been closed – whether it hit a take profit or stop loss level, timed out, or was closed manually. Each notification has a unique identifier and timestamp, letting you track when and why a signal closed, and whether it was a backtest or live trade.

It provides a detailed breakdown of the trade's performance, including the total profit or loss, peak profit achieved, maximum drawdown, and associated prices. You'll also find details about the entry and exit prices, the number of entries and partial closes, and the reason for the signal's closure.

The notification also contains information about original take profit and stop loss prices *before* any trailing adjustments were applied, as well as information on the trade's direction (long or short), the trade’s initial and final prices, and the creation timestamps of the signal and notification itself. This is essential data for understanding how your strategies perform and for analyzing past trading decisions.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an active or scheduled order being monitored by the trading framework. It's essentially a "ping" to confirm the order is still valid on the exchange. These pings are sent regularly, but the system avoids sending them too frequently (roughly every 15 minutes) to prevent unnecessary load.

The notification contains a wealth of information about the order and the associated position, including details like the trading pair, strategy, exchange, order type (active or scheduled), and current market price. You’ll also find data about the order's pricing – original and adjusted prices for entry, take profit, and stop loss – along with the number of DCA entries and partial closes.

It also includes performance metrics like P&L, peak profit, maximum drawdown, and related prices and costs, giving a view of the position’s profitability and risk profile at the time of the ping. A timestamp indicates when the ping was sent, along with timestamps for signal creation and pending status.  Finally, an optional note field provides a human-readable explanation of the signal. This notification is exclusively used in live mode, it does not appear during backtesting.


## Interface OrderSyncBase

OrderSyncBase provides essential information common to events related to order management within the trading framework. These events describe the status of orders, whether they're being actively executed or scheduled for placement. 

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where the order is being placed. The `frameName` is only relevant when running backtests.

Each event includes a unique identifier for the signal (`signalId`), a timestamp indicating when it occurred, and the full signal data (`signal`). The `attempt` field tracks consecutive failures; if an order fails, this number increases, guiding retry behavior – up to pre-defined limits. This helps ensure orders are ultimately executed even with temporary issues, while also preventing indefinite retries. The `type` property distinguishes between "active" orders (those being opened, filled, or closed) and "schedule" orders (specifically related to the initial placement of resting orders).

## Interface OrderStopContract

This notification is sent when a trading order is definitively closed or canceled, marking the end of a monitored signal's lifecycle. Think of it as the final word on whether an order went through or not. It's emitted just before the system cleans up everything related to that order.

There are two primary reasons why this notification is triggered: either the order was confirmed as no longer existing on the exchange (perhaps it was filled, canceled, or liquidated externally), or the system encountered too many temporary problems trying to confirm the order’s status.

This event provides a wealth of information about the order and its performance: the trading symbol, the strategy that generated the signal, where it was executed, the current market price, the position’s unrealized profit/loss, the highest profit achieved, the biggest loss experienced, the original entry and stop-loss prices, and details about any averaging or partial closures. Notably, backtesting never generates these notifications, as order checks are exclusive to live trading. This notification provides insights into order lifecycle management and potential issues during the order execution process, aiding in troubleshooting and optimization.

## Interface OrderStopCheckNotification

This notification signals the end of a signal check, specifically when the check process definitively concludes – either because the order was found missing or because the maximum retry attempts were reached. It's a rare event that happens only once per signal and is used to inform about the final state of an order.

The notification provides a wealth of detail about the signal and the position it represented. It includes identifiers like the signal ID, timestamps, and strategy name. You'll find details about the order type (active or schedule) and the reason for the termination (deleted or exhausted).

A key aspect is the extensive price and PNL (Profit & Loss) information. This offers a complete snapshot of the position's performance, including entry prices, take profit/stop loss levels, realized and unrealized PNL, peak profit, and maximum drawdown, alongside the related costs and percentages. Finally, the notification includes timestamps that indicate the signal's creation and when the position became pending, offering chronological context.

## Interface OrderRejectOpenNotification

This notification signals that an order placement failed definitively—meaning the exchange rejected it and retrying isn't helpful. It's only triggered for live trading, not during backtests. 

Think of it as a "this order won't happen" alert.

Here's what the notification tells you:

*   **Key Details:** It provides a unique identifier, timestamp, and the symbol involved. You'll also see the strategy's name and the exchange that rejected the order.
*   **Order Context:** It clarifies whether the rejected order was for opening a new position or a scheduled entry.
*   **Failure History:** The 'attempt' field indicates how many times the order was tried before being rejected.
*   **Reason:** The 'message' property gives you a human-readable explanation from the broker about why the order was rejected.
*   **Position Performance:**  Crucially, it includes a snapshot of the position's performance up to that point, like P&L, peak profit, and maximum drawdown.
*   **Order Details:** You can access the original and adjusted entry, take profit, and stop-loss prices as well as the number of entries and partials.
*   **Signal Timeline:** It includes timestamps for when the signal was created and when the position was activated.

## Interface OrderRejectOpenContract

This interface describes a situation where an order to open a position or schedule an entry has been permanently rejected. It signifies that the attempted trade is completely cancelled, and the associated signal is no longer available. 

The `action` property specifies the type of action that was rejected, indicating whether it was an attempt to open a position or schedule an entry. 

The `cost` property provides the total cost associated with the rejected order, representing the sum of all entry costs involved.

## Interface OrderRejectCloseNotification

This notification appears when a closing order is rejected by the broker, signifying a force close. It's only triggered when a close attempt fails due to an error from the broker adapter, not just temporary issues. It’s live-only, meaning it doesn't occur during backtesting.

The notification provides a wealth of information about the rejected order, including:

*   A unique identifier and timestamp for tracking.
*   Details about the strategy, exchange, and signal involved.
*   The reason for the rejection, provided by the broker.
*   Current market conditions like price and P&L snapshots.
*   Performance metrics like peak profit and maximum drawdown experienced by the position.
*   Entry and exit prices used for the profit/loss calculations.
*   Original order details, including take profit, stop loss, and entry prices before adjustments.
*   Information about the position itself, like its direction (long or short) and the number of entries and partial closes.
*   Timestamps marking key events like signal creation and position activation.
*   The specific reason why the engine force-closed the position.



This allows you to diagnose issues and understand why a position couldn’t be closed as intended.

## Interface OrderRejectCloseContract

When a trading strategy attempts to close a position but the system absolutely cannot fulfill that request, this `OrderRejectCloseContract` signals a definitive rejection. It means the closing order was refused, and the system will revert to its original state and reason for wanting to close. 

The `action` property is always "signal-close," indicating this is a rejection related to closing a position.

The `closeReason` property provides the specific explanation for why the closing order was rejected, allowing the strategy to understand and potentially adjust its behavior.

## Interface OrderRejectBase

This event signifies a definitive rejection of an order by the exchange – it's not a temporary issue that will be retried. It's triggered when the system receives an `OrderRejectedError` from the broker adapter, meaning further attempts are pointless.

The `OrderRejectBase` event comes in two main flavors: when an order to open a new position fails (signal-open), or when a position is forcibly closed (signal-close). Importantly, it happens *only* in live trading environments; backtests bypass this rejection path entirely.

The event provides a wealth of information about the rejected order, including details like the trading symbol, strategy name, exchange, timestamp, original order prices, and the reason for the rejection as provided by the broker. You'll find data about the position's performance so far – profit, peak profit, and maximum drawdown – as well as the number of previous failed attempts and a unique identifier for the signal. 

This notification is purely informational; it doesn't influence the trading logic itself and is designed to help you understand why an order wasn't filled.

## Interface OrderOpenContract

This event lets you know when a limit order you placed has been filled and the framework has started a new position. It's a signal that a trade is officially underway.

Think of it as confirmation that your order has been executed on the exchange, whether you're running a test or trading live.

It provides a lot of details about the trade: the current market price, the total profit and loss so far, peak profit and loss experienced, and the costs associated with entering the position. You'll also find the original entry price, take profit and stop-loss prices, and information about any averaging or partial closes that occurred. 

This information is really useful for external systems that need to track your orders and manage the trade lifecycle. You can use it to update order management systems, audit trading activity, or simply log the details of each trade. The `scheduledAt` and `pendingAt` timestamps help precisely synchronize events.

## Interface OrderFillOpenNotification

This notification signals that a trade has definitively been opened or placed by the exchange—it's confirmation that your strategy’s order actually went through. It only happens *after* an initial attempt has been verified as successful, providing a reliable signal about your live trading activity.

Here's what the information in this notification tells you:

*   **Key Details:** You'll find the trade's unique ID, the exact time it was confirmed, the symbol being traded (like BTCUSDT), the strategy that triggered it, and which exchange handled it.
*   **Order Type:** It clarifies whether a market order ("active") was filled immediately, or a limit order ("schedule") was placed on the exchange's order book.
*   **Performance Metrics:** A snapshot of your position's performance is included, providing real-time data on profit & loss (PNL), peak profit, maximum drawdown, and associated prices. This helps you quickly gauge the health of your open position.
*   **Price Information:** It provides both the initial entry price and current price along with adjusted prices like take profit and stop loss, giving a comprehensive view of your risk management setup.
*   **Entry Details:** You get insight into the number of trades or partial closings and information about the total invested capital and execution prices.
*   **Reasoning:** A note provides optional human-readable explanation for the signal’s creation.



This notification is exclusively for live trading—it won’t appear during backtesting runs.

## Interface OrderFillOpenContract

An `OrderFillOpenContract` represents when a trade has been confirmed by your broker, either because a new position was opened or a pending order to do so was placed. 

The `action` property tells you exactly what happened: either a position was actively opened ("signal-open"), or an order to open it was submitted ("schedule").

You’ll also find the `cost` of the trade, which is the total amount spent to initiate the position. This includes any commissions or fees involved.


## Interface OrderFillCloseNotification

This notification confirms that a trading position has been closed successfully on a live exchange. It's a definitive signal – meaning the order actually went through after an initial attempt.

Here's a breakdown of the information provided:

*   **Identification:** You'll find a unique ID for the notification, the timestamp of the confirmation, and the strategy that triggered the trade.
*   **Trade Details:** It includes essential information like the trading symbol, exchange used, order type, and how many previous attempts were made to close the position.
*   **Performance Metrics:** You’ll see key performance indicators like profit and loss (both absolute and percentage), peak profit, and maximum drawdown, all with associated prices and costs.
*   **Position Information:** Details about the position itself are present, including the entry and exit prices, original take profit/stop loss levels, and the total number of entries and partial closes.
*   **Reasoning:** The notification explains *why* the position was closed, along with an optional human-readable note.
*   **Timestamps:** You'll find timestamps for when the signal was created, the position was activated, and the notification itself was generated.

Essentially, this notification provides a comprehensive report on a closed trade, including both the execution details and the performance metrics of the position. It's a crucial piece of information for monitoring and analyzing your trading strategy.

## Interface OrderFillCloseContract

This data represents when a trading contract has been fully closed, meaning an order to exit the position has been confirmed by your broker. 

It's a record of a successful exit, whether triggered by a take-profit, stop-loss, a scheduled time, or a manual close from your strategy.

The `action` property simply indicates that this event signifies a closing of a position.

The `closeReason` tells you *why* the position was closed – was it because of a profit target, a loss limit, a time-based rule, or something else?

## Interface OrderFillBase

This describes the information you receive when an order is confirmed and filled – it's a notification that something actually happened on the exchange. Think of it as the final confirmation that your order went through.

It's important to note that you won't see these fills during backtesting, or when an order is rejected or fails temporarily.  These notifications only happen when an order is successfully executed, and the broker acknowledges that.

The `type` property tells you whether it's a new position opening ("active") or related to a scheduled order.  The notification includes details like the trading pair, the strategy that generated the signal, the exchange used, and the price at the time of confirmation.  You'll also find data about your profit and loss, and other relevant metrics like peak profit and drawdown. It also gives information about how the entry and exit prices evolved since creation and possible adjustments. Several fields also describe the status of the position itself.

## Interface OrderContinueContract

This event signifies that the framework is continuing to monitor an order—it hasn't determined the order is closed yet. It's a follow-up to an initial check and lets you know the order is still considered open on the exchange.

This event is emitted repeatedly while the order remains active, and the `type` property indicates whether it's an order backing an existing position (`active`) or a resting order awaiting a signal (`schedule`). The `attempt` value is crucial; a value of `0` means the order check was successful and the failure count has been reset. Values greater than `0` show a transient failure that was tolerated—the higher the number, the more consecutive failures have occurred before this point.

The event includes comprehensive details about the trade, such as the trading pair, strategy name, exchange, timeframe (empty during live trading), signal identifier, timestamp, and current market price. You’ll also find information regarding the position’s performance like unrealized P&L, peak profit, drawdown, and prices.  Finally, information related to scheduling and averaging is included such as original/effective take and stop loss, and total entry and partial close counts.


## Interface OrderContinueCheckNotification

This notification lets you know about the status of an order check—specifically, when the check didn’t immediately fail or succeed. It's a signal that monitoring continues.  You'll receive it when the order is still open or a temporary problem was handled.  Think of it as a “keep an eye on this” alert.

The notification includes a lot of details about the order itself:

*   **Symbol:** The trading pair like BTCUSDT.
*   **Strategy Name:**  The name of the strategy that triggered the order.
*   **Exchange Name:** Where the order was placed.
*   **Order Type:** Whether it's an active order tied to a current position or a "schedule" order waiting for activation.
*   **Attempt:** A counter showing how many times a temporary error has been tolerated.

You’ll also find key pricing information, including the original and adjusted entry and stop-loss prices, alongside details about DCA averaging and partial closes.

The notification also includes a substantial amount of performance information about the position, encompassing realized and unrealized profit and loss (PNL), peak profit, maximum drawdown, and related metrics.  This gives a clear snapshot of how the position has performed over its life so far.



It’s important to remember that this notification is “live-only,” meaning it’s only generated for active, real-time trading, not historical backtests.

## Interface OrderCloseContract

This event lets you know when a trading signal you're tracking has been closed, whether it was due to hitting a profit target, a stop-loss, time expiration, or manual closure. It provides a wealth of information about the closed trade.

You'll get the current market price at the time of the closure, the total profit and loss (pnl) for the entire position, and details about the peak profit and maximum drawdown experienced.  It also includes information about the trade's direction (long or short), the initial and final prices for entry, take profit, and stop-loss.

You can see how the prices changed due to trailing stop adjustments. The event also tells you exactly *why* the signal was closed—was it a take profit, stop loss, or something else?

Furthermore, it provides details on any DCA averaging that took place (number of entries) and if there were any partial closes, giving you a full picture of the trade’s lifecycle. A timestamp shows when the signal was initially created and when the position was activated.

## Interface OrderCheckContract

This event, `OrderCheckContract`, is a crucial signal sent during live trading to confirm the status of your orders with the exchange. Think of it as a periodic check-in. It tells you if the order you placed based on a trading signal is still active on the exchange – whether it's a pending order (like waiting for a fill) or a resting order (like a limit order waiting to be triggered).

The system sends these checks frequently, and your adapter needs to respond. A successful response means the order is still good, and the framework keeps monitoring it. If the framework doesn't find the order (meaning it was filled, canceled, or liquidated elsewhere), it will take action – closing the pending signal or canceling the scheduled signal, depending on the situation.

Transient errors are tolerated by retrying the check a few times, but a confirmed problem triggers immediate action. Backtesting doesn't use this signal because it doesn't simulate real-time exchange interactions.

The signal contains detailed information, including the trading symbol, strategy name, exchange, timeframe, signal ID, timestamp, the original signal data, and various pricing information like entry price, take profit, stop loss, P&L, and DCA details. There's also a counter (`attempt`) to track consecutive failures—it resets on success and is incremented with each temporary hiccup. This comprehensive data helps you understand the context of the order check and diagnose any issues.

## Interface MetricStats

This object holds a collection of statistics related to a particular performance metric. It essentially gives you a comprehensive view of how that metric behaved during a backtest. 

You’ll find information like the total number of times a metric was recorded, the total time it took across all occurrences, and details on its distribution. 

Key statistics included are the average, minimum, maximum, and median values of the metric's duration. It also provides insights into its variability through the standard deviation. 

Furthermore, it provides data around wait times – the minimum, maximum, and average durations between events related to the metric. Percentiles (like the 95th and 99th) give you a sense of how outliers affect the overall performance.

## Interface MessageModel

This describes a single message within a chat history, like the kind you'd see in a conversation with an AI. Each message has a role, which tells you who sent it – whether it’s a system instruction, something the user typed, a reply from the assistant, or the results of using a tool. 

The main part of the message is its content, which is the text itself. Sometimes, an assistant message might not have any text content if it only contains information about tool usage.

Some AI models also provide detailed reasoning or chain-of-thought explanations, and this is captured in the `reasoning_content` property.

If the assistant used any tools, those details are listed in the `tool_calls` section. Images can be attached to messages too, and they can be provided as strings, raw data, or binary data. Finally, a `tool_call_id` can identify which tool call the message is directly related to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred during a trading simulation or backtest. 

It contains two key pieces of data: a detailed list of each drawdown event, showing them in chronological order (most recent first), and the total count of all recorded drawdown events. The `eventList` property provides a complete record of the worst performance periods, while `totalEvents` gives a simple count of how many times a maximum drawdown was observed.

## Interface MaxDrawdownEvent

This object represents a single instance of maximum drawdown experienced by a trading position. It provides detailed information about when and how that drawdown occurred.

You'll find the exact time (in milliseconds since January 1, 1970) recorded when the drawdown event happened, along with the trading pair (symbol) involved and the name of the strategy or signal that generated the position. 

The object also captures the direction of the position (long or short), and provides a snapshot of the position’s profit and loss (pnl), the highest profit reached (peakProfit), and the actual maximum drawdown amount itself.

Additionally, it includes the price at which the drawdown was recorded, the entry price for the position, and the take profit and stop loss prices that were set. Finally, a flag indicates whether this event happened during a backtesting simulation.

## Interface MaxDrawdownContract

This structure provides information whenever a new maximum drawdown is detected for a trading position. It's designed to help you track and react to significant losses in your positions.

Each update includes details like the trading symbol, the price at the time of the drawdown, and a timestamp for precise tracking. You’ll also find the names of the strategy, exchange, and timeframe involved.

Crucially, it also provides the signal data that triggered the position and a flag indicating whether the event happened during a backtest or in live trading. This allows you to adjust your response appropriately.

These drawdown updates are essential for monitoring risk and managing your positions effectively. They give you the data needed to make informed decisions and protect your capital.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your trading performance, offering a wealth of statistics derived from your trades. It tracks everything from the raw number of events to complex risk-adjusted return metrics.

You'll find a record of every trade event, along with totals for wins, losses, and overall activity. Key performance indicators like win rate, average profit per trade (avgPnl), and total profit (totalPnl) are readily available.

Beyond simple profit calculations, the model dives into risk management metrics. Standard deviation (stdDev) measures volatility, while the Sharpe and Sortino ratios assess risk-adjusted returns, helping you understand the efficiency of your strategy.  Certainty Ratio and Expectancy provide insights into the reliability of your trading decisions.

Duration statistics, like avgDuration, avgWinDuration and avgLossDuration, highlight how long trades typically last.  MedianPnl offers a robust measure of typical profit, less susceptible to extreme values.  

Finally, the model incorporates market pressure and trend analysis, categorizing trends as bullish, bearish, sideways, or neutral, and providing insight into price movement. It measures buyer and seller influence, and even assesses the confidence in any identified trend.



Essentially, this model gives you a complete picture of how your trading system is performing and where it might need adjustments.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes, but are things the system can potentially recover from. 

Each notification has a specific `type` to clearly identify it as an "error.info" message. 

A unique `id` helps track each notification if needed. 

You'll also find details about the error itself, including a `message` that's easy to understand, and a full `error` object with technical information like a stack trace. 

Finally, the `backtest` property is always `false`, indicating these errors originate from a live trading context, not a simulated backtest.

## Interface IdlePingContract

The IdlePingContract represents a notification that a trading strategy is currently in an idle state, meaning it's not actively responding to any signals. This event is triggered periodically when no signals are being monitored. 

It provides details about the idle strategy, including the trading symbol (like BTCUSDT), the strategy's name, the exchange it's running on, and whether it's a backtest or live execution. You’ll also find the current price at the time of the ping, and a timestamp marking when the ping occurred. 

Essentially, it’s a way to track the lifecycle of your trading strategies and understand when they're in a waiting period. Consumers can listen for these idle ping events using functions like `listenIdlePing()` or `listenIdlePingOnce()`.

## Interface IWarmCandlesParams

This interface defines the settings needed to prepare historical candle data for backtesting. It's all about getting the necessary price history ready before your tests begin.

You'll specify the trading symbol, like "BTCUSDT", and the exchange you’re using. The candle interval, such as "1m" for one-minute candles or "4h" for four-hour candles, is also essential. Finally, you'll define the start and end dates to specify the range of historical data you want to download and store.

## Interface IWalkerStrategyResult

This object holds the results for a single trading strategy that's been tested. It tells you the strategy's name so you know which strategy the data belongs to. 

You’ll also find detailed statistics about the backtest itself, like profit, drawdown, and win rate, all neatly organized. 

A key value, the metric, represents how well the strategy performed based on a defined measurement—this might be null if the strategy wasn’t valid for comparison. Finally, the rank shows you where this strategy stands in relation to the other strategies being compared, with a lower rank meaning better performance.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up and run comparisons between different trading strategies – essentially, an A/B testing setup.

You specify a unique name for each walker (the comparison setup), a description for your reference, and which exchange and timeframe will be used for all the strategies within that walker.

It’s crucial to list the names of the strategies you want to test, making sure they’ve already been registered with the system.

You can choose what performance metric you want to optimize, like Sharpe Ratio, although a default is provided.

Finally, you can optionally provide callbacks to hook into different stages of the walker's execution, if you need to perform custom actions at those times.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after running a comparison of different trading strategies. It essentially packages up the outcome of a full analysis.

You'll find details about the specific financial instrument being tested, identified by its `symbol`.  It also records which `exchangeName` was used for the trading data. The `walkerName` tells you which analysis process was executed. Finally, it specifies the `frameName`, indicating the timeframe used for the backtesting.

## Interface IWalkerCallbacks

This interface lets you hook into different stages of the backtesting process. Think of it as a way to be notified about what’s happening behind the scenes as your strategies are being tested.

You can get a notification when each strategy begins its test (`onStrategyStart`). 
After a strategy finishes, you’ll be informed with performance statistics (`onStrategyComplete`). 
If an error occurs during a strategy's testing, `onStrategyError` will alert you.
Finally, `onComplete` signals that all the strategies have been run.

These callbacks give you the opportunity to log progress, monitor for problems, or perform other actions as the backtesting runs.

## Interface ITrailingTakeCommitRow

This interface represents a specific action queued for your trading backtest – a trailing take commit. Think of it as a record of an order that needs to be placed to manage a trailing stop and take profit strategy.

It details what action to take ("trailing-take"), how much the price should shift (percentShift), and the initial price at which the trailing stop was established (currentPrice).  Essentially, it's a snapshot of a planned trade adjustment.


## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a record of a specific change or adjustment needed to be made to a trailing stop.

It includes details like the type of action being performed—in this case, a "trailing-stop" action—and the percentage shift that's been applied to the trailing stop. 

You’ll also find the price at which the trailing stop was initially set, which is crucial for understanding the context of the adjustment. Essentially, it's a snapshot of a trailing stop event waiting to be processed.

## Interface ISweepTrade

The `ISweepTrade` interface describes a single trade executed within the backtest-kit framework. Each trade is linked to a specific idea through its `ideaId`, allowing you to trace back the origin of the trade.  The `symbol` property identifies the trading pair involved, ensuring clear differentiation between trades on different assets.  Knowing the `author` of the idea that triggered the trade simplifies analysis of performance by individual strategies. 

The interface also tracks important timing details, including `entryTimestamp` and `exitTimestamp` representing the entry and exit times, respectively. The `exitReason` explains why the trade was closed.  You can determine how long a trade was held using the `holdMinutesActual` property.  The `pnlPercent` provides a simple calculation of profit and loss, inclusive of fees.

Finally, `absorbedIdeas` is a list of other ideas that were prevented from entering trades because this trade was already holding the position, offering valuable insight into signal contention.

## Interface ISweepTrack

The `ISweepTrack` interface represents a single author's performance record based on a specific trading rule. Think of it as a detailed performance report for one person's trading strategy under certain conditions.

Each track contains information like the holding time, lock level, stop loss percentage, and trailing take percentage – all components defining the specific rule being evaluated.

The track includes crucial data like the total number of ideas generated, the number of successful hits (where the lock or trailing arm triggered before the stop loss), and the hit rate (hits divided by ideas).  It’s important to note that even for the same author, the hit rate will vary based on the rule's parameters.

The `author` property identifies the trader, and the `hitRate` provides a convenient, calculated value for filtering and assessing trust directly within your application without applying hard-coded thresholds. This design prioritizes continuous evaluation rather than a simple pass/fail assessment.

## Interface ISweepSchema

This schema defines how a sweep, which is essentially a testing configuration, is registered within the backtest-kit framework. Each sweep needs a unique name to identify it.

The sweep also specifies which exchange to pull historical candle data from. Be aware that the exchange must provide exactly the expected number of candles, or the process will be stopped.

You can customize the grid axes—think of them as different levers you can adjust—but only for the ones you actually want to change. Leaving an axis unspecified means it will use the default settings. Some settings, like profit lock percentage, can effectively disable a feature by being set to a single value.

Callbacks allow you to hook into certain events during the sweep process. For instance, `onAuthorsTrained` is triggered once for each unique combination of rules, locks, stops, and trailing parameters, not for every single grid point tested.

Finally, `reportOrder` controls how the results of the sweep are sorted, defaulting to "sharpe" ratio and impacting how the reports are listed, but not affecting the actual backtest results.

## Interface ISweepResult

The `ISweepResult` represents the outcome of a backtesting simulation. It bundles together a lot of crucial information about the run.

You'll find the trading symbol the test was performed on.

It also includes counts for how many ideas (signals) were received and acted upon, broken down into total and directional signals.

The framework keeps track of how many idea profiles were created and how many were cut short due to the end of available data.

Holding time statistics are provided, showing the average holding time, and the 95th and 99th percentiles, which helps identify very long-held positions.

Finally, the `reports` property contains the key performance data, showing the grading of each grid point based on the profit-before-stop metric, along with ranking winners and the contribution of each author to the results.

## Interface ISweepPointReport

This report summarizes the performance of a specific grid point within a backtest. It provides a detailed breakdown of the trades executed at that point, including key metrics like total and average profit, win rate, and drawdown. You'll find information about how long trades were held, with specific percentiles highlighting unusually long holding times. 

The report also includes risk-adjusted performance ratios like Sharpe and Sortino, which consider the time spent holding trades and penalize prolonged periods of inactivity. It details the reasons why trades were exited, giving insights into the trading behavior. Importantly, the full list of trades for that point is included, allowing for detailed analysis of individual trade outcomes. This comprehensive data enables a thorough understanding of the grid point's performance and the factors influencing it.

## Interface ISweepParams

The `ISweepParams` object holds all the information needed to run a sweep, acting as a central container for configuration. It includes a logger for debugging and output, ensuring you can track what's happening during the sweep process.

Crucially, it defines the axes used to create the grid of parameters to test.  The object also dictates the order in which results will be reported, helping you analyze the data effectively. These parameters are resolved and combined with any necessary system components to get everything ready for execution.

## Interface ISweepMetricReport

This object represents a complete report from a backtesting sweep, essentially a single data bucket. 

It contains all the information about how each grid point performed, specifically graded based on profit before stop-outs. 

You'll find a list of reports, ordered by a ranking system (by default, Sharpe ratio).

There's also a section detailing the best-performing grid points based on different ranking criteria.

Finally, it includes "tracks," which are records of the specific trading rules (like hold, lock, stop, and trailing) used by different authors, allowing you to analyze how various strategies performed without needing to dig deeper into individual reports. This is intended to be a concise summary of rule performance.

## Interface ISweepIdeaProfile

An ISweepIdeaProfile represents the performance of a trading idea over a specific time period, essentially a snapshot of how the idea played out. It contains a series of historical candle data, starting from the entry point of the trade. 

The profile includes key information like the entry price and timestamp, and a record of whether the idea generated a profit (the "hit" property). It also tracks the largest positive and negative price swings from the entry price, along with the time it took to reach those points. 

The profile also calculates diagnostics that give an overall view of the idea's behavior, like the median price movement relative to the entry price and a measure of how much the price fluctuated before any significant move in the idea’s direction – this helps evaluate how resilient the idea is to market noise. These diagnostics aren't used to grade the idea itself, but rather provide additional insights for understanding its performance.

## Interface ISweepIdea

An `ISweepIdea` represents a single trading idea, which is essentially a public forecast made by someone. Think of it as a prediction about a specific asset, like BTCUSD.

Each idea has a unique identifier, a timestamp indicating when it was published, and specifies the trading pair it relates to. It also tells you which way the author thinks the price will move – up or down. Finally, it includes the author's login name, so you know who made the prediction.

Importantly, backtesting simulations happen on a per-idea basis, not on individual price points.

## Interface ISweepGridPoint

This interface defines a single point within a sweep grid – think of it as one specific trading setup. Each point has settings that dictate how that trade will be managed. 

You'll find settings like the hard stop level, which is a safety net to prevent excessive losses, and a trailing take profit, which adjusts as the price moves in your favor. 

There's also a maximum time a position can be held, and a profit lock feature that can automatically exit a trade when a certain profit level is reached. If a setting is zero, it typically means that feature is turned off for that grid point.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines the possible values used to create a grid of trading strategies. Think of a grid as a set of rules that combines different settings to explore various trading approaches. Each property within this interface represents a parameter that can be adjusted – like how much of a loss is acceptable before a forced exit, how much of a profit is given back with a trailing stop, how long a trade can be held, or what level of profit will trigger a fixed exit.

The `hardStopPercent` array defines the levels at which the trade will be forcibly closed to limit losses. This is a crucial safety net.

The `trailingTakePercent` array controls how much of a price increase is allowed before a trailing stop is activated, influencing how long a profitable trade can run.

The `holdMinutes` array sets the maximum duration a trade can remain open. This affects how frequently new trading opportunities are considered.

Finally, `profitLockPercent` determines levels where a trade will lock in profits, providing an earlier exit point compared to a regular trailing take profit, which helps to capture smaller gains.

Each of these axes is considered important; no setting exists that's completely inactive or ignored. Every combination and every setting is a part of the grading and evaluation of the strategy’s performance.

## Interface ISweepCallbacks

This interface provides a way to track the progress and results of a backtest simulation. Think of it as a series of events you can listen to as the simulation runs.

You can monitor the simulation's progress by receiving updates on each stage, such as when processing profiles or grid points, along with information like how many items have been processed and the total number expected.

It also lets you know how many total and directional ideas are being considered.

When the simulation builds profiles for each idea, you'll receive details about these profiles, including any that were cut short due to the end of available candle data.

The `onAuthorsTrained` event provides insights into the performance of each author for specific grading rules, like stop-loss and trailing stop strategies.

For each grid point evaluated, you'll receive a report detailing the trades executed.

When ranking the results according to different criteria, you’ll get the sorted reports and the overall best result.

Finally, when the entire simulation is complete, the `onDone` event delivers the final result.


## Interface ISweepBest

ISweepBest represents a single, top-performing result within a ranking process. It holds the specific ranking criterion that determined this result, essentially highlighting the reason for the win. Crucially, it only contains the criterion itself and a link to the full report detailing all aspects of the winning point, avoiding redundant information like the actual trades which are found in the report. If no winning result is found during a process, the report will be null.

## Interface ISweepAbsorbedIdea

This represents a trading idea that wasn't executed because the author already had a position active in their designated trading slot. 

Essentially, it's a record of a missed opportunity – a signal that couldn't be acted upon due to existing commitments. 

It includes the idea's ID and, crucially, the author's identifier. This allows for easy analysis of these missed opportunities directly linked to the specific author without needing to combine data from multiple sources.

## Interface ISweep

The `ISweep` interface defines how to execute a complete backtesting run.

Think of it as the main engine for your backtest – you give it a trading symbol and a list of potential trading strategies ("ideas"), and it will run them through a series of checks.

It first analyzes the strategies based on their performance profiles, then filters them based on predefined criteria, and then assesses how they would perform within a grid-based trading system. Finally, it ranks the strategies and presents the results. The `run` method handles all these steps in sequence.

## Interface IStrategyTickResultWaiting

This data represents a signal that's been scheduled but hasn't yet triggered. Think of it as the system watching for a price to hit a specific level before executing a trade. 

You'll see this kind of result repeatedly while the system monitors a scheduled signal.

Here's what the information tells you:

*   **action**:  Confirms that the signal is currently in a "waiting" state.
*   **signal**: Provides details about the scheduled signal itself.
*   **currentPrice**:  The price being tracked to see if it hits the signal's trigger point.
*   **strategyName, exchangeName, frameName, symbol**:  These identify exactly which strategy and trading pair this signal relates to.
*   **percentTp, percentSl**:  These are always zero because the trade hasn't been placed yet.
*   **pnl**:  This shows an estimated profit and loss calculation based on the current price, even though the position doesn't actually exist yet.
*   **backtest**:  Indicates whether the data comes from a backtest simulation or a live trading environment.
*   **createdAt**:  A timestamp indicating when this specific data point was recorded.

## Interface IStrategyTickResultScheduled

This interface describes a tick result that occurs when a strategy generates a scheduled signal—essentially, a trading instruction that’s waiting for a specific price to be reached. It's used to track these pending signals.

The `action` property simply identifies this type of tick as "scheduled."

You'll find the details of the signal itself in the `signal` property, which contains all the data related to that order.

Several properties assist in tracking and debugging: `strategyName`, `exchangeName`, and `frameName` indicate which strategy, exchange, and timeframe generated the signal. The `symbol` property clarifies the trading pair involved.

The `currentPrice` holds the price at the moment the scheduled signal was created.

`backtest` distinguishes between signals generated during backtesting and those from live trading.

Finally, `createdAt` records the exact time the tick result was generated.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. Think of it as a notification that a signal has been successfully generated and is ready for action. 

It contains details about the new signal, including its unique ID, the name of the strategy that created it, and the exchange and timeframe it applies to. You’ll also find the symbol being traded (like BTCUSDT) and the price at the time the signal was created. The information also indicates whether the signal originates from a backtest or a live trading environment and includes a timestamp of when the event occurred. Essentially, it’s a record of a signal being born, complete with its context.


## Interface IStrategyTickResultIdle

This interface represents a tick result when your trading strategy is in an idle state – meaning no active trading signal is present. It provides details about the context of this idle period.

You'll find information like the name of the strategy being used, the exchange it's connected to, and the timeframe being analyzed (like 1-minute or 5-minute candles).  It also specifies the trading symbol, the current price at that moment, and whether this idle state occurred during a backtest or a live trading session.  Crucially, the `signal` property is set to `null` to confirm the absence of an active signal. Finally, a timestamp marks exactly when this idle state was recorded, which is helpful for tracking and analysis.

## Interface IStrategyTickResultClosed

This data represents the result of a trading signal being closed, providing a detailed breakdown of what happened. It includes the completed signal details, like the original parameters used. 

You'll find information about the final price used for the trade, along with the reason for closing – whether it was due to a time limit, reaching a profit target, a stop-loss trigger, or a manual close.

The record also captures the exact time the signal was closed, and crucially, a profit and loss (PNL) calculation that factors in fees and slippage.  It tracks the strategy, exchange, timeframe, and trading symbol involved, as well as whether the event occurred during a backtest or a live trading session.  A unique ID is available for closes initiated manually. Finally, it records when this record was created, referencing the candle timestamp during backtests or the execution context during live trading.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal is cancelled – essentially, it didn’t lead to a trade. This could be because the signal didn't trigger, or perhaps a stop-loss was hit before a position could be opened. 

The data provided includes the signal that was cancelled, the price at the time of cancellation, and the exact moment it happened. You'll also see details about the strategy and exchange involved, the trading pair, whether it was a backtest or live execution, and the reason for the cancellation.  A unique ID can be included if the cancellation was initiated by a user request to stop a signal. Finally, there's a timestamp indicating when this cancellation event was recorded.

## Interface IStrategyTickResultActive

This interface represents a tick result when a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or time expiration. It provides key details about the situation.

The `action` property identifies this as an "active" state. You’ll find the signal being monitored in the `signal` property, and the `currentPrice` indicates the VWAP price currently being tracked.

Several properties are included for tracking and analysis, such as the `strategyName`, `exchangeName`, and `frameName` (like "1m" or "5m"). The `symbol` specifies the trading pair.

Progress towards the take profit and stop loss is shown as percentages, `percentTp` and `percentSl`, respectively.  The `pnl` property gives you the unrealized profit and loss for the position, factoring in fees, slippage, and partial closes.

The `backtest` property differentiates between backtesting and live trading, and `createdAt` records the time the tick result was generated. Lastly, `_backtestLastTimestamp` is a private timestamp useful for managing backtest candle processing.

## Interface IStrategySchema

The `IStrategySchema` defines how a trading strategy is registered and functions within the backtest-kit. It's essentially a blueprint describing the strategy's logic and how it interacts with the system.

Each strategy gets a unique `strategyName` for identification. A `note` field allows developers to add helpful documentation.

The `interval` property dictates how often the strategy should be checked for new signals – it's a throttling mechanism.  The core of the strategy is the `getSignal` function, which determines when and how to generate trading signals. It takes market data (symbol, timestamp, current price) and can be configured to generate signals immediately or wait for a specific price to be reached.

You can also include optional callbacks like `onOpen` and `onClose` via the `callbacks` property to handle events in the strategy’s lifecycle.  `riskName` and `riskList` can be used for managing risk profiles, and `actions` define associated actions for the strategy. Finally, `info` allows for custom data to be passed to the strategy for monitoring or external integrations.

## Interface IStrategyResult

The `IStrategyResult` object holds the results of a trading strategy’s backtest. It's designed to be used when comparing different strategies, allowing you to see which performed best.

Each `IStrategyResult` includes the strategy's name so you know what you're looking at. 
It also bundles all the detailed statistics from the backtest—things like profit, drawdown, and Sharpe ratio—into a single `BacktestStatisticsModel` object.

A numerical `metricValue` represents the optimization goal, helping rank strategies by performance. It will be null if the backtest was somehow invalid. 

Finally, `firstEventTime` and `lastEventTime` track when the strategy generated its first and last trading signals, respectively; these will be null if the strategy didn’t produce any signals at all.

## Interface IStrategyPnL

This interface defines the structure for representing a strategy's profit and loss (PnL). It breaks down how well your strategy performed, considering real-world trading costs. 

The `pnlPercentage` tells you the overall profit or loss as a percentage. You'll see positive numbers for gains and negative numbers for losses.

`priceOpen` shows the actual price you paid to enter a position, factoring in both slippage (the difference between the expected price and the execution price) and trading fees.

Similarly, `priceClose` reflects the price you received when exiting the position, also adjusted for slippage and fees.

`pnlCost` calculates the dollar amount of your profit or loss, derived from your percentage gain/loss and the initial investment.

Finally, `pnlEntries` represents the total amount of money you put into the strategy by summing all the costs of your entries.

## Interface IStrategyCallbacks

This interface lets you hook into key moments in your trading strategy's lifecycle. Think of it as a way to observe and react to what's happening in your backtest or live trading environment.

You can define functions to be called on every tick (`onTick`), when a new signal is opened (`onOpen`), when a signal is being monitored (`onActive`), and when there's no active signal (`onIdle`).

There are also callbacks for when a signal is closed (`onClose`), created on a schedule (`onSchedule`), or cancelled (`onCancel`).  `onWrite` lets you interact with persistence storage, primarily used for testing.

Additionally, you’ll get notifications for specific profit and loss scenarios – partial profit (`onPartialProfit`), partial loss (`onPartialLoss`), and reaching breakeven (`onBreakeven`). Finally, `onSchedulePing` and `onActivePing` provide a way to monitor scheduled and active signals at a more frequent rate than your main strategy interval, enabling custom checks and adjustments.

## Interface IStrategy

The `IStrategy` interface defines the core methods a trading strategy must implement. It's all about how the strategy reacts to market ticks and manages positions.

**Key Responsibilities:**

*   **`tick`**: This is the main method called on each price update. It checks for signals, potential take profit/stop loss triggers, and other conditions.
*   **Signal Retrieval**:  Methods like `getPendingSignal` and `getScheduledSignal` allow access to active signals. They return `null` if no signal is present.
*   **Breakeven Handling**: `getBreakeven` determines if enough profit has been made to cover transaction costs.
*   **Strategy State**: Methods like `getStopped`, `getPaused`, and their setter counterparts (`setPaused`) control the strategy's operational state.
*   **Position Metrics**: Several methods (`getTotalPercentClosed`, `getTotalCostClosed`, `getPositionPnlCost`, etc.) offer insights into the current position's financial status.
*   **Backtesting**: `backtest` lets you run simulations using historical data.
*   **Control Methods**: These functions, `stopStrategy`, `cancelScheduled`, `activateScheduled`, `closePending` and `createSignal` let you manually intervene.
*   **Price Reporting**:  `createTakeProfit` and `createStopLoss` notify the system when prices hit externally confirmed TP/SL levels.
*   **State Inspection**: Methods like `getStatus` allow inspecting the state of the running backtest.
*   **Metrics and Timing**: A range of methods calculate, return, and validate related metrics such as maximum drawdowns and signal timing.
*   **Disposal**:  The `dispose` method releases resources when the strategy is no longer needed.



The interface focuses on providing both operational control and deep insights into the trading strategy's behavior.

## Interface IStorageUtils

This interface outlines the core functions any storage adapter used within the backtest-kit trading framework must provide. Think of it as the blueprint for how different storage systems (like databases or files) interact with the backtesting process. 

The adapter is responsible for reacting to different signal events – when a position is opened, closed, scheduled, or cancelled.  It also needs to be able to retrieve a specific signal by its unique ID or list all the signals it's managing.

Finally, the adapter handles periodic “ping” events to keep track of when signals are actively open or scheduled, ensuring the data remains current. These pings update a timestamp indicating the last activity of the signal.

## Interface IStorageSignalRowScheduled

This interface describes a signal record that's been scheduled for execution. 

It keeps track of the signal's current status, confirming it's in a "scheduled" state. It also stores the price at the time the signal was scheduled – essentially the VWAP price from the tick data used to create the signal. This price information helps maintain consistency between the signal and the market conditions when it was initially planned.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, providing details about its initial state. When a signal is triggered and a trade is initiated, this interface holds the information related to that opening. It specifically tells you the signal's status is "opened" and the price at which the trade was started, which is the VWAP price at the time of the signal. Think of it as a snapshot of the conditions when the trade began.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed out, meaning a trade has been executed. 
It holds details about the signal's closure, specifically for analyzing performance. 

You'll find information like the reason the signal was closed, the final price it traded at, and the profit or loss (PNL) generated by that trade.
The timestamp marks the exact moment the signal closed. 

Essentially, it’s a record of a completed trade, providing key data points for evaluating a trading strategy.


## Interface IStorageSignalRowCancelled

This interface defines a signal row that has been cancelled. It’s really straightforward – it just indicates that a signal's status is "cancelled."  Essentially, if a signal is marked as cancelled, this interface provides a way to represent that information consistently within the backtest-kit framework. You’ll use this when you need to track and process signals that have been stopped or invalidated.

## Interface IStorageSignalRowBase

This interface defines the foundational structure for how trading signals are stored. 

Every signal, regardless of its status, will have a `createdAt` timestamp indicating when it was generated from a strategy tick.  A `updatedAt` timestamp tracks when the signal was last modified.

Signals also get a `priority` value, which helps manage their order during processing; a current timestamp ensures a sensible order.  Think of it as an internal sorting mechanism.


## Interface IStateParams

`IStateParams` helps you define how your trading signals are organized and what their starting point looks like. Think of it as setting up the containers for your data.

`bucketName` lets you categorize signals, giving them a logical label like "trade" or "orderbook" to keep things neat.

`initialValue` specifies what value a signal will have when it's first created – it's the starting point before any data is loaded.

## Interface IStateInstance

The `IStateInstance` interface provides a standardized way to manage state information, particularly for tracking metrics related to trades. It's designed to work with strategies that use LLMs, allowing them to monitor factors like unrealized profit and loss, how long a trade has been open, and when to exit a position. Think of it as a way to store and update information about a trade as it progresses.

The interface includes methods for initializing the state, retrieving the current state value (but with a safety mechanism to prevent looking into the future), updating the state (with rules to handle restarts correctly), and releasing any resources the state instance uses. It enables a flexible system for tracking the performance of trades over time.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion. It's used to determine how much of your capital to allocate to each trade.

The `method` property explicitly states that this is a Kelly Criterion sizing approach.

The `kellyMultiplier` property controls the aggressiveness of the Kelly Criterion.  It’s a number between 0 and 1, representing a portion of the Kelly fraction to use. A lower value (like the default 0.25) is a more conservative "quarter Kelly" approach, minimizing risk of ruin. Higher values will allocate more capital to trades, but also increase risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward way to size your trades – by using a fixed percentage of your capital for each one.  The `method` is always "fixed-percentage," clearly identifying this sizing strategy. You'll also need to specify the `riskPercentage`, which represents the maximum percentage of your trading capital you're willing to risk on a single trade. This value should be between 0 and 100, reflecting a percentage.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations used within the backtest-kit framework. Each sizing schema needs a unique identifier, which is the `sizingName`. 

You can also add a helpful note, `note`, for your own documentation or to explain the sizing strategy. 

The configuration also includes limits on position size:  `maxPositionPercentage` sets the maximum percentage of your account you'll risk on any trade, while `minPositionSize` and `maxPositionSize` define the absolute minimum and maximum position sizes allowed.

Finally, `callbacks` allow you to hook into specific points in the sizing process if you need to customize behavior further.

## Interface ISizingSchemaATR

This schema defines how to size trades using the Average True Range (ATR). It's specifically for strategies that want to base their position sizing on ATR values.

You'll find that this schema has a `method` property which is always "atr-based" to confirm it's using this sizing technique.

The `riskPercentage` controls how much of your capital you’re willing to risk on each trade—a number between 0 and 100.  

The `atrMultiplier` determines how the ATR value is used to calculate the stop-loss distance. A higher multiplier means a wider stop-loss, potentially allowing for more price fluctuation before the stop is triggered.

## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how to configure Kelly Criterion sizing when setting up a client for trading.

It mainly focuses on providing a way to log debugging information. 

Specifically, it requires a `logger` service, which allows you to track and understand what's happening during the sizing calculations. This logger helps in troubleshooting and refining your trading strategy.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for sizing trades using a fixed percentage approach. It's designed for use when setting up your trading strategies. 

You'll need to provide a logger to help with debugging and understanding how your strategy is performing. The logger allows you to record important information and track down any issues that might arise.


## Interface ISizingParamsATR

This interface defines how to calculate the size of trades when using an ATR (Average True Range) based sizing strategy. It primarily focuses on providing a way to log debugging information related to the sizing calculations. The `logger` property allows you to connect a logging service to monitor and understand how your trade sizing is behaving. This helps you troubleshoot and fine-tune your sizing approach.

## Interface ISizingCallbacks

The `onBeforeSubmit` callback provides a final opportunity to inspect the trade size right before it's sent to your broker. Think of it as a last chance to validate or tweak the size before execution. This is useful for implementing additional checks or making small adjustments just before the order goes through.

## Interface ISizingCalculateParamsKelly

When sizing trades using the Kelly Criterion, you’ll need to define how much information is available for the calculation. This structure helps you pass in the necessary data. You'll provide the calculation method, which in this case is explicitly set to "kelly-criterion." 

The structure also requires you to input the win rate – essentially, the percentage of winning trades you expect. 

Finally, you’ll need to specify the win/loss ratio, representing the average profit compared to the average loss for each trade. These values together will be used to determine an optimal bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed when you're sizing a trade using a fixed percentage approach. It includes two key pieces of information: the `method` which must be set to "fixed-percentage" to indicate the sizing strategy being used, and the `priceStopLoss`, which represents the price at which a stop-loss order would be placed. Essentially, you're telling the system to size the trade based on a percentage and to place a stop-loss at this specified price.

## Interface ISizingCalculateParamsBase

This defines the basic information needed when calculating how much to trade. 

Every sizing calculation needs to know the trading pair symbol, like "BTCUSDT," so it can access the relevant market data. 

It also needs to be aware of the current account balance to ensure trades are sized appropriately and the entry price, the price at which the trade is planned.

## Interface ISizingCalculateParamsATR

This interface defines the configuration needed when calculating trade sizes using an ATR (Average True Range) based method. It requires you to specify that the sizing method is "atr-based". You'll also need to provide a numerical value for the ATR itself, representing the current average true range. This value will be used in the sizing calculations.

## Interface ISizing

The `ISizing` interface is a core part of how backtest-kit determines how much of an asset to trade. It's responsible for figuring out the right position size, essentially answering the question: "How much should I buy or sell?". 

The `calculate` method is the heart of this interface.  When called, it receives information about your current trading conditions – things like your risk tolerance, account balance, and the asset's price. It then uses this information to determine a suitable position size, returning a number representing that size. This method is asynchronous and returns a promise, because position size calculations might involve complex operations or external data.

## Interface ISignalRow

This `ISignalRow` object represents a complete trading signal within the backtest-kit framework, essentially a finalized signal ready for execution. It holds all the key details about a trade, from its unique identifier and cost to its entry and exit parameters.

Each signal has a unique ID and a cost associated with the trade. You'll find details like the opening price, the estimated holding time, and identifiers for the exchange, strategy, and timeframe being used. It tracks when the signal was initially created and when the position started pending.

The signal also captures essential position-specific information, like the trading pair symbol, and whether the signal was initially scheduled. A crucial aspect involves tracking partial closes (profit or loss) to precisely calculate overall performance.

For more advanced strategies, the signal can incorporate trailing stop-loss and take-profit prices, dynamically adjusting them based on price movement.  It also keeps a record of any dollar-cost averaging (DCA) entries.

Finally, it maintains a record of the highest profit and lowest loss points seen during the trade's lifecycle, alongside a timestamp of when the signal was generated or received. It has a timestamp indicating when the signal was created or dispatched.


## Interface ISignalIntervalDto

This data structure helps manage how often trading signals are generated. It lets you bundle multiple signals together and release them at specific intervals, preventing a rapid flood of signals. Each signal within the bundle has a unique ID, like a UUID, to easily track it. This approach is useful when you want to control the timing of signal delivery.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the kind you'd receive before executing a trade.  It bundles all the key information needed to set up a position.

Each signal includes a unique identifier, the ticker symbol involved, whether you’re going long (buying) or short (selling), and a note explaining the reasoning behind the signal.

You’ll also find the entry price, take profit level, and stop loss – crucial for risk management.  A time limit can be set for how long the position should remain open, and there's even a field to specify the cost of entering the position. If you don't provide an ID, one will be created automatically.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to handle situations where a signal is closed by a user action. It adds extra information specifically related to those user-initiated closures. 

When a user closes a signal, the `closeId` property stores a unique identifier for that closure event.  Alongside the `closeId`, the `closeNote` property allows you to include a user-provided note or explanation concerning the closure. This helps in tracking the reasoning behind user actions. These extra properties are only relevant when the signal's closure wasn't automatic.

## Interface ISessionInstance

This interface outlines how session instances work within the backtest-kit framework. Think of a session instance as a container for temporary data specific to a particular trading setup – a combination of symbol, strategy, exchange, and timeframe.

It's designed to hold information that strategies need to share during a single backtest run, like intermediate calculations or cached results.

The `waitForInit` method allows you to set up the session instance before it's used. `setData` lets you write new information into the session, linking it to a specific date and time. `getData` retrieves that stored information, but with a safety measure to prevent looking into the future. Finally, `dispose` cleans up any resources the session instance was using when the backtest is finished.

## Interface IScheduledSignalRow

This interface represents a signal that’s scheduled to trigger at a specific price. Think of it as a signal on hold, waiting for the market to reach a certain price level before it activates. It builds upon the basic signal structure and has a "pending" state, meaning it’s not immediately actionable.  The `priceOpen` property defines that target price - once the price hits it, the signal becomes a regular, active signal ready to execute a trade. Importantly, the time it's been waiting (pending time) is tracked, initially from when it was scheduled, and then updated to reflect the actual wait time.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might be canceled by a user. It builds upon the existing `IScheduledSignalRow` to include extra details specifically for cancellations. If a user cancels a signal, this interface will contain a unique `cancelId` to identify that particular cancellation, along with a `cancelNote` to provide context or a reason for the cancellation. These properties are only present when a signal is canceled by the user.

## Interface IScheduledSignalActivateRow

This interface describes a scheduled signal that might have been activated by a user. It builds upon the standard scheduled signal information and adds details related to user actions. Specifically, if a user manually triggered the signal, the `activateId` property stores a unique identifier for that activation, and `activateNote` holds any notes the user provided during activation. These fields are only present when a user has initiated the activation process.

## Interface IRuntimeRange

This interface simply describes the timeframe your backtest will cover. 
It tells the backtest kit where to begin and where to end its analysis. 
You’ll see properties like `from` representing the start date and `to` representing the end date of the period you're testing. This helps define the scope of the backtest and ensures it runs only on the data you intend to use.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface gives you crucial details about what's happening during a backtest or live trading session. It provides the trading symbol, like "BTCUSDT," and the time period being analyzed. 

You'll also find information specific to your strategy – any custom data you've defined for monitoring or reporting.

It also includes details about the trading environment: which exchange and strategy are in use, what timeframe is being used, and the current timestamp. You'll also get the current market price and a flag to confirm whether the code is running in backtest mode.

## Interface IRunContext

The `IRunContext` object holds all the important information your trading logic needs to function correctly. Think of it as a package deal containing both the "where" and the "when" of your trades. It bundles together details about the trading system – like the exchange, strategy, and frame names – alongside crucial runtime data, such as the symbol being traded, the exact time, and whether it’s a backtest. This single object simplifies passing information around, allowing your code to focus on the trading decisions themselves.

## Interface IRiskValidationPayload

This interface holds the data needed when checking risk during trading. 

It builds upon the `IRiskCheckArgs` interface and adds extra details about your portfolio.

Specifically, it includes the `currentSignal` being evaluated, which has pre-calculated price information.

You'll also find the total number of open positions (`activePositionCount`) and a list of those positions (`activePositions`) for more granular analysis.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and responsible. Think of it as a gatekeeper – it checks to see if a trade is acceptable based on certain rules you set. If everything looks good, the function doesn't do anything (returns nothing). However, if it finds a problem, like a trade exceeding a limit, it flags it and provides a reason (returns a rejection result). It can also be programmed to stop with an error, which the system then translates into a detailed rejection notice.

## Interface IRiskValidation

This interface lets you define how to check the safety of your trading actions. It’s all about ensuring your risk parameters are reasonable. 

You provide a function – `validate` – that does the actual checking, and you can add a helpful explanation – `note` – to describe what the validation is doing and why it's important. This makes your risk checks easier to understand and maintain.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk by providing key information about a trade. It builds upon existing signal data and adds details crucial for risk validation. Specifically, it includes the entry price of the trade, the initial stop-loss price that was set when the signal was first generated, and the original take-profit price. This extra data ensures accurate risk calculations and validation throughout the trading process.

## Interface IRiskSchema

The `IRiskSchema` lets you define how your portfolio manages risk, acting as a blueprint for custom controls. 

Think of it as setting up rules and guidelines to keep your investments on track.

Each schema has a unique name to identify it, and you can add a note for yourself to explain its purpose.

You can also specify callback functions that get triggered at different points – like when a trade is rejected or approved – to execute specific actions.

Most importantly, the `validations` property allows you to create a set of custom checks that your portfolio must satisfy, defining the exact conditions for trade execution.


## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details to help you understand why the validation didn't pass. Each rejection has a unique ID to track it specifically, and a note explaining the reason for the rejection in plain language. This note is meant to be helpful for debugging and understanding the issue.

## Interface IRiskParams

The `IRiskParams` interface defines the essential settings when setting up the risk management system. It includes information like the name of the exchange you're working with and a way to log any debugging information. You also specify whether the system is in backtesting mode (simulated trading) or live trading mode. 

A crucial part is the `onRejected` callback; this function is triggered when a trading signal is blocked due to risk controls – it gives you the opportunity to react to that rejection and broadcast it. The `time` property helps ensure proper time handling to avoid issues caused by looking into the future.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple things are happening at once. Specifically, the `reserve` property is a boolean flag. 

When set to `true`, it ensures that when a risk check occurs, a placeholder is immediately put in place, similar to reserving a spot. This way, any other risk checks happening simultaneously will see the updated availability before a trade is actually made, preventing unexpected behavior due to race conditions. It's designed to make sure everyone’s on the same page when it comes to risk assessments.


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, helps your trading strategies avoid risky situations before they even start. Think of it as a safety check – it's passed to your risk management logic *before* a potential trade signal is created.

It bundles together important information about the context of a possible trade:

*   **symbol:** The asset you're considering trading (like BTCUSDT).
*   **currentSignal:** The specific trade signal that’s being evaluated.
*   **strategyName:**  Identifies which strategy is requesting the trade.
*   **exchangeName:**  The exchange where the trade would happen.
*   **riskName:** A specific label or category for the risk being assessed.
*   **frameName:**  A designation for the timeframe being used.
*   **currentPrice:**  The current average price of the asset.
*   **timestamp:** The time when these values were recorded.

Essentially, `IRiskCheckArgs` gives you all the necessary data to decide if opening a new position based on a signal is safe and appropriate, based on your defined risk rules.

## Interface IRiskCallbacks

This interface defines optional functions you can use to get notified about risk-related events during trading. If something goes wrong and a trading signal is blocked because it hits a risk limit, the `onRejected` function will be called, giving you a chance to react. Similarly, if a signal successfully clears all the risk checks, the `onAllowed` function will be triggered, letting you know a trade is approved. These callbacks allow you to monitor and respond to risk management decisions within your trading system.

## Interface IRiskActivePosition

This interface describes an active trading position that a backtest kit strategy is managing. It holds all the key details about a trade, including which strategy and exchange it belongs to, the trading symbol (like BTCUSDT), and whether it's a long or short position. You'll find the entry price, stop-loss, take-profit levels, an estimate of how long the position is expected to last, and the exact time the position was opened. This information is used to help analyze how different strategies perform together and manage overall risk.


## Interface IRisk

The `IRisk` interface is responsible for managing risk and tracking positions in your trading strategies. It lets you make sure trades align with your predefined risk limits.

The `checkSignal` method is your go-to for verifying if a trade is permissible based on your risk rules. 

For even more robust risk management, use `checkSignalAndReserve`. This method ensures that a position is tentatively marked as reserved *before* you fully commit to the trade, preventing race conditions in parallel strategies. Think of it like holding a spot to avoid double-booking. Remember to finalize this reservation with either `addSignal` (to confirm the trade) or `removeSignal` (to cancel it) to avoid issues.

`addSignal` is used to officially record a new, open position, while `removeSignal` clears out a closed position, keeping your risk tracking accurate.

## Interface IReportTarget

This interface lets you choose precisely what kinds of information your backtest framework will record. Think of it as a way to fine-tune the level of detail in your reports. 

You can enable or disable logging for things like strategy actions, risk-related rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading data, backtest signal closures, signal synchronization, and milestones like highest profit and maximum drawdown. 

By setting each property to `true` or `false`, you control which aspects of the backtest are tracked and included in the reports generated. This gives you a lot of control over the size and content of your reports.

## Interface IReportDumpOptions

This interface defines how to configure what data gets saved when generating reports from your backtesting runs. It lets you specify key identifiers like the trading pair (symbol), the name of your strategy, the exchange you used, the timeframe (frameName) being analyzed, a unique ID for the signal that triggered a trade, and the name of any optimization walker used. By providing these details, you can organize and filter your report data more effectively, making it easier to understand and analyze your trading strategies. Think of it as adding labels and tags to your data for better tracking.

## Interface IRecentUtils

IRecentUtils provides a way to manage and access recent trading signals. It allows you to receive and store active ping events, which represent new signals. 

You can easily retrieve the most recent signal for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. Importantly, this retrieval prevents looking into the future by ensuring the signal's timestamp isn't later than the requested time.

Finally, it helps you determine how long ago a signal was generated, useful for understanding signal freshness and potential lag.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to give you a clear view of what happened to a trading signal. It builds upon the standard signal information by including the initial stop-loss and take-profit prices you set when the signal was created. Even if those stop-loss and take-profit levels have changed later on through trailing strategies, you'll always be able to see the original values.

Here's a breakdown of the information you get from each property:

*   **cost:** The initial cost to enter this position.
*   **originalPriceStopLoss:** The stop-loss price when you first started the trade.
*   **originalPriceTakeProfit:** The take-profit price when you first started the trade.
*   **partialExecuted:** How much of the position has been closed out through smaller, partial trades.
*   **totalEntries:** How many times you've entered or added to this position, which tells you if you used averaging.
*   **totalPartials:** The total number of partial exits you’ve performed.
*   **originalPriceOpen:** The original entry price when the signal was triggered.
*   **pnl:**  The current, unrealized profit or loss.
*   **peakProfit:**  The highest profit the position has ever made.
*   **maxDrawdown:**  The largest loss the position has ever experienced.



It’s all about providing a transparent view of the signal’s history and performance.

## Interface IPublicCandleData

This interface describes a single candlestick, a common way to represent price data over time in financial markets. Each candlestick contains key information about a specific period, including when it began (timestamp), the price at which trading started (open), the highest and lowest prices reached during that period (high and low), the price at which trading ended (close), and the total volume of trades that occurred. Essentially, it provides a snapshot of market activity for a given interval.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you'll use when calculating position sizes based on the Kelly Criterion. 

Think of it as the core data needed to determine how much of your capital to risk on a trade.

Specifically, you'll provide two key numbers: the `winRate`, which represents the percentage of your trades that are winners, and the `winLossRatio`, reflecting the average amount you win compared to the amount you lose on each winning trade. These values directly influence the size of the position the Kelly Criterion suggests.

## Interface IPositionSizeFixedPercentageParams

The `IPositionSizeFixedPercentageParams` interface lets you define the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, but incorporates a stop-loss price. Specifically, you'll provide the `priceStopLoss`, which represents the price at which you want to set your stop-loss order to limit potential losses. This parameter is crucial for risk management within your trading strategy.

## Interface IPositionSizeATRParams

This interface defines the parameters needed to calculate your position size using the Average True Range (ATR). It's designed for situations where you want to adjust your trading size based on market volatility, as measured by the ATR.

The core of this is the `atr` property, which represents the current ATR value. This value dictates how much capital you'll allocate to a trade – a higher ATR generally implies a larger position size to account for increased volatility.


## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` helps you define how to detect overlaps when using dollar-cost averaging (DCA). Think of it as setting up a safety net around your DCA levels.

It has two key settings: `upperPercent` and `lowerPercent`.

`upperPercent` determines how much above each DCA level is considered an overlap – essentially, how far a price can climb before it triggers a warning.

`lowerPercent` does the opposite; it defines how much below each DCA level is allowed before it's flagged as a potential overlap issue.

These percentages are expressed as values between 0 and 100, so 5 represents 5 percent.

## Interface IPersistStrategyInstance

This interface lets you customize how strategy data is saved and loaded. It’s designed to handle the data specific to a particular trading setup—a specific asset, strategy name, and exchange.

If you want to move beyond the default file storage for this information, you can build your own adapter that implements this interface.

The `waitForInit` method is called to set up the storage for the strategy's data. The `readStrategyData` method retrieves any previously saved data. Finally, the `writeStrategyData` method handles saving new or updated data, and can even be used to clear out existing data by sending null.

## Interface IPersistStorageInstance

This interface defines how your trading framework can save and load signal data specifically for either backtesting or live trading – there’s a separate storage instance for each. It allows you to customize how signal information is stored, moving beyond the default file-based approach.

Think of it as a way to manage the historical record of your signals. When you read the data, it pulls all the signals it has stored and presents them in a list.  When you write data, it associates each signal with a unique identifier, so it knows where to put it.

If you want to use a different storage method, like a database, you can create your own adapter that implements this interface and provide your own versions of `waitForInit`, `readStorageData`, and `writeStorageData`.

The `waitForInit` method prepares the storage area for use, essentially setting it up for either backtesting or live trading.
`readStorageData` fetches all the previously saved signals.
`writeStorageData` is used to save signals, associating them with their identifiers.

## Interface IPersistStateInstance

This interface lets you manage how a trading strategy's data is saved and loaded, especially when things might go wrong. Think of it as a way to make sure your strategy remembers where it left off even if the system crashes. 

It's designed for situations where you need to store information specific to a particular signal and data bucket.

If you want to customize how this data is stored – maybe you don’t want to use files, perhaps you want to use a database – you can build your own adapter that follows this interface. 

The `waitForInit` method prepares the storage for the strategy's data.

`readStateData` retrieves the previously saved data.

`writeStateData` saves the current state, along with a timestamp.

Finally, `dispose` cleans up any resources the adapter might be using.

## Interface IPersistSignalInstance

This interface allows you to manage how trading signals are saved and loaded for a specific combination of symbol, strategy, and exchange. Think of it as a way to customize where and how your signal data is stored.

If you want to replace the default file storage mechanism, you can build your own adapter that implements these methods.

`waitForInit` lets you set up the storage when it's needed.

`readSignalData` retrieves the saved signal data.

`writeSignalData` is used to save new or updated signal data, and you can even use it to clear the data entirely by passing `null`.

## Interface IPersistSessionInstance

This interface defines how to manage session data that's specific to a particular combination of strategy, exchange, and frame – think of it as a container for settings and state unique to a specific trading setup. It's designed to help the system recover gracefully from crashes by saving and reloading this data.

If you're building a custom way to store this session information, like using a database instead of a file, you'll implement this interface.

The `waitForInit` method lets you prepare the storage when the session starts. `readSessionData` retrieves the previously saved data, while `writeSessionData` saves the current data along with a timestamp. Finally, `dispose` cleans up any resources the persistence system might be holding onto.

## Interface IPersistScheduleInstance

This interface defines how your custom code can handle saving and loading scheduled trading signals for a specific setup – think of it as remembering what a strategy decided to do at a particular moment. It's designed to work with a unique combination of a trading symbol, the name of the strategy being used, and the exchange it's operating on.

If you want to change how these signals are stored (maybe you want to use a database instead of a file), you can build your own adapter and implement this interface.

The `waitForInit` method allows for initializing the storage when it's first needed. `readScheduleData` fetches the saved signal from wherever it's stored, and `writeScheduleData` is used to save a new signal or to clear out the saved data if something needs to be reset.

## Interface IPersistRiskInstance

This interface defines how backtest-kit manages and saves your risk positions – essentially, the details of what trades are currently open for a specific combination of risk name and exchange. If you want to use a different way to store this information, like a database instead of files, you can create your own adapter that implements this interface.

The `waitForInit` method lets you prepare the storage space when needed, telling it whether to start fresh or load existing data.

`readPositionData` fetches the saved risk positions, letting you load the state of your trading activity at a specific point in time. 

Finally, `writePositionData` is responsible for saving your updated risk positions, so the next time you run the backtest, you can pick up right where you left off.

## Interface IPersistRecentInstance

This interface helps manage where and how your trading strategies remember the most recent signal they used. Think of it as a way to save the last action taken by a specific strategy on a particular market.

It's designed to work with a specific combination of factors like the asset being traded, the strategy's name, the exchange, and the timeframe.

If you want to customize how recent signals are saved – maybe you don’t want to use files – you can create your own implementation of this interface.

The `waitForInit` method is used to prepare the storage space for the signal data.

`readRecentData` retrieves the last known signal.

`writeRecentData` saves the current signal, along with the timestamp of when it occurred.

## Interface IPersistPartialInstance

This interface helps manage and save partial profit/loss data for your trading strategies. It's designed to keep track of information specific to a particular trading setup – think a certain asset, strategy, and exchange working together.

Essentially, it allows you to store data about a trade’s progress (like how much profit or loss you’ve made so far) separately for each signal. This data is tied to a unique identifier (signalId) and the moment it was recorded.

If you want more control over where and how this partial data is stored – perhaps you'd rather use a database instead of files – you can create a custom adapter that implements this interface.

The `waitForInit` method is used to set up the storage when things begin.  `readPartialData` retrieves previously saved information, and `writePartialData` saves new data.

## Interface IPersistNotificationInstance

This interface lets you customize how notifications are saved and loaded during a backtest or live trading session. Think of it as a way to replace the default file storage with something else, like a database.

Each backtest or live session gets its own instance of this, keeping things separate.

The `waitForInit` method is used to set up the storage when the session starts.

`readNotificationData` fetches all the previously saved notifications. It goes through the storage keys to find them.

Finally, `writeNotificationData` is responsible for saving new notifications, using their IDs to organize them.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts, like a particular conversation or task. Think of it as a way to manage the "memory" of a chatbot or AI agent.

It allows you to read, write, and delete memory entries – these entries can be simple data objects. Importantly, deletion is often a "soft delete," meaning the data remains on disk but is hidden from normal searches.

If you want to customize how memory is stored (perhaps using a database instead of a file), you can create a custom adapter that implements this interface.

The `waitForInit` method sets up the storage area. `readMemoryData` fetches a specific memory item. `hasMemoryData` checks if an item exists. `writeMemoryData` creates or updates a memory item, and `removeMemoryData` performs the soft delete.  `listMemoryData` gives you access to all valid memory entries. Finally, `dispose` allows for releasing any resources held by the storage.

## Interface IPersistMeasureInstance

This interface helps manage how your trading data is stored and retrieved, especially when dealing with large datasets or external APIs. It provides a way to persist measure data, which are essentially snapshots of your trading activity. 

Think of it as a system for caching results to avoid repeatedly fetching the same information. It even allows for "soft deletes," meaning data can be removed from active use but remains on disk until explicitly cleaned up.

If you’re building your own custom storage solution, you’ll implement this interface to control how data is loaded, saved, and retrieved for a specific bucket or segment of your backtest. 

Here’s a quick rundown of what it does:

*   **waitForInit:** Sets up the storage area when needed.
*   **readMeasureData:**  Retrieves a specific piece of cached data based on a key.
*   **writeMeasureData:** Saves new data to the cache.
*   **removeMeasureData:**  Marks data as inactive without deleting it from disk.
*   **listMeasureData:**  Provides a way to see all the currently active data entries.

## Interface IPersistLogInstance

This interface defines how your custom code can manage the persistent storage of log entries within the backtest-kit framework. Think of it as a way to replace the default file-based storage with something else, like a database or an in-memory solution. 

The framework uses a single, global log storage area for each running process. Every log entry is identified by a unique ID, and retrieving logs involves scanning through these IDs.

You’ll need to implement `waitForInit` to set up your storage when the system starts. `readLogData` allows you to pull all the stored log entries, while `writeLogData` lets you write new entries – ensuring that entries with duplicate IDs are skipped to maintain a chronological log.

## Interface IPersistIntervalInstance

This interface defines how backtest-kit persists information about when a specific trading interval has already occurred for a given bucket. Think of it as a way to remember, "Hey, we've already processed this interval for this particular trading scenario." 

The system uses these markers to prevent actions from being repeated unnecessarily. If a marker is 'soft-deleted', it’s as if it never existed, allowing the interval to be triggered again.

You can customize this behavior by creating your own adapters that implement this interface, replacing the default file-based persistence.

Here's what the methods do:

*   `waitForInit` sets up the storage for a specific bucket.
*   `readIntervalData` retrieves existing marker information based on a key.
*   `writeIntervalData` saves information about an interval firing, linking it to a key and timestamp.
*   `removeIntervalData` effectively resets the system for a key, allowing it to re-trigger the interval.
*   `listIntervalData` provides a way to see all the keys for which an interval hasn't been acknowledged yet.

## Interface IPersistCandleInstance

This interface defines how backtest-kit stores and retrieves candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to customize where and how candle data is kept during backtesting.

The `waitForInit` method prepares the storage space for a particular set of candles.

`readCandlesData` fetches a range of candle data from the storage. Critically, if even one candle within the requested timeframe is not found, the method returns null, signaling that the data needs to be fetched from the original data source.

`writeCandlesData` is responsible for saving candle data to the storage. It’s important that implementations carefully handle this, potentially skipping incomplete candles and avoiding overwriting existing, complete ones.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data—the point where a trade becomes profitable—is saved and loaded for particular trading setups. Think of it as a way to customize where and how this crucial information is stored.

Each setup, defined by a specific trading symbol, strategy name, and exchange, gets its own dedicated space for storing this data.

The `waitForInit` method prepares this storage space when needed.

The `readBreakevenData` method retrieves previously saved breakeven information for a given signal.

Finally, `writeBreakevenData` saves the current breakeven data for a signal, ensuring it’s available later.

You can implement this interface to create your own way of handling this persistence, instead of using the default file storage.

## Interface IPersistBase

This interface outlines the fundamental operations needed for any system that wants to store and retrieve data, like saving trading results or configuration. 

It's designed to be a simple contract, ensuring that different storage methods (databases, files, etc.) can be used interchangeably.

The `waitForInit` method sets up the storage space and makes sure everything is ready initially. `readValue` and `hasValue` let you get data and check if it exists, respectively.  `writeValue` handles putting new data or updating existing data safely. Finally, `keys` gives you a way to list all the identifiers (IDs) of the data that’s been saved, allowing for cleanup or consistency checks.

## Interface IPartialProfitCommitRow

This represents a request to take a partial profit on a trade. 

It's a record that gets added to a queue, telling the backtest system to close a portion of your position.

The `action` property confirms this is a partial profit action.

`percentToClose` specifies what percentage of the position should be closed – for example, 25% means closing one quarter of the holdings.

`currentPrice` stores the price at which that partial profit was actually executed, which is useful for tracking and analysis.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, essentially telling the system to sell a portion of your holdings. 

It includes the type of action being taken, which is specifically a "partial-loss." 

You'll also specify the percentage of the position you want to close, and the price at which that partial sale occurred. This data is used for tracking and reconciliation purposes during backtesting.

## Interface IPartialData

IPartialData helps save and load information about a trading signal's progress. Think of it as a snapshot of key data points.

It focuses on storing the profit and loss levels that have been hit.

These levels are converted into a simple list format to make them easy to store and retrieve, especially when saving data for later use or sharing. 

Essentially, it’s a compact way to remember where a signal has been in terms of its performance.


## Interface IPartial

The `IPartial` interface manages how your trading signals' profit and loss are tracked. It’s responsible for keeping tabs on important milestones like reaching 10%, 20%, or 30% profit or loss.

When a signal is making money (positive profit) or losing money (negative profit), the `profit` and `loss` methods will be called to update the tracked state and announce those milestones. These functions avoid duplicate announcements by remembering which levels have already been recognized.

The `clear` method is used to clean up the tracking information when a signal finishes, whether it hits a target, a stop-loss, or its time limit expires. This includes removing the signal’s data from memory and ensuring any related resources are released.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the results after processing command-line arguments. It combines the original input parameters with flags that dictate the trading environment. Specifically, it tells you whether the system is set up for backtesting (simulating trades on historical data), paper trading (simulated trading using live market data), or live trading (actual trading with real funds). This object provides a clear indication of the intended trading mode.

## Interface IParseArgsParams

This interface outlines the information needed to run a trading strategy. Think of it as a blueprint for what the system expects when you're telling it which asset to trade, which strategy to use, and where to get the data. It defines the essential details: the trading symbol like BTCUSDT, the name of the strategy you want to run, the exchange you're connected to (like Binance or Bybit), and the timeframe for the data, such as 15-minute candles. Essentially, it's the set of arguments needed to kick off a backtest.


## Interface IOrderBookData

The `IOrderBookData` interface represents the data you get from an order book, which is essentially a snapshot of the current buy and sell orders for a trading pair. It includes the `symbol` which identifies the trading pair, like "BTCUSDT."

You’ll also find the `bids`, which are all the outstanding buy orders, and `asks`, which are the outstanding sell orders.  Each of these is an array of objects representing individual bid or ask orders.

## Interface INotificationUtils

This interface defines how different systems can receive updates and notifications from the backtest-kit trading framework. Think of it as a standard way to communicate important events, like when a trade is opened or closed, partial profits are available, or when there's a problem.

The `handleSignal` method is a central point for receiving signals related to trading actions, covering everything from opening and closing positions to scheduling and cancellations. More specific events like partial profits, breakeven points, and strategy commitments are also handled through dedicated methods.

Beyond trade-related events, this interface also deals with order synchronization, order status checks, and reactions to order rejections or fills. It provides events for monitoring the progress of orders, including continuing and stopping checks. 

The system also provides ways to be notified of risk events, pauses in strategy execution, and various types of errors (general, critical, and validation). Finally, you can retrieve and clear all of the stored notifications if needed.

## Interface INotificationTarget

This interface helps you fine-tune what information your trading framework shares with you. Think of it as a way to selectively listen to specific events happening during a backtest or live trade. By setting properties like `signal`, `partial_profit`, or `order_fill` to `true`, you'll receive notifications only for those categories. If you don't specify anything, you’ll get *everything*, which can be overwhelming.

Here's a breakdown of the different notification types you can subscribe to:

*   **Signal events:**  Information about the lifecycle of your trading signals (opening, closing, cancellation).
*   **Profit/Loss levels:** Notifications when your trade hits pre-defined partial profit or loss targets.
*   **Strategy Actions:**  Confirmation that your strategy has executed specific actions, like committing to a trade.
*   **Order Synchronization:** Updates about order status in live trading environments, covering order fills, rejections, and checks.  This is vital for ensuring your orders are actually executed as expected.
*   **Risk Management:** Alerts if your strategy is blocked by risk rules.
*   **Informational messages:**  Manual or strategy-triggered notes attached to signals.
*   **Pause state:** Notifications when the strategy is paused or resumed.
*   **Errors:** Information about both recoverable errors and critical, potentially fatal, issues.
*   **Validation Errors:** Notifications if there’s an issue with your strategy configuration or the data you’re using.



The framework uses different "subjects" to send these notifications, so you’ll be able to react to events as they occur. It allows you to focus on the specific data points most important to your trading decisions, rather than being flooded with unnecessary information.

## Interface IMethodContext

The `IMethodContext` interface helps your backtesting framework keep track of which specific configurations it's currently working with. Think of it as a little package of information that travels around, telling the system which strategy, exchange, and data frame to use. It's essential for directing operations to the right places within the backtesting process. The `exchangeName` tells the system which exchange data to use, the `strategyName` specifies the strategy being tested, and the `frameName` indicates the data frame – which is empty when running in live mode.


## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems – whether they're temporary, saved to disk, or just for testing – should behave.

It provides methods to interact with the memory, like `waitForInit` which sets up the memory when needed.

You can use `writeMemory` to add new data, specifying an ID, the data itself, a description, and the date and time it was recorded.

Searching is handled by `searchMemory`, which uses a powerful text-based method to find entries matching a query, while also considering the time they were created.  `listMemory` retrieves all existing entries up to a specific time.

Individual entries can be removed with `removeMemory` and retrieved with `readMemory`, ensuring data is only accessed up to the specified time.  Finally, `dispose` allows you to clean up any resources used by the memory storage.

## Interface IMarkdownTarget

The `IMarkdownTarget` interface lets you control which detailed reports are generated during your trading backtests. Think of it as a way to pick and choose what information you want to see.

You can toggle on or off reports covering things like:

*   How the strategy itself is behaving (entry and exit signals).
*   When risk limits are blocking trades.
*   Events related to breakeven points.
*   Partial profit and loss events.
*   A visual heatmap of your portfolio's performance.
*   Strategy comparison and optimization results.
*   Performance metrics and bottlenecks.
*   Signals that are waiting to be triggered.
*   Live trading events.
*   The complete history of trades during the backtest.
*   The lifecycle of signals, from creation to closure.
*   Milestones for highest profits achieved.
*   Maximum drawdown events.

By enabling or disabling these options, you can focus on the specific areas you want to analyze.

## Interface IMarkdownDumpOptions

This interface helps you organize and filter your backtest data when exporting it to Markdown. Think of it as a set of instructions for creating readable reports.

It includes details like the directory where the report should be saved, the name of the file, and crucial information about the trade itself – such as the trading pair (like BTCUSDT), the strategy used, the exchange involved, the timeframe, and a unique ID for the signal that triggered the trade.  This allows you to easily target and generate reports for specific trades or strategies.

## Interface IMCPTextMessage

This interface defines a simple text message used within the Model Context Protocol (MCP). It's designed to carry straightforward, human-readable text content. 

Each message has a `type` property, which is always set to "text" to identify it as a text message. Alongside that, it includes a `text` property containing the actual textual message itself. Think of it as a way to pass plain text information between components in the backtest-kit framework.

## Interface IMCPSchema

The IMCPSchema acts like a bridge, connecting a specific name (MCP name) to a trading strategy. It essentially tells the system which strategy this connection refers to, preventing confusion and ensuring commands are directed to the correct places.

You can think of it as defining how a particular agent interacts with a strategy. If multiple strategies are involved, you *must* specify which strategy the MCP is targeting. Otherwise, the system won’t know which strategy to operate on.

There's a default cost for opening positions, but you can customize it if needed. You can also control what actions the agent is allowed to perform – whether it can read data, place orders, or both.

The schema also allows for custom message generation, letting you tailor the information delivered to the agent based on portfolio snapshots. Finally, you can attach optional lifecycle callbacks to respond to various events. These callbacks are completely optional and won't affect the core functionality if you don't define them.

## Interface IMCPPositionOpenCommand

This command is used to initiate a new trading position within the backtest-kit framework. It essentially tells the system to open a position – either buying (long) or selling (short) – for a specific trading pair.

The command specifies which symbol to trade, like BTCUSDT. 

It also identifies the direction of the trade and which strategy is associated with the trade.

Finally, you can add a note to the command, which serves as a human-readable explanation for why the position was opened. This note helps with tracking and understanding the trading decisions later on. The system automatically sets a 50% take profit and hard stop-loss levels for this position.


## Interface IMCPPositionCloseCommand

This interface defines the information needed to close an existing trading position. 

It's used when a strategy wants to formally close out a position that's already active.

The `symbol` property specifies which trading pair (like BTCUSDT) the position belongs to.
`mcpName` identifies the specific strategy or schema that's initiating the closing command.
Finally, `note` allows for adding a brief explanation about *why* the position is being closed, which can be helpful for auditing or understanding the trading process.


## Interface IMCPImageMessage

The IMCPImageMessage is a special message used within the backtest-kit system to transmit image data, often things like charts or visualizations. It's designed to be type-safe, clearly indicating that the message contains an image. 

The message itself has three key parts: it’s identified as an "image" type, it specifies the image's format using the "mimeType" (like "image/png"), and it holds the actual image data, which is encoded in a standard base64 format. This allows the system to handle and display images reliably.

## Interface IMCPContext

The `IMCPContext` is essentially a picture of your portfolio at a specific point in time. It’s like a record of what you own and how much it’s worth. This record is organized by the ticker symbol of each asset you're trading. Think of it as a quick reference for the strategy to understand its current holdings during a live trading session. Each strategy gets its own, individual snapshot of this portfolio information.

## Interface IMCPCallbacks

The `IMCPCallbacks` interface lets you observe what your backtest strategy is actually doing without interfering with its execution. Think of it as a way to peek behind the curtain and see the raw data generated by actions like getting status updates, opening positions, and closing positions.

You don’t have to use all of these callbacks—you only specify the ones you’re interested in. If you don't provide a callback for a particular event, that event simply won't trigger it.

If a callback function has a problem and throws an error, the backtest will log the error but continue running.

Here's what each callback does:

*   `onStatus`: Notifies you when the system has created a status snapshot, and shows you the messages generated during this process.
*   `onPositionOpen`:  Signals when a new position is successfully opened, providing the details of the signal used, including things like take profit and stop loss levels.
*   `onPositionClose`:  Alerts you when a position is closed, telling you which signal request initiated the closing action.

## Interface ILogger

The `ILogger` interface defines a way for different parts of the backtest-kit framework to record information about what's happening. Think of it as a central place to keep a record of events.

It offers several methods for logging messages at different levels of importance.

*   `log` is for general messages about significant occurrences.
*   `debug` is for very detailed information used when you’re trying to figure out what's going on.
*   `info` records general updates, like successful actions or validations.
*   `warn` signals potential problems that don't stop the system, but should be looked into.

These logging methods are used by core components – things like agents, storage, and history – to track events, monitor progress, and help identify any issues that might arise during testing.

## Interface ILogEntry

Each log entry represents a single event recorded during a backtest run. Every entry has a unique ID and a level indicating its severity, like "log," "debug," or "warn."  A timestamp marks when the event occurred, allowing for efficient log management.

The `createdAt` field gives a user-friendly date and time, while the `timestamp` field stores the precise moment in milliseconds.  You can also include details about the code's execution environment using `methodContext` and `executionContext`.  The `topic` clarifies where the log originated, and `args` allows you to pass along any extra information related to the logged event.

## Interface ILog

The `ILog` interface provides a way to manage and review your backtesting logs. It lets you access a complete history of the log entries generated during a backtest. 

The `getList` method is the key here; it retrieves all the log entries, allowing you to examine what happened during the simulation. This is useful for debugging and understanding your strategy's behavior.

## Interface IHeatmapRow

This interface, `IHeatmapRow`, provides a comprehensive set of statistics for a single trading symbol, giving you a detailed view of how strategies are performing. It includes key metrics like total profit/loss, risk-adjusted returns (Sharpe Ratio, Sortino Ratio, Calmar Ratio), and drawdown information to assess potential risks.

You'll find performance indicators such as win rate, average profit/loss per trade, and streaks to understand trade consistency. The interface also provides insights into trade durations, median PNL, and consecutive win/loss performance.

Furthermore, it incorporates advanced measures like expectancy, buyer/seller pressure, trend analysis (including strength and confidence), and yearly return expectations. This rich data set allows for a granular evaluation of trading strategies across different symbols, painting a clear picture of their strengths and weaknesses.

## Interface IFrameSchema

The `IFrameSchema` helps you define specific periods for your backtesting. Think of it as setting up the boundaries of your historical data. 

You'll give it a unique name to identify it, and optionally add a note to explain its purpose. 

Crucially, you specify the time interval, like "1m" for one-minute intervals or "1d" for daily data, and the start and end dates for your backtest.  You can also define callbacks to run code at different points in the frame's lifecycle. This lets you tailor how the backtest handles each time period.

## Interface IFrameParams

The `IFramesParams` object is used when you're setting up a frame within the backtest-kit trading framework. It essentially holds the key details needed to identify and manage that frame.

You'll find a `logger` property, which is a handy tool for keeping track of what's happening inside the frame - think of it as a way to debug and understand its behavior.

There’s also an `interval` property, which is a name used to clearly identify the frame within the system. This helps in organizing and understanding different time periods or trading strategies being tested.

## Interface IFrameCallbacks

The `onTimeframe` callback lets you respond whenever the backtest kit creates a new set of timeframes for analysis. 

This is a great opportunity to check if the timeframe setup looks right, perhaps logging the start and end dates or ensuring the interval is what you expect. You can either provide a simple function to execute or a function that returns a Promise for more complex operations.


## Interface IFrame

The `IFrame` interface is a core component, handling the creation of timeframes used in your backtesting process. Think of it as the mechanism that decides when your trading strategies will be evaluated.

Specifically, the `getTimeframe` function allows you to generate a list of timestamps for a particular trading symbol and timeframe (like "daily" or "hourly"). These timestamps are evenly distributed based on the timeframe interval you've defined, ensuring a consistent flow of data for your backtest. It's used behind the scenes to coordinate the entire backtesting workflow.


## Interface IExecutionContext

The `IExecutionContext` interface holds information about the current situation during a trading strategy's execution. Think of it as a package of details passed along to let your strategy know what's happening.

It includes the trading pair you're dealing with, like "BTCUSDT", and the exact timestamp of the operation. 

Crucially, it also tells you if you're in a backtesting scenario – simulating past data – or running live. This distinction is vital for how your strategy behaves. This context is provided by the `ExecutionContextService` and is used by functions like `getCandles`, `tick`, and `backtest`.


## Interface IExchangeSchema

This interface describes how a trading platform connects to an exchange, like Binance or Coinbase. It essentially outlines the information the platform needs to communicate with the exchange and understand its data.

Each exchange connection needs a unique identifier.  You can add a developer's note for your own reference if needed.

The core of the connection lies in `getCandles`, which is responsible for fetching historical price data (candles) for a specific trading pair and time range.  You'll also define how trade quantities and prices should be formatted to match the exchange's rules – if you don't specify this, a default Bitcoin precision will be used.

Optionally, you can also provide functions to retrieve order book data and aggregated trades, providing more detailed market information.  If those functions aren’t provided, the system will signal an error if those features are requested.

Finally, you can specify callback functions to handle certain events happening during the backtesting process, like when new candle data arrives.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as a blueprint for how the backtest-kit will communicate with a specific exchange.

It requires you to provide functions for retrieving data – like historical candle data, order books, and trade history – and for correctly formatting quantities and prices to match the exchange's specific rules. The framework will handle the default behavior when connecting to an exchange if you don't explicitly set them. 

Crucially, it also includes logging and execution context services to help you debug and track the backtesting process. Everything needed to operate like a real exchange needs to be defined here.


## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you listen for events coming from the exchange, like when new candle data (OHLCV information) becomes available. 

Specifically, the `onCandleData` function is triggered whenever the backtest kit pulls candle data. You'll receive details about the symbol, the time interval used for the candles (e.g., 1 minute, 1 hour), the starting date and time for the data, the number of candles requested, and an array containing the actual candle data.  This lets you react to new data as it’s received.

## Interface IExchange

The `IExchange` interface defines how to interact with a cryptocurrency exchange within the backtest-kit framework. It allows you to retrieve historical and future price data (candles) for specific trading pairs and timeframes. 

You can fetch candles going back in time (`getCandles`) or even look ahead into the future (`getNextCandles`), which is useful for backtesting strategies. The framework helps prevent common pitfalls like "look-ahead bias" where you might unintentionally use information from the future.

The interface also provides methods to format trade quantities and prices to match the exchange’s specific precision requirements. It can calculate the VWAP (Volume Weighted Average Price) to help analyze price trends and retrieve current order book data and aggregated trades. Finally, `getRawCandles` allows fetching historical candles with very specific start and end dates or just a simple limit.

## Interface IEntity

This interface serves as the foundation for any data that's saved and retrieved from storage within the backtest-kit framework. Think of it as a common starting point; if a class represents something that needs to be stored, it likely implements this interface. It's a way to ensure consistency and predictable behavior across different types of data.

## Interface IDumpInstance

The IDumpInstance interface defines how different parts of a system can record data for later analysis. Think of it as a standardized way to save snapshots of what’s happening during a process.

You can use it to save message histories, simple key-value pairs, tables of data, or just plain text reports. There are also specific methods to capture error messages and to store complex data structures as JSON.

Each instance of this interface is tied to a particular signal and data bucket, ensuring data is organized properly.  Finally, `dispose` lets you clean up any resources held by the instance when it's no longer needed.

## Interface IDumpContext

The IDumpContext object provides essential information for organizing and identifying data dumps within the backtest-kit framework. Think of it as a container holding details like which trading signal the data relates to (signalId), how it's grouped (bucketName), and a unique ID for each dump (dumpId).  It also includes a helpful description that makes it easier to understand the data – this description shows up in search results and reports. Finally, a flag indicates whether the data comes from a backtest simulation or live trading. This context is handled by the DumpAdapter and passed during the dump creation process.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that need to be processed later, after some action or trading has taken place. Think of it as a placeholder that ensures certain actions are recorded and applied correctly even when the system is busy.

It contains essential information like the `symbol` of the trading pair involved and a flag, `backtest`, to indicate if the transaction happened during a simulated test run or live trading. This helps differentiate how the information is handled in each scenario.

## Interface ICheckCandlesParams

This interface defines the information needed to check if we have the candle data we expect. It's used to quickly see if the cached data for a specific trading pair, exchange, and timeframe is available without needing to scan through all the files.

You'll specify the symbol (like "BTCUSDT"), the exchange name, the candle interval (like "1h" or "1d"), and the start and end dates to define the period you want to verify. This helps ensure your backtesting environment has all the data it needs.


## Interface ICandleData

This interface defines the structure for a single candlestick, a common representation of price data over a specific timeframe. Each candlestick holds information about when it started, the opening price, the highest and lowest prices reached during that period, the closing price, and the total trading volume. Think of it as a snapshot of market activity, essential for analyzing price trends and testing trading strategies. The `timestamp` tells you precisely when the candle represents, while the other properties give you a complete picture of price action and volume within that time.

## Interface ICacheCandlesParams

This interface defines the settings you can provide to control how your backtest manages and uses cached historical data. It lets you add custom functions that get executed at key moments during the data loading process.

Specifically, you can provide a function called `onWarmStart` which will run right before the entire warm-up phase begins. You can also hook into the start of the validation phase using `onCheckStart`, which is called right before data validation starts. 

These callbacks give you a way to track progress or perform other actions during the data preparation stages of your backtesting strategy. The callbacks receive information about the symbol, interval, and date range being processed.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary setback encountered while placing or managing an order. Think of it as a signal that something briefly went wrong – perhaps a network issue or a problem on the exchange's end. 

It's not a permanent rejection; instead, the system will automatically attempt to retry the operation a limited number of times, ensuring stability. 

The `reason` field simply indicates that it’s a transient issue. The `error` field provides details about the specific failure, if available, to aid in debugging. 

Adapters and listeners shouldn't create this object directly; they should use it to signal temporary issues through return values or exceptions.

## Interface IBrokerOrderVerdictRejected

When an order attempt fails due to a business rule or problem, this verdict signals that the order is permanently rejected. It’s a way for the system to communicate that retrying the order won’t fix the issue – for example, there's no available counterparty to trade with. This verdict isn't created by listeners; instead, listeners signal rejection by throwing a specific error. A rejected order will be dropped entirely or force-closed, depending on the order type. The `error` property holds the specific error that caused the rejection, providing details about why the order couldn't be processed.

## Interface IBrokerOrderVerdictDeleted

This interface represents a situation where an order, previously requested or checked, has been deleted. 

It's a signal from the system indicating that the order is no longer available, often because it was canceled elsewhere, like directly on an exchange. 

You, as an adapter or listener, don't create this; instead, you signal a deletion by throwing a specific error to let the framework handle it. 

The `reason` property confirms that the deletion occurred, and the `error` property contains the details of the error that triggered the deletion. 

Essentially, it's a way for the framework to know an order has vanished and act accordingly, skipping certain checks or tolerance periods.

## Interface IBrokerOrderVerdictConfirmed

This interface represents a confirmation received from the broker regarding an order, specifically after a gate or check. Think of it as the broker saying, "Yes, this order is good to proceed with" or "This order is still valid." 

It's important to understand that your code doesn't *create* this verdict; instead, it signals its state to the backtest-kit. A normal return or a return value of `true` means confirmation. Throwing an error indicates a temporary issue, while specific error types signal that the order is rejected or deleted. 

The `reason` property will simply be "confirmed" when the verdict is positive.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` interface serves as the foundation for how the trading framework handles decisions about orders, whether it's during synchronization or a preliminary check. It's designed to be a common base, allowing different types of verdicts to be distinguished based on their underlying reason. The `__type__` property acts as a unique identifier, making it possible to tell apart the various possible order verdict types. Think of it as a tag that says "this is a broker order verdict" and helps the system understand exactly what kind of verdict it's dealing with.

## Interface IBroker

The `IBroker` interface is how your trading framework connects to a live exchange. It's like a bridge allowing the framework to actually place orders and manage positions in the real world. Critically, all the methods within this interface are called *before* the framework changes its internal state, meaning if something goes wrong, the framework's state stays consistent.  However, in backtesting mode, these calls are skipped, so the adapter won't be used.

`waitForInit` is a one-time setup to connect to the exchange and reconcile any existing orders or positions.  It's crucial to clean up any "orphaned" orders (orders the framework doesn't know about) during this initialization to prevent trading on top of them.

When closing a position (`onOrderCloseCommit`), you're responsible for placing the actual closing order and recording the profit/loss. Errors here can cause the close to be retried or, if fatal, trigger a forced close. Similarly, `onOrderOpenCommit` handles opening new positions – you place the order and track it.  Errors can lead to retries or rejection of the order.

The `onOrderActiveCheck` function is called repeatedly to verify that an open position still exists.  If the exchange says the order is gone, the position is closed immediately.  `onOrderScheduleCheck` does the same for pending, scheduled orders.

`onSignalActivePing` and `onSignalSchedulePing` are informational hooks allowing you to react to events from the exchange and adjust the position based on those events. `onSignalIdlePing` is used for housekeeping when the strategy is idle.

Finally, several hooks (`onSignalPendingOpen`, `onSignalPendingClose`, `onBreakevenCommit`, etc.) handle specific lifecycle events related to order placement, closing, and stop-loss adjustments.  They’re for reacting to and reconciling the framework’s view with the real exchange.

## Interface IBreakevenData

The `IBreakevenData` interface is designed to hold simple information about whether a breakeven point has been achieved for a specific trading signal. It's primarily used for saving and loading data, making it easy to persist the state of your backtesting results. Think of it as a snapshot – just a boolean value indicating if the breakeven target has been hit. This data is stored alongside other signal data, allowing you to track breakeven status for multiple signals. When the data is loaded back in, it's converted into a more detailed state representation.

## Interface IBreakevenCommitRow

This describes a row of data related to a breakeven commitment within the backtest-kit framework. It represents a specific action taken – in this case, a breakeven event. Each row contains information about the current price at the time the breakeven was calculated. Think of it as a record of a breakeven point being established during a trade simulation.

## Interface IBreakeven

The IBreakeven interface helps manage a strategy's stop-loss, automatically moving it to the entry price once certain conditions are met. 

Think of it as a safety net – it ensures your trade is protected and potential profits aren't lost to transaction costs.

The `check` method is the core function, responsible for evaluating whether a signal has reached breakeven. It looks to see if the price has moved favorably enough to cover those costs and if the stop-loss can be adjusted accordingly. If so, it records that breakeven has been reached and sends out a notification.

The `clear` method handles what happens when a trade finishes – whether it hits a take-profit, stop-loss, or expires. It resets the breakeven state and cleans up related internal components, readying the system for the next trade.

## Interface IBidData

The `IBidData` interface represents a single bid or ask found within an order book. It contains two key pieces of information: the `price` at which the bid or ask exists, and the `quantity` of the asset available at that price. Both the price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a DCA (Dollar-Cost Averaging) trading strategy. 

Each entry in a DCA plan is recorded as an `IAverageBuyCommitRow`.

It details the price you paid, the total cost of that specific purchase, and the running total of entries made so far. 

The `action` property confirms this is an average-buy action and is used to identify the type of commit.


## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade. 
Each trade record includes a unique identifier, the price at which it happened, the quantity involved, and the precise time of the trade as a timestamp. 
It also indicates whether the buyer was the market maker – this helps in understanding the direction of the trade in relation to market liquidity. 
Think of it as a detailed log entry for every trade, allowing for in-depth analysis during backtesting.

## Interface IActivityEntry

Each trading activity, whether a backtest or a live trade, is represented by an entry. 
This entry keeps track of what's happening, including the trading pair (like "BTCUSDT") and the details of the strategy being used, such as its name and the exchange it's running on. 
It also indicates whether the activity is a historical simulation (backtest) or a real-time trade. 
These entries are automatically managed by the system as activities start and finish, helping to ensure efficient and orderly operations.

## Interface IActivateScheduledCommitRow

This interface represents a queued request to activate a scheduled commit. Think of it as a message telling the system to trigger a previously planned action.

It includes the type of action, which is always "activate-scheduled".

You'll also find the ID of the signal that's being activated, and optionally an activation ID if the activation was initiated by a user. The signal ID is crucial for identifying which specific event is being put into motion.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a peek at the current trading signals. Think of it as a way to check if something's waiting to happen – like a signal ready to be triggered or a scheduled action about to occur.

It allows you to decide whether certain actions should proceed, preventing unnecessary operations. For example, you can use it to ensure a breakeven or partial profit adjustment only happens when there’s an actual signal to work with.

It provides two key methods: `hasPendingSignal` to see if there's an open position waiting for action, and `hasScheduledSignal` to confirm if a signal is scheduled for later. Both methods require information like whether it's a backtest, the trading symbol, and details about the strategy and its environment.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom behavior. Think of it as a way to hook into the strategy's execution and do things like log events, send notifications, or update external systems.

You define actions using this schema, giving each one a unique name and optionally adding a note for documentation.

The core of the action is the handler, which is essentially a function that gets called during strategy execution. Each time the strategy runs, a new instance of this handler is created.

Finally, you can add lifecycle callbacks to control when and how your action behaves during the strategy's run. This gives you fine-grained control over integration with things like state management libraries.

## Interface IActionParams

This interface, `IActionParams`, bundles all the information an action needs to run effectively. Think of it as a package containing everything from logging tools to context about the trading strategy and timeframe it’s part of. 

You'll find a logger here for tracking what's happening during the action's execution – super useful for debugging.

It also includes the strategy and exchange names to clarify the action's role and the timeframe it operates within. Knowing whether the action is running in backtest mode is also important.

Finally, the `strategy` property provides access to crucial data about the current trading signals and existing positions.

## Interface IActionCallbacks

This interface defines a set of callbacks that let you hook into different stages of an action handler's lifecycle within the trading framework. Think of these as event listeners you can use to customize behavior or monitor what’s happening.

`onInit` is called when the handler is set up – a good place to open database connections or load data. `onDispose` is the opposite, for cleanup tasks like closing connections or saving state.

`onSignal` is triggered whenever a signal is received, and it has more specific versions: `onSignalLive` for live trading and `onSignalBacktest` for backtesting. There are also callbacks for breakeven, partial profit/loss levels, and scheduled signals, each notifying you when these conditions are met.

`onPingActive` and `onPingIdle` provide opportunities to monitor active positions and periods of inactivity.  `onRiskRejection` gets called when a signal is blocked by risk management. `onOrderSync` is a critical gate for order management, requiring you to explicitly approve or reject order attempts, while `onOrderCheck` lets you verify the status of orders. `onPendingEvent` allows you to influence exchange actions during pending signal lifecycle events.

These callbacks let you manually connect actions to a real exchange instead of using a broker adapter, giving you fine-grained control over order placement and cancellation – you can directly call functions to place orders or cancel scheduled signals.  Many callbacks are event-driven and offer chances to build custom logic around trading signals.


## Interface IAction

This interface, `IAction`, is designed to help you connect your custom logic – like a dashboard, logging system, or data analytics – to the backtesting and live trading framework. It provides a set of methods, each corresponding to a specific event that occurs during the strategy's lifecycle.

Think of these methods as hooks that get triggered at different points. For example, `signal` is called every time a new signal is generated, whether you're backtesting or live trading. `breakevenAvailable` fires when your stop-loss is moved to the entry price, and `orderSync` lets you react to order placement attempts.

The `dispose` method is important for cleanup – it allows you to unsubscribe from any observables and release resources when your custom logic is no longer needed. Overall, `IAction` acts as a central hub for responding to events and integrating your external systems into the trading process. Certain events like `orderSync` and `orderCheck` use exception-based handling, meaning you can throw errors to control order behavior. Manual wiring is required for some events using specific callbacks to drive exchange interactions.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable trading events that have occurred during a backtest. 

Specifically, it tracks a complete list of these profitable events, sorted from most recent to oldest, allowing you to examine the sequence of gains.

Alongside the event list, it also keeps a count of the total number of profitable events that were recorded during the backtest.

## Interface HighestProfitEvent

This object represents the single most profitable moment seen for a specific trade. It captures details like when the record profit happened (timestamp), which trading pair was involved (symbol), and which strategy generated the trade (strategyName). You'll also find the unique identifier for the signal that triggered the trade (signalId) and whether it was a long or short position.

Key financial information is included, such as the total profit and loss (PNL) of the trade, the highest profit reached during the trade's lifetime (peakProfit), and the largest drop in value experienced (maxDrawdown). The record price that triggered the achievement of the highest profit, along with the price at which the trade was initiated (priceOpen) and any set take profit or stop loss prices (priceTakeProfit and priceStopLoss) are also stored. Finally, a flag indicates if the event occurred during a backtest simulation.

## Interface HighestProfitContract

The `HighestProfitContract` describes what happens when a trading strategy reaches a new peak profit level. It provides a snapshot of the situation at that moment.

You'll find details like the trading pair involved (e.g., "BTC/USDT"), the current price, and the exact time of the update.

It also includes information to identify the specific strategy, exchange, and timeframe being used. 

Crucially, the `signal` property gives you the data that triggered the trade, and `backtest` tells you whether this event occurred during a simulation or live trading, allowing you to react differently in each case. This lets you build custom actions, such as setting trailing stops or taking partial profits, based on achieving specific profit targets.

## Interface HeatmapStatisticsModel

This model summarizes the overall performance statistics for your entire portfolio, breaking down aggregated data across all the assets you're trading. It provides a comprehensive view of how your portfolio is performing.

You'll find key metrics like the total profit and loss (PNL), Sharpe Ratio, and total number of trades executed across all symbols.

It also presents more nuanced indicators, such as the weighted average peak profit and fall PNL, which gives insight into typical performance patterns. 

The model includes data on trade durations, win/loss streaks, and various risk-adjusted performance ratios, such as Sortino and Calmar ratios.

Finally, it provides annualized return estimations and trade frequency projections to give you a clearer picture of your portfolio's potential yearly performance. This data helps assess the portfolio's efficiency and understand overall trends.

## Interface DoneContract

The `DoneContract` is a notification you receive when a background task finishes, whether it's a backtest or a live trading run. It provides key information about what just completed.

You'll see details like the exchange used, the name of the trading strategy, and the frame it ran in.  If it was a backtest, you'll know that too. Finally, it tells you the trading symbol involved, like "BTCUSDT." This lets you track and understand the context of the finished background execution.


## Interface CronHandle

The `CronHandle` is like a ticket you get when you schedule a task to run regularly using the `Cron` system. If you want to stop that scheduled task, you simply discard this handle. It's a convenient way to cancel a recurring action without needing to remember the specific name you used when you set it up. Think of it as a "forget me" button for your automated tasks.

## Interface CronEntry

This describes how to set up recurring tasks within your backtesting system. Each task, called a "Cron Entry," has a unique name to prevent duplicates and coordinate its execution. 

The `interval` property defines how often the task runs, such as every minute or day. If you skip specifying an interval, the task will only run once, immediately.

You can also control how the task interacts with different symbols. By default, the task will execute once for every boundary across all backtests or once per symbol if you provide a whitelist.

Finally, a `handler` function is provided, which will be executed when the configured conditions are met. It's the core of what your task does. Be aware that if this function throws an error, the task will retry.

## Interface CriticalErrorNotification

This notification signals a critical error that demands the process be stopped immediately. It's a way for the system to tell you something has gone seriously wrong and can’t be recovered from. 

Each notification has a unique ID to help track issues. 

You’ll also receive a detailed error object with a stack trace and extra information, along with a clear, human-readable message explaining what happened. It’s important to note that these notifications always come from the live environment, never from backtesting.

## Interface ColumnModel

This defines how your data is presented in tables. Think of it as a blueprint for each column you want to display.

Each column has a unique identifier (`key`) and a user-friendly label (`label`) that appears in the table header. 

The `format` property is where you specify how to transform the raw data into a readable string for the table – this is really powerful for customizing how numbers, dates, or other complex data types are shown.

Finally, `isVisible` lets you dynamically control whether a column is shown or hidden, based on certain conditions. This allows for flexible table views.


## Interface ClosePendingCommitNotification

This notification appears when a signal is closed before it's fully activated, effectively stopping the trading process early. It provides a wealth of information about the closed signal, including a unique identifier, the exact time of the closure, and whether it occurred during a backtest or live trading environment. You'll find details about the strategy and exchange involved, along with the signal's unique ID and an optional reason for the closure.

The notification also contains a comprehensive breakdown of the position's performance. This includes the total profit and loss (both absolute and as a percentage), peak profit achieved, maximum drawdown experienced, and various price points used in those calculations. Detailed information on the entries (number of DCA entries and partial closes) and original signal parameters (like the initial entry price) is available. Lastly, creation timestamp of the notification itself is included for tracking purposes.

## Interface ClosePendingCommit

This event signals that a previously opened position has now been closed. It provides details about the closure, including a unique identifier you can use to track the reason for the closure. You’ll also find key performance metrics related to the position’s history, such as its total profit and loss, the highest profit it ever reached, and the largest drawdown it experienced. This allows you to understand the overall performance of the closed trade.


## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was actually executed. It provides a comprehensive snapshot of the signal's details, including its unique identifier, when the cancellation happened, and whether it occurred during backtesting or live trading. You'll find information about the trading pair involved (like BTCUSDT), the strategy that generated the signal, and the exchange it was intended for.

The notification also includes detailed performance metrics, like total entries and partials executed, the original entry price, and profit/loss calculations. You can see peak profit and drawdown values, including prices and costs, allowing you to analyze the potential impact of the cancellation.  There's also an optional "note" field which might contain a brief explanation of why the signal was cancelled. Finally, you'll see the creation timestamp for tracking purposes.

## Interface CancelScheduledCommit

This interface represents a signal event used to cancel a previously scheduled action. It's essentially a way to tell the system to stop something that was planned to happen later.

The `action` property always indicates this is a cancellation request.

You can optionally include a `cancelId` to provide a more specific reason for the cancellation, which is helpful for tracking.

Along with the cancellation request, the event also includes information about the position being closed, such as the total profit/loss (`pnl`), the highest profit reached (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). This provides context about the performance of the closed position at the time of cancellation.


## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a backtest. It essentially gives you a snapshot of how frequently and where breakeven points were reached.

You’ll find a complete list of those events, each with its own specifics, within the `eventList` property. 

The `totalEvents` property simply tells you how many breakeven events were recorded. This can be helpful for assessing the overall stability and risk profile of your trading strategy.


## Interface BreakevenEvent

This data structure represents a breakeven event, essentially a record of when a trading signal reached its breakeven point. It bundles together a lot of crucial details about that event, including when it happened (timestamp), which asset was involved (symbol), the name of the trading strategy used, and the unique identifier of the signal. 

You'll find information about the trade's position (long or short), the current price at breakeven, and the originally set take profit and stop loss prices, along with their original values when the signal was first created. 

If the strategy used dollar-cost averaging (DCA), the record will also include details about the number of entries and partial closes, along with the original entry price before the averaging took place. It also captures information like the unrealized profit and loss (PNL) at the breakeven point, any notes explaining the signal's rationale, the activation and scheduling timestamps, and whether the trade occurred during a backtest or live trading.

## Interface BreakevenContract

This interface represents a breakeven event within the trading system. It's fired when a trading signal's stop-loss is moved back to the original entry price, signifying a risk reduction milestone.

Think of it as a notification that a trade is performing well enough to cover transaction costs and potentially reduce risk.

The event includes details such as the trading pair's symbol, the name of the strategy involved, the exchange and frame where the trade is executed, and the full signal data. It also includes the current price at the time of the event and indicates whether it came from a backtest or live trading.

Specifically, `symbol` identifies the market, `strategyName` points to the strategy that generated the signal, `exchangeName` specifies the exchange, and `frameName` relates to the timeframe used. `data` provides comprehensive information about the signal's original parameters, `currentPrice` is the price that triggered the breakeven, `backtest` indicates the execution mode, and `timestamp` marks when the event occurred.

This information is useful for generating reports, monitoring trading safety, and allowing users to receive updates on breakeven milestones.

## Interface BreakevenCommitNotification

This notification gets fired when a breakeven action happens within your trading strategy, whether it's during a backtest or live trading. It's packed with details about that specific trade, letting you understand exactly what triggered the breakeven and how the position performed. You'll find information like the unique identifier of the notification, the exact timestamp of the event, and whether it occurred during backtesting or live trading.

The notification includes the trading symbol, the name of the strategy involved, and the exchange where the trade took place. Crucially, you’ll find details about the position itself - the entry price, take profit, and stop loss levels, as well as how they initially were set.

It goes deep into performance metrics too, with data on total profit and loss (both in USD and percentage), peak profit, maximum drawdown, and the number of entries used. A free text field allows for a personalized description to explain the signal’s reasoning. Finally, it includes timestamps to track signal creation, pending and created times for comprehensive context.

## Interface BreakevenCommit

This object represents a breakeven event within a trading strategy backtest. It provides detailed information about the position at the time the breakeven adjustment occurred.

Key details included are the current market price, the overall profit and loss (pnl) realized so far, and the peak profit achieved during the position's lifetime. You’ll also find the maximum drawdown experienced and whether the original trade was a long (buy) or short (sell) position.

The object captures the original and adjusted take profit and stop-loss prices, along with the entry price. Timestamps indicate when the signal was created and when the position was activated. This comprehensive data allows for a thorough review of the breakeven logic and its impact on the trade.


## Interface BreakevenAvailableNotification

This notification signals that your trading position's stop-loss can now be moved to your entry price, essentially breaking even. It's a good sign – the market has moved in your favor enough to eliminate potential losses. 

The notification includes a unique ID and timestamp, letting you track it easily.  You'll find details like the trading pair (e.g., BTCUSDT), the strategy and exchange involved, and the signal's unique ID. Crucially, it provides the current price, your entry price, and your take profit and stop-loss levels – both current and original (before any trailing adjustments).

It also gives you a comprehensive view of the position's performance: total entries, partial closes, total profit and loss (PNL), peak profit, maximum drawdown, and percentages. You can see the prices and costs associated with all of these metrics. 

Finally, there’s a field for an optional note explaining the reasoning behind the signal, along with timestamps indicating when the signal was scheduled, pending, created and the time of this notification.

## Interface BeforeStartContract

This event signals the very beginning of a strategy's run, whether it’s a backtest or live trading session. Think of it as a "ready to go" signal before the trading begins. It's a crucial moment to set things up – like opening log files, resetting counters used during the run, or sending a notification that the run has started.

Importantly, this event will always be followed by an `AfterEndContract` event, guaranteeing a clean end to the process, even if something goes wrong during the run. If an error occurs within the listener for this event, it won’t interrupt the overall run, but will be handled globally.

During backtesting, the `when` property represents the intended start time of the historical data being replayed. In live trading, it reflects the current time. You'll also get information like the trading symbol, the strategy's name, the exchange involved, the frame (timeframe) being used, and the current price of the asset. A `backtest` flag indicates whether it's a backtest or live run, and `timestamp` offers the same time information as `when` in milliseconds.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of backtest results, offering key performance indicators for strategy evaluation. It includes a list of all individual trades with their specifics, along with overall statistics like the total number of trades, win/loss counts, and win rate.

You'll find metrics to assess profitability, such as average and total profit, and volatility measures like standard deviation and Sharpe Ratio.  Advanced ratios like Sortino and Calmar provide insights into risk-adjusted returns and drawdown management. 

It also covers trade duration, distribution of profits and losses, and market pressure dynamics. Finally, it attempts to categorize the overall trend of the backtest period and provides a confidence level for that trend assessment.  Many values will be null if the calculation is unreliable due to unusual market conditions or other factors.

## Interface AverageBuyCommitNotification

This notification signals that a new averaging (DCA) buy order has been executed within an existing position. It provides detailed information about the trade, including when it happened, the trading symbol, and which strategy triggered it. You’ll find specifics like the price at which the new entry was made, the total cost of this step in your DCA strategy, and how it impacts your overall average entry price and total number of DCA entries.

The notification also tracks important performance metrics, like peak profit, maximum drawdown, and the percentage of profit or loss. Detailed data about the original entry price, stop-loss, and take-profit levels are included alongside adjusted values reflecting any trailing adjustments. It's designed to give you a complete picture of the position’s health and performance, including the original investment and ongoing profitability. Finally, it keeps track of timestamps relevant to the signal's creation and execution.

## Interface AverageBuyCommit

This event, named AverageBuyCommit, signals that a new averaging buy order has been executed within a trading position. It’s triggered whenever a strategy adds to an existing position using a dollar-cost averaging (DCA) approach. The event provides detailed information about this averaging buy, including the price at which it was executed (currentPrice) and the total cost of that buy in USD.

The event also reports the effective entry price after the averaging entry is added – this is a calculated average of all buys so far. You'll find performance metrics too, showing the current unrealized profit and loss (pnl), the highest profit reached (peakProfit), and the largest drawdown experienced by the position.

The event clearly indicates the trade direction (long or short) and provides access to the original entry price, as well as the original and adjusted take-profit and stop-loss prices. Timestamps showing when the signal was created and when the position was activated are also included. This information allows for comprehensive monitoring and analysis of the DCA process and the resulting position performance.

## Interface AfterEndContract

This contract, `AfterEndContract`, signals the completion of a strategy run. Think of it as a notification that a strategy has finished executing – whether that’s because it reached the end of the data, was manually stopped, encountered an error, or was canceled. It's designed for cleanup tasks that need to happen reliably once per run.

You can expect this event to always be paired with a corresponding `BeforeStartContract` event, ensuring everything is synchronized. Any errors that occur while handling this event won’t disrupt the main process.

The `when` property, indicating the event time, behaves differently depending on whether you're in backtest or live mode. In backtest mode, it represents the historical time of the last candle processed. If no candles were processed, it uses the frame’s planned start date.  In live mode, it's the current time, rounded down to the nearest minute.

The `timestamp` property provides the same time information as `when`, but as a numerical millisecond value, which is convenient for logging or transferring the data.

The contract also provides information about the run itself, including the trading symbol, strategy name, exchange, frame (if applicable), whether it was a backtest run, and the average price at the time of completion. This information makes it easier to track and analyze different runs.


## Interface ActivePingContract

This describes a recurring event, like a heartbeat, that happens while a trading signal is actively being monitored. It's sent every minute for each pending signal that's still open. 

Think of it as a way to keep tabs on the signal’s status and allows you to react to its lifecycle. 

The event provides a lot of details: the trading pair (like BTCUSDT), the name of the strategy using the signal, the exchange it’s on, the timeframe being used, and all the original data associated with that signal. It also includes the current market price at the time of the ping, and whether this ping originates from a backtest (historical data) or live trading. This information helps you build custom logic to manage your signals dynamically. You can listen for these events and react to them.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, essentially telling you a trade is about to happen. It’s like a heads-up that your strategy is taking action, even before the price fully confirms the entry.

The notification provides a ton of details about the upcoming trade. You'll find a unique ID for the notification itself, and a timestamp marking when the activation was committed. It indicates whether it's happening in a backtest or live environment, identifies the symbol being traded, and names the specific strategy and exchange involved.

You’ll get a signal ID and an optional activation ID (useful if you manually triggered the activation). It specifies the trade direction – long (buy) or short (sell) – along with crucial pricing information like the entry price, take profit, and stop loss levels, including their original and adjusted values. 

The notification also outlines details of the strategy's execution, including how many DCA entries were used, and any partial closes that have happened. It includes a full PnL breakdown, plus insights into peak profit and maximum drawdown experienced to date, all expressed in both numeric and percentage terms. 

Finally, you’ll see information about when the signal was initially created and when it was pending, current price at activation, and an optional note providing context for the trade.

## Interface ActivateScheduledCommit

This event signifies the activation of a previously scheduled trading signal. It contains a wealth of information about the trade being executed, including whether it's a long or short position, the entry price, and the take profit and stop-loss levels, both as initially set and as they’ve been adjusted. You'll also find performance metrics like peak profit, maximum drawdown, and the overall profit and loss (PNL) for the trade, alongside the original prices set for take profit and stop loss. The event specifies when the signal was originally created and the precise moment the position is now being activated. An optional identifier lets you track why the activation happened, if it was triggered by a user action.
