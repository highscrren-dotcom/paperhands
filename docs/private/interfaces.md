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

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification that a specific trading strategy, running under a particular name, needs to be halted. It's designed to handle situations where you might have several strategies running at once, allowing you to precisely target which one to interrupt. The message includes the trading symbol, the strategy's name, and the walker's name, providing all the details needed to ensure the correct process is stopped.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. It bundles all the results of those strategies together, making it easier to compare them and draw conclusions. Think of it as a central place to see how each strategy did, allowing for a clear comparison. Specifically, it contains a list of results, where each result represents a single strategy that was tested.

## Interface WalkerContract

The WalkerContract represents progress updates as strategies are being compared during a backtest. Think of it as a report card delivered after each strategy finishes its test run.

It tells you which strategy just completed, along with important details like the exchange, symbol, and the name of the walker performing the tests.

The report includes performance statistics – key numbers showing how well the strategy did. It also highlights the metric being optimized, what value that strategy achieved, and the current best value seen so far across all strategies tested.

You'll also see how far along the testing process is, with the number of strategies completed and the total number planned. This helps you understand how much longer the comparison will take.

## Interface WalkerCompleteContract

The WalkerCompleteContract represents the finishing point of a backtesting process, signaling that all strategies have been run and the results are ready. It bundles together a lot of information about the backtest itself, including the name of the walker, the trading symbol being tested, and the exchange and timeframe used.

You’ll find details about the optimization metric, the total number of strategies that were tested, and importantly, which strategy performed the best. The contract also includes the performance value of that best strategy, alongside detailed statistics about its performance. Essentially, this contract provides a complete snapshot of the backtest's outcome.


## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during a backtest or live trading simulation. 

It signals that a risk validation function encountered an error, providing valuable information to diagnose the problem.

Each notification includes a unique identifier, a detailed error message for clarity, and the full error object, complete with a stack trace. You'll also find a flag to confirm that these errors originate from a backtest environment.

## Interface ValidateArgs

This interface, `ValidateArgs`, is like a checklist for ensuring the names of various components in your backtesting setup are correct. It defines properties like `ExchangeName`, `FrameName`, `StrategyName`, and more, each representing a key part of your trading system. 

Think of it as a way to make sure your system refers to things by the right name – like confirming you're using the intended exchange, timeframe, strategy, or risk profile.

Each property expects an enum (a set of named values) to be passed, and the system will check these names against its internal registry to confirm they're valid. This helps prevent errors that could arise from typos or incorrect configurations.


## Interface TrailingTakeCommitNotification

This notification signals that a trailing take profit order has been executed, providing a wealth of details about the trade. It's like a detailed report card for a completed trade, letting you know exactly what happened and how it performed. 

You’ll find key identifiers like a unique ID, a timestamp, and whether it happened during a backtest or live trading. It also tells you the symbol traded, the strategy used, and the exchange involved.

The notification includes information about the original and adjusted take profit and stop-loss prices, helping you understand how trailing stopped worked. You can see details about the position size, entry price, and the total number of entries and partial closes. 

A complete picture of profitability is given, including the total profit and loss, peak profit, maximum drawdown, and all related price points. It also gives you the details around slippage and fees with both `pnlPriceOpen` and `pnlPriceClose`.

Finally, there's an optional note field for any specific reasons behind the signal.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit order is executed. It holds all the critical information about the trade at that moment, including the direction of the trade (long or short). You'll find details about the entry price, the original and currently adjusted take profit and stop-loss prices, allowing you to understand how the trailing mechanism has affected the order.

The event also provides the current market price, the total profit and loss (pnl) of the position, the highest profit achieved (peak profit), and the largest drawdown experienced. A timestamp indicates when the event was generated and when the position was activated. This comprehensive data allows for a full understanding of the trading strategy's behavior and the impact of the trailing take profit logic.


## Interface TrailingStopCommitNotification

This notification signals that a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find details like the trading pair, the strategy that generated the signal, and the exchange used.

The notification also details the specifics of the trailing stop itself, such as the percentage shift applied, and the original and adjusted stop-loss and take-profit prices.

Furthermore, it gives comprehensive performance data for the position: entry and exit prices, profit/loss figures in both absolute and percentage terms, peak profit and maximum drawdown metrics, and details on DCA entries and partial closes. The 'note' field allows for a custom description of the signal's reasoning, while timestamps track the signal's creation and pending phases. This rich data allows for in-depth analysis and understanding of trailing stop performance.

## Interface TrailingStopCommit

This describes a trailing stop event, a specific type of action taken within a trading strategy. It represents a situation where the stop-loss price for a trade has been automatically adjusted based on the trailing stop rules. 

The `action` property confirms this is a trailing stop event. 

The event provides a lot of context about the trade. You'll find details like the `percentShift` used to calculate the new stop-loss price, the `currentPrice` at the time of the adjustment, and the overall `pnl` (profit and loss) for the trade so far.  

It also includes performance metrics for the trade's life, such as `peakProfit` and `maxDrawdown`, allowing you to understand the trade's risk and reward profile. 

You'll also see information about the trade itself: its `position` (long or short), `priceOpen` (entry price), `priceTakeProfit` (current take profit), `priceStopLoss` (adjusted stop-loss price), along with the original take profit and stop-loss prices before any trailing adjustments.  Finally, the timestamps `scheduledAt` and `pendingAt` give information about when the signal was created and the position was activated.

## Interface TickEvent

This describes a standardized way to represent events happening during a trading process. Think of it as a single data structure that holds all the important information about what's going on, whether it's a signal being scheduled, a trade being opened, or a position being closed.

Each event, regardless of its specific type (like "scheduled," "opened," or "closed"), will have a timestamp, a type describing the action taken, and other relevant details. For example, when a trade is opened, you'll find information about the entry price, take profit levels, and stop-loss orders.  Closed trades will include details like the duration of the trade and the reason for closure.

The data includes details like price points, profit and loss information, and even the progress toward take profit and stop-loss levels. Different properties are only applicable depending on the type of event, so not all fields will be populated for every single event. This consistent format makes it easier to analyze and report on trading activity.

## Interface SyncStatisticsModel

This model helps you understand how your signals are syncing. It collects data about each syncing event, giving you a complete picture of what's happening.

You'll find a detailed list of every sync event in the `eventList` property, allowing you to examine specific instances. 

The `totalEvents` property simply tells you how many sync events occurred overall. You can also easily track how many times signals were opened (using `openCount`) and closed (using `closeCount`).

## Interface SyncEvent

This data structure represents a single event related to a trading signal’s lifecycle, designed for creating clear and easy-to-understand reports. Each event contains a wealth of information, from the precise time it occurred to the financial details of the trade. You'll find details like the trading pair (symbol), the strategy and exchange used, whether it's a live trade or a backtest simulation, and a unique ID for the signal itself.

Crucially, it logs the action taken – like opening or closing a position – along with the prices involved: the entry price, take profit, and stop-loss levels, and even the original prices before any adjustments.  The framework tracks important metrics like peak profit and maximum drawdown, providing insight into the trade’s performance.

For closed signals, the reason for closure is also recorded, offering context for analysis. Timestamp information is available at multiple stages, from signal creation to pending and activation times, and details about DCA entries and partial closes are included if applicable. Finally, there's a timestamp showing when the event record itself was created.

## Interface StrategyStatisticsModel

The StrategyStatisticsModel helps you understand how your trading strategy is performing by providing detailed data about the actions it takes. It gives you a comprehensive view of events triggered by your strategy, like when it buys, sells, or adjusts positions.

You'll find a complete list of all strategy events in the `eventList`, allowing you to dive deep into specific occurrences. 

The model also summarizes these events with counts for actions like canceling orders, closing positions, taking partial profits or losses, using trailing stops, and employing DCA strategies. This gives you a quick overview of your strategy's behavior and helps identify areas for potential improvement.


## Interface StrategyPauseNotification

This notification lets you know when a trading strategy has been paused or resumed. It’s triggered whenever the pause status of a strategy is actively changed.

When a strategy is paused, it stops opening new trades, but any existing trades or signals are still managed and can be closed as usual.

The notification provides essential details, including a unique identifier, the exact time of the change, whether it occurred during a backtest or live trading, the trading pair involved, the name of the strategy, and the exchange and frame being used.  Finally, the `paused` property confirms the new pause status - whether trades are currently suspended or trading has resumed.

## Interface StrategyEvent

The `StrategyEvent` provides a standardized way to track everything that happens during a trading strategy's operation, whether it's a backtest or live trading. It bundles all the relevant details about a strategy action, like when it happened, what symbol was involved, and the specifics of the trade itself.

Think of it as a complete log entry for each significant event, including things like opening a position, closing a trade, or adjusting stop-loss levels. The event includes essential data points such as the timestamp, the trading pair, the strategy's name, and the current market price at the time of the action.

For more complex scenarios like dollar-cost averaging (DCA), the event also contains information about the total entries made, the averaged entry price, and the cost of the action. It also captures details about pending or scheduled actions and their IDs. The PnL is also included in this event. Finally, there's an optional note field for adding custom messages or context to the event.


## Interface SignalScheduledNotification

This describes a notification you receive when a trading signal is planned for future execution. It's like a heads-up about a trade that's going to happen later.

The notification tells you important details about the trade, including a unique ID, when it was scheduled, and whether it's part of a backtest or live trading. You'll also find the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange where the trade will occur.

Crucially, it outlines the trade specifics:  the direction (long or short), the intended entry price, take profit, and stop loss levels. You'll also see the original prices before any adjustments like trailing stops are applied.

The notification also provides detailed performance information related to the signal, such as total profit and loss (both in USD and as a percentage), peak profit achieved, maximum drawdown experienced, and the prices and costs associated with those metrics. It even provides insights into how many entries and partial closes were involved.

Finally, there's a timestamp of when the notification was created, and a current price at the time of scheduling, plus an optional note explaining the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trading position has been opened, whether it's during a backtest or live trading. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it was a backtest or real-money trade. 

You'll find details about the trading pair (like BTCUSDT), the strategy that triggered the trade, and the exchange used. Crucially, it outlines the trade direction (long or short), the entry price, and the prices for take profit and stop loss.

The notification also goes deep into the position's performance, tracking things like peak profit, maximum drawdown, and percentage gains/losses, including prices and costs associated with those metrics.  It reveals information about DCA averaging (number of entries) and partial closes. Finally, there's an optional field for a human-readable note explaining the reasoning behind the trade.

## Interface SignalInfoNotification

This notification type lets you receive informative messages from your trading strategies, beyond just buy and sell signals. Think of it as a way for your strategy to "comment" on its actions or the market conditions as a position is open. Each notification includes a unique ID and timestamp, plus details about the trade itself, like the symbol, strategy name, and exchange used.

You'll find information about the entry and exit prices, stop-loss and take-profit levels, and even how those levels might have changed due to trailing adjustments. Crucially, it also provides performance data such as profit and loss (both absolute and percentage), peak profit, and maximum drawdown, giving you a deeper understanding of how the position is performing.

The notification also includes details on any DCA (Dollar-Cost Averaging) or partial close actions taken, and a custom note from the strategy itself. Additionally, it includes timestamps to track when the position was scheduled, pending, and ultimately created. This is a very detailed record of the position’s lifecycle.

## Interface SignalInfoContract

This interface defines the structure of messages broadcast by strategies to provide extra information about their actions. Think of it as a way for strategies to communicate custom details about their decisions, like annotations or debug messages.

The message includes key identifying information such as the trading symbol, the name of the strategy that sent it, and the exchange and frame involved. 

It also carries the full data associated with the signal, the current market price when the signal was generated, and a user-defined note.

Finally, it includes flags to indicate if the signal relates to a backtest (historical data) or live trading, and a timestamp for accurate tracking. You can listen for these notifications to get this supplementary information from your strategies.

## Interface SignalEventContract

This defines a standardized way to track when pending trades are opened or closed within the backtest-kit framework. Instead of constantly monitoring all signal data, you can use this to simply be notified when a trade begins or ends. The notifications provide a lot of detail, including which strategy and exchange the trade is associated with, the timeframe it applies to, and comprehensive information about the signal itself.

When a trade is opened, you'll receive an event. When it closes, you'll receive another, accompanied by a reason explaining why it was closed (like hitting a take profit, stop loss, or user intervention). You’ll also get the current price at the time of the event, and a flag to indicate whether the event is from a backtest or live trading. It’s a streamlined way to stay informed about the active trading lifecycle.

## Interface SignalData$1

This data structure holds all the key details about a completed trading signal, the kind you’d see in a performance report. It tells you which strategy created the signal, a unique identifier for tracking, and the specific asset being traded. You’ll also find information about whether the trade was a long or short position, along with the percentage profit or loss achieved. 

Crucially, it records why the signal ended – perhaps it hit a target or was stopped out – and provides timestamps for when the trade began and concluded. Think of it as a complete record of a single trading event.


## Interface SignalCommitBase

This defines the basic information shared across all signal commitment events within the backtest-kit framework. Each signal commit includes details like the trading pair's symbol, the name of the strategy that generated it, and the exchange used. You’ll also find whether the signal came from a backtest or a live trading environment, a unique ID for tracking, and the exact timestamp of its creation. 

The data also captures information about position management, specifying the total number of entries and partial closes that have occurred. Critically, it preserves the original entry price, which remains unaffected by any subsequent averaging or partial exits. 

Finally, it includes the actual signal data itself and an optional note field for adding human-understandable explanations.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was due to hitting a take profit or stop loss, or timing out. It provides a wealth of information about the trade, including a unique ID, the exact time it closed, and whether it happened in a backtest or live environment. 

You'll find details about the trading pair, the strategy used, and the entry and exit prices. It also includes technical details like the original take profit and stop-loss prices, the number of entries and partial closes, and importantly, the profit and loss – both as a percentage and in USD.

Beyond just the raw numbers, the notification provides insights into the position's performance, detailing the peak profit and maximum drawdown experienced, along with the associated prices and costs. Finally, you'll find information about the signal’s timing, including when it was scheduled, when it went pending, and when it was created.

## Interface SignalCancelledNotification

This notification tells you when a trading signal that was previously scheduled has been cancelled before it could actually be executed. It provides a wealth of information about the cancelled signal, including its unique identifier, the timestamp of the cancellation, and whether it occurred during a backtest or live trading. You'll find details like the trading pair, the strategy that generated the signal, the exchange involved, and the intended trade direction (long or short).

The notification also includes the planned take profit and stop loss prices, as well as their original values before any adjustments. It also covers information regarding DCA (Dollar Cost Averaging) entries and partial closes.

Crucially, the `cancelReason` tells you *why* the signal was cancelled – perhaps due to a timeout or because the price moved too far, or because a user manually cancelled it. There's even an optional `cancelId` if a user initiated the cancellation. You can also see the duration the signal was scheduled for, along with timestamps for creation, pending, and creation of the tick result. Finally, a `note` field lets you add a custom explanation.

## Interface Signal

This `Signal` object holds all the important information about a trade.

It tracks the initial entry price using the `priceOpen` property.

To keep a detailed history, it stores details about each entry point, including the price, cost, and timestamp, within the `_entry` array.

Also, it records any partial exits, whether they resulted in profit or loss, along with relevant data like percentage, current price, cost basis, entry count at the time of the partial exit, and the timestamp.

## Interface Signal$2

This `Signal` object holds information about a trading position. 

It tracks the initial entry price using the `priceOpen` property, which represents the price at which the position was first opened.

The `_entry` array stores details of each entry point within the position, including the price, total cost, and timestamp of that entry.

Furthermore, the `_partial` array captures information about any partial exits from the position, specifying the type (profit or loss), percentage of the position closed, the price at the time of exit, the cost basis at that time, and the number of units held at the time of the partial exit, along with a timestamp.

## Interface Signal$1

This section describes the `Signal` interface, which represents a trading signal.

A `Signal` has a `priceOpen` property, indicating the price at which the position was initially entered.

It also keeps track of entry details using the `_entry` array, which records each entry's price, cost, and timestamp.

Furthermore, the `_partial` array stores information about any partial exits from the position, including the type (profit or loss), percentage, current price, cost basis, entry count at the time of exit, and the timestamp. This provides a detailed history of the signal's lifecycle.

## Interface ScheduledEvent

The `ScheduledEvent` object provides a unified way to represent different types of trading events – when a signal is scheduled, opened, or cancelled. It bundles together all the key details you need for analyzing and understanding how your trading strategies perform.

Think of it as a detailed log entry for each signal.

It includes information like the exact time of the event, what action was taken (scheduled, cancelled, or opened), the trading pair involved, a unique ID for the signal, and the position type. You’ll also find crucial pricing information like the entry price, take profit, and stop loss levels, along with their original values before any adjustments.

For signals that involve multiple entries (like with a DCA strategy), it tracks the total number of entries and partial closes. It also includes the current Profit and Loss (PNL), the timestamp of closing, the duration of the trade (if applicable), and reasons for cancellation. Finally, it holds the time when a position became active or the original scheduling time.

## Interface ScheduleStatisticsModel

This model holds statistics about scheduled signals, giving you insights into how they’re behaving. It tracks every scheduled event, allowing you to see the full history of signals that were planned, activated, or cancelled.

You can find the total number of events, how many were scheduled, how many were activated, and how many were cancelled. 

It also calculates key rates: the cancellation rate (how often signals are cancelled) and the activation rate (how often signals are activated). Lower cancellation rates and higher activation rates are generally desirable.

Finally, it provides average waiting times for both cancelled and activated signals, helping you understand delays in these processes.

## Interface SchedulePingContract

The SchedulePingContract defines what information is shared when a scheduled trading signal is actively being monitored. Think of it as a heartbeat, sent every minute, to let you know the signal is still running. It gives you details like the trading pair (symbol), the strategy using it, the exchange involved, and the timeframe being used. 

You'll also receive all the data associated with the scheduled signal itself, plus the current market price. A flag tells you whether this ping is from a historical backtest or live trading. Finally, a timestamp indicates precisely when the ping was generated, either the real-time ping moment or the candle's timestamp during backtesting. 

This allows you to build custom logic, perhaps to automatically cancel a signal if certain conditions aren't met, ensuring your trading system behaves exactly as you intend. You can listen for these pings to keep tabs on your scheduled signals.

## Interface ScheduleEventContract

This contract helps you keep track of signals that are scheduled for future execution, whether they're ultimately activated or cancelled. It's like a notification system for signals waiting in the wings.

You'll receive events when a new signal is scheduled – meaning it's been created but hasn't started trading yet – or when a scheduled signal is cancelled before it even begins. 

The notifications don't cover when a scheduled signal *actually* starts trading; that's handled elsewhere.

Each event provides details like the trading pair (symbol), the strategy involved, the exchange and timeframe, the full signal data, and a reason for cancellation if applicable. It even tells you the price at the time of the event, whether it's part of a backtest, and when the event occurred. Think of it as a log of the lifecycle of a signal waiting to become a trade.


## Interface RiskStatisticsModel

This model holds important data about risk events, specifically focusing on rejections. It's designed to help you monitor and track how your risk management system is performing. 

You'll find a complete list of all risk rejection events, each with detailed information, within the `eventList` property. 

The `totalRejections` property gives you a simple count of all rejection events. 

