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

This interface defines the information shared when a walker needs to be stopped. 

Think of it as a notification that a specific trading strategy, running under a particular walker, is being paused. 

It includes the trading symbol, the name of the strategy to stop, and the name of the walker responsible for initiating the stop. 

This is important for systems that run multiple trading strategies concurrently, allowing you to pinpoint exactly which strategy and walker are being halted.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present the results of backtesting strategies. 
It builds upon the existing IWalkerResults, specifically designed to make it easier to understand and work with the results when you're using markdown to display them. 

Essentially, it bundles together all the performance data for each strategy you've tested, making it simpler to compare how different strategies performed against each other.
The core of this model is the `strategyResults` property, which is a list containing detailed information about each strategy's backtest run.

## Interface WalkerContract

The WalkerContract represents progress updates as different trading strategies are being tested against each other. Think of it as a report card delivered at the end of each strategy's evaluation.

Each update, or 'WalkerContract', provides details about the strategy just completed, including its name, the symbol it was trading, and the exchange and timeframe used.

You’ll see performance data in the form of statistics and a key metric being optimized – with its current value and how it stacks up against the best performer so far.

It also tells you how far along the testing process is – how many strategies have been tested and the total number of strategies planned for comparison. This helps you understand the overall progress of the backtesting process.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a complete backtesting run is finished. It contains all the important information about the test, including which trading system was used (walkerName), the asset being traded (symbol), the exchange and timeframe used for the backtest (exchangeName, frameName). 

You’ll find details about the optimization metric (metric), the total number of strategies that were evaluated (totalStrategies), and crucial information about the best-performing strategy. This includes its name (bestStrategy), its resulting metric score (bestMetric), and a detailed breakdown of its performance statistics (bestStats). This allows you to easily understand and analyze the results of a full backtest comparison.

## Interface ValidationErrorNotification

This notification signals that a validation error has occurred during the backtesting process. 

It happens when the risk validation functions encounter a problem and raise an error. 

Each notification carries a unique identifier and a detailed error message to help you understand what went wrong. 

You’ll also find a serialized error object including a stack trace and any relevant metadata. 

Importantly, the `backtest` property will always be false because these errors relate to situations encountered during live execution, not the historical data itself.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure the names you're using for different components of your backtesting setup are correct. 

Think of it as a way to double-check that things like your exchange name, timeframe, strategy name, risk profile, actions, sizing methods, and parameter sweep names are all spelled right and match what the system expects.

Each property within `ValidateArgs` holds an enum – essentially a list of allowed values – that the system uses for validation. This helps prevent errors arising from typos or mismatched names, making your backtesting process more reliable.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take-profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find details like the trading pair, the strategy that triggered it, and the current market price at the time of execution.

The notification also breaks down the specifics of the position itself, including the original entry price, the adjusted take-profit and stop-loss prices, and the cost of the initial trade.  It goes into even greater detail regarding the position's performance, tracking metrics like peak profit, maximum drawdown, and total profit/loss, all presented with associated prices and costs. Finally, it includes optional notes for a human-readable explanation of the trade's reasoning, along with timestamps for signal creation, pending, and notification creation.

## Interface TrailingTakeCommit

This interface describes an event that happens when a trailing take profit is triggered. It contains all the important details about the trade at that moment, including whether it's a long or short position.

You'll find information like the current market price, the original take profit and stop-loss prices, and how much profit or loss has been realized so far. 

It also records the highest profit and largest drawdown the position has seen since it was opened, along with the entry price. The `percentShift` indicates how the take profit was adjusted based on the trailing rule. Finally, timestamps indicate when the signal was created and the position became active.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered, resulting in a trade. It provides a wealth of information about the trade, including when it happened, which exchange and strategy were involved, and the specifics of the stop-loss and take-profit levels. You’ll find details like the original and adjusted prices, along with the cost of the trade and performance metrics like profit/loss, peak profit, and maximum drawdown, offering a complete picture of the trailing stop's impact.

Here's a breakdown of what you can learn from this notification:

*   **Timing and Context:**  It tells you exactly when the trailing stop was executed, and whether it occurred during a backtest or live trading.
*   **Trade Details:** You'll know the trading pair (like BTCUSDT), the strategy used, and the unique identifiers for the signal and trade.
*   **Price Information:**  See the entry price, original stop-loss and take-profit levels, and how the trailing stop adjusted those prices.
*   **Performance Metrics:** Access key performance indicators like total profit/loss, peak profit achieved, and the maximum drawdown experienced during the trade’s lifecycle.
*   **Signal Reason:** A note field allows for human-readable explanation of the signal's logic.



Essentially, this notification provides a detailed audit trail for trailing stop actions, enabling you to understand why the trade happened and assess its performance.

## Interface TrailingStopCommit

This data represents a trailing stop event, a signal that a stop-loss order has been adjusted based on price movement. It contains a wealth of information about the trade that triggered the event.

The `action` property simply identifies this as a trailing-stop type of action.  The `percentShift` tells you how much the stop loss was moved, expressed as a percentage.  The `currentPrice` shows the market price at the moment the trailing stop was triggered.

You’ll also find details about the position's performance, including its total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).  It indicates whether the trade was a long or short position.

For context, the data includes the original entry price (`priceOpen`), the initially set take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`), as well as the original values before any trailing adjustments (`originalPriceTakeProfit`, `originalPriceStopLoss`).  Timestamps (`scheduledAt`, `pendingAt`) record when the signal was created and when the position became active.

## Interface TickEvent

This describes the `TickEvent` object, which acts as a central container for all the data related to a trading event. Think of it as a record of what happened during a trade, regardless of whether it was scheduled, opened, closed, or something else.

Each `TickEvent` includes details like the exact time of the event, what type of action occurred (scheduled, opened, closed, etc.), and the trading symbol involved.  You'll find information about the signal itself, such as its ID, position type, and any associated notes.

It provides extensive price information, including the initial entry price, take profit and stop loss levels, and their original values before adjustments.  The object also tracks details relevant to averaging strategies, such as the total number of entries and partial closes.

For positions that are active or closed, you'll find profit and loss data, including both unrealized and realized values, along with progress towards take profit and stop loss targets.  Specific events like cancellations and closures have their own reasoning codes. Finally, `TickEvent` stores performance metrics like peak and fall PNL percentages for closed positions, providing a comprehensive overview of the trade's lifecycle.

## Interface SyncStatisticsModel

This model holds information about how your signals are syncing, giving you a clear picture of their lifecycle. It gathers data from all the syncing events that occur.

You’ll find a complete list of these events, including all their details, within the `eventList` property.  The `totalEvents` property simply tells you the total number of sync events that happened.  Specific counts for signal openings (`openCount`) and closings (`closeCount`) are also provided, helping you understand the activity around your signals.

## Interface SyncEvent

The `SyncEvent` provides a comprehensive record of what's happening to your trading signals, helping you understand their lifecycle. It bundles together all the key details, like when the event occurred (`timestamp`), which trading pair it relates to (`symbol`), and the name of the strategy and exchange involved.

You'll find information about the signal itself, including a unique identifier (`signalId`) and the action being taken. It also tracks crucial price points like the entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss (`priceStopLoss`) levels, along with their original values before any adjustments. 

For signals that have been closed, the `SyncEvent` explains why (`closeReason`) and includes performance metrics like profit and loss (`pnl`), peak profit, and maximum drawdown, providing insights into the trade's success. It also tracks details like DCA entries and partial closes. A flag (`backtest`) indicates if the event occurred during a backtest simulation and a timestamp (`createdAt`) records when the event was created. Finally, it includes information regarding the signal's creation (`scheduledAt`) and activation (`pendingAt`) times.

## Interface StrategyStatisticsModel

This model holds a collection of data describing the actions taken by a trading strategy during a backtest. Think of it as a detailed log of what your strategy did.

It includes a comprehensive list of every event that occurred, alongside the total number of events recorded.

You'll also find counts for specific types of actions, such as when a strategy canceled or activated scheduled orders, or executed partial profits or losses.

It also track trailing stops and takes, breakeven actions, and average buy (dollar-cost averaging) events. This information allows you to analyze the strategy's behavior and performance in detail.

## Interface StrategyPauseNotification

This notification lets you know when a trading strategy has been paused or resumed. 
It’s a signal that the strategy isn't actively opening new trades. 
Think of it as a temporary hold on the strategy's actions – existing trades will still be managed and closed as usual.

Here’s what the notification tells you:

*   A unique identifier for this specific pause/resume event.
*   The exact time the pause state changed.
*   Whether the strategy was in backtesting or live trading mode.
*   The trading pair (symbol) the strategy is involved with.
*   The name of the strategy that was paused or resumed.
*   The name of the exchange.
*   The frame name - it's blank if this is a live event.
*   The new pause state - whether the strategy is currently paused (true) or running (false).
*   The creation time of the notification itself.

## Interface StrategyEvent

This object holds all the key details about actions taken by your trading strategy, making it easy to understand what happened and why. It essentially provides a comprehensive record of each trade, from its initial signal to its execution.

Each event includes the time it occurred, the trading pair involved, the name of the strategy and exchange used, and whether it's a backtest or live trade. You'll find information about the signal that triggered the action, the price at the time, and details about any profit-taking or loss-cutting orders.

For actions like DCA (dollar-cost averaging), you'll also see information about the number of entries and the averaged price. It also contains essential data like original prices, trailing stop/loss adjustments, and even notes from the commit that triggered the action. The PNL (profit and loss) information is also included. It's a complete package for analyzing and understanding your strategy's performance.

## Interface SignalScheduledNotification

This notification tells you about a trading signal that's been set to execute in the future. It’s like a heads-up that a trade is going to happen, whether you're testing strategies historically (backtest mode) or live in the market. 

The notification includes a bunch of key details: a unique ID for the signal, the exact time it's scheduled, whether it's for backtesting or live trading, which trading pair it involves, and the strategy that generated the signal.

You'll also find information about where the trade will happen (the exchange), the trade direction (long or short), and the prices involved – the target entry price, take profit, and stop loss. The notification also tracks original price points before any adjustments, and importantly includes details about how any DCA averaging or partial closes might affect the trade. 

Beyond that, it provides financial information like the total cost, potential profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown. It also gives you prices used in those calculations and number of entries/partials, as well as a timestamp for when the signal was created and a current market price at the time of scheduling, plus an optional note explaining the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification signals the opening of a new trade. It provides comprehensive details about the trade, including a unique identifier and timestamp. You'll find information about whether the trade occurred in backtest or live mode, the trading pair involved, and the specific strategy that triggered it.

It outlines key price points like the entry price, take profit, and stop loss, along with their original values before any trailing adjustments. The notification also breaks down DCA (Dollar-Cost Averaging) details – the number of entries and partial closes – along with the total cost and the Profit and Loss (PNL) achieved.

Further insights include peak profit and maximum drawdown metrics, expressed both in absolute values and as percentages. You can also see how the P&L and related metrics were calculated, factoring in things like slippage and fees. Finally, a note field allows for adding a descriptive explanation of the trading decision.

## Interface SignalInfoNotification

This notification lets you track informational messages broadcast by your trading strategies, offering a detailed snapshot of a position's status. It's like getting a status update from your strategy, whether you're running a backtest or live trading.

Each notification contains details like the strategy's name, the trading pair involved, and the exchange where the trade happened. You'll also find key information such as the entry price, take profit and stop-loss levels (both original and adjusted for trailing), and the cost of the initial position.

Beyond the basics, the notification provides a comprehensive performance overview. It includes P&L (profit and loss) figures, peak profit achieved, maximum drawdown experienced, and associated price points. You can also see details about DCA (Dollar-Cost Averaging) entries and any partial closes that occurred. Finally, there’s a user-defined note from the strategy itself, alongside an optional identifier for connecting this notification to other systems. Timestamps for various stages—creation, scheduling, pending, and creation of the signal—are also included for precise tracking.

## Interface SignalInfoContract

This defines the structure of messages sent out by your trading strategies to provide extra information about what's happening. Think of it as a way for strategies to "shout out" details – like why a trade was opened or to help with debugging.

Each message includes information such as the trading pair (symbol), the strategy's name, and the exchange being used. You'll also find the current market price and any notes or identifiers you, as the strategy developer, might have added.

Importantly, the message also indicates if it’s coming from a backtest (using historical data) or live trading.  The timestamp provides a reference point for when the event occurred, whether it's based on a live price or a historical candle. You can use these messages to monitor your strategies, build custom dashboards, or connect to external systems.

## Interface SignalEventContract

The `SignalEventContract` helps you keep track of when trading positions are opened and closed without needing to constantly monitor all signal data. It's like a notification system that tells you specifically when a position starts or ends.

This contract is triggered during backtesting and live trading and provides details about the signal that led to the position’s lifecycle. 

You'll find information such as the trading symbol, the strategy that generated the signal, the exchange being used, and the timeframe of the data. The `data` property provides a comprehensive snapshot of the signal itself – including entry and exit prices, and profit/loss information.

If a position closes, the `closeReason` property will tell you *why* it closed (take profit, stop loss, time expiry, user intervention, or broker fill). The `currentPrice` indicates the price at the moment of the event, either the entry price when opening or the closing price when closing. Finally, the `backtest` property lets you know if this event occurred during a historical simulation or live trading.

## Interface SignalData$1

This `SignalData` object holds all the key details about a completed trade generated by your trading strategy. It's designed to be used when calculating and analyzing your portfolio's performance. 

Each `SignalData` instance represents a single trade that has finished, and it includes things like the strategy that created the signal, a unique ID for that signal, the asset being traded (like "BTCUSDT"), whether you were buying or selling, and the percentage profit or loss on that trade.  You'll also find information about why the trade ended and the exact times it was opened and closed. Essentially, it's a snapshot of a completed trade's essential data, perfect for understanding how your strategies are performing.


## Interface SignalCommitBase

This defines the core information shared by every signal commit event, regardless of the trading strategy. Each signal commit will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated it, and the exchange it's running on. 

You’ll also find information about whether this event is part of a backtest or a live trade, and a unique identifier for the signal.

Important details like the timestamp of the event, the total number of entries made (useful for understanding DCA averaging), and the original entry price are also included. The complete signal data is packaged up for easy access, and a note field allows for adding a human-readable explanation of the signal.

## Interface SignalClosedNotification

This notification signals that a trading position has been closed, whether it was triggered by a take profit or stop loss event. It provides a wealth of information about the closed position, including a unique identifier, the timestamp of the closure, and whether it occurred during a backtest or live trading. You’ll find details like the symbol being traded, the strategy that initiated the signal, and specifics about the entry and exit prices.

The notification also tracks various performance metrics, such as profit and loss in both percentage and absolute USD values, the peak profit reached, and the maximum drawdown experienced.  It breaks down the cost and number of entries related to the trade. Additionally, it gives you insight into the time the position was held, along with a note if a particular reason for closing was added. All the data is there to analyze the performance of a strategy.

## Interface SignalCancelledNotification

This notification details when a planned trade signal is cancelled before it actually executes. It provides a wealth of information about the cancelled signal, including a unique ID, the exact time of cancellation, and whether it occurred during a backtest or live trading. 

You'll find details about the intended trade, like the trading pair, the planned position (long or short), target prices for take profit and stop loss, and the initial entry price. 

The notification also includes financial data associated with the potential trade, like the expected cost, and the potential profit and loss (though since the trade didn't happen, these are typically zero).  

Finally, it explains *why* the signal was cancelled, whether it was due to a timeout, a price rejection, or a user intervention, and how long the signal was pending before cancellation. Essentially, this notification offers a complete snapshot of a signal that never got to complete its intended purpose.


## Interface Signal

The `Signal` object represents a single trading signal generated by your strategy. It holds essential information about the signal's performance.

It includes the `priceOpen`, which is the price at which the position was initially opened.

You'll also find arrays tracking the entry details (`_entry`) and partial exits (`_partial`).
`_entry` stores information like the entry price, cost, and timestamp for each entry in the position.
`_partial` details any partial exits executed, including the reason (profit or loss), percentage, current price, cost basis, entry count, and timestamp.

## Interface Signal$2

This `Signal` object holds important information about a trading position. 

It keeps track of the initial entry price using the `priceOpen` property, telling you exactly where the trade began.

Internally, it stores details about each entry made into the position within the `_entry` array – including the price, associated cost, and the time the entry was made.

Furthermore, the `_partial` array documents any partial exits from the position, noting whether they were for profit or loss, the percentage of the position exited, the price at the time of exit, the cost basis at that point, the number of units held, and the timestamp.

## Interface Signal$1

This `Signal` object holds key information about a trade.

It tracks the initial entry price of the position in the `priceOpen` property.

The `_entry` property is an array that stores details of each entry made, including the price, cost, and timestamp.

Finally, `_partial` keeps a record of any partial exits from the position, specifying the type (profit or loss), percentage, current price, cost basis, entry count, and timestamp for each.

## Interface ScheduledEvent

This interface holds all the key details about trading events – when they were scheduled, opened, or cancelled. Think of it as a single place to find information about a signal's lifecycle.

Each event includes a timestamp, the action that occurred (scheduled, cancelled, or opened), the trading pair involved, and a unique signal ID. You’ll also find details like the position type, any notes associated with the signal, and the prices used for entry, take profit, and stop loss.

For signals that used DCA (Dollar-Cost Averaging), there’s information on the number of entries and partial closes. If a signal was cancelled, you'll find the reason for cancellation and an ID for user-initiated cancellations. Finally, it records details like the original take profit and stop loss prices, unrealized profit and loss (PNL), and the duration of the event.


## Interface ScheduleStatisticsModel

This model holds statistics about scheduled trading signals, letting you understand how your scheduling system performs. 

It breaks down the data into several key areas: a detailed list of all scheduled events, the total number of signals scheduled, opened (activated), and cancelled. 

You can also track crucial performance metrics like the cancellation rate (the percentage of signals that were cancelled), the activation rate (the percentage of signals that were successfully activated), the average waiting time before cancellation, and the average time it takes for signals to activate. 

These numbers help you identify potential bottlenecks, optimize your scheduling rules, and refine your overall trading strategy.

## Interface SchedulePingContract

This defines how the backtest-kit framework communicates about scheduled signals that are actively being monitored. Think of it as a regular heartbeat signal sent every minute while a scheduled signal is running. It provides details about the signal, including the trading pair, the strategy using it, and the exchange it's tied to. 

You’ll also find information like the timeframe being used and the full data associated with the scheduled signal.  Crucially, it includes the current market price and a flag to indicate whether the ping originates from a backtest (historical data) or live trading. The timestamp tells you precisely when this ping occurred, reflecting either the ping time in live mode or the candle's timestamp during backtesting. This allows you to build custom checks or cancellation logic based on these data points.

## Interface ScheduleEventContract

This defines how scheduled trading signals are managed within the system. It lets you keep track of when a signal is initially put on hold (scheduled) or removed (cancelled) without needing to monitor all the signal data.

Think of it as a notification system for signals waiting to be activated. 

Here's a breakdown of what you'll see in these notifications:

*   **Action:**  Indicates whether a new signal was scheduled or an existing one was cancelled.
*   **Symbol:** The trading pair involved (like BTCUSDT).
*   **Strategy Name:**  Identifies the strategy that created the signal.
*   **Exchange Name:** The exchange the signal is tied to.
*   **Frame Name:** The timeframe or date range the signal relates to.
*   **Data:**  All the details of the scheduled signal itself, like its price targets and position size.
*   **Reason (for cancellations):** Explains why a signal was cancelled—was it due to a timeout, price rejection, or user action?
*   **Current Price:** The market price at the time the event occurred.
*   **Backtest Flag:**  Confirms whether the signal is part of a historical backtest or live trading.
*   **Timestamp:** When the event occurred, either a live tick time or a candle timestamp during backtesting.

It's important to note that this system *doesn't* notify you when a signal is actually activated (starts trading); activation events are handled elsewhere.

## Interface RiskStatisticsModel

This model holds data about risk events, specifically rejections that occurred during trading. It's designed to help you monitor and track risk management performance. 

You’ll find a complete list of the risk events themselves in the `eventList` property, allowing you to dive into the details of each rejection. 

The `totalRejections` property provides a simple count of how many rejections occurred overall. 

To understand where the risks are concentrated, the `bySymbol` property breaks down the rejections based on the trading symbol, and `byStrategy` groups them by the trading strategy used.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked because of risk management rules. It's essentially a heads-up that something didn't go as planned.

You'll find a unique ID for the notification, along with a timestamp showing exactly when the rejection happened.  The `backtest` property confirms if it happened during testing or live trading.

It includes important details like the symbol being traded (e.g., BTCUSDT), the name of the strategy that tried to generate the signal, and the exchange involved. A human-readable explanation (`rejectionNote`) clarifies *why* the signal was rejected.

Furthermore, it provides context around the rejection, such as the number of active positions, the current price, and details about the signal itself (signal ID, trade direction, entry price, take profit, and stop loss).  You can also see a note describing the signal's intended purpose and when it was created.

## Interface RiskEvent

The `RiskEvent` object holds details when a trading signal is rejected because it violates a risk limit. Think of it as a record of a signal that couldn't be executed due to a safety check.

It captures key information, including the exact time the rejection happened (`timestamp`), the trading symbol involved (`symbol`), and the specifics of the signal itself (`currentSignal`). You’ll also find the name of the trading strategy (`strategyName`), the exchange being used (`exchangeName`), and the timeframe of the data (`frameName`).

Additional data includes the current market price (`currentPrice`), the number of active positions at the time (`activePositionCount`), and a unique ID (`rejectionId`) for tracking the rejection. A note explaining why the signal was rejected (`rejectionNote`) is also included. Finally, the `backtest` flag indicates if the event occurred during a backtesting simulation or in live trading.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. It's a record of when a strategy's order was blocked because it violated a risk limit.

Think of it as a notification that something went wrong and a trade didn't happen.

This notification includes details like the trading pair (symbol), the specifics of the signal that was being proposed (currentSignal), the name of the strategy that tried to execute it (strategyName), and the timeframe it was intended for (frameName).

You'll also find the exchange involved, the current market price at the time, and the number of open positions at the time of rejection (activePositionCount).  A unique ID (rejectionId) helps with tracking specific issues.

The rejectionNote provides a human-readable explanation of why the signal was rejected, along with a timestamp for when the rejection occurred.  Finally, it indicates whether the event happened during a backtest or in a live trading environment (backtest).

Services like report generators and user notifications rely on these RiskContract events to monitor and understand risk management activity.

## Interface ProgressWalkerContract

This interface lets you monitor the progress of a backtest walker. It provides updates on the background execution of a walker, allowing you to see how far along it is.

You'll receive events containing key information like the walker's name, the exchange being used, the frame it's operating within, and the trading symbol involved.

The events also tell you the total number of strategies the walker will process and how many have already been handled. Finally, you’ll get a percentage representing the overall completion status, ranging from 0.0 (just started) to 1.0 (finished). This lets you track the progress of complex backtesting processes.


## Interface ProgressBacktestContract

The `ProgressBacktestContract` is like a status report during a backtest. It tells you what's happening behind the scenes while the backtest runs. 

You'll see updates with the exchange being used, the strategy’s name, and the trading symbol involved. It also provides key details like the total number of historical data points (frames) the backtest will cover, how many it has already analyzed, and the overall percentage of completion. This allows you to monitor the backtest’s progress and estimate how much longer it will take.


## Interface PerformanceStatisticsModel

This model holds the results of a backtest's performance analysis, grouping data by the strategy used. It tells you the name of the strategy that was run, and the overall number of performance events that were tracked during the backtest. 

You'll also find the total time it took to calculate the performance metrics.

The `metricStats` section provides a breakdown of statistics based on the type of metric being measured. Finally, the `events` array gives you access to all the individual performance data points collected during the backtest.

## Interface PerformanceContract

The PerformanceContract helps you keep tabs on how your trading system is performing. Think of it as a way to measure how long different parts of your strategy take to execute. Each time a key action happens, like placing an order or calculating an indicator, a PerformanceContract is generated.

This contract includes details like when the action occurred, how long it took to complete, the name of the strategy and exchange involved, and whether it's happening during a backtest or in live trading. By collecting these data points, you can identify slowdowns or inefficiencies in your code and optimize your trading system for speed and reliability. 

The `timestamp` and `previousTimestamp` properties let you calculate time differences and analyze trends. `metricType` specifies the type of action being measured, while `strategyName`, `exchangeName`, and `frameName` provide context. The `backtest` flag distinguishes between backtest and live execution environments.

## Interface PauseContract

This interface describes the events triggered when a trading strategy is paused or resumed. It's designed to help you inform users about these changes, like sending notifications via Telegram.

When a strategy is paused, it stops placing new orders, but any existing orders or signals will still be handled normally.

The information provided includes the trading symbol, whether the strategy is paused (true means paused), the time of the change, the strategy's name, the exchange being used, the timeframe, and importantly, a flag to indicate whether this is a backtest or a live trading event. This lets you tailor your notifications appropriately.

## Interface PartialStatisticsModel

This model holds statistical information derived from tracking partial profit and loss events during a backtest. It allows you to analyze the frequency and distribution of these events.

You'll find a detailed list of each individual profit/loss event within the `eventList` property.

The `totalEvents` property tells you the overall number of profit and loss events recorded.

`totalProfit` tracks the number of times a profit event occurred, and `totalLoss` tracks the number of loss events. These help understand the performance balance.

## Interface PartialProfitContract

The `PartialProfitContract` helps you keep track of when your trading strategy hits profit milestones during execution. It's like a notification system for partial take-profit events.

Each event gives you details about the trade, including the trading pair, the strategy involved, and the exchange being used. It also tells you which profit level (10%, 20%, etc.) has been reached.

You get the current price at the time of the profit event, the original signal data, and whether the execution is a backtest or live trade. Timestamps are provided for both live and backtest modes, reflecting when the level was detected. Services like report generators and your own custom callbacks can use these events to monitor performance and execution. These events are designed to be unique for each level and signal, even if several are triggered quickly.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It provides a ton of detail about the trade, including when it happened, whether it was a backtest or a live trade, and the trading symbol involved.

You'll find key information like the strategy name and exchange used, along with a unique ID for the signal that triggered the action. The notification also breaks down the specifics of the trade itself, such as the percentage of the position closed, the current market price, and the trade direction (long or short). 

Beyond the basics, you can see the original entry price, take profit and stop-loss levels (both original and adjusted), and a breakdown of the total cost and number of entries involved.

Finally, it offers a complete picture of the position's performance, including total profit/loss (PNL), peak profit, maximum drawdown, and various price and cost metrics. A note field gives you extra context, while timestamps provide a timeline of the signal’s lifecycle from creation to execution.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It provides detailed information about the trade that's being partially closed, including the percentage of the position being taken off. You'll find the current market price when the action was triggered, along with the profit and loss (PNL) figures for the entire position, from its initial entry through to this partial exit.

The record also includes information about the position's performance – the highest profit it reached (peak profit) and the largest drawdown it experienced. Crucially, it contains the original and adjusted entry price, take profit, and stop-loss levels, as well as the dates and times the signals were created and the position was activated. This data enables a complete understanding of the context and rationale behind the partial profit-taking decision.

## Interface PartialProfitAvailableNotification

This notification lets you know when your trading strategy has hit a partial profit milestone, like 10%, 20%, or 30% of its target. It's triggered when a signal reaches a predefined profit level. 

You'll receive this notification whether you're running a backtest or live trading. It provides detailed information about the trade, including the symbol involved, the strategy used, the exchange where the signal was executed, a unique signal ID, and the specific profit level reached.

Beyond the basics, the notification also includes the current market price, original entry price, and the trade direction (long or short). You'll see information about the effective take profit and stop loss prices, along with their original values before any adjustments.

It also gives you a comprehensive look at the trade’s performance. This includes the total cost of the initial position, number of entries and partial closes, total profit and loss (pnl), peak profit, maximum drawdown, and percentage-based performance metrics. This helps understand how the trade has performed relative to initial investment.

Finally, this notification can include additional details like a human-readable note explaining the signal’s reasoning, as well as timestamps for signal scheduling, pending, and creation.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. It’s a way to keep track of how much a strategy has lost and when those loss milestones are reached.

These notifications are triggered when a trading signal reaches a specific loss level and are only sent once per signal to avoid duplicates.  If the price moves quickly, you might receive multiple loss level notifications in a single tick.

The notification includes details like the trading symbol, the name of the strategy involved, the exchange being used, and the specific loss level reached.  It also provides the current market price, the original data from the signal, and a timestamp indicating when the loss level was detected - either in a live trading scenario or during a historical backtest. Knowing if the event is from a backtest versus live trading helps in differentiating between historical performance and current conditions.

## Interface PartialLossCommitNotification

This notification lets you know when a portion of a trading position has been closed, providing a wealth of details about the trade. It's triggered whenever a partial closing action is taken, whether it's part of a backtest or a live trade.

You'll see information like the unique ID of the notification, the exact time it occurred, and whether it was a backtest or a live trade. The notification also includes the trading pair (like BTCUSDT), the strategy that initiated the action, and the exchange used.

Beyond the basics, you get key details about the position itself: the entry price, the take profit and stop-loss levels (both original and adjusted for trailing), the direction of the trade (long or short), and the percentage of the position that was closed.

Critically, the notification provides a comprehensive PNL breakdown, including peak profit, maximum drawdown, and related price and cost information. You can also find details related to the initial position setup, like the cost, number of entries, and total partial closes. A note field lets the strategy add a human-readable explanation for the closing action. Finally, timestamps relating to creation, scheduling, and position pendency are provided for a full view of the lifecycle.

## Interface PartialLossCommit

This object represents a partial loss event within the backtest-kit trading framework. It details the circumstances surrounding a decision to close a portion of an open position. 

The `action` property clearly identifies this as a partial loss event. 

The `percentToClose` specifies what fraction of the position is being closed, expressed as a percentage. The `currentPrice` indicates the market price when the decision to close was made. 

It also provides comprehensive performance data for the position, including the total profit/loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). 

You'll also find information regarding the trade's direction (`position`), the entry price (`priceOpen`), and both the final take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`) along with their original, untrailed values (`originalPriceTakeProfit`, `originalPriceStopLoss`).

