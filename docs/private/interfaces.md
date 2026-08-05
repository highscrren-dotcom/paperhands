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

This interface defines the structure of signals that are sent when a walker is being stopped. 

It's used to communicate which specific trading strategy and walker instance needs to be halted.

Think of it as a notification system – when you tell a walker to stop, this message contains information like the trading symbol involved, the name of the strategy being used, and the unique identifier of the walker itself. This is especially useful when you have multiple walkers operating on the same market simultaneously.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a clear way to represent the results of a backtesting analysis. It builds upon the existing WalkerResults structure, adding even more details to help you compare different trading strategies. Think of it as a central container holding all the information you need to understand how your strategies performed against each other. 

Specifically, it includes a list of strategy results, where each entry details the performance metrics for a single trading strategy.


## Interface WalkerContract

The WalkerContract provides updates as your backtesting strategies are compared and evaluated. It’s like a progress report, letting you know when a strategy finishes its test run and how it stacks up against others.

Each time a strategy completes testing, you’ll receive an event containing details like the strategy’s name, the exchange and symbol it was tested on, and key performance statistics. You'll also see the metric the system is trying to optimize, its current value for this strategy, and how it compares to the best-performing strategy found so far.

The event also includes the total number of strategies being tested and how many have already been evaluated, so you can track the overall progress of your backtest. This helps you understand where your strategies stand within the larger comparison and informs decisions on how to proceed.

## Interface WalkerCompleteContract

The WalkerCompleteContract signals that a full backtesting run is finished. 

It’s your notification that all the strategies have been tested and the final results are ready.

This contract bundles together a wealth of information about the backtest, including details like the walker’s name, the trading symbol used, the exchange and timeframe, the optimization metric, and how many strategies were evaluated.

You’ll also find the name of the winning strategy, its score (the best metric value), and detailed performance statistics for that top strategy.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the trading backtest process. 

It’s essentially a way for the system to alert you when something went wrong during risk validation, like when your trading strategy attempted an action that wasn't allowed. 

Each notification has a unique ID, a detailed error message you can understand, and a snapshot of the error itself, including any relevant information. 

Importantly, the `backtest` flag will always be false, because these errors relate to the live trading context, not the backtest simulation.

## Interface ValidateArgs

This interface, ValidateArgs, acts as a central blueprint for ensuring the names of different components within your backtesting system are correct. Think of it like a checklist for things like the exchange you're using (e.g., Coinbase, Binance), the timeframe of your data (e.g., 1 minute, 1 hour), the trading strategy you've defined, and even the risk management profiles you’re employing.

Each property of ValidateArgs represents a different aspect of your backtest setup, like 'ExchangeName', 'FrameName', or 'StrategyName'.

The value associated with each property should be an enum – a named set of allowed values – which helps to prevent typos and ensure consistent, reliable data throughout your backtesting process. Essentially, it makes sure you’re using the right names for everything.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take-profit order is executed, essentially marking the close of a trade managed by a trailing strategy. It provides a wealth of detail about the trade, including a unique ID, when it happened, and whether it occurred in backtest or live mode.

You'll find information like the trading pair (e.g., BTCUSDT), the strategy that triggered the action, and key prices like the original take-profit and stop-loss levels, as well as the adjusted prices after trailing. 

The notification also includes a comprehensive breakdown of the trade's performance: entry and exit prices, total profit and loss (both in USD and percentage), peak profit metrics, maximum drawdown information, and details about the number of entries and partial closes involved. Finally, it contains timestamps for when the signal was created, went pending, and when this notification was generated. A helpful note field can provide extra context for why the take-profit was triggered.

## Interface TrailingTakeCommit

This interface describes a trailing take profit event, which happens when a trading strategy adjusts its take profit price based on market movements. It contains detailed information about the trade, including the direction (long or short), the original entry price, and the adjusted take profit and stop-loss prices. 

You’ll also find key performance metrics associated with the position, such as the profit and loss (pnl), the peak profit achieved, and the maximum drawdown experienced. The event also records the original take profit and stop-loss prices before any trailing adjustments were made, alongside timestamps indicating when the event was scheduled and when the position was activated. This data provides a comprehensive view of a trailing take profit event and its context within a trading strategy's lifecycle.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered, essentially when your stop-loss order has been adjusted and executed a trade. It provides a wealth of information about the trade, including the trading pair (like BTCUSDT), the strategy that initiated the signal, and whether it occurred in a backtest or live environment.

You'll find details like the original and adjusted stop-loss and take-profit prices, entry price, and a breakdown of the position's performance – including peak profit, maximum drawdown, and overall profit/loss in both absolute and percentage terms. There's also data about the number of entries and partial closes executed, along with timestamps for different stages of the trade lifecycle, such as when the signal was scheduled, went pending, and when the notification itself was created. A helpful note field might contain a brief explanation of why the signal was generated.

## Interface TrailingStopCommit

This interface describes a trailing stop event, which is a signal triggered when a trailing stop loss mechanism is activated. It provides comprehensive details about the trade that occurred, including the direction (long or short) and the entry price.

You'll find information about the current market price when the trailing stop was adjusted, as well as the percentage shift used to modify the stop loss. It also includes a record of the position’s performance, detailing the profit and loss (PNL), peak profit, and maximum drawdown throughout its lifetime.

Crucially, it captures both the original and the adjusted take profit and stop loss prices, reflecting how the trailing stop has modified those levels. A timestamp indicates when the signal was created and when the position was initially activated.

## Interface TickEvent

The `TickEvent` object provides a standardized way to represent different events within the trading framework, allowing for consistent reporting and analysis. Think of it as a single container holding all relevant details about an event, whether it's a signal being scheduled, a trade being opened, or a position being closed.

Each `TickEvent` includes a timestamp marking when the event occurred, along with the `action` type (like 'scheduled', 'opened', 'closed', etc.). It contains key information such as the trading `symbol`, related `signalId`, `position` type, and a helpful `note` for signals. 

For active positions, you’ll find details about pricing (`currentPrice`, `priceOpen`, `priceTakeProfit`, `priceStopLoss`), and modifications to those prices. Information on averaging strategies, including `totalEntries` and `totalPartials`, are also included.

Profit and loss data, represented as absolute values (`pnlCost`), percentage (`pnl`), and progress towards take profit/stop loss (`percentTp`, `percentSl`), helps assess performance. Further metrics like `peakPnl` and `fallPnl` capture the best and worst PNL percentages achieved during a trade's lifecycle. Specific events like closures and cancellations have their own reason codes (`closeReason`, `cancelReason`) and duration/scheduling timestamps.

## Interface SyncStatisticsModel

This model helps you understand how often and in what ways signals are being synced. It gives you a list of every sync event, allowing you to examine them individually. You can also quickly see the overall number of sync events, as well as how many times signals were opened and closed during the sync process. This information is useful for monitoring the health and performance of your signal syncing system.

## Interface SyncEvent

The SyncEvent holds all the details about events that happen during a trading signal’s lifecycle, designed to create clear reports. Think of it as a comprehensive record of what’s happening with your trades.

It includes basic information like the time of the event, the trading symbol, the strategy and exchange being used, and whether it’s a live or backtesting scenario. You'll also find the unique ID for the signal, the type of action taken (like opening or closing a position), and the current market price.

For each trade, you can track the direction (long or short), entry price, take profit and stop-loss prices (both the original values and those potentially adjusted by trailing stops), and details related to dollar-cost averaging. 

You can also see when the signal was initially created, when the position became active, and how many entries or partial exits were involved. The event also provides profit and loss information, including the highest profit and biggest loss encountered, and the reason why the signal was closed. Finally, it records the exact time the event was logged.

## Interface StrategyStatisticsModel

This model holds a collection of statistics gathered during a strategy's execution. It gives you a breakdown of different types of events the strategy produced.

You’ll find a detailed list of every event that occurred, alongside a total count of all events. 

The statistics also break down how often the strategy canceled, closed, or adjusted positions based on partial profits or losses. It will also show the counts for trailing stop, trailing take, breakeven, activate-scheduled and average buy (DCA) events. This helps understand how the strategy is responding to market conditions and manages its positions.

## Interface StrategyPauseNotification

This notification informs you when a strategy’s pause state changes. It’s triggered when the strategy is actually paused or resumed. When a strategy is paused, it won’t open any new positions, but any existing trades will still be managed and closed as usual. 

The notification includes details like the strategy’s name, the trading symbol involved, whether it’s happening in backtest or live mode, and the new pause state (paused or resumed). You'll also find a unique ID, a timestamp of the change, the exchange and frame names, and the creation time of the notification for tracking purposes.

## Interface StrategyEvent

The `StrategyEvent` object holds all the key information about what's happening in your trading strategy, whether you're backtesting or live trading. Think of it as a detailed record of every action taken. It includes things like the exact time of the event, the trading pair involved, the name of the strategy, and the exchange being used.

You’ll find specifics about each trade, such as the signal ID, the type of action taken (like buying, selling, or adjusting stops), and the current market price at the time. It also tracks details like percent to close, trailing stop adjustments, and IDs for scheduled, pending, or activated actions.

For backtests, it lets you see the original and effective prices for take profit and stop loss levels. Live trading events also capture this information. You can also view data like the price at which the position was initially opened, the number of entries if using DCA, and even optional notes that may have been added. The data also includes profit and loss details for the position at the time of the event, as well as costs associated with the trade (particularly for DCA strategies).

## Interface SignalScheduledNotification

This notification tells you about a trading signal that's been set up for future execution. Think of it as a heads-up that a trade is planned, not happening immediately.

It includes a bunch of details to give you a complete picture of the upcoming trade. You’ll find things like the unique identifier of the signal, when it was scheduled, and whether it’s part of a backtest or live trading.

The notification also specifies the trading pair (like BTCUSDT), the strategy responsible, and the exchange where the trade will occur.  It breaks down the trade details including the trade direction (long or short), target prices (entry, take profit, and stop loss), and information about any DCA (Dollar-Cost Averaging) involved.

Beyond the basics, you’ll also see performance indicators for the planned trade, such as potential profit and loss, peak profit, and maximum drawdown.  Finally, there's an optional note field for added context or explanation about the signal's reasoning.

## Interface SignalOpenedNotification

This notification signals that a new trade has been opened. It provides a wealth of information about the trade, including a unique ID, the exact time it was opened, and whether it’s part of a backtest or live trading. You'll find details about the trading pair, the strategy that triggered the trade, and the exchange used.

The notification also includes specifics about the trade itself, like the position direction (long or short), entry and stop-loss prices, and details related to any DCA averaging or partial closes that occurred.

Beyond the basics, you get in-depth performance metrics, such as the total profit and loss (PNL), peak profit achieved, and maximum drawdown experienced. There's a breakdown of costs, entry prices, and percentages, all calculated with adjustments for slippage and fees.  Finally, it includes a free-form note field for explanations and timestamps marking various stages of the trade's lifecycle.

## Interface SignalInfoNotification

This notification type lets your trading strategies communicate important information about open positions – think of it as a way for your strategies to share updates with you or other systems. It's specifically for informational notes, not necessarily signals that trigger trades.

Each notification contains a wealth of details, including when it occurred, which strategy generated it, the trading pair involved, and whether it's part of a backtest or live trading. You'll find details about the position itself, like the entry price, take profit and stop-loss levels, and how they might have been adjusted over time.

The notification also gives a snapshot of the position's performance: you can see the profit and loss, peak profit achieved, maximum drawdown, and key price points along the way.  It breaks down these metrics in both absolute USD values and as percentages. Finally, it includes any custom notes your strategy might want to include, plus identifiers to help track the notification across different systems or schedules.

## Interface SignalInfoContract

This defines how information is shared from a trading strategy to the outside world. When a strategy wants to broadcast a message about its activity – perhaps a custom annotation, a debugging message, or something to trigger an external notification – it uses this structure. 

The message includes key details like the trading symbol, the name of the strategy producing it, the exchange and frame involved, and the data associated with the signal. Crucially, it also carries the current market price at the time of the message, a user-defined note for extra context, and a unique ID for linking events. 

Finally, it tells you whether this information comes from a backtest (historical data) or live trading, along with the exact time the event occurred. This allows external systems to react to the strategy's actions and gain valuable insights.

## Interface SignalEventContract

This interface helps you keep track of when trading positions are opened and closed within your backtesting or live trading strategies. Think of it as a notification system specifically for pending positions – you don't have to monitor every single signal to know what's happening with your trades.

It tells you whether a position has started ("opened") or finished ("closed") during the backtest or live trading process. You'll receive details like the trading pair involved (symbol), the name of the strategy that created the signal, the exchange it's running on, and the timeframe used.

Crucially, you get the full signal data at the time of the event, so you have all the relevant information about the position's parameters and performance. If a position is closed, the `closeReason` property tells you exactly why it was closed – whether it was due to a take profit, stop loss, time expiration, user action, or something else. The `currentPrice` indicates the price used for entry or exit. Finally, a flag indicates whether the event is from a backtest or live execution.

## Interface SignalData$1

This interface defines the structure of a single trading signal that has been closed, primarily used for calculating and displaying performance metrics. Each signal carries information about which strategy created it, a unique identifier, and the trading symbol involved. It includes details like whether the position was long or short, the profit and loss (PNL) expressed as a percentage, and the reason for closing the trade. Crucially, the open and close timestamps record when the trade began and ended, allowing for tracking duration and timing of signals.

## Interface SignalCommitBase

This defines the basic information you'll find in every signal commit event within the backtest-kit framework. Each signal commit represents a significant action taken during a trade, like opening or closing a position.

It includes details like the trading pair (symbol), the name of the strategy that triggered it, and where the trade took place (exchange).  You'll also find a timestamp, a unique identifier for the signal, and whether it came from a backtest or a live trading scenario.

Crucially, it tracks how many entries and partial closes are associated with the signal, letting you understand the depth of the trade and how it's being managed. It also saves the original entry price, and the complete signal data at the time.  Finally, there’s an optional note field for adding a human-readable explanation of why the signal was generated.

## Interface SignalClosedNotification

This notification tells you when a trading position managed by a strategy has closed, whether that's due to hitting a take profit, stop loss, or some other reason. It provides a wealth of details about the trade, including a unique identifier, the exact time it closed, and whether it happened during a backtest or live trading.

You'll find information about the trading pair, the strategy used, and the exchange where the trade occurred. It breaks down the entry and exit prices, original target prices (before any adjustments), and the number of entries and partial closes involved.

Beyond just the basic details, it also gives you a complete picture of the trade's performance. This includes profit/loss percentages and dollar amounts, peak profit achieved, and the maximum drawdown experienced. You'll also see prices and timestamps related to those performance metrics. Finally, there's an optional note field that can provide additional context or a description of why the position was closed.

## Interface SignalCancelledNotification

This notification tells you when a previously scheduled trade was cancelled before it could be executed. It provides a wealth of details about the cancelled signal, which can be useful for debugging and understanding why a trade didn't happen.

You'll find information like a unique identifier for the cancellation, the exact time it occurred, and whether it happened during a backtest or live trading. The notification also includes details about the intended trade – the symbol involved, the strategy that generated the signal, the intended direction (long or short), and the planned take profit and stop loss levels.

It also specifies why the signal was cancelled, such as a timeout or user intervention, and any notes associated with the cancellation. More technical data like the original prices, number of DCA entries and partial closes are included to assist deeper analysis. You can also determine when the signal was originally created and when the position would have become pending.

## Interface Signal

The `Signal` object holds all the information related to a single trade entry or exit. 

It tracks the opening price of the position using the `priceOpen` property, which is simply the price at which the trade began. 

The `_entry` array keeps a history of all entry points for the signal, detailing the price, associated cost, and timestamp of each entry.

Similarly, `_partial` stores records of any partial exits taken during the trade, noting the exit type (profit or loss), the percentage of the position closed, the price at which it exited, the cost basis, and the number of entries closed.


## Interface Signal$2

This `Signal` object represents a trading signal and holds key information about a position.

It tracks the entry price, which is the initial price at which the position was opened.

Internally, it maintains a history of entry events, detailing the price, cost, and timestamp of each entry.

Furthermore, the `Signal` keeps a record of any partial exits, noting the type (profit or loss), percentage gained or lost, the price at the time of the exit, the cost basis at the time of closure, the number of shares/contracts held, and the associated timestamp. This allows for detailed analysis of trading performance.


## Interface Signal$1

This `Signal$1` object holds key information about a trading position. It tracks the initial entry price using the `priceOpen` property, which is essential for calculating profits and losses.

The `_entry` array stores a history of all entry points for the position, including the price at which the trade was initiated, the total cost of the entry, and the timestamp of the entry. 

Similarly, the `_partial` array records any partial exits from the position, noting whether they were taken for profit or loss, the percentage of the position exited, the price at which the partial exit occurred, the cost basis at the time of closure, the number of units entered at the time of closure, and the timestamp of the partial exit.

## Interface ScheduledEvent

This data structure holds all the key information about trading events – whether they were scheduled, cancelled, or opened. Think of it as a complete record of what happened with a trade.

Each event includes details like when it occurred (timestamp), what type of action was taken (scheduled, cancelled, or opened), and the specifics of the trade itself, such as the symbol, signal ID, position type, and any associated notes.

You'll also find pricing information: entry price, take profit levels, and stop-loss levels, along with their original values if adjustments were made.

For more complex strategies, it includes details about DCA entries, partial closes, and unrealized profit and loss (PNL).

If a trade was cancelled, you'll find details about the reason and any associated cancellation ID. Other valuable data points include when the position became active and the original scheduled time of the signal.

## Interface ScheduleStatisticsModel

This model helps you understand how your scheduled trading signals are performing. It gives you a complete picture of what's happening with your scheduled signals, including when they’re created, activated, and cancelled.

You can see a list of every scheduled event, along with details about each one.

The model also provides key metrics like the total number of signals scheduled, activated, and cancelled.

It calculates important rates to evaluate your strategy, showing you the cancellation rate (how often scheduled signals are cancelled) and the activation rate (how often they turn into active trades).

Finally, it helps you understand timing by showing the average wait times for both cancelled and activated signals.

## Interface SchedulePingContract

The SchedulePingContract describes recurring events that occur during the monitoring of a scheduled trading signal. These events happen approximately every minute while a signal is active, meaning it's neither cancelled nor activated. 

Think of it as a heartbeat, letting you know the signal is still being watched.

The ping provides key details such as the trading pair (symbol), the name of the strategy managing the signal, and the exchange being used. It also includes the frame name (like a timeframe or date range for the run) and all the data associated with the signal itself, including original order details like entry and stop-loss prices.

You'll also find the current market price and whether the event is part of a backtest (historical data) or live trading. The `timestamp` tells you exactly when the ping happened, aligning with either the live market time or the historical candle's timestamp.

This framework allows you to build custom logic to react to these ping events, like automatically cancelling a signal if its price deviates significantly from the original entry price. You can subscribe to these events to build your own monitoring system.

## Interface ScheduleEventContract

This framework provides a way to keep track of signals that are scheduled for future execution, without needing to monitor every single signal. It's like getting notified when a signal is put on hold, or when it's removed before it ever runs.

The `ScheduleEventContract` lets you know when a signal is either scheduled for potential activation or when it's been cancelled.  You can use it to respond to these events through specific callbacks.

Here's a breakdown of what's included:

*   **Scheduled vs. Cancelled:** It tells you whether a signal was initially scheduled or if it was removed.
*   **Signal Details:** It provides information such as the trading symbol, the strategy that created the signal, the exchange and timeframe it relates to, and the full signal data.
*   **Reason for Cancellation:** If a signal is cancelled, you'll know *why* – whether it was a timeout, a price rejection, or because a user manually cancelled it.
*   **Current Market Price:**  You'll also get the current market price at the time of the event.
*   **Execution Mode:**  It indicates whether the event occurred during a backtest or in live trading.
*   **Timestamp:** You'll receive the precise time the event occurred, which is the real-time event time in live mode and the candle timestamp during backtesting.

Importantly, this contract *doesn’t* notify you when a signal actually starts running (activation). That information is handled through the regular signal emitters.

## Interface RiskStatisticsModel

This model helps you understand and track risk events during backtesting. It gathers information about rejections, which are instances where a trade was blocked due to risk management rules.

You'll find a complete list of all rejected events, along with the overall number of rejections that occurred.

To pinpoint where the most rejections are happening, the data is also organized by the trading symbol and the strategy being used. This allows you to easily identify areas needing attention or adjustment in your risk management approach.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It provides essential details about why the signal wasn't executed, helping you understand and refine your risk controls. 

You'll find information like a unique ID for the rejection, the timestamp of when it happened, and whether it occurred during a backtest or live trading. The notification also includes the trading symbol, the name of the strategy that generated the signal, and the exchange involved. 

A helpful explanation of the rejection reason is provided in the `rejectionNote` field, along with an optional unique ID for tracking purposes.  It also gives you current market conditions at the time of rejection, like the current price, and details of the intended trade, including the position size, take profit, stop loss, and any note about the signal itself. Finally, you can see when the notification was originally created.

## Interface RiskEvent

The RiskEvent data structure provides details about signals that were blocked due to risk management rules. It's used to create reports and understand why certain trades didn’t happen.

Each RiskEvent includes information like when the event occurred (timestamp), the trading pair involved (symbol), and specifics about the signal that was rejected (currentSignal). 

You’ll also find details about the strategy and exchange that generated the signal, along with the price at the time and the number of open positions. A unique ID (rejectionId) helps track individual rejections, and a note (rejectionNote) explains the reason for the block. Finally, it indicates whether the event originated from a backtest or a live trading environment.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation – it's a record of when the system blocked a trade because it exceeded a pre-defined risk limit. This contract is sent when a signal is stopped, rather than just any signal being generated, helping focus attention on actual risk management issues.

It includes key details about the rejected signal, such as the trading pair (symbol), the signal itself (position size, prices, etc.), and the name of the strategy that generated it. You’ll also find information about the timeframe used during backtesting and the exchange involved.

The contract also provides context regarding the market conditions at the time of rejection – the current VWAP price and the number of existing open positions. Each rejection receives a unique identifier (rejectionId) to aid in tracking and debugging, and a human-readable explanation (rejectionNote) clarifies why the signal was blocked. Finally, it marks whether the rejection occurred during a backtest or in live trading.


## Interface ProgressWalkerContract

This interface describes the progress updates you'll receive while a background process, like strategy testing, is running. Think of it as a notification system telling you how far along the process is. 

It includes details like the name of the walker (the process itself), the exchange being used, the frame, and the symbol being traded.

You’ll also see the total number of strategies the process needs to handle, how many have already been processed, and a percentage representing the overall completion. This lets you monitor the status of long-running tasks and estimate how much longer they have to go.

## Interface ProgressBacktestContract

This interface helps you monitor the progress of your backtests. It provides updates during the backtesting process, letting you know how far along the simulation is. Each update includes the exchange and strategy being used, the trading symbol, the total number of historical data points being analyzed, and how many have already been processed. You'll also see a percentage representing overall completion – a number between 0 and 100 – so you can track the remaining time needed.

## Interface PerformanceStatisticsModel

This model holds the aggregated performance data for a particular trading strategy. 

It includes the strategy's name, the total number of performance events that were tracked, and the overall time spent calculating those metrics. 

The `metricStats` property provides a breakdown of statistics, grouped by the type of metric being measured. 

Finally, the `events` property contains a complete list of all the individual performance events recorded, giving you access to the raw data.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how your trading strategies are performing by tracking the time it takes to complete different actions. It records details like when an action started and finished, what type of action it was (like order placement or data retrieval), and how long it took. This information is organized with labels like the strategy name, the exchange used, and the symbol being traded, allowing you to pinpoint slow operations or bottlenecks in your backtesting or live trading environment.  The timestamping allows you to easily compare performance across different events and identify trends. It distinguishes between backtest and live mode data too.

## Interface PauseContract

This interface represents an event that signals when a trading strategy is paused or resumed. It’s designed to keep users informed about the status of their automated trading, allowing for notifications like those sent via Telegram. 

When a strategy is paused, it temporarily stops opening new trades; however, any existing orders or signals remain active and can still be closed. 

The event provides details such as the trading symbol, whether the strategy is paused or resumed, the time of the change, the strategy and exchange names, the timeframe being used, and importantly, whether the event originates from a backtest or a live trading environment. This helps distinguish between simulated and real-world trading activity.

## Interface PartialStatisticsModel

This model holds statistics related to partial profits and losses during a trading backtest. Think of it as a snapshot of how often your strategy has achieved partial gains or experienced partial setbacks.

It breaks down the data into a few key pieces:

*   A list of all the individual profit/loss events that occurred, each with its own details.
*   The total number of events, encompassing both profits and losses.
*   A count of how many times your strategy generated a profit.
*   A count of how many times your strategy experienced a loss.

These figures help you understand the frequency and balance of partial successes and failures in your trading strategy's performance.

## Interface PartialProfitContract

This describes events that happen when a trading strategy reaches certain profit milestones, like 10%, 20%, or 30% gain. These events help you keep track of how well your strategy is performing and when it's taking profits along the way.

You'll see information about which asset (like BTCUSDT), strategy, and exchange the profit milestone happened on. The data includes the original prices set when the trade started, and the current market price at the time of the milestone.

The `level` property tells you exactly which profit level was reached, and a `backtest` flag indicates whether it was a historical simulation or a live trade.  A timestamp is also provided to indicate when the level was reached. Multiple profit levels can trigger at once if the price moves rapidly. These events are unique to each signal and aren’t repeated.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit-taking action has occurred within your trading strategy, whether it's a backtest or a live trade. It provides a wealth of detail about the trade, including a unique identifier, the exact time it happened, and whether it was part of a test or real money execution. You'll find information about the trading pair, the strategy used, and the exchange involved.

The notification also gives you a full breakdown of the position itself: its entry and take profit/stop loss prices (both original and adjusted for trailing), the number of entries and partials involved, and comprehensive profit and loss data, including peak profit, maximum drawdown, and associated costs and percentages. It even tracks the prices and entry counts at those peak and drawdown moments. Finally, there's a place for a brief explanation of why the partial was triggered, along with timestamps for signal creation, scheduling, and pending status.

## Interface PartialProfitCommit

This object represents a partial profit-taking event during a backtest simulation. It provides a detailed snapshot of the position’s performance and the circumstances surrounding the decision to take a portion of the profits.

You'll find information like the percentage of the position being closed, the current market price at the time of the action, and the profit and loss (PNL) realized so far.

The record also includes key performance metrics for the entire position up to that point, such as peak profit and maximum drawdown, allowing you to analyze its overall risk profile.

Details like the original entry price, take profit, and stop-loss levels (along with any adjustments made through trailing) are available. Finally, timestamps indicate when the signal was created and when the position initially activated.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress and understand how your strategy is performing. The notification includes a unique ID, a timestamp, and details about whether it’s from a backtest or live trading.

You’ll find information about the trading pair (like BTCUSDT), the strategy used, and the specific profit level achieved. It also provides key data points like the current market price, the original entry price, and details about any stop-loss or take-profit orders.

The notification also gives you a snapshot of the trade's performance, including the total profit/loss, peak profit achieved, maximum drawdown experienced, and the number of entries and partial closes involved.  You can also see the prices and costs associated with the trade, as well as details surrounding peak profit and maximum drawdown events, including when they happened.  Finally, there's an optional note field for a human-readable explanation of why the signal triggered.

## Interface PartialLossContract

The PartialLossContract represents notifications of a strategy hitting predefined loss levels, such as -10%, -20%, or -30% drawdown. It's a way to keep track of how much a strategy has lost during trading.

These notifications, or events, are triggered when a strategy's loss reaches these milestones and are specific to a particular trading pair, strategy, exchange, and frame.  You'll get one notification per loss level for each signal, even if prices drop dramatically in a short time.

The information included with each notification tells you exactly what happened: the trading symbol, the strategy involved, where the trade is executing, the current price when the loss level was reached, the loss level itself (like -20%), and whether it's part of a backtest or live trade. It also provides the original signal details and a timestamp to mark when the loss level was detected, which differs slightly depending on if it’s a backtest or live execution. This data is valuable for monitoring strategy performance and generating reports.

## Interface PartialLossCommitNotification

This notification lets you know when a partial closing of a trading position has happened. It provides a wealth of information about that closing, including a unique identifier, the exact time it occurred, and whether it was a backtest or a live trade. You'll see details like the trading pair involved, the strategy that triggered the action, and crucially, the percentage of the position that was closed.

Beyond the basics, the notification includes the current market price at the time of execution, the trade direction (long or short), and all the original pricing details like entry and stop-loss levels before any trailing adjustments. It also tracks the total entries and partials executed for the position, alongside comprehensive profit and loss data including peak profit, maximum drawdown, and related pricing information.  Finally, there's a place for a human-readable note to explain the reason behind the signal, plus timestamps related to signal creation and pending states.

## Interface PartialLossCommit

This object represents a situation where a portion of a trading position is being closed due to a partial loss event. 

It provides detailed information about the trade that led to this event. You'll find the action type explicitly stated as "partial-loss."

The `percentToClose` indicates what percentage of the position is being reduced. Crucially, it includes the current market price (`currentPrice`) at the time of this action, along with the position's total profit and loss (`pnl`) since inception, as well as the highest profit (`peakProfit`) and largest drawdown (`maxDrawdown`) experienced.

The object also specifies the trade direction (`position`), the entry price (`priceOpen`), and the original and adjusted take profit and stop loss prices (`priceTakeProfit`, `originalPriceTakeProfit`, `priceStopLoss`, `originalPriceStopLoss`). The timestamps (`scheduledAt`, `pendingAt`) log when the signal was created and when the position was activated.


## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss level, like -10%, -20%, or -30% of the initial investment. It's a way to track how a trade is performing and potentially trigger actions based on the level of loss. 

The notification provides a wealth of information about the trade, including a unique identifier, when it occurred, whether it's a backtest or live trade, the trading pair involved, and the specific strategy and exchange used. It details the trade's direction (long or short), entry and stop-loss prices, and the performance metrics like profit and loss, peak profit, and maximum drawdown. 

You'll find details about how the position was built, including the number of entries (for averaging strategies) and partial closes executed, as well as prices and costs at various points in the trade’s lifecycle. This allows you to analyze the trade's trajectory and optimize strategy parameters. The notification also includes an optional note field for adding context or reasoning behind the signal.

## Interface PartialEvent

This data structure, called `PartialEvent`, holds all the important details about a profit or loss milestone during a trade. It's designed to give you a complete picture of how a trade is performing, allowing for detailed reports and analysis.

Each event records things like the exact time it happened, whether it was a profit or a loss, and which trading pair was involved. You’ll also find information about the strategy and signal that triggered the trade, along with specifics about the position's entry and exit points, including take profit and stop-loss levels - both as initially set and as they were originally defined.

If the strategy used a dollar-cost averaging (DCA) approach, the data will also include the total number of entries and the original entry price before averaging. The number of partial closes and the total executed percentage from them are tracked as well. Furthermore, it captures the unrealized profit and loss at that point, a note to explain the signal's reasoning, the time the position became active, the signal's creation timestamp, and whether the trade occurred in backtest or live mode.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or through a scheduled order. It's a key signal for understanding what's happening with your automated trading strategies, whether you're running tests or live trading.

The `type` property confirms this is an "order_sync.open" event.  You'll see details like the unique `id` and `timestamp` of the opening event.

The notification provides a wealth of information about the trade:

*   The `symbol` identifies the asset being traded (e.g., BTCUSDT).
*   `strategyName` tells you which strategy triggered the trade.
*   `exchangeName` indicates where the order was placed.
*   `signalId` is a unique identifier for the specific signal.
*   `orderType` distinguishes between immediate order fills ("active") and orders placed as part of a scheduled signal ("schedule").

Crucially, the notification includes performance metrics like `pnl` (profit/loss), `peakProfit`, `maxDrawdown`, and related percentages and prices. This allows you to track the trade’s performance from the start.

Other properties detail the order specifics like entry price, stop-loss and take-profit levels, total entries (for DCA), and timestamps for scheduling and activation. Finally, there's a `note` property for adding custom explanations and a creation timestamp for record-keeping.

## Interface OrderSyncCloseNotification

This notification tells you when a pending trading signal has been closed, whether automatically or manually. It provides a wealth of information about the closed position, including details like the trading pair, the strategy that generated the signal, and when it was created. You’ll see key metrics like profit and loss (both absolute and percentage), peak profit achieved, and maximum drawdown experienced.

It also includes specifics about the order itself, such as the entry and exit prices, original take profit and stop loss levels, and the number of entries and partials involved. Finally, it specifies *why* the signal closed—whether it was a take profit or stop loss being hit, the order timed out, or it was closed manually. The `backtest` property indicates if this event occurred during a simulated backtest or in live trading.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an open order related to a trading signal, sent periodically to confirm its continued validity with the external order management system. It's a “ping” to ensure the order hasn't been unexpectedly cancelled or modified.

These notifications are throttled to prevent excessive communication, ensuring they’re sent no more than once every 15 minutes per signal. You’ll receive them only when actively monitoring a signal (live mode), not during backtesting.

The notification contains a wealth of information about the order, including its type (active position or scheduled order), pricing details (original and adjusted prices for take profit, stop loss, and entry), and detailed performance metrics like profit/loss, peak profit, and maximum drawdown.  It also includes data about DCA entries and partial closes. The `scheduledAt` and `pendingAt` fields record the dates the signal was created and became active. A `note` field allows for optional human-readable explanations for the signal's reasoning.

## Interface OrderSyncBase

This defines the common information shared across different order synchronization events within the trading framework. It helps you track what's happening with your orders, whether they're actively trading or related to scheduled signals. 

You’ll find details like the trading symbol, the name of the strategy that generated the signal, and the exchange it was executed on. Importantly, it indicates if the activity is part of a backtest or live trading scenario.

Each event has a unique signal ID and timestamp. A key piece of information is the `attempt` counter, which tracks how many times the framework has tried to execute an order for a particular signal. This helps manage retries in case of errors, ensuring reliable order placement. The `type` property clarifies the kind of order synchronization being reported.

## Interface OrderStopContract

This event, `OrderStopContract`, signals that a trading order associated with a specific signal has been terminated. It’s essentially the final confirmation that the order is no longer active on the exchange. You'll receive this notification right before the system cleans up any remaining traces of the signal.

The reason for termination can be either because the order was unexpectedly removed (perhaps due to an external cancellation – `deleted`) or because the system gave up trying to execute the order after multiple failures (`exhausted`). It contains a wealth of information about the signal, its parameters, the trade direction, and performance metrics like profit and loss, peak profit, and maximum drawdown.  Because this event only occurs in live trading, the `backtest` property will always be false. It gives detailed information on the position's entry price, take profit, stop loss levels, and the number of entries/partials executed. This is a notification-only event; any errors during processing are handled internally and won't disrupt the overall system.

## Interface OrderStopCheckNotification

This notification signals the end of a monitored order check, a critical event related to either an active position or a scheduled order. It's a terminal event, meaning it happens only once and indicates a definitive resolution – either the order was deleted (meaning it can't be found) or the check failed too many times.  You'll receive this notification live, never in backtests.

The notification contains a wealth of information about the order, the signal that triggered it, and the current state of the related position.  It includes details like the trading pair, strategy name, and the unique identifiers for the signal and order. 

Crucially, it specifies whether the order was an "active" order (associated with an open position – it will be closed) or a "schedule" order (which will be canceled). The `reason` property tells you *why* the check ended ("deleted" or "exhausted").  You'll also find detailed performance metrics – things like peak profit, maximum drawdown, and P&L calculations - offering a snapshot of the position’s journey.  Numerous price-related details provide insights into the order’s lifecycle, including original pricing and adjustments made by averaging (DCA).  Timestamps track key events, from signal creation to when the position went pending. Finally, an optional `note` field provides a human-readable explanation of the signal's reason.

## Interface OrderRejectOpenNotification

This notification signals that a trading order was definitively rejected by the exchange, meaning it's not worth trying again. It happens only when the system definitively knows the order won't go through, and it's a live-only event – you won’t see it in backtests. The notification contains a wealth of information about the rejected order, including the reason for the rejection, the signal that triggered it, and performance metrics like peak profit, maximum drawdown, and P&L details. You'll find details about the original order parameters, like take profit and stop loss prices, along with information about any DCA entries and partial closes. It's designed to give you a comprehensive understanding of why the order failed and what the position’s performance looked like before it was rejected.

## Interface OrderRejectOpenContract

This describes what happens when an order to open a position or schedule an entry is permanently rejected. It means the attempt to trade is completely stopped, and the signal that triggered the order is used up.

The `action` property tells you *what* was rejected – either an order to open a position directly or a scheduled entry.  The `cost` property indicates the overall financial cost associated with the rejected order.

## Interface OrderRejectCloseNotification

This notification signals that a close order was rejected by the broker—essentially, a forced closure didn't go through. It only happens when a close attempt fails completely, not when there are temporary issues. Think of it as a notification that something went wrong when the system tried to close a position.

Here's what the notification tells you:

*   A unique identifier for this specific rejection event.
*   When the rejection happened.
*   The trading pair involved, the strategy that generated the signal, and the exchange that rejected the order.
*   Details about the order itself, like its type (always "active" for closes) and the number of previous attempts.
*   A clear explanation of *why* the broker rejected the order, which is a helpful error message.
*   Current market conditions (price, P&L snapshots, peak profit, and maximum drawdown).
*   Information about the original order, including entry, take profit, and stop loss prices.
*   Details on the position's history, such as the number of entries and partials.
*   Timestamps for signal creation, activation, and notification creation.
*   The reason the close was attempted (take profit, stop loss, or time expiry).
*   An optional note to provide more context about the signal.

Because this rejection happens only in live trading environments, the `backtest` field is always false.

## Interface OrderRejectCloseContract

When a trading strategy attempts to close a position, but the system absolutely cannot fulfill that request, this `OrderRejectCloseContract` signals a definitive rejection. Think of it as the engine saying, "No, I can't close this right now, and here’s why." 

The `action` will always be "signal-close" to clearly indicate this is a rejection related to closing a position. 

The `closeReason` provides details about the specific issue preventing the close, explaining why the engine is force-closing the position. It’s important to understand the `closeReason` to diagnose and address the problem.

## Interface OrderRejectBase

This describes events that occur when an order is definitively rejected by the exchange – meaning it's not something that will resolve itself with a retry. These events are crucial for understanding why your trades aren't going through and can help you debug issues with your strategies or broker connections. You’ll only see these in live trading, not during backtesting.

Here’s a breakdown of what the event represents:

*   **When it Happens:** It signals a permanent failure to open or close a position and is a last resort outcome, meaning attempts to fulfill the order have failed. It's a notification sent after the system has determined the order *cannot* be executed.
*   **Types of Rejections:** There are two types:
    *   *Active Order Rejection:* Relates to immediate open, activation or close orders.
    *   *Scheduled Order Rejection:* Applies to orders placed in advance when creating a new signal.
*   **What Information is Provided:** The event provides a wealth of data, including:
    *   The reason for the rejection (the broker's specific error message).
    *   Details about the signal and position involved (symbol, strategy name, trade direction, price levels).
    *   A snapshot of the position’s performance (PNL, peak profit, drawdown).
    *   Timestamps and identifiers for tracking the order's lifecycle.
*   **Why it’s Important:** This event is designed to provide clarity on why an order failed. It lets you understand what went wrong and adjust your strategy or settings accordingly. The `message` field gives you the most direct explanation from the exchange.

## Interface OrderOpenContract

This event, `OrderOpenContract`, is triggered when a limit order placed by the trading framework is filled – essentially, when the exchange allows the trade to happen. It's a key signal for keeping external systems in sync with what's happening in the trade. 

Think of it as confirmation that a buy or sell order you set up has actually been executed.

During backtesting, this event occurs when the candle's low is at or below your intended buy price (for long positions) or the candle’s high is at or above your intended sell price (for short positions). In live trading, it’s fired when the exchange confirms the order is filled.

The event provides a wealth of information, including the current market price, the trade direction (long or short), the entry price, take profit and stop-loss prices, the position's profit and loss, and detailed information about any averaging or partial closes that occurred. You can also see when the order was initially scheduled and when the position was activated. It’s particularly useful for audit trails, external order management, and logging.

## Interface OrderFillOpenNotification

This notification signals that a trade has been confirmed by the exchange – it's a definitive confirmation of an order being filled or a resting order being placed. It's a crucial event, arriving *after* initial synchronization and only when the exchange has truly processed the order. Importantly, you won’t receive these notifications in backtest mode as they are live-only.

The notification contains a wealth of information: a unique ID, timestamp, the trading symbol, the strategy involved, and details about the order type (whether it was a filled position or a resting order).  You'll also find data about performance, including profit/loss (PNL), peak profit, maximum drawdown, and a breakdown of entries and prices.  

Detailed information on the position's details such as the original and current prices, take profit, stop loss and entry prices are available. Lastly, information about the signal creation and position activation are provided. This comprehensive data allows you to analyze trade performance in detail and understand the events leading to the trade's outcome.

## Interface OrderFillOpenContract

This object represents a confirmation from your broker that a trade has either been executed or scheduled. It tells you that a new position has been opened, or an order to open a position has been placed.

The `action` property specifies the type of confirmation: either a filled order ("signal-open") meaning the trade is active, or a scheduled order placement ("schedule"). 

You'll also find the `cost` which represents the total cost associated with establishing that position.

## Interface OrderFillCloseNotification

This notification confirms that a trade has definitively closed on the exchange, representing the final, confirmed execution of an exit order. It’s a crucial piece of information that arrives *only* after the exchange has acknowledged the order's completion. You won't see this notification for rejected orders or force closures – only when the trade genuinely happened.

The notification contains a wealth of details about the closed trade. It includes a unique identifier, the exact time of confirmation, and key performance metrics like profit and loss (PNL), peak profit, and maximum drawdown, all calculated for the position’s lifespan. You’ll find information about the trade’s direction (long or short), the entry and exit prices, and even the original prices before any adjustments. It also provides data on the number of entries (for dollar-cost averaging) and partial closes performed. The reason for closing—whether it was a take profit, stop loss, or time expiration—is clearly indicated, alongside any optional notes explaining the signal. Finally, it provides timestamps showing when the signal was initially created, when the position was activated and when the notification itself was generated.

## Interface OrderFillCloseContract

This object represents when a trading position is closed due to an order fill, meaning the order to exit the trade has been executed. It's a confirmation from the broker that the exit happened, whether it was triggered by a stop-loss, take-profit, a timer, or a manual instruction. 

The `action` field will always indicate "signal-close" to identify this type of event. 

The `closeReason` provides details about *why* the position was closed, giving context to the exit.

## Interface OrderFillBase

This describes the information you receive when a trade is confirmed – it's like a notification after the broker has actually executed an order on an exchange. This isn't a signal that an order *attempted* to go through; that's a different kind of notification. It's also important to note that you won't see these notifications during backtesting or if an order is rejected or fails to execute completely.

Here's what information you'll get with each confirmed trade:

*   **Type:** Whether it's an "active" trade (opening or closing a position) or a "schedule" trade (an order placed related to a scheduled signal).
*   **Details:** The trading symbol, the strategy name that initiated the trade, the exchange used, the timeframe, and a unique identifier for the signal that triggered it.
*   **Timing:**  When the confirmation happened, the signal’s creation timestamp, and when the position was activated.
*   **Trade Data:** The direction of the trade (long or short), the entry price (and how it might have been adjusted through averaging), take profit and stop loss prices (both the adjusted and original values), and the number of entries and partial closes.
*   **Performance:** Information about the profit/loss, peak profit, and maximum drawdown for the position.
*   **Attempts:** The number of times a trade attempt failed before this confirmation.

Essentially, this notification provides a complete audit trail of confirmed trades, including price data, signal details, and performance metrics.

## Interface OrderContinueContract

This event signals that the framework is continuing to monitor an order – it hasn't stopped or closed it yet. It's a follow-up to an initial check on the order, and it lets you know the order is still considered open and being tracked. The 'type' property tells you whether it's an order linked to an active position or a pending entry order. The 'attempt' number indicates how many times a check has temporarily failed but the order is still being tolerated – a higher number means more temporary failures. 

You'll receive these notifications while the order is still open and being monitored, providing a stream of updates on its status. Keep in mind that these checks only happen in live environments, not during backtesting. All the relevant information about the order, including its performance metrics (like profit and loss, drawdown, and entry/exit prices) are included in the data. The event also provides details like the strategy name, exchange, timeframe, and original order parameters.

## Interface OrderContinueCheckNotification

This notification provides updates about the health of an order being monitored by your trading system. It's sent when a check on that order isn't immediately resolved, meaning it's still active or a minor hiccup was handled.

Think of it as a "status check" – it lets you know if an order is still going, and if there were any temporary issues along the way.

Here's a breakdown of what the notification tells you:

*   **Key Details:** It includes the order's unique ID, when the check happened, what trading pair it's for, which strategy generated it, and where it's being executed.
*   **Order Type:**  It specifies whether it's an "active" order (backing an open position) or a "schedule" order (waiting to be triggered).
*   **Check Status:** The `attempt` field shows if any temporary errors were tolerated during the check; a value greater than zero means there was a brief issue.
*   **Financial Performance:** You'll get information on the position's performance - including unrealized profit/loss, peak profit, and maximum drawdown - all calculated up to the point of the check.
*   **Pricing Information:** The notification provides details on the prices used for the order, including original and effective prices for entries, take profit, and stop loss levels.
*   **Timestamps:** It shows when the signal was created, when it became active, and when the notification itself was generated.
*   **Notes:** There's even an optional free-text field for any notes about why the signal was triggered.

Essentially, it's a continuous stream of information about your orders, helping you monitor their progress and react to any problems that might arise.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, expiring, or because a user manually closed it. It's designed to help external systems keep track of what's happening with trades and record important details. 

The event provides information like the current market price at the time of the close, the profit and loss (both total and peak) for the entire position, and whether the trade was a long (buy) or short (sell) one. You'll also find details about the original entry and stop loss/take profit prices, as well as the prices used at the time of closing. 

Additional data includes when the signal was created, when the position started, the reason for the close, and the number of times the position was averaged (through DCA) or partially closed. This complete picture allows for accurate tracking and reconciliation of trading activity.

## Interface OrderCheckContract

The `OrderCheckContract` event is a crucial part of how the framework keeps track of orders placed by your trading strategies. Think of it as a regular check-in with your exchange to make sure an order is still active, whether it's a pending order waiting to be filled or a position that’s already open.

It’s fired periodically while a signal is active, asking your exchange if the corresponding order still exists. You, or your broker adapter, need to respond to this check.

If your exchange confirms the order is still good, things continue as normal. However, if the order is gone—perhaps it was filled, cancelled, or liquidated—the framework will handle it automatically, either closing the pending signal or cancelling the scheduled order. 

Transient issues, like temporary network problems, are tolerated, but repeated failures will ultimately lead to the order being handled as if it were gone. Backtest mode doesn't use this event because there's no live exchange to query.

The event provides a wealth of information, including the symbol, strategy name, exchange, timeframe, the signal’s ID, its creation timestamp, its current P&L, and details of the original and adjusted prices for entry, take profit, and stop loss. It also tracks the number of consecutive failed checks, allowing for more graceful handling of intermittent problems. Each property gives insight into the state of the signal and its associated order.

## Interface MetricStats

This object neatly packages performance statistics for a particular metric. It provides a complete picture of how that metric behaved during a backtest.

You'll find key details like the total number of times the metric was recorded, the total time it took across all instances, and the average duration. 

It also includes vital information about the range of durations – from the minimum to the maximum – and statistical measures like standard deviation, median, and percentiles (95th and 99th). 

For metrics related to events or waits, it also shows the average, minimum, and maximum wait times between those events, giving you a more nuanced understanding of the system's timing.


## Interface MessageModel

This framework defines a `MessageModel` to represent a single turn in a conversation with a large language model. Each message has a `role`, indicating whether it’s a system instruction, user input, assistant response, or a message related to a tool. The core of the message is its `content`, which is the actual text being communicated.

Sometimes, assistant responses will include a `reasoning_content` – this provides extra details about the model's thought process. If the assistant used tools to generate a response, those tool interactions are listed in the `tool_calls` array.  Messages can also contain images, which are represented as blobs, raw bytes, or base64 encoded strings. Finally, if a message is a direct response to a specific tool call, it will have a `tool_call_id` linking it back to that interaction.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a backtest. It essentially tracks the biggest losses experienced. 

The `eventList` property contains a detailed record of each drawdown event, arranged from the most recent to the oldest.  You can look through this list to understand the timing and magnitude of those losses.

The `totalEvents` property simply provides the overall count of drawdown events that occurred during the backtest period.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown experienced during a trading position. It provides detailed information about when and how the drawdown occurred.

Each event includes the precise timestamp when it was recorded, along with the trading symbol, the name of the strategy used, and a unique identifier for the signal that triggered the trade.  You’ll also find the position type (long or short), the total profit and loss (PNL) of the position, the highest profit achieved, and the maximum drawdown itself.

Furthermore, the event contains the price at which the drawdown was reached, the original entry price, and the set take profit and stop loss prices. A flag indicates whether the event arose from a backtesting simulation.


## Interface MaxDrawdownContract

This contract provides information when a new maximum drawdown occurs for a trading position. It delivers details about the symbol involved, the current price at the time of the drawdown, and a timestamp for tracking. You’ll also receive the names of the strategy, exchange, and frame being used.

The included signal data offers insights into the specific trade contributing to the drawdown. Importantly, a flag indicates whether this drawdown event happened during a backtest or live trading.

This information is invaluable for monitoring risk, building dynamic risk management systems, and reacting to changing market conditions – for example, you could automatically adjust stop-loss orders when a certain drawdown threshold is met. The framework actively sends these updates whenever a new drawdown level is detected.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance. It tracks a wide range of statistics, from the raw number of trades to sophisticated risk-adjusted return metrics. 

The `eventList` gives you a complete record of every trade, while properties like `totalEvents`, `winCount`, and `lossCount` give you the basic trade summary. You can see how well your strategy is doing with the `winRate`, `avgPnl`, and `totalPnl`, and get a sense of the volatility with `stdDev`.

Beyond the basics, it calculates metrics like the Sharpe Ratio and Sortino Ratio to evaluate your risk-adjusted returns, and even considers factors like average trade durations and consecutive win/loss streaks. The model also provides insights into market pressure with metrics like `buyerPressure` and `sellerPressure`, and visualizes the overall trend with `trend` and `trendStrength`. If any calculation results in an unsafe value (like dividing by zero), the corresponding property will be null.

## Interface InfoErrorNotification

This notification lets you know about problems that happen while things are running in the background, but aren't critical enough to stop everything. 

Think of it as a heads-up about something that needs attention. 

Each notification has a specific type, a unique ID to track it, and a detailed error object including what went wrong and extra information. There’s also a clear message explaining the issue in a way that’s easy to understand. Importantly, these notifications always come from the live trading environment, not a simulated backtest.

## Interface IdlePingContract

The IdlePingContract represents events that occur when a trading strategy isn't actively responding to any signals. 

It's like a heartbeat, letting you know a strategy is in a waiting or idle state. 

This event provides details such as the trading symbol, the name of the strategy, the exchange it's running on, and whether it's part of a backtest or live trading. 

You can use this information to monitor the lifecycle of your strategies and understand when they're not making trades.

The data includes the current price at the time of the ping and a timestamp that's either the live tick time or the candle timestamp in backtest mode.


## Interface IWarmCandlesParams

This interface defines the settings needed to pre-load historical candle data for your backtests. Think of it as a way to prepare your trading environment by downloading the past price action. You’ll specify the trading pair you're interested in, like BTCUSDT, and tell the system which exchange to use and the time interval of the candles you need, such as 1-minute or 4-hour candles. Importantly, you'll also define a start and end date to specify the historical period you want to download. This ensures your backtest uses a complete dataset from the very beginning.

## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest. It bundles together essential information about that strategy's performance.

You'll find the strategy's name, allowing you to easily identify it. 

The `stats` property holds a detailed set of backtesting statistics, giving you a comprehensive look at how the strategy performed.

A single `metric` value represents the performance indicator used for comparing strategies – it might be null if the strategy wasn't valid for calculation.

Finally, the `rank` tells you where the strategy stands relative to others in the comparison, with 1 signifying the best performer.


## Interface IWalkerSchema

The Walker Schema lets you set up A/B tests comparing different trading strategies. Think of it as defining a specific experiment you want to run.

You give each experiment a unique identifier, a description for your own reference, and specify which exchange and timeframe you'll be using for all the strategies involved.

Crucially, you list the names of the strategies you want to compare—these strategies need to have been previously registered with the system.

You can also choose which metric—like Sharpe Ratio—you want to optimize during the backtest.  Finally, you have the option to add custom callbacks to trigger certain actions at different points during the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered when a backtest walker has finished comparing different trading strategies. It tells you which symbol was being tested, which exchange was used for the data, and the name of the specific walker that ran the tests. You'll also find the name of the timeframe (like "1m" for one-minute candles or "1d" for daily data) used for the backtesting. This provides a clear snapshot of the environment in which the strategies were evaluated.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process and get notified about important events. Think of it as a way to observe and potentially react to what's happening during your backtest runs.

You'll receive a notification when a particular strategy begins testing (`onStrategyStart`), and again when it finishes (`onStrategyComplete`), along with performance statistics and a key metric. If an error occurs during a strategy's testing, the `onStrategyError` callback will be triggered, giving you a chance to handle it. Finally, once all strategies are done, the `onComplete` callback delivers the consolidated results. 


## Interface ITrailingTakeCommitRow

This interface represents a queued action for a trailing take commit, a strategy often used in trading to automatically adjust take profit levels based on price movements. 

It essentially describes a specific instruction to adjust a trade's take profit.

The `action` property clearly identifies this as a "trailing-take" action.  The `percentShift` defines how much the take profit should be moved based on a percentage change in the price.  Finally, `currentPrice` stores the price at which the trailing take profit was initially established, providing context for the shift calculation.

## Interface ITrailingStopCommitRow

This interface describes a queued action related to a trailing stop order. It essentially represents a record of a trailing stop adjustment that needs to be processed.

You'll find details about the action being taken – specifically, it’s a "trailing-stop" action. The `percentShift` property tells you the percentage change applied to the trailing stop. Finally, `currentPrice` indicates the price at the time the trailing stop was initially established.

## Interface ISweepTrade

The `ISweepTrade` interface describes a single trade executed within the backtest framework. Each trade record includes information like the `ideaId` that initiated it and the `symbol` being traded. It also tracks who `author`ed the original idea, allowing for easy analysis of performance by individual authors. 

You’ll find key timing details like the `entryTimestamp` and `exitTimestamp`, along with the `exitReason` explaining why the trade was closed. The `holdMinutesActual` specifies how long the trade was held.

Performance metrics are represented by `pnlPercent`, indicating the profit or loss as a percentage. Finally, `absorbedIdeas` provides a list of ideas that were superseded by this trade, giving you insight into how different signals interact during a single trade.

## Interface ISweepTrack

The `ISweepTrack` represents a single author's performance under a specific trading rule. Think of it as a detailed report card for how one person does when following a particular set of instructions.

Each track line describes a unique combination of rule parameters—like how long a position is held, the lock and stop percentages, and the trailing take percentage—along with the author’s login. 

It includes key performance metrics like the total number of ideas the author generated, the number of those ideas that resulted in a win (where either the lock or trailing arm triggered before the hard stop), and a calculated hit rate (wins divided by total ideas).  

The data focuses on continuous performance rather than a simple pass/fail, providing a more granular view that allows you to assess and filter authors based on their individual track records. This structure emphasizes flexibility, letting users decide who to trust rather than forcing a pre-defined trust level.

## Interface ISweepSchema

This schema defines how a sweep (a specific testing configuration) is registered within the backtest-kit framework. Think of it as a blueprint for a particular backtest run.

Each sweep needs a unique name, and it specifies which exchange to pull historical price data from. Be aware that the exchange data source must provide exactly the number of candles it expects, or the test will error out.

You can customize the grid axes (parameters like profit target, stop loss, etc.) for a sweep, overriding the default settings. A single value for an axis "freezes" it, meaning that particular parameter won’t be swept through different values.

The order in which test results are ranked and reported is controlled by the `reportOrder` property. It defaults to "sharpe," but can be adjusted.

Finally, the `callbacks` section allows you to hook into different points in the sweep's lifecycle. These callbacks are optional; if you don't provide one, it simply won't be triggered. One specific callback, `onAuthorsTrained`, only triggers once for each unique combination of grading rules (like hold, stop, trailing, etc.).

## Interface ISweepResult

The `ISweepResult` object provides a complete picture of a backtesting simulation’s outcome. It bundles together a single report bucket which details the performance of each grid point based on profit before stop, along with rankings of top performers and information about which authors contributed ideas. 

You’ll find data within this result, such as the total number of ideas processed, and how many of those were directional (meaning not neutral). The result also tracks the creation of idea profiles, which are built using candle data, as well as noting any profiles that were cut short due to the end of available candle data.

Furthermore, this object includes statistics regarding trade holding times - the average and the 95th and 99th percentile – giving insight into how long trades were held for across all grid points. Finally, the `reports` property itself contains detailed information on how each grid point performed and the contributions of different authors.

## Interface ISweepPointReport

This report summarizes the performance of a single grid point within a backtest. It provides a comprehensive view of the trading activity at that specific point, including how many trades were skipped due to author availability. 

The report details key profitability metrics like total and average profit percentages, win rate, and profit factor (a measure of gross profit relative to gross loss). It also highlights risk metrics such as maximum drawdown and recovery factor, indicating potential losses and the ability to bounce back. 

You'll find information on typical trade durations through average and percentile holding times.  Performance is also evaluated using Sharpe and Sortino ratios, which factor in the time value of money and downside risk, respectively. 

Finally, the report breaks down the reasons for trade exits and includes a complete list of all trades executed at that point, allowing for a deep dive into individual trade history and understanding the "why" behind the reported results. The trade list is consistent across all reports, ensuring traceability.

## Interface ISweepParams

The `ISweepParams` object holds the settings used when running a sweep. Think of it as the central configuration for your sweep process.

It includes a `logger` for providing informative messages during the sweep's execution, allowing you to track its progress and identify potential issues.

The `gridAxes` property defines the ranges and increments used to explore different parameter combinations within your sweep, and it’s guaranteed to have default values.

Finally, `reportOrder` specifies how the sweep results will be ranked and presented, ensuring a consistent and meaningful reporting structure.

## Interface ISweepMetricReport

This report represents a single, comprehensive evaluation of a trading grid. It bundles together all the data from a single pass through the grid, focusing on a single performance metric (profit before stop).

It contains a list of reports, each describing a specific grid point and its ranking based on that metric. These reports are organized from the best performing to the worst.

The report also highlights the top performers based on four separate ranking criteria, providing a quick view of the best overall strategies.

Finally, it includes "tracks," which are summaries of how different trading rules (like holding periods, lock-in strategies, stop-loss orders, and trailing stops) performed in combination with specific authors or systems. These tracks offer detailed, raw performance data – not simple yes/no decisions – and are designed to be compact and easily searchable.

## Interface ISweepIdeaProfile

This `ISweepIdeaProfile` represents the performance of a trading idea over a set period. It holds all the historical price data – the "candles" – for that specific idea, starting from when it was initiated.

Think of it as a record of how the idea's price moved, and it’s calculated only once at the beginning, not recomputed later for each individual trading decision.

The profile includes several key statistics: whether the idea was ultimately profitable ("hit"), the largest gains and losses experienced ("maxMfePercent," "maxMaePercent"), and how long it took to reach those points ("minutesToMfe," "minutesToMae"). It also measures the "shakeout" – the deepest price drop before a potential profit – and the typical price movement ("medianMovePercent"). These are all summaries of the idea's performance that can be used for evaluation, but the core grading process uses the raw price data.

Finally, a flag indicates if the data was incomplete ("truncated").

## Interface ISweepIdea

This interface defines a single trading idea, representing a public forecast from an author. Think of it as a snapshot of someone’s prediction about a particular trading pair, like BTCUSDT. Each idea has a unique identifier, a timestamp marking when it was published, and details about the trading pair and the direction the author believes it will move. The simulation process actually steps through candles based on these ideas, rather than focusing on grid points.

## Interface ISweepGridPoint

This interface describes a single point on a grid within a backtest strategy. 

Each point defines specific risk management parameters to be applied. 

You'll find settings here like the hard stop level (expressed as a percentage from the entry price), a trailing take profit mechanism, the maximum time a position can be held, and an optional profit lock feature that can automatically trigger an exit based on price movements. These properties help to define how aggressively or conservatively each grid point will manage its trades.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines the ranges of values to be tested for key trading parameters like stop loss, take profit, hold time, and profit lock. It's essentially a blueprint for how the backtest explores different combinations of these settings to find an optimal strategy.

Each property—`hardStopPercent`, `trailingTakePercent`, `holdMinutes`, and `profitLockPercent`—represents a different aspect of how a trade can be exited. The values you provide in these arrays determine the range of potential exit points that will be considered during the backtest.

The `hardStopPercent` defines how far a trade can fall before a forced exit is triggered. The `trailingTakePercent` dictates how much of a price increase a trade can give back before a trailing take profit is activated. `holdMinutes` controls the maximum amount of time a trade can remain open. Finally, `profitLockPercent` sets a fixed profit level that, once reached, locks in that gain and prevents it from being lost.

Importantly, there are specific scenarios where certain axes are ignored or become inactive, and these conditions are thoroughly documented. For instance, if the `trailingTakePercent` is set to 0 or a very high value, the trailing take profit essentially becomes unreachable, impacting the grading of the trading rules. Every parameter plays a role in evaluating the performance of the trading strategy, and its absence or unusual values have specific consequences.

## Interface ISweepCallbacks

The `ISweepCallbacks` interface lets you hook into the different stages of a backtest simulation and get updates on what's happening. Think of it as a way to listen in on the progress of the backtest, receiving details that would normally be printed to the console.

You'll receive notifications as ideas are processed, profiles are built, and authors are trained for grading rules.

Each time a grid point is evaluated, you'll get a report with trade details, and after each ranking is calculated, you'll receive data on the sorted reports and the best result.

Finally, when the entire simulation is complete, you’ll be notified with the overall results. This allows you to build custom visualizations, log detailed information, or react to the simulation’s progress in real-time.

## Interface ISweepBest

This interface, `ISweepBest`, represents the single best result for a particular ranking criterion during a sweep. It contains just the criterion itself and a reference to the report associated with that winning point. 

Think of it as highlighting the top performer for a specific rule you're evaluating.

The full details of the trades and any related tracking information are found within the `ISweepPointReport` – this avoids unnecessary repetition as that information is already held elsewhere. Essentially, this focuses solely on identifying *which* point was best according to the specified criterion.


## Interface ISweepAbsorbedIdea

This interface represents an idea that wasn't executed because a previous trade by the same author was already occupying the available trading slot. Think of it as a signal that was essentially "swallowed" by a prior position. It’s helpful because it stores both the idea's ID and the author's identity, allowing for analysis focused on individual traders without needing to combine data from multiple sources. This simplifies the process of examining a trader's performance and how their ideas interact with their existing positions.

## Interface ISweep

The `ISweep` interface provides a way to execute a complete trading simulation run. You can supply a symbol (like 'AAPL') and a list of `ISweepIdea` objects, which represent different trading strategies or approaches. The `run` method then orchestrates the entire process, starting with defining profiles, filtering ideas based on author, evaluating grid performance, and finally ranking the ideas based on their results. This lets you explore and compare the effectiveness of various trading strategies in a systematic way.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` interface represents a situation where a trading signal is scheduled and is currently awaiting a specific price level to be reached before it can be activated. This isn't the initial creation of the signal; it's what you'll receive repeatedly as the system monitors the price.

It provides details about the signal itself, including the current VWAP price being monitored, along with information for tracking purposes like the strategy and exchange names, the timeframe, and the trading symbol.

You'll also find data related to potential profit and loss calculations (though these are theoretical at this stage, as the position hasn’t been opened yet), and whether the event is occurring during a backtest or live trading session. The `createdAt` timestamp tells you precisely when this tick result was generated, referencing either the candle timestamp in backtesting or the real-time execution context during live trading. It's important to note that progress indicators for take profit and stop loss are always zero in this 'waiting' state.

## Interface IStrategyTickResultScheduled

This type, `IStrategyTickResultScheduled`, represents a specific event in your trading strategy – when a signal is generated and scheduled, but hasn't yet been executed. Think of it as a signal waiting in the wings, ready to be triggered when the price hits a certain level.

It contains details about the signal itself (the `signal` property), along with essential context like the strategy's name, the exchange being used, the timeframe of the data, and the trading pair involved.  You'll also find the price at the moment the signal was scheduled, which can be helpful for analysis and debugging.  A flag indicates whether the event occurred during a backtest or a live trading session. The `createdAt` timestamp provides a record of exactly when this scheduled signal was created, tied to a specific point in time during backtesting or live execution.

## Interface IStrategyTickResultOpened

This interface represents a notification that a new trading signal has been created. It's generated after the system validates and saves a signal.

You’ll receive this notification when a new signal is born, providing key details about it.

The information includes the signal itself (with a unique ID), the strategy and exchange that generated it, the trading symbol, the current price at the time of creation, and whether the signal came from a backtest or a live trading session.  The timestamp indicates when the system created the result, linked to the candle's time during backtesting or the live execution time.

## Interface IStrategyTickResultIdle

This interface represents a tick event when your trading strategy is in an idle state, meaning it's not currently acting on any signals. It provides a snapshot of the market conditions at that moment, including the strategy's name, the exchange being used, the timeframe of the data, the trading symbol, and the current price. The data is also tagged to indicate whether it originated from a backtest or a live trading environment and includes a timestamp for record keeping.  Essentially, it's a record of what was happening when the strategy wasn’t actively trading.



The `action` property is always "idle" to clearly identify this type of tick event.  The `signal` is `null` because there's no active signal prompting a trade.


## Interface IStrategyTickResultClosed

This interface represents the outcome when a trading signal is closed, providing details about the closure and the associated profit and loss. It's the data structure you'll receive when a signal reaches its end, whether it’s due to a time limit, a stop-loss or take-profit trigger, or a manual closure.

The information included covers everything from the reason for the closure (like reaching a take-profit, stop-loss, or simply expiring) to the final price at which the trade was closed, and the calculated profit or loss, accounting for fees and slippage. You'll also find details like the strategy and exchange names, the trading symbol, and whether the event occurred during a backtest or live trading.

Specifically, you can learn when the signal was closed, what triggered the closure, what the symbol was, and what the profit/loss was.  If the closure was initiated manually, a unique close ID will be provided. The timestamp of both the event and its creation are also recorded for accurate tracking and analysis.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a signal you've scheduled doesn't actually lead to a trade. It's triggered when a planned signal gets cancelled – maybe it didn't activate or hit a stop-loss before a position could be opened.

The `action` property simply confirms that this is a cancellation event.  You'll find the details of the signal that was cancelled in the `signal` property.

The `currentPrice` tells you the final VWAP price at the moment the signal was cancelled, providing context for the event.  You can also see the exact time of cancellation using `closeTimestamp`.

For tracking purposes, you'll have the `strategyName`, `exchangeName`, and `frameName` associated with this event.  The `symbol` identifies the trading pair. The `backtest` property indicates whether this happened during a backtest or live trading. 

The `reason` property provides more details about why the signal was cancelled.  A `cancelId` will be present if the cancellation was initiated by you using a cancel function.  Finally, `createdAt` provides the creation timestamp for this particular cancellation event.

## Interface IStrategyTickResultActive

This interface describes a result when a trading strategy is actively monitoring a signal, waiting for a trigger like a take profit, stop loss, or time expiration. 

It includes details about the signal being tracked, such as the current price and the names of the strategy, exchange, and timeframe involved. You'll also find information about the trading symbol and the progress towards both the take profit and stop loss targets, represented as percentages.

The result contains the unrealized profit and loss (PNL) for the active position, factoring in fees, slippage, and any partial closures. It also indicates whether the data comes from a backtest or live trading environment. 

Finally, timestamps are provided, showing when the result was created and when the last candle was processed, which helps in keeping track of the simulation's progress.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. It allows you to specify a unique name for your strategy, along with optional notes for clarity.

You'll define the core logic of your strategy using the `getSignal` function, which determines when and how to generate trading signals.  This function receives the symbol, timestamp, and current price, and should return a signal object or null if no action should be taken. It can also be configured to wait for a specific price to be reached.

To control how frequently your strategy is executed, you can set the `interval` to throttle signal generation.

You can also add lifecycle callbacks like `onOpen` and `onClose` for custom actions triggered at the start and end of the strategy's execution.  Additionally, it supports defining risk profiles and actions for integrated risk management.  Finally, `info` allows you to attach custom data for monitoring and external integrations.

## Interface IStrategyResult

This interface defines the structure for a single row in a comparison table when backtesting trading strategies. Each row represents the results of one strategy, including its name, a comprehensive set of statistical data from the backtest, and the value of the metric used to rank the strategies.  It also provides timestamps marking the beginning and end of trading activity for the strategy, which are helpful for understanding the strategy's timeline. If a strategy didn't generate any signals, those timestamp fields will be empty.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, neatly packages the results of a trading strategy's profit and loss calculation. It gives you the key numbers to understand how your strategy performed, including how much money you made or lost. The calculations take into account realistic factors like transaction fees (0.1%) and slippage (0.1%), so you get a more accurate picture of your returns.

Here's a breakdown of what you'll find:

*   `pnlPercentage`:  This tells you the profit or loss as a percentage – positive numbers mean profit, negative numbers mean loss. For example, 2.0 means a 2% profit.
*   `priceOpen`:  The price at which you initially bought an asset, but adjusted to account for slippage and fees.
*   `priceClose`: The price at which you sold an asset, also adjusted for slippage and fees.
*   `pnlCost`: The actual dollar amount of your profit or loss. This is calculated based on the percentage and the total amount invested.
*   `pnlEntries`: This represents the total amount of money you put into your trades – essentially, your total investment.

## Interface IStrategyCallbacks

This interface provides a way to hook into various lifecycle events of your trading strategy within the backtest-kit framework. Think of them as notifications that get triggered at specific moments during a signal’s journey, like when a signal is opened, becomes active, goes idle, or finally closes.

You can define functions to respond to these events, allowing you to monitor the strategy’s behavior, log important data, or even perform custom actions based on the signal’s state.

Here's a breakdown of the different events you can subscribe to:

*   **onTick:** You receive this notification every time a new price tick occurs. It gives you the latest price and context of the strategy.
*   **onOpen:** Triggered when a new signal is successfully opened after validation.
*   **onActive:** Signals that are currently being monitored and are in an active state generate this notification.
*   **onIdle:** This happens when there are no active signals being monitored, indicating a period of inactivity.
*   **onClose:** This event notifies you when a signal is closed, providing the final closing price.
*   **onSchedule:**  This is called when a scheduled signal, which will enter at a later time, is initially created.
*   **onCancel:**  This event fires when a scheduled signal is cancelled before a position is actually opened.
*   **onWrite:** Used to persist signal data, primarily for testing and backtesting purposes.
*   **onPartialProfit:** Notifies you when a signal is in a partial profit state - the price has moved favorably but the target profit hasn't been reached yet.
*   **onPartialLoss:** Signals in a partial loss state, where the price has moved against the position but hasn't triggered the stop-loss, will generate this notification.
*   **onBreakeven:** This event occurs when a signal reaches a breakeven point, often triggering a movement of the stop-loss.
*   **onSchedulePing:**  This is a recurring ping that happens every minute for scheduled signals, allowing for custom monitoring checks.
*   **onActivePing:** Similar to `onSchedulePing`, this event pings active pending signals every minute, allowing for dynamic management and monitoring.

## Interface IStrategy

The `IStrategy` interface outlines the core functionalities of a trading strategy within the backtest framework. It defines how the strategy reacts to market ticks, manages signals, and assesses its performance.

The `tick` method processes each new market tick, checking for signal generation, take profit (TP) and stop loss (SL) conditions. `getPendingSignal` and `getScheduledSignal` fetch existing signals, crucial for TP/SL monitoring and expiration management.  `getBreakeven` determines if a position has covered transaction costs, allowing for breakeven price setting.

Methods like `getStopped` and `getPaused` reflect the strategy’s operational state, while `setPaused` controls position opening. The framework offers utilities to monitor position characteristics, including percentage closed (`getTotalPercentClosed`), cost basis remaining (`getTotalCostClosed`), and performance metrics like PnL.

`backtest` facilitates rapid testing with historical data, while `stopStrategy`, `cancelScheduled`, and `closePending` provide ways to manage strategy execution. `createSignal` allows for injecting custom signals, and methods like `createTakeProfit` and `createStopLoss` provide deferred execution of those actions.  Finally, several helper methods enable detailed monitoring of position health, including drawdown metrics and estimated time until expiration. The `dispose` method cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality that any storage adapter used by the backtest-kit framework must provide. Think of it as a contract—any storage solution you want to use needs to fulfill these methods.

These methods cover the lifecycle of trading signals, handling events like when a signal is opened, closed, scheduled, or cancelled. They also provide ways to retrieve specific signals by their ID or list all stored signals. 

There's also support for “ping” events, which are used to keep track of when signals are actively open or scheduled, ensuring you have up-to-date information. Essentially, it's how the framework interacts with different ways of storing and managing trading signal data.

## Interface IStorageSignalRowScheduled

This interface describes a signal that's been planned or scheduled for execution. 

It includes information about the signal's current status, which will always be "scheduled" in this context. 

Crucially, it also holds the price at the time the signal was scheduled – this is the `currentPrice` and is linked to the price reported in strategy ticks. This price provides a snapshot of the market conditions when the scheduled action was originally planned.

## Interface IStorageSignalRowOpened

This interface describes the data associated with a signal that has been opened. 

It essentially confirms that a trading signal is active.

The `status` property clearly indicates the signal's current state, which is "opened."

Alongside this, `currentPrice` stores the VWAP price at the exact moment the signal was initiated, providing a valuable reference point for analysis and understanding the trade's entry conditions. This price aligns with the information found in `IStrategyTickResultOpened`.

## Interface IStorageSignalRowClosed

This interface describes a signal that has been closed, meaning it’s no longer active. It holds all the important information about how the signal performed when it was closed. 

You'll find details like the signal's final profit and loss (PNL), the price it closed at, and the reason for its closure, all conveniently packaged together. 

Think of it as a record of a completed signal, giving you a clear picture of its outcome. The data here aligns with what you'd see in other related results, ensuring consistency across your backtesting process.


## Interface IStorageSignalRowCancelled

This defines a special type for representing a signal that has been cancelled. It's a way to mark a signal as no longer active or valid. 

Essentially, if a signal is in a "cancelled" state, this interface provides a standard way to identify and handle it within the system. The `status` property is always "cancelled" to clearly indicate this state.

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signals, ensuring that all signal types share a common base. It includes essential information like `createdAt` and `updatedAt` timestamps, which record when the signal was initially created and last modified, respectively, drawing this data from the `IStrategyTickResult`. A `priority` field is also included; this value helps manage the order in which signals are processed, using the current time to prioritize signals consistently whether they originate from live data or backtesting.


## Interface IStateParams

`IStateParams` helps you define how your application manages and organizes state. Think of it as a blueprint for creating reusable, well-structured pieces of data.

It lets you specify a `bucketName`, which is essentially a way to categorize your state – like grouping all trade-related data under "trade".  You also provide an `initialValue`, which is the starting point for your data if nothing has been saved before. This ensures your application always has a known state to work with.


## Interface IStateInstance

The `IStateInstance` interface provides a way to manage and track data associated with individual trades, especially useful for strategies that use machine learning models. It allows you to store information like peak unrealized profit, how long a trade has been open, and when to exit based on specific criteria.

Think of it as a dedicated space for each trade where you can record key metrics as the trade progresses.

The `waitForInit` method is used to set up the initial state. `getState` lets you retrieve the current state information, but it's designed to prevent looking into the future—it won't return data that hasn't happened yet.  `setState` handles updates to the state; importantly, older data can be overwritten to allow for restarting backtests without issues. Finally, `dispose` cleans up any resources the state instance is using when it's no longer needed.

## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size trades using the Kelly Criterion, a strategy focused on maximizing growth rate. It requires you to specify that you're using the "kelly-criterion" sizing method.  You also need to provide a `kellyMultiplier`, which controls how aggressively the Kelly Criterion is applied – a lower multiplier (like the default 0.25) represents a more conservative approach, while a higher multiplier increases potential returns but also risk. Essentially, this interface lets you fine-tune the sizing of your trades based on the Kelly Criterion’s calculations.


## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward way to size your trades: it uses a fixed percentage of your capital for each trade. 

You specify that sizing method is "fixed-percentage".

The core of this schema is the `riskPercentage` property. This value, expressed as a number between 0 and 100, dictates what percentage of your total capital you're willing to risk on a single trade.  For example, a `riskPercentage` of 10 means you'll risk 10% of your capital per trade.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing schema needs a unique identifier, which is the `sizingName`. 

You can also add a `note` to describe the sizing configuration for clarity. 

To manage risk, sizing schemas typically include limits on position size: `maxPositionPercentage` sets the maximum percentage of your account that can be used for a single trade, while `minPositionSize` and `maxPositionSize` define absolute minimum and maximum trade sizes. 

Finally, `callbacks` allow you to attach functions that will be executed at different stages of the sizing process, giving you greater control and flexibility.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

It's specifically designed for strategies that react to market fluctuations.

To use it, you'll specify a `method` of "atr-based," set a `riskPercentage` representing the portion of your capital you're willing to risk on each trade (expressed as a number between 0 and 100), and define an `atrMultiplier` which determines how far your stop-loss will be placed from the entry price, based on the ATR value.  A higher ATR multiplier means a wider stop-loss, accounting for increased volatility.

## Interface ISizingParamsKelly

This interface defines the parameters needed for using the Kelly Criterion to determine position sizes when placing trades. 

It includes a `logger` property, which is a service used to record debugging information during the sizing process. This logger helps in understanding how the Kelly Criterion calculations are being performed and allows for troubleshooting.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for a trading strategy when you want to size your trades based on a fixed percentage of your available capital. It's designed to be used when setting up how much of your portfolio you want to risk on each trade.

You'll also need to provide a logger, which is helpful for tracking what's happening during the backtest and for debugging any issues. This logger allows you to output diagnostic information.

## Interface ISizingParamsATR

This interface defines the parameters used when determining position sizes based on the Average True Range (ATR) indicator. 

It includes a `logger` property, which allows you to output debugging information related to the sizing calculations – helpful for understanding and troubleshooting how your positions are being sized. Think of it as a way to see what's going on behind the scenes.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to tap into the sizing process of your trading strategy. Specifically, you can use the `onCalculate` callback to observe and potentially influence how much of an asset your strategy decides to trade. Think of it as a notification that’s triggered right after the strategy determines the size of a trade, allowing you to record details or check if the size makes sense for your setup. This callback receives the calculated quantity and parameters used in the sizing calculation, giving you valuable insight into what happened behind the scenes.


## Interface ISizingCalculateParamsKelly

This defines the information needed to calculate your bet sizing using the Kelly Criterion. To use it, you'll need to provide your win rate, which is the percentage of times your trades are profitable (expressed as a number between 0 and 1), and your average win/loss ratio – essentially, how much you win on average compared to how much you lose. These two values work together to determine an optimal bet size that maximizes long-term growth while managing risk.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed to calculate trade sizes using a fixed percentage approach. 

Essentially, it outlines the inputs for determining how much of your capital to allocate to a trade based on a predetermined percentage.

It requires you to specify a method, which is always "fixed-percentage," and a stop-loss price, which will be used in the sizing calculation. Think of it as providing the system with the rules to determine the size of your trades.

## Interface ISizingCalculateParamsBase

This defines the basic information needed for calculating how much to trade – the size of your position.  Every sizing calculation will require knowing the symbol of the trading pair, like BTCUSDT. It also needs the current balance of your account and the intended entry price for the trade. Think of it as the foundation for deciding how much capital to allocate to a specific trade.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed when you're using Average True Range (ATR) to determine the size of your trades. Specifically, it confirms you’re using an ATR-based sizing method and provides the current ATR value. The ATR value is a number representing the average of the true ranges over a certain period, and it's a crucial input for calculating how much to invest in a trade based on volatility. Think of it as telling the system "use this ATR value to figure out how much to risk."

## Interface ISizing

The `ISizing` interface is all about determining how much of an asset to trade – essentially, calculating your position size. It’s a core component used behind the scenes when a trading strategy is put into action.

The `calculate` property is the heart of this interface. It's a function that you provide to handle the actual calculation, taking in parameters related to risk and other relevant factors. The function returns a promise resolving to the calculated position size.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that's been processed and is ready for execution. Each signal gets a unique identifier (UUID) for tracking purposes.

The signal contains all the necessary details for a trade, including the cost, entry price, the expected holding time, which exchange and strategy it belongs to, and the trading symbol. It also stores timestamps for when the signal was created, when it became pending, and other internal markers to track its status.

For complex strategies, the signal keeps a record of any partial profit or loss closures, enabling accurate PNL calculations. You’ll find trailing stop-loss and take-profit prices here, which dynamically adjust based on strategy rules.  The signal also maintains a history of entries if dollar cost averaging (DCA) is used, and keeps track of the highest profit and lowest loss points seen during the trade’s lifetime.  Finally, it holds a timestamp representing its creation/scheduling time.

## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to bundle multiple signals together and delay their release. Think of it as a way to group signals and ensure they're delivered as a unit after a specific time interval. Each signal within this group gets a unique identifier, making it easy to track and manage them. This is useful for optimizing how signals are processed and delivered within the trading framework.

## Interface ISignalDto

The ISignalDto represents the data used for generating trading signals. When you request a signal, this object contains all the necessary information to execute a trade. Each signal includes details like the ticker symbol, whether you're going long (buying) or short (selling), and a note explaining the reasoning behind the signal. 

You'll also find price points – the entry price, the take profit target, and the stop-loss level – all designed to manage risk and potential reward.  The `minuteEstimatedTime` property lets you set a time limit for the position, although you can disable this timeout. Finally, a cost is associated with entering the position. An ID will be generated automatically if you don’t provide one.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to represent signal data specifically related to when a position is closed. It’s designed to handle situations where a user manually triggers a position closure, providing extra information about that action.  You'll find `closeId` which is an identifier for the particular closure event, useful for tracking user actions. Alongside this is `closeNote`, allowing you to record any notes or details provided by the user about the closure.

## Interface ISessionInstance

The `ISessionInstance` interface provides a way to store and share data that's specific to a combination of symbol, strategy, exchange, and frame during a backtest run. Think of it as a temporary holding space for information you need across different parts of your trading strategy, like caching results from an AI model or tracking values that change over time.

It allows you to initialize the session, write new data with a timestamp, retrieve existing data, and clean up when the session is no longer needed. The `getData` method is designed to prevent accidentally looking into the future; if the data you’re requesting is later in time than what’s actually available, it will return null. This interface helps keep your backtest runs organized and efficient by providing a shared memory space.

## Interface IScheduledSignalRow

This interface defines a signal that isn't immediately acted upon – it waits for a specific price level to be reached. Think of it as a signal on hold, anticipating a particular price movement. It builds upon the standard signal representation, adding the concept of a delayed entry based on the 'priceOpen' value. Once that target price is hit, this signal transforms into a regular, active signal. A key detail is that the time the signal was initially scheduled and the time it actually begins waiting are tracked, with the latter updating when the signal is activated.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might have been canceled by a user. It builds upon the existing scheduled signal data, adding information specific to cancellations. If a signal was canceled directly by a user, this interface will contain a `cancelId` to identify the cancellation and a `cancelNote` to explain why it was canceled.  Essentially, it's a way to track user-driven cancellations alongside normal scheduled signals.

## Interface IScheduledSignalActivateRow

This interface represents a scheduled signal, but with a special addition for activations that are triggered directly by a user. It builds upon the standard scheduled signal information and includes fields to track who initiated the activation and any notes they provided. Specifically, the `activateId` field identifies the user's activation request, and `activateNote` allows them to add a brief explanation or reason for the activation. These fields are only relevant when the activation isn’t happening automatically as part of the regular schedule.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, essentially tells you the timeframe your backtest covers. It’s like defining the “start” and “end” dates for your historical data analysis. The `from` property holds the beginning date of the test, while `to` specifies the final date. Think of it as setting the boundaries of the historical period you’re using to simulate your trading strategy.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides crucial details about the environment your trading strategy is operating in. It gives you access to things like the trading symbol (like "BTCUSDT"), the time period being analyzed in a backtest, and any custom data your strategy might need. 

You'll also find context about the exchange, the strategy's name, and the timeframe being used. Furthermore, it includes the exact time of the current candle or tick, the current market price, and a simple indicator of whether the strategy is running a backtest or not. Think of it as a package of essential information to help your strategy understand its current situation.

## Interface IRunContext

This interface, `IRunContext`, acts as a central hub of information when running code within the backtest-kit framework. Think of it as a combined package, bringing together everything a function needs to know about its environment. It holds details about which exchange and strategy are involved, along with real-time information such as the trading symbol and timestamp. Ultimately, this context gets broken down and shared with specialized services to manage the routing and runtime aspects of your trading logic.

## Interface IRiskValidationPayload

This data structure holds all the information needed for risk validation checks. It builds upon the `IRiskCheckArgs` and specifically includes details about the current trading signal you're evaluating. You’ll find the `currentSignal` itself here, representing the signal that triggered the potential trade. 

It also provides a snapshot of your portfolio's current state, letting you know how many positions are already open (`activePositionCount`) and listing out all those active positions (`activePositions`). This comprehensive view enables robust risk assessments before committing to any trade.

## Interface IRiskValidationFn

This defines a function that helps you check if your trading setup is safe and sound. It's designed to validate aspects of your strategy, like position sizing or order parameters. If everything looks good, the function does nothing and lets the trading process continue. However, if something isn't right—maybe a trade would violate a rule—the function will signal a problem. It can do this by returning a specific result object detailing the issue or by throwing an error, which will then be handled and presented in a standardized way.

## Interface IRiskValidation

This interface helps you define how to validate risk parameters in your backtesting system. It's all about creating rules to ensure your risk checks are sound and well-documented. 

You provide a `validate` function – this is the core logic that does the actual validation.  It takes your risk parameters and determines if they're acceptable. 

To make things clear for others (or for yourself later!), you can also add a `note`. This is a simple text description explaining what the validation is intended to do.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading by providing important details about a position. It builds upon existing signal data and adds information about the initial entry price, the original stop-loss level, and the original take-profit level that were set when the signal was first generated. This data is specifically used during risk validation processes to ensure the trade parameters are correct and safe. Essentially, it gives you the key price points used when the trade was initially planned.

## Interface IRiskSchema

This defines how you can set up and manage risk controls for your portfolio. Think of it as a way to create custom rules to ensure your trading strategy stays within defined boundaries. You'll give each risk control a unique identifier, a `riskName`, and can even add a note to explain what it does.

You can also add optional lifecycle event callbacks, letting you trigger specific actions when a risk control is rejected or allowed.  The core of this setup is the `validations` property, which is where you specify the actual rules that define your risk controls.  These validations can be simple functions or more complex objects, allowing for a flexible and detailed approach to risk management.

## Interface IRiskRejectionResult

When a risk validation check fails, this object provides details about why it was rejected. It includes a unique ID to track the rejection and a clear, human-readable note explaining the specific issue that caused the validation to fail. Think of it as a friendly explanation of what went wrong during the risk assessment.

## Interface IRiskParams

The `IRiskParams` object defines the configuration for managing risk within the trading system. It essentially packages together all the necessary information and callbacks needed to control how risk is assessed and handled.

It includes the name of the exchange you’re trading on, a logger for tracking debugging information, and a time service to ensure accurate timekeeping, crucial for preventing errors like looking into the future during backtesting.

A key property is the `backtest` flag, indicating whether the system is running in a simulated environment or in a live trading scenario. Finally, the `onRejected` callback is called when a trading signal is blocked because of risk limits, allowing for custom event handling and actions before the rejection is officially communicated.

## Interface IRiskCheckOptions

To help manage situations where multiple parts of your trading strategy are trying to adjust positions at the same time, `IRiskCheckOptions` provides a way to ensure operations happen in a predictable order. The `reserve` option, when set to `true`, acts like a temporary hold on a position. This guarantees that if several checks are happening simultaneously, they all see the updated position size before any changes are actually made, preventing unexpected behavior and race conditions. It's particularly useful when multiple signals might want to interact with the same position.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides all the necessary information to determine if a new trade should be allowed. Think of it as a gatekeeper – it’s used *before* a trading signal is actually created to make sure the conditions are right.  It gathers details like the trading pair (symbol), the signal itself, the name of the strategy making the request, and information about the exchange and risk management setup.  You'll also find the current price and timestamp available, ensuring the risk check is based on the most up-to-date data. Basically, it packages everything a risk check function needs to make a safe and informed decision.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface provides a way to react to the outcomes of risk assessments within your trading strategy. Think of it as a notification system—you can hook into events to know when a trade idea is blocked due to risk constraints or, conversely, when it’s cleared for execution. The `onRejected` callback gets triggered when a trading signal fails a risk check, giving you the chance to log this event or potentially adjust your strategy. Similarly, `onAllowed` lets you know when a signal successfully passes all risk checks and is ready to proceed. Both callbacks receive information about the symbol involved and the parameters used in the risk assessment.

## Interface IRiskActivePosition

This interface describes an active trading position that's being monitored for risk management, particularly when multiple trading strategies are running simultaneously. It bundles together key details about a position, like the strategy that created it, the exchange it's on, and the symbol being traded (like BTCUSDT). You'll find information about the direction of the trade – whether it’s a long or short position – as well as crucial price points like the entry price, stop-loss, and take-profit levels.  Finally, the interface keeps track of how long the position has been open, helping to understand its duration and potential impact on overall risk.

## Interface IRisk

This interface defines how to manage risk while trading. It allows you to check if a trading signal is acceptable based on predefined risk limits. There's a special function, `checkSignalAndReserve`, designed to prevent issues when multiple strategies try to execute similar trades simultaneously; it ensures that a position is essentially “reserved” before the signal is fully approved.  If you use `checkSignalAndReserve`, remember that you *must* eventually either fully confirm the trade with `addSignal` or cancel it with `removeSignal` to avoid confusing the system. The `addSignal` function records the details of an opened position, and `removeSignal` cleans up the records when a position is closed.

## Interface IReportTarget

This interface lets you pick and choose which detailed reports your backtest generates. It's like setting up a checklist for the information you want to see during and after a trading simulation.

Each property, like `strategy` or `risk`, represents a different type of reporting. Setting a property to `true` activates that specific report service, which means it will be included in your JSONL event logs. For instance, enabling `breakeven` means you'll get logs related to when trades reach their breakeven point.

You can control a wide range of data, from basic strategy actions and risk rejections to performance metrics, scheduled events, and milestones like hitting the highest profit or maximum drawdown. Ultimately, it allows you to fine-tune the reporting to focus on the aspects most relevant to your analysis.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you customize how your backtesting reports are written and organized. Think of it as a set of labels you can attach to your data to make it easier to find and analyze later. Each option represents a piece of information about the data being recorded, like the trading pair (symbol), the name of the strategy being used, the exchange involved, the timeframe of the data, a unique identifier for the trading signal, or the name of the optimization process. Using these options ensures your reports are well-structured and searchable, which simplifies your post-backtest analysis.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It provides a way to record when a signal is sent (`handleActivePing`) and to fetch the most recent one based on specific criteria like the trading symbol, strategy, exchange, timeframe, and whether it's for a backtest. Importantly, fetching signals also considers a "look-ahead" protection, ensuring that you don't accidentally retrieve signals from the future. The framework also allows you to easily calculate how long ago the last signal was generated for a particular trading scenario.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to provide a clear view of a trading signal's key details, especially the original stop-loss and take-profit levels. Think of it as a way to show users the initial parameters of a trade, even if those parameters have been adjusted later by trailing stops or other automated modifications.  It builds upon the `ISignalRow` interface to include these original price values, ensuring transparency about the initial trading plan.

Here’s what's included:

*   **Cost:** The initial investment needed to enter the position.
*   **originalPriceStopLoss:** The original stop-loss price set when the signal was created.
*   **originalPriceTakeProfit:** The original take-profit price set when the signal was created.
*   **partialExecuted:** A percentage representing how much of the position has been closed through partial trades.
*   **totalEntries:** The number of times the position has been entered, indicating whether or not averaging was used.
*   **totalPartials:** The count of partial closing operations that have occurred.
*   **originalPriceOpen:** The initial price at which the position was opened.
*   **pnl:** The unrealized profit or loss calculated at the moment the signal was generated.
*   **peakProfit:** The highest profit achieved by the position so far.
*   **maxDrawdown:** The largest loss experienced by the position from its peak.



The important thing to remember is that the `originalPriceStopLoss` and `originalPriceTakeProfit` values *won't* change, even if the actual stop-loss or take-profit prices are adjusted during the trade's lifecycle. This helps to provide a historical record of the initial setup.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, a common way to represent price data over time. Each candlestick holds information about when it formed (timestamp), the initial price (open), the highest and lowest prices reached (high and low), the final price (close), and the trading volume during that period. Think of it as a snapshot of market activity over a specific time interval, containing all the key price points and the amount of trading that occurred. It's a standard data format used for visualizing and analyzing price movements.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It helps determine how much of your capital to allocate to a trade based on your expected win rate and the average ratio of your wins to your losses. You'll provide a value representing your win rate, expressed as a number between 0 and 1, and another value representing your average win-loss ratio – essentially, how much you typically win compared to how much you lose. These parameters guide the framework in optimizing your trade size.

## Interface IPositionSizeFixedPercentageParams

This defines the parameters needed when you're using a fixed percentage sizing strategy for your trades. Specifically, it lets you set the stop-loss price, which is the price at which you'll automatically exit a trade to limit potential losses. It’s a simple way to control risk by ensuring a stop-loss is always in place.

## Interface IPositionSizeATRParams

This describes the settings you use when calculating your position size based on the Average True Range (ATR). 

Specifically, `atr` represents the current ATR value that's being used in the calculation. Think of it as the volatility indicator informing how much of your capital you'll allocate to a trade.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` helps you define how to detect overlapping positions when using dollar-cost averaging (DCA) strategies. Think of it as setting up a safety net around each of your DCA prices.

It uses two key settings: `upperPercent` and `lowerPercent`. 

`upperPercent` determines how much above each DCA price you consider to be an overlap – for example, if it’s set to 5%, any price 5% higher than a DCA level would be flagged. 

`lowerPercent` does the same for below the DCA price. So, if it’s set to 3%, any price 3% lower would also trigger the overlap detection.

These percentages are expressed as values between 0 and 100, meaning 5 represents 5%. You can adjust these values to fine-tune how sensitive the overlap detection is to price fluctuations.

## Interface IPersistStrategyInstance

This interface helps you manage how a trading strategy's internal data is saved and loaded for a specific combination of symbol, strategy name, and exchange. Think of it as a way to customize where and how a strategy remembers its progress over time. 

You can implement this interface to create your own system for storing strategy data, perhaps using a database instead of files.

The `waitForInit` method prepares the storage space for a strategy's data. 

The `readStrategyData` method retrieves any previously saved data.

The `writeStrategyData` method stores the current state of a strategy, or clears any existing data if you pass `null`.

## Interface IPersistStorageInstance

This interface lets you manage how trading signals are saved and loaded for a specific environment, whether you're running a backtest or a live trading session. Think of it as a way to customize where and how your signal data is stored. 

It ensures a dedicated storage space for either backtesting or live trading, keeping things separate and organized.

When you need to retrieve signal data, the system looks through all stored entries and brings them back to you as a list.

If you want to change how the signals are stored – perhaps using a database instead of a file – you can create your own adapter that follows this interface.

The `waitForInit` method prepares the storage for use. `readStorageData` gets all the stored signals. Finally, `writeStorageData` saves the signals, organizing them by their unique signal IDs.


## Interface IPersistStateInstance

This interface defines how to manage and persist state specifically for one trading strategy and data combination (think of it as a unique slot for each strategy's memory). It's designed to help your strategies remember where they left off, even if there's a crash or interruption.

If you're building a custom way to store this state—maybe using a database instead of files—you'll need to implement this interface.

Here's what the methods do:

*   `waitForInit` allows you to signal when the storage for a particular strategy context is ready.
*   `readStateData` loads the previously saved state for this strategy context.
*   `writeStateData` saves the current state of the strategy. You tell it when the state was last updated.
*   `dispose` cleans up any resources used by this storage; it's like saying goodbye when the strategy is done.

## Interface IPersistSignalInstance

This interface defines how trading strategies can store and retrieve their signals, like buy and sell instructions, for a particular symbol, strategy, and exchange. Think of it as a way to save the decisions a strategy made in the past so they can be loaded later. If you want to use a different way to save these signals—maybe a database instead of a file—you can create a custom adapter that implements this interface. 

The `waitForInit` method prepares the storage space for a strategy. `readSignalData` retrieves previously saved signal data. Finally, `writeSignalData` saves the current signal data, and can be used to clear existing data by passing `null`.

## Interface IPersistSessionInstance

This interface helps manage how trading sessions are saved and loaded, making sure your strategies don't lose important information even if something unexpected happens. It’s specifically tied to a unique combination of strategy, exchange, and frame – meaning each setup has its own dedicated storage space. 

If you want to customize how session data is stored (instead of using the default file-based method), you can create your own adapter that follows this interface.

Here's what the methods do:

*   `waitForInit`: Sets up the storage for a particular session.
*   `readSessionData`: Retrieves any previously saved data for that session.
*   `writeSessionData`: Saves the current session data, along with a timestamp.
*   `dispose`: Cleans up any resources used by the storage mechanism.

## Interface IPersistScheduleInstance

This interface helps manage how your trading strategies remember what signals they generated at specific times. It’s specifically designed for a particular combination of a financial instrument (symbol), the name of your strategy, and the exchange where you’re trading. 

If you want to change how signals are saved – for example, instead of saving them to a file – you can create a custom adapter and have it implement this interface.

The `waitForInit` method lets you prepare the storage area for a specific strategy. `readScheduleData` retrieves any previously saved signal data. Finally, `writeScheduleData` allows you to store new signal information, or clear out old data if needed.

## Interface IPersistRiskInstance

This interface lets you customize how backtest-kit stores your risk positions—specifically, the data related to how much risk you’re taking on for a particular trading strategy and exchange. Think of it as a way to control where and how that information is saved. 

If you want to use a database instead of a file, or have a specialized storage system, you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage area for your risk data when the backtest starts. `readPositionData` retrieves existing risk position data for a specific point in time. Finally, `writePositionData` saves the current state of your risk positions, ensuring the backtest remembers where you stand.


## Interface IPersistRecentInstance

This interface lets you manage how recent trading signals are saved and loaded for a specific setup – think of it as keeping track of the last signal generated for a particular symbol, strategy, exchange, and timeframe. It’s designed to separate the live trading environment from backtesting, allowing you to customize how this information is stored.

If you want to control where and how these recent signals are saved (instead of using the default file storage), you can create your own adapter that implements this interface.

The `waitForInit` method sets up the storage when needed. The `readRecentData` method retrieves the most recently saved signal. And the `writeRecentData` method saves a new signal along with the time it was generated.

## Interface IPersistPartialInstance

This interface helps manage how partial profit and loss information is saved and loaded for a particular trading setup. Think of it as a way to keep track of incomplete calculations for each signal – for instance, if a trade isn't fully resolved yet.

The information is organized by a unique combination of the symbol being traded, the name of the strategy used, and the exchange involved, ensuring that data is kept separate for different scenarios.

Each signal has its own place to store this data, identified by a unique signal ID.

If you want to change how this partial data is stored – perhaps using a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method sets things up when storage is needed. `readPartialData` retrieves previously saved data for a signal, and `writePartialData` saves new data for a signal.

## Interface IPersistNotificationInstance

This interface lets you customize how your trading system handles notifications—messages about events like trades or order updates—by providing your own storage mechanism. It's designed to work separately for backtesting and live trading, ensuring notifications are handled appropriately in each environment.

Think of it as a way to replace the default file storage with something else, like a database or in-memory cache.

The `waitForInit` method is called to set up your storage at the beginning, `readNotificationData` retrieves all the saved notifications, and `writeNotificationData` saves new notifications.  Each notification is uniquely identified by an ID, making it easy to manage them.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context within the backtest-kit framework. Think of it as a way to manage memory entries – pieces of information – tied to a particular signal and bucket. 

It provides methods for initializing storage, reading existing memory entries, checking if a memory entry exists, writing new entries, and soft-deleting (marking as removed) entries. Soft-deleting means the file is kept on disk, but it won't show up when you're reading or listing memory.

You can customize how memory data is persisted by creating your own adapters that implement this interface.  The `listMemoryData` method is used to retrieve all available memory entries and is especially helpful for rebuilding indexes. Finally, `dispose` is used to clean up any resources used by the memory context.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures, allowing for customized persistence strategies beyond the default file-based approach. Think of it as a way to manage a temporary store of information used during backtesting. 

It includes methods for initializing the storage, reading existing data, writing new data, and removing data – although removal is a "soft delete" where the data remains on disk but is excluded from typical searches. The `listMeasureData` method provides a way to see all the available keys currently held in the cache. This interface is designed to let you swap out the default way data is cached, for example, to use a different storage system or add extra logic.

## Interface IPersistLogInstance

This interface defines how to manage a global, persistent storage for log entries within the backtest-kit framework. Think of it as a central place where your logs are saved, independent of any specific trading context. 

It allows you to customize how log data is stored, potentially moving away from the default file-based storage.

If you need to integrate with a database or another storage solution, you'll implement this interface.

The `waitForInit` method is used to make sure the log storage is ready before anything tries to write to it.

The `readLogData` method lets you retrieve all the log entries that have been saved. 

And the `writeLogData` method is for adding new log entries, making sure no duplicates are created.

## Interface IPersistIntervalInstance

This interface lets you customize how backtest-kit remembers when a specific trading interval has already happened for a given market. Think of it as a way to tell the system, "Hey, we've already processed this interval for this particular asset."

If you're not happy with the default file-based approach, you can build your own persistence system – perhaps using a database or in-memory storage – by implementing this interface.

The `waitForInit` method sets things up initially. `readIntervalData` fetches existing interval information, and `writeIntervalData` saves new marker data.  `removeIntervalData` is a special function that "soft deletes" a marker, essentially allowing the interval to be processed again.  Finally, `listIntervalData` helps you see what markers are currently active.


## Interface IPersistCandleInstance

This interface defines how your backtest kit can store and retrieve candle data for a specific trading context – think of it as a way to remember what happened in the market. It’s tailored to a unique combination of symbol, timeframe, and exchange.

When you need to load historical data, `readCandlesData` will fetch a chunk of candles within a specified time range. If even one candle is missing, it will return null, signaling that you need to grab the data from the source.

`writeCandlesData` lets you save those candles to the cache. It's designed to be flexible, so you can choose to skip partial or duplicate candles to keep your storage clean.

Finally, `waitForInit` ensures the storage area is ready to go before you start working with it. 

You can implement this interface to customize where and how your backtest kit stores its candle data beyond the default file-based system.

## Interface IPersistBreakevenInstance

This interface helps manage and save information about when trades break even, but only for specific trading setups. Think of it as a way to remember where a trade needs to reach to become profitable, and it does so separately for each symbol, strategy, and exchange you're using.

You can use this to create your own system for storing this data, instead of relying on a default method. 

Here's what you'll need to do if you create your own:

*   `waitForInit`: A way to set up the storage when it's needed.
*   `readBreakevenData`: A way to retrieve previously saved break-even data for a trade.
*   `writeBreakevenData`: A way to save break-even data for a trade.

## Interface IPersistBase

This interface provides a basic set of tools for saving and retrieving data, designed to be customized for different storage methods. It’s meant to be the foundation for building your own persistence layers, allowing you to connect the backtest-kit to databases, files, or other storage systems.

Here's what it offers:

*   **Initialization:** A way to ensure the persistence layer is ready and consistent.
*   **Reading:** A method to fetch a specific data item from storage.
*   **Existence Check:** A quick way to determine if a data item is already present.
*   **Writing:**  A reliable method to store data, ensuring the operation is handled safely.
*   **Listing:** A way to get a list of all the data items stored, sorted in a predictable order, useful for verification and looping through everything. 

The `keys` method is especially important, as it’s used to iterate through all your data and confirm its integrity. A default implementation exists that provides validation and iteration capabilities.

## Interface IPartialProfitCommitRow

This object represents a step in your backtest where a portion of your position is closed to secure profits. 

It tells the backtest system to close a specific percentage of your current holdings.
The `action` property confirms this is a partial profit taking action.
You'll find the `percentToClose` value indicates exactly what portion of your position should be sold. 
Finally, `currentPrice` records the price at which the partial profit was actually executed, crucial for accurate backtest results.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, like selling a portion of your holdings. 

It includes details about the action being taken, which is specifically a partial loss. 

You'll also find the percentage of the position that needs to be closed, and the price at which that partial closure actually happened. This information is vital for understanding the execution of your trading strategy.

## Interface IPartialData

IPartialData holds a snapshot of key data points for a trading signal, designed to be easily saved and restored. It's like a simplified version of the full state, primarily used for saving progress.

It includes information about profit levels – the points where the trade has become more valuable – and loss levels – where the trade has incurred losses. These are stored as arrays of `PartialLevel` objects, which represent those specific price levels.

Essentially, this data structure allows the system to remember where a signal has been in terms of its profitability and losses, even when it’s not actively running. It’s a piece of the puzzle used to reconstruct a complete trading state later on.


## Interface IPartial

The `IPartial` interface manages how profit and loss are tracked for your trading signals. It’s used by components like `ClientPartial` and `PartialConnectionService`.

When a signal is making money, the `profit` method steps in to monitor progress. It calculates milestones like 10%, 20%, and 30% profit levels, notifying you only when a new level is achieved.

Similarly, the `loss` method handles situations where a signal is losing money, tracking and reporting milestones in the same way.

Finally, the `clear` method is used when a signal is finished, such as when it hits a take profit or stop loss. It cleans up the signal's data, saves changes, and ensures everything is tidied up.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered after processing command-line arguments. It essentially combines your initial input with flags that determine the trading environment. 

You'll find properties like `backtest`, `paper`, and `live` which are boolean values. These values indicate whether the trading system should operate in a historical data simulation, a simulated trading environment, or a real-money trading scenario, respectively.

## Interface IParseArgsParams

The `IParseArgsParams` interface outlines the expected inputs for running a trading strategy. Think of it as a blueprint for the essential information your backtest needs to get started.

It tells you what to provide when you want to define a backtest run, including:

*   The trading pair you're interested in (like "BTCUSDT").
*   The specific strategy you want to test.
*   The exchange where the trading will be simulated (e.g., "binance").
*   The timeframe for the historical data you'll be using (like "1h" for one-hour candles).

## Interface IOrderBookData

This interface defines the structure of order book data, which represents the bids (buy orders) and asks (sell orders) for a particular trading pair. It contains the `symbol` of the trading pair, alongside arrays of `bids` and `asks`. Each element within the `bids` and `asks` arrays describes an individual order, including its price and quantity. Think of it as a snapshot of what buyers and sellers are currently offering for a specific asset.

## Interface INotificationUtils

This interface defines how different systems can be notified about what's happening during a trading backtest. Think of it as a central hub for sending out updates.

It includes methods for reacting to various events, such as when a trading strategy initiates a trade (opening or closing a position), when partial profits or losses become available, or when the strategy needs to pause or encounters errors. You'll also find methods for handling order-related events, including confirmations, rejections, and status updates. 

Furthermore, it offers ways to retrieve a history of these notifications and to clear that history when no longer needed. By implementing this interface, your systems can seamlessly integrate and receive real-time information about the backtest process.

## Interface INotificationTarget

This interface lets you fine-tune which notifications your backtest or live trading system sends. Instead of receiving every possible update, you can pick and choose the specific events you're interested in. It’s like setting up filters to only see the information you need, avoiding unnecessary noise.

Here's a breakdown of what you can subscribe to:

*   **Signal Events:** Get updates on when signals are opened, scheduled, closed, or canceled.
*   **Profit/Loss Notifications:** Be alerted when prices hit partial profit, loss, or breakeven levels.
*   **Strategy Actions:** Track when the strategy commits to actions like placing orders or canceling signals.
*   **Order Status:** Monitor the status of your orders – whether they’ve been synced, checked, filled, rejected, or continuing to be monitored.
*   **Risk & Errors:**  Receive notifications related to risk manager rejections or important errors.
*   **Informational Messages:** Get manual or strategy-triggered messages with notes and optional IDs.
*   **Pause Status:**  Be informed about when the strategy is paused, affecting how new signals are handled.
*   **General Errors:** Receive notifications for non-fatal and critical errors.
*   **Validation Issues:** Get notified of any issues with your strategy configuration or input data.



By carefully selecting which of these properties you enable, you can create a more focused and efficient monitoring system.

## Interface IMethodContext

The `IMethodContext` object is like a little package of information that helps the backtest-kit framework know which specific configurations to use during a backtest. Think of it as a set of instructions – it tells the system exactly which strategy, exchange, and data frame to work with. It carries names, such as the strategy's name, exchange's name, and frame's name. This context is automatically passed around by the framework, so you don't have to manually manage it. If the frame name is empty, it means the system is operating in live mode, not a simulation.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage solutions should function, whether they're keeping data in local storage, persisting it elsewhere, or just acting as a placeholder. 

It provides core functions for managing data:

*   `waitForInit`: A way to ensure the memory is ready before you start working with it.
*   `writeMemory`: Allows you to save new data entries, associating them with a unique identifier, a description, and a timestamp.
*   `searchMemory`:  Lets you find data entries that match a specific search term, ranking the results by relevance and respecting the time filter.
*   `listMemory`: Provides a way to view all data entries up to a given timestamp.
*   `removeMemory`:  Enables you to delete specific data entries.
*   `readMemory`:  Retrieves a single data entry based on its identifier, but only if its timestamp is valid.
*   `dispose`: A cleanup function to release any resources used by the memory instance.

## Interface IMarkdownTarget

The `IMarkdownTarget` interface lets you pick and choose which detailed reports you want to see during your backtesting process. Think of it as a way to fine-tune the level of information you receive – you can enable only the reports you’re most interested in.

You can turn on reports for strategy events like entry and exit signals, or focus on risk-related blocking events. 

There are also options for tracking breakeven points, partial profits, portfolio heatmaps, and performance bottlenecks.

You can even get reports on signals that are waiting for their triggers, live trading events, or the complete trade history. 

Finally, you can monitor key milestones such as reaching the highest profit and maximum drawdown levels. It's all about customizing your reporting to fit your specific analysis needs.

## Interface IMarkdownDumpOptions

This interface defines the configuration for generating markdown documentation within the backtest-kit framework. Think of it as a set of instructions that specify exactly which parts of your trading system to document and where to put them. You can use it to control which directory, file, symbol, strategy, exchange, timeframe, and signal identifier are included in the generated documentation. This allows for targeted documentation, focusing on specific areas of your backtesting environment.

## Interface IMCPTextMessage

This represents a simple text message used within the Model Context Protocol (MCP) system. Each message has a unique ID to keep track of it and ensure no duplicates. The 'type' property clearly identifies it as a text message, and the 'text' property holds the actual message content that a human could read.

## Interface IMCPSignalNotifyCommand

This command is used to send out information notifications related to active trades. Specifically, it triggers a `signal.info` notification for a particular trading symbol that's set up for live trading within a strategy. The system uses the symbol name to identify the relevant signal and sends the notification along with a note you can add to provide more context. It's a way to communicate details about ongoing trades to other parts of the system or to display them in a user interface.

The command requires three pieces of information: the trading symbol (like "BTCUSDT"), the name of the MCP (Model Context Protocol) schema that's sending the command, and a descriptive note to explain the notification.

## Interface IMCPSchema

The IMCPSchema defines how a specific strategy interacts with a central control system, helping coordinate trading actions across multiple instances of that strategy. Think of it as a blueprint that links a name to a strategy and sets up rules for how a system can control and monitor it.

You essentially register a strategy with a unique name (mcpName) and can choose to associate it with one or more specific strategies. If you have multiple strategies, you *must* specify which ones the system will manage.

It also lets you set things like the cost of opening a position and define exactly what permissions a connected system has – restricting access to only the methods it needs. 

The schema can also be customized to format the information about a portfolio (like snapshots of holdings) into messages for a connected agent, and it provides hooks for various lifecycle events. Everything is optional, so you can tailor it precisely to your needs.

## Interface IMCPPositionOpenCommand

This command is used to initiate a new trading position, specifically a "moonbag" position, which uses a pre-defined strategy of 50% take profit and a hard stop loss, tied to grid snapping. It's designed for trading pairs that are already active in your live trading environment and associated with a particular strategy schema. 

The command requires the trading symbol (like BTCUSDT), the direction of the trade (either long or short), the name of the strategy schema that's initiating the order, and a brief note to explain the reasoning behind the trade. Essentially, it's a standardized way to tell the system to open a specific type of position within a defined strategy context.

## Interface IMCPPositionCloseCommand

This command tells the system to close an existing position for a specific trading symbol, like BTCUSDT. It's used when a trading strategy needs to finalize a trade within a live trading environment. The command includes the symbol being traded, identifies which strategy is initiating the closure, and allows for a descriptive note to be added, explaining why the position is being closed. This note helps track and understand the reasoning behind the trading decisions.

## Interface IMCPImageMessage

This interface defines a special kind of message used for sending images, like a generated chart, through the system. Each image message has a unique ID to help keep track of it. 

It's identified as an "image" type, and it includes the image’s format, like "image/png," along with the actual image data, which is encoded as a base64 string. This allows the image to be transmitted reliably as text.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your trading portfolio at a specific moment in time. It's essentially a record of what you own and how much, organized by the symbol of the asset (like AAPL for Apple stock). Think of it as a quick look at your holdings during a backtest. Each live instance of your trading strategy receives its own, unique `IMCPContext`.

## Interface IMCPCallbacks

These callbacks provide a way to observe what actions your backtest kit is performing behind the scenes. They’re optional, meaning you don't have to use them, and if one fails, it won't stop the backtest. Think of them as letting you peek at the details of how the system is managing your portfolio and signals.

Here's what each one does:

*   `onStatus`:  Gets called after the system retrieves the current state of your portfolio, showing you the data the system saw and the messages generated.

*   `onPositionOpen`:  Triggers when a new position is successfully opened, giving you the details of the order that was actually sent (like stop loss and take profit levels).

*   `onPositionClose`:  Lets you know when a position has been successfully closed, along with the ID of the signal that prompted the closure.

*   `onAverageBuy`:  Notifies you after a DCA entry (Dollar Cost Averaging) has been successfully executed, again providing the signal ID.

*   `onSignalNotify`:  Informs you when a note or notification has been added to a signal.

## Interface IMCPAverageBuyCommand

This command is used to place a small buy order, often called a dollar-cost average (DCA) entry, as part of a larger, ongoing trade. It adds a new order to an already existing position for a specific trading pair. 

The system automatically figures out which trade plan this new order belongs to. The cost of this small order comes from the funds allocated within that trade plan.

Here's a breakdown of the key pieces of information this command provides:

*   **symbol:**  This tells the system which trading pair the order should be placed for (like "BTCUSDT").
*   **mcpName:** This identifies the specific trading strategy or plan that's being used for this trade.

## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what's happening. It's your window into the system's inner workings.

You can use it to record general events, detailed debug information for when you're trying to figure something out, or just informational updates about what’s going well.

It’s also for flagging potential issues—warnings about things that aren't critical errors but you should maybe investigate. Think of it as a way to track the system's lifecycle, record its actions, check for problems, and keep an eye on errors.

## Interface ILogEntry

ILogEntry represents a single entry in your backtest's log history. Each log entry has a unique identifier, a level (like "log", "debug", or "warn"), and a timestamp to help organize and filter the logs. 

It also includes helpful information like the creation date and a timestamp for potential log rotation.  You can associate a log entry with a specific method or function using the `methodContext` and `executionContext` properties, offering more insight into what's happening during your backtest.  Finally, you can add extra arguments passed to the logging function, ensuring all pertinent details are captured.


## Interface ILog

The `ILog` interface provides a way to access and review a history of log entries generated by your trading strategies and backtesting processes. 

It includes a method called `getList` which allows you to retrieve all logged events, giving you a complete record of what happened during a backtest. This is particularly useful for debugging, analyzing performance, and understanding the decision-making process within your trading system. Essentially, it's like having a diary of your backtest.

## Interface IHeatmapRow

This interface describes the data for a single trading symbol within a portfolio's heatmap. It provides a comprehensive overview of performance, encompassing profitability, risk, and trade characteristics.

You'll find key metrics like total profit/loss, Sharpe Ratio (measuring risk-adjusted return), maximum drawdown (the largest loss from a peak), and the total number of trades executed.  It also breaks down performance into winning and losing trades, providing win rate, average profit/loss per trade, and details on winning and losing streaks.

Beyond basic profitability, it delves into trade durations (average time held), various risk ratios (Sortino, Calmar, Recovery Factor), and more advanced indicators like expectancy and trend analysis. The inclusion of buyer and seller pressure/strength metrics helps to understand the underlying market dynamics affecting the symbol's performance. Ultimately, this interface gives a clear, detailed picture of how a particular trading symbol is performing within a broader strategy or portfolio.

## Interface IFrameSchema

This `IFrameSchema` describes a specific time period and frequency that your backtest will use. Think of it as defining a "slice" of historical data for your trading strategy to analyze.

Each frame has a unique name to identify it, and you can add a note for yourself to remember why you set it up that way.

The `interval` property specifies how often data points (like prices) will be generated within the backtest, such as every minute ("1m") or every day ("1d"). If you don't set it, it defaults to "1m".

You define the start and end dates of your backtest period using `startDate` and `endDate`. The backtest kit uses these dates to create the necessary timestamps.

Finally, you can also provide optional callback functions to be executed at different stages of the frame's lifecycle.

## Interface IFrameParams

The `IFrameParams` object holds the essential setup information when you create a ClientFrame, which is a core component of backtest-kit. Think of it as the initial configuration for a specific testing scenario. It includes a `logger` to help you track what's happening during the backtest and a crucial `interval` which acts as a unique name to easily identify and manage different frames within your backtesting system. This interval is how you'll refer to a particular time period or data slice in your analysis.

## Interface IFrameCallbacks

This lets you react to when the timeframe array, the sequence of dates you'll be trading on, is created. You can use it to check that the timeframe setup is correct, or simply to keep a record of what time periods are being used for backtesting. The callback receives the array of dates, the start and end dates of the timeframe, and the interval used to generate the timeframe.


## Interface IFrame

The `IFrame` interface is a core component that handles generating the timeline for your backtesting. It’s like the backbone of how your backtest progresses through time.

The `getTimeframe` function is the key part of this – it lets you request a list of specific dates and times for a given trading symbol and a named timeframe (like "1m" for one-minute intervals or "1d" for daily data). Think of it as telling the backtest system, "Give me all the timestamps I need to run a test for this instrument and timeframe." This function returns a promise that resolves to an array of dates.

## Interface IExecutionContext

The `IExecutionContext` interface holds important information about the current trading environment. Think of it as a container for runtime details that are automatically passed around during strategy execution or exchange operations. It includes the symbol being traded, like "BTCUSDT," and the precise current timestamp. Critically, it also tells you whether you're running a simulation (backtest) or a live trade. This information is crucial for functions like retrieving historical data or handling incoming price updates.

## Interface IExchangeSchema

This interface describes how to connect backtest-kit to different cryptocurrency exchanges. It essentially defines how to retrieve and format the data needed for backtesting trading strategies.

You’ll use this schema to tell backtest-kit where to get historical candle data, how to handle trade quantities and prices according to the exchange’s rules, and potentially, to access order books and aggregated trades.

Here's a breakdown of the key parts:

*   **exchangeName**: A unique identifier for the exchange you're using.
*   **getCandles**: This function is *required* and fetches historical price data. It takes the trading pair, timeframe, start date, number of candles, and a flag for backtesting as inputs.
*   **formatQuantity & formatPrice**: These functions, if provided, format trade quantities and prices to match the specific exchange’s precision. If omitted, a default precision is used.
*   **getOrderBook & getAggregatedTrades**: These are optional functions for retrieving order book and trade data respectively. If you don't provide them, backtest-kit won't try to fetch this information.
*   **callbacks**: These allow you to hook into certain events, like when new candle data becomes available.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed to connect and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as the blueprint for how your backtesting system understands and communicates with a specific exchange.

It requires you to provide several key functions: fetching historical candle data, determining the proper format for trade quantities and prices (taking into account the exchange’s precision rules), retrieving the order book, and accessing aggregated trade data.

You’ll also supply a logger for debugging and an execution context, which holds important information like the trading symbol, timestamp, and whether the process is a backtest or a live execution.

Essentially, by implementing these functions, you're telling your backtesting system exactly how to get the data and format the information it needs to simulate trading on a particular exchange.

## Interface IExchangeCallbacks

This lets you react when new candlestick data arrives for a specific trading symbol and time interval. You can use this callback to process the data immediately, update visualizations, or trigger other actions based on the incoming price information. The callback receives details like the symbol, interval, the time since the data began, the number of candles received, and an array containing the candlestick data itself.

## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with a specific exchange. It provides ways to retrieve historical and future price data (candles) to simulate trading conditions. 

You can fetch past candles using `getCandles`, and look ahead to future candles using `getNextCandles` – vital for backtesting scenarios. The framework also handles the complexities of formatting quantities and prices to match the exchange's requirements.

Calculating VWAP (Volume Weighted Average Price) is simplified with `getAveragePrice`, and you can quickly get the latest closing price with `getClosePrice`.  

Beyond price data, you can access order book information with `getOrderBook` and aggregated trade data with `getAggregatedTrades`.  For more control, `getRawCandles` allows fetching candles with custom start and end dates or limits.

Importantly, all data retrieval methods are designed to prevent "look-ahead bias," ensuring your backtests accurately reflect real-world conditions. The framework carefully manages date ranges and limits to maintain historical integrity.

## Interface IEntity

This interface serves as the foundation for all persistent data objects within the backtest-kit framework. Think of it as a common blueprint – any object that gets saved or loaded from storage will need to adhere to its rules. It ensures a consistent structure for how data is handled and managed within the backtest environment.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save different types of data during a backtest run. Think of it as a way to record key information – like conversation histories, individual data points, tables of results, error messages, JSON objects, and MCP status – associated with a specific point in time and analysis. Each instance is tied to a particular signal and bucket, meaning it focuses on data from a specific area. 

You'll use methods like `dumpAgentAnswer` for saving agent conversations, `dumpRecord` for simple data records, `dumpTable` for organized tables of data, `dumpText` for freeform text, `dumpError` for capturing errors, `dumpJson` for complex structured data, and `dumpMCPStatus` for model context protocol details.  Finally, `dispose` lets you clean up any resources the instance is using when you're done.  All these methods require the actual data you want to save, along with a unique identifier for that piece of information.

## Interface IDumpContext

This `IDumpContext` object provides the necessary information to identify and categorize each individual piece of data being saved. Think of it as a tag that sticks to each dump, telling you exactly where it came from and what it represents. It includes a unique signal ID to pinpoint the specific trade it relates to, a bucket name that groups dumps by strategy or agent, and a unique dump ID.  A descriptive label helps with understanding and searching, and a flag indicates whether the data originates from a backtest or a live trading session. This context is essential for organizing and interpreting the data collected during trading.

## Interface ICommitRowBase

This interface defines the basic structure for events that represent committed actions, like orders or trades. Think of it as a foundational building block for tracking what happened during a trade. 

It includes two key pieces of information: the `symbol` which identifies the trading pair involved (e.g., BTC-USD), and a `backtest` flag indicating whether the event occurred during a historical simulation or live trading.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to verify if candle data exists in a storage system. It’s used to quickly check for data without needing to read through all the files. You'll provide the trading symbol, the exchange name, the timeframe interval (like 1 minute or 4 hours), and a start and end date to specify the range you want to check. This helps ensure data is available before running analyses or simulations.

## Interface ICandleData

This interface represents a single candlestick, which is a standard unit of time-based price data in trading. Each candlestick bundles together the open, high, low, and close prices for a specific period, along with the volume traded. The `timestamp` property tells you exactly when that candlestick's period began. The `open` price is the price when trading started for that time, `high` and `low` represent the highest and lowest prices reached during the period, and `close` is the final price when the period ended. Finally, `volume` tells you how much trading happened within that candle’s timeframe.

## Interface ICacheCandlesParams

This interface defines the settings you can use when preparing your data for backtesting. It lets you control how data is initially validated and then pre-loaded ("warmed up") for efficient testing. 

You can provide functions that get called at key moments:

*   `onWarmStart`: This function will be executed right before the warming-up process begins, giving you a chance to log or track the start of the process.
*   `onCheckStart`: This function runs just before the validation stage begins.

## Interface IBrokerOrderVerdictTransient

This interface describes a temporary setback during order processing. It's used internally by the backtest-kit framework to handle situations where an order can't be immediately confirmed or rejected.

Think of it as a signal that something went wrong, but it's likely a temporary problem like a network glitch or a brief server issue.

The framework automatically manages retries for these transient errors, giving the order a few more chances to go through. You, as an adapter or listener, don't create these verdicts directly—instead, you indicate a transient issue by returning an error.

The `reason` property simply confirms it’s a transient issue, and the `error` property provides details about the underlying problem, if available.

## Interface IBrokerOrderVerdictRejected

When an order can't be fulfilled, the backtest-kit uses this `IBrokerOrderVerdictRejected` to communicate the reason. This isn't something you, as an adapter, create directly. Instead, your adapter tells the system whether the order is good to go (by returning normally or `true`) or if there’s a temporary problem (by throwing a general error) or a permanent, unrecoverable issue (by throwing an `OrderRejectedError` or `OrderDeletedError`).

If the reason is "rejected," it means the order was denied by the system – for example, because there's no counterparty to trade with and retrying won't help. A rejected open order is simply discarded, and a rejected close order will be closed immediately.

The `reason` property clarifies *why* the rejection occurred, and the `error` property contains the specific `OrderRejectedError` that triggered this verdict.

## Interface IBrokerOrderVerdictDeleted

This notification signifies that an order, previously submitted, has been definitively removed – essentially, it's no longer available. 

It’s a framework-internal message, meaning you don't directly create these notifications; instead, your adapter communicates order status changes to the framework, which then generates this notification.

Think of it like this: the user cancelled the order on the exchange, and this notification is how the framework knows to update its records. 

The `reason` field clearly indicates the event is a "deleted" order. The `error` field contains the original error information that caused the order to be deleted – a valuable detail for debugging or understanding why the order disappeared.

## Interface IBrokerOrderVerdictConfirmed

This object represents a decision made about an order—either a gate allowing an order to proceed or a check confirming its validity. It's how the backtest-kit system communicates the outcome of those decisions to the adapter. You, as the adapter, don’t create these verdicts directly. Instead, you signal acceptance with a normal return value or `true`, a temporary issue with a non-typed error, or a permanent rejection with a specific error type. The backtest-kit then gathers these signals and delivers the verdict. 

If you see a `reason` of "confirmed", it means the order was allowed to happen or the order being checked is still valid and open.

## Interface IBrokerOrderVerdictBase

This interface, `IBrokerOrderVerdictBase`, acts as a common foundation for how the backtesting framework handles decisions about orders. Think of it as the basic structure for informing the system about whether an order is valid or needs adjustment. It's designed to be consistent regardless of *why* that decision was made.

The `__type__` property is a special identifier that distinguishes different specific types of order verdicts – essentially, it tells the framework exactly what kind of decision is being communicated.

## Interface IBroker

This interface defines how your code connects to a real brokerage or exchange, allowing it to execute trades. It's a crucial piece when moving from testing to live trading.

Before the framework does anything, `waitForInit` is called once. This is your chance to set up your connection, load credentials, and importantly, reconcile any existing orders or positions the exchange might have that the framework doesn't know about. This prevents trading "orphaned" orders.

When a signal needs to be closed (take profit, stop loss, manual close), `onOrderCloseCommit` is triggered *before* the framework changes its internal state.  This gives you control to place the actual order. Errors here can cause retries or a forceful closure, with safeguards to prevent endless retries or system crashes.

Similarly, `onOrderOpenCommit` handles order openings, again giving you precise control before the framework updates its state. This also includes scheduled entry orders.  Be sure to tag orders with signal IDs for tracking later. Throwing errors during this process leads to retries or position abandonment.

`onOrderActiveCheck` is called regularly to verify that a live position still exists.  If the exchange says an order is gone, the position is closed immediately.  This is critical for dealing with unexpected exchange behavior.

`onOrderScheduleCheck` performs the same verification for scheduled (resting) orders.

`onSignalActivePing` and `onSignalSchedulePing` are regular informational hooks that allow for real-time adjustments based on actual exchange data, like price gaps or filled orders ahead of expectations. These hooks don’t directly control closing or opening positions—they inform the strategy’s decisions.

`onSignalIdlePing` is purely informational, letting you perform maintenance tasks when no trades are active.

`onSignalScheduleOpen` is called when a new scheduled order is created, which signals when to place the resting order on the exchange.  `onSignalScheduleCancelled` is called when that order gets canceled before activation, and is used to cancel the real order as well.

`onSignalPendingOpen` is a notification that a position has opened.  It is the primary gate for a new position, so order syncing signals are sent to open positions. 

Finally, `onSignalPendingClose` is a notification when the framework has closed the position.

## Interface IBreakevenData

This data structure holds simple information about whether a breakeven point has been achieved for a specific trading signal. It's designed to be easily saved and loaded, allowing your backtesting results to be preserved. Think of it as a way to mark if a trade has "broken even" – a true or false value representing that state. This data is particularly useful for tracking progress over time and re-establishing trading conditions after interruptions.


## Interface IBreakevenCommitRow

This represents a commit action specifically related to breakeven points in your trading strategy. Think of it as a record showing a breakeven calculation and the price at which that calculation was made. 

It contains two key pieces of information: the `action` which always identifies this as a "breakeven" event, and the `currentPrice` which is the price level used to determine the breakeven. This price helps track how the breakeven point has changed over time.

## Interface IBreakeven

The `IBreakeven` interface manages the process of moving a stop-loss to the entry price, a key part of breakeven trading. It keeps track of when this breakeven point is achieved for a particular trade.

Essentially, it monitors the price movement of a trade and determines if it has moved favorably enough to justify setting the stop-loss at the original entry price. 

The `check` method is the core of this process, regularly evaluating if the price has moved sufficiently to cover transaction costs and allowing the stop-loss to be adjusted. If breakeven is triggered, it notifies interested components and saves the state. 

The `clear` method handles resetting the breakeven status when a trade is closed, removing the relevant data and ensuring a clean slate for the next trade.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book. It tells you the price at which someone is willing to buy or sell, and how much they're offering. Specifically, it includes the `price` itself, which is given as a string, and the `quantity` available at that price, also represented as a string. Essentially, this interface provides the essential details for a single level of the order book.

## Interface IAverageBuyCommitRow

This interface represents a single step within a queued average-buy (often called DCA) strategy. It describes one instance where a purchase was made to gradually acquire an asset. Each time a buy happens, this information is recorded to track the overall progress of the average-buy process. 

The `action` property simply indicates that this is an average-buy step. The `currentPrice` tells you the price paid for this specific purchase. `cost` indicates the dollar amount spent on that buy, and `totalEntries` keeps track of how many buys have been made so far.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about individual trades, providing a granular view of trading activity. Each data point contains a unique ID, the trade price, the quantity exchanged, and a timestamp marking exactly when the trade happened. Crucially, it also tells you whether the buyer was acting as a market maker, offering insight into the direction of the trade. This information is useful for in-depth backtesting and analyzing trade patterns.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading simulation or live trade execution. Think of it as a record keeping track of what's currently happening.

It's automatically created when a backtest or live trade starts, and then removed when it finishes, whether successfully or not.

The system uses these entries to manage and monitor activity, helping to prevent conflicts when multiple tasks are running simultaneously.

Here's a breakdown of the information stored in each entry:

*   **symbol:** The trading pair being used (like "BTCUSDT").
*   **context:** Details about the execution environment, including the strategy name, the exchange, and optionally the timeframe.
*   **backtest:** A simple `true` or `false` flag indicating whether this is a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a message that's put in a queue to trigger an activation of a scheduled commit. Think of it as a notification saying, "Hey, it's time to activate this specific scheduled thing!"

The `action` property always tells the system this is an activation of a scheduled commit. 

You'll see `signalId` which identifies the specific signal related to this scheduled commit.

Finally, `activateId` is an optional piece of information used when a user directly requests the activation – it helps track who asked for it.


## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the signal state – like whether a trade is pending or a signal is scheduled – without actually executing anything. It’s like a quick check before deciding if an action needs to be taken.

Specifically, it helps ActionProxy decide if certain actions like adjusting stop losses or profits should be skipped if there isn't an active signal to work with.

You’ll use two main methods: `hasPendingSignal` checks for an ongoing trade, while `hasScheduledSignal` checks for a signal waiting to be triggered. Both methods take into account whether you’re running a backtest, the symbol involved, and details about your strategy and data frame.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom functionality. Think of it as a way to hook into your strategy's execution and do things like track its performance, send notifications, or integrate with external systems like a state management library.

Each action is uniquely identified and can include a note for developers. 

You define the action's logic with a handler—either a full class or a simplified implementation of some parts.  Callbacks provide opportunities to interact with the action at different points in its lifecycle.  Essentially, `IActionSchema` provides a flexible way to add your own custom behavior and monitoring to your backtesting strategies.

## Interface IActionParams

This interface, `IActionParams`, essentially holds all the information an action needs to run correctly. Think of it as a package of essential details.

It includes a `logger` to help track what's happening during execution, vital for spotting issues. 

You'll also find details like the `strategyName`, `exchangeName`, and `frameName` which describe the context of the action.

The `backtest` flag tells the action whether it's being tested against historical data, and the `strategy` object provides access to current trading signals and positions.


## Interface IActionCallbacks

This API reference details the callbacks you can use when building actions within the backtest-kit trading framework. Think of these callbacks as hooks that let you customize how your strategies interact with the system during different phases of their lifecycle. They're all optional, and you can use them for things like managing connections, logging events, or even persisting data.

Here's a breakdown of what each callback does:

*   **`onInit`**:  This runs when a new action handler is created – perfect for setting up connections, loading data, or initializing resources needed by your strategy.
*   **`onDispose`**:  This is called when the action handler is finished, allowing you to clean up, close connections, save data, or unsubscribe from anything you set up in `onInit`.
*   **`onSignal`**: A general-purpose callback triggered every time a signal is generated, regardless of whether you’re backtesting or trading live.
*   **`onSignalLive`**:  Specifically for live trading, this gets fired whenever a new signal arrives in a live environment.
*   **`onSignalBacktest`**: Triggered only during backtesting, this provides signals specific to historical data.
*   **`onBreakevenAvailable`**: This notifies you when the strategy reaches a breakeven point, moving the stop-loss to the entry price.
*   **`onPartialProfitAvailable`**: Notifies you when a partial profit target is reached.
*   **`onPartialLossAvailable`**:  Alerts you when a partial loss level is triggered.
*   **`onPingScheduled`**:  This gets called periodically while a signal is scheduled but hasn’t activated yet, allowing you to monitor its status.
*   **`onScheduleEvent`**:  Informs you about lifecycle changes related to scheduled signals, like when they’re created or cancelled.
*   **`onPendingEvent`**:  Fires when a pending position is opened or closed, giving you a chance to react to these events and potentially take actions.
*   **`onPingActive`**:  Called regularly while a pending position is active (open), allowing you to monitor its progress.
*   **`onPingIdle`**:  Signals when there are no active signals or positions.
*   **`onRiskRejection`**:  Informs you when a signal is rejected by the risk management system.
*   **`onOrderSync`**: A critical callback for synchronizing orders with the exchange. You *must* throw an error to reject the order, and the framework will handle retries.
*   **`onOrderCheck`**: Regularly checks if orders are still active on the exchange, helping to prevent unexpected losses due to order deletions. Like `onOrderSync`, exceptions are important here.



The `onScheduleEvent`, `onPendingEvent`, `onPingActive`, `onOrderSync` and `onOrderCheck` callbacks provide opportunities for more direct interaction with the exchange, acting as alternatives to a traditional Broker adapter. They offer fine-grained control, but require careful handling of events and exceptions.

## Interface IAction

This interface, `IAction`, serves as the central hub for managing events and reacting to them within your trading strategy's state. Think of it as a way to connect your custom logic (like updating a UI, logging data, or triggering external actions) to the framework's internal event stream.

Each method within `IAction` corresponds to a specific type of event emitted by the backtest-kit, covering everything from signal generation (`signal`, `signalLive`, `signalBacktest`) to order management (`orderSync`, `orderCheck`) and more granular events like profit and loss levels (`breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`).

Implementing `IAction` lets you customize how your strategy responds to these events.  For example, you could use it to update a dashboard with real-time trading data or log every signal generated by the strategy.  The `dispose` method is crucial for cleaning up when the strategy is finished, ensuring you don't leave any lingering subscriptions or open connections.  The `orderSync` and `orderCheck` methods are particularly important for handling order-related events and potential errors, offering a mechanism for rejecting orders under certain circumstances. The entire framework uses events to keep all pieces synchronized, and `IAction` is how you connect your own custom logic to that synchronization.


## Interface HighestProfitStatisticsModel

This model keeps track of the events that resulted in the highest profits during a trading backtest. 

It essentially stores two pieces of information: a complete list of those profitable events, ordered from most recent to oldest, and the total number of profitable events that were recorded. You can think of `eventList` as the detailed history of your biggest wins, and `totalEvents` as a simple count of how many times you hit those peaks.

## Interface HighestProfitEvent

This describes a single instance where a trading position reached its highest profit. It includes important details like precisely when it happened (timestamp), which asset was involved (symbol), and which trading strategy was used (strategyName). You’ll also find information about the signal that triggered the trade (signalId) and whether the position was a long or short trade.

Crucially, it provides a snapshot of the position's profit and loss (pnl), how high the profit peaked (peakProfit), and the maximum loss incurred (maxDrawdown) up to that point. Other key data points include the price at which the record profit was achieved (currentPrice), the initial entry price (priceOpen), and the planned take profit and stop-loss prices. Finally, it indicates whether this event occurred during a backtest or live trading (backtest).

## Interface HighestProfitContract

The HighestProfitContract provides details whenever a new peak profit is reached for a trading position. It bundles together essential information like the trading symbol, the current price at that moment, and a precise timestamp. You'll also find the name of the trading strategy, the exchange it's on, and the timeframe being used.

Crucially, it includes the signal data that triggered the trade, enabling you to react to profit milestones in custom ways – perhaps adjusting a stop-loss or taking partial profits.  A key flag indicates whether this update is from a historical backtest or live trading, allowing for different handling depending on the situation.

## Interface HeatmapStatisticsModel

This data structure summarizes the overall performance of a trading portfolio, breaking down key statistics across all the assets it holds. It provides a comprehensive view of how the portfolio as a whole has performed, rather than just looking at individual symbols.

You'll find information like the total profit and loss for the entire portfolio, along with important risk metrics like the Sharpe and Sortino ratios. It also calculates averages related to trade durations, win/loss streaks, and peak/drawdown performance.

Essentially, this is a single record containing a rollup of many performance indicators, useful for understanding the aggregate health and behavior of your trading strategy. You can see things like average trade duration, how often trades win or lose consecutively, and even calculated ratios to gauge risk-adjusted returns and certainty of profits.  The structure includes data on annual returns and trade frequency, making it valuable for long-term performance analysis.

## Interface DoneContract

This interface lets you know when a background process, like a backtest or a live trading session, has finished running. It provides key details about the process that just completed, such as which exchange was used, the name of the trading strategy, and whether it was a backtest or a live trade. You'll also find the trading symbol involved, like BTCUSDT, to understand exactly what was traded. Think of it as a notification that gives you a snapshot of what just happened behind the scenes.

## Interface CronHandle

The `CronHandle` is like a little key you get when you schedule something to happen regularly with the Cron system. Think of it as a way to "cancel" a scheduled task. If you don't need a task to run anymore, you can just discard this `CronHandle` to make sure it stops running. It's a simple way to remove a scheduled job without having to remember the exact details of how it was registered in the first place.

## Interface CronEntry

This describes how to schedule tasks within the backtest-kit framework. A `CronEntry` lets you define when a function should run repeatedly or just once.

Each entry needs a unique `name` to identify it, and this name can’t contain colons.

You specify the `interval` – like every minute, every hour, or every day – that determines when the function is triggered. If you leave out the interval, the task will run just once at the very beginning.

The `symbols` list acts as a filter; it decides whether the task runs globally (once per interval) or specifically for each symbol. If you provide a list of symbols, the task will execute for each symbol included in that list during each interval.

Finally, the `handler` is the actual function that gets executed when the defined time and symbol conditions are met.

## Interface CriticalErrorNotification

This notification signals a serious, critical error that requires the backtest process to stop immediately. 

It's like a red flag saying something went wrong that can't be ignored. 

Each notification has a unique identifier, a clear error message for understanding the problem, and detailed information about the error itself, including its stack trace. 

Importantly, these notifications always indicate an error originating outside of the backtest environment.

## Interface ColumnModel

This interface helps you define how data is presented in a table. Think of it as a blueprint for each column you want to display.

It lets you specify a unique identifier (`key`) for the column, a user-friendly label (`label`) to show in the table header, and most importantly, a `format` function.

The `format` function is where you transform your raw data into the exact string representation you need for the table.  You can also control column visibility with `isVisible`, allowing you to conditionally show or hide columns based on certain conditions.

## Interface ClosePendingCommitNotification

This notification signals that a pending trade signal was closed before it could become fully active. It provides a detailed breakdown of what happened, useful for understanding why a signal didn't lead to a full trade. The notification includes specifics like a unique ID, a timestamp, and whether it occurred during a backtest or live trading.

You’ll find key information about the trade itself, such as the symbol (e.g., BTCUSDT), the strategy and exchange responsible, and the original entry price. A significant part of the notification outlines the position's performance, covering profit and loss (both in USD and percentage), peak profit, and maximum drawdown – all calculated including slippage and fees.  

Detailed information is provided about DCA (Dollar-Cost Averaging), including the total number of entries and partial closes executed. Finally, you get a human-readable note (if provided) and a creation timestamp for the notification itself. This level of detail lets you analyze the reasons behind signal closures and potentially refine your trading strategies.

## Interface ClosePendingCommit

This event signals that a previously opened position is now being closed. 

It tells you the action being performed is a "close-pending."

You can optionally add a `closeId` to help identify why the position is closing – this is just for your reference.

The event includes details about the position's performance: the total profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). These numbers represent the position's journey up to the moment the closing signal was generated.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been canceled before it was activated. It provides a wealth of detail about the signal and its potential performance, including identifiers like the signal ID and a cancellation ID if provided. You’ll find information about the trading pair (symbol), the strategy that generated the signal, and the exchange it was intended for.

The notification also includes comprehensive performance metrics like potential P&L, peak profit, and maximum drawdown, along with the prices and costs associated with those calculations. Essentially, this notification gives you a snapshot of what *would have* happened if the signal had gone through, complete with all the relevant data for analysis and understanding. It helps to track and debug strategies even when signals are canceled, giving you insights into why certain actions weren't taken.

## Interface CancelScheduledCommit

This interface describes an action to cancel a scheduled signal event. It’s used when you want to stop something that's been planned to happen in the future, like a trade execution.

You'll provide a `cancelId` to help identify why you’re canceling—it’s basically a note for your records.

Alongside the cancellation details, you also include information about the position being canceled: specifically, its total profit and loss (`pnl`), the highest profit it ever reached (`peakProfit`), and its largest drawdown (`maxDrawdown`). These figures give you a complete picture of the position's performance up to the point of cancellation.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points encountered during a trading backtest. It essentially gives you a list of all the times your strategy hit a breakeven mark, along with details about each of those events. You can access this data through the `eventList` property, which is an array of individual breakeven events.  The `totalEvents` property simply tells you how many breakeven events were recorded overall.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized record of when a trading signal reached the breakeven point. It gathers all the important details surrounding that event, allowing for comprehensive reporting and analysis.

You'll find information like the exact time of the event, the trading pair involved, the name of the strategy used, and a unique identifier for the signal itself. It also includes details about the position type (long or short) and the current market price at the time.

Crucially, the event captures the entry price, take profit target, and stop-loss levels, both as originally set and as they may have changed. If a dollar-cost averaging (DCA) strategy was in place, information on the number of entries and partial closes is also provided.

Additional details such as unrealized profit and loss (PNL), a descriptive note about the signal, when the position became active and scheduled, and whether the trade occurred in backtest or live mode are all included to give a full picture of the trade's progress.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is moved back to the original entry price. It's essentially a notification that a trade has moved far enough into profit to cover its initial costs.

Think of it as a milestone for your trading strategy, indicating a reduction in risk.

The data included in this event provides a lot of context: the trading symbol, the strategy and exchange used, the timeframe, the complete signal details, the current market price, whether it's a backtest or live trade, and the exact time of the event. It's designed for services that generate reports and for users who want to be notified when this risk-reduction event occurs. These events are designed to be reliable; each signal will trigger it only once.

## Interface BreakevenCommitNotification

This notification tells you when a breakeven point has been reached for a trade. It's a detailed report, so you'll get a lot of information.

You'll see a unique ID for the notification, along with a timestamp marking exactly when the breakeven action happened. The notification will specify if it came from a backtest or a live trading environment, and details about the traded asset (symbol), the strategy used, and the exchange involved.

It includes crucial details about the trade itself: the entry price, take profit and stop-loss prices (both initial and adjusted by any trailing), the direction of the trade (long or short), and information about any DCA averaging or partial closes that occurred.

The notification also provides a complete financial picture of the trade, including profit and loss (pnl), peak profit, maximum drawdown, and related price and percentage values.  You'll also find information about the original entry price, number of entries, and the total amount invested. Finally, there’s an optional note field for a more detailed description of the trade's reasoning. Several timestamps provide full timeline for this signal and position.

## Interface BreakevenCommit

This object represents a breakeven event that occurs within a trading strategy. It provides a snapshot of the position’s performance and key parameters at the moment the breakeven action was triggered. 

The `action` property simply confirms that this event is a breakeven.

You'll find details about the current market price (`currentPrice`) and the overall profit and loss (`pnl`) of the trade, including any partial profits taken along the way.  It also shows the highest profit (`peakProfit`) and the largest loss (`maxDrawdown`) experienced by the position.

The `position` property indicates whether it’s a long (buy) or short (sell) trade. 

Furthermore, you can access the initial entry price (`priceOpen`), the originally set take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`), and timestamps marking when the signal was generated (`scheduledAt`) and when the position was activated (`pendingAt`). This information gives a full picture of the position's state at the point of the breakeven action.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss order can be moved to breakeven – essentially, your initial entry price. It's a positive sign, indicating the trade is moving favorably.

The notification provides a wealth of information, including a unique ID, timestamp, and whether it originated from a backtest or live trading environment.  You'll find details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange where the trade is happening.

Critically, it includes the current market price, the original entry price, and the direction of the trade (long or short), along with the current take profit and stop-loss prices, and their original values before any trailing adjustments.

You'll also see detailed performance data like total profit and loss (both absolute and as a percentage), peak profit, and maximum drawdown, along with the prices and number of entries related to these metrics.  It even includes the amount invested and the cost/profit associated with the trade.  A human-readable note might provide further context about why the signal was generated. Finally, you can track the signal’s creation and pending timestamps for a complete picture of its lifecycle.

## Interface BeforeStartContract

This interface signals the very beginning of a strategy run, right before the data processing starts. Think of it as a preparation signal – it ensures certain setup tasks are completed before any trading decisions are made. It’s triggered only once per run and is always followed by a corresponding "run finished" signal, guaranteeing a complete lifecycle tracking.

You'll find key information here like the trading symbol, the name of the strategy being used, and the exchange providing the data. A helpful detail is the current price, which saves you from needing to fetch it yourself. 

The `when` property indicates the intended starting time, representing either the historical start date in backtesting or the actual current time when live trading. It also offers a timestamp for easy handling and serialization. This allows you to perform tasks like opening log files, resetting data, or sending notifications, all before a single trade is even considered.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of backtest results, offering a comprehensive view of strategy performance. It includes a list of every trade and a wealth of statistics, such as total trades, win/loss counts, and win rate. You’ll find key performance indicators like average profit per trade, total profit, standard deviation (a measure of volatility), and the Sharpe Ratio (which assesses risk-adjusted returns).

The model also delves into more advanced metrics, including Sortino Ratio, Calmar Ratio, and Expectancy, giving a granular look at potential trade profitability. Duration metrics and measures of trade duration are available.

Beyond simple profitability, the model includes analysis of trade durations, step sizes, and market pressures (buyer and seller influence). Trend analysis, including strength and confidence, gives insights into the prevailing market direction. Essentially, this provides a robust toolkit for evaluating and refining your trading strategies.

## Interface AverageBuyCommitNotification

This notification signals that a new portion has been added to an ongoing average-buy (DCA) strategy. It provides comprehensive details about this new entry, including when it occurred (timestamp), whether it's part of a backtest or live trade, and the specific trading pair involved. You’ll find information on the price at which the new entry was made, the cost of that entry, and how it impacts the overall averaged entry price.

The notification also includes key performance indicators related to the position, such as total profit/loss (pnl), peak profit, and maximum drawdown, along with the prices and costs associated with those metrics. Furthermore, it gives you insight into the original entry price and take profit/stop loss levels, as well as details about the number of entries and partial closes executed. A helpful note field can provide additional context behind the signal. Finally, timestamps related to creation and scheduling provide a timeline of the signal’s lifecycle.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, signals a new addition to an averaging (DCA) strategy position. It's triggered whenever a new buy or sell order is executed as part of your averaging plan.

The event provides a snapshot of the position's state at the moment the averaging order was filled, including the price paid for the new entry (`currentPrice`), the total cost of that entry (`cost`), and the resulting averaged entry price (`effectivePriceOpen`). You’ll also find details about the potential profit (`pnl`), the highest profit achieved so far (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).

Essential information like the original entry price (`priceOpen`) remains unchanged by the averaging process. The event also provides the updated take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`), along with their original values before any trailing adjustments were applied (`originalPriceTakeProfit`, `originalPriceStopLoss`).  Finally, timestamps (`scheduledAt`, `pendingAt`) are included to track when the signal was generated and the position was activated.

## Interface AfterEndContract

This interface signals the end of a strategy run, whether it finished normally, was interrupted, or encountered an error. It’s a guaranteed one-time event that occurs after each strategy execution, paired with a corresponding "before start" event. Think of it as a final cleanup signal.

You can use this event to handle tasks like flushing data buffers, closing files, or sending notifications that need to happen precisely once at the very end of a run.

It provides key information about the run, including the trading symbol, the strategy name, the exchange and timeframe used, and whether it was a backtest or a live trade. A particularly useful piece of data is the `currentPrice` – the average price observed at the end of the run, saving you the need to fetch that price yourself.

The `when` property represents the event time.  During backtesting, it's the time of the last processed candle or the start of the frame if no candles were processed. In live trading, it's the current time, rounded to the nearest minute. Both `when` and `timestamp` provide the same information, with `timestamp` formatted as milliseconds since the epoch, making it easier to serialize for logging or transmission.

## Interface ActivePingContract

The ActivePingContract defines a way to keep you informed about the status of your active pending signals – those signals that are still open and being monitored. Every minute, while a signal remains active, this contract sends out a ping, providing detailed information.

Think of it as a heartbeat signal for each active pending signal.

Each ping contains key details like the trading symbol, the strategy name that initiated it, the exchange where the signal is being tracked, the timeframe being used, and all the data associated with that specific signal. It also includes the current price of the asset and indicates whether the ping originated from a backtest (historical data) or live trading.

This information allows you to build custom logic to manage your signals dynamically, perhaps based on price movements or other conditions.  You can register callbacks to receive these pings and react accordingly.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, letting you know it's moving forward without waiting for a specific price level.  It provides a ton of detail about the trade, like a unique ID, the exact time of activation, and whether it's happening in backtest or live mode. 

You'll find key information about the trade itself: the trading pair, the strategy used, the exchange involved, the trade direction (long or short), and the entry, take profit, and stop-loss prices – both the original values and those adjusted by any trailing mechanisms.

Beyond the immediate trade details, the notification also includes comprehensive performance metrics like total entries (including any averaging), partial closes, profit/loss data (both absolute and percentage), peak profit, maximum drawdown, and the prices at which those extremes were reached. There's also a timestamp indicating when the signal was initially scheduled and when it went pending.  Finally, you can see the current market price when the trade was activated, a descriptive note about the signal, and a creation timestamp.

## Interface ActivateScheduledCommit

This interface describes an event that occurs when a previously scheduled trading signal is activated. It's essentially a notification that a trade is being put into motion based on a plan.

The event includes key details about the trade, such as whether it’s a long (buy) or short (sell) position and the initial entry price. You'll also find information about the price targets – both the original take profit and stop loss levels, as well as the final, potentially adjusted, prices.

Crucially, it provides performance metrics related to the position up to that point, including the total profit and loss (PNL), the highest profit achieved (peak profit), and the largest drawdown experienced.  A user-provided identifier can be included to give context for why the activation happened. Finally, timestamps show when the signal was initially created and when the position began to be activated.