To understand where those rejections are happening, you can look at `bySymbol`, which breaks down the count of rejections per trading symbol, and `byStrategy`, which shows how many rejections happened for each strategy.

## Interface RiskRejectionNotification

This notification appears when a trading signal is blocked by your risk management rules. It's a way for the system to tell you why a potential trade didn't happen.

Each notification has a unique ID and a timestamp to track when the rejection occurred. You’ll also find information about whether it happened during a backtest or live trading session, and the trading pair involved.

The notification will tell you which strategy attempted the trade, the exchange it was intended for, and a clear explanation of why the rejection happened. It also includes details like the current market price at the time, how many positions you currently hold, and the intended trade direction (long or short).

You can see the planned entry, take profit, and stop loss prices, along with any additional notes about the signal itself and when it was created. A unique signal ID is included if available, for deeper tracking.

## Interface RiskEvent

The RiskEvent data structure holds information about signals that were blocked due to risk management rules. It essentially provides a record of why a trade didn't happen.

Each RiskEvent includes details like when the rejection occurred, which trading pair was involved, and specifics about the signal that was rejected. You'll also find information about the strategy and exchange involved, along with the current market price and the number of existing positions.

A unique ID identifies each rejection, along with a note explaining why the signal was blocked. Finally, it notes whether the rejection happened during a backtest or a live trading session.


## Interface RiskContract

The RiskContract represents a signal that was blocked because it violated a risk rule. It's a record of when the system actively prevented a trade from happening due to risk management.

Think of it as an audit trail for rejected trading signals.

It contains detailed information to understand why and when a signal was rejected.

You’ll find details like the trading pair (symbol), the signal itself (including order parameters), the name of the strategy that proposed the trade, the frame it was associated with, and the exchange used.