Finally, timestamps (`scheduledAt`, `pendingAt`) track when the signal was created and when the position was activated.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading strategy hits a predefined loss level, like -10%, -20%, or -30% of the initial investment. It's a way to track potential issues and understand how a strategy performs under pressure, whether you're running a test or a live trade.

The notification includes details like the unique signal ID, the exact time the loss level was triggered, and whether it's happening during a backtest or a live trading scenario. You’ll see the trading pair involved, the strategy’s name, and which exchange the signal originated from. Crucially, it breaks down the trade details: the entry price, trade direction (long or short), take profit and stop loss levels, and the original prices before any trailing adjustments.

Furthermore, it provides a complete financial picture of the position. This includes the total cost, the number of entries made (for strategies using dollar-cost averaging), the number of partial closes performed, and the profit and loss (PNL) calculations. You can also view metrics like peak profit and maximum drawdown, all with associated prices and costs. The final data includes timestamps related to the initial signal creation, pending state, and notification generation. A note field allows for a human-readable explanation behind the signal's logic.

## Interface PartialEvent

This object holds all the key details about profit and loss milestones during a trade. Think of it as a snapshot of what happened at each significant point, like reaching a 10% or 20% profit level. 

It includes information like the exact time of the event, whether it was a profit or loss, the trading pair involved, and the strategy and signal that triggered the trade. 

You'll also find important pricing data like the entry price, take profit target, stop loss, and their original values when the signal was first created. For strategies using dollar-cost averaging (DCA), it tracks the number of entries and the original entry price before averaging. 

The object also contains information on partial closes, the unrealized profit and loss at the moment of the event, a human-readable description of the signal's reasoning, and timestamps marking when the position became active and when the signal was initially scheduled. Finally, it indicates whether the event occurred during a backtest or a live trading session.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or through a scheduled order. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it's part of a backtest or live trading. You'll find details like the trade symbol, the strategy used, the exchange involved, and the specific type of order that triggered this event.

Beyond the basic details, the notification includes critical performance metrics like profit and loss (PNL), peak profit, maximum drawdown, and associated prices – helping you understand the position's performance so far. You'll also get information about entry and exit prices, the cost of the trade, the trade direction (long or short), and any adjustments made to take profit and stop loss levels. Finally, it includes details about scheduled signals, creation timestamps, and any notes attached to the signal.

## Interface OrderSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it's because a profit target was hit, a stop-loss triggered, time ran out, or the user manually closed it. It provides a wealth of information about the closed position, including when it happened, the trading pair involved, and the strategy that generated the signal. You’ll find details like the total profit or loss, the peak profit achieved, and the maximum drawdown experienced during the trade's lifespan.

The notification also breaks down the specifics of the position, like the entry and exit prices used for profit/loss calculations, the original profit and loss targets, and the number of entries and partial closes made. Additional information includes the creation timestamp of the signal and the reason for its closure. Knowing the 'type' helps distinguish these close notifications from others. The 'backtest' flag tells you if this occurred during a simulated trading test or a real live trade.

## Interface OrderSyncCheckNotification

This notification provides details about the status of an order associated with a trading signal, specifically for order synchronization checks. It's a way to verify that the order placed by your strategy on an exchange still exists and is active. This happens continuously while the framework is monitoring a signal in live mode.

The framework limits how often it sends these notifications to avoid overwhelming the system – it won’t send more than one notification every 15 minutes for each signal.

The notification contains a wealth of information about the order and the position it represents. You'll find details such as the trading pair, strategy name, price levels, costs, and profit/loss data. It also includes information like the entry price, stop-loss, and take-profit levels, potentially adjusted for trailing.  The `backtest` flag indicates whether the data comes from a simulated backtest or from live trading. The included PnL data lets you track performance metrics like peak profit and maximum drawdown. Finally, you'll see timestamps for significant events like signal creation and when the order became pending. This provides a complete picture of the order's lifecycle and performance so far.

## Interface OrderSyncBase

This describes the foundational data shared across all order synchronization events within the backtest-kit framework. It provides essential information about the order being managed, whether it’s an active order like opening or closing a position, or a resting order placed as part of a scheduled signal.

You'll find details like the trading symbol (e.g., BTCUSDT), the strategy that generated the signal, and the exchange and timeframe used. Backtesting events will be clearly marked with a `backtest` flag, distinguishing them from live trading.

Each event has a unique signal identifier and timestamp, along with the complete public signal data at the time of the event. The `attempt` field is crucial – it tracks consecutive failures for retry purposes, helping the framework handle issues and ensure orders are executed successfully. This field is automatically managed by the system, and the number of attempts are capped based on configurations.

## Interface OrderStopContract

This event signifies that the trading framework has determined an order associated with a signal is no longer active on the exchange and is being handled definitively. It’s a terminal notification – meaning it happens once and signals a final action.  Think of it as the system saying, "This order is done, and here's why."

The `type` property tells you if it's an 'active' order (a regular open position) or a 'schedule' order (a pending entry).  The `reason` clarifies why the order is ending: either the order was unexpectedly deleted from the exchange ("deleted"), or the framework tried to confirm the order's status too many times and failed ("exhausted"). 

Along with this core information, you’ll find details about the trading pair (`symbol`), the strategy that created the signal (`strategyName`), where the trade happened (`exchangeName`), and key pricing data like the current price, entry price, take profit levels, and stop-loss levels.  You'll also see the unrealized profit/loss (PNL), peak profit, and maximum drawdown of the position.  Finally, it gives you technical information like signal identifiers, timestamps, and details about any averaging or partial closures performed.  Keep in mind, this event *only* occurs in live trading environments, as backtesting doesn't perform these order checks.

## Interface OrderStopCheckNotification

This notification signals the end of a monitored order check, a terminal event indicating the check has resolved. It's a rare notification, occurring when a monitored order is definitively deleted or the check has failed too many times. The framework will either close an active order or cancel a scheduled one.

The notification provides a wealth of detail about the order, the signal that triggered it, and the position's performance.  You'll find information like the symbol, strategy name, signal ID, and importantly, whether it's an active order or a scheduled one. Crucially, it tells you *why* the check ended - either the order was not found (deleted) or the check retry attempts were exhausted.

You get a snapshot of the position's state, including the entry price, take profit/stop loss prices (both original and adjusted), DCA information (total entries and partials), and detailed Profit & Loss (PNL) metrics—including peak profit and maximum drawdown—along with timestamps detailing its lifecycle. The 'reason' property tells you whether the check ended because the order was deleted or due to repeated check failures. Finally, a 'note' field provides a user-friendly description of the signal's underlying reason.

## Interface OrderRejectOpenNotification

This notification signals that an order placement has been definitively rejected by the exchange – it’s a terminal event, meaning retrying won't help. It only happens when the system determines a rejection is final, not a temporary hiccup. You'll only see this for live trading, never during backtesting.

The notification provides a wealth of information about the rejected order: its unique identifier, the timestamp of the rejection, the strategy that generated the signal, the exchange involved, and a detailed reason for the rejection, given as a human-readable message.  

It also includes key performance metrics for the position up to this point, such as profit and loss (P&L), peak profit, maximum drawdown, and associated pricing details, giving context to the rejection. Information about the original and adjusted take profit and stop loss prices are also present. Finally, details about the entries and partials executed and timestamps of creation and activation are given.

## Interface OrderRejectOpenContract

This event signals that an attempt to open a position or schedule an entry has been rejected. 

Essentially, it means your trading order—whether it’s a live order or a planned one—was definitively refused and won't be executed. The attempt is canceled, and the associated signal is discarded.

The `action` property tells you *why* the rejection occurred, indicating whether it relates to opening a position or scheduling an entry.

The `cost` property provides the financial cost associated with the rejected trade.

## Interface OrderRejectCloseNotification

This notification signals that a closing order was rejected by the broker—essentially, a forced closure didn't go through. It only happens when a close attempt fails and the broker returns an error. It's strictly a live-only event, meaning it won't occur during backtests.

Here’s what you can find in this notification:

*   A unique ID, timestamp, and details about the strategy and exchange involved.
*   The signal ID, representing the original order's identifier.
*   The reason the broker rejected the order—a human-readable error message.
*   The current market price at the time of the rejection.
*   A snapshot of the position’s performance, including profit/loss (PNL), peak profit, and maximum drawdown.
*   Key information about the order itself, such as its type (always "active" for closes), the number of attempts to close, and the original close reason.
*   Details about the original order parameters – entry/take profit/stop loss prices.
*   Information related to the position’s cost, entries, and partials.
*   Timestamps detailing signal creation, position activation, and notification creation.

## Interface OrderRejectCloseContract

When a trading strategy attempts to close a position but the order is definitively rejected by the system, this `OrderRejectCloseContract` is used. It signifies that the closing action failed and the system will handle the closure based on the original reason for attempting the close. The `action` property is always "signal-close" to indicate this type of rejection, and the `closeReason` property details why the closure couldn't proceed. Essentially, it's a notification that a closing order was blocked and the system needs to react accordingly.

## Interface OrderRejectBase

This API reference describes events that occur when an order is definitively rejected by an exchange, a situation that won't be retried. These "OrderRejectBase" events signal that the exchange has refused an order, and it’s time to move on – the system won't attempt to resend that order again.

The events are triggered only in live trading environments, never during backtesting because the rejection process is skipped.  You'll receive this notification when either opening a new position or closing an existing one is blocked by the exchange.

Each event contains detailed information about the rejected order, including:

*   Which type of order was rejected (active or scheduled).
*   The symbol, strategy, and exchange involved.
*   A unique ID for the signal that triggered the order.
*   The current market price and a snapshot of the position’s profit/loss, peak profit, and maximum drawdown.
*   The original order prices (take profit, stop loss, and open price), and any trailing adjustments applied.
*   Timestamps indicating when the signal was created and the position was activated.
*   A human-readable explanation of why the order was rejected, provided by the broker.
*   The number of consecutive failed attempts that led to the rejection.

Essentially, this data provides a clear picture of why an order failed and offers insights into the state of the position at the time of the rejection.

## Interface OrderOpenContract

This event, `OrderOpenContract`, is triggered when a limit order placed by the trading framework is actually filled, marking the beginning of a new position. Think of it as confirmation that your order went through on the exchange.

It's particularly useful for keeping external systems in sync with what's happening in the trading process—like updating order management systems or logging activity. 

The event provides a wealth of information about the trade, including the price at which the order was filled (`priceOpen`), the current market price (`currentPrice`), and the trade direction (`position`). You’ll also find details on profits, losses, costs, and the original prices used for take profit and stop loss orders, before any adjustments were made. The timestamps (`scheduledAt`, `pendingAt`) help pinpoint when the signal was created and when the position became active.  Finally, `totalEntries` and `totalPartials` tell you if the position was built through averaging or partial exits.

## Interface OrderFillOpenNotification

This notification confirms that a trade has been successfully opened or a resting order placed on a live exchange. It's a definitive signal, arriving *after* the initial order synchronization process has been verified – meaning the exchange has actually executed the order.  You won’t receive these notifications for failed attempts.

The notification contains a wealth of information about the trade, including:

*   **Key details:**  Symbol, strategy name, exchange, signal ID, order type (active or schedule), and a unique ID for this particular event.
*   **Performance metrics:**  Current profit/loss (PNL), peak profit, maximum drawdown, and associated prices, percentages, and entry numbers—offering a snapshot of the trade's performance since inception.
*   **Trade specifics:**  Entry and exit prices, original take profit/stop loss levels (before trailing adjustments), and the number of entries and partial closes.
*   **Timing information:** When the signal was created, and when the position was activated.
*   **Reasoning:** An optional note providing context or explanation for the trade.



This information allows you to monitor the real-time performance of your trading strategies and understand how they are interacting with the market.

## Interface OrderFillOpenContract

This object represents confirmation from your broker about a new position being opened or an order to open a position being placed. It essentially tells you that something has happened with your order – either a trade has been executed and a position is now active, or an order to open a position has been sent to the exchange and is waiting.

The `action` field tells you *what* happened – was a position actually opened (`signal-open`) or was an order just placed (`schedule`)? 

The `cost` field tells you the total cost associated with creating this position, useful for calculating profitability later.

## Interface OrderFillCloseNotification

This notification signals that a trading position has been definitively closed on an exchange. It’s a confirmation that your exit order actually went through—a key piece of information confirming successful trading.

It contains a wealth of details about the closed position, including identifiers like a unique ID, timestamps, and the strategy that generated the signal. You’ll find specifics about the trade itself like the trading pair (e.g., BTCUSDT), direction (long or short), and the original and effective prices used for entry, take profit, and stop loss.

The notification also provides a snapshot of the position’s performance, including P&L (profit and loss) metrics, peak profit, maximum drawdown, and various price points related to those calculations.  It also tracks details about the entry and exit process, such as the number of entries (DCA averaging) and partial closes.

Importantly, these notifications are only received when trading live, as they rely on confirmed execution from the exchange. The "attempt" field tells you how many times the system tried to close the position before it was successful.  The notification includes reasons for the close (take profit, stop loss, or time expiration), and an optional note for more detail.


## Interface OrderFillCloseContract

This describes when a trade has been fully closed based on information received from your broker. It signifies that an exit order – whether triggered by a take profit, stop loss, time, or a manual closing action – has actually been executed. The `action` property always indicates this is a "signal-close."  The `closeReason` property tells you *why* the position was closed, giving you more detail about the exit event.

## Interface OrderFillBase

This describes the information included when an order is successfully filled and confirmed by a broker. Think of it as a notification sent *after* an order has gone through and the broker has acknowledged it. You won't receive these notifications during backtesting or when orders are rejected or transiently failed.

Here's a breakdown of what's included in this notification:

*   **Order Type:** Whether it’s an order to open a position ("active") or one placed as part of a scheduled signal ("schedule").
*   **Key Details:** The trading symbol, the strategy that initiated the order, the exchange used, and the timeframe.
*   **Unique Identifiers:**  A unique signal ID (which matches the client order ID) and a timestamp indicating when the confirmation occurred.
*   **Signal Context:**  The complete signal data from when the order was placed.
*   **Attempt Number:** The number of previous, unsuccessful attempts to confirm the order.
*   **Performance Metrics:**  Current price, the strategy's profit and loss (PNL), peak profit achieved, and maximum drawdown.
*   **Trade Direction:** Whether the trade is a "long" (buy) or "short" (sell) position.
*   **Price Information:** Entry price (including DCA averaging), take profit price (including trailing adjustments), and stop loss price (also with trailing adjustments), along with their original, unadjusted values.
*   **Timing Information**: Timestamp for signal creation and the time the position was activated.
*   **Entries and Partials**: Total number of DCA entries and partial closes.

## Interface OrderContinueContract

This event signals that the framework is continuing to monitor an order on an exchange. It happens when the initial order check was successful or, even if it temporarily failed, the framework is still assuming the order is open. You'll receive this event repeatedly while the order is still active and being monitored. The `type` property tells you whether it's an order backing an open position (`active`) or a resting order waiting for a signal (`schedule`). 

The `attempt` number indicates how many consecutive failures the order check has tolerated before the framework decided to keep monitoring; a higher number means it's been flagged for potential issues. 

The event provides a lot of detail about the order, including the trading pair, strategy name, exchange, timeframe, signal ID, the original and current prices, the realized and potential profits, and details about the take profit, stop loss, and entry prices. The `totalEntries` and `totalPartials` attributes describe how many times the position was averaged or partially closed. This is a live-only event, meaning it won't appear during backtests.

## Interface OrderContinueCheckNotification

This notification provides ongoing updates about an order check, particularly when the check isn't immediately resolved (like a simple yes/no). It's a continuous monitoring process – think of it as a "check-in" to see how an order is doing.  If an order is still open or a small problem pops up, this notification lets you know, and monitoring continues. 

The information included is quite detailed, giving a complete snapshot of the order's status. You'll find data about the signal that triggered the order, the trading pair, the current price, and how the position is performing – including profit/loss, peak profit, and maximum drawdown.  You can see the original and adjusted prices, the number of entries and partial closes, and even the reason behind the signal. This level of detail enables close tracking and analysis of your trading activities. The "attempt" field indicates if the system tolerated a temporary issue – a higher number means more attempts to resolve a transient problem. This helps you understand the resilience of your trading logic.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether that's because a profit target was reached, a stop-loss was triggered, time ran out, or a user manually closed it. It's designed to help external systems stay in sync with what's happening in the trading process, like updating order books or recording profit and loss information.

The event provides a wealth of information about the closed position, including the current market price at the time of closure, the total profit or loss realized, and the highest profit and largest losses seen during the trade's lifetime. You’ll also find details like the initial entry price, the take profit and stop-loss levels (both original and adjusted for trailing), and how many times the position was averaged or partially closed. The `closeReason` tells you exactly *why* the signal was closed, and timestamps let you know when the signal was initially created and when the position was activated.

## Interface OrderCheckContract

This event, called "signal-ping," keeps track of orders related to your trading signals. It's a way for the framework to confirm with your order management system if a signal’s order is still active on the exchange. 

Think of it as a regular check-in to make sure everything is as it should be. It happens frequently while a signal is being monitored, before the framework decides what to do next.

There are two types of checks: one for active (open) positions and another for scheduled (pending) orders.

How you respond to this check is crucial:

*   If the order is still open, acknowledge it (or do nothing), and the system will keep monitoring.
*   If the order is gone (filled, cancelled, or liquidated), immediately notify the framework—this ends the monitoring process.
*   Temporary issues with the exchange (like network problems) are tolerated, but the system will keep retrying the check until it succeeds or fails definitively.

This event *doesn't* happen during backtesting, as there's no real-time exchange connection.

The event provides a wealth of information about the signal, including: the trading pair, strategy name, exchange, price levels, profit/loss, and details about how the position was built (DCA entries, partial closes).  A counter tracks consecutive failed checks, helping the system distinguish between genuine problems and temporary hiccups.

## Interface MetricStats

`MetricStats` represents a collection of statistics calculated for a particular type of performance measurement. It holds information like the total number of times a metric was recorded, the total time taken across all measurements, and various duration-related statistics. You'll find details on the average, minimum, and maximum durations, alongside statistical measures like standard deviation, median, and percentiles (95th and 99th).

It also includes data about wait times between events, providing insights into the intervals between occurrences. Essentially, `MetricStats` gives you a comprehensive overview of how a specific metric performed during a backtest or analysis. 

The `metricType` property tells you what kind of metric these statistics relate to.


## Interface MessageModel

This describes a single message within a conversation powered by a large language model. Each message represents a turn in the chat, and it can be a system instruction, a user's question, the assistant's reply, or the results of a tool being used.

Every message has a `role` which tells you who sent it – the system, the user, or the assistant. The `content` holds the actual text of the message.

Sometimes, the assistant will use tools, and in those cases, you'll find `tool_calls` describing those interactions. Some language models also offer reasoning steps – that's what `reasoning_content` is for.

Messages can also include images, which can be provided as either base64 encoded strings, raw byte arrays, or standard `Blob` objects.

Finally, if a message is a response to a specific tool call, it will have a `tool_call_id` to link it back to that call.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading period. 

It contains a list of individual drawdown events, presented in chronological order from most recent to oldest. Each event in the list provides details about a specific drawdown occurrence.

Additionally, it tracks the total number of drawdown events that have been recorded.

## Interface MaxDrawdownEvent

This object represents a single instance where a maximum drawdown was recorded for a trading position. It includes information like the exact time the drawdown occurred (timestamp), the trading pair involved (symbol), and the name of the strategy and signal that generated the trade.

You'll also find details about the position itself—whether it was a long or short trade—along with the total profit and loss (PNL) of the position, the highest profit ever achieved, and the size of the maximum drawdown. 

Further details specify the price levels at the time of the event, including the entry price, take profit price, and stop-loss price. Finally, a flag indicates whether this drawdown event happened during a backtest simulation.

## Interface MaxDrawdownContract

This contract provides updates whenever a new maximum drawdown is observed for a trading position. It's designed to give you the details surrounding that drawdown event, including the trading symbol, the current price, and the precise timestamp of the event. You'll also get information about the strategy, exchange, and timeframe involved. 

The `signal` property gives you access to the signal data that triggered the position, while the `backtest` flag lets you know if this event occurred during a backtest or a live trade.

Tracking these drawdown events is important for managing risk and making informed decisions about your trading strategy, allowing you to react dynamically to performance changes.


## Interface LiveStatisticsModel

This model provides a comprehensive view of your trading performance by tracking a wide range of statistics from your live trading results. It gathers data from every event – from initial idle periods to opened, active, and closed trades – and compiles it into key performance indicators.

You'll find metrics covering everything from simple counts of wins and losses to more advanced measures like Sharpe and Sortino ratios, which assess risk-adjusted returns.  The model also calculates things like average trade duration, volatility (standard deviation), and directional pressures (buyer/seller strength) to give a more nuanced understanding of market dynamics.

Several properties offer insights into trade characteristics, such as average win/loss durations and the median step size between price changes. Furthermore, it classifies the overall trend as bullish, bearish, sideways, or neutral, along with an indication of how confident that classification is. Keep in mind that any numerical values may be marked as null if they are unreliable due to factors like division by zero.

## Interface InfoErrorNotification

This component handles notifications about errors that occur during background tasks, but are considered recoverable – meaning the process can likely continue. Each notification has a specific type, identified as "error.info", ensuring clarity about the notification's nature. 

Each notification also includes a unique identifier for tracking purposes, a detailed error object that contains the stack trace and extra information, and a clear, human-readable explanation of the error. Importantly, these errors originate from the live trading environment, so the "backtest" flag is always false.

## Interface IdlePingContract

The `IdlePingContract` represents an event that occurs when a trading strategy isn't actively engaged – meaning no signals are currently being monitored. Think of it as a heartbeat indicating the strategy is in a waiting or idle phase.

This event provides valuable information about the strategy's state, including the trading pair's symbol, the strategy's name, the exchange it's running on, and whether it's part of a backtest or live trading.  You’ll also get the current market price at the time of the ping, a timestamp indicating when the event happened, and a flag to distinguish between a backtest (historical data) and a live trade.

You can subscribe to these `IdlePingContract` events using `listenIdlePing()` or `listenIdlePingOnce()` to monitor your strategies and understand their lifecycle.

## Interface IWarmCandlesParams

This object defines the settings needed to fetch and store historical candlestick data. It’s helpful to load a good chunk of data before you start a backtest, so the backtest doesn't have to wait while downloading it. 

You’ll specify the trading pair you’re interested in, like "BTCUSDT," along with the exchange providing that data. You also pick a time interval, such as 1-minute candles or 4-hour candles. 

Finally, you'll set a start and end date to determine the range of historical data to download and save.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy within a backtest comparison. It holds key information about that strategy. 

You'll find the strategy's name, allowing you to easily identify it. 

A set of statistical data detailing the backtest performance is also included.
A specific metric value is provided to allow comparison between different strategies. If the strategy is invalid for comparison, this value will be null.

Finally, a rank number shows the strategy's position relative to other strategies being tested, with a rank of 1 indicating the best performance.

## Interface IWalkerSchema

The IWalkerSchema helps you set up and manage A/B tests across different trading strategies. 

Think of it as a blueprint for how you want to compare your strategies. 

You'll give it a unique name (walkerName) for easy identification and maybe a note to help you remember what it's for. 

It tells the system which exchange and timeframe to use for testing all the strategies included. 

The core of the schema is the strategies array – this lists the names of the strategies you want to compare against each other, and those strategies must be previously registered. 

You can also specify which metric, like the Sharpe Ratio (but it can be another), to use to determine which strategy is performing best. 

Finally, if you want more control, you can add optional callbacks to hook into different phases of the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered after running a comparison of different trading strategies. It essentially represents the outcome of a full "walkthrough" of your backtesting setup. 

You’ll find details like the trading symbol that was tested, the name of the exchange used for data, the specific name of the "walker" (the comparison process itself), and the name of the time frame used for the backtest. This object allows you to easily access and understand the context of the backtest results.


## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into key events during the backtesting process when comparing different strategies. Think of it as a way to get notified about what's happening behind the scenes.

You can receive a notification when a specific strategy begins testing, letting you track progress or log the start of a new test.

Similarly, you'll be notified when a strategy's backtest is finished, along with some summary statistics and a key performance metric.

If something goes wrong during a strategy test – like an error occurs – you’ll receive an error notification, so you can handle it appropriately.

Finally, when all the strategy tests are completed, a notification signals the overall process is done, giving you a chance to process the combined results.

## Interface ITrailingTakeCommitRow

This interface represents a specific type of action queued within the backtest-kit framework – a trailing take commit. Think of it as a step in automating your trading strategy. 

It essentially tells the system to adjust a trade's stop-loss order based on a trailing percentage. 

The `action` property explicitly identifies this as a "trailing-take" action.  You'll also find the `percentShift` which dictates how much the price needs to move to trigger the trailing adjustment, and `currentPrice` which stores the price level when the trailing was first established.

## Interface ITrailingStopCommitRow

This describes a record representing a trailing stop order that's been queued for execution. 

It essentially holds the details of a specific trailing stop adjustment.

You'll find the type of action being performed, which in this case is specifically a "trailing-stop" adjustment. It also includes the percentage shift being applied to the stop price and the price at which the trailing stop was initially established. Think of it as a snapshot of the parameters used to manage a trailing stop order.


## Interface ISweepTrade

The `ISweepTrade` interface describes a single trading event within the backtest kit. Each trade record includes information like the originating idea's ID and the author who created it, ensuring traceability back to the source strategy. 

It specifies the trading symbol involved, the entry and exit timestamps, and the reason for closing the trade. 

You’ll also find details such as the actual holding time in minutes and the trade’s percentage profit and loss. Crucially, it lists any other "absorbed" ideas that were prevented from entering due to this trade already occupying the time slot. This allows for granular analysis of how different strategy components interact.

## Interface ISweepTrack

This data represents a single author's performance under a specific trading rule, providing a detailed view of their track record. Each entry captures how an author performed with a specific combination of rules: how long they held a position, the lock and stop percentages used, and the trailing take percentage applied.

The data includes the number of ideas the author generated, the number of those ideas that resulted in a win (where the lock or trailing arm triggered before the stop), and the resulting hit rate. Importantly, even ideas cut short by the end of a trading period are counted as misses.

Each record is self-contained, making it easy to search and analyze individual author-rule combinations without needing to filter through other data. The hit rate is provided directly for easy filtering – userspace tools can readily decide how much to trust each track, rather than having a hard-coded threshold built into the system. It’s designed to provide continuous data rather than a simple pass/fail assessment.

## Interface ISweepSchema

This schema defines how to register a sweep, essentially a configuration for testing a trading strategy. Think of it as a blueprint for running a backtest.

Each sweep needs a unique name to identify it.  It also needs to specify which data source (exchange) to use for historical price information.

The `gridAxes` property lets you customize the parameters for each axis of your grid, like profit targets or stop-loss levels. You can pick and choose which axes to adjust; any left untouched will use default values.  Pinning a value with a single-element array freezes that parameter.

You can also attach callbacks to different stages of the sweep, such as when the strategy is initially trained.  These callbacks are optional; if you don't provide one, it won't be executed.

Finally, the `reportOrder` controls the order in which the results are ranked, defaulting to "sharpe" ratio. This sorting order applies to the overall reports, not the individual trades.


## Interface ISweepResult