It also includes the current market price at the time of the rejection and the number of active positions already open, giving context to the risk exposure.  A unique ID and explanation help in debugging. A timestamp records precisely when the rejection occurred, and a flag indicates whether the event happened during a backtest or in live trading. This information is particularly useful for creating reports and allowing users to monitor risk management effectiveness.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` lets you keep tabs on how a backtest is progressing. It provides updates during the `background()` execution of a walker, so you can see what's happening behind the scenes.

You'll get information like the walker's name, the exchange being used, and the frame in play.

It also tells you how many strategies are being evaluated overall, how many have been processed already, and the current completion percentage—essentially a percentage representing how much of the backtest is finished. This lets you monitor the entire backtesting process.


## Interface ProgressBacktestContract

This contract helps you monitor the progress of a backtest as it runs. It provides key details like the exchange being used, the name of the trading strategy, and the specific symbol being backtested. You'll see updates with the total number of historical data points (frames) the backtest will analyze, how many have been processed already, and a percentage indicating how far along the backtest is. Essentially, it's a way to keep an eye on how your backtest is progressing and estimate how much longer it will take.


## Interface PerformanceStatisticsModel

This model holds the combined performance data for a specific trading strategy. It breaks down the overall performance into several key areas, giving you a clear picture of how the strategy is behaving.

You'll find the strategy's name listed here, along with the total number of performance events tracked and the total time spent calculating those metrics. 

The `metricStats` section provides a more granular view, grouping statistics by the type of metric being measured. Finally, the `events` array contains all the raw data points, allowing for in-depth analysis if needed.


## Interface PerformanceContract

The PerformanceContract helps you understand how quickly and efficiently your trading strategies are running. It's like a little report card after each step, giving you information about the time taken and what was being done.

You'll see when each event happened, and when the previous one occurred, which is handy for spotting trends. The PerformanceContract also tells you what kind of operation it relates to, like order placement or data fetching. It will specify the strategy, exchange, and symbol involved, as well as whether it's happening during a backtest or in a live trading scenario. This detailed information lets you pinpoint areas where your strategy might be slow or inefficient, so you can optimize for better performance.

## Interface PauseContract

The PauseContract event signals changes in a strategy's paused state. Think of it as a notification letting you know when automated trading has been temporarily stopped or restarted.

When a strategy pauses, it won’t create any new trading signals, but any existing orders will still be managed and closed as usual.

This event includes details like the trading symbol involved, whether the pause is active (true) or resumed (false), the exact time of the change, the strategy and exchange names, the timeframe being used (like 1-minute or 5-minute intervals), and importantly, whether this is happening during a backtest or live trading. You can use this information to update users with notifications, for example, on Telegram, about these changes.

## Interface PartialStatisticsModel

The PartialStatisticsModel holds information about partial profit and loss events that occurred during a trading backtest. It lets you track specific milestones related to partial profits and losses.

The `eventList` property gives you access to a detailed record of each individual profit and loss event.

`totalEvents` tells you the overall number of profit and loss events that took place.

`totalProfit` represents the count of profitable events.

`totalLoss` represents the count of loss events.

## Interface PartialProfitContract

The `PartialProfitContract` represents when a trading strategy hits a predefined profit milestone, like 10%, 20%, or 30% gain. This helps you keep track of how your strategy is performing and when it's taking partial profits.

Each event contains details like the trading symbol, strategy name, and exchange used. You'll also find the original signal data and the current price when the milestone was achieved.

Importantly, these events are only sent once per milestone per trade. They're used by internal systems to build reports, and they're also available for you to monitor directly through callbacks.

You’ll also get information about whether the event came from a backtest (using historical data) or live trading. Finally, a timestamp indicates when the profit level was detected, aligning with either the live tick time or the backtest candle's timestamp.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade, whether it's during a backtest or a live trade. It contains a ton of details about the trade, including the unique ID of the signal that triggered it, the trading pair involved, and the strategy that generated the signal. You'll find information about the trade's direction (long or short), the entry and take profit/stop loss prices, and how they might have been adjusted.

It also provides comprehensive performance data for the position, such as the total profit/loss (PNL), the highest profit achieved, and the largest drawdown.  You can see how much capital was invested, the actual entry and exit prices used in the PNL calculation, and even how many entries made up the position. Finally, there's a timestamp for when the partial profit was committed, as well as optional notes about the reason behind the signal.

## Interface PartialProfitCommit

This event represents a partial profit-taking action within a trading strategy. It's triggered when the strategy decides to close a portion of an existing position.

The `action` property simply identifies this as a partial profit event.

The `percentToClose` specifies what percentage of the position should be closed, ranging from 0 to 100.  You'll also find the current market price (`currentPrice`) when the action was triggered.

Crucially, the event includes performance metrics related to the position. This includes the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the maximum drawdown experienced (`maxDrawdown`). The direction of the trade (`position`), whether it’s a long or short, is also recorded.

The original entry price (`priceOpen`) and the effective take profit and stop loss prices (potentially adjusted after trailing) are provided.  Original values before any trailing adjustments (`originalPriceTakeProfit` and `originalPriceStopLoss`) are also included. Timestamps for the signal’s creation (`scheduledAt`) and position activation (`pendingAt`) provide context for when the event occurred.


## Interface PartialProfitAvailableNotification

This notification signals that a profit milestone has been reached during a trade, like hitting 10%, 20%, or 30% profit. It's used to keep track of progress and understand how a strategy is performing.

The notification includes details like a unique ID, the exact time the milestone was reached, whether it's from a backtest or a live trade, and the specific trading pair involved. You'll also find information on the strategy and exchange used, the signal identifier, and the level of profit achieved.

Crucially, it provides comprehensive pricing data, including the entry price, current price, and original take profit and stop loss levels. It also outlines the details of any DCA averaging that might have occurred.

Beyond basic profit information, you get insights into the position's performance, including total profit and loss, peak profit, and maximum drawdown.  Detailed pricing data and entry counts are included to give a full picture of the position's lifecycle, with all numbers adjusted for factors like slippage and fees. The notification also includes human-readable notes for extra context. Finally, timestamps indicate when the signal was scheduled, became pending, and when the notification itself was created.

## Interface PartialLossContract

This describes events related to a trading strategy hitting predefined loss levels, like -10%, -20%, and so on. These events, called `PartialLossContract` objects, are triggered when a trading strategy's losses reach these milestones.

Each event tells you which trading pair (symbol) is experiencing the loss, the name of the strategy causing it, the exchange and frame used for the trade, and all the details about the original signal that led to this point. You'll also find the current market price and the specific loss level that was triggered, expressed as a percentage.

The system ensures that each loss level is only reported once per signal, even if the price moves rapidly. These events are useful for tracking strategy performance and monitoring potential drawdown – how much a strategy has lost. Services like `PartialMarkdownService` use these events to create reports, and you can set up your own code to react to them as they happen, either for every occurrence or just the first time. The event also indicates whether it originated from a historical backtest or a live trading session, and provides a timestamp marking when the loss level was detected.

## Interface PartialLossCommitNotification

This notification lets you know when a portion of a trading position has been closed. It provides a wealth of detail about the partial closure, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find information about the trading pair, the strategy that triggered the action, and the exchange used.

The notification also includes crucial data about the position itself – like the direction (long or short), the original entry price, and any take profit or stop loss levels that were in effect. It breaks down the position's performance with metrics like total profit/loss, peak profit, and maximum drawdown, allowing you to analyze the trade’s history and effectiveness. Furthermore, you’ll get details on the number of entries and partial closures, along with pricing information used for P&L calculations. Finally, there's an optional note field for any explanation accompanying the partial closure.

## Interface PartialLossCommit

This data represents a partial loss event, where a portion of a trading position is being closed. It provides a detailed snapshot of the position's history and current state. You'll find information like the percentage of the position being closed and the current market price at the time of the action.

The record also includes key performance metrics for the position, like total profit and loss (PNL), the highest profit achieved (peak profit), and the largest drawdown experienced. The trade's direction (long or short), entry price, take profit and stop loss prices (both original and adjusted for trailing), and timestamps for when the signal was created and the position activated are also provided. This comprehensive dataset allows for a thorough understanding of the circumstances surrounding the partial loss.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a predefined loss milestone, like a 10% or 20% drawdown. It's a way to track how a trade is performing and potentially adjust strategy. The notification includes detailed information about the trade, such as the trading pair, the strategy used, the entry and stop-loss prices, and the position's profit and loss.

You'll find identifiers for the notification and signal, timestamps marking key events, and whether the signal originated from a backtest or live trading environment. The notification also provides a comprehensive financial snapshot, including peak profit, maximum drawdown, and profit/loss figures, alongside details of the original entry price and the impact of any DCA averaging. The 'note' field allows for adding custom explanations about why the signal was triggered. Finally, it provides timing information about the signal's scheduling, pending, and creation timestamps.

## Interface PartialEvent

This data structure, called `PartialEvent`, bundles together all the important information about profit and loss milestones during a trade. Think of it as a snapshot of what happened at a key point in a trade, whether it's hitting a 10% profit level or a 20% loss. It includes details like the exact time of the event, whether it was a profit or loss, the trading pair involved, and the name of the strategy and signal that triggered it.

You'll also find crucial pricing information like the entry price, take profit target, stop loss levels, and their original values when the signal was created. If the strategy used a dollar-cost averaging (DCA) approach, it provides information about the total number of entries and the original entry price before averaging.

Furthermore, it captures details on partial closes, the total percentage executed, unrealized profit and loss, a human-readable explanation for the signal, and timestamps related to when the position became active and when the signal was initially created. Finally, a flag indicates if the trade occurred in backtest or live mode.

## Interface OrderSyncOpenNotification

This notification lets you know when a trading position has been opened, either immediately or through a scheduled order. It provides a wealth of information about the trade, including when it happened, which exchange and strategy were involved, and a unique identifier for tracking purposes. The notification specifies whether it's part of a backtest (simulated trading) or a live trade.

You'll find key details like the trade direction (long or short), entry price, and any stop-loss or take-profit levels set. Critically, it also includes performance metrics like profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown – all calculated up to the point the signal was created. This data is invaluable for understanding the performance of your strategies and how they're impacting your portfolio. You can also see the original prices and number of entries and partials for a more complete picture of the trading activity. Finally, timestamps indicate when the signal was scheduled, activated, and the notification was created.

## Interface OrderSyncCloseNotification

This notification tells you when a trading signal has been closed – whether it hit a profit target, a stop-loss, expired, or was closed manually. It provides a wealth of information about the closed position, including details like the trading pair, the strategy that generated the signal, and the exchange where it was executed. You’ll find key data points like the closing price, profit and loss (both in dollars and as a percentage), peak profit achieved, and maximum drawdown experienced. 

It also tracks details like the original take profit and stop loss prices, the number of entries used for averaging, and the reason why the signal was closed. The notification includes timestamps for when the signal was created, activated, and closed, alongside an optional note that gives more context. Distinguishing between backtest and live mode, this notification allows you to understand how signals behave in different environments.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an open order's status, essentially a "ping" to confirm it's still active with the external order management system. It's used when a trading strategy is running in live mode and is throttled to avoid overwhelming the system.

The notification includes a wealth of information about the order and the associated trade, such as the trading pair, strategy name, exchange, signal ID, order type, and current price. You'll also find details on entry and exit prices, stop-loss and take-profit levels (both original and adjusted for trailing), and details regarding any DCA averaging or partial closes that have occurred.

Crucially, it also includes extensive P&L data, from current unrealized profit/loss to peak profit and maximum drawdown, along with the entry and exit prices used in those calculations. This allows for a comprehensive understanding of the trade’s performance. 

Finally, it includes timestamps for when the signal was created, when it became pending, and the creation of this notification itself, along with an optional note field to provide context or explanations for the signal's behavior.

## Interface OrderSyncBase

This describes the common information shared in events related to order synchronization within the trading framework. These events provide details about orders, whether they are active or scheduled, and are essential for tracking order execution and handling potential errors.

Each event includes crucial information like the trading symbol, the name of the strategy that generated the signal, the exchange used, and whether the event originates from a backtest or live trading environment. A unique identifier for the signal, along with a timestamp, is also provided.

You'll find the full details of the signal itself, and a counter tracking consecutive failures – this is automatically managed by the system to help with retries if orders don't go through as expected, up to certain limits. Understanding this structure allows you to monitor order behavior and troubleshoot issues effectively.

## Interface OrderStopContract

This event signals that an order associated with a trading signal has been terminated, meaning the backtest-kit framework has determined it's no longer active on the exchange. It’s essentially a notification that a previously tracked order has been closed or canceled. The `type` property indicates whether it was an active order or a scheduled entry order that was canceled.

The `reason` provides insight into why the order was terminated – either because the order was not found (likely filled, cancelled, or liquidated elsewhere) or because the framework reached its maximum retry attempts.  This event provides comprehensive details about the order and associated position, including its symbol, strategy, exchange, timeframe, signal details, price points, profit/loss, and trade direction.  Importantly, order checks are only performed in live mode, and any errors within the listener for this event won't impact the framework's actions. The notification includes details about the signal’s creation and activation timestamps, as well as information regarding any averaging or partial closes.

## Interface OrderStopCheckNotification

This notification signals the end of a monitored order check, specifically when it's being terminated due to a definitive issue—either the order was not found ("deleted") or the system reached its retry limit ("exhausted"). It's a rare event that provides a snapshot of the order's state right before it's closed or canceled.

The notification contains a wealth of information about the order and the position it represents. You'll find details like the trading pair, strategy name, exchange, signal ID, and the type of order being monitored (either an active position or a scheduled entry order).

It includes comprehensive performance metrics such as total entries, partials, P&L, peak profit, maximum drawdown, and related pricing information. Crucially, it also details the original order parameters like take profit and stop loss prices before any adjustments were made, alongside the final effective entry and exit prices.  Additional timestamps indicate when the signal was created, when the position went pending, and when the check was executed. A note field allows for a custom description of the signal's reasoning.

## Interface OrderRejectOpenNotification

This notification signals that an order placement has been definitively rejected by the exchange – it's a terminal event, meaning the system won't retry the order. It's only triggered when there's a definitive rejection from the broker, not for temporary issues.  Each rejection event has a unique identifier and timestamp.

The notification includes detailed information about the rejected order, like the strategy that generated it, the exchange that refused it, and the reason for rejection (in a human-readable message). You'll find key data points related to the position's performance, such as profit and loss (PNL), peak profit, maximum drawdown, and the prices associated with these metrics. 

The notification also provides details about the order itself: whether it was an immediate order or a scheduled order, and how many times the attempt to place the order had previously failed. Crucially, it includes original order details like prices and quantities, as well as details about partial fills or averaging done. Finally, it includes the signal creation and activation timestamps, as well as an optional note for explanation.

## Interface OrderRejectOpenContract

This describes what happens when a trading order, either an active order to enter a position or a scheduled entry, is permanently rejected. It's a definitive refusal, meaning the trade attempt is canceled and the associated signal is used up. 

The `action` property tells you specifically *what* was rejected - whether it was an attempt to open a position or a scheduled entry.

The `cost` property represents the total cost associated with that rejected order, essentially the sum of all the costs involved in entering the position.

## Interface OrderRejectCloseNotification

This notification pops up when a closing order is rejected by the broker—essentially, when a close attempt fails and the broker sends back an error. It's only triggered for live trading environments, never during backtesting. The notification provides a detailed snapshot of what happened, including a unique ID, the time of the rejection, and the specific reason the broker gave.

You'll find information about the strategy that generated the signal, the exchange involved, and details about the order itself—its type, the number of attempts made, and the current market price.

Critically, it includes a wealth of performance data for the position:  profit & loss (PNL), peak profit, maximum drawdown, and key prices related to those figures.  It breaks down the details of the closing order, like the intended take profit and stop loss prices, along with information about any averaging or partial closing that occurred.  Finally, you'll find timestamps for when the signal was created and when the position began. This notification helps pinpoint exactly why a closing order failed and analyze its impact on performance.

## Interface OrderRejectCloseContract

When a trading strategy tries to exit a position but the system can’t fulfill the order, this signals a definitive rejection. It means the exit order was refused and the system will force-close the position using the original reason for wanting to close it.  The `action` property will always be "signal-close" to indicate this specific type of rejection.  You'll also find the `closeReason` included, detailing why the closure is happening.

## Interface OrderRejectBase

This interface, `OrderRejectBase`, describes what happens when an order is definitively rejected by the exchange—meaning it won't be retried. It's a notification emitted when a trading order fails completely, not just temporary glitches.  You’ll only see this in live trading, not in backtest mode.

Here’s a breakdown of the information included:

*   **Type of Order:** Tells you whether it was a position order (opening, closing) or a scheduled order.
*   **Key Details:** Provides core information like the symbol being traded, the strategy used, the exchange that rejected the order, and the signal identifier.
*   **Contextual Data:** You'll get the timestamp, the original signal details, and the number of previous attempts to place the order.
*   **Trade Performance:** A snapshot of the position's performance, including P&L, peak profit, and maximum drawdown, is included.
*   **Order Parameters:**  Details the original and adjusted prices for entry, take profit, and stop loss.
*   **Scheduling Info:**  Provides timestamps for signal creation and position activation.
*   **Trade History:** Shows how many entries and partial closes occurred related to this position.
*   **Reason for Rejection:**  A human-readable message explaining why the order was rejected (taken directly from the exchange's error message).

Essentially, this event gives you a full picture of what went wrong when an order couldn't be filled, allowing you to investigate and understand the reasons for the failure.

## Interface OrderOpenContract

This event, `OrderOpenContract`, is triggered when a limit order placed by the trading framework gets filled – essentially, when the exchange confirms the order to enter a position. It's like a confirmation signal letting you know that a buy or sell order has actually gone through.

Think of it as a bridge between the backtest-kit's internal workings and any external systems you might be using, such as order management tools or audit logs.

The event provides a lot of details about the trade, including the price at which the order was filled, the direction of the trade (long or short), and key performance metrics like profit, loss, and drawdown accumulated up to that point.  You'll also find information about original order parameters like take profit and stop loss prices before any adjustments were made.

It also includes details about how the position was built, such as whether it involved averaging (DCA) or partial closes. Ultimately, this event gives a complete snapshot of the position at the moment it began.

## Interface OrderFillOpenNotification

This notification confirms that a trade has been successfully executed or a resting order has been placed – it's a signal that things went as planned after an initial attempt. It's crucial for understanding what happened in a live trading environment and isn't generated during backtesting.

The notification contains a wealth of information about the trade, including the exact moment it happened, which exchange was used, and a unique identifier for the signal that triggered it. It tells you whether a market order was filled or a limit order was placed, and even how many attempts were made before success.

Beyond the basic details, you’ll find key performance indicators like profit and loss, peak profit, and maximum drawdown, giving you a snapshot of the trade's performance so far. There are also detailed price points and entry/exit data used in those calculations. You can see the cost of entering the trade, the current position, and details about any take profit and stop loss orders, both original and adjusted.  Finally, the notification provides information about the number of entries, partials, and the timestamps related to signal creation and position activation.

## Interface OrderFillOpenContract

This describes what happens when an order to open a position is confirmed by your broker. It's a signal that either a new position has been filled – meaning the order was executed – or a resting order has been placed on the exchange.

The `action` property simply tells you *what* kind of action occurred: either a "signal-open" to indicate the event.

The `cost` property tells you the total cost associated with this position opening. This includes all entry costs involved.


## Interface OrderFillCloseNotification

This notification signals that a trading position has been definitively closed on the exchange, confirming the exit order went through. It’s a crucial piece of information because it represents the final, confirmed outcome of a trade, unlike earlier notifications which might be tentative. This event only happens in live trading, and is linked to a specific signal.

The notification includes a wealth of detail about the trade, such as the symbol traded, the strategy that initiated it, and the exchange where it took place. You'll find key information like the signal ID, order type, and the number of previous attempts to close the position.

It also provides a comprehensive performance snapshot, including profit and loss (PNL), peak profit, maximum drawdown, and all the prices involved (entry, take profit, stop loss).  You'll get a view of the trade's entire lifecycle, from its creation and activation to its eventual close, and understand why it closed – whether it was a take-profit, stop-loss, or time expiry. This comprehensive view is incredibly valuable for analyzing and understanding trading performance.



You'll find data related to the number of entries, partial closes, timestamps for signal creation, position activation, and a possible note explaining the trade’s reasoning.

## Interface OrderFillCloseContract

This object represents when a trading position has been fully closed, and the broker has confirmed that the closing order was executed. It's used to signify the exit of a trade, whether that’s due to a take profit, stop loss trigger, a timed expiry, or a manual closure by the user. The `action` field is always "signal-close" to clearly indicate this is a closing event.  The `closeReason` property tells you the specific reason behind why the position was closed, providing important context for analyzing the trade's outcome.

## Interface OrderFillBase

This describes the information you receive when a trade is confirmed – meaning the broker has actually executed an order on the exchange. It's important to understand that these notifications happen *after* the engine is certain the order went through, unlike earlier signals that might be rejected or transient. You won't get these notifications during backtesting because the engine immediately assumes the order is confirmed.

Here's a breakdown of the key details provided:

*   **Type:** Indicates whether the order relates to opening a position ("active") or was placed as part of a scheduled action ("schedule").
*   **Basic Trade Information:** You’ll get the trading pair symbol, the strategy that triggered the trade, the exchange used, the timeframe, a unique ID for the signal, a timestamp, and the entire signal data itself.
*   **Attempt Count:** A counter shows how many times the engine tried to confirm the order before it succeeded.
*   **Performance Metrics:** Data includes the market price at confirmation, the current Profit & Loss (PNL), peak profit so far, and the maximum drawdown experienced.
*   **Trade Details:** The direction of the trade (long or short), the entry price (potentially averaged if using DCA), and the take profit/stop-loss prices (original and adjusted for trailing).
*   **Timing Information:**  You'll also receive timestamps related to when the signal was created and when the position was activated.
*   **Averaging and Partial Closures:**  The number of entries used for DCA averaging and the number of partial closes are also reported.

## Interface OrderContinueContract

This event signals that the system is continuing to monitor an order placed on an exchange, rather than marking it as definitively closed. It's a follow-up to an initial check, confirming the order is still active, either supporting an open position or a pending entry order. The `type` property indicates whether it's related to an active position ("active") or a scheduled order ("schedule").

The `attempt` value is crucial; it tells you how many times the system has temporarily tolerated a failure in order verification.  A value of 0 means the verification passed successfully, while a number greater than 0 shows how many consecutive, but temporary, failures have occurred before the system continues monitoring.  The framework uses this to manage situations where brief connection issues might occur.

Importantly, this event only happens in live trading environments; backtests don't involve order checks.  The event provides extensive details about the order, including the trading symbol, strategy name, exchange, timeframe, signal ID, timestamp, signal details, position direction (long or short), entry and stop-loss prices (both original and adjusted), and financial metrics like P&L and drawdown.  It also provides information on how the order was built, including the number of entries and partial closes, useful for understanding how the trade has evolved.

## Interface OrderContinueCheckNotification

This notification signals that an order check has resolved without immediately closing the order. It's a message sent after a check on an order, letting you know the order is still active, or a temporary problem was handled. Think of it as a "check-in" – the system is still monitoring the order.

Here's a breakdown of what the information tells you:

*   **What it’s about:** It relates to an ongoing check on either an active order (like one backing an open position) or a "schedule" order (one waiting to be triggered).
*   **Important details:** You'll get information like the trading pair, strategy name, the signal ID, the current price, trade direction (long or short), entry and stop-loss prices, and key performance indicators for the position (profit/loss, peak profit, maximum drawdown).
*   **Transient failures:** If a temporary issue arose (like a brief connection problem), this notification confirms that the system has tolerated it and continues monitoring the order. The `attempt` number tells you how many temporary issues have been handled.
*   **Throttle:** The system prevents too many of these notifications from being sent, keeping things manageable.
*   **Live data:** This notification only applies to orders that are currently active, not historical data.

Essentially, this notification gives you a continuous stream of updates on the health and performance of your orders, allowing you to monitor and react accordingly.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether that's because a take profit or stop loss was triggered, time ran out, or a user manually closed it. It's designed to help systems outside of the core trading framework stay in sync, like updating order books or recording profit and loss in external databases.

The event provides a lot of detailed information about the closed position, including the current market price at the time of closure, the total profit and loss, and key performance metrics like peak profit and maximum drawdown. You'll also get the original and adjusted prices for entry, take profit, and stop loss, along with the trade direction (long or short), when the signal was created and activated, and the reason it was closed. 

Finally, the event tells you how many times the position was averaged (through DCA) and how many partial closes were executed during the position's lifetime, which is useful for understanding the position's history.

## Interface OrderCheckContract

This event, `OrderCheckContract`, is a crucial part of ensuring your trading signals are correctly reflected on the exchange. It's a periodic check, triggered during live trading, to confirm that the order associated with a signal is still active on the exchange. Think of it as a "ping" to the exchange to verify the order's status.

There are two main types of order checks: "active," for open positions, and "schedule," for orders waiting to be triggered.  Your system needs to respond to this ping by confirming the order's existence – a positive response resets the attempt counter, while a failure is initially tolerated.

If the order is missing (meaning it was filled, canceled, or liquidated elsewhere), the framework immediately terminates the signal.  If the ping fails transiently (like a temporary network issue), the framework will retry a few times before considering the order missing. This allows for a bit of grace when dealing with occasional connection problems. 

The event provides a lot of contextual information to help you understand the situation: the trading pair, strategy name, exchange, current price, unrealized profit/loss, and details about the original order including take profit and stop loss prices. Backtesting won't trigger this event since there’s no live exchange connection. You'll use this event through broker adapters or registered actions to manage order confirmations.

## Interface MetricStats

This data structure holds a collection of statistical information about a particular performance metric. It tracks things like how many times a metric was recorded, the total time it took across all recordings, and the average, minimum, and maximum values observed. You'll also find details about the data's spread, including standard deviation, median, and percentiles (like the 95th and 99th). Furthermore, it gives insights into the time between events, providing minimum, maximum, and average wait times. It's a complete snapshot of a metric's performance characteristics.


## Interface MessageModel

This describes a single message within a conversation handled by a large language model. It’s designed to represent different types of contributions – the initial instructions for the model (system messages), what the user says, the model's responses, and even the results of tools the model uses. 

Each message has a `role` indicating who sent it (like "system," "user," or "assistant").  The `content` is the actual text of the message, and for some models, there might be `reasoning_content` providing additional insights into the model's thinking.

If the assistant used a tool, you’ll find details about that in the `tool_calls` section.  Messages can also include images, provided as strings, byte arrays, or Blobs. Finally, `tool_call_id` links a message specifically to the tool call it addresses.

## Interface MaxDrawdownStatisticsModel

The `MaxDrawdownStatisticsModel` keeps track of maximum drawdown events during a trading simulation. 

It essentially provides a historical record of the worst losses experienced.

The `eventList` property holds an ordered list of these drawdown events, with the most recent ones appearing first. Think of it as a timeline of the largest drops in your portfolio value.

The `totalEvents` property simply tells you how many drawdown events have been recorded overall.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown experienced during a trade. It captures all the details surrounding that drawdown event.

You’ll find information about when the drawdown occurred (timestamp), which trading pair it involved (symbol), and the name of the strategy and signal that generated the trade (strategyName, signalId).

It also provides crucial information about the trade itself, including whether it was a long or short position, the total profit/loss (pnl), the highest profit achieved (peakProfit), and the magnitude of the drawdown (maxDrawdown).

Finally, you’ll have access to the price at which the drawdown occurred (currentPrice), along with the initial entry price (priceOpen) and any defined take profit or stop loss levels (priceTakeProfit, priceStopLoss), and a flag to indicate if the event happened during a backtest (backtest).

## Interface MaxDrawdownContract

This contract provides information when a new maximum drawdown is detected for a trading position. It gives details like the trading symbol, the current price, and when the event occurred. You'll also find information about the strategy, exchange, and timeframe being used. 

The `signal` property contains data related to the specific trade that triggered the drawdown. A crucial flag indicates whether the drawdown event came from a backtest or live trading.

Tracking these max drawdown events helps monitor risk, allowing adjustments to stop-loss levels or other risk management strategies. The framework consistently sends these updates as new drawdown levels are reached, keeping you informed about your position’s performance.

## Interface LiveStatisticsModel

This model provides a comprehensive snapshot of your live trading performance, packed with statistical data derived from your trades. It breaks down everything from the raw event data to key performance indicators, helping you understand what’s working and where you can improve.

The `eventList` property holds a detailed record of every trade event – from when a signal was opened to when it was closed.  You’ll also find the total count of events, and separate counts for closed trades, wins, and losses.

Key performance metrics include your win rate, average profit per trade (`avgPnl`), total profit (`totalPnl`), and volatility measures like standard deviation (`stdDev`).  Ratios like Sharpe Ratio and Sortino Ratio allow you to assess risk-adjusted returns.  Other useful statistics include expectancy, average trade duration, and measures of consecutive win/loss streaks.

Several properties delve into the nuances of price action, such as `buyerPressure`, `sellerPressure`, and their related strength measures. Finally, `trend` and `trendStrength` attempt to characterize the overall market direction based on price movement, with `trendConfidence` indicating the reliability of that assessment. Keep in mind that if calculations involve data that’s unreliable, like when there isn’t enough data, the corresponding values will be `null`.

## Interface InfoErrorNotification

This notification is a way for the system to let you know about errors that happened during a background task, but aren't critical enough to stop everything. 

It uses a specific "error.info" type to identify it as an informational error. 

Each notification has a unique ID so you can track it.  The notification also includes the details of the error, including a helpful message and a stack trace with extra information to help you understand what went wrong. 

You'll notice that the `backtest` property is always false because these errors occur in the live environment, not during a backtest simulation.

## Interface IdlePingContract

The `IdlePingContract` helps you keep track of when your trading strategies are in a "resting" state, meaning they aren't actively responding to any signals.

It sends out a notification, an “idle ping,” whenever a strategy isn’t monitoring any signals or has any pending actions.

This lets you follow the lifecycle of your strategies - when they’re active, and when they're not. 

The ping includes details such as the trading symbol, the strategy's name, the exchange it's on, and the price at the time. You can register to receive these idle ping notifications and react to them. 

The ping also indicates whether the event came from a backtest (historical data) or from a live trading environment, and provides a timestamp.

## Interface IWarmCandlesParams

This object defines the settings needed to prepare your historical trading data for backtesting. Think of it as telling the system exactly which asset, exchange, timeframe, and date range you want to pre-load into its memory. You specify the trading pair (like "BTCUSDT"), the exchange you're using, the candle interval (like "1m" for one-minute candles or "4h" for four-hour candles), and the beginning and ending dates for the data you need. It's a straightforward way to ensure your backtest has all the necessary historical data readily available.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy during a backtest. It bundles together essential information about the strategy's performance.

You'll find the strategy's name clearly labeled.

Alongside the name, it provides detailed statistics generated during the backtest, like total profit, maximum drawdown, and win rate.

A key value representing the strategy’s performance, often a custom metric you’ve defined for comparison, is also included.  If the metric is unusable for some reason, it will be null.

Finally, the interface shows the strategy’s ranking among all the strategies being compared, with the highest-performing strategy receiving a rank of 1.


## Interface IWalkerSchema

The IWalkerSchema defines how to set up and run comparisons between different trading strategies. Think of it as a blueprint for an A/B test on your strategies.

You'll give it a unique name to identify the comparison, and can add a note for your own documentation.

It specifies which exchange and timeframe your strategies will be tested on, and most importantly, which strategies you're comparing. 

You can also tell it which metric to optimize, like Sharpe Ratio, and configure optional callbacks for specific events during the backtest.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered after running a comparison of different trading strategies. It essentially summarizes the outcome of the evaluation process. 

You'll find details about the specific trading symbol that was tested.

It also includes the name of the exchange where the testing took place.

The name of the walker itself (the tool used to execute the strategies) is stored here.

Finally, it tells you which timeframe (like 1-minute, 1-hour, or daily) the strategies were evaluated on.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into key events as the backtest-kit framework runs through and compares different trading strategies. 

You can get notified when each strategy begins its testing (`onStrategyStart`), and again when it finishes (`onStrategyComplete`), along with the backtest results and a specific metric.  If a strategy encounters an error during testing, `onStrategyError` will alert you to the problem. Finally, `onComplete` signals that all strategies have been evaluated and the overall process is done, providing you with all the accumulated results.

## Interface ITrailingTakeCommitRow

This interface describes a queued action for a trailing take commit strategy. Think of it as a record of a specific adjustment to your trading position.

It includes information about the type of action being taken ("trailing-take"), the percentage shift that's happening, and the price at which the trailing stop was originally set. This helps track how the trailing stop is reacting to price changes and the overall strategy’s performance. 

Essentially, this data point provides a snapshot of a trailing take commit event.


## Interface ITrailingStopCommitRow

This interface describes a queued action related to trailing stops in a trading strategy. It represents a single step in the process of adjusting a trailing stop loss.

Essentially, it tells the system to adjust a trailing stop based on a specific percentage shift. 

The `action` property confirms that the action being performed is specifically a trailing stop adjustment.

You'll find details about the `percentShift`, which is the amount the stop loss should be moved, and the `currentPrice`, which is the price at the time the trailing stop was initially established or last adjusted.

## Interface ISweepTrade

The `ISweepTrade` interface defines the structure of a single trading event within the backtesting framework. Each trade record includes information like the originating idea's ID and the symbol being traded. It also tracks who created the idea that led to the trade, allowing for analysis based on individual authors.

You'll find details about the trade's direction, precise entry and exit timestamps, and the reason for closing the position. The actual holding time is recorded, alongside the trade’s profit and loss as a percentage.

Finally, the interface includes an array that identifies any ideas that were "absorbed" by the trade, meaning they were good enough to enter but were preempted by this one, providing a complete history of how ideas were processed within the trade.

## Interface ISweepTrack

This data represents a single author's performance under a specific trading rule, providing detailed information about their results over a period of simulated trading. Each entry captures a specific rule's configuration and the resulting track data for that author. It’s designed to be easily searchable and filterable, offering a continuous view of performance rather than a simple pass/fail determination.

The `holdMinutes` property defines the timeframe for evaluating the rule. `profitLockPercent`, `hardStopPercent`, and `trailingTakePercent` specify the precise parameters of the rule being tested.  The `author` identifies who generated the trading ideas.

The core performance metrics are `ideas` (the total number of trading attempts), `hits` (the number of successful trades where the lock or trailing take triggered before the hard stop), and `hitRate` (the ratio of hits to ideas). These metrics are crucial for assessing an author's reliability and effectiveness within a particular strategy. The `hitRate` isn't a cutoff for filtering, but rather provides a direct measure of performance for users to evaluate.

## Interface ISweepSchema

This schema defines how a sweep, which is essentially a test run, is registered and configured within the backtest-kit framework. Each sweep needs a unique name to identify it in the registry.

The sweep also needs to specify which data source (exchange) to use for retrieving historical price data; the data must be complete, or an error will occur.

You can customize certain grid parameters, like profit locks, by overriding their default values. If you don’t specify a parameter, it will use the default value and be included in the sweep.

Several optional callbacks can be configured to trigger specific actions during the sweep's lifecycle, though these are essentially silent unless explicitly implemented. A key callback, `onAuthorsTrained`, only runs once for each unique set of rules (like hold, stop, and trailing parameters), not for each individual grid point.

Finally, the `reportOrder` property defines how the results of the sweep should be sorted, defaulting to a Sharpe ratio-based ranking, which is crucial for consistent comparisons. This order does not affect how the best trades are tracked.

## Interface ISweepResult

This structure represents the outcome of a simulation run, providing a complete picture of its performance. It includes information like the trading symbol being analyzed.

You’ll find metrics detailing the number of ideas processed, broken down into directional and neutral categories, alongside the number of profiles built. It also tracks how long trades were held, giving you percentiles that highlight the typical and extreme holding durations.

The most significant piece of information is the `reports` property, which contains a detailed report bucket. This bucket summarizes the performance of each trading grid point based on a specific profit metric, including a ranking of the best-performing points and individual author contributions.

## Interface ISweepPointReport

This report summarizes the performance of a single grid point within a backtest. It provides a comprehensive overview of trading activity at that specific point, covering metrics like the number of trades skipped due to author conflicts.

The report details key profitability indicators, including total and average profit percentages, win rate, and profit factor, which represents the ratio of gross profit to gross loss. It also assesses risk, using measures like maximum drawdown and recovery factor, alongside time-based risk-adjusted returns like the Calmar and Sharpe ratios.

You'll find information about trade durations, broken down by percentiles, revealing typical and exceptionally long holding times.  Exit reasons, categorized by type, show how trades were closed. Importantly, it includes a full list of all trades executed at that point, allowing you to investigate the details behind the reported performance numbers. The trade list is consistent across all points, providing a traceable history of each trade for analysis.

## Interface ISweepParams

The `ISweepParams` object defines the configuration settings used when running a sweep, which is essentially a systematic way to test different trading strategies. It combines the parameters you provide with some automatically added components. 

Here's a breakdown of what it contains:

*   **logger:** A tool for outputting debugging information, helping you understand what the sweep is doing and identify potential issues.
*   **gridAxes:** This describes the different factors you're varying in your sweep, like different indicators or parameter ranges, and how they are arranged.  You won't need to define these from scratch; defaults are already provided.
*   **reportOrder:** Determines how the sweep results are sorted and presented, making it easy to find the best performing strategies. Again, a default ordering is already set for you.

## Interface ISweepMetricReport

This data structure represents a single report summarizing a sweep of trading strategies. Think of it as one complete assessment of how strategies performed.

It contains three main pieces of information:

*   **reports:** A list of all the individual grid points (combinations of strategy settings), ordered from best to worst based on a specific metric like Sharpe ratio. This shows you exactly how each strategy setting performed.
*   **best:** Details about the top-performing strategies according to four different ranking criteria. This highlights the strategies that stood out in various ways.
*   **tracks:** Information about the "authors" – the rules or strategies – that contributed to the results. This data is condensed to avoid redundancy, and provides all the relevant details about how each rule operates (holding, locking, stopping, trailing) and who created it. It’s designed for easy searching and analysis without needing to link multiple data points together.

## Interface ISweepIdeaProfile

ISweepIdeaProfile holds the historical price data and performance metrics for a single trading idea. Think of it as a complete record of how an idea would have performed, from its entry point to the end of its potential holding period. This record includes the idea’s initial entry price, the prices of each candle within its holding window, and whether the idea ultimately proved profitable.

It’s structured to avoid repeatedly fetching the same price data; candles are referenced rather than duplicated. The profile also contains a set of diagnostic metrics, like the maximum price excursion in a favorable or adverse direction, and the median price movement, giving you a comprehensive overview of the idea’s behavior. These metrics are calculated across the entire time horizon, providing a holistic assessment of the idea's potential. The data is designed so that the grading system can evaluate the raw candle trajectory within its own timeframe without needing to re-fetch any data.

## Interface ISweepIdea

An `ISweepIdea` represents a single trading suggestion or forecast published by someone. Think of it as a public prediction about a specific trading pair like BTCUSD, indicating whether the author believes the price will go up or down. Each idea has a unique ID, a timestamp marking when it was published, and identifies the author who made the prediction. When running simulations, the framework processes these ideas individually, considering how the candles move relative to each idea's forecast.

## Interface ISweepGridPoint

This interface represents a single point within a grid of trading strategies. Each point defines specific parameters for a trade, outlining its risk and reward profile. You'll find settings here to control how long a trade is held, a hard stop loss percentage to protect against significant losses, a trailing take profit that adjusts as the price moves in your favor, and a profit lock mechanism to secure gains. The profit lock feature, when active, creates a safety net by triggering an exit when the price retreats from a predetermined profit level.

## Interface ISweepGridAxes

This interface defines the ranges of values you can use for key trading parameters like hard stops, trailing take levels, holding times, and profit locks. Think of it as setting up the possible scenarios your trading strategy will explore.

Each parameter – hard stop, trailing take, hold time, and profit lock – has a list of values you can test. These values determine how aggressively or conservatively your strategy will react to market movements.

The `hardStopPercent` defines the levels at which a trade will be forcibly closed to limit losses.  It’s always used, so you need to define values for it.

`trailingTakePercent` controls how much price pullback is allowed after a peak before the trailing take profit is activated. Trades that don’t reach this level will exit through a stop, lock, or time limit.

`holdMinutes` dictates the maximum time a trade can remain open. It acts as both a time limit and a window for evaluating the trade's performance.

`profitLockPercent` sets a level where a trade locks in profits if the price reaches that point. It allows a trade to continue running while protecting profits and allows the trailing take to eventually activate.  A zero value for this means this feature is disabled.

Essentially, this interface helps you systematically test different combinations of these settings to find the optimal configuration for your trading strategy.

## Interface ISweepCallbacks

The `ISweepCallbacks` interface provides a way to monitor the progress and key events of a backtesting simulation. Think of it as getting updates on what's happening behind the scenes as the simulation runs.

You can use `onProgress` to track the progress of long operations, like processing profiles or grid points, and understand how many items have been handled out of the total.

`onIdeas` lets you know how many total and directional ideas were found.

`onProfiles` is triggered whenever all the profiles for an idea are created, and it also tells you if any profiles were cut short due to data limitations.

`onAuthorsTrained` informs you when a grading rule has been applied to an author’s track. It gives you details on the author's performance based on that specific rule.

`onGridPoint` signals the evaluation of a single grid point, giving you access to the resulting report and any associated trades.

`onRanking` fires each time a ranking is calculated based on a specific criterion, providing the sorted reports and identifying the best result.

Finally, `onDone` is called when the entire simulation completes, providing the overall result.

## Interface ISweepBest

ISweepBest represents a single winning point determined by a specific ranking criterion during a sweep. It focuses solely on identifying the best point according to that criterion and providing a report associated with it. 

Think of it as a simple acknowledgment of "this is the best according to this rule."

The actual trades and tracking information related to this winning point aren't stored directly here; they’re found within the larger report.  The `criterion` property tells you which rule was used to select this point.  If no points met the criteria, the `report` will be null.

## Interface ISweepAbsorbedIdea

This interface represents an idea that wasn't executed because a previous trade by the same author was already occupying the trading slot. Think of it as a signal that was effectively overridden. 

Crucially, it includes the author's ID and the idea's ID, allowing for direct analysis of these rejected signals without needing to combine data from multiple sources. It’s a record of a missed opportunity due to existing holdings.

## Interface ISweep

The `ISweep` interface provides a way to execute a complete trading simulation cycle. You give it a specific asset symbol and a list of potential trading strategies or "ideas." It then systematically evaluates those ideas through several steps: first, it assesses the strategies based on predefined profiles, then filters them based on author, and subsequently evaluates them using a grid system.  Finally, it ranks the strategies to produce a comprehensive result. Think of it as a complete pipeline for testing and comparing different trading approaches.

## Interface IStrategyTickResultWaiting

This result type indicates that a scheduled signal is currently awaiting the price to reach its entry point. You'll receive this result repeatedly as the system monitors the signal. It's different from the initial "scheduled" result, which only happens when the signal is first created.

The result includes details like the signal itself, the current price being monitored, and information about the strategy, exchange, timeframe, and trading symbol involved. The take profit and stop loss percentages are always zero in this 'waiting' state.

You'll also see unrealized profit and loss (PNL) data for the theoretical, unactivated position, along with a flag indicating whether the data originates from a backtest or live trading environment. Finally, the timestamp records when the result was generated.

## Interface IStrategyTickResultScheduled

This interface represents a tick result specifically when a trading strategy generates a signal that's scheduled – meaning it's waiting for a price condition to be met before execution. Think of it as a notification that a trade idea is on hold, awaiting confirmation. 

The result includes key details like the strategy's name, the exchange being used, the timeframe of the data, and the trading symbol involved. It also records the current price at the time the signal was scheduled, and whether this event occurred during a backtest or live trading. Crucially, it carries the details of the signal itself, allowing you to understand the precise conditions that triggered it. The `action` property clearly indicates that this is a "scheduled" event, distinguishing it from other types of tick results. The `createdAt` timestamp marks the exact moment the signal was generated.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It's a notification that a signal has been successfully generated, validated, and saved.

You'll receive this notification along with details about the signal itself – including its unique ID.

The notification also includes important contextual information like the strategy name, the exchange being used, the timeframe, and the trading symbol involved.

Crucially, it provides the current price at the time the signal opened and indicates whether this event occurred during a backtest or in live trading. Finally, it gives you the timestamp of when this event occurred.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an idle state – meaning it's not currently acting on any signal. It’s used to record information about that idle period, including the strategy’s name, the exchange it’s connected to, the timeframe being used (like 1-minute or 5-minute intervals), and the trading symbol involved (like BTCUSDT). You'll find the current price during that idle time, whether the system is in backtesting mode or live trading, and a timestamp marking when that idle state was recorded. Essentially, it's a snapshot of the conditions when the strategy isn't actively trading. 

It provides a structured way to monitor when the strategy isn't actively making trades.

The `action` property confirms the idle status, and the `signal` property shows that there’s no active signal to act on at this time.


## Interface IStrategyTickResultClosed

This data structure represents the outcome when a trading signal is closed, providing a comprehensive snapshot of the event. It includes details like the reason for the closure – whether it was due to a time limit, hitting a profit or loss target, or a manual closure. You’ll find the final price at which the trade was closed, along with the profit and loss calculation, considering fees and slippage.

The information also tracks key identifiers: the strategy and exchange names, the timeframe used for the trade, and whether the event occurred during a backtest or in live trading.

Specific to user-initiated closes, a close ID is included. 
Finally, it records when the result itself was generated, linking it to either the backtest candle time or the live execution context.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trade signal is cancelled before a position is actually opened. It's essentially a notification that a planned signal didn't trigger as expected, perhaps because it was stopped early or because the signal conditions weren't met.

The information provided includes details like the specific signal that was cancelled, the current price at the time of cancellation, and the exact timestamp of the event. You'll also find information to identify the strategy, exchange, timeframe, and trading pair involved, as well as whether the event occurred during a backtest or in a live trading environment.

A key property is the `reason`, which explains why the signal was cancelled – potentially because you manually cancelled it or because some other condition was met.  The optional `cancelId` allows you to track cancelled signals associated with a specific cancellation request. Finally, a timestamp indicates when this cancellation result was generated.

## Interface IStrategyTickResultActive

This data represents a trading signal that's currently being actively monitored, waiting for a trigger like a take profit, stop loss, or time expiration. It contains a lot of information about the situation.

You'll find details about the signal itself, including its current price and the name of the strategy and exchange involved. The symbol and timeframe are also provided for clarity.

Crucially, it tracks progress toward both the take profit and stop loss, expressed as percentages.  The unrealized profit and loss (PNL) is included, accounting for fees, slippage, and partial position closures.

A flag indicates whether this data originates from a backtest or a live trading environment. A timestamp shows when the result was generated, and a separate timestamp tracks the last candle processed, useful for backtesting calculations.

## Interface IStrategySchema

This interface outlines the structure for defining a trading strategy within the backtest-kit framework. Think of it as a blueprint that tells the system how your strategy generates trading signals and how it behaves.

Each strategy needs a unique name for identification.
You can add a note to describe the strategy’s purpose for your own reference.

The `interval` property dictates how frequently the strategy can request signals, preventing it from overwhelming the system – the default is every minute.

The core of a strategy is the `getSignal` function, which takes the symbol, current date, and price to determine whether to generate a buy, sell, or hold signal.  You can even create signals that are triggered when a price target is reached.

Optional callback functions like `onOpen` and `onClose` let you execute code at specific points in the strategy’s lifecycle.

`riskName` and `riskList` properties allow you to incorporate risk management practices into your strategy.  Action identifiers can be assigned to signals generated by the strategy.

Finally, `info` provides a mechanism for attaching custom data for monitoring or connecting with external systems.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single entry used for evaluating and comparing different trading strategies. It holds the name of the strategy, a comprehensive set of backtesting statistics providing details on its performance, and the value of the metric used to rank strategies – this metric helps determine which strategy performed best. It also includes the timestamps marking the beginning and end of trading activity for each strategy, indicating when the first and last signals were generated. If a strategy didn't produce any signals, these timestamps will be null. Essentially, it’s a structured way to package everything you need to understand and compare the outcomes of different strategies.


## Interface IStrategyPnL

This interface describes the profit and loss (PNL) result for a trading strategy. It breaks down how much you've made or lost on a trade, factoring in the impact of fees and slippage – those small costs that eat into your profits. 

You'll see the profit/loss expressed as a percentage, along with the entry and exit prices adjusted to account for those fees and slippage. 

The interface also gives you the absolute dollar amount of the profit or loss, and the total amount of capital invested to make that trade. Essentially, it’s a complete picture of your trade's financial performance.


## Interface IStrategyCallbacks

This interface provides a way to hook into different stages of a trading strategy's lifecycle. Think of it as a set of event listeners that notify you when specific things happen to your signals.

You can define functions to be called on every tick (`onTick`), when a new signal is opened (`onOpen`), when a signal becomes active and is being monitored (`onActive`), when there are no active signals (`onIdle`), or when a signal is closed (`onClose`). 

There are also callbacks for scheduled signals – `onSchedule` when a scheduled signal is created, `onCancel` if a scheduled signal is cancelled, and `onSchedulePing` for periodic checks on scheduled signals. Similarly, `onActivePing` allows for custom monitoring of active pending signals.

Specific events also alert you to partial profit (`onPartialProfit`), partial loss (`onPartialLoss`), and breakeven (`onBreakeven`) scenarios. Finally, `onWrite` is used to persist signal data during backtesting. These callbacks allow you to build custom logic around your trading strategy's events, enabling features like sophisticated risk management or custom reporting.

## Interface IStrategy

This interface defines the core methods a trading strategy needs to function within the backtest-kit framework. It handles things like processing price updates (ticks), retrieving signals, checking for profit targets and stop-loss triggers, and managing the position's lifecycle.

Here's a breakdown of the key functions:

*   **`tick`**: This is the heart of the strategy. It's called with each price update, and it's responsible for checking for new signals, triggering profit targets, and adjusting stop-loss orders.
*   **`getPendingSignal` and `getScheduledSignal`**: These functions retrieve the active signals that the strategy is monitoring.
*   **`getBreakeven`**: Checks if the position has moved enough to cover transaction costs.
*   **`getStopped` and `getPaused`**: These allow external systems to control the strategy’s active state.
*   **`setPaused`**: This method allows you to pause new position openings while still monitoring existing signals.
*   A suite of functions (`getTotalPercentClosed`, `getTotalCostClosed`, `getPositionEffectivePrice`, etc.) provide deep insights into the current position – how much has been closed, the average entry price, unrealized profit/loss, and the history of trades.
*   **`backtest`**: A way to rapidly test a strategy against historical data.
*   Methods like `stopStrategy`, `cancelScheduled`, `createSignal`, `createTakeProfit`, and `breakeven` provide fine-grained control over the strategy's behavior – stopping it, cancelling scheduled orders, manually creating signals, and more.
*   The remaining methods (`validate...`, `trailing...`, etc.) are primarily for advanced use cases like setting trailing stop losses or breakeven points, and they often come with validation checks.
*   Finally, `dispose` releases resources when the strategy is no longer needed.


## Interface IStorageUtils

This interface defines the essential methods for any storage system used with the backtest-kit framework. Think of it as the common language for how the framework communicates with your storage – whether that's a database, a file, or something else entirely. 

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods allow the storage system to react to when signals enter different states within the backtest. `findById` lets you retrieve a specific signal using its unique ID, while `list` provides a way to see all the signals currently stored. 

There are also ping event handlers, `handleActivePing` and `handleSchedulePing`, which are used to update signal records to reflect recent activity; these update the `updatedAt` timestamp. If you're building a custom storage adapter, this interface is what you'll need to implement.


## Interface IStorageSignalRowScheduled

This interface represents a signal stored within the backtest-kit framework, specifically when that signal is scheduled for execution. It contains essential information about the signal’s status and the market conditions at the time of scheduling. 

The `status` property clearly indicates that the signal is in a scheduled state, signifying it’s waiting to be triggered.

Alongside this, the `currentPrice` property holds the VWAP (Volume Weighted Average Price) when the signal was originally scheduled, effectively a snapshot of the market price at that point. This value is directly linked to the `currentPrice` found within the `IStrategyTickResultScheduled` object and provides valuable context for the signal's evaluation.


## Interface IStorageSignalRowOpened

This interface represents a signal row indicating that a trade has been opened. 

It contains two pieces of essential information. The `status` property is always "opened", clearly marking the trade's state.  The `currentPrice` tells you the VWAP price at the moment the signal triggered the trade – it's the same price you'd find in the initial trade information.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning it's no longer active. It holds crucial information about that closed signal, specifically focusing on its financial performance and the circumstances of its closure. You’ll find details like the profit and loss (PNL) realized when the signal was closed, along with the final price at which it was closed. 

Furthermore, it tells you *why* the signal was closed and precisely *when* that closure occurred. This data is essential for analyzing past trading decisions and evaluating strategy performance.

Here's what each property represents:

*   **status:** Confirms the signal’s current state is 'closed'.
*   **pnl:** Shows the profit or loss generated by the signal during its active period until it closed.
*   **currentPrice:** Records the price at the exact moment the signal was closed, providing a snapshot of market conditions.
*   **closeReason:** Explains the reason behind the signal's closure, whether it was due to a target being hit, a stop-loss being triggered, or another factor.
*   **closeTimestamp:**  Records the exact time the signal was closed, allowing for precise timing analysis.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's quite simple – the `status` property is always set to "cancelled", indicating that this specific signal is no longer active or being considered. Think of it as marking a trade idea as being discarded or removed from the system. It allows you to track the lifecycle of signals, acknowledging when a signal has been terminated.

## Interface IStorageSignalRowBase

This interface defines the basic information needed to store a signal, ensuring we track when it was created and last updated. Every signal saved will have a `createdAt` timestamp, marking its initial creation time, and an `updatedAt` timestamp to show when it was last modified.  A `priority` value is also assigned, helping determine the order in which signals are processed during updates or rewrites. This priority is generated using the current date and time, guaranteeing a unique value for both live and backtesting environments.

## Interface IStateParams

The `IStateParams` interface helps you define how your signals are organized and what their starting values are. Think of it as setting up the foundation for managing data within your trading system.  You specify a `bucketName`, which acts as a label to categorize related signals – for example, grouping signals related to trades together. You also provide an `initialValue`, which is the value the signal will take on when it’s first created or when existing data is unavailable. This ensures a known starting point for your signals.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage mutable data associated with each trading signal. Think of it as a place to store information about a trade's performance over time, like its highest unrealized profit or how long it's been open. This is particularly useful for strategies that use LLMs to confirm trades and need to track metrics throughout the trade's lifetime.

This interface defines how to interact with this data. `waitForInit` sets up the initial state. `getState` lets you read the current state, but it protects against looking into the future by returning a default value if the requested time is later than the stored data. `setState` is used to update the data, allowing for resets during backtests without causing issues. Finally, `dispose` cleans up any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion. It's a way to determine how much of your capital to risk on each trade, aiming to maximize long-term growth.

The `method` property simply confirms that this is a Kelly Criterion sizing approach. The `kellyMultiplier` property lets you control the aggressiveness of the sizing; a smaller number, like the default 0.25, represents a more conservative, "quarter Kelly" approach, while a higher number risks more capital per trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. 

It's simple and straightforward – you specify a `riskPercentage`, which represents the maximum percentage of your account you’re willing to risk on a single trade. 

The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, which is the `sizingName`. You can also add a descriptive note to help document the sizing strategy with the `note` field.

To manage risk, sizing configurations specify limits on position sizes.  `maxPositionPercentage` controls the maximum percentage of your account that can be used for a single position.  `minPositionSize` and `maxPositionSize` define the absolute minimum and maximum size of a position, respectively. 

Finally, `callbacks` allows you to hook into different stages of the sizing process for more advanced customization.

## Interface ISizingSchemaATR

This schema defines how to size trades based on Average True Range (ATR), a volatility indicator. 

It's designed for strategies that want to adjust position size dynamically based on market volatility. 

The `method` property confirms that this is an ATR-based sizing approach.  You'll specify a `riskPercentage` which represents the portion of your account you’re willing to risk on each trade, typically between 0 and 100.  Finally, `atrMultiplier` controls how the ATR value is used to determine the distance of your stop-loss; a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines how to configure sizing based on the Kelly Criterion when setting up your trading strategies.

It's really about providing a way to log important information during the sizing process, using a `logger` service to help with debugging and understanding how your sizing parameters affect your trades. The `logger` property allows you to track the sizing process and troubleshoot any issues.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for determining how much of your capital to use for each trade when using a fixed percentage sizing strategy. 

It includes a `logger` property, which allows you to output debugging information to help understand how the sizing calculations are being performed. Think of the logger as a way to keep track of what's happening behind the scenes.


## Interface ISizingParamsATR

This interface defines the settings you'll use when determining position sizes based on Average True Range (ATR). 

It includes a way to specify a logger, which helps with debugging and understanding how the sizing calculations are working. Think of the logger as a way to keep track of what's happening behind the scenes. It's useful for seeing the values used in the ATR-based sizing calculations and ensuring they are behaving as expected.


## Interface ISizingCallbacks

This function lets you observe and potentially adjust how much of an asset your trading strategy buys or sells. It’s triggered immediately after the backtest kit determines the size, allowing you to inspect the size and any relevant parameters. You can use it to log the size, perform checks for unusual values, or even modify the size if needed, although that’s generally discouraged.

Similar to `onCalculate`, this callback provides another opportunity to react to the calculated position size. However, it’s called *after* any subsequent adjustments to the size. This makes it suitable for final validation or logging the definitively used size.

## Interface ISizingCalculateParamsKelly

When using the Kelly Criterion to determine your trade size, you'll provide these parameters. The `method` is always set to "kelly-criterion" to specify which sizing calculation you're using. You'll also need to provide your `winRate`, which represents the probability of a winning trade expressed as a decimal between 0 and 1. Finally, you need to provide your `winLossRatio`, representing your average profit compared to your average loss for a winning trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizing using a fixed percentage approach. It requires you to specify the method, which will always be "fixed-percentage" for this particular sizing strategy. You'll also need to provide a `priceStopLoss`, representing the price level at which your stop-loss order will be placed.  Essentially, these parameters tell the system how much of your capital to allocate and where to place the stop-loss based on a predetermined percentage and a target price.

## Interface ISizingCalculateParamsBase

This interface defines the essential information needed to determine the size of a trade. It includes the symbol of the trading pair, like "BTCUSDT," to identify the asset being traded.  It also provides the current account balance, which is crucial for calculating how much can be risked, and the intended entry price for the trade. These three pieces of data form the foundation for any sizing calculation, ensuring that trades are appropriately sized based on available resources and the planned entry point.

## Interface ISizingCalculateParamsATR

This interface defines the parameters needed for calculating trade sizes using an ATR (Average True Range) based approach. When sizing positions, you'll specify that the method used is "atr-based".  Alongside this, you'll also provide a numerical value for the ATR itself. This ATR value represents the current volatility of the asset you're trading, and it's a crucial input for determining appropriate position sizes.

## Interface ISizing

The `ISizing` interface helps determine how much of an asset to trade, essentially calculating your position size. It's a core component of the trading strategy’s execution process.

The crucial part is the `calculate` function. This function takes parameters related to your risk management setup and returns a number representing the size of the position you should take. You'll provide the data needed for risk assessment, and it will tell you how many units to trade.

## Interface ISignalRow

This `ISignalRow` interface represents a complete trading signal within the backtest-kit framework. Think of it as a single, validated instruction for a trade. Each signal has a unique ID to keep track of it and includes key details such as the cost of the trade, the entry price, and how long it’s expected to last.

It also captures important context for the trade, like which exchange and strategy generated the signal and what timeframe it applies to.  Crucially, it contains timestamps marking when the signal was created and when it went live.

Beyond the basics, the `ISignalRow` tracks partial closes (profits and losses) for accurate PNL calculation.  It also supports and manages dynamic stop-loss and take-profit prices using trailing techniques.  If you're using dollar-cost averaging (DCA), this interface holds a history of entry prices.

Finally, it records the highest and lowest prices reached during the trade's life, giving you a complete picture of its performance. This structure is essential for both analyzing historical trades and for guiding live trading strategies.

## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to combine them and delay their delivery. It's used by a utility function that allows you to request multiple signals at once, ensuring that the next signal isn't sent until a specific time interval has passed. Each signal received through this structure has a unique ID, which is a randomly generated string, making it easy to track and identify.

## Interface ISignalDto

The ISignalDto represents the data used for trading signals. It holds all the necessary information for a trade, including the ticker symbol, whether you're going long (buying) or short (selling), and a description of why you’re taking the trade.  You'll find details about the entry price, take profit and stop loss levels to manage risk and reward, along with an estimated duration for the trade. The system automatically assigns a unique ID to each signal, although you can provide one if you wish, and it handles the cost calculation to make sure everything is tracked properly. If a timeout isn’t specified, the position will remain open until a take profit or stop loss is triggered, or you manually close it.

## Interface ISignalCloseRow

This interface represents a signal event that has been closed, typically because of a user action. It builds upon the standard signal data by adding information specific to the closing of the signal. Primarily, it includes a `closeId` which uniquely identifies the closure event and a `closeNote` field to allow for adding user-provided details about why the signal was closed. These fields are only used when a signal is manually closed.

## Interface ISessionInstance

This interface helps manage temporary data associated with each trading decision – think of it as a shared workspace. It's designed to hold things like cached information, indicator calculations, or results from AI models, ensuring they're accessible during a single trading run. 

Each trading decision (based on a symbol, strategy, exchange, and timeframe) gets its own session instance. 

The `waitForInit` method is used to get the session ready to go. `setData` lets you store new information with a specific timestamp, while `getData` retrieves that information based on a timestamp – it avoids looking into the future.  Finally, `dispose` cleans up when the session is no longer needed, freeing up any resources.

## Interface IScheduledSignalRow

This interface describes a signal that’s scheduled to execute when a specific price is hit. Think of it as a signal with a built-in price condition – it won't trigger until the market reaches a particular price level. It’s related to regular signals, but with an extra delay based on waiting for that target price.  Initially, it tracks when it *should* have become active, and then later updates to reflect the actual time it waited before activating.  The `priceOpen` property simply defines the price level that needs to be reached before the signal is activated.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might be canceled by the user. It builds upon the standard scheduled signal information and adds details specific to cancellations. If a user cancels a scheduled signal, this interface holds the unique ID of that cancellation, along with any notes the user provided when initiating the cancellation. Think of it as a way to track *why* a signal was taken off the schedule.

## Interface IScheduledSignalActivateRow

This interface describes a signal that’s been scheduled, and crucially, indicates whether it was activated by the system or initiated by a user. It builds upon the basic scheduled signal information by adding details relevant to user actions. The `activateId` property holds a unique identifier specifically for when a user manually triggers the signal. Alongside this, `activateNote` allows for adding a brief explanation or comment from the user's request, providing context for the activation.

## Interface IRuntimeRange

IRuntimeRange helps define the period you're testing your trading strategy over. Think of it as setting the start and end dates for your backtest. It has two key parts: `from` which specifies the beginning date of your testing period, and `to` which marks the end date. Essentially, it allows you to clearly define the timeframe your strategy will be evaluated against.

## Interface IRuntimeInfo

This interface provides essential details about the environment your trading strategy is operating in. You’ll find information like the trading symbol being used, such as "BTCUSDT." It also tells you the timeframe for a backtest if you're analyzing historical data; otherwise, it indicates you're running in live mode.

Strategies can pass along custom data through the `info` property, allowing you to track specific metrics or tailor your reporting. The `context` property gives you details on the exchange, strategy, and frame being used.

You'll also have access to the exact timestamp (`when`) and the current market price (`currentPrice`) at each point in time. Finally, a simple `backtest` flag tells you if the strategy is running a backtest or live.


## Interface IRunContext

The `IRunContext` object is like a central hub of information needed when running parts of your trading strategy code. It bundles together two key pieces: details about your trading setup, like which exchange and strategy you’re using, and real-time data, such as the symbol being traded and the current timestamp. Think of it as a way to pass everything a function needs at once, instead of lots of separate pieces – the framework then handles distributing that information to the relevant services for use.

## Interface IRiskValidationPayload

This data structure holds the information needed to evaluate risk during trading. It builds upon the existing risk check arguments and adds details about your portfolio's current state. You'll find the current trading signal being considered, represented as an `IRiskSignalRow` which contains information like the opening price.

It also provides a count of the total number of open positions and a list of those positions themselves, giving you a clear view of what's currently held in the portfolio. These details are crucial for making informed risk-based decisions.

## Interface IRiskValidationFn

This function is your gatekeeper for ensuring trading decisions are safe and reasonable. It's designed to check if a proposed trade aligns with pre-defined risk parameters. If the trade is acceptable, the function simply lets it proceed. However, if the trade violates your rules – for example, exceeding position limits or margin requirements – the function will signal a rejection, providing details about why the trade was blocked. It’s flexible; you can choose to return a specific rejection object or even throw an error, both of which will be handled to provide clear feedback.

## Interface IRiskValidation

This section defines how to set up checks to ensure your trading strategies are behaving as expected. Think of it as putting guardrails on your automated trading.

You define these checks using a `validate` function, which is the core of the process – it's the logic that actually assesses the risk parameters. 

Alongside the validation logic, you can include a `note` to explain why the validation exists and what it's intended to accomplish. This documentation makes your system much easier to understand and maintain.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading. It builds upon existing signal data by adding crucial details like the entry price (`priceOpen`) and the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels.  Think of it as providing extra information needed to validate and monitor the risk associated with a trade, specifically the original parameters set when the signal was created. These details ensure we're tracking how the trade's risk profile has evolved.

## Interface IRiskSchema

The IRiskSchema is your way to set up and manage risk controls for your portfolio. Think of it as defining rules to keep your trading strategy safe and aligned with your goals. Each risk schema has a unique name, and you can add a note to help yourself or others understand its purpose. 

You can also specify callbacks that trigger at key moments, like when a trade is rejected or approved. Most importantly, it's the validations array that lets you define the actual risk-checking logic – essentially, the custom rules your portfolio will follow. These validations can be individual functions or pre-defined configurations.


## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides information to help you understand why the validation failed. Each rejection has a unique identifier (`id`) so you can track specific issues.  A helpful explanation (`note`) is also included, detailing the reason for the rejection in plain language.

## Interface IRiskParams

This interface defines the settings you provide when setting up a risk management system. It includes essential details like the exchange you're trading on (like "binance") and a way to log important information for debugging. You also need to supply a service that handles time, ensuring accurate and unbiased calculations, especially during backtesting. 

Crucially, you'll specify whether you're in backtest mode or live trading mode. Finally, a special callback function lets you react when a trade signal is blocked due to risk constraints, allowing for custom actions or notifications before the system officially records the rejection.


## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple things are happening at once. Specifically, the `reserve` property is important if you're worried about race conditions. Setting `reserve` to `true` makes sure that when a risk check happens, a temporary marker is created in the system's record of open positions. This temporary marker ensures that other checks immediately see the updated position size before any further actions take place, preventing potential conflicts or errors due to timing.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to perform a risk check before a trading signal is created. Think of it as a validation step – it ensures the conditions are right to open a new position. It contains details like the trading pair's symbol, the signal being considered, the name of the strategy making the request, and information about the exchange and risk profile in use. You'll also find the current price and a timestamp for context. Essentially, it’s a snapshot of the trading environment at the moment a potential trade is being evaluated.

## Interface IRiskCallbacks

This section describes callbacks you can use to monitor and react to risk assessments during trading. Think of them as notification systems—you can use them to log events, trigger alerts, or perform other actions when a trade is either blocked or approved based on risk rules. `onRejected` gets called when a trade is blocked due to risk limits, letting you know a trade didn’t pass the checks. Conversely, `onAllowed` is triggered when a trade successfully clears all risk assessments, signaling that it's approved for execution.


## Interface IRiskActivePosition

This interface describes a single, active trade being managed. Think of it as a snapshot of a position you hold - whether it's a long (buying) or short (selling) trade. It contains key details about the trade, including the strategy that initiated it, the exchange where it's placed, the specific trading pair (like BTCUSDT), and the prices involved. You’ll find the entry price, stop-loss order, take-profit order, and when the position was opened, all captured here. The estimated holding time is also included, giving you an idea of how long the position is expected to last.

## Interface IRisk

This interface manages risk controls for trading signals and keeps track of open positions. The `checkSignal` method determines if a trading signal is permissible based on predefined risk boundaries. A safer option, `checkSignalAndReserve`, not only validates a signal but also immediately sets aside a placeholder in the system’s position tracker, preventing conflicts when multiple strategies are running concurrently. This prevents situations where signals exceed limits due to timing issues between checking and implementing them. 

The `addSignal` method officially records a newly opened position within the system. Conversely, `removeSignal` is used to clean up and remove a position once it's closed, ensuring the system accurately reflects the current risk exposure. It’s very important to always balance `checkSignalAndReserve` with either `addSignal` or `removeSignal` to maintain an accurate risk profile.

## Interface IReportTarget

This interface lets you finely control which aspects of your trading simulation are logged as JSONL events. Think of it as a set of switches; you can turn on or off logging for specific things like strategy actions, risk rejections, breakeven points, partial order closures, performance metrics, scheduled signals, and more. By selectively enabling these options, you'll generate more focused reports and keep your logging output manageable. You can choose to focus on strategy performance, monitor risk events, track milestones like highest profit and maximum drawdown, or get a complete picture of live trading events.

## Interface IReportDumpOptions

This defines the information needed when saving reports of your backtest results. Think of it as a way to organize and label your backtesting data, so you can easily find and understand it later. You specify things like the trading pair (like BTCUSDT), the name of the strategy you're testing, which exchange you used, the timeframe (like 1 minute or 1 hour), a unique ID for the trading signal, and the name of the optimization walker if one was used.  Providing these details helps keep your reports structured and makes it much easier to compare different backtesting runs.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. Think of it as a blueprint for keeping track of the most up-to-date signals generated by your trading strategies.

The `handleActivePing` method is used to record new signals as they come in.

`getLatestSignal` lets you fetch the most recent signal for a specific trading setup (symbol, strategy, exchange, timeframe, and whether it's a backtest). It’s designed to prevent look-ahead bias by only returning signals that existed *before* the time you're querying.

Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the last signal for a given setup was generated, essentially telling you how fresh the information is.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, helps you understand what's happening with a trading signal from its very beginning. It expands on the basic signal information to show you the original stop-loss and take-profit prices that were set when the signal was first created. This is important because even if those prices change later on due to trailing stops, you'll always know what the initial plan was.

It provides key details about your position, including the cost of getting in, how much of the position has been closed partially, and the total number of entries or partial closes. You'll also find information about the original entry price (which isn’t affected by averaging), as well as the unrealized profit, peak profit, and maximum drawdown the position has seen. All this data gives you a clear picture of the signal's performance and how it's evolved over time.

## Interface IPublicCandleData

This interface describes the basic structure of candlestick data used throughout the backtest-kit framework. Each candle represents a specific time interval and contains key information about the trading activity during that period. You’ll find properties like the timestamp marking when the candle began, the opening price, the highest and lowest prices reached, the closing price, and the total trading volume. Think of it as a snapshot of price and volume action over a set time.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you’ll use when calculating position sizes based on the Kelly Criterion. It's all about understanding how often your trades win and how much you typically make on a win versus lose on a loss.

Specifically, you’ll provide a `winRate`, which is a number between 0 and 1 representing the percentage of winning trades.  You’ll also give a `winLossRatio`, which is the average amount you win for every dollar you lose. These two values together help determine an appropriate bet size to maximize long-term growth.


## Interface IPositionSizeFixedPercentageParams

This defines the settings you need when using a trading strategy that sizes positions based on a fixed percentage of your available capital. Specifically, you'll find a property for setting the stop-loss price – the price at which your trade will automatically close to limit potential losses. This setting is crucial for managing risk within your strategy.

## Interface IPositionSizeATRParams

This parameter defines how much the Average True Range (ATR) influences your position sizing. 

Specifically, the `atr` property represents the current ATR value, which is a measure of price volatility. 

A higher ATR suggests greater volatility, potentially leading to smaller position sizes to manage risk.

## Interface IPositionOverlapLadder

This interface defines how to set up a safety zone around your dollar-cost averaging (DCA) levels to prevent unwanted overlap. Think of it as creating a buffer around each buy-in price.

You control this buffer with two percentages: `upperPercent` and `lowerPercent`. 

`upperPercent` tells the system how much above each DCA level is considered too close and should be flagged as an overlap. `lowerPercent` does the same, but for prices below the DCA level. By adjusting these percentages, you fine-tune the sensitivity of the overlap detection.

## Interface IPersistStrategyInstance

This interface helps you customize how your trading strategies save and load their data. Think of it as a way to manage the information related to a specific strategy running on a particular asset and exchange. 

If you want to store strategy data in a database instead of files, you would implement this interface.

Here's what the methods do:

*   `waitForInit`:  This is called when the system is setting up, to prepare the storage location for the strategy's data. You tell it whether initial data is available.
*   `readStrategyData`:  This retrieves the saved data for the strategy.
*   `writeStrategyData`: This saves the current state of the strategy, allowing you to preserve progress or important settings. You can even clear the data by passing `null`.

## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded for backtesting or live trading. Think of it as a way to replace the default file storage with something else, like a database or an in-memory solution. 

It handles storing signals separately for backtesting and live trading, ensuring each has its own set of data. When reading data, it finds all stored signals and puts them into a list.

To use it, you’ll provide methods to initialize the storage, read all the stored signals, and write new signals to it, ensuring each signal is associated with a unique ID.

## Interface IPersistStateInstance

This interface defines how to manage persistent state for trading strategies, specifically when dealing with a unique combination of a signal and a bucket name. Think of it as a way to save and load data related to a particular trading situation, ensuring your strategy remembers its progress even if something unexpected happens.

If you're building a custom solution to handle state persistence (instead of using the default file storage), you’ll need to implement this interface. It provides methods to initialize the storage, retrieve existing data, save updated data along with a timestamp, and release any resources used. The `waitForInit` method sets up the storage, `readStateData` loads previously saved information, `writeStateData` updates the stored data, and `dispose` cleans up when the storage is no longer needed.

## Interface IPersistSignalInstance

This interface defines how a trading strategy's signals are saved and loaded for a specific combination of symbol, strategy name, and exchange. It allows you to customize how that data is stored – instead of the default file-based approach.

If you want to use a different storage method, like a database, you'll create a class that implements this interface.

The `waitForInit` method is used to set up the storage when it's needed. `readSignalData` retrieves previously saved signal information. Finally, `writeSignalData` saves the current signal data, and you can even clear the data by passing `null` as the signal row.

## Interface IPersistSessionInstance

This interface helps keep track of session information specifically for a particular trading strategy, exchange, and frame—think of it as a dedicated notebook for each unique combination. It's designed to ensure that even if something goes wrong, your session data isn't lost.

If you need more control over how this data is stored (maybe you don’t want to use files), you can create your own adapter that follows this interface.

The `waitForInit` method sets things up before any data is used.  `readSessionData` retrieves previously saved information. `writeSessionData` saves new or updated data, along with a timestamp. Finally, `dispose` releases any resources held by the storage mechanism, although this might not always do anything special by default.

## Interface IPersistScheduleInstance

This interface allows you to customize how trading signals are saved and loaded for a specific combination of a trading symbol, strategy name, and exchange. Think of it as a way to control where and how the backtest-kit keeps track of the signals generated by your strategies. 

If you want to avoid using the default file storage, or need to integrate with a database or other system, you can build a class that implements this interface. 

The `waitForInit` method lets you set up your storage when needed. `readScheduleData` is used to retrieve previously saved signals, and `writeScheduleData` is how you store new signals, or clear out old ones.


## Interface IPersistRiskInstance

This interface lets you customize how your trading backtests store information about risk positions. Think of it as a way to manage the data about how much risk you're taking at any given time, specifically tied to a combination of a risk name and an exchange.

If you need to save this risk data somewhere other than the default file system, like a database, you can build a solution that follows this interface.

The `waitForInit` method handles getting things set up initially for a particular risk context.

`readPositionData` fetches the saved risk positions for a specific point in time.  This allows you to load the risk profile from a previous point in the backtest.

Finally, `writePositionData` is used to save the current risk positions, preserving the state for later loading and analysis.


## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent trading signal for a specific setup. Think of it as a way to remember the last signal generated for a particular symbol, strategy, exchange, and timeframe, ensuring that backtests and live trading use consistent signal information. 

If you want to customize how this recent signal data is saved (perhaps to a database instead of a file), you can create your own adapter that implements this interface. 

The `waitForInit` method sets up the storage area. `readRecentData` retrieves the last saved signal. And `writeRecentData` is used to save the current signal, along with the timestamp of when it was generated.


## Interface IPersistPartialInstance

This interface helps manage how partial profit and loss information is saved and retrieved, specifically for a unique combination of trading symbol, strategy name, and exchange. Think of it as a way to keep track of how a trading strategy is performing in small increments.

Each piece of this partial data is stored separately, identified by a unique signal ID, ensuring everything is organized.

If you want to customize how this information is stored – perhaps using a database instead of a file – you can build your own adapter that follows this interface.

The `waitForInit` method prepares the storage space when needed.

`readPartialData` is how you get previously saved partial data for a particular signal.

`writePartialData` saves the current state of a signal's partial data.

## Interface IPersistNotificationInstance

This interface allows you to customize how notifications are saved and loaded for either backtesting or live trading. Think of it as a way to swap out the default file storage with your own solution, like a database or in-memory cache.

The `waitForInit` method is called to get things set up before notifications start flowing.

`readNotificationData` fetches all previously stored notifications, bringing them back into the system.

Finally, `writeNotificationData` is used to save new notifications or update existing ones – essentially, it's how you persist that notification data. Notifications are uniquely identified so you can track them individually.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area of your backtesting environment. Think of it as a way to customize where and how information related to your trading strategies is saved.

It allows for a "soft delete" feature, where you can mark data as removed without actually deleting it from storage—useful for maintaining historical records or debugging.

The `waitForInit` method prepares the storage area when needed.  `readMemoryData` retrieves individual memory entries, while `hasMemoryData` quickly checks if an entry exists.  `writeMemoryData` creates or updates entries, and `removeMemoryData` performs the soft delete. `listMemoryData` provides a way to access all the currently active memory entries, which is handy for rebuilding data structures. Finally, `dispose` handles releasing any resources that the storage system is using.  If you want to use a different storage method than the default file-based system, you'll implement this interface.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for each trading bucket. Think of it as a way to keep your backtesting framework from repeatedly hitting external APIs.

It allows for a flexible way to customize how this cached data is managed, beyond just using files.

You can even "soft delete" entries, meaning they remain on disk but are ignored when you’re reading data. This helps with cleanup and potentially recovering from errors.

The `waitForInit` method prepares the storage for a bucket, `readMeasureData` retrieves existing data, `writeMeasureData` saves new data, `removeMeasureData` performs a soft delete, and `listMeasureData` gives you a way to see all the cached keys currently in use.

## Interface IPersistLogInstance

This interface defines how to manage the global log storage used by backtest-kit. Think of it as a way to customize where and how the framework stores its log entries, moving beyond the default file-based approach.

The `waitForInit` method allows you to signal when the log storage is ready to be used. 

`readLogData` retrieves all the currently stored log entries – it essentially reads the entire history.

`writeLogData` is responsible for saving new log entries, ensuring that no entries with existing IDs are added to prevent overwriting. The storage acts as an append-only log.

## Interface IPersistIntervalInstance

This interface lets you customize how the backtest-kit framework remembers which intervals have already run for a specific time bucket. Think of it as a way to track which signals have already been triggered.

If you want to store this information in a database instead of files, or need some other custom persistence method, you can implement this interface.

The `waitForInit` method is called to set up the storage for a bucket, while `readIntervalData` retrieves existing interval markers. `writeIntervalData` saves a new marker, and `removeIntervalData` essentially "unsets" a marker, allowing the interval to fire again. Finally, `listIntervalData` provides a way to get a list of all the interval markers that haven't been removed. 






## Interface IPersistCandleInstance

This interface defines how your backtesting system can store and retrieve candle data for a specific trading symbol, time interval, and exchange. Think of it as a way to save the historical price data your backtest needs, so you don't have to download it every time.

The system provides a way to initialize the storage space for your candle data.

When you need to fetch historical data, the `readCandlesData` method lets you request a range of candles; if even one candle is missing, it will return null to signal a cache miss and that new data needs to be fetched.

The `writeCandlesData` method allows you to save new candles into this storage. It’s recommended to be careful about saving incomplete candles or overwriting existing data. 

If you want to use a different method of storing your candle data, you can create a custom adapter that implements this interface.

## Interface IPersistBreakevenInstance

This interface allows you to manage and save information about when a trade will break even, but specifically for a particular trading setup—think of it as relating to a single symbol, strategy, and exchange. It's like having a little notebook for each unique trading scenario where you want to track break-even points.

Each signal, or trading opportunity, gets its own entry in this notebook.

If you want to use a different way of storing this break-even data (instead of the default method), you can create your own system that follows this interface.

Here's what you can do with this interface:

*   `waitForInit`:  It lets you set up the storage area for your trading context, preparing it for use.
*   `readBreakevenData`: Allows you to retrieve previously saved break-even data for a specific signal and a certain point in time.
*   `writeBreakevenData`:  Lets you save the break-even information for a signal.

## Interface IPersistBase

This interface provides the basic building blocks for how your custom storage solutions interact with the backtest-kit framework. Think of it as a contract that defines the essential actions – reading, writing, checking for existence, and listing – needed to manage your data persistently. 

It ensures that any system you build to store and retrieve your data adheres to a common structure.

Here’s a breakdown of what it does:

*   **waitForInit:** This method handles initial setup, like creating the storage directory and verifying that all necessary files are present. It runs only once.
*   **readValue:** Retrieves a specific data item (an 'entity') based on its unique identifier.
*   **hasValue:**  Simply checks to see if a data item with a specific identifier already exists.
*   **writeValue:**  Saves a data item to storage, making sure the process is reliable and complete.
*   **keys:**  Provides a way to get a list of all available identifiers, presented in sorted order. This is useful for verifying the integrity of your data.

## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit on a trade. 

Think of it as a row in a queue, telling the backtest system to close a portion of the current position.

It includes the type of action ("partial-profit"), the percentage of the position to close (like 50% or 25%), and the price at which the partial profit was actually executed. This price is useful for verifying calculations and understanding the trade's outcome.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, essentially selling a portion of it. 

It contains information about the action being taken, which is a partial loss, the percentage of the position that needs to be closed, and the price at which that partial closure occurred. 

Think of it as a record of a specific, smaller sell order executed within a larger trading strategy.


## Interface IPartialData

IPartialData holds a snapshot of important trading data for a specific signal, designed to be easily saved and restored. It's like taking a picture of where a trade has been – capturing the profit and loss levels it has encountered. 

Think of it as a simplified version of the full trading state. 

The `profitLevels` property holds an array detailing the points where profits have been achieved, and `lossLevels` stores similar information for losses. These are essentially lists of levels recorded during trading, ready to be preserved and used later.


## Interface IPartial

The `IPartial` interface is all about keeping track of how your trading signals are performing, specifically their profit and loss. It’s used by components like `ClientPartial` and `PartialConnectionService` to monitor signals.

When a signal is making money, the `profit` method gets called and it figures out if milestones like 10%, 20%, or 30% profit have been reached. It makes sure you only get notified about new milestones, avoiding duplicate notifications.

Similarly, the `loss` method handles situations where a signal is losing money, again tracking milestones like 10%, 20%, or 30% loss.

Finally, when a signal completes – whether it hits a take profit, stop loss, or expires – the `clear` method steps in. It cleans up the signal's data, saves changes, and releases memory.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. It takes your initial input parameters and adds flags related to the trading mode you've selected. Specifically, it tells you whether the system is set to backtest (simulating trading on historical data), paper trade (simulated trading using live market data), or live trade (actual trading with real funds). This makes it easy to understand what environment your trading system is operating in.

## Interface IParseArgsParams

The `IParseArgsParams` interface helps define what information is needed to run a backtest. Think of it as a container for all the essential details about the trading simulation. It holds things like the trading pair you're interested in (like "BTCUSDT"), the specific trading strategy you want to test, the exchange you're connecting to (such as "binance"), and the timeframe for the historical data – whether you’re looking at hourly candles, fifteen-minute intervals, or daily summaries. Providing these values allows the system to set up and execute the backtest correctly.


## Interface IOrderBookData

This interface defines the structure of order book data, which represents the current state of buy and sell orders for a specific trading pair.

It includes the `symbol` representing the trading pair (like BTCUSDT), as well as arrays of `bids` and `asks`.

The `bids` array holds information about orders to buy the asset, while the `asks` array contains information about orders to sell the asset. Each bid and ask is represented by the `IBidData` interface.

## Interface INotificationUtils

This interface defines the core functions that any notification system used by the backtest-kit framework must provide. Think of it as a contract—if a notification system wants to work with backtest-kit, it needs to implement these methods. These methods handle various events that occur during a backtest, such as when a trade is opened or closed, partial profits or losses are reached, or if there’s an issue with an order.

It also includes methods for dealing with order-related events like rejections, confirmations, and status updates. You can retrieve a history of all notifications that have been processed, and there's also a way to clear that history when you're finished.  Essentially, it's about ensuring that your system can be informed and react to everything happening in your backtest.


## Interface INotificationTarget

This interface lets you finely control which notifications your strategy receives during a backtest or live trade. Think of it as a way to subscribe only to the alerts that are truly important to you. By default, you'll get *every* notification, but using this interface allows you to filter out the noise and focus on what matters most.

You can choose to listen for events related to signal creation and closing, partial profit/loss levels, breakeven points, strategy actions, order synchronization, order checks, or even risk management and errors. It helps you keep your code clean and efficient by avoiding unnecessary processing of notifications you don't need. Each property represents a specific category of notification, so setting it to `true` means you’ll receive those alerts.

## Interface IMethodContext

The `IMethodContext` object acts as a little guide for your backtesting processes. It holds the names of the specific strategy, exchange, and frame being used. Think of it as a set of labels that help the backtest-kit framework know exactly which components to load and use for a particular simulation or live trading scenario.  The `frameName` is often empty when you're running in live mode. It's automatically passed around within the system to ensure everything works together seamlessly.


## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how memory management components should work within the backtest-kit framework. It’s the common blueprint for different ways of storing and retrieving trading data, whether that’s locally, persistently, or as temporary placeholder data.

The `waitForInit` method is used to set up the memory instance when it’s first created.

`writeMemory` allows you to store new data points, associating them with a unique identifier, a description, and a timestamp.

`searchMemory` helps you find data based on keywords, ranking results by relevance and considering the timestamp to ensure you only see relevant entries.

`listMemory` lets you retrieve all stored data points up to a specific time.

`removeMemory` allows you to delete specific data entries.

`readMemory` is used to get a single data entry by its identifier, also respecting the timestamp limitations.

Finally, `dispose` provides a way to clean up any resources used by the memory instance.

## Interface IMarkdownTarget

This interface lets you fine-tune which detailed reports the backtest-kit framework generates. You can choose to see reports focused on strategy signals, risk management, breakeven points, partial profits, portfolio heatmaps, strategy optimization, performance bottlenecks, signal scheduling, live trading events, complete backtest results, signal lifecycle, or milestone achievements like highest profit and maximum drawdown. By adjusting the boolean values for each of these categories, you control the level of detail included in your analysis and can focus on the areas most important to your trading.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps you specify exactly what information you want to extract and organize when generating reports or documentation. Think of it as a set of instructions for filtering and presenting your backtest data. 

It allows you to target specific files, directories, and trading symbols. You can use it to pinpoint a particular strategy's performance, or a signal's impact on a certain timeframe. The `path` and `file` properties control where the information is located, while properties like `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId` let you narrow down the data to the precise details you need.

## Interface IMCPTextMessage

This represents a simple text message used within the Model Context Protocol (MCP). Every message has a unique ID to help keep track of it, and it’s clearly marked as a "text" message type. The core of the message is the `text` property, which holds the actual human-readable content being sent.

## Interface IMCPSignalNotifyCommand

This command is used to send out informational notifications related to active trades. It's specifically used within the Model Context Protocol (MCP) system. 

When a trading symbol that's enabled for live trading has a pending signal, this command sends out a notification containing a note that provides extra information. The system identifies the specific signal based on the trading symbol. 

The notification includes the symbol being traded (like "BTCUSDT"), the name of the MCP schema that initiated the notification, and a human-readable note to explain what’s happening.

## Interface IMCPSchema

The `IMCPSchema` defines how a strategy connects to the backtest system, allowing external agents to interact with it. Think of it as a registration form that links a unique name (mcpName) to a specific strategy. 

If multiple strategies are registered, you *must* specify which strategy the schema applies to, preventing confusion. It also lets you set a custom entry cost for trades and define how long you estimate a position will hold (minuteEstimatedTime). 

You can precisely control which actions an external agent is allowed to perform on the strategy using permissions. The system provides a default set of permissions, but you can narrow them down to restrict access.

Finally, the schema can include a function (getMessages) to format portfolio data into messages for the agent, and provides optional lifecycle callbacks that can be used to react to specific events. Essentially, it's a way to build a structured and secure link between a trading strategy and its external environment.

## Interface IMCPPositionOpenCommand

This command is used to initiate a new trading position, specifically a "moonbag" style, within the backtest-kit framework. A moonbag position utilizes a fixed take-profit level and a hard stop-loss, offering a structured risk management approach.

It requires several pieces of information to execute:

*   The `symbol` specifies which trading pair is involved, like "BTCUSDT."
*   The `position` defines whether you're going long (buying) or short (selling).
*   The `mcpName` identifies the underlying strategy or system generating this command.
*   Finally, a `note` allows for adding a description, giving context or explaining the reasoning behind the trade – this is helpful for tracking and analysis.

## Interface IMCPPositionCloseCommand

This interface defines the data needed to close an existing trading position. 

It’s used when a strategy wants to finalize a trade and officially close out a position for a specific trading pair, like Bitcoin against USDT (BTCUSDT).

To execute this, you need to specify which strategy's model context protocol, or MCP, is initiating the closing command, and provide a note explaining why the position is being closed – this helps with tracking and understanding the trading activity.

## Interface IMCPImageMessage

This represents an image message used within the Model Context Protocol, often for things like displaying rendered charts or visuals. Each image message has a unique ID to keep track of it and ensure it’s delivered correctly. 

It also includes the image's MIME type, which tells the receiving end how to interpret the data. Finally, the actual image data is stored as a base64 encoded string, ready to be decoded and displayed.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your portfolio's holdings for each symbol your trading strategy is involved with. Think of it as a record of what you own at a specific point in time. This object is passed to your strategy's message handling function, allowing it to react to events based on the current portfolio state. Each strategy instance within your backtest receives its own dedicated `IMCPContext` to ensure accurate and isolated decision-making.

## Interface IMCPCallbacks

This section describes optional lifecycle callbacks you can use with the Model Context Protocol (MCP). These callbacks give you a way to observe what actions the MCP is taking—like updating portfolio snapshots, opening or closing positions, or submitting signals—without directly interfering with the system. They provide raw data related to the actions taken.

If you don't include a particular callback, it simply won’t be triggered. If a callback encounters an error, it will be logged but won't halt the overall process.

Here’s a breakdown of each callback:

*   **onStatus:** This callback is triggered after the `getStatus` function generates a portfolio snapshot.  It provides the snapshot data and any associated messages.

*   **onPositionOpen:**  This callback is called after a position opening command is successfully accepted.  You'll receive the signal data (DTO) used for the order, including stop-loss and take-profit levels, cost, and any notes.

*   **onPositionClose:** This callback is triggered when a position closing command is accepted. It provides the signal ID that initially prompted the closure.

*   **onAverageBuy:**  This callback is fired after a DCA (Dollar-Cost Averaging) entry order is accepted. It gives you the signal ID the new entry was averaged into.

*   **onSignalNotify:** This callback is triggered when a signal notification (like a note or comment) is sent.  You will receive the signal ID the notification is associated with.

## Interface IMCPAverageBuyCommand

This command tells the trading system to add a small purchase of an asset to an existing, open trade. Think of it as a way to gradually build up a position, instead of buying everything at once. 

It's specifically used within the Model Context Protocol (MCP) system, which helps manage different trading strategies. The command includes the symbol of the asset being traded (like "BTCUSDT") and identifies which specific strategy is making the request (the `mcpName`). The system will then automatically determine how much to buy and add it to the ongoing trade, based on the strategy's settings.


## Interface ILogger

The `ILogger` interface is designed to help you keep track of what's happening within your trading system. It gives you tools to record different types of messages, from general events to very specific debugging information.

You can use the `log` method for important things, like when an agent starts or finishes running.

The `debug` method is for incredibly detailed info you'll only need when you're actively troubleshooting, like steps in a process.

`info` is perfect for summarizing key actions – successful validations or history updates, for example.

And `warn` is for those moments when something isn't quite right, but it's not a critical error stopping the system. 

Essentially, `ILogger` helps you monitor and understand the lifecycle, activities, and potential issues of your trading system.

## Interface ILogEntry

This interface defines the structure of a single log entry that's recorded during a backtest. Each log entry has a unique identifier, a level (like "log", "debug", or "warn") to indicate its importance, and a timestamp to track when it occurred.

It also includes information about the context in which the log was generated, like the method that created it and the execution environment.  You'll find arguments provided with the log call as well, allowing for richer debugging and analysis. Essentially, it's a comprehensive record of what happened during the backtest process, making it easier to understand and troubleshoot.

## Interface ILog

This interface lets you work with log entries from your backtesting environment, giving you access to a full history of what happened during the simulation. It builds on the standard logging features and integrates with AI agent logging. The `getList` method is the key here – it retrieves all the log entries you've collected, letting you analyze what occurred and debug any issues. You can then process this list to understand the sequence of events during your backtest.

## Interface IHeatmapRow

This interface describes the data you'll see in a heatmap representing the performance of a trading strategy for a specific asset, like BTCUSDT. It bundles a wide range of statistics, from simple counts like total trades and win/loss records to more complex measures like Sharpe Ratio and Calmar Ratio.

You'll find details about profitability (totalPnl, avgPnl), risk (maxDrawdown, stdDev), and trading behavior (winRate, avgWin/Loss durations, trade frequency).

The data also includes insights into the consistency and reliability of the strategy, with metrics like expectancy, trend analysis (trendStrength, trendConfidence), and measures of market pressure (buyerPressure, sellerStrength).  Several metrics like medianPnl and medianStepSize help to understand the distribution of trade results beyond simple averages, providing a more robust picture of strategy performance. Ultimately, each property aims to paint a complete picture of how a strategy performed on a given asset.

## Interface IFrameSchema

This defines a blueprint for how your backtesting data is structured, specifically organizing it into time frames. Think of a frame as a chunk of your historical data, like a 1-minute or 1-day period.

Each frame has a unique name to identify it, and you can add a note for your own records. The `interval` specifies how frequently data points are generated within that frame – it's often something like "1m" for one-minute intervals. 

You set the `startDate` and `endDate` to clearly define the backtesting period this frame covers. Finally, you can attach optional callbacks to trigger custom actions at different points in the frame's lifecycle, providing more control over your backtest.

## Interface IFrameParams

The `IFrameParams` object holds the essential information needed to set up a frame within the backtest-kit trading framework. Think of it as the configuration details for a specific, isolated period of your backtest. It includes a `logger`, which is a tool for tracking and debugging what's happening inside the frame – useful for spotting errors or understanding the flow of events.  You'll also define an `interval`, which is essentially a descriptive name for that frame, allowing you to easily identify it during the backtest process.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface provides a way to react to significant events happening during the timeframe generation process within the backtest-kit. You can use it to monitor what timeframes are being created, and confirm they look right. Specifically, the `onTimeframe` function will be triggered after a set of timeframes are generated, giving you access to the timeframe array, the start and end dates for those timeframes, and the interval used to create them. This lets you log details or check for any unexpected behavior in the timeframe generation.

## Interface IFrame

The `IFrame` interface helps manage the timeline of your backtest. It's a core piece that handles generating the dates and times your trading simulations will run on.

Specifically, the `getTimeframe` function is your key interaction point. You give it a trading symbol (like "BTCUSDT") and a frame name (think of it as a timeframe label like "1h" or "1d"), and it returns an array of dates. These dates represent the points in time your backtest will evaluate trades. The spacing between these dates is determined by the backtest's configured interval.

## Interface IExecutionContext

The `IExecutionContext` object is essentially the information your trading strategies and exchange interactions need to know about what's happening right now. 

Think of it as a shared set of details passed around to keep everything synchronized.

It includes the trading symbol, like "BTCUSDT," to tell you what asset you're dealing with, and the current timestamp so you know exactly when an event occurred. Importantly, it also indicates whether the system is in backtest mode—simulating past data—or live mode—actually trading.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint that tells the framework where to get historical price data (candles), how to format order quantities and prices to match the exchange's rules, and whether to fetch order books or trade history. Each exchange you want to backtest needs its own schema.

The `exchangeName` is a unique identifier for the exchange, like its nickname within the framework. You can add a `note` for your own records or future reference.

The core function, `getCandles`, is responsible for retrieving historical price data. It needs the trading pair (symbol), time interval, a starting date, how many candles to retrieve, and whether it's a backtest. 

`formatQuantity` and `formatPrice` handle the complexities of different exchanges’ rules around how much you can trade and how precisely prices are displayed.  If you don't specify them, the framework uses Bitcoin-like precision.

`getOrderBook` and `getAggregatedTrades` are optional, allowing you to fetch order book data or aggregated trade history if you need more detailed information. If these aren't provided, the framework will let you know you need to implement them.

Finally, `callbacks` lets you define functions that get triggered during certain events, like when candle data is received.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as the blueprint for how the backtest understands and communicates with a specific exchange.

It requires you to provide several key functions, which act as bridges to the exchange's data and functionality.

Specifically, you'll need to provide ways to:

*   Retrieve historical candle data (OHLCV) for a given trading pair and timeframe.
*   Convert quantity values into the format expected by the exchange.
*   Format prices to match the exchange's precision rules.
*   Access the order book to understand the depth of bids and asks.
*   Fetch aggregated trade data for analysis.

You also get access to a logger for debugging and an execution context to track the backtest's environment, such as the current symbol being analyzed and whether it’s a backtest or live execution. Each of these functions is essential for recreating a realistic trading scenario.

## Interface IExchangeCallbacks

This section describes callbacks you can use to get notified when new candlestick data becomes available from an exchange. Specifically, `onCandleData` lets you react whenever the system retrieves candle data for a particular trading symbol and timeframe. You’ll receive details like the symbol, the interval (e.g., 1 minute, 1 hour), the starting date and time of the data, the number of candles requested, and an array containing the actual candle data. This is useful if you want to process new data immediately or trigger other actions based on the incoming information.

## Interface IExchange

The `IExchange` interface defines how a backtesting system interacts with an exchange to retrieve market data. It provides methods for fetching historical and future candle data, crucial for simulating trading strategies.

You can request historical candles from a specific point in time and also look ahead to fetch future candles, which is useful for backtesting scenarios. The interface also handles formatting quantities and prices to match the exchange’s requirements.

It allows you to calculate the VWAP (Volume Weighted Average Price) using the latest candle data to analyze price trends. You can also access the order book and aggregated trade data for a particular trading pair to understand market depth and order flow.

There's a powerful method for fetching raw candles with various date and limit options, giving you precise control over the historical data you retrieve. The system automatically adjusts limits based on date ranges, and all methods are designed to prevent look-ahead bias, ensuring your backtest accurately reflects real-world trading conditions.

## Interface IEntity

This interface serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as the common starting point for how your data is structured and managed – it ensures consistency across different entity types. Any class you create that represents something you want to persist, like trades or account states, should implement this interface. It's a simple contract that guarantees certain behaviors and properties are present in your data objects.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data during a backtest. Think of it as a way to record important events and information as your trading strategy runs.

It allows you to persist different types of data in various formats: complete conversation histories, simple key-value pairs, tabular data (like spreadsheets), raw text, error messages, complex JSON objects, and even snapshots of system status.

Each method you use to save data receives the data itself, a unique identifier for the save (dumpId), and a description to help you understand what the data represents.

Finally, the `dispose` method cleans up any resources this component is using when it's no longer needed. This is particularly helpful for managing connections or memory.

## Interface IDumpContext

This `IDumpContext` object helps keep track of where your data is coming from. Think of it as a label attached to each piece of information being recorded. It includes details like a unique signal identifier – pinpointing the specific trade it relates to – and a bucket name, which organizes data based on the strategy or agent that generated it.  Each dump also gets a unique ID, a descriptive label to help you understand what it contains, and a flag indicating whether the data originates from a backtest or a live trading session. Essentially, it provides all the necessary context for identifying and organizing your dumps.

## Interface ICommitRowBase

This interface defines the basic information you'll find in events related to committing data, particularly when those events are delayed until the right time. Every commit event will include the trading symbol, like "BTC-USDT", and a flag indicating whether the simulation is a backtest. Think of it as a common structure for confirming actions taken during a trade.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data exists in the storage system. It’s essentially a way to quickly verify if data is available without needing to look through all the files.

You’ll provide details like the trading pair (symbol, like BTCUSDT), the exchange being used, the timeframe of the candles (like 1-minute or 4-hour), and the specific date range you want to check. This allows the system to efficiently confirm if the necessary data is ready for backtesting or other analyses.


## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a common way to visualize and analyze price movements over time. Each candlestick holds information about the price activity within a specific timeframe. You'll find data like the exact time the candle started (timestamp), the price when trading began (open), the highest price reached (high), the lowest price seen (low), the price when trading ended (close), and the total amount of trading that occurred (volume). This data is essential for calculations like VWAP and is the foundation for backtesting your trading strategies.

## Interface ICacheCandlesParams

The `ICacheCandlesParams` object helps you control and monitor how your backtest kit retrieves and prepares historical price data. Think of it as a set of instructions and notification points for a two-step process: first, it checks if the data exists, and then, if not, it generates it.

You can use the `onWarmStart` function to run code just before the data generation process begins.  Similarly, the `onCheckStart` function lets you execute code right before the system attempts to validate the existing data. Both functions give you a chance to log events, display progress, or perform other tasks during these critical phases. They provide details like the trading symbol, the data interval (e.g., 1 minute, 1 day), and the time range being processed.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary setback encountered while trying to place or manage an order. It's a signal from the backtest-kit system that something went wrong, but it’s likely a short-term problem, not a fundamental issue. 

Think of it like a brief network interruption or a temporary issue with the exchange. The system will automatically try again a limited number of times before giving up. 

It includes information about the specific error that occurred, but the details aren't necessarily crucial for immediate action. Adapter code doesn't create this object directly; it signals transient issues by returning a generic error.

## Interface IBrokerOrderVerdictRejected

When an order can’t be fulfilled due to a business-level issue, this represents the framework's final decision. 

It's important to understand that adapters and listeners don't *create* this verdict directly. Instead, they communicate the outcome of order synchronization or checks through normal return values, specific error types, or exceptions.

If the `reason` is "rejected", it means the order was permanently declined, likely because of a problem that can’t be resolved by retrying.  This rejection might involve an `OrderRejectedError` that details the specific reason, like a lack of available counterparties. A rejected order to open will be dropped without attempting another try, and a rejected order to close will be immediately closed.

## Interface IBrokerOrderVerdictDeleted

This represents a situation where an order, previously requested, is no longer found – essentially, it's been deleted. 

The trading framework automatically handles this when it receives a signal that an order has been removed, like if a user cancelled it directly on the exchange.

You, as an adapter or listener, don't create this verdict directly. Instead, you communicate confirmation, transient issues, or rejection through return values or errors.

When this verdict occurs, certain checks are handled immediately and don't go through a tolerance counter. 

It includes an `error` property which details the specific error, like an `OrderDeletedError`, that caused the order to be considered deleted.

## Interface IBrokerOrderVerdictConfirmed

This interface represents the final decision made by the backtest-kit framework regarding an order – whether it's allowed to proceed or not. Think of it as the framework saying "yes, this order is good to go" or "no, something's wrong with this order."

It’s important to understand that you, as a developer creating adapters or listeners, don’t actually *create* this verdict directly. Instead, you signal your decision to the framework through normal returns or errors. A normal return or `true` means the order is confirmed. Throwing a specific error indicates the order is rejected or deleted.

If the `reason` property is set to "confirmed," it means the framework has decided the order is valid and can either proceed with opening or closing, or that the order you checked is still active.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` serves as a foundational structure for how the backtest-kit framework handles decisions related to order placements – whether that’s a direct order execution or a preliminary check. It's designed to be a common base, ensuring that the reasoning behind the decision isn't a factor in how it’s processed. 

The `__type__` property is a special identifier that distinguishes between the various specific types of verdicts that can be returned, acting as a key for the framework to understand the verdict's nature. This allows for flexibility in handling different outcomes.

## Interface IBroker

This interface defines how your application connects to a brokerage or exchange. It’s essentially a bridge, allowing the backtesting framework to simulate real-world trading. Crucially, all methods within this interface are executed *before* the framework's internal state changes, ensuring that errors don't corrupt the backtest data. When running backtests, these methods are skipped, as no real orders are placed.

Here’s a breakdown of what each method does:

*   **`waitForInit()`**:  This is called initially to connect to the brokerage, load credentials, and most importantly, to reconcile any existing orders or positions that might be lingering from a previous, potentially interrupted, session.  Think of it as cleaning up any "orphaned" orders.
*   **`onOrderCloseCommit()`**: Handles closing orders (take-profit, stop-loss, or manual close).  You'll place the actual close order here and record the profit/loss. Errors can cause retries or force-closes depending on the issue.
*   **`onOrderOpenCommit()`**: Deals with opening new positions.  You’ll place the order on the exchange here, using a unique identifier (`signalId`) so the framework can track it.  Errors can lead to retries or order rejection.
*   **`onOrderActiveCheck()`**: Regularly checks the status of open positions.  Use this to confirm the order exists and hasn’t been deleted or modified.  Errors might lead to position closures.
*   **`onOrderScheduleCheck()`**: Similar to `onOrderActiveCheck`, but for resting (limit) orders. You'll confirm the order remains active or cancel it.
*   **`onSignalActivePing()`**:  This is a crucial *informational* hook for monitoring open positions. It’s your chance to react to exchange events – like a gap through a stop-loss – and adjust the framework’s state, using functions to take profits, set stops, or close positions.
*   **`onSignalSchedulePing()`**:  An informational hook for scheduled (limit) orders, letting you monitor their status and decide when to activate or cancel them.
*   **`onSignalIdlePing()`**: Runs when the strategy is idle – great for background checks or housekeeping tasks.
*   **`onSignalScheduleOpen()`**: Called when a new scheduled order is created.  You'll place the actual limit order.
*   **`onSignalScheduleCancelled()`**: Handles the cancellation of a scheduled order. Cancel the related order on the exchange here.
*   **`onSignalPendingOpen()`**:  Called when a new position is opened. It's time to place confirmation and protective orders.
*   **`onSignalPendingClose()`**: Called when a position is being closed. Clean up and record the final P&L.
*   **`onPartialProfitCommit()`**: Called for partial profit closings.
*   **`onPartialLossCommit()`**: Called for partial loss closings.
*   **`onTrailingStopCommit()`**: Used for adjusting trailing stop-loss orders.
*   **`onTrailingTakeCommit()`**: Used for adjusting trailing take-profit orders.
*   **`onBreakevenCommit()`**: Used for adjusting breakeven stop-loss orders.
*   **`onAverageBuyCommit()`**: Called when a DCA (average-buy) entry is executed.