The `ISweepResult` object represents the outcome of a simulation run, giving you a complete picture of what happened. It includes information about the trading symbol, the total number of ideas considered, and how many ideas led to actual trades.

You'll find data on how many profiles were created from candle data, and how many were cut short due to the simulation's end. The result also details the typical and extreme holding times for trades across the grid, which helps understand trade duration patterns.

Most importantly, it contains the `reports` object. This is where the core performance evaluation lives, showing the grading of each grid point based on a single metric – profit before the stop.  Within the reports, you'll find the performance for each grid point, a ranking of the best-performing points, and how different authors contributed to the simulation.

## Interface ISweepPointReport

This report summarizes the performance of a single grid point within a trading strategy. It provides a comprehensive view of the trades executed at that point, including profitability metrics like total and average profit percentages, win rate, and profit factor. You'll also find risk-related measures like maximum drawdown and ratios like Calmar and recovery factor, which assess performance relative to risk.

The report also breaks down trade characteristics, such as average and percentile holding times, and the reasons trades were exited. A detailed list of all trades executed at that specific grid point is included, allowing you to trace back the origin of any reported performance metric. It's important to note that this trades list remains consistent across all points, facilitating easy data analysis without needing to re-run the backtest. Lastly, a Sharpe and Sortino ratio are included, reflecting performance adjusted for time and risk.

## Interface ISweepParams

The `ISweepParams` object holds all the necessary settings to run a sweep, essentially acting as a container for your configuration. It includes a logger to help you track what's happening during the process and pinpoint any issues. You'll also find the grid axes that define the parameter ranges to explore, now with defaults already applied. Finally, it specifies how the results should be ranked and reported, also with a default setting already in place.

## Interface ISweepMetricReport

This report represents a single result bucket from a backtest sweep, providing a snapshot of performance data. It consolidates information about how each parameter combination (grid point) performed based on a single metric – profit before stop.

The report contains a list of grid point reports, ordered from best to worst according to a specific ranking system like Sharpe ratio. It also highlights the best-performing grid points across four different ranking criteria.

Finally, the report includes “tracks” which are records of the rule parameters (like hold time, lock, stop loss, trailing) used by different authors during the backtest. These tracks are a raw representation, offering insights into performance factors without making definitive judgements; the user then decides which rules to trust. The intention is to keep the report efficient by not repeating this information for every grid point.

## Interface ISweepIdeaProfile

This `ISweepIdeaProfile` represents how a trading idea performed over a specific time period. It’s essentially a detailed record of the price action associated with a particular idea, allowing for evaluation without repeatedly fetching data.

The profile contains information about the entry point, the price candles forming the trajectory, and key performance metrics. These metrics, such as whether the idea was correct (did the price move in the predicted direction?), the largest positive and negative price swings, and how long it took to reach those points, provide a comprehensive picture of the idea’s behavior.

Think of it as a final report card for an idea, filled with insightful data points about its performance, used to understand how well the idea would have performed in real-world trading. The shakeout metric identifies the worst price dip before a positive move, and the median move provides insight into the general price direction throughout the period. This data helps understand the overall profitability and risk associated with the idea.

## Interface ISweepIdea

This describes a single trading idea, representing a public forecast from someone. Think of it as a prediction about a specific trading pair, like BTCUSD. Each idea has a unique identifier, a timestamp indicating when it was published, and information about the author who made the prediction. The core thing to understand is that backtesting simulations happen based on these ideas, not on individual price points. The `direction` property tells you whether the author believes the price will go up or down.

## Interface ISweepGridPoint

This interface represents a single point within a grid of trading strategies. 

Each grid point defines parameters that control how a trade is managed. 

You’ll find settings like the hard stop percentage, which dictates when to exit a trade to limit losses. 

There's also a trailing take percentage, designed to dynamically adjust the take profit level based on the highest price reached.

The `holdMinutes` property sets a time limit for how long a position can be held, and `profitLockPercent` allows for locking in profits once a certain price target is met. If set to zero, the profit lock feature is inactive.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines the configurable parameters that shape how a trading strategy explores different scenarios. It essentially outlines the boundaries within which a trading rule is tested, allowing for a systematic exploration of possibilities.

Each property—`hardStopPercent`, `trailingTakePercent`, `holdMinutes`, and `profitLockPercent`—represents a different element of risk management and profit-taking. These values are used to define a grid of possible trade configurations.

`hardStopPercent` controls the maximum acceptable loss level, serving as a crucial safety net and affecting how the strategy grades its performance.  `trailingTakePercent` defines how much of a winning trade's gains can be relinquished before the trailing stop activates. `holdMinutes` limits the maximum time a position can be held, influencing how frequently trades occur. Finally, `profitLockPercent` sets a fixed profit level where the trade will lock in gains and only exit if the price retraces to that level.

Importantly, these parameters aren't ignored; they’re actively considered for every trade and are integral to the grading process, helping to evaluate the overall effectiveness of a strategy. Each value also has defined conditions under which it's not considered, explicitly documented to ensure clarity.

## Interface ISweepCallbacks

This interface provides a way to track the progress of a backtesting simulation. Think of it as receiving updates on what's happening behind the scenes, similar to the information you’d see in console output, but delivered as function calls.

You'll get notified as the simulation moves through different stages, like processing ideas or evaluating grid points.

Specific events trigger callbacks: you'll be informed about the number of ideas found, the profiles generated for each idea, and the training of authors for different risk management rules. 

Each time a grid point is processed, you’ll receive a report with details on the trades executed.

After the simulation completes, you’ll receive the final results, including rankings and the best-performing strategies. Essentially, it's a mechanism to stay informed about the backtest's journey.

## Interface ISweepBest

This interface represents the best result within a sweep, focusing solely on the ranking criterion that determined the win and a report providing details. Think of it as highlighting the champion of a particular test.

It holds the specific criterion used for ranking and a report object that contains crucial information about the sweep point.

The list of trades and the author track are deliberately excluded here, as they are already present within the report and the bucket's tracks, preventing redundancy. 

If no sweep points were generated, the report will be null.

## Interface ISweepAbsorbedIdea

This interface represents a trading idea that wasn't executed because a previous trade from the same author already occupied the available slot. Think of it as a signal that was essentially overridden. 

It contains the unique identifier of the idea and, importantly, the author who created it. Because trading slots are assigned on a per-author basis, knowing the author directly from this object allows for streamlined analysis without needing to combine data from different sources.

## Interface ISweep

The `ISweep` interface provides a way to execute complete trading simulations. It's the main entry point for running a sweep, which involves evaluating trading ideas through a series of steps.  You provide a symbol and a list of trading ideas, and the `run` method orchestrates the entire process.  This process includes filtering ideas based on specific criteria, assessing their performance using a grid, and then ranking them according to their results. The output is a `ISweepResult` containing the findings from this comprehensive evaluation.

## Interface IStrategyTickResultWaiting

This describes what happens when a trading signal you've set up is waiting for the right price conditions to be met. It's a special kind of result you'll see repeatedly as the system monitors for that opportunity.

Think of it like this: you’ve told the system to buy when the price reaches a certain level, and it's now watching for that. This result tells you that the signal is still waiting and provides details about the trade.

Here’s what you’ll find in this result:

*   The signal itself, so you know exactly what trade is waiting.
*   The current price being monitored.
*   Information about which strategy, exchange, timeframe, and trading pair are involved.
*   Progress indicators towards take profit and stop loss (though these will always be zero while waiting).
*   A theoretical profit and loss (pnl) calculation for the potential position.
*   Whether the system is in backtest mode or live trading.
*   A timestamp showing when the result was generated.

## Interface IStrategyTickResultScheduled

This interface represents a specific type of event within the backtest-kit framework, signaling that a trading signal has been generated but is currently awaiting a price trigger to activate. Essentially, the system has identified a potential trade opportunity and is patiently waiting for the price to move to a predefined entry point.

It bundles together several pieces of information to help you understand and track this waiting period. You’ll find details like the strategy and exchange involved, the trading symbol, the timeframe, and the initial price at which the signal was generated. Knowing whether this event is part of a backtest or a live trading session is also included, along with a timestamp of when this signal was created. This information is crucial for monitoring the performance and behavior of your trading strategies.


## Interface IStrategyTickResultOpened

This interface describes the result you receive when a new trading signal is created within your strategy. Think of it as a notification that a signal has been successfully generated and saved.

It includes information about the newly created signal itself, along with details about where and when it was created – the strategy name, exchange, timeframe, and the trading symbol involved.

You'll also find the current price at the moment the signal was opened and a flag indicating whether the action occurred during a backtest or in live trading. This data allows you to understand the context of the signal's creation and potentially use it for debugging or analysis. 

Here's a breakdown of the key pieces of information you get:

*   The `action` confirms this is an "opened" signal event.
*   `signal` provides all the details of the created signal.
*   `strategyName`, `exchangeName`, and `frameName` tell you exactly where this signal originated.
*   `symbol` specifies the trading pair involved.
*   `currentPrice` captures the price at the time of signal creation.
*   `backtest` distinguishes between backtest and live executions.
*   `createdAt` provides a precise timestamp for the event.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a "resting" state – it's not currently acting on any signals. It provides details about the conditions at that moment, like the strategy’s name, the exchange being used, and the timeframe being analyzed. You'll also find information like the trading pair involved, the current price, whether it’s a backtest or a live trade, and the exact time the idle state began. It’s essentially a record of when your strategy is waiting for the next opportunity to act.

The `action` property always indicates “idle” to clearly mark this specific state.

The `signal` property is always null because no active trading signal is present.

## Interface IStrategyTickResultClosed

This interface, `IStrategyTickResultClosed`, represents what happens when a trading signal is closed, providing a complete picture of the final outcome. It details the signal itself, including its original parameters, along with the price at which it closed. 

You’ll find information about *why* the signal closed - whether it was due to a time expiry, hitting a take-profit or stop-loss level, or a manual closure.

It also includes crucial financial data like the profit and loss (including fees and slippage), and tracking information such as the strategy, exchange, and time frame names. Finally, there’s data about whether the event occurred during a backtest or live trading, a unique close ID (if the closure was initiated by the user), and when the result was created. Essentially, this interface is the final report card for a closed trading signal.


## Interface IStrategyTickResultCancelled

This interface describes a special kind of trading event: a signal that was scheduled but ultimately didn't lead to a trade. It happens when a signal is canceled, like if it's stopped before it can trigger a buy or sell order, or if you manually cancel the signal.

The `action` property will always be "cancelled" to clearly identify this type of result.

Along with that, you'll get details about the signal itself (`signal`), the price at the moment of cancellation (`currentPrice`), and timestamps marking when the cancellation happened (`closeTimestamp`, `createdAt`).

You also get useful context information such as the name of the strategy, the exchange being used, the timeframe applied (e.g., 1-minute, 5-minute), the trading pair (e.g., BTCUSDT), and whether it’s a backtest or live trade.

If you used the `Backtest.cancel()` or `Live.cancel()` functions to manually cancel a signal, a unique `cancelId` will be provided. The `reason` property explains why the signal was cancelled.

## Interface IStrategyTickResultActive

This interface represents a specific outcome during a trading strategy's execution – when a signal is being actively monitored, awaiting either a take profit (TP), stop loss (SL), or time expiration. It holds key details about the situation, including the signal itself, the current price being tracked (VWAP), and the names of the strategy, exchange, and timeframe involved.

You'll also find information like the trading symbol, the percentage progress towards TP or SL, and the unrealized profit and loss (PNL) calculations.

Whether the trade is part of a backtest or a live trade is indicated, and timestamps are included to track when events occurred and how the backtest is progressing. The `_backtestLastTimestamp` is used internally to manage the backtesting process.


## Interface IStrategySchema

This interface, `IStrategySchema`, acts as a blueprint for defining how a trading strategy operates within the backtest-kit framework. Think of it as a way to describe a strategy’s logic and how it interacts with the system.

You use this schema to register your strategy with the backtest-kit, giving it a unique identifier. It allows you to add notes for documentation purposes.

The `getSignal` function is the core of your strategy; it's the logic that determines when to generate buy or sell signals based on the current market conditions. You can also configure signals to be delayed until a specific price level is reached.

The `interval` property helps control how often your strategy is evaluated, preventing it from overwhelming the system. Callback functions let you hook into important moments in the strategy’s lifecycle, such as when an order is opened or closed.

You can associate your strategy with a risk profile using `riskName` or multiple profiles with `riskList`.  The `actions` property lets you tag strategies with specific actions, and `info` allows you to include custom data for monitoring or other purposes.

## Interface IStrategyResult

The `IStrategyResult` represents a single outcome from a backtesting run. It bundles together the name of the strategy that was tested, a comprehensive set of statistics detailing its performance, and the value of a key metric used to compare strategies. You’ll also find the timestamps marking the start and end of the strategy's activity, showing when it first generated a signal and when it last did. If a strategy didn't produce any signals, these timestamps will be null. This structure is ideal for creating comparison tables and ranking strategies based on their backtest results.


## Interface IStrategyPnL

This interface describes the profit and loss (PNL) result for a trading strategy. It breaks down the performance, considering fees and slippage to give you a more realistic view of your returns. 

You’ll find the `pnlPercentage` representing the percentage gain or loss.

The `priceOpen` and `priceClose` properties show you the entry and exit prices, respectively, after accounting for those fees and slippage.

The `pnlCost` gives you the actual dollar amount you gained or lost, calculated from your percentage return and initial investment.

Finally, `pnlEntries` represents the total capital you put into the trades.


## Interface IStrategyCallbacks

This interface provides a way to respond to different events during a trading strategy's lifecycle. Think of them as notification hooks that let your code react to changes in a signal’s state.

You can define functions to be triggered on every market tick (`onTick`), when a new signal is opened (`onOpen`), when a signal is actively monitored (`onActive`), or when there are no active signals (`onIdle`).

Further, you'll receive notifications when a signal is closed (`onClose`), a scheduled signal is created (`onSchedule`), or cancelled (`onCancel`).

There are also callbacks for specific profit/loss scenarios: when a signal reaches a partial profit (`onPartialProfit`), a partial loss (`onPartialLoss`), or breaks even (`onBreakeven`).

For signals that are scheduled, you have options to react to periodic checks (`onSchedulePing` and `onActivePing`), allowing for dynamic adjustments or custom monitoring. Lastly, `onWrite` gets called when data about the signal is saved, but only in backtesting environments.

## Interface IStrategy

This interface, `IStrategy`, defines the core actions a trading strategy can perform. It's the blueprint for how a strategy interacts with the trading system.

The `tick` method is the heart of the strategy – it's called for each price update and handles signal generation, stop-loss checks, and more.

Several `get...` methods let the strategy access information about pending signals, potential breakeven points, and the status of open positions. These are crucial for monitoring and making informed decisions.

You can pause or resume the strategy using `setPaused`, which temporarily stops new positions from being created while still monitoring existing ones.

Methods like `getTotalPercentClosed`, `getTotalCostClosed`, and `getPositionPnlCost` provide detailed information about the position’s performance.  `getPositionEntries` gives you a historical view of how the position was built up with multiple entries, useful for understanding DCA (Dollar Cost Averaging).

`backtest` allows you to simulate how the strategy would have performed using historical price data.  The `stopStrategy` method provides a way to halt signal generation gracefully without immediately closing open positions.

There's also functionality to manage scheduled signals – activating them early with `activateScheduled` or canceling them with `cancelScheduled`. The `createSignal` function lets you inject custom signals.  `createTakeProfit` and `createStopLoss` methods bridge the gap between the strategy's logic and actual exchange order fills.

Finally, several methods, such as `breakeven`, `partialProfit`, `trailingStop` help to automate and refine position management.  The `dispose` method cleans up the strategy when it's no longer needed.

## Interface IStorageUtils

This interface defines the core methods that any storage adapter used by backtest-kit must provide. Think of it as the contract for how your storage system (like a database or file system) interacts with the backtesting framework. 

It includes methods to react to different signal lifecycle events – when a position is opened, closed, scheduled, or cancelled. 

There are also functions for retrieving specific signals by their unique ID and for listing all stored signals.

Finally, it provides ways to handle 'ping' events, which are used to keep track of when a signal is actively open or scheduled and to update its timestamp. These pings help keep the data accurate and reflect the signal’s current state within the backtest.


## Interface IStorageSignalRowScheduled

This interface describes a signal's information when it's scheduled for execution. 

It holds two key pieces of data: the signal's status, which is always "scheduled," and the current price at the time the signal was scheduled. This current price is important because it's pulled directly from the tick data at the moment the scheduling happens, effectively mirroring the `IStrategyTickResultScheduled.currentPrice`.


## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, indicating a trade has begun. It holds essential data about the signal’s initial conditions.

Specifically, it tells you the signal is in the "opened" state and provides the current price at the time the signal was triggered. This current price is the same as what you'd find in the `IStrategyTickResultOpened` data.

## Interface IStorageSignalRowClosed

This data structure represents a trading signal that has already been closed. It holds all the key information about the signal’s final performance and circumstances. 

You'll find the signal's 'status' clearly marked as "closed," and it includes detailed profit and loss (PNL) data reflecting its overall performance. 

It also provides the final price at which the position was closed, the reason for the closure, and the precise timestamp of when the closure occurred. This information aligns with data available from other parts of the backtest process.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. 

It simply defines that the `status` of the signal is "cancelled." This lets you track and identify signals that were initiated but later terminated or rejected.


## Interface IStorageSignalRowBase

This interface defines the basic structure for storing signal data, ensuring that all signal types share a common foundation. Each signal record includes timestamps for when it was created (`createdAt`) and last updated (`updatedAt`), taken directly from the results of strategy execution.  A `priority` field is also included, dictating the order in which these signals are processed – it's dynamically set to the current time, ensuring signals are handled in a timely and predictable manner whether they originate from a live environment or a backtest.

## Interface IStateParams

`IStateParams` defines how to set up initial states for your trading signals. Think of it as a way to organize your signals into logical groups, like "trade" or "metrics", using the `bucketName` property.  You also specify what the signal's starting value will be with the `initialValue` property if no previous data is available. This lets you structure and manage your signal states effectively.

## Interface IStateInstance

The `IStateInstance` interface establishes a standard way for different storage methods – like local files, persistent databases, or even dummy data – to manage and track information related to trading signals. It's primarily designed for strategies that use large language models (LLMs) to guide trades, allowing you to monitor key metrics throughout a trade's lifetime, such as the highest unrealized profit or the time the trade has been open.

Think of it as a way to keep a record of a trade's performance. 

Here’s how it works:

*   `waitForInit`: It’s used to prepare the state instance when it first starts.
*   `getState`:  This lets you read the current state of a trade, but with a safety feature – it won’t show you future data.
*   `setState`: This is used to update the state, and an earlier timestamp will overwrite any older state, a feature which is useful to ensure that backtests don't interfere with live trading.
*   `dispose`: When you’re done with the state instance, this method cleans up any resources it might be using.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a mathematical formula used to determine optimal bet sizes. 

It’s designed to maximize long-term growth by balancing potential gains and losses.

The `method` property is fixed and confirms that this is a Kelly Criterion sizing approach.

The `kellyMultiplier` property lets you control the aggressiveness of the sizing; a lower multiplier (like the default 0.25) represents a more conservative strategy, while a higher multiplier increases risk and potential reward.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.  You’ll also specify a `riskPercentage`, which dictates what portion of your capital you're willing to risk on each individual trade – for example, a value of 1 means risking 1% of your capital per trade.

## Interface ISizingSchemaBase

This interface defines a foundational structure for sizing configurations within the backtest-kit framework. Each sizing schema gets a unique name to easily identify it. 

You can also add a note to describe the sizing configuration for clarity.

It also specifies limits on position size: a maximum percentage of your account that can be used, as well as absolute minimum and maximum values for position size. 

Finally, callbacks let you define functions that run at specific points during the sizing process, allowing for customization and more complex sizing logic.

## Interface ISizingSchemaATR

This defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

Essentially, you'll specify that you're using an "atr-based" sizing method. 

You'll also need to set a `riskPercentage` – this is the portion of your account you’re willing to risk on each trade, expressed as a number between 0 and 100.

Finally, you'll define an `atrMultiplier`, which dictates how much space you'll give your stop-loss order based on the ATR value. A higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface, `ISizingParamsKelly`, defines how to calculate your trade sizes using the Kelly Criterion, a strategy focused on maximizing long-term growth.  It primarily contains a `logger` property, allowing you to track and debug the sizing decisions being made. The `logger` lets you see what's happening behind the scenes as your trades are sized, which can be invaluable for understanding and refining your strategy.  Essentially, it’s a way to monitor how your sizing is working.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to control how much of your capital is used for each trade when using a fixed percentage sizing strategy.  It's primarily used when setting up the sizing logic within the backtest-kit framework.  The `logger` property is essential for receiving debugging information related to the sizing calculations, helping you understand how the sizing parameters are affecting trade sizes. This allows you to track and troubleshoot sizing decisions during your backtesting process.

## Interface ISizingParamsATR

This interface defines the settings you use when determining how much of your capital to allocate to a trade, specifically when using an Average True Range (ATR) based sizing strategy.  It includes a `logger` property, which allows you to output debugging information to help understand and refine your trading logic. Think of the logger as a way to keep track of what's happening behind the scenes during the sizing calculations. You’ll provide an implementation of `ILogger` to this field.

## Interface ISizingCallbacks

This section defines functions that let you observe and potentially influence how trade sizes are determined. 

The `onCalculate` function is your opportunity to peek into the sizing process. You can use it to record the calculated trade size and the parameters used to arrive at that size, or to perform checks to ensure the size is reasonable. Think of it as a "look behind the curtain" for size calculations.


## Interface ISizingCalculateParamsKelly

When figuring out how much to bet using the Kelly Criterion, you'll use these parameters. 

The `method` is always set to "kelly-criterion" to specify that you're using this particular sizing approach.

You'll need to provide the `winRate`, which is a number between 0 and 1 representing the probability of a winning trade.

Also, specify the `winLossRatio`, which describes your average profit compared to your average loss on a winning trade. This helps determine an appropriate bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizes using a fixed percentage of your available capital. It's really straightforward: you specify the sizing method as "fixed-percentage" and then provide the price level where you want to place a stop-loss order. The stop-loss price is crucial for risk management and helps control potential losses.

## Interface ISizingCalculateParamsBase

This interface defines the essential information needed for calculating trade sizes. It contains the trading symbol, like "BTCUSDT," so the system knows which asset is involved. You'll also find the current account balance, which is crucial for determining how much capital you have available to trade. Finally, the planned entry price is included, as it influences the size calculation based on the intended cost per unit.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining how much to trade based on the Average True Range (ATR). It requires you to specify that you're using the "atr-based" sizing method and to provide a numerical value for the ATR itself.  The ATR value essentially represents the volatility of the asset, and this framework uses it to calculate appropriate trade sizes. Think of it as telling the system how much risk you're comfortable taking given the current market volatility.

## Interface ISizing

The `ISizing` interface is all about determining how much of an asset to trade – essentially, calculating your position size. It's a core part of how the backtest kit executes trading strategies.

The `calculate` property is the key function here. It takes in parameters detailing risk factors and other relevant information and then returns a promise that resolves to the calculated position size. This function is where the logic for determining your trade size lives.


## Interface ISignalRow

This describes a `SignalRow` object, which represents a single trading signal within the backtesting framework. Each signal is given a unique identifier and contains detailed information about the trade, including its cost, entry price, and expected duration. It also stores details like the exchange and strategy used, along with timestamps to track when the signal was created, pending, and scheduled.

The `SignalRow` also keeps track of more complex data points. You’ll find records of partial closes (profit or loss), a history of DCA entries, and trailing stop-loss and take-profit prices – these are dynamically adjusted based on strategy settings.  The `_peak` and `_fall` properties track the highest and lowest prices seen during the trade's lifecycle, helping to understand performance. Finally, there’s a timestamp indicating when the signal was initially created, useful for context and auditing. The internal properties are used for calculations and performance tracking during the backtest and live execution.

## Interface ISignalIntervalDto

The `ISignalIntervalDto` helps you fetch signals in batches, rather than one at a time. Think of it as a way to group multiple signal requests together. It includes an `id` which is a unique identifier for each signal – a randomly generated string that ensures each signal is distinct. This is useful when you want to wait for a certain period before getting the next signal.

## Interface ISignalDto

This interface defines the structure for signal data used within the backtest-kit framework. When you request a signal, you'll receive an object that conforms to this shape. The system automatically assigns a unique ID if you don’t provide one yourself.

Each signal includes key details like the ticker symbol, whether you should go long (buy) or short (sell), and a descriptive note explaining the reasoning behind the signal.  You’ll also specify the entry price, take profit level, and stop-loss price to manage risk and reward.

You can also set an estimated duration (in minutes) for how long the position should remain open; if you want the position to remain open indefinitely until a stop-loss or take-profit is triggered, set this to infinity. There's also a default cost associated with entering the position.

## Interface ISignalCloseRow

This interface defines the structure of a signal row, specifically when a trade is closed. It builds upon the standard signal row data, but adds extra information relating to user actions that triggered the closure. If a user manually closes a position, a `closeId` will be present, allowing you to track specific closure events.  Alongside the `closeId`, a `closeNote` provides a place to store any notes the user might have included when initiating the closure. These additional properties help you understand and analyze user-driven trade closures.

## Interface ISessionInstance

The `ISessionInstance` interface helps manage temporary data specific to a combination of symbol, trading strategy, exchange, and timeframe. Think of it as a place to store information that needs to be shared during a single backtesting run, like results from complex calculations or intermediate values needed by your strategy. 

It’s designed to be flexible – you can store practically any kind of data here. This allows you to, for example, cache the output of an AI model or keep track of how indicator values change over time.

The `waitForInit` method lets you set things up at the start of the session.  `setData` is used to write new data to the session, along with a timestamp.  `getData` retrieves that data based on a timestamp, ensuring you don’t accidentally peek into the future. Finally, `dispose` cleans up any resources that the session might be using.


## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a trading signal that's designed to be executed at a specific price in the future. Think of it as a signal put on hold, waiting for a price condition to be met.

It builds upon the basic `ISignalRow` and is used for delayed entries.

Essentially, the system waits for the market price to reach the `priceOpen` value before triggering the trade.

Once that price is hit, it transforms into a standard pending signal.

A key element is the `priceOpen` property, which directly defines the target price that triggers the trade.  The initial pending time is recorded as `scheduledAt` and adjusted later to the actual waiting time.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might be canceled by a user. Think of it as a standard signal, but with extra details if someone decides to cancel it. It includes a unique identifier for the cancellation itself (the `cancelId`) and a short note explaining why the cancellation happened. These properties are only present when a user explicitly requests the signal to be canceled, distinguishing it from automated cancellations.

## Interface IScheduledSignalActivateRow

This interface describes a row of data related to scheduled trading signals, but with a key difference: it includes information specifically for when those signals are activated manually by a user. It builds upon a base signal row, adding fields to track the ID and any notes associated with that manual activation. Think of it as tracking *who* and *why* a signal was triggered outside of the regular automated schedule – useful for understanding and auditing user interventions. The `activateId` is a unique identifier for the activation event, while `activateNote` allows for a brief explanation of why it was triggered.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, essentially describes the time window your backtest will cover. It specifies the start and end dates for the backtesting period. Think of it as setting the "from" and "to" dates for your historical data analysis. The `from` property holds the beginning date, and the `to` property holds the ending date of the backtest.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides crucial details about the current state of a trading simulation or live execution. It tells you exactly what symbol is being traded, defines the timeframe of the backtest if it's a historical simulation, and allows strategies to pass along their own custom data through the `info` property. You'll also find important contextual information like the exchange and strategy names, alongside details about the current time and price. Finally, it clearly indicates whether the strategy is operating in a backtest environment.

## Interface IRunContext

This interface, `IRunContext`, is like a complete package of information needed when running code within the backtest-kit framework. It brings together two key pieces: details about your trading strategy like the exchange and frame being used, and real-time data like the symbol and timestamp. Think of it as a way to pass everything a piece of code needs to know about the current trading environment in one convenient object, letting the system handle distributing the data where it needs to go. It’s the key ingredient for ensuring your functions have all the necessary context to operate correctly.

## Interface IRiskValidationPayload

This object holds the information needed to assess risk during the trading process. It includes the signal that’s currently being evaluated – essentially, the trading instruction that needs approval. You’ll also find details about how many positions are already open and a list of those active positions, giving you a complete picture of the portfolio's current state for risk assessment. This allows validation functions to make informed decisions based on what's already happening in the portfolio.

## Interface IRiskValidationFn

This defines a function that checks if a trading decision is safe to proceed with. It's used to validate things like available margin or other risk factors. If everything looks good, the function does nothing or returns null. But, if there's a problem – maybe not enough money in the account or a risk limit has been hit – it will either return a special object explaining the rejection, or it can throw an error which is then automatically converted into that rejection object.

## Interface IRiskValidation

This section describes how to set up checks to ensure your risk assessments are sound. You define these checks using a `validate` function, which is the core logic that determines if a risk is acceptable.  Alongside this function, you can add a `note` to explain what the validation is intended to do, making your code easier to understand and maintain. Think of it as giving your validation rule a descriptive label.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, builds on existing signal data to provide crucial details needed for managing risk. It includes the entry price of a trade, allowing for validation and calculations related to potential losses. It also stores the original stop-loss and take-profit levels that were initially set when the signal was created. These original price points are essential for accurately assessing and controlling risk throughout the trading process.

## Interface IRiskSchema

The IRiskSchema lets you define how your portfolio manages risk. Think of it as a blueprint for setting up custom checks and controls at the portfolio level. Each schema has a unique identifier, a place for notes to help developers understand it, and optional callbacks that can be triggered at specific moments. 

The core of the schema is the validations array, which contains the actual rules and logic that determine whether a trade is allowed or rejected. You can provide validations as functions or as pre-built objects, giving you flexibility in how you implement your risk management.

## Interface IRiskRejectionResult

When a risk validation check fails, this result object is provided to explain why. It includes a unique ID to track the specific rejection and a clear, human-readable note detailing the reason for the failure, making it easier to understand and debug issues. This helps pinpoint exactly what triggered the validation failure.

## Interface IRiskParams

The `IRiskParams` interface defines the essential information needed to manage risk during trading, whether you're simulating past performance (backtesting) or actively trading. It includes the name of the exchange you're using, a way to log helpful messages for debugging, a time service to ensure accuracy and prevent future data influencing past decisions, and a flag to differentiate between backtesting and live trading. 

You can also provide a callback function that’s triggered when a trading signal is blocked due to risk limits—this gives you a chance to respond to the situation before the system continues. This is separate from other callbacks related to the risk schema.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks are handled when multiple operations happen at the same time. Specifically, the `reserve` property is useful to prevent issues that can arise when multiple trading signals try to use the same position concurrently. When you set `reserve` to `true`, it creates a temporary marker in the system’s record of active positions, ensuring that other checks see the updated position size before any new signals are added. This helps maintain accurate risk calculations even under heavy trading load.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides all the information needed to determine if a new trade should be allowed. Think of it as a safety check before a trading signal is actually executed. It bundles together key details like the trading pair (symbol), the signal being considered, the strategy making the request, and information about the exchange and risk profile being used.  You'll find important data points like the current price and timestamp included too, allowing for precise risk evaluation. This allows you to validate conditions *before* a signal is sent, ensuring your trading operations stay within defined risk parameters.

## Interface IRiskCallbacks

This interface provides a way to be notified when your trading signals run into risk limits or are approved. Specifically, `onRejected` gets triggered when a signal is blocked due to those limits, letting you know something was flagged for potential risk. Conversely, `onAllowed` is called when a signal successfully passes all risk checks and is cleared to proceed – it's your confirmation that the trade is okay to go. You can use these callbacks to log events, adjust your strategies, or take other actions based on the outcome of the risk assessment.


## Interface IRiskActivePosition

This interface describes a single trading position that's being actively managed, and it’s used to keep track of positions across different strategies for a broader risk assessment. Each position has a name associated with the strategy that created it, along with the exchange and frame it's operating on. You’ll also find details like the symbol being traded (e.g., BTCUSDT), whether it’s a long or short position, and crucial information about the trade entry point, stop-loss levels, and take-profit targets.

It also stores how long the position is estimated to last and the exact time the position was initiated. This comprehensive information allows you to analyze positions holistically, understanding the risk exposure from multiple strategies at once.

## Interface IRisk

The `IRisk` interface is responsible for managing and enforcing risk limits within the backtesting framework. It allows you to determine if a trading signal is permissible based on predefined risk thresholds. There's a special, safer version of that check, `checkSignalAndReserve`, which not only validates the signal but also immediately sets aside space for the position, preventing conflicts when multiple strategies are running simultaneously.

When a signal is approved, you'll need to use `addSignal` to officially register the new position, or `removeSignal` if the signal is cancelled.  It's crucial to always follow a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to avoid creating incorrect reservations within the risk management system. This helps ensure accurate tracking of open positions and prevents risk limits from being exceeded.

## Interface IReportTarget

This interface lets you finely control what kinds of events are recorded during your trading simulations. Think of it as a checklist to enable or disable specific report services, like tracking strategy actions, risk rejections, or breakeven points. Each property, such as `strategy` or `risk`, corresponds to a particular reporting area. Setting a property to `true` means that those events will be logged, helping you analyze and understand your trading performance in detail. You can pick and choose which areas you want to monitor.

## Interface IReportDumpOptions

This interface lets you fine-tune how your backtest results are recorded and organized. Think of it as a way to label your data so you can easily find and filter specific backtests later. Each property represents a key piece of information about a particular trading run, like the symbol being traded (e.g., BTCUSDT), the name of the trading strategy used, the exchange where the trades took place, and the timeframe (like 1 minute or 1 hour). You can also use it to identify the unique signal that triggered trades and the name of the optimization run.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It provides a way to process real-time updates (active pings) and store the most recent signal information. You can easily fetch the latest signal for a specific trading pair, strategy, and timeframe, ensuring that you're not using information that hasn't yet been available in live trading conditions – preventing look-ahead bias. Finally, it allows you to determine how long ago the most recent signal was generated.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, helps you understand the original parameters of a trading signal, even if those parameters have been adjusted later. It's designed to be shared publicly and gives users visibility into how a trade was initially set up.

It includes the original stop-loss and take-profit prices, which stay the same even if the strategy uses trailing stop-loss or trailing take-profit techniques. This lets you see both the starting point and the current, potentially adjusted, values.

Beyond the core signal information, it also provides data on things like the total cost of entering the position, how much of the position has been partially closed, the total number of entries and partials made, and the unrealized profit/loss (PNL) at the time the signal was generated.  You'll find metrics like peak profit and maximum drawdown to gauge the overall performance of the trade as well, using the original entry price as the baseline. Essentially, it’s a comprehensive snapshot of a trading signal, designed for clarity and user understanding.

## Interface IPublicCandleData

This interface defines the structure of a single candle data point used within the backtest-kit framework. Each candle represents a specific time interval and holds key information about the price activity within that period. 

You'll find the exact time the candle started, recorded as a Unix timestamp in milliseconds. It also details the opening price, the highest price reached, the lowest price seen, and the closing price. Finally, the candle includes the total trading volume for that time interval. This structured format allows for consistent and reliable data when analyzing historical market data.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It helps you control how much of your capital to risk based on your trading strategy's expected performance.

You'll specify the `winRate`, representing the percentage of winning trades, and the `winLossRatio`, which describes how much you win on average for every dollar you lose. These values directly influence the calculated position size.


## Interface IPositionSizeFixedPercentageParams

This defines how much of your capital will be used for each trade when using a fixed percentage sizing strategy.

It includes parameters to specify the stop-loss price, which is the price at which you’ll exit a trade to limit potential losses.


## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed for calculating position sizes using an Average True Range (ATR) approach. It's a simple structure primarily containing the current ATR value. This value directly influences how much of your capital is allocated to a trade. Essentially, it tells the system how volatile the market is, which in turn helps determine a reasonable position size.

## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA). It lets you set a "buffer zone" around each DCA level to account for price fluctuations. 

You specify an upper and lower percentage tolerance.

The `upperPercent` determines how much higher than a DCA price it can be before it's considered an overlap. The `lowerPercent` determines how much lower than a DCA price it can be before it’s considered an overlap. Both percentages are represented as values from 0 to 100.

## Interface IPersistStrategyInstance

This interface helps you manage how a specific trading strategy's data is saved and loaded. Think of it as a way to customize how backtest-kit remembers the details of a strategy's progress for a particular symbol, strategy name, and exchange. 

If you want to store strategy data differently – perhaps in a database instead of a file – you can build an adapter that implements this interface.

The `waitForInit` method is called to set up the storage for a strategy's data. The `readStrategyData` method retrieves any previously saved data. Finally, the `writeStrategyData` method saves the current state of the strategy, allowing it to be resumed later. You can even clear the saved state by passing `null` to this method.

## Interface IPersistStorageInstance

This interface helps you manage how trading signals are saved and loaded, specifically for either backtesting or live trading – there's a separate system for each. It lets you customize how these signals are stored, going beyond the default file-based approach.

Think of it as a way to persist your signal data.

The `waitForInit` method sets things up when the system starts, indicating whether it's a fresh start.

The `readStorageData` method retrieves all saved signals, essentially rebuilding the signal history.

Finally, `writeStorageData` is how you save signals, ensuring each is tied to its unique ID.

## Interface IPersistStateInstance

This interface defines how to manage persistent state for a specific trading strategy, ensuring that data isn't lost even if the system crashes. Think of it as a way to save and load the strategy's memory. 

It's used by the framework to keep track of things like indicator values or open orders. 

If you're building a custom solution for how your strategy stores its data, you'll implement this interface. 

The `waitForInit` method sets up the storage. `readStateData` loads any saved data. `writeStateData` saves the current state. Finally, `dispose` cleans up any resources used by the storage.

## Interface IPersistSignalInstance

This interface helps manage how signal data is saved and loaded for a specific trading setup. Think of it as a way to customize where and how your signals are stored, rather than relying on the default system. It's linked to a particular combination of symbol, strategy, and exchange.

If you want to use a different storage method – perhaps a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method sets up the storage area when needed. `readSignalData` retrieves previously saved signal information, and `writeSignalData` allows you to save new or updated signal data; setting the data to null will clear out any existing data.


## Interface IPersistSessionInstance