Each method gives you a chance to interact with a live brokerage environment, allowing you to translate backtesting events into real-world trading actions. Remember that exceptions thrown in these methods are handled by the framework, allowing it to maintain consistent state and attempt retries or, in some cases, force closures.

## Interface IBreakevenData

This interface, `IBreakevenData`, holds simple information about whether a breakeven point has been achieved for a specific trading signal. It's designed to be easily saved and loaded, often as a JSON object. Think of it as a snapshot of a more complex breakeven state, specifically indicating if the target has been met. It’s used to store this data persistently, allowing the backtest to remember the breakeven status across sessions.

## Interface IBreakevenCommitRow

This represents a record detailing a breakeven adjustment request. Essentially, it signals that the system needs to recalculate the breakeven point. It includes the action being taken – specifically, a breakeven adjustment – and the current price used for that calculation. Think of it as a notification that the breakeven point needs to be re-evaluated based on the latest market price.

## Interface IBreakeven

The `IBreakeven` interface helps track when a trading signal's stop-loss can be moved to the entry price, essentially reaching a breakeven point. It's used by both the `ClientBreakeven` and `BreakevenConnectionService` components.

The `check` method is the core of this tracking; it determines if a signal qualifies for breakeven by looking at factors like the current price, transaction costs, and whether breakeven has already been reached.  If the conditions are right, it marks breakeven as achieved, triggers a notification, and saves the state.

The `clear` method is used to reset the breakeven tracking when a signal is closed, ensuring resources are cleaned up and the signal's state is properly handled.

## Interface IBidData

This describes a single bid or ask price point within an order book. Each bid or ask is represented by an `IBidData` object. It contains two key pieces of information: the `price` at which the bid or ask is offered, and the `quantity` of the asset available at that price. Both price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as Dollar-Cost Averaging or DCA) strategy. It describes one commit, or purchase, within the averaging process. The `action` property identifies it as an "average-buy" action. Each commit includes the `currentPrice` at which it was made, the `cost` in US dollars to acquire the asset, and the `totalEntries` count, reflecting the total number of purchases accumulated so far.

## Interface IAggregatedTradeData

This interface describes a single trade event, providing all the key details you need for backtesting and analysis. Each trade is given a unique ID, and you’ll find the price at which it happened, the quantity of assets involved, and the exact timestamp of the transaction.  A crucial piece of information is whether the buyer was the market maker – this tells you the direction of the trade from a market-making perspective.

## Interface IAgentLogger

The `IAgentLogger` interface provides a way to record specific actions taken by your AI agents during a backtest. Think of it as a dedicated channel for logging what your agent *did* – the reasoning steps it took, the tools it used, and the responses it generated. This is distinct from general framework diagnostics, which focus on the health and performance of the backtest-kit itself.  By separating these concerns, the `IAgentLogger` ensures that your agent's actions are clearly visible in the log history for later review and analysis, without interfering with the framework's internal logging. You’ll primarily use the `agent` method to capture these key moments in your agent’s decision-making process.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading run, whether it's a backtest or a live trade. 