This interface helps manage how your trading strategies remember information across sessions, especially if something unexpected happens and your program crashes. It's designed to keep data safe and consistent for each unique combination of strategy, exchange, and frame within your backtesting environment. 

If you want your strategies to store and retrieve their own custom data – like model parameters or settings – that survives interruptions, you can build your own adapters that implement this interface.

Here’s what the methods do:

*   `waitForInit`: Sets up the storage area for your specific strategy’s data.
*   `readSessionData`: Retrieves any previously saved data for your strategy.
*   `writeSessionData`: Saves the current state of your strategy to be loaded later. It also includes a timestamp indicating when the data was saved.
*   `dispose`: Cleans up any resources that your custom storage adapter might be using. This isn't essential and can be skipped if not needed.

## Interface IPersistScheduleInstance

This interface defines how your custom code can manage and store signals generated by your trading strategies. Think of it as a way to save the decisions your strategies make at specific times, so you can resume later or analyze past performance. Each instance of this interface is tied to a specific combination of a symbol (like a stock ticker), a strategy name, and an exchange.

If you want to control how these signals are stored – perhaps using a database instead of a file – you’ll create a class that implements this interface.

The `waitForInit` method handles the initial setup of the storage.  `readScheduleData` retrieves a previously saved signal. Finally, `writeScheduleData` allows you to record a new signal or clear an existing one, essentially saving your strategy's actions.

## Interface IPersistRiskInstance

This interface defines how your custom code interacts with the backtest-kit framework to save and load trading positions for a specific risk profile and exchange. Think of it as a way to control where and how the framework keeps track of your active trades. 

The `waitForInit` method allows you to prepare the storage area for the risk context, it is called at the beginning to ensure everything is set up correctly.  The `readPositionData` method is responsible for retrieving previously saved trading positions for a given point in time, allowing you to resume where you left off. Finally, the `writePositionData` method handles saving the current state of your active positions, so that they can be loaded later. You can use this interface to adapt the default file-based persistence to a database or another storage system.

## Interface IPersistRecentInstance

This interface helps keep track of the most recent trading signal for a specific setup – think of it as remembering your last action. Each setup has its own record, tied to things like the asset you're trading, the strategy you're using, the exchange, and the timeframe.

It's designed so you can easily switch between live trading and backtesting without messing up your records. If you want to handle this "remembering" in a custom way (like storing things in a database instead of a file), you can build your own adapter that follows this interface.

The `waitForInit` method sets things up when needed. `readRecentData` retrieves that stored recent signal. Finally, `writeRecentData` saves the most recent signal to the storage so you can recall it later.

## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss information is saved and loaded. Think of it as a way to keep track of the progress of each individual trading signal, broken down by symbol, strategy, and exchange.

Each signal has its own place to store this information, like a labeled container. 

If you want to change how this data is stored – maybe you don't want to use files, or you want to save to a database – you can create your own adapter that follows this interface.

The `waitForInit` method prepares the storage area when needed. `readPartialData` retrieves the data for a specific signal at a given time. And `writePartialData` saves the progress of a signal.

## Interface IPersistNotificationInstance

This interface lets you customize how notification data is stored, either for backtesting or live trading. Think of it as a way to plug in your own storage solution instead of using the default file-based method. 

When you implement this interface, you’ll have methods to initialize the storage, retrieve all the previously saved notifications, and write new notifications to be persisted. Each notification is uniquely identified, allowing for easy retrieval and management. This provides flexibility to use databases, in-memory stores, or any other method you prefer.

## Interface IPersistMemoryInstance

This interface defines how to persistently store and retrieve memory entries, specifically for use with LLM memory. Think of it as a way to save and load pieces of information related to a particular conversation or context. 

It allows you to initialize storage, read individual memory entries identified by a unique ID, check if an entry exists, and write new entries with a timestamp. You can also "soft-delete" entries – effectively hiding them from normal access while keeping them on disk for potential recovery. 

If you need to customize how memory is saved (beyond the default file-based approach), you can create a custom adapter that implements this interface. Finally, there’s a method to list all the existing memory entries and a `dispose` method to clean up any resources used.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for each trading bucket. It’s designed to let you customize how backtest-kit manages cached API responses.

The system allows for a way to “soft delete” cached entries – meaning they are still physically present on disk but are excluded from normal retrieval operations using a `removed` flag.

Here’s what you’ll need to implement if you want to create your own custom caching system:

*   waitForInit: Initializes the storage for the current bucket.
*   readMeasureData: Retrieves cached data associated with a specific key.
*   writeMeasureData: Saves data to the cache, including the key and timestamp.
*   removeMeasureData: Marks an entry as deleted (soft delete) without actually removing the file.
*   listMeasureData: Provides a way to loop through all the available, non-deleted keys for the bucket.

## Interface IPersistLogInstance

This interface defines how your application can manage and store log data globally. Think of it as a central place to keep track of all your logs, rather than having them tied to specific parts of your application. 

If you want to change where your logs are saved – perhaps to a database instead of a file – you can create your own adapter that implements this interface.

The `waitForInit` method lets you signal when the log storage is ready, which is useful if you need to wait for it to be set up before continuing.

`readLogData` retrieves all the stored log entries, allowing you to access the entire history of logs. 

Finally, `writeLogData` adds new log entries to the storage, making sure to avoid duplicates by checking if an entry with the same ID already exists – this keeps the log history clean and append-only.

## Interface IPersistIntervalInstance

This interface lets you customize how backtest-kit keeps track of when it’s already run a calculation for a specific time period and data key. Think of it as a way to manage "flags" that indicate a task has been completed.

It’s used by the framework to ensure certain actions happen only once per time period, preventing redundant work. 

If you need to store this information somewhere other than the default file system (like in a database), you can create a class that implements this interface.

The `waitForInit` method prepares the storage for a new time period.  `readIntervalData` retrieves existing information for a given key.  `writeIntervalData` creates or updates an interval marker.  `removeIntervalData` essentially resets a marker, allowing it to be processed again. Finally, `listIntervalData` provides a way to see which keys have been handled.

## Interface IPersistCandleInstance

This interface defines how backtest-kit stores and retrieves candle data for a specific trading symbol, time interval, and exchange. It's like a specialized container for keeping track of historical price movements.

The `waitForInit` method is used to prepare the storage space when you start using it.

The `readCandlesData` method is crucial – it’s how you fetch a range of candles from the storage. Importantly, if even a single candle is missing within the requested timeframe, it returns null, signaling that the data needs to be fetched again from the original source.

Finally, the `writeCandlesData` method allows you to save new or updated candles into this specialized storage. It’s designed to be smart and avoid writing incomplete data or overwriting existing, fully completed candles. You can think of it as a way to customize where and how backtest-kit keeps track of your historical market data.

## Interface IPersistBreakevenInstance

This interface helps manage how your trading strategy keeps track of breakeven points—those crucial levels where a trade stops being a loss and starts being a profit. 

Think of it as a way to save and load this information. The data is organized and stored separately for each signal, symbol, strategy, and exchange combination, creating a very specific context.

If you want to customize where or how this breakeven information is saved (maybe not a file, but a database), you can build your own adapter that follows this interface. 

The `waitForInit` method sets up the initial storage conditions.
`readBreakevenData` fetches existing breakeven data for a particular signal at a specific time.
Finally, `writeBreakevenData` saves the updated breakeven information for a signal.


## Interface IPersistBase

This interface provides the basic building blocks for how your custom data storage systems interact with the backtest-kit framework. Think of it as a contract outlining the essential functions for reading, writing, and managing data persistence. 

It defines five core methods: `waitForInit` handles initial setup and checks, `readValue` retrieves a specific data item, `hasValue` confirms whether a data item exists, `writeValue` saves a data item, and `keys` lists all available data items. 

The `keys` method is particularly useful for going through all your data and validating its consistency. The framework uses these methods to ensure reliable and coordinated data operations.


## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit on a trade. Think of it as a row in a queue detailing how much of a position should be closed and at what price. 

The `action` property always tells you that this is a partial profit instruction. 

`percentToClose` specifies the portion of the trade to close, expressed as a percentage. `currentPrice` records the price at which the partial profit was actually executed.

## Interface IPartialLossCommitRow

This represents a request to partially close a position. It’s essentially a message queued up, telling the system to sell a portion of your holdings. 

The `action` property confirms that this is a partial loss operation.  The `percentToClose` specifies what percentage of the position should be closed, and the `currentPrice` records the price at which the partial closing occurred. This information is vital for tracking and reconciliation purposes.

## Interface IPartialData

IPartialData holds a snapshot of key trading data points, specifically profit and loss levels, allowing it to be saved and restored. Think of it as a simplified version of the complete trading state, designed to be easily stored, for example, in a database. It converts sets of levels into arrays so they can be preserved in a standard format like JSON. These partial data points are organized by a signal ID and used to rebuild the full trading state when needed. 

The `profitLevels` property contains the profit levels that have been hit for a given trade, serialized into an array.
The `lossLevels` property similarly stores the loss levels reached, also as an array.

## Interface IPartial

The `IPartial` interface is responsible for monitoring and reporting milestones in profit and loss for trading signals. It's used internally by the system to keep track of how well signals are performing.

When a signal is making money, the `profit` method calculates and reports when it hits key percentages like 10%, 20%, or 30% profit. Conversely, when a signal is losing money, the `loss` method does the same for loss percentages. To avoid unnecessary alerts, it only reports new milestones.

When a trading signal finishes – whether it hits a take profit or stop loss, or simply expires – the `clear` method cleans up the records of its progress and prepares the system for the next signal. This ensures data remains accurate and efficient.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. It combines the original input parameters with flags that determine the trading environment. 

Essentially, it tells you whether you're running a backtest (simulating past performance), paper trading (practicing with real-time but simulated funds), or live trading (actual trading with real money). 

The object contains three key properties: `backtest`, `paper`, and `live`, each being a boolean value that indicates whether that trading mode is enabled.

## Interface IParseArgsParams

This interface outlines the expected settings when setting up a backtest. It's essentially a blueprint for the basic information needed to run a strategy.

You’ll need to specify which trading pair you’re analyzing, like "BTCUSDT" for Bitcoin against USDT.  The `strategyName` tells the system which trading strategy to actually execute.  Also important are the exchange you’re connecting to, such as "binance" or "bybit," and the timeframe you’re using for the data, for example, "1h" for one-hour candles. Think of it as defining the environment and the player for your backtest.


## Interface IOrderBookData

The `IOrderBookData` interface defines the structure of order book information. It represents a snapshot of the bids and asks available for a specific trading pair.

Each order book contains a `symbol` indicating which trading pair the data applies to.

The data also includes arrays of `bids` (buy orders) and `asks` (sell orders), detailing the prices and quantities at which orders are placed. This structure helps in understanding the current market sentiment and potential trading opportunities.

## Interface INotificationUtils

This interface defines the core methods that any notification system, like an email service or a webhook, needs to work with the backtest-kit trading framework. It provides a standardized way to deliver important updates and information about the trading strategy’s performance and status.

The framework sends different types of notifications, including signals (like when a trade is opened or closed), profit/loss updates (partial profits, breakeven points), and information about strategy settings. There are also notifications for order confirmations, rejections, and status updates from the broker.

Additionally, it includes methods for error handling, pausing, and retrieving and clearing the history of all delivered notifications. This allows you to create flexible and reliable notification systems for your trading strategies.


## Interface INotificationTarget

This interface lets you fine-tune which notifications your trading strategy receives, improving efficiency and reducing noise. Think of it as a filter for updates – you only get what you need. By default, you'd get *all* notifications, but this interface lets you pick and choose.

Here's a breakdown of the notification types you can subscribe to:

*   **Signal Events:**  Get updates about the lifecycle of your trading signals, including when they're opened, scheduled, closed, or cancelled.
*   **Profit/Loss Levels:**  Receive notifications when the price reaches pre-defined partial profit, partial loss, or breakeven levels.
*   **Strategy Actions:** Track confirmations for actions like profit taking, loss limiting, and order cancellations.
*   **Order Status:** Monitor the status of your orders in live trading: new orders, cancellations, rejections, and confirmations that an order has filled. This includes checks to make sure orders are still active on the exchange.
*   **Risk Management:** Be alerted if your strategy is blocked by the risk management system.
*   **Informational Messages:** Receive custom notes or messages attached to active signals.
*   **Strategy State:**  Get notified if the strategy is paused or resumed.
*   **Error Handling:**  Stay informed about both recoverable errors and critical errors that may cause the process to terminate.
*   **Validation:** Be alerted if your configuration or data doesn’t pass the required checks.



By selectively enabling the properties you need in this interface, you can create a more focused and manageable environment for your trading strategies.

## Interface IMethodContext

The `IMethodContext` object acts like a little package of information that helps the backtest-kit framework know which specific configurations to use during a backtest or simulation. Think of it as a set of instructions – it tells the system which exchange, strategy, and frame to work with. 