Think of it as a record keeping track of what's happening right now. 

It's created when a run begins (like when a backtest starts or a strategy executes) and automatically removed when it finishes or if there's an error.

It includes essential information such as the trading pair's symbol (e.g., "BTCUSDT"), details about the strategy and exchange being used, and whether the run is a backtest or a live trade. 

This record helps the system manage multiple tasks safely and efficiently and determine if there are any parallel operations happening.


## Interface IActivateScheduledCommitRow

This interface represents a queued request to activate a scheduled commitment. Think of it as a message telling the system to trigger a pre-planned action.

It includes a way to identify the action being requested – specifically, it’s an activation of a scheduled commitment.

You'll also find the `signalId`, which pinpoints the exact signal related to this activation.  

Finally, an optional `activateId` lets you manually trigger an activation, useful for specific scenarios where you need more direct control.


## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the signal state without actually executing anything. Think of it as a way to check if it's even *worth* running a particular action.

It lets you see if a signal is actively waiting to be filled, or if a signal is waiting in the queue to happen later.

You’ll use this to decide whether to proceed with actions like setting breakeven points, taking partial profits or losses, or checking scheduled signals. The methods are simple checks – `hasPendingSignal` confirms an active waiting signal and `hasScheduledSignal` does the same for signals that are waiting to be triggered.

## Interface IActionSchema

This defines a way to extend a trading strategy with custom functionality. Think of it as adding hooks that are triggered during the strategy's execution.

You can use these "actions" for things like keeping track of the strategy's progress, sending notifications about important events, or even connecting it to external tools.

Each action is given a unique name when it's added, and you can optionally add a note for documentation.