It carries the names of these elements, ensuring the correct instances are loaded and used.  The `exchangeName` specifies which exchange configuration to use, `strategyName` points to the strategy configuration, and `frameName` identifies the frame (or is empty if you're doing a live test). This object is passed around automatically, so you don’t usually need to directly manage it.


## Interface IMemoryInstance

This interface outlines how different types of memory storage systems—like local files, persistent databases, or even temporary in-memory storage—should behave within the backtest-kit framework.  It establishes a common set of operations you can perform on that memory, such as initializing it, writing data, searching, listing, and deleting entries.  You can think of it as a contract ensuring that regardless of where your data is stored, you interact with it in a predictable way.

The `waitForInit` method gets things started.  `writeMemory` lets you save data, specifying a unique identifier, the data itself, a description, and a timestamp.  Searching for data is done with `searchMemory`, allowing you to find relevant information based on keywords and a cutoff date.  `listMemory` allows you to retrieve all data entries up to a specific date.  `removeMemory` deletes individual entries, while `readMemory` fetches a single entry, but only if it exists before a specified date. Finally, `dispose` helps clean up any resources used by the memory storage.

## Interface IMarkdownTarget

This interface lets you control which detailed reports are generated during your backtesting process. Think of it as a way to selectively turn on different types of analysis.

You can choose to enable reports that track your strategy's actions like entry and exit signals, or focus on reports related to risk management and how limits impacted your trades. There are also options for detailed analyses, such as visualizing portfolio performance with a heatmap or optimizing strategy comparisons.

Furthermore, you can generate reports for live trading events or get a full history of backtest results. Each property (strategy, risk, breakeven, etc.) corresponds to a specific kind of report, allowing you to tailor your reporting to focus on the areas that matter most to your analysis.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown documentation, helping to organize and filter the information displayed. It specifies where files should be located relative to your project, the specific file name, and details about the trading context like the symbol being traded (e.g., BTCUSDT), the name of the trading strategy, the exchange being used, and the timeframe being analyzed. You can use these options to target documentation for particular strategies or trading setups. Think of it as a way to precisely control which parts of your backtesting framework get documented.

## Interface IMCPTextMessage

This represents a simple text message used within the Model Context Protocol (MCP) system. Each message has a unique ID to help keep track of it, and it's clearly identified as a "text" message type. The main content is the actual text string that the message conveys – the information you want to send.

## Interface IMCPSignalNotifyCommand

This command, used within the Model Context Protocol (MCP), sends out informational notifications about pending positions. Specifically, it's used to announce the signal ID associated with a particular trading symbol that's actively being traded. Think of it as a way to keep everyone informed about what's happening with your open positions.

The notification includes the symbol being traded (like "BTCUSDT"), the name of the MCP schema generating the notification, and a descriptive note providing more context or detail. This helps maintain transparency and allows for monitoring and auditing of trading activity.

## Interface IMCPSchema

The IMCPSchema defines how a specific trading strategy interacts with a Model Context Protocol (MCP). Think of it as a blueprint that connects a name to a strategy and specifies how trades are managed.

Each schema has a unique name, ensuring no conflicts when registering different strategies. It specifies which strategy the MCP will control; if multiple strategies are present, you must explicitly define the strategy for clarity.

You can also set the cost of opening a position and estimate the time for a position to reach its target or stop-loss.

The permissions section is vital for security; it allows you to precisely control which actions an external agent can perform on the strategy.  By default, everything is allowed, but narrowing this down strengthens security.

The `getMessages` property lets you customize how the system reports on the portfolio's status, with the default being a simple text update for each asset.  Finally, there are optional callbacks that can be triggered during different points in the process, allowing for even more customized behavior.

## Interface IMCPPositionOpenCommand

This command is used to open a new trading position, specifically a "moonbag" position, which means it uses a fixed take profit and a hard stop-loss. You'll need to specify the symbol you want to trade, like BTCUSDT, and whether you want to go long (buy) or short (sell).

The command also includes the name of the specific trading strategy that's being used, known as the MCP Name. Finally, you can add a note to explain why this position is being opened – this is helpful for tracking and understanding your trades.

## Interface IMCPPositionCloseCommand

This command tells the system to close an existing trading position. 

It's used when a live trading strategy needs to finalize a position for a specific trading pair, like BTCUSDT. 

You'll specify which registered strategy, identified by its name (MCP Name), is requesting the closure and provide a brief explanation (note) for why the position is being closed – this is helpful for record-keeping and understanding trading decisions.

## Interface IMCPImageMessage

This describes a special kind of message used within a system to send images, like a chart or graph. Each image message gets a unique ID so the system can keep track of it and avoid sending the same image twice. 

The message always identifies itself as an "image" type.

It also includes the image's file type, like "image/png," and the actual image data, which is encoded as a long string of characters. Think of it like a digital envelope containing the complete picture information.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your trading portfolio, organized by the symbol being traded. Think of it as a quick look at your holdings at a specific point in time. It’s provided to your strategy's message handling functions, ensuring your strategy has the latest information about the portfolio's state for each asset it's dealing with. Each strategy instance gets its own context.

## Interface IMCPCallbacks

These callbacks let you observe what a backtest kit Model Context Protocol (MCP) is doing without changing how it works. Think of them as a way to peek behind the scenes after certain actions happen. They’re all optional – if you don't need them, you don't have to use them. If a callback doesn't work properly, it will be noted, but won’t stop the backtest from continuing.

Here's a breakdown of each one:

*   `onStatus`:  Gets fired after the system gets a status update, showing you the snapshot the renderer received and any messages it sent.

*   `onPositionOpen`:  Notifies you when a position is successfully opened, providing details like the signal and the data submitted to the live strategy.

*   `onPositionClose`:  Alerts you when a position is closed, including the ID of the signal that prompted the closure.

*   `onAverageBuy`:  Informs you when a DCA (Dollar-Cost Averaging) entry is accepted, along with the associated signal ID.

*   `onSignalNotify`:  Lets you know when a notification is sent for a signal, and provides the signal's ID.

## Interface IMCPAverageBuyCommand

This command is used to add a small buy order, a bit like trickling funds into a position over time (Dollar-Cost Averaging or DCA), to an existing, pending trade. 

It targets a specific trading pair, identified by its symbol, like "BTCUSDT". 

The command also identifies which trading strategy, or schema, is behind this action through its MCP name, ensuring everything is linked to the correct plan. Essentially, this lets a strategy automatically add small buy orders to a trade it's already planning.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's a central way to keep track of events and issues within the system.

You can use the `log` method for general record-keeping of important events, like agent actions or storage changes.

The `debug` method is for very detailed information, mainly useful when you’re developing or trying to figure out what's going on internally.

`info` is for more routine updates about successful actions like policy checks or saving data.

Finally, `warn` is for those situations where something might be wrong, but isn't stopping the system from working—things you should probably investigate.

## Interface ILogEntry

A `ILogEntry` represents a single event recorded during a backtest run. It’s essentially a record of something happening, useful for understanding what went on and debugging issues.

Each entry has a unique `id` to identify it, and a `type` that indicates its severity level – like "log," "debug," or "warn."  It includes a `priority` and `createdAt` timestamp, helpful for keeping track of log history and improving the user experience.

You’ll also find details like `methodContext` and `executionContext`, which are optional but provide extra context about where and how the event occurred.  The `topic` tells you what part of the code generated the log. Finally, `args` hold any additional information that was passed along when the log entry was created.

## Interface ILog

The `ILog` interface lets you work with logs in a more detailed way than just sending them. It builds on the standard logging system, adding the ability to retrieve a complete history of all the log messages that have been recorded.  You can use the `getList` method to fetch all log entries, which is useful for reviewing past events, debugging, or analyzing performance over time. Essentially, it provides a way to look back at everything that's been logged within the backtest-kit environment.

## Interface IHeatmapRow

This describes the data you’ll find in a row of a heatmap generated by the backtest-kit framework. Each row represents the performance of all strategies trading a specific symbol, like "BTCUSDT". It provides a wealth of information, from basic stats like total profit/loss and the number of trades, to more advanced metrics.

You'll find details on how profitable trades were, examining win rates, average win/loss amounts, and streaks. It also includes measures of risk, such as maximum drawdown and volatility.

Beyond simple profit and loss, the data shows how the strategies performed relative to risk, with Sharpe and Sortino ratios to evaluate adjusted returns. You’ll also see insights into trade duration, stability, and even clues about market pressure – whether buyers or sellers were more dominant. Finally, it summarizes trends in price movement and their confidence. The heatmap row gives you a comprehensive overview of a single symbol's trading performance across all tested strategies.

## Interface IFrameSchema

This schema describes a specific timeframe you're using for your backtest, like a slice of time you want to analyze. Think of it as defining the “window” of your backtest. Each frame has a unique name to identify it.

You can add a note to describe the frame for your own documentation.

The `interval` property sets how the timestamps within this frame are generated - for instance, every minute ("1m"), every hour, or every day. If you don’t specify it, the system defaults to one-minute intervals.

You also define the start and end dates for your backtest period within this frame.

Finally, you can add optional callbacks to trigger specific actions at different points in the frame's lifecycle.

## Interface IFrameParams

The `IFrameParams` object holds the information needed to set up a frame within the backtest-kit system. Think of a frame as a distinct, repeatable unit of time during a backtest. 

It combines the basic frame definition with a logger, allowing you to track and debug what's happening within that specific frame. The `interval` property defines the frame's name— essentially, a label to identify it during the backtest process. It's how you distinguish between different time periods you’re analyzing.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into different stages of a timeframe's creation within the backtest-kit framework.

It primarily offers the `onTimeframe` callback. This function gets triggered once the timeframe array (the sequence of dates you'll be trading against) has been built.  You can use it to check if the timeframes look right, record details about them, or perform any other validation steps. The timeframe data includes the start and end dates, as well as the interval used to generate the timeframe.

## Interface IFrame

The `IFrame` interface handles the creation of timeframes used in backtesting. It's the engine that determines when your trading strategy will be tested against historical data.

The core function, `getTimeframe`, is responsible for generating a list of specific dates and times.  You provide a trading symbol (like "BTCUSDT") and a name for the timeframe (like "1h" for one-hour intervals), and it returns an array of dates representing the start and end times for each backtest iteration. These dates are carefully calculated to match the interval specified in your backtest configuration, ensuring consistent data spacing.


## Interface IExecutionContext

The Execution Context provides the information your trading strategies and exchanges need to function correctly. Think of it as a container holding essential details about the current moment in time, like the trading symbol being involved (e.g., BTCUSDT) and the exact date and time. Critically, it tells you whether you're in a backtesting simulation or a live trading environment. This context is automatically passed around by the ExecutionContextService so you don't have to worry about manually managing it.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to and retrieving data from an exchange.

It requires a unique identifier for the exchange (`exchangeName`) and offers a place for notes (`note`) to help developers understand the implementation.

The core of the schema is the `getCandles` function, which is essential for fetching historical price data (candles).  You’ll use this to pull OHLCV data for backtesting purposes.

You can optionally provide functions to handle specific formatting needs: `formatQuantity` ensures trade sizes adhere to the exchange’s rules, and `formatPrice` does the same for prices.  If you don’t define these, it uses a default Bitcoin precision.

For more advanced data retrieval, `getOrderBook` and `getAggregatedTrades` allow fetching order book snapshots and trade histories respectively. These are optional, and the system will throw an error if they are not defined.

Finally, `callbacks` provide a way to react to events, like new candle data arriving.

## Interface IExchangeParams

The `IExchangeParams` interface defines the necessary configuration when setting up a connection to a cryptocurrency exchange within the backtest-kit framework. It essentially acts as a blueprint for how the framework interacts with the exchange's data and functionality.

To use this interface, you need to provide several key functions, including how to retrieve historical candle data, format order quantities and prices to match the exchange's rules, and fetch order book and trade information. 

Each of these functions is essential for the backtest to accurately simulate trading conditions. If any are missing, the framework will apply default behaviors, but you should always provide your own implementation. The interface also requires a logger for debugging and an execution context to provide information about the environment like symbol and backtest status.


## Interface IExchangeCallbacks

This section outlines callbacks you can use to receive updates from the exchange. Specifically, `onCandleData` lets you know when new candlestick data becomes available for a particular trading symbol and time interval. You'll receive an array of candle data points, along with information about the symbol, interval, and the time range of the data. This is useful for keeping your backtesting system synchronized with real-time market data.


## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with an exchange's data. It gives you tools to retrieve historical and future candle data, ensuring your simulations are accurate and don't peek into the future.

You can fetch candles going back in time, or simulate fetching candles that *would* be available to a live trader in the future. The framework also handles formatting quantities and prices to match the specific exchange's requirements.

Need to know the average price? It calculates a VWAP (Volume Weighted Average Price) based on recent trading activity. You can also retrieve the closing price of the most recent candle, get a snapshot of the order book, and fetch aggregated trades. 

Retrieving candles is flexible, allowing you to specify start and end dates, or just a limit, and the framework intelligently calculates the appropriate parameters to avoid any look-ahead bias in your backtesting.

## Interface IEntity

This interface serves as the foundation for any data that's saved and retrieved from a persistent store, like a database. Think of it as the common blueprint for all your saved objects. If a class represents something you want to store, it likely needs to implement this interface. It ensures a basic level of consistency across all your saved data structures.

## Interface IDumpInstance

The `IDumpInstance` interface defines how your code can save snapshots of data during a backtest. Think of it as a way to capture information at specific points in time, like message histories, raw data records, or error details. Each `IDumpInstance` is linked to a particular signal and bucket, ensuring it knows where the data belongs.

It provides several methods for saving different types of data:

*   `dumpAgentAnswer` saves the complete conversation history of an agent.
*   `dumpRecord` stores simple, flat key-value data.
*   `dumpTable` handles tabular data, automatically figuring out column headers from the table's contents.
*   `dumpText` saves plain text or markdown.
*   `dumpError` specifically records error messages.
*   `dumpJson` saves complex objects in a structured JSON format.
*   `dumpMCPStatus` captures the status of the Model Context Protocol.

Finally, `dispose` is a cleanup method used to release any resources the instance is holding when it’s no longer needed.

## Interface IDumpContext

The IDumpContext helps track and organize data dumps within the backtest-kit framework. Think of it as a container holding key information about each individual dump. It includes a unique signal identifier to pinpoint the specific trade the dump relates to, a bucket name for grouping dumps by strategy or agent, and a unique ID for the dump itself. 

You can also provide a description for each dump, which will be used for searching and displayed nicely in reports. Finally, a flag indicates whether the dump originates from a backtest or live environment, helping to differentiate data sources. This context is primarily used by the DumpAdapter to ensure dumps are properly categorized and processed.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, provides a foundation for handling events that need to be committed later, like when a trade occurs. Think of it as a way to hold onto information about a trade until the system is ready to finalize it. Each event includes the trading symbol, such as "BTCUSDT", and a flag to indicate whether the activity happened during a backtest simulation. These details ensure accuracy and proper recording of trading actions.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your candle data is available for a specific trading pair and timeframe. Think of it as a way to quickly verify if your backtest kit has the data it needs without having to scan through the entire dataset. You'll provide the symbol (like BTCUSDT), the exchange name, the interval (such as 1m for one-minute candles or 4h for four-hour candles), and a date range to check. This helps ensure the system has the correct data before starting a backtest.


## Interface ICandleData

This interface represents a single candlestick, the basic building block of price data used in trading. Each candlestick holds information about a specific time interval, including when it began (timestamp), the opening price, the highest and lowest prices reached, the closing price, and the total volume of trades that occurred. This data is essential for calculating indicators like VWAP and performing backtests to evaluate trading strategies. Essentially, it's a snapshot of price action and trading activity over a defined period.

## Interface ICacheCandlesParams

This interface defines the parameters used when you’re preparing your trading strategy for backtesting – specifically, how it handles cached historical data. Think of it as controlling the setup before the actual tests run.

It allows you to define functions that get called at key moments: just before the validation stage and just before the warm-up stage (which happens if the validation fails). These callbacks let you perform any necessary preparation, like logging or displaying messages, at those specific points in the process. 

The parameters passed to these callbacks tell you which symbol, time interval, and date range are being processed.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary failure encountered during order processing. It's used internally by the backtest-kit framework to handle situations where an order couldn't be executed immediately due to a likely temporary problem, such as a network issue or a server hiccup. 

Think of it as the framework's way of saying, "Something went wrong, but it might be fixable with a retry." 

Instead of abruptly stopping the backtest, the framework will automatically attempt the order again a limited number of times. It carries information about the error encountered so developers can investigate if necessary. Adapters or listeners don’t create this object; they signal issues that can lead to its creation.

## Interface IBrokerOrderVerdictRejected

When a trading order encounters a problem that prevents it from being placed or modified, this `IBrokerOrderVerdictRejected` signal is used to communicate the reason. It's a way for the system to tell you that the order couldn't be processed due to a business-level issue, meaning retrying won't likely fix it. 

The system itself creates this signal, not your code, as a result of certain events like order synchronization or order checks. If an error occurs, it’s bundled within the `error` property, giving you more information about the specific rejection. A "rejected" reason signifies a permanent failure – essentially, the system won't try again.

## Interface IBrokerOrderVerdictDeleted

This tells you when an order that your system was expecting has been removed, likely because the user cancelled it directly on the exchange. 

The backtest-kit framework handles this situation—you don't need to create this notification yourself. Instead, your adapter or listener signals this by throwing an `OrderDeletedError`.

When this happens, the framework immediately stops further checks or actions related to that order, considering it definitively resolved. 

You'll find details about why the order was deleted within the `error` property of this notification.

## Interface IBrokerOrderVerdictConfirmed

This object represents a final decision made about an order – whether it's allowed to proceed or not. It's how the backtest-kit framework communicates the outcome of a gate or a check it performed on an order.

You, as an adapter or listener, don't create this object directly. Instead, you use specific return values or errors to signal your decision. Returning normally or `true` indicates confirmation. Throwing a regular error means the issue is temporary.  Throwing an `OrderRejectedError` or `OrderDeletedError` signifies a permanent rejection.

When the framework receives your signal, it packages it into this verdict and then uses that information to proceed. The `reason` property, specifically `"confirmed"`, tells you the gate passed or the order is still valid.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` is a foundational type used within the backtest-kit framework to represent the outcome of actions related to orders, like when the system is synchronizing order information or verifying order details. It acts as a common base for different types of verdicts, allowing the system to consistently handle these outcomes regardless of the specific reason behind them. The `__type__` property is a unique identifier that distinguishes different verdict types, essentially categorizing the outcome for processing.

## Interface IBroker

This interface defines how your trading framework connects to a real broker or exchange. You'll need to implement this interface to actually execute trades.

The `waitForInit` method is a crucial one-time setup—think connecting to the exchange, loading your credentials, and most importantly, reconciling any existing orders or positions. This prevents trading "on top" of forgotten orders.

`onOrderCloseCommit` handles closing trades (take profit, stop loss, or manual close). This is the "close gate"—it's where you place the actual order to close a position and record the profit/loss. Errors here can cause retries or, in extreme cases, force the framework to close the position itself.

`onOrderOpenCommit` is the "open gate"—where new orders are placed. This includes entry orders and scheduled resting orders. Like closing orders, errors here can lead to retries or rejection of the order.

`onOrderActiveCheck` monitors already-open positions, making sure the order is still valid on the exchange. Problems here can trigger the framework to close the position.

`onOrderScheduleCheck` similarly monitors resting orders, checking their status and canceling them if needed.

The `onSignalActivePing` and `onSignalSchedulePing` methods are purely informational and allow you to respond to real-time exchange state—like a gap through a stop loss or a filled resting order—and take action accordingly. You'd use this to react to events.

The various "onSignal..." methods (`onSignalPendingOpen`, `onSignalPendingClose`, etc.) are informational hooks, providing updates on the lifecycle of trades.

The `onBreakevenCommit`, `onAverageBuyCommit`, `onTrailingStopCommit` are for specific order types and allows reaction to the specific events.


## Interface IBreakevenData

This interface represents the data needed to save and load information about whether a breakeven point has been achieved for a specific trading signal. It's a simplified version of the full breakeven state, designed for easy storage and retrieval, typically using JSON.  Essentially, it tells you if the breakeven target has been hit – a simple yes or no. This data is used to keep track of your progress across sessions.

## Interface IBreakevenCommitRow

This represents a single update to a trading position’s breakeven point. It's a record showing that a change in breakeven is needed. 

The `action` always indicates this is a breakeven adjustment. 

The `currentPrice` tells you the price at which the breakeven level was recalculated and applied.

## Interface IBreakeven

The IBreakeven interface helps track when a trading signal's stop-loss can be moved to the original entry price, essentially achieving a breakeven point. It's used by components that monitor signals and manage their state.

The `check` method determines if breakeven should be triggered, considering whether breakeven has already been reached, if the price has moved favorably enough to cover transaction fees, and if the stop-loss can be adjusted. When all conditions are met, it records the breakeven event and persists the information.

The `clear` method resets the breakeven state when a signal is closed, whether by hitting a target price, stop-loss, or expiration. It removes the signal's data from active memory and saves the changes permanently.

## Interface IBidData

This interface describes a single bid or ask price point within an order book. It's basically a snapshot of what buyers and sellers are offering.

Each bid or ask has a `price`, which is represented as a string, and a `quantity`, also represented as a string, indicating how much is available at that price.


## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. It describes one purchase made as part of a larger DCA plan. 

Each instance holds information about that specific buy, including the price at which it happened, the cost in dollars, and how it impacts the total number of purchases made so far. This helps track progress and calculate overall costs within the DCA process.


## Interface IAggregatedTradeData

This interface defines a single trade event, providing key details for analysis and backtesting. Each trade is identified by a unique ID and includes the price at which it happened, the quantity of assets exchanged, and the exact timestamp of the trade.  Importantly, it also indicates whether the buyer was the market maker – a crucial piece of information for understanding trade direction. This information allows for a deeper dive into trading activity and performance.


## Interface IAgentLogger

The `IAgentLogger` interface helps you record specific actions taken by your AI agents during backtesting. It's distinct from the standard framework logging, which focuses on the health of the backtest engine itself. This dedicated logger allows you to track what your agents are doing – their reasoning, calls to tools, and generated completions – providing a clear history of their actions. Using this logger ensures that the logs you review are specifically about the agent's behavior, not the underlying backtesting framework.

The main function is `agent`, which you use to log messages related to your agent's activity. You provide a topic to categorize the message and then any relevant information you want to capture.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading activity – think of it as a record of a backtest or live trade currently in progress. It's automatically created when a backtest or live run starts and then removed when it finishes, whether successfully or with an error. This record helps the system keep track of what's happening and prevent issues caused by multiple tasks running at the same time.

Each entry includes details like the trading pair symbol (e.g., "BTCUSDT"), information about which strategy and exchange are running the activity, and whether it's a backtest or a live trade. These details allow the system to identify and manage parallel workloads efficiently.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit. Think of it as a trigger to move a planned action forward.

It contains information about the type of action being requested – specifically, it's an "activate-scheduled" action.

You'll also find the `signalId`, which identifies the signal to be activated, and an optional `activateId` used when a user wants to directly initiate the activation process.


## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current state of signals. It's designed to help you decide whether certain actions should proceed, like setting breakeven points, taking profits, or managing losses. 

Essentially, it allows you to check if there's an open position or a scheduled signal related to a specific trading symbol.

You'll use the `hasPendingSignal` method to see if an active signal exists for a particular symbol, considering whether it's a backtest or not and providing context about the strategy and exchange.

Similarly, `hasScheduledSignal` tells you if there’s a signal waiting to be triggered. This is useful for actions that depend on future signals.

## Interface IActionSchema

This defines a blueprint for custom actions that can be attached to your trading strategies. Think of actions as hooks that let you inject your own logic into the strategy execution process. 

They’re a powerful way to extend the framework's capabilities, allowing you to do things like manage state, track performance, send notifications, or trigger other business processes.

Each action is uniquely identified by its name, and you can add notes to help document what it does.

The heart of an action is its handler, which is essentially a function that gets executed during strategy runs and receives all event data. You also have the option to specify callbacks for specific events in the action's lifecycle. These callbacks are really useful for fine-grained control over when and how your custom logic runs.

## Interface IActionParams

This interface, `IActionParams`, bundles together all the crucial information needed for an action to function within the backtest-kit framework. It’s like a complete package delivered to each action, containing both the action's definition and the environment it's operating in.  You'll find a logger for tracking what’s happening, details about the strategy and timeframe it's linked to – like its name and the timeframe it's using – and flags indicating if it's a backtest run. Importantly, it also gives the action access to the current strategy context, so it knows about things like the current signal and the existing positions. This helps the action understand its place and how to behave within the larger trading system.


## Interface IActionCallbacks

This API provides callbacks for different stages of your trading action handlers within the backtest-kit framework. Think of these as hooks that let you customize what happens at various points, like initialization, resource management, and signal processing. They're optional, and you can use them for things like logging, resource cleanup, or persisting state.

Here's a breakdown:

**Initialization & Disposal:**

*   `onInit`: This callback runs when an action handler starts up. It's your chance to set things up, like connecting to a database or loading data.
*   `onDispose`: Called when the action handler is shut down, allowing you to clean up resources, like closing connections or saving data.

**Signal Events:**

*   `onSignal`: A general callback triggered every time a strategy emits a signal, regardless of whether it’s a backtest or live trading environment.
*   `onSignalLive`: Specifically triggered for live trading signals.
*   `onSignalBacktest`: Specifically triggered for backtest signals.
*   `onPingScheduled`:  Triggered during scheduled signal monitoring, running every minute.
*   `onScheduleEvent`: Handles lifecycle events for scheduled signals.
*   `onPendingEvent`:  Fires when a pending position is opened or closed, enabling custom actions.
*   `onPingActive`:  Runs every minute while a pending position is open.
*   `onPingIdle`: Runs every tick when there’s no active or pending signal.

**Risk & Order Management:**

*   `onRiskRejection`:  Called when a signal is rejected by the risk management system.
*   `onOrderSync`:  A critical gate for order management, allowing you to approve or reject order attempts.  Throws are used to signal rejection.
*   `onOrderCheck`: Checks the status of open orders during live trading, ensuring they’re still valid. Throws are also used here.

**Manual Wiring & Event Handling:**

*   `onScheduleEvent` and `onPendingEvent`: These events require manual wiring for actions, offering an alternative to using a Broker adapter. They allow direct control over exchange interactions within the strategy's execution context. 
*   `onPingScheduled`, `onPingActive`: Allow for specific polling of order status. 
*   `onOrderCheck` and `onOrderSync`: Offer powerful, exception-based gates for order verification and management.

These callbacks give you fine-grained control over your trading logic within the framework, enabling extensive customization and monitoring capabilities.


## Interface IAction

This interface, `IAction`, is designed to help you connect your custom logic to the trading framework's core events, like a bridge between the framework and your external systems. Think of it as a way to tap into everything that’s happening – from signals being generated to orders being placed and checked.

It provides a series of methods, each responding to specific events. These methods allow you to react to signals, whether they come from live trading or backtesting, and handle various events like profit and loss adjustments or scheduled monitoring tasks.

You can use these callbacks for things like logging activity, updating dashboards, managing your order flow, or integrating with external services. The `dispose` method is important too – use it to clean up when you're finished with these connections to avoid memory leaks. Some of the signals are event-driven, requiring manual implementation, while others are more straightforward.


## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a backtest. It keeps track of all the individual events, listing them in chronological order with the most recent ones appearing first. You can also find the total number of these high-profit events recorded. Essentially, it's a record of when and how the biggest wins occurred during a simulation.

## Interface HighestProfitEvent

This data represents the single best-performing trade (highest profit) recorded for a particular strategy. It contains key information about that trade, like when it happened (timestamp), what asset was traded (symbol), which strategy was used (strategyName), and a unique identifier for the signal that triggered the trade (signalId).

You'll also find details about the trade's direction (position – whether it was a long or short), its overall profit (pnl), the highest profit point reached during the trade (peakProfit), and the biggest loss it experienced (maxDrawdown). 

To help you understand the trade’s context, it includes the price at which the highest profit was achieved (currentPrice), the entry price (priceOpen), and the prices for take profit and stop loss orders if they were used. Finally, a flag indicates if this record was generated during a simulated backtest (backtest).

## Interface HighestProfitContract

The `HighestProfitContract` helps you track when a trading position reaches a new peak in profit. It’s a data structure that’s sent out by the framework whenever a position's profit surpasses its previous high.

You'll receive details like the trading symbol (e.g., "BTC/USDT"), the current price at that moment, and the exact timestamp.

It also includes information about which trading strategy, exchange, and timeframe are involved, along with the specific signal that triggered the trade.

Crucially, a `backtest` flag tells you whether this event occurred during a simulated backtest or in a real live trading environment. This allows you to tailor your responses accordingly.

You can use this information to build custom features, like automatically setting trailing stops or taking partial profits when specific profit milestones are hit.

## Interface HeatmapStatisticsModel

This data structure summarizes the overall performance of a trading portfolio, aggregating statistics across all the assets it holds. It gives you a broad picture of how the portfolio has performed, beyond just looking at individual assets.

You'll find key metrics like total profit and loss (P&L), Sharpe Ratio, and total number of trades. It also provides insights into risk management, showing maximum drawdowns and average fall P&L.

The structure includes averages and weighted calculations, for example, the average peak and fall P&L are weighted by the number of trades.  It also covers duration metrics, like the average length of winning and losing trades, and statistical measures like standard deviation.

Finally, it presents higher-level performance indicators such as annualized Sharpe Ratio and expected yearly returns, offering a comprehensive view of the portfolio's potential. The portfolio trades per year field estimates how frequently the portfolio is actively traded over a yearly time frame.

## Interface DoneContract

The DoneContract is how you get notified when a background task, like a backtest or live trading, finishes running. It provides key details about what just happened, such as the name of the exchange used, the strategy that ran, and whether it was a backtest or live execution. You'll see this event when you run a background process, and it includes information like the trading symbol involved. Think of it as a confirmation and a report card for your completed trading activity.

## Interface CronHandle

This object, returned when you set up a scheduled task, lets you easily cancel that task. Think of it as a quick way to remove a recurring action you've programmed into the system – simply discard this object to stop the task from running anymore. It's like having a "delete" button specifically for that scheduled event.

## Interface CronEntry

A `CronEntry` defines when and how a specific task or function is executed within the backtesting framework. It's essentially a schedule for your trading logic.

Each entry needs a unique `name` to identify it, and this name can't contain colons. The `interval` specifies how often the task runs – like every minute, hour, or day. If you leave the `interval` out, the task only runs once, immediately.

You can choose which symbols (like stock tickers) the task should process.  If you provide an empty list of symbols, the task runs once for all backtests.  If you provide a list, the task runs separately for each symbol on that list.

Finally, the `handler` is the actual code that gets executed when the schedule triggers.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest-kit system that demands immediate attention and typically requires stopping the current process. 

It provides a unique identifier for tracking the error, along with a detailed error object that includes the stack trace and any relevant metadata. A human-friendly message explains the nature of the problem. 

Notably, the `backtest` property will always be false, indicating that the error originated from the live trading environment, not the backtesting process itself.

## Interface ColumnModel

This interface helps you define how data will appear in tables generated by backtest-kit. Think of it as a blueprint for each column you want to show.

You specify a unique `key` to identify the column, and a `label` for the header that users will see.

The `format` function is where the magic happens—it transforms your data into a string that's easy to read. This is especially helpful for numbers, dates, or complex objects.

Finally, `isVisible` lets you conditionally show or hide a column based on certain conditions, providing flexibility in how you present your results.

## Interface ClosePendingCommitNotification

This notification signals that a pending trade was closed before it fully activated. It provides a comprehensive breakdown of what happened, useful for understanding why a trade didn’t execute as planned.

You’ll find details about the trade, including the symbol, strategy, exchange, and a unique identifier for both the signal and the closing event. It clarifies whether the notification came from a backtest or live trading scenario.

The notification gives you a full picture of the trade's parameters: entry and exit prices, stop-loss and take-profit levels (both original and trailing adjusted), the number of entries and partial closes, and the initial cost of the position.  It also includes timestamps marking crucial events like signal creation and position activation.

Detailed performance metrics are provided, including profit and loss (both absolute and as a percentage), peak profit, and maximum drawdown, along with the corresponding entry and exit prices.  You'll also find information on the number of entries associated with these metrics. There’s also an optional note field for a human-readable explanation of the signal's reasoning. Finally, a timestamp reflects when the notification was generated.

## Interface ClosePendingCommit

This signal tells the backtest system that a position has been closed. 

It provides details about the closure, including a unique identifier you can optionally add to track the reason.

You'll also find information about the position's profit and loss (PNL), the highest profit it reached, and the largest drawdown it experienced throughout its lifetime, all captured up to the point this closing signal was generated. This helps understand the performance of the closed trade.


## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trade was cancelled before it could be activated. It provides a wealth of detail about the cancelled signal, useful for understanding why it didn't execute and analyzing the potential impact.

The notification includes a unique identifier (`id`), the timestamp of the cancellation (`timestamp`), and whether the cancellation occurred during backtesting or live trading (`backtest`). You'll also find key information like the trading pair (`symbol`), the strategy that generated the signal (`strategyName`), and the exchange where it originated (`exchangeName`).

Detailed data about the trade itself is available, including the intended entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss (`priceStopLoss`), alongside their original, unadjusted values.  You can also see when the signal was initially created (`scheduledAt`) and when it was intended to activate (`pendingAt`).

Further, the notification provides information on the trade's financial aspects: cost (`cost`), number of entries (`totalEntries`), and partials (`totalPartials`).  It also presents comprehensive performance metrics: profit and loss (PNL), maximum drawdown, and peak profit data, all with associated prices and percentages.

Finally, a `note` field allows for the inclusion of a human-readable explanation for the cancellation, and `createdAt` records when the notification itself was generated.

## Interface CancelScheduledCommit

This interface defines how to cancel a scheduled signal event. To use it, you'll specify the action as "cancel-scheduled." You can optionally provide a `cancelId` to help identify why the cancellation occurred—this is helpful for tracking and debugging. Along with the cancellation request, you'll also provide information about the position being closed, including its total profit and loss (`pnl`), the highest profit it reached (`peakProfit`), and its maximum drawdown. This data gives a complete picture of the position's performance leading up to the cancellation.

## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading backtest.

It gives you a breakdown of how many times a breakeven milestone was hit and provides a detailed list of each event that triggered it.

You can access the complete history of breakeven events through the `eventList` property, and get a simple count of how many breakevens occurred with the `totalEvents` property. This helps understand the frequency and nature of these important moments in a trading strategy.


## Interface BreakevenEvent

This data structure represents a specific event—when a trading signal has reached its breakeven point. It bundles together all the key details surrounding that moment, which is useful for creating reports and analyzing performance.

You'll find information like the exact time it happened (`timestamp`), the trading pair involved (`symbol`), the name of the strategy used (`strategyName`), and the unique identifier of the signal (`signalId`).

It also provides insights into the trade itself: the entry price (`priceOpen`), the planned take profit (`priceTakeProfit`), the stop loss (`priceStopLoss`), and their original values when the signal was first created. If a dollar-cost averaging (DCA) strategy was employed, you'll see details on the total entries and the original entry price before averaging.

Furthermore, it tracks any partial closes that may have occurred, the total executed percentage of these partials, and the unrealized profit and loss (`pnl`) at the breakeven point.  You’ll also see the timestamps for when the position became active (`pendingAt`) and when the signal was initially created (`scheduledAt`), as well as whether the trade occurred in backtest or live mode (`backtest`). A human-readable note (`note`) provides context for why the signal triggered.

## Interface BreakevenContract

This interface represents a breakeven event, a significant milestone in a trading signal's lifecycle. It's triggered when a signal's stop-loss is moved back to the original entry price, essentially meaning the trade has covered its costs.

This event provides valuable information for monitoring your strategy's safety and tracking risk reduction.

The event includes details such as the trading symbol (e.g., BTCUSDT), the strategy’s name, the exchange and frame it’s running on, and the complete data about the original signal. You'll also find the current price at which breakeven was achieved and whether the event occurred during a backtest or live trade. A timestamp precisely marks when this milestone occurred, either during a live trade or a historical candle in a backtest.

## Interface BreakevenCommitNotification

This notification signals that a breakeven action has been executed, essentially meaning a position has been adjusted to cover costs and potentially secure a small profit. It provides a wealth of detail about the trade, including when it happened (timestamp), whether it was a backtest or live trade, the trading pair involved (symbol), and the strategy that initiated the action.

You'll find information about the price at the time of the action (currentPrice), the direction of the trade (long or short), the initial entry price (priceOpen), and the stop-loss and take-profit prices—both their current, potentially adjusted values and their original settings.

Beyond the basic trade details, the notification includes data related to any dollar-cost averaging (DCA) used, such as the total number of entries (totalEntries) and partial closes (totalPartials).

A significant portion of the notification details the performance of the trade, including the total profit and loss (pnl), peak profit achieved (peakProfit), and maximum drawdown (maxDrawdown)—all presented both numerically and as percentages. The notification also provides key prices and costs associated with these performance metrics.

Finally, you'll find additional context like a human-readable note (note) explaining the rationale behind the signal and timestamps for when the signal was scheduled (scheduledAt), became pending (pendingAt), and when the notification itself was created (createdAt).

## Interface BreakevenCommit

This object represents an event that occurs when a trade reaches its breakeven point. It contains key information about the trade's performance and settings at the time of the breakeven adjustment. 

You'll find details like the current market price and the overall profit and loss (pnl) realized by the trade so far. The data also includes the highest profit reached (peakProfit), the largest drawdown (maximum loss), and the trade’s direction (long or short).

Importantly, it provides the original entry price, and the take profit and stop-loss prices, both as they were initially set and after any trailing adjustments have been applied.  Finally, timestamps show when the signal to execute the breakeven was created, and when the position was initially activated.

## Interface BreakevenAvailableNotification

This notification signals that your trading position now has the opportunity to move its stop-loss to breakeven, meaning it's at the same price you initially entered the trade. It provides a wealth of information about the position, including its unique identifier, the exact time this opportunity arose, whether it's a backtest or live trade, and the trading pair involved.

You'll find details about the strategy that generated the signal, the exchange it was executed on, and the current market price.  The notification also breaks down crucial pricing details like the entry price, take profit price, and stop-loss prices, both as initially set and after any trailing adjustments.

Beyond pricing, it reveals the total number of entries and partial closes executed, offering insight into how the position was built and managed.  You'll get a complete picture of the position's performance so far, including profit and loss metrics, peak profit, maximum drawdown, and the prices and costs associated with those key moments.  The `note` property provides any extra explanations or context for the signal. Finally, you'll find timestamps tracking the signal's lifecycle, from initial scheduling to its pending and creation times.

## Interface BeforeStartContract

This event signals the beginning of a trading strategy run, right before the actual trading simulation or live execution starts. It's a crucial opportunity to set things up for that specific run, like initializing log files, resetting any counters used during the run, or notifying someone that a run has begun.  This event will always be followed by an `AfterEndContract` event, ensuring a clean start and finish for each run, even if unexpected issues arise.

The event provides details about the trading symbol involved (like "BTCUSDT"), the name of the strategy being used, the exchange providing the data, and whether it's a backtest or live trading scenario.  You'll also find the current price of the symbol and a timestamp representing the event's time, with the meaning of the time differing slightly between backtest and live modes – in backtest it's the intended start time of the historical data, while in live it's the current wall-clock time.


## Interface BacktestStatisticsModel

This model provides a comprehensive breakdown of how your trading strategy performed during a backtest. It organizes key metrics into categories like profitability, risk, and market dynamics. You'll find detailed information on individual trades, including their P&L, durations, and timestamps.

Overall performance is summarized with metrics like win rate, average P&L, total P&L, and Sharpe Ratio – helping you evaluate your strategy’s efficiency and risk-adjusted returns.  Volatility is assessed through standard deviation, while measures like Sortino Ratio and Calmar Ratio offer further insights into risk management.

Beyond simple profit and loss, the model delves into trade durations, consecutive winning/losing streaks, and even analyzes the pressure exerted by buyers and sellers in the market. Trend analysis, including strength and confidence, gives you an idea about the prevailing market direction during the backtest period. By examining all of these indicators, you can gain a deeper understanding of your strategy's strengths and weaknesses.

## Interface AverageBuyCommitNotification

This notification signals that a new "averaging" (Dollar-Cost Averaging or DCA) buy order has been executed as part of a larger position. It provides a detailed snapshot of the trade and its performance. 

You’ll find information like the unique ID of the notification, the exact time it occurred, and whether it was part of a backtest or live trading. It also includes essential details about the trade, such as the trading pair, strategy name, exchange used, and the signal identifier.

The notification breaks down the specifics of the averaging entry: its execution price, the cost of the entry, and how it impacts the average entry price for the entire position. You can also see the total number of DCA entries now in place.

Beyond the immediate trade details, the notification provides critical performance metrics. This includes the position's total profit and loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced. It details the prices and costs associated with these metrics, as well as the number of entries made at those points. A helpful note field may contain extra context about why the signal was generated. Finally, timestamps track the creation of the signal and the notification itself.

## Interface AverageBuyCommit

This interface describes an average-buy event, which happens when you're using a strategy that gradually buys into a position over time.

Each time a new averaging buy order is filled, this event is triggered, providing you with detailed information about that specific buy.

You’ll find the price at which the buy occurred, the cost of that buy, and how it impacts the overall average entry price of your position.

It also includes vital performance metrics like unrealized profit and loss, the highest profit achieved so far, and the biggest drawdown the position has experienced.

You can also see the original entry price, the current take profit and stop loss levels, along with timestamps related to when the signal was created and when the position was activated. This lets you fully track the progress and risk profile of your averaging strategy.

## Interface AfterEndContract

This interface signals the end of a trading strategy run, whether it was a backtest or live execution. Think of it as a notification that a strategy has finished its work and is cleaning up.

It’s guaranteed to be triggered exactly once for each strategy run, always paired with a corresponding "start" event. This allows for reliable teardown tasks like flushing data buffers, closing connections, or sending completion notifications.

The `when` property provides the precise time of completion; in backtests, it reflects the time of the last candle processed, and in live trading, it's the current time rounded to the nearest minute. It also includes important details about the run, like the traded symbol, strategy name, the exchange used, and the timeframe. You’ll also find the average price at the end and a timestamp equivalent of the event time, both provided for convenience. This is particularly useful for tasks like saving logs or transmitting information to other systems.

## Interface ActivePingContract

The `ActivePingContract` represents a regular update you'll receive while a pending signal is actively being monitored. Think of it as a heartbeat indicating the signal is still alive and being watched. It's emitted roughly every minute and provides a snapshot of the signal's status and the current market conditions.

Each ping includes details like the trading symbol (e.g., BTCUSDT), the strategy name, the exchange, and the timeframe being used.  You'll also get the complete data for that signal, allowing you to see all its parameters like entry price, stop-loss, and take-profit levels.  The `currentPrice` field is particularly important; it gives you the current market price at the time the ping was sent so you can react to price movements.

A `backtest` flag tells you whether the ping is coming from a historical backtest run or from live trading. Finally, `timestamp` provides the exact time of the ping – when it happened in live mode or the candle timestamp during a backtest. You can use these pings to build custom logic to dynamically manage your trading signals.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been activated, meaning a trade is now in progress. It provides a wealth of information about the trade, including when it was activated, what exchange it’s on, and the specifics of the trade itself like the symbol, position (long or short), and entry price. You'll find details like the take profit and stop-loss prices, plus information about any averaging or partial closes that may have occurred.

The notification also includes comprehensive profit and loss data, tracking peak profit, maximum drawdown, and the overall return on investment in both USD and percentage terms.  Furthermore, it captures information about the signal's history, such as when it was initially created and when it went pending.  Finally, there’s an optional field for adding a custom note to explain the reasoning behind the signal. This information is available whether the trade is live or part of a backtest.

## Interface ActivateScheduledCommit

This describes a signal event that marks the activation of a scheduled trade. When a scheduled trade is put in motion, this information package provides details about its current state.

It includes identifiers for tracking and understanding the activation, such as an `activateId` to pinpoint the specific reason for activation. You’ll find key price points like the entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss (`priceStopLoss`), as well as their originally intended values before any adjustments.

The package also presents performance metrics for the trade, detailing the profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the greatest drawdown experienced (`maxDrawdown`). 

You’ll also see the direction of the trade (`position`), the moment the signal was generated (`scheduledAt`), and the exact time the trade began executing (`pendingAt`). It offers a complete snapshot of the trade at the moment of activation, showing how it's performing and its initial setup.