The core of an action is its handler, which is essentially a function that gets called with all the events happening during the strategy's run.  It's created for each strategy and its execution period.

Finally, you can attach callbacks to control when the action runs—for example, before or after certain steps in the strategy. These are optional, so you only need them if you want very specific timing.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run correctly, building upon a base schema and including crucial runtime details. Think of it as a package of context.

It provides a `logger` so you can easily track what your action is doing and debug any issues.

You’ll find identifiers like `strategyName`, `exchangeName`, and `frameName` to specify exactly where this action belongs within your trading system.

The `backtest` flag tells the action whether it's running in a historical simulation or live trading.

Finally, the `strategy` property gives you access to important details about the current signal and your positions. It's essentially the state of your trading strategy.

## Interface IActionCallbacks

This API reference describes callbacks you can use to customize the behavior of your trading strategies within the backtest-kit framework. Think of these callbacks as hooks that let you plug in your own code at specific points in the process, like when a signal is generated, an order is placed, or the strategy is initialized.

You can define initialization and cleanup routines using `onInit` and `onDispose` respectively – these are helpful for setting up connections or saving data.

Several callbacks provide information about signal events: `onSignal`, `onSignalLive`, and `onSignalBacktest` provide raw signal data, while others like `onBreakevenAvailable`, `onPartialProfitAvailable`, `onPartialLossAvailable`, and `onPingScheduled` are triggered by specific conditions related to risk management and scheduling.

The `onPendingEvent` and `onPingActive` callbacks are particularly useful for directly interacting with the exchange, manually managing order placement and modifications—acting as alternatives to a traditional broker adapter.  `onPingIdle` fires when there's no active signal.

The `onRiskRejection` callback provides insights when risk management flags a signal as invalid.  `onOrderSync` is a critical gate for order placement, with errors propagating upwards. Finally, `onOrderCheck` monitors order status and provides a mechanism to respond to order changes.



These callbacks offer a way to extend the framework’s functionality and fine-tune the execution of your strategies.

## Interface IAction

The `IAction` interface is designed to help you connect your custom logic – like managing a Redux store, logging events, or building real-time dashboards – with the backtesting and live trading framework. It provides a set of methods that get triggered by various events happening within the framework.

These methods are grouped based on the type of event:

*   **Signal events:** These methods (`signal`, `signalLive`, `signalBacktest`) react to the core signal generation process, differentiated by whether it's happening in live, backtest, or both modes.
*   **Profit/Loss Events:** `breakevenAvailable`, `partialProfitAvailable`, and `partialLossAvailable` are triggered when specific profit/loss levels are hit.
*   **Scheduling & Pending Events:** Methods like `pingScheduled`, `scheduleEvent`, `pendingEvent`, and `pingActive` manage events related to scheduled signals and pending orders.
*   **Order Management:** `orderSync` lets you control order execution, while `orderCheck` is used for verifying pending orders are still active.
*   **Risk Events:** `riskRejection` handles situations where signals fail risk validation.
*   **Cleanup:** `dispose` is called to release resources when your action handler is no longer needed.

You’ll need to implement these methods to integrate your custom logic, typically by reacting to the data passed with each event. It’s important to call `dispose` when you’re done with the action handler to avoid memory leaks and ensure proper cleanup.

## Interface HighestProfitStatisticsModel

This model helps you understand the most profitable moments in a trading simulation. It keeps track of every instance where a significant profit was made, storing them in a list called `eventList`, ordered from most recent to oldest. 

You can also see the overall number of profitable events that occurred with the `totalEvents` count. This provides a clear picture of how consistently profits were generated.

## Interface HighestProfitEvent

This data represents the single best-performing trade recorded for a specific strategy. It captures key details about that trade, including precisely when it occurred (using a timestamp) and which trading pair was involved. You'll find the name of the strategy and a unique identifier for the signal that triggered the trade. 

The record stores whether the position was a long or short trade, and crucially, provides detailed profit and loss information, including the total profit made on the trade, the highest profit achieved at any point, and the largest drawdown experienced. It also notes the price at which the profit record was set, alongside the entry price, take profit price, and stop loss price. Finally, a flag indicates if this data originates from a backtesting simulation or live trading.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading strategy reaches a new peak profit. It gives you details like the trading symbol (e.g., "BTC/USDT"), the current price, and the exact time of the update. You'll also find the strategy and exchange names used, along with the timeframe (like "1m" or "5m") and the signal data driving the trade. A crucial flag indicates whether this update came from a backtest simulation or live trading, allowing you to adjust your reactions accordingly. This contract enables you to build custom responses to significant profit milestones, such as automatically setting trailing stops or taking partial profits.

## Interface HeatmapStatisticsModel

This data structure represents a consolidated view of statistics calculated across an entire portfolio of trading symbols. It provides a high-level overview of portfolio performance, encompassing metrics from individual symbols and aggregating them for a broader assessment.

The `symbols` property holds a detailed breakdown of statistics for each individual symbol within the portfolio. The `totalSymbols` field simply tells you how many symbols are included.

Key portfolio-level metrics include total profit/loss (`portfolioTotalPnl`), Sharpe and Sortino ratios (measuring risk-adjusted returns), and the total number of trades made.  You'll also find averages related to peak and fall profit/loss across all symbols, indicating performance extremes.

Furthermore, the structure includes statistics concerning trade duration (both overall and broken down by win/loss), volatility (`portfolioStdDev`), and various other performance indicators like expectancy, recovery factor, and annualized Sharpe ratio. The `portfolioExpectedYearlyReturns` gives an approximation of what to expect yearly if the portfolio continues with the same behaviour.  Finally, `portfolioTradesPerYear` quantifies the typical trading frequency within the portfolio.


## Interface DoneContract

This interface represents the information you receive when a background process, like a backtest or live trading session, finishes running. 

It gives you key details about what just happened: which exchange was used, the name of the trading strategy involved, and whether it was a backtest or a live execution. You’ll also find the trading symbol, like BTCUSDT, that was being traded. Essentially, it's a notification package telling you a task is done and providing context about it.

## Interface CronHandle

The `CronHandle` is like a little key you get when you schedule a task to run regularly using the Cron system. Think of it as a way to easily cancel that scheduled task later. If you no longer need the task to run, you can just discard this handle, and it will automatically remove the task from the schedule – it's the same as manually telling the Cron system to stop the task.

## Interface CronEntry

A CronEntry defines when and how a piece of code runs within a backtesting system. Think of it as scheduling a task.

Each entry needs a unique name to identify it, and this name can't contain colons.

You specify an interval – like every minute, every hour, or every day – telling the system when the task should be triggered. If you skip the interval, the task will only run once, immediately.

You can also choose which symbols (like stock tickers) the task applies to. If you list symbols, the task will run once for each of those symbols at the scheduled time. If you don’t list any, it will run once overall for all symbols across all backtests.

Finally, you provide the actual code (the handler) that will be executed when the scheduled event occurs. If that code fails, it'll be retried automatically.

## Interface CriticalErrorNotification

This notification signals a critical error that requires immediate shutdown of the process. 

It’s designed to provide information about the problem encountered.

Each notification has a unique ID, a human-readable message explaining the error, and a detailed error object containing a stack trace and any relevant data. 

The `type` property clearly identifies this as a critical error notification.

Importantly, these errors always originate outside of a backtest environment, so the `backtest` property is always false.

## Interface ColumnModel

This describes how to structure the information you want displayed in a table. Think of it as defining each column of your table – what it represents, how it’s labeled, and how the underlying data gets transformed into a readable string. Each column needs a unique identifier, a user-friendly label for the header, and a function that takes the raw data and converts it to a string suitable for display.  Finally, you can also specify a function that determines whether a column should even be shown, allowing for conditional visibility.

## Interface ClosePendingCommitNotification

This notification tells you when a signal that was about to activate a trade was closed before it actually happened. It's like getting a heads-up that a plan changed before it was put into action.

The notification includes a unique ID, a timestamp, and whether it occurred during a backtest or live trading. You'll find details like the symbol being traded (e.g., BTCUSDT), the strategy's name, and the exchange involved.

It provides a comprehensive breakdown of the potential position’s performance, including PNL, peak profit, maximum drawdown, and associated prices – all calculated considering slippage and fees.  You’ll also see information about the number of entries and partial closes that would have been part of the trade, the original entry price, and a note providing context for the closure.  Finally, you get creation timestamp.


## Interface ClosePendingCommit

This signal tells the backtest system that a previously opened position is being closed. 

It includes details about the closure, such as a unique identifier you can provide to explain why the position was closed. 

You'll also find information about the position’s performance, including its total profit and loss, the highest profit it reached, and the largest drawdown it experienced during its lifetime. This allows you to track how the position performed from start to finish.

## Interface CancelScheduledCommitNotification

This notification signals that a planned trading signal has been canceled before it was executed. It provides a detailed snapshot of the signal's potential impact, including financial metrics like potential profit and loss, peak profit, and maximum drawdown. You'll find information about the trading symbol, the strategy that generated the signal, and the exchange involved. The notification includes identifiers for tracking the cancellation and the original signal. 

Detailed financial data, such as total entries, PNL, and percentage profit/loss, is included to offer a comprehensive view of the opportunity that was canceled. This data is broken down further, covering peak profit and maximum drawdown events. An optional note field can provide additional context or a reason for the cancellation. Finally, timestamps detail when the signal was created and when the cancellation was processed.

## Interface CancelScheduledCommit

This interface defines a message used to cancel a previously scheduled signal event. It's a way to tell the system you no longer want a specific signal to be executed.

The `action` property always confirms this is a cancellation request.

You can optionally provide a `cancelId` to help you track why you're canceling, especially useful if multiple cancelations are happening.

Alongside the cancellation details, the message also includes information about the position being closed:  the total profit and loss (`pnl`), the highest profit seen (`peakProfit`), and the biggest loss experienced (`maxDrawdown`). This gives you a snapshot of the position’s performance before it was cancelled.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a trading simulation. It allows you to analyze how often your trading strategy reached a breakeven point.

You'll find a list of individual breakeven events, each containing detailed data about when and how it happened. 

The model also gives you the total count of breakeven events, providing a simple overall statistic.

## Interface BreakevenEvent

The BreakevenEvent holds all the important details whenever a trading signal hits its breakeven point. It's designed to help generate clear and understandable reports about your trades. 

You’ll find information like the exact time of the event, the trading pair involved, the name of the strategy used, and the signal's unique identifier. It also includes key price data: the entry price, the take profit target, and the stop-loss levels, both as originally set and as they currently stand. 

If you used a dollar-cost averaging (DCA) strategy, you'll see details about the number of entries and partial closes. Furthermore, it provides information on unrealized profit and loss, a description of why the signal was triggered, and timestamps related to when the position was created and scheduled. Finally, a flag indicates whether the trade occurred in backtest mode or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents a significant milestone in a trading strategy – when a signal's stop-loss is adjusted to the entry price, effectively covering the initial risk. This happens when the price moves favorably enough to offset trading costs.

It's a crucial event for monitoring and understanding strategy performance.  The framework only emits this event once for each signal, ensuring accuracy.

The contract includes vital details like the trading symbol, the strategy and exchange involved, the timeframe, and comprehensive data about the original signal. You'll find the current price at which breakeven occurred and whether the event originated from a backtest or live trading.  The timestamp indicates precisely when breakeven was set – either during live trading or at the candle’s closure during backtesting. Services like the `BreakevenMarkdownService` use these events to create reports, and you can also set up callbacks to react to them in real-time.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trading action has been taken. It provides a detailed snapshot of the trade, including when it happened, whether it was a backtest or a live trade, and the specifics of the trading pair and strategy involved.

You'll find key information like the unique signal ID, current price, trade direction (long or short), and the original entry and stop-loss prices.

The notification also dives deep into the position's performance. You’ll see data about the total profit and loss (pnl), peak profit, maximum drawdown, and how these metrics have changed throughout the trade's life. It also includes details related to any DCA (Dollar-Cost Averaging) strategy used, such as the number of entries and partial closes. 

Finally, additional notes are provided, such as the signal creation timestamp, when the position started pending and when the notification was created. This information is critical for understanding and analyzing the trade's history and performance.

## Interface BreakevenCommit

This `BreakevenCommit` represents an event triggered when a strategy adjusts a trade to breakeven. It provides a snapshot of the position's state at that moment, including the current market price and the position's direction (long or short).

You'll find detailed information about the position's performance, such as total profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the largest drawdown experienced.

The commit also preserves the original and potentially adjusted take profit and stop loss prices, allowing for analysis of how these levels have changed over time.

Finally, it includes timestamps marking when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`). These timestamps are useful for understanding the timing of the breakeven adjustment within the trading process.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be moved to breakeven – essentially, your initial entry price. It provides a wealth of information about the trade, including a unique identifier, the exact time this event occurred, and whether it's happening in a backtest or live environment.

You'll find details about the trading pair, the strategy that generated the signal, and the exchange involved. Crucially, it includes the current market price, the original entry price, and the trade direction (long or short).

The notification also breaks down the performance of the trade so far: you can see the peak profit achieved, the maximum drawdown experienced, and the overall profit/loss in both absolute and percentage terms.  Detailed data on entries, partials, and slippage/fee adjustments are also included.  Finally, there's an optional note field for a human-readable explanation of why the signal was triggered.

## Interface BeforeStartContract

This event lets you perform setup tasks right before a strategy starts running, ensuring things are ready to go. It fires once for each run of a strategy, before any trading decisions are made.

You can use it for tasks like setting up log files, resetting counters for the run, or sending out notifications that a run has begun.

Importantly, this event is always followed by an `AfterEndContract` event when the run finishes, even if something unexpected happens. Any errors that occur during your setup code won't stop the run.

The `symbol` tells you which asset the strategy is trading, and the `strategyName` helps you distinguish between runs of different strategies. You'll also get the `exchangeName` and `frameName` (if applicable, like in backtesting).

The `backtest` flag indicates whether it's a backtest or a live trading run, and `currentPrice` provides a convenient price snapshot. The `when` property represents the intended start time of the run, and the `timestamp` is that time expressed in milliseconds.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your trading strategy's performance during a backtest. It gathers key statistics like the total number of trades, win/loss counts, and win rate to give you a clear picture of profitability. You’ll find metrics like average profit per trade, total profit, and volatility measurements (standard deviation, Sharpe Ratio) to assess risk-adjusted returns.

The model also delves into more nuanced analyses, calculating metrics like expectancy, recovery factor and trend analysis. Furthermore, it breaks down trade durations, and looks at pressure imbalances and trend strength to offer a deeper understanding of market behavior. Many of these values might be null if the backtest conditions made accurate calculation unreliable. A wealth of data is available, enabling you to thoroughly evaluate and refine your trading strategy.

## Interface AverageBuyCommitNotification

This notification signals that a new portion has been added to an ongoing average-buy (DCA) position. It provides a wealth of information about this DCA event, including a unique identifier, the precise time it occurred, and whether it happened during a backtest or live trading. 

You'll find details like the trading pair involved, the strategy and exchange responsible for the signal, and the current price at which the new DCA entry was executed.

The notification also tracks the financial aspects, such as the cost of this specific entry, the effective average entry price after the addition, and the total number of DCA entries accumulated so far. 

Beyond the immediate transaction, it includes comprehensive performance metrics for the entire position, like total profit and loss, peak profit, maximum drawdown, and related price points. This allows for a complete understanding of the position's performance at the time of the new DCA purchase, as well as key details about the original signal and any price adjustments made. Finally, a note field allows for optional human-readable explanation of the signal's reason.

## Interface AverageBuyCommit

This event signifies a new purchase has been made as part of a dollar-cost averaging (DCA) strategy for an existing position. It provides detailed information about this specific averaging transaction, including the price at which it occurred and the cost in USD. The `effectivePriceOpen` reflects the new, averaged entry price after this purchase is factored in.

You'll also find data related to the position's performance, like current unrealized profit and loss (`pnl`), the highest profit achieved so far (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). Other key details include the original entry price, and any adjustments to the take profit and stop loss levels. Timestamps show when the signal was created and when the position became active.

## Interface AfterEndContract

This interface marks the end of a trading strategy execution, whether it’s a backtest or live trading. It's a signal that the strategy has finished running, allowing for cleanup tasks like flushing data, closing connections, or sending completion notifications. 

You're guaranteed to receive this event exactly once for each strategy run, and it will always be paired with a corresponding `BeforeStartContract` event, ensuring a complete record of the strategy's lifecycle. Any errors encountered while handling this event are handled internally and won't disrupt your main application.

The `when` property represents the time of completion, and how it's determined differs based on whether you're backtesting or live trading. In backtesting, it's the time of the last candle processed, or the start of the frame if no candles were processed. For live trading, it's the current wall-clock time rounded to the nearest minute.

The event provides details such as the trading symbol, strategy name, exchange used, and timeframe. It also tells you if the run was a backtest and gives you the average price at the end of the run for convenience. The `timestamp` offers an alternative way to represent the `when` date as milliseconds since the epoch.

## Interface ActivePingContract

The `ActivePingContract` represents a recurring event, happening roughly every minute, while a trading signal is actively pending. Think of it as a heartbeat to keep you informed about the status of your open signals. This event provides information about the symbol, the strategy involved, the exchange used, and the timeframe it applies to.

You’ll also receive the complete data of the pending signal, including details like entry price, take profit, and stop loss levels.  A crucial piece of information is the `currentPrice` which is the market price at the moment the ping occurred. 

The `backtest` flag tells you whether the signal is being monitored during a historical simulation or in live trading. Finally, `timestamp` marks when the ping event took place, indicating the actual time in live mode or the candle timestamp during backtesting.  You can use this data to create custom logic or management actions for your pending signals.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, letting you know a trade is about to happen. It provides a wealth of details about the impending trade, including a unique ID, the exact time of activation, and whether it's happening in a backtest or live environment.

You'll find specifics about the trading pair, the strategy that triggered the signal, and the exchange where it will execute. It outlines the trade direction (long or short), the entry price, take profit and stop-loss levels – both the initial ones and any adjustments made.

The notification also includes information about any DCA (Dollar-Cost Averaging) involved, including the number of entries and partials.  It further breaks down the potential profit and loss, peak profit, maximum drawdown, and the prices associated with those metrics, along with related costs and percentages.  You'll see the original signal creation timestamp, the time the position went pending, the current market price at the time of activation, and an optional note explaining the reasoning behind the signal. Finally, the notification has a creation timestamp for tracking purposes.

## Interface ActivateScheduledCommit

This interface describes an event that occurs when a previously scheduled signal is activated. It's used to communicate details about the trade that's now being executed.

The `action` property confirms this is an activation event.  You can optionally include an `activateId` to identify why the activation happened, which could be useful for tracking specific user requests or automated processes.

Alongside this, you'll find key information about the trade itself, like the current market price, direction (long or short), entry price, and prices for take profit and stop loss.  There are also versions of the take profit and stop loss prices reflecting any trailing adjustments that might have been applied.

The event also includes performance metrics for the trade, like total profit & loss (pnl), peak profit achieved, and maximum drawdown, all calculated up to the point of signal creation. Finally, the `scheduledAt` property records when the signal was initially created, and `pendingAt` marks the moment of activation.
