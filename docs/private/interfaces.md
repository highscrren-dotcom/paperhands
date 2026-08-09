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

This interface describes the notifications you receive when a walker needs to be stopped. 

It's used to signal that a particular trading strategy, identified by its name and associated walker, should be halted.

Think of it as a way to interrupt a running trading process – it tells you *which* strategy and walker needs to be stopped, along with the trading symbol it's operating on. 

This is helpful when you have several trading strategies active at the same time, each using its own walker, allowing you to specifically target the one you want to pause.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. Think of it as a container that holds all the results – it includes the basic information from a standard backtest report, but also provides extra details for comparing strategies against each other. Inside, you’ll find an array that lists the results of each strategy, allowing for detailed analysis and performance comparisons.


## Interface WalkerContract

The WalkerContract represents progress updates you'll receive as different trading strategies are being tested and compared. Think of it as a notification system to keep you informed.

Each notification contains details like the name of the strategy just finished running, the exchange and symbol it was tested on, and key performance statistics. You’ll also see which strategies have performed the best so far, the current ranking, and how far along the testing process you are. 

The information shared includes the strategy's name, the exchange and symbol used in the backtest, and its performance statistics. The metric value represents the key number being optimized, and the bestMetric shows the best value seen among all strategies tested up until that point. You'll also see how many strategies have been tested compared to the total number to be tested.

## Interface WalkerCompleteContract

This interface represents the final notification from a backtest walker, signaling that all strategies have been evaluated. It bundles together a wealth of information about the entire backtesting process.

You'll find details like the walker's name, the trading symbol, the exchange and timeframe used. It also specifies which metric was used to judge strategy performance.

The notification includes the total number of strategies tested and crucially, identifies the best-performing strategy based on the selected metric. Alongside that, you get the actual value of the best metric achieved and a full set of statistics related to that top strategy. It’s a one-stop shop for understanding the outcome of a complete backtest run.

## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during your backtesting process. 

It's specifically triggered when the risk validation functions encounter an error.

Each notification includes a unique identifier, a detailed error message that's easy to understand, and technical details about the error including a stack trace.

You'll also see an `error` property containing more information about the problem.

Finally, the `backtest` flag will always be false for these notifications, confirming they originate from the live trading context.


## Interface ValidateArgs

This interface, ValidateArgs, helps ensure that the names you're using for different parts of your backtesting setup are correct. Think of it as a way to double-check that you've spelled everything right and are using recognized names for things like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweeps. Each property within this interface represents one of these components, and it expects a type that can be validated against a list of allowed values. This helps prevent errors and ensures consistency throughout your backtesting process.

## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed, giving you detailed information about the trade. It’s essentially a confirmation that your trailing take profit strategy has triggered and closed a position.

The notification includes a unique identifier and timestamp for tracking, along with whether the event happened during a backtest or live trading. You'll find specifics about the trading pair, the strategy used, and the exchange where the trade took place.

It provides the signal's details: a unique signal ID, the percentage shift applied to the original take profit, and the current market price at execution. You'll get the position direction (long or short), the original entry price, and the adjusted take profit and stop-loss prices.

Beyond that, you’ll get crucial performance data like total profit and loss (both absolute and percentage), peak profit achieved, maximum drawdown experienced, and details related to each of those.  Entry and partial close details are also provided. Finally, optional notes might offer a human-readable explanation for the signal. Timestamps indicate when the signal was created, made pending, and when the notification itself was generated.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit order is executed. It provides detailed information about the trade and the trailing adjustment that occurred. You'll find details like the current market price, the profit and loss (pnl) of the position, the highest profit reached (peakProfit), and the largest drawdown experienced. The event also includes the original take profit and stop loss prices, along with the updated, adjusted take profit price resulting from the trailing mechanism. Key information like the trade direction (long or short), entry price, and timestamps for signal creation and position activation are also available.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It's like getting a detailed report on what just happened with your automated trading strategy.

You’ll find key details like a unique ID for the event, the exact time it occurred, and whether it happened during a backtest or live trading. The notification includes the trading pair (like BTCUSDT), the strategy that made the decision, and the exchange involved.

It provides all the pricing information relevant to the trade, including the entry price, stop-loss and take-profit levels (both original and adjusted by the trailing stop), and the current market price at the time of execution.  You’ll also get a breakdown of the position size, number of entries and partials, along with a full profit and loss (P&L) statement including peak profit and maximum drawdown metrics. This level of detail helps you analyze the performance of your strategies and understand their behavior in different market conditions. Finally, you'll find extra details about the signal like a description and when it was scheduled and created.

## Interface TrailingStopCommit

This describes a trailing stop event, which happens when a trailing stop-loss order is triggered. It details the key information about the event, including the fact that it's a "trailing-stop" action.

You'll find the percentage used to adjust the stop loss, as well as the current market price at the moment the adjustment occurred. 

The event also provides crucial performance metrics for the trade, such as the total profit and loss (pnl), the highest profit reached (peakProfit), and the maximum drawdown experienced. 

Further details include whether the trade was a long (buy) or short (sell) position, the original entry price, the take profit and stop loss prices (both the original values and the adjusted values due to trailing), a timestamp indicating when the signal was created, and when the position was activated.

## Interface TickEvent

This describes the `TickEvent` data structure, which acts as a central point for all information related to events within the trading system. Think of it as a standardized record of what's happening – whether a trade is scheduled, opened, closed, or cancelled.

Each `TickEvent` contains details like the exact time of the event (`timestamp`), what type of event it is (`action`), and crucial information relevant to that action. For example, if a trade is scheduled, you'll find details about the signal, position type, and original pricing.

When a position is open or active, properties track things like unrealized profit and loss (`pnlCost`, `pnl`), progress towards take profit and stop loss (`percentTp`, `percentSl`), and the total capital invested (`pnlEntries`).  If a position is closed, you'll find data about the close reason, duration of the trade, and peak/fall profit percentages.  The structure ensures you have all the necessary data to analyze and report on the performance of your backtests.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are being synced. It keeps track of all the sync events that have happened, giving you a detailed list of each one. You can see the total number of sync events, and specifically how many times signals have been opened and closed. This lets you monitor the lifecycle of your signals and spot any potential issues.

## Interface SyncEvent

This data structure holds all the key information about events related to a trading signal’s lifecycle, designed to be used when creating reports. Think of it as a detailed snapshot of what happened at each significant point in a trade – from its initial creation to its eventual closure. It captures things like when the event occurred, which trading pair and strategy were involved, and the direction of the trade (long or short).

You’ll find details about the trade’s pricing, including the entry price, take profit levels, and stop loss levels, both as they were originally set and after any adjustments. It also tracks information specific to dollar-cost averaging (DCA) strategies, such as the total number of entries and partial closes. Performance metrics like peak profit, maximum drawdown, and total profit and loss (PNL) are included to fully understand the trade’s performance. Finally, it indicates the reason for closure and whether the event came from a backtesting simulation.

## Interface StrategyStatisticsModel

The `StrategyStatisticsModel` helps you understand how your trading strategy is performing by tracking different types of events. It's like a scorecard that keeps tabs on things like buy orders, sell orders, and adjustments to your positions.

You'll find a complete list of every event the strategy generated, along with the total number of events that occurred.

The model also breaks down events into categories: events where orders were canceled, pending closes, partial profits or losses, trailing stops, trailing take profits, breakeven adjustments, scheduled activations, and average buy orders. This breakdown gives you a detailed view of your strategy's behavior.

## Interface StrategyPauseNotification

This notification tells you when a trading strategy has been paused or resumed. It's like a signal that the strategy isn't actively placing new trades. 

When a strategy is paused, it stops creating new trades – the `getSignal` function isn't called and any planned trades are held back. However, trades already in progress or scheduled for later will still be managed and closed as usual.

The notification provides details about the event, including a unique ID, the timestamp of the change, whether it occurred during a backtest or live trading, the trading pair involved, the strategy's name, the exchange and frame used, and most importantly, whether the strategy is now paused or resumed. It also includes a creation timestamp for tracking purposes.

## Interface StrategyEvent

This `StrategyEvent` provides a central place to collect all the important details about what your trading strategy is doing. Think of it as a log entry for every action your strategy takes, whether it's placing an order, canceling one, or closing a position.

Each event includes the time it happened, which symbol was involved, and the name of the strategy and exchange used. It also tracks the signal that triggered the action, the current market price, and any percentage adjustments for profit taking or stop losses.

You’ll find information about order IDs for scheduled, pending, and activated actions, along with timestamps for creation and activation. It indicates whether the action occurred during a backtest or live trading.

The event details also include the trade direction (long or short), entry price, take profit and stop loss prices (both effective and original), and details related to dollar-cost averaging (DCA) like the total number of entries and the cost of the position. Finally, it logs the profit and loss (PNL) at the time of the action, and an optional note for any extra context.

## Interface SignalScheduledNotification

This notification lets you know when a trade signal has been planned for future execution. It’s like a heads-up that a trade is going to happen, but not right now.

The notification includes details like a unique ID, the exact time the trade was scheduled, and whether it's part of a backtest or live trading. You’ll also find information about the trading pair involved, the strategy that generated the signal, and the exchange where the trade will take place.

It provides a wealth of data about the intended trade, including the trade direction (long or short), target entry, take profit, and stop-loss prices. You can see the original prices before any adjustments, along with details about any DCA (Dollar-Cost Averaging) strategies used and partial closes executed.

The notification also contains performance metrics about the potential trade, such as projected profit and loss, peak profit, and maximum drawdown, along with key price points and cost breakdowns. Finally, there’s an optional note field for additional context or explanations about the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It's like getting a heads-up that a position is now active, whether it’s a backtest simulation or a real live trade.

The notification includes a unique ID and timestamp for tracking. You’ll see details like which strategy triggered the trade, on which exchange and symbol, and whether it's a long (buy) or short (sell) position.

It provides key information about the trade itself: the entry price, take profit, and stop loss levels, as well as how those levels might have changed from their original settings. If the strategy used averaging techniques (like Dollar-Cost Averaging), you’ll see details on the total entries and partial closures involved.

Beyond just the trade setup, the notification also offers a wealth of performance data, including the total profit and loss (PNL), the highest profit achieved, the largest drawdown (loss), and relevant price levels for those metrics. You’ll find details about slippage and fees factored into those PNL calculations. Plus, there’s an optional note field for explaining the reasoning behind the signal. Finally, there are timestamps for when the signal was created, became pending, and was generated.

## Interface SignalInfoNotification

This notification type lets you receive informational messages broadcast by your trading strategies, providing extra context about open positions. Think of it as a way for your strategies to "speak" and share details about what they're doing. Each notification includes a unique identifier, a timestamp, and whether it’s from a backtest or live trading.

You'll find details like the strategy's name, the exchange used, the trading pair, and the current market price at the time of the event. It also provides a wealth of position-specific data – entry and take profit/stop-loss prices (both original and adjusted for trailing), total entries, partial closes, and performance metrics. 

The included performance information goes beyond just profit and loss (pnl), giving you insights into peak profit achieved, maximum drawdown experienced, and relevant pricing information related to those milestones. You can also get details regarding price points and entries at those peaks and troughs, along with the position’s overall invested capital.  Finally, strategies can add custom notes and external identifiers to these notifications for more tailored communication.

## Interface SignalInfoContract

This interface defines the structure for informational messages sent from strategies during trading, whether in backtesting or live mode. It allows strategies to broadcast custom messages related to open positions, useful for things like debugging, custom annotations, or sending notifications to external systems. The message includes details like the trading symbol, strategy name, exchange, and the frame (if applicable).

You’ll find a wealth of data, including the original signal data, the current market price, a user-defined note, and an optional notification ID for tracking purposes.  The `backtest` flag clearly indicates whether the event occurred during a historical simulation or in live trading, while the `timestamp` provides the exact time of the event based on either the current time (live) or the candle's time (backtest).  Essentially, it’s a structured way for strategies to communicate specific events and data points during their execution.

## Interface SignalEventContract

This interface helps you track when trading positions are opened and closed within the backtest-kit framework, without needing to monitor every single signal. Think of it as a notification system for significant position changes.

It provides information about each event, including what triggered the open or close – whether it was a take-profit, stop-loss, user action, or something else. You'll find details like the trading symbol, the strategy involved, the timeframe, and all the important data related to the signal itself (like entry price, stop-loss levels, and potential profit).

The `backtest` property tells you if the event happened during a historical simulation or live trading, and a timestamp provides precise timing information. This allows you to build custom callbacks to react to these position changes as they occur.

## Interface SignalData$1

This data structure holds all the key details about a single completed trading signal. It's designed to be used when calculating and displaying performance metrics, like profit and loss.

Each entry represents a signal that has been opened and then closed, providing information such as which strategy created it, a unique ID for tracking, and the trading symbol involved.

You'll find the position type (whether it was a long or short trade), the percentage profit or loss achieved, and the reason the signal was closed. 

Finally, timestamps indicate precisely when the signal was initiated and when it was closed, allowing for a complete historical record of each trade.

## Interface SignalCommitBase

This defines the core information shared by all signal commitment events within the backtest-kit framework. Every signal commitment will include details like the trading pair's symbol, the name of the strategy that generated the signal, and the exchange used. You’ll also find information about whether the signal originates from a backtest or a live trading environment, along with a unique identifier for the signal itself.

The events also capture timing information with a timestamp, and tracking information about how many entries and partial closes have been executed. Importantly, it preserves the original entry price, even if subsequent DCA averaging changes the actual position price.  Finally, the complete signal data at that moment is included, along with an optional note to explain the signal's reasoning.

## Interface SignalClosedNotification

This notification provides detailed information about when a trading position is closed, whether it's due to hitting a take profit or stop loss, or simply expiring. It includes a unique identifier, a timestamp, and whether the trade occurred during a backtest or live trading.

You’ll find specifics about the strategy, exchange, and signal involved, along with details like the entry and exit prices, take profit/stop loss levels, and how many DCA entries were used. 

The notification also calculates and reports key performance metrics, like profit/loss in both percentage and USD, along with peak profit and maximum drawdown metrics, providing a complete picture of the position's lifecycle and performance.  It also specifies the reason for the position's closure, the length of time it was active, and offers an optional note to add custom context to the event. The inclusion of timestamps at various stages (creation, pending, closing) allows for precise timeline analysis of the trade.

## Interface SignalCancelledNotification

This notification tells you a scheduled trading signal was cancelled before it could be activated. It provides a lot of detail about *why* and *how* the cancellation happened.

You'll find a unique ID for the cancellation itself, and the original details of the signal – things like the intended entry price, take profit, and stop loss levels. It also explains the trading direction (long or short) and the strategy that created the signal.

The notification includes the signal's creation timestamp and how long it was pending, and importantly, gives a reason for the cancellation (like a timeout, price rejection, or user action). If a user manually cancelled the signal, there's a cancellation ID included. It also has details about any potential averaging or partial closes that were planned for the position.

## Interface Signal

The `Signal` object holds key information about a trading position. 

It keeps track of the initial entry price using the `priceOpen` property, representing the price at which the trade was initiated. 

A record of all entries is stored in the `_entry` array, containing details like the entry price, associated costs, and the timestamp of each entry.

Similarly, the `_partial` array documents any partial exits from the position, noting whether they were profit-taking or loss-limiting actions, along with the percentage, current price, cost basis at the time of the partial exit, number of shares at the time of the partial exit, and timestamp.

## Interface Signal$2

This `Signal` object holds important data about a trading position. 

It includes the `priceOpen`, which represents the original price when you first entered the trade.

You’ll also find details about entries (`_entry`), a history of when and at what price and cost your positions were initiated.

For partial exits, the `_partial` array provides information like the type of exit (profit or loss), the percentage gained or lost, the price at the time, and the cost basis. This helps you track your progress and analyze your strategies.

## Interface Signal$1

This section describes the `Signal$1` object, which represents a trading signal within the backtest-kit framework.

It holds key information about a trade, including the initial entry price (`priceOpen`).

The `_entry` property is an array that keeps track of the details of each entry made for this signal, logging the price, total cost, and the time of entry.

Similarly, `_partial` is an array recording partial exits from the position, detailing the exit type (profit or loss), the percentage gained or lost, the current price at exit, the cost basis at the time, the number of units held at the time, and the timestamp of the partial exit.

## Interface ScheduledEvent

This data structure holds all the key information about events related to trading signals – whether they were scheduled, cancelled, or opened. Think of it as a complete record of what happened to a particular signal, including when it occurred and important details about the trade itself.

You'll find information like the exact timestamp of the event, what type of event it was (scheduled, cancelled, or opened), and the symbol being traded. It includes the signal's ID, the position type, and any notes attached to the signal.

For active trades, it provides prices like the entry price, take profit, and stop-loss levels, including the original values before any modifications. It also tracks details about partial closes and any averaging strategies used for entries.

If a signal was cancelled, you'll find the reason and a timestamp for when it closed. Opened signals have information about when the position became active. Finally, it holds data about the unrealized profit and loss (PNL) at the time of the event and the original scheduling time.

## Interface ScheduleStatisticsModel

This model gives you a snapshot of how your scheduled trading signals are performing. 

It breaks down the overall activity, telling you exactly how many signals were scheduled, activated, or cancelled.

You’ll find detailed information about each individual event in the `eventList`, allowing you to investigate specific instances.

Beyond raw counts, it also provides key performance indicators like the cancellation rate and activation rate, which help you understand the efficiency of your scheduling process.

The `avgWaitTime` and `avgActivationTime` metrics offer insight into how long signals linger before being cancelled or activated, respectively, letting you fine-tune your strategy.


## Interface SchedulePingContract

This defines a special event that happens regularly while a trading strategy is actively monitoring a scheduled signal. Think of it as a heartbeat, occurring every minute while the signal is active – meaning it's not canceled or fully activated yet. This allows you to keep track of the signal's lifecycle and build custom checks.

Each event provides a lot of information, including the trading pair (like BTCUSDT), the name of the strategy using it, and the exchange involved. You’ll also see the timeframe being used, and comprehensive details about the scheduled signal itself.

Importantly, the event also includes the current price of the asset – enabling you to build monitoring logic based on price fluctuations. The `backtest` flag tells you whether the data comes from historical simulations or live trading. Finally, a timestamp is included to precisely time the event. You can register to receive these events, giving you a way to react to the ongoing monitoring of a scheduled signal.

## Interface ScheduleEventContract

This contract helps you keep track of when a signal is scheduled to trade and when it's removed, without needing to watch the entire signal stream. It's like getting a notification when a signal is set up or cancelled.

You'll receive notifications for two main actions: "scheduled," meaning a signal is waiting to be activated, or "cancelled," indicating the signal was removed before it could trigger.

Each notification includes key details: the trading pair (symbol), the strategy that created the signal, the exchange and timeframe it's associated with, the full signal data, and the reason for cancellation (if applicable). There’s also the current price at the time of the event and whether it’s part of a backtest or live trading.

Importantly, it *doesn't* tell you when a signal actually starts trading; that’s handled elsewhere. This focuses solely on the scheduling and cancellation phases. You can use this to build callbacks that react to these specific lifecycle changes.

## Interface RiskStatisticsModel

This model holds key statistics related to risk management within the backtest framework. It tracks risk rejection events, giving you insight into where and why risks are being triggered.

You’ll find a complete list of individual rejection events within the `eventList` property, offering detailed information about each occurrence.

The `totalRejections` property simply counts the overall number of risk rejections that have taken place.

To understand trends, you can examine the `bySymbol` property, which breaks down the rejections by the trading symbol involved.  Similarly, `byStrategy` helps you analyze rejections associated with specific trading strategies.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked because of risk management rules. Each notification has a unique ID and timestamp, showing precisely when the rejection happened. 

It also indicates whether the rejection occurred during a backtest or in live trading. You'll find details about the symbol being traded, the name of the strategy that generated the signal, and the exchange involved.

The `rejectionNote` provides a clear explanation for why the signal was rejected, and a `rejectionId` offers a way to track specific rejections if needed. 

The notification includes information about your active positions, the current price, and the specifics of the signal that was rejected, like its direction (long or short), entry price, take profit and stop-loss levels, and an optional note explaining the signal's rationale. It also provides the creation timestamp of the notification.

## Interface RiskEvent

This data structure holds information about situations where trading signals were blocked due to risk management rules. It’s used to create reports detailing why certain trades didn't happen.

Each `RiskEvent` includes a timestamp marking when the rejection occurred, along with details like the trading symbol, the specific signal that was blocked, the name of the strategy that generated it, and which exchange and timeframe were involved. 

You'll also find the current market price at the time, the number of currently open positions, and a unique identifier for the rejection.  A note explaining the reason for the rejection is provided, and a flag indicates whether the event happened during a backtest or live trading.

## Interface RiskContract

The RiskContract defines what happens when a trading signal is blocked because it violates risk rules. Think of it as a notification that something risky was caught before it could become a trade.

This notification, called a rejection event, includes a lot of useful information.

You'll find details about the trading pair involved (symbol), the signal itself (currentSignal), the strategy that wanted to make the trade (strategyName), and the timeframe it was for (frameName).

It also shows which exchange was involved (exchangeName) and the current market price (currentPrice) at the time of the rejection. To give a broader view of the situation, it includes the number of positions already open (activePositionCount).

A unique ID (rejectionId) and a descriptive note (rejectionNote) help pinpoint the exact cause of the problem and what went wrong. The timestamp tells you precisely when the rejection occurred, and a flag (backtest) indicates if it happened during a simulated backtest or in live trading. This helps in understanding whether the event is for testing or real trading.


## Interface ProgressWalkerContract

The `ProgressWalkerContract` is a way to keep track of what's happening when a background process is running within the backtest-kit framework. It provides updates on the progress of a particular trading strategy walker.

You'll see these updates during the execution of a `background` task, giving you information about the specific walker, exchange, and frame being used.

Each update includes details like:
*   The name of the walker running
*   The exchange involved
*   The frame being used
*   The trading symbol
*   The total number of strategies to be evaluated
*   How many strategies have already been processed
*   A percentage indicating how far along the process is, ranging from 0% to 100%

## Interface ProgressBacktestContract

The `ProgressBacktestContract` provides updates on the progress of a backtest as it runs. It's a way to monitor how far along a backtest is, especially when running in the background.

Each update includes the exchange and strategy names, the trading symbol being analyzed, the total number of historical data points (frames) the backtest will use, and how many have already been processed. 

You can also see a percentage representing the completion of the backtest, ranging from 0% to 100%. This information allows you to gauge the estimated time remaining for the backtest to finish.


## Interface PerformanceStatisticsModel

This model holds the overall performance data for a specific trading strategy. 

It includes the strategy's name, the total number of performance events captured, and the total time spent calculating those metrics. 

The `metricStats` property provides a breakdown of performance statistics, organized by the type of metric being measured. 

Finally, the `events` array contains the complete, raw list of performance records associated with the strategy.

## Interface PerformanceContract

The PerformanceContract helps you keep tabs on how your trading strategies are performing. Think of it as a way to measure how long different parts of your trading system take to execute. 

Each PerformanceContract contains information about when an event happened, when the previous event happened (or null if it's the first one), what type of operation was being performed (like order execution or data fetching), and how long that operation took.

You'll also find details that link the performance data to a specific strategy, exchange, frame (or live mode if it's not a backtest), trading symbol, and whether the event occurred during a backtest or in live trading.  These details allow you to pinpoint areas where your strategy might be slow or inefficient, leading to optimizations.

## Interface PauseContract

This interface describes what happens when a trading strategy is temporarily paused or resumed. It's designed to let other parts of your system, like notification tools, know when automatic trading is stopped or started again.

When a strategy is paused, it won't create any new trades, but it will still manage any trades that are already in progress.

The data provided includes details like the trading symbol, whether the pause is active or not, the exact time of the change, the strategy and exchange involved, the timeframe being used, and whether the event came from a backtest simulation or live trading. This allows for tailored handling of pause/resume events depending on the context.

## Interface PartialStatisticsModel

This model holds key statistical information derived from your trading backtest, specifically focusing on partial profit and loss events. Think of it as a snapshot of how your strategy performed in terms of gains and losses.

The `eventList` property gives you access to a detailed record of each individual profit and loss event that occurred during the backtest. 

`totalEvents` simply tells you the overall number of events, representing the entire history of profit and loss milestones.

You can also see the overall number of profitable trades (`totalProfit`) and the total number of losing trades (`totalLoss`). These numbers help to understand the overall win/loss ratio.


## Interface PartialProfitContract

The `PartialProfitContract` represents notifications about a trading strategy reaching pre-defined profit milestones, like 10%, 20%, or 30% profit. It's used to monitor how a strategy is performing and to track partial take-profit actions.

These notifications are generated as a signal reaches these profit levels, and each level is only reported once for a given signal. Multiple levels can be triggered within the same moment if the price moves significantly.

The notification includes key details like the trading symbol, the strategy name, the exchange and frame used, the full original signal data, the current market price, the specific profit level achieved, whether it's a backtest or live trade, and a timestamp.  This information helps with performance reporting and understanding strategy behavior across different environments.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit has been taken – essentially, when a portion of your position has been closed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading.

You'll find details about the trade itself, like the trading pair (e.g., BTCUSDT), the strategy that triggered it, and the exchange used. Crucially, it includes the entry price, take profit, and stop-loss levels, both original and adjusted for any trailing.

The notification also breaks down the position’s performance, revealing the total profit/loss, peak profit, maximum drawdown, and their corresponding prices and percentages. You'll see how much capital was invested, and how much has been profited or lost.  Finally, there’s a field for a descriptive note that explains why the partial profit was executed.

## Interface PartialProfitCommit

This describes a partial profit-taking event within a trading strategy backtest. It signifies that a portion of an existing position is being closed to secure some gains. The `action` property clearly marks this as a "partial-profit" event.

The `percentToClose` specifies what percentage of the original position size will be closed.  You'll also find data like the `currentPrice` at the time of this action and details about the position's performance so far, including total profit and loss (`pnl`), peak profit, and maximum drawdown.

The object includes historical performance information such as the `priceOpen`, `priceTakeProfit`, and `priceStopLoss` used when the position was initially established and even the original values of these prices before any trailing adjustments.  Timestamps like `scheduledAt` and `pendingAt` track when the signal was created and when the position was activated, providing a chronological record of events. Finally, it tells you whether it's a long or short position.

## Interface PartialProfitAvailableNotification

This notification tells you when a trading strategy has reached a profit milestone, like 10%, 20%, or 30% of its potential. It's a signal that things are going well with a trade.

Each notification has a unique ID and timestamp, so you can track exactly when this event happened.  You’ll also find details about whether it's a backtest or a live trade, the trading pair involved, the strategy that generated the signal, and the exchange where the trade took place.

The notification includes the entry price, current price, and information about the take profit and stop loss levels, both as originally set and with any trailing adjustments applied.  It also shows information about any DCA averaging that might have been used, along with details about previous partial profit closings.

You’ll get a comprehensive picture of the position's performance, including total profit/loss (both in USD and as a percentage), the peak profit achieved, and the maximum drawdown experienced.  The notification provides all the key details needed to understand the trade's success at that point. Finally, there's an optional note field that may provide a human-readable explanation of the signal.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. These notifications are triggered when a signal reaches a loss milestone.

You'll see these events used to keep track of how a strategy is performing and when it's potentially hitting stop-loss targets.

Each event includes important details such as the trading symbol, the name of the strategy involved, the exchange and frame being used, the full signal data, the current price at the time of the event, the specific loss level reached (e.g., 20% means a -20% loss), whether it’s a backtest or live trade, and a timestamp. 

The timestamp represents when the loss level was detected – either the moment in live trading or the candle’s timestamp during backtesting. These events are designed to be used by systems that generate performance reports or to be directly delivered to users.

## Interface PartialLossCommitNotification

This notification signals that a portion of your trading position has been closed. It provides a wealth of detail about the partial loss, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find key information like the trading pair (e.g., BTCUSDT), the strategy that triggered the action, and the percentage of the position that was closed.

The notification also includes crucial data points about the trade itself: the entry price, take profit and stop-loss levels (both original and adjusted), and the position’s direction (long or short).

Beyond the trade specifics, it offers in-depth performance metrics like total profit and loss (PNL), peak profit, maximum drawdown, and their respective price points. Detailed information is also given regarding the investment breakdown, including the number of entries, total cost, and PNL calculations, providing a full picture of how the position has performed over its lifetime. Finally, there's an optional note field for any specific reasoning behind the signal.

## Interface PartialLossCommit

This describes a partial loss event within the backtest-kit trading framework. It represents a situation where a portion of an existing position is being closed out.

The `action` property confirms that this event is a partial loss. The `percentToClose` specifies what percentage of the position will be closed. 

Along with the percentage, the event includes important data like the `currentPrice` at the time of the action, the total profit and loss (`pnl`), the highest profit (`peakProfit`), and the largest drawdown (`maxDrawdown`) experienced by the position. You'll also find details about the position itself, including its `position` (long or short), the `priceOpen`, and the originally set `priceTakeProfit` and `priceStopLoss` values, as well as their untrailed counterparts. Finally, timestamps (`scheduledAt` and `pendingAt`) record when the signal was created and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss milestone, like a 10% or 20% drawdown. It’s a way to track how a position is performing and provides detailed information about the situation.

The notification includes a unique ID, the exact time it was triggered, and whether it occurred during a backtest or live trading. You’ll find the trading pair involved, the strategy responsible, and the exchange where the trade took place.

The notification details the current price, your entry price, and the trade direction (long or short). Crucially, it lists the original and adjusted stop-loss and take-profit prices, reflecting any trailing adjustments that might have been applied.

You’ll also see information about DCA averaging, the total entries, partial closes, and the cumulative profit and loss (pnl) of the position, including peak profit and maximum drawdown figures.  It provides insight into the position's performance metrics, including percentages and prices, along with details about the number of entries made and any associated costs. An optional note can give extra context. Finally, the notification records the signal creation, pending, and creation timestamps for full traceability.

## Interface PartialEvent

This data structure holds all the key information about when your trading strategy hits certain profit or loss milestones, like reaching the 10%, 20%, or 30% mark. Each event records details like the exact time it happened, whether it's a profit or loss, the trading pair involved, and the name of the strategy used. 

You'll find information about the signal that triggered the trade, including its ID and the position taken (long or short). The data also tracks current market prices, the entry price, take profit and stop-loss levels – both the original values set when the signal was created, and the current levels. 

If you're using dollar-cost averaging (DCA), the details of the entries are included, like the total number of entries and the original open price before averaging. It also includes information about partial closing executions, unrealized profit and loss figures, a note explaining the reasoning behind the signal, and whether the test is a backtest or a live trade. This complete view helps in thoroughly analyzing and understanding your trading strategy’s performance.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, whether it's an immediate order or one that's part of a scheduled signal. It provides a wealth of information about the trade, including when it happened, the trading pair involved, the strategy that triggered it, and its performance metrics. You'll find details like the current price, profit and loss (both absolute and percentage), peak profit, maximum drawdown, and a breakdown of costs and prices. 

It also provides insight into the trade's details, such as the entry and take-profit/stop-loss prices, the number of entries and partials, and when the signal was originally scheduled. A note field allows for providing additional context or reasons behind the signal. This data allows for comprehensive analysis of the trading strategy’s behavior and performance.

## Interface OrderSyncCloseNotification

This notification alerts you when a pending trading signal has been closed, whether automatically or manually. It provides a comprehensive record of what happened, including whether the trade occurred during a backtest or live trading. You'll find details like the trading pair involved, the name of the strategy that generated the signal, and the exchange where the trade was executed.

The notification includes a lot of performance data, such as total profit/loss (PNL), peak profit achieved, and maximum drawdown experienced throughout the trade's lifespan. It also breaks down the PNL calculation with specifics like entry and exit prices.

You'll see information about the original entry, take profit, and stop-loss prices, as well as any modifications that may have occurred. If the trade involved averaging (DCA) or partial closures, the number of entries and partials is included. Finally, the notification indicates when the signal was scheduled, activated, and ultimately closed, along with a reason for the closure.

## Interface OrderSyncCheckNotification

This notification provides updates on the status of an order linked to a trading signal, primarily used during live trading but also available in backtesting. It's essentially a "heartbeat" to ensure the external order management system still recognizes the open order. These notifications are sent periodically, but are limited to one per signal every 15 minutes to prevent overwhelming the system.

The notification contains a wealth of details about the order and the related position, including:

*   **Order details:** Type of order (active or scheduled), prices (open, take profit, stop loss, and their original values before trailing adjustments), and the number of entries and partial closes executed.
*   **Performance metrics:**  Real-time profit and loss (PNL), peak profit, maximum drawdown, and related prices and percentages, all providing a snapshot of the position's performance.
*   **Signal Context:** Details about when the signal was created, when it became pending, and a human-readable note explaining the reason for the signal. 
*   **Identifiers:**  Unique IDs for the signal, the notification itself, the trading symbol, the strategy name, and the exchange used.

Essentially, this notification gives you a detailed view of an active order’s status and its performance characteristics, enabling you to monitor and troubleshoot your trading strategy.

## Interface OrderSyncBase

This describes the fundamental information shared across all order synchronization events within the backtest-kit framework. It outlines key details about an order, such as whether it's an active order (like opening or closing a position) or a resting order placed as part of a scheduled signal.

Each event provides information about the order's origin, including the trading symbol, the strategy that generated the signal, the exchange used, and whether the event originated from a backtest or live trading environment. 

You'll also find the unique identifier for the signal, its timestamp, the full signal data, and a vital retry attempt counter. This counter tracks consecutive failures and helps manage how the system attempts to execute orders, with built-in limits to prevent indefinite retries. Essentially, it’s the common ground for understanding what’s happening with an order's lifecycle.

## Interface OrderStopContract

This event signals that a trading order has reached a terminal state – meaning the backtest-kit framework has determined the order is no longer active on the exchange. It's a notification sent *once* before the framework cleans up the order details. The reason for the termination is important: "deleted" means the order couldn't be found (likely filled, canceled, or liquidated elsewhere), while "exhausted" signifies that the system encountered too many temporary failures while trying to confirm the order's status.

The event provides a wealth of information about the order and its performance including the trading pair, strategy name, exchange, timeframe, and details like entry and stop-loss prices, realized and unrealized profit/loss, and the number of DCA entries and partial closes that occurred.  Crucially, `backtest` is always false, indicating this check only happens in live trading environments. It essentially provides a snapshot of the order's history and current state before it's removed from tracking.

## Interface OrderStopCheckNotification

This notification signals a critical event regarding an order stop check—it's a heads-up about a terminal condition. Think of it as a final notification about an order, appearing just before the framework takes action to close or cancel it. This event happens rarely and only during live trading.

The notification tells you *why* the check ended. It’s either because the order simply couldn’t be found ("deleted") or because the framework tried to re-check it too many times ("exhausted").

You'll receive this notification alongside a lot of information about the order and the trading position it represents, including details such as the trading pair, strategy name, exchange, order type ("active" or "schedule"), and key price points (original and adjusted). It includes profit and loss metrics, like peak profit and maximum drawdown. The `scheduledAt` and `pendingAt` properties indicate when the signal was originally created and when the position became active. Finally, a human-readable `note` field provides additional context if it exists.

## Interface OrderRejectOpenNotification

This notification signals that an order placement failed definitively – meaning the exchange rejected it and retrying isn't helpful. It's a terminal rejection, not a temporary hiccup.

It provides a lot of detail about *why* the order was rejected, including the exchange's message and the signal's unique identifier. You'll find information like the strategy name, trading pair, signal creation time, and the current market price at the time of rejection.

Beyond the immediate rejection, it also offers a snapshot of the position's performance up until that point: the P&L, peak profit achieved, and maximum drawdown.

It includes details on the order itself – whether it was for opening or scheduling a position – along with how many attempts were made before the rejection.  Because these rejections only happen live, the `backtest` property will always be false. The notification's structure gives a full picture of what went wrong and how the position would have performed.

## Interface OrderRejectOpenContract

This describes a situation where an attempt to open a position or schedule a trade was completely rejected. It means the trading system couldn’t fulfill the order, and the associated signal is no longer available.

The `action` property tells you specifically which type of action was rejected – either a new position being opened or a scheduled trade entry.

The `cost` property represents the total cost associated with the rejected position or entry.

## Interface OrderRejectCloseNotification

This notification alerts you when a trading position close is rejected by the broker – meaning the system tried to close it, but something prevented it. It only happens when a close attempt fails outright, usually due to a broker adapter error. You won't see these notifications for temporary issues; only for confirmed rejections. This is a live-only event, meaning it won't occur during backtesting.

The notification provides a lot of detailed information, including:

*   A unique ID for the notification and the rejected signal
*   A timestamp of when the rejection occurred
*   The strategy and exchange involved
*   The reason for the rejection, described in a human-readable message.

You’ll also find a snapshot of the position's performance, including profit/loss, peak profit, and maximum drawdown, alongside various price points and entry/exit details. Details about the order type, number of attempts, and even original order settings (take profit, stop loss, entry price) are included. Finally, the notification includes information on signal scheduling, activation timestamps, the close reason, and any additional notes provided.

## Interface OrderRejectCloseContract

When a trading strategy attempts to close a position, but the system absolutely cannot fulfill that request, this `OrderRejectCloseContract` is used to signal that rejection. It's a definitive "no" to the close order, meaning the strategy's state is forcibly closed using the original reason for wanting to close in the first place. 

This rejection always indicates that the action taken was a "signal-close".

The `closeReason` property provides the specific explanation for why the close order was refused.


## Interface OrderRejectBase

This document describes what happens when an order is definitively rejected by an exchange – a situation where retrying won't help. It's a signal that something went wrong with the order placement process itself, not just a temporary hiccup.

These rejection events are only sent in live trading environments; they don't occur during backtesting.  The `OrderRejectBase` provides detailed information about the rejected order, including what type of order (active or scheduled), the trading symbol, strategy name, exchange, timeframe, signal ID, timestamp, and the entire signal data.

You'll also find useful information like the number of previous failed attempts, the current market price at the time of rejection, profit and loss snapshots (PNL, peak profit, drawdown), trade direction, and original and adjusted prices for take profit and stop loss. A human-readable explanation of the rejection reason is also provided in the `message` field.  Finally, it contains details about the scheduled time, pending time, total entries, partials and overall position information.

## Interface OrderOpenContract

This event, `OrderOpenContract`, signifies that a limit order has been filled and a trading position has been opened. Think of it as confirmation that your order to buy or sell at a specific price was accepted and executed by the exchange.

It's particularly useful for synchronizing external systems, like order management tools or audit logs, to ensure everything aligns with what's happening on the exchange.

The event provides a wealth of information about the trade, including the price at which the order was filled, the direction of the trade (long or short), and performance metrics like profit and loss (pnl), peak profit, and maximum drawdown.

You'll also find details about the original order parameters like take profit and stop loss prices, as well as information about the order’s scheduling and any averaging or partial closures that may have occurred. The `totalEntries` and `totalPartials` properties specifically track how many times you averaged into the position or closed parts of it.

## Interface OrderFillOpenNotification

This notification confirms that a trade has been successfully opened or placed by the system – it's a signal that the exchange actually executed your order.  It's only sent for live trades, never in backtesting environments. This message arrives *after* the initial order confirmation, guaranteeing the trade is real.

The notification includes detailed information about the trade, such as the symbol, strategy name, exchange, and a unique ID for the signal that triggered it. You'll find details about the order type (whether it was a filled position order or a resting order), the number of attempts it took to confirm, and the market price at the time.

Beyond the basics, you also get performance metrics for the position: current P&L, peak profit, maximum drawdown, and associated prices and costs.  It outlines the entry and exit prices used for P&L calculations, along with the total number of entries and partial closes.

Finally, there's helpful metadata like the scheduling and pending timestamps, a note field for describing the trade's rationale, and the creation timestamp of the notification itself. The original entry and take profit/stop loss prices, before any adjustments, are also available.

## Interface OrderFillOpenContract

This describes a confirmation that an order to either open a new position or place a pending order has been fulfilled by your broker. It's a notification you receive after an action is taken – either the position is actively open, or a pending order has been submitted to the market.

The `action` property tells you exactly what happened: it's either a "signal-open" (meaning the position is now active) or a "schedule" (meaning a pending order has been placed).

The `cost` property simply represents the total expense associated with the trade, which can include things like commissions and the initial investment.

## Interface OrderFillCloseNotification

This notification confirms a trading position has definitively closed on the exchange – it's the final confirmation that your exit order was filled. It only appears when the closing process is fully completed and verified, unlike other close notifications. 

It provides a wealth of information about the trade, including details like the trading symbol, the strategy that initiated it, and a unique ID for the signal. You'll see key performance indicators like peak profit, maximum drawdown, and overall profit/loss, along with the entry and exit prices.

The notification also tracks things like the number of attempts it took to close the position, the current market price at the time of closure, and any adjustments made to the original take profit or stop-loss orders. It even provides details on any DCA (dollar-cost averaging) or partial closing strategies used. This notification is exclusively available for live trading and offers a comprehensive snapshot of the trade’s lifecycle and financial outcome.

## Interface OrderFillCloseContract

This interface represents when a trading position is closed, confirming that the exit order has been executed by the broker. It signifies a completed transaction, whether triggered by a take-profit, stop-loss, time expiry, or a manual close order. 

The `action` property always indicates "signal-close" to specifically identify this as a closing event. 

The `closeReason` tells you *why* the position was closed – was it due to a profit target, a loss limit, the end of a set time, or a deliberate action?

## Interface OrderFillBase

Order fills represent confirmed executions of trades, acting as a reliable record of what actually happened in the market, not just attempts. These events are generated *only* after the system has verified that the broker has acknowledged the order's placement – it’s a definitive signal, not a tentative one. You won't see order fill events during backtesting or when orders are rejected or transiently fail.

The `type` property clarifies whether the order was an active trade (opening, closing) or a scheduled entry placed when a signal was initially created. The `symbol`, `strategyName`, and `exchangeName` tell you exactly which asset, strategy, and exchange were involved.

Key information about the trade is included: the signal's identifier (`signalId`), the confirmation timestamp (`timestamp`), the complete signal details (`signal`), and how many prior attempts to place the order failed (`attempt`).  Performance metrics such as profit (`pnl`), peak profit, and maximum drawdown are also provided.

Details about the order's execution, like the trade direction (`position`), entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop-loss (`priceStopLoss`) prices, are also recorded, alongside their original values before any adjustments were made. Finally, timestamps tracking when the signal was created (`scheduledAt`) and the position was activated (`pendingAt`), as well as details about the number of entries and partial closes (`totalEntries`, `totalPartials`) are included.

## Interface OrderContinueContract

This event signals that the framework is still monitoring an order on an exchange, rather than declaring it definitively resolved. It acts as a follow-up to an initial order check, confirming that the order remains open and under observation. You'll see these events while a trading signal is active, providing details like the order type ("active" for open positions, "schedule" for pending entry orders), the trading pair, the strategy involved, and critical metrics about the position, such as P&L, peak profit, drawdown, entry and stop-loss prices, and the number of entries or partial closes. Importantly, the `attempt` value indicates the number of recent, temporary check failures that have been tolerated – a higher number means the framework continues to assume the order is still valid, but too many failures will eventually trigger a different event. This is purely a live feature, and isn’t used during backtesting.

## Interface OrderContinueCheckNotification

This notification lets you know about the ongoing health check of an order, like a "heartbeat" to confirm it's still valid. It’s sent when the check isn’t immediately failing, meaning the order is either still active or experiencing a temporary problem that's being tolerated—the system continues to monitor it. This notification carries the decision reached during that check, instead of just requesting a check.  The system limits how often these notifications are sent for each signal to prevent overload.

Here's a breakdown of what the notification contains:

*   **Unique Identifiers:** It provides a unique ID for the notification, a timestamp, and the signal's ID.
*   **Order Details:**  You'll find information like the trading pair, the strategy that created the signal, the exchange used, and the order type (active order or scheduled order).
*   **Check Status:**  The `attempt` field indicates if this is a retry attempt after a temporary failure.
*   **Price Information:** Includes the current market price, entry price, take profit, stop loss, and original prices before any adjustments.
*   **Position Metrics:** Key performance indicators like PNL (profit and loss), peak profit, and maximum drawdown with associated price and cost data, as well as total entries and partial closes.
*   **Timing Information:**  The `scheduledAt` and `pendingAt` timestamps mark when the signal was created and when the position became active.
*   **Optional Notes:**  A human-readable `note` field might provide a reason or description for the signal.

## Interface OrderCloseContract

This event signals that a trading signal has been closed, whether due to hitting a profit target, a stop-loss trigger, time expiration, or manual intervention. It's designed to help external systems, like order management or auditing tools, stay in sync with the trading framework.

The event provides a wealth of information about the closed position, including the current market price at the time of closure, the total profit and loss (PNL), and the peak profit and maximum drawdown experienced. You'll also find details about the original and effective prices for entry, take profit, and stop-loss, along with timestamps for when the signal was created and the position activated.

Furthermore, the event specifies the trade direction (long or short) and the reason for the closure. It also includes data about any DCA averaging done, showing the total number of entries and partials that were executed. This comprehensive information allows for detailed record-keeping and reconciliation of trading activity.

## Interface OrderCheckContract

This event, called `OrderCheckContract`, is a signal the framework sends to let you know it's checking if an order related to a signal is still active on the exchange. It happens while signals are being monitored, *before* the framework decides what to do about them.

Think of it as a quick verification to make sure the order you expected to be placed is actually still there.

There are two types of checks: one for open positions ("active") and one for pending orders ("schedule").  You need to respond to these checks by confirming the order is still open (allowing the framework to keep monitoring) or by telling the framework the order is gone, triggering actions like canceling a scheduled order or closing an existing position.

If the framework can’t confirm the order’s status (due to network issues, for example), it will retry a few times before assuming the order is gone.  However, you can configure how aggressively it retries – a quick failure will be considered terminal.

Crucially, backtests don't generate these `OrderCheckContract` events because there's no real exchange to communicate with.

The event provides a wealth of information about the signal and associated trade, including details like the trading pair, strategy name, current price, realized and potential profit/loss, entry and stop-loss prices, and how many times the signal has been adjusted or partially closed. This helps you understand the context of the order check and make informed decisions.


## Interface MetricStats

This object neatly summarizes the performance of a specific metric within your backtest. It contains key figures like the total number of times the metric was recorded, and how long it took on average. You’ll find information about the fastest and slowest instances, plus a measure of how spread out the durations were (standard deviation and percentiles like 95th and 99th).

It also provides details about the time spent waiting between events related to the metric, offering a broader picture of its behavior. Each property gives you a different perspective on the metric's performance, letting you pinpoint areas for potential optimization.

## Interface MessageModel

This describes a single message within a chat conversation, like you’d see when interacting with a large language model. Each message has a `role`, which tells us who sent it – whether it's a system instruction, a user's question, the model’s response, or the result of a tool being used.

The `content` property holds the actual text of the message. Sometimes, a message from the assistant might not have text content, but still includes information about tools it’s using.

For certain models, there's a `reasoning_content` field, which provides insight into the model’s thought process.

If the assistant used any tools, the `tool_calls` property lists those interactions with details about each tool used.

You can also include images within a message, represented as Blobs, raw bytes, or base64 encoded strings.

Finally, if a message is a response to a specific tool call, the `tool_call_id` identifies which tool call it relates to.

## Interface MaxDrawdownStatisticsModel

This model holds the results of a maximum drawdown analysis. 

It contains a detailed list of drawdown events, presented in chronological order with the most recent ones appearing first. 

Alongside this list, it also provides a count of all the drawdown events that were recorded during the analysis. Essentially, it gives you both the specifics of each drawdown and the overall number of times a drawdown occurred.

## Interface MaxDrawdownEvent

This object represents a single instance where a maximum drawdown occurred for a trading position. It provides detailed information about the circumstances surrounding that drawdown event. 

You'll find details like the exact time (timestamp) and the trading symbol involved, as well as the name of the strategy and signal that triggered the position. It also captures whether the position was a long or short trade.

Crucially, it includes the cumulative profit and loss (PNL) for the position, the highest profit ever reached during the position's lifetime (peak profit), and the depth of the maximum drawdown itself. The price at which the drawdown occurred, along with the entry price, take profit level, and stop-loss price, are all recorded. Finally, a flag indicates whether the event occurred during a backtest.

## Interface MaxDrawdownContract

The MaxDrawdownContract provides information when a new maximum drawdown is reached for a trading position. It's a way for the framework to notify you when a position has lost a significant portion of its value from its peak.

Each update includes details like the trading symbol, current price, the exact time of the update, and the names of the strategy, exchange, and timeframe used. You also get the signal data related to the position.

A crucial piece of information is whether the drawdown event happened during a backtest or in live trading. 

This contract helps you build systems to react to drawdown events – for example, automatically adjusting stop-loss orders or refining risk management strategies.

## Interface LiveStatisticsModel

This model provides a detailed breakdown of your trading performance based on live results. It gathers information from every event – from initial setup to closing a trade – and calculates a wide range of statistics to help you understand what's working and where you might need to adjust your strategy.

You'll find counts of total events, closed signals, wins, and losses, which form the basis for key metrics like win rate and average profit per trade. It goes beyond simple profit and loss by calculating volatility measures (standard deviation), risk-adjusted return ratios (Sharpe, Sortino, and Calmar), and expectancy – all designed to give you a holistic picture of your performance.

Beyond the typical metrics, it also analyzes trade duration, consecutive win/loss streaks, and the behavior of price movements during trades (buyer/seller pressure and strength). Finally, trend analysis attempts to determine if the market is trending bullish, bearish, sideways, or neutral, along with the strength and reliability of that assessment. Keep in mind that many of these values will be null if the calculations are unreliable, ensuring you’re only working with sound data.

## Interface InfoErrorNotification

This component handles notifications about errors that happen while things are running in the background. These aren't critical errors that will stop everything, but something went wrong that you should be aware of. 

Each notification has a unique identifier so you can track them. It also includes a detailed error message to help you understand what happened, along with the full stack trace and any extra information related to the problem.

Importantly, these notifications are specifically for situations occurring outside of the main backtesting process – they’re linked to the live context, so the `backtest` property will always be false.

## Interface IdlePingContract

This contract represents events that occur when a trading strategy isn't actively making decisions—essentially, when it’s “idle.” It signals that no trades are pending or scheduled.

You can think of it as a heartbeat, letting you know the strategy is still running and observing market conditions, but not actively trading.

The event includes details like the trading symbol, strategy name, exchange, whether it's a backtest or live execution, the current price, and a timestamp.

The timestamp's meaning differs slightly between live trading (the exact time of the ping) and backtesting (the time of the candle being analyzed).

It allows you to monitor the lifecycle and status of strategies even when they're not actively trading. You can use provided functions to react to these idle ping events.

## Interface IWarmCandlesParams

This interface defines the settings you provide to pre-load historical candle data, a process sometimes called "warming up" your data. 

It lets you specify exactly which trading pair (like BTCUSDT), exchange, and timeframe (like 1-minute candles or 4-hour candles) you want to fetch. 

You also set the start and end dates to control the historical data range that gets downloaded and stored for later use, typically before starting a backtest. Essentially, it's how you tell the system which candles to grab and where to put them for efficient backtesting.


## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy during a backtest. 

It bundles together essential information about the strategy itself – its name – alongside its performance statistics, which are detailed in the `BacktestStatisticsModel`. 

You’ll also find a key metric value used to compare the strategy against others, and a rank indicating its overall position in the comparison. Essentially, it's a convenient container for evaluating how well a particular strategy performed.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests to compare different trading strategies. 

Think of it as a blueprint for running experiments on your strategies. 

You’ll give it a unique name and a brief note for your own reference. 

It specifies which exchange and timeframe you want to use for the backtest, and most importantly, lists the strategies you want to compare against each other.

You can also choose a specific metric, like Sharpe Ratio, to optimize for during the testing. 

Finally, you have the option to add custom functions that will be triggered at various points during the backtesting process to further refine the experiments.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered when a backtest walker finishes comparing different trading strategies. It essentially provides a summary of the entire backtesting process for a particular asset. 

You'll find key details like the trading symbol being tested, the exchange the data came from, the name of the specific walker that ran the tests, and the timeframe (like 1 minute or 1 day) used for the backtests. Think of it as a report card for a backtesting run.


## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtest process when comparing multiple strategies. You can define functions to be notified when a particular strategy begins testing (`onStrategyStart`), when a strategy's backtest finishes successfully (`onStrategyComplete`), or when an error occurs during a strategy’s backtest (`onStrategyError`). Finally, you'll receive a notification (`onComplete`) once all strategies have been run, along with the overall results of the comparison. These callbacks provide a way to monitor progress, log key metrics, or handle errors during the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface describes a queued action for a trailing take commit, which is a key part of managing your trading strategy's profit-taking process. It essentially represents a command to adjust a trailing stop-loss based on price movements.

The `action` property confirms that this is a trailing take action. The `percentShift` tells you how much the price needs to move before the trailing stop is adjusted. Finally, `currentPrice` records the price level at which the trailing mechanism was initially activated.

## Interface ITrailingStopCommitRow

This describes a queued action related to a trailing stop order. Think of it as a record of a change that needs to be applied to your trading strategy.

It contains three key pieces of information: the type of action being performed, which is specifically a "trailing-stop" adjustment; the percentage shift that's being implemented, represented as a numerical value; and the current price of the asset when the trailing stop was initially set. This helps ensure the trailing stop is correctly managed based on the asset's price history.

## Interface ISweepTrade

The `ISweepTrade` interface describes a single trading event within the backtest kit. Each trade is linked to an original idea through its `ideaId` and identifies the author who created that idea. The `symbol` specifies the trading pair involved, while the `direction` indicates whether it was a long or short position.

You can track when a trade started (`entryTimestamp`) and closed (`exitTimestamp`), and understand the reason for its closure (`exitReason`). The `holdMinutesActual` property shows exactly how long the trade lasted. 

The `pnlPercent` tells you the trade’s profit or loss as a percentage, considering all fees. Finally, the `absorbedIdeas` array details any other trading ideas that were held back by this trade, allowing you to see precisely which signals influenced the outcome.

## Interface ISweepTrack

This data structure represents a single author's performance under a specific trading rule, providing a continuous record of their results. It encapsulates all the details of that rule—how long a position is held, the lock and stop percentages, and the trailing take percentage—along with the author’s login.

The record includes the total number of ideas the author generated, the number of times those ideas resulted in a profitable outcome (hits), and the hit rate, which is simply the number of hits divided by the number of ideas.

Critically, it avoids arbitrary cutoffs or "banned" flags.  Instead, it presents a complete, continuous record of performance, allowing users to decide their own level of trust based on these raw numbers. The inclusion of all these parameters is essential because even small changes in any of them—holding time, lock, stop, or trailing—can dramatically alter an author's hit rate.  Each line of data is self-contained and designed to be easily searched and analyzed.

## Interface ISweepSchema

This defines the structure for registering a sweep, which is essentially a configuration for backtesting. Each sweep needs a unique name to identify it within the system.

It also specifies the exchange to pull historical market data from – be aware that the data source is precise and any interruption will cause issues.

You can customize how the grid axes (profit targets, stop losses, etc.) behave, overriding the framework’s defaults. This allows you to freeze specific axes to maintain consistency.

The `reportOrder` field determines how the results of the sweep are ranked, defaulting to Sharpe Ratio and using a special sorting method to avoid issues with extremely large values. 

Finally, you can define optional callbacks to be triggered at various points in the sweep’s lifecycle, such as when certain rules are applied. Remember these callbacks are independent of the main sweep execution.


## Interface ISweepResult

The `ISweepResult` object holds the final outcome of a backtesting simulation. It summarizes key statistics like the trading symbol involved and how many ideas (both neutral and directional) were processed. You'll also find information on how many idea profiles were created and how many were cut short due to data limitations.

It includes data about trade holding times, showing not only the average but also the 95th and 99th percentile – giving a sense of how long trades tended to last.

Most importantly, it bundles a comprehensive report (`ISweepMetricReport`) detailing the performance of each grid point based on a profit-before-stop metric, along with rankings of the best performing points and how individual authors contributed to the results. This allows for detailed analysis of the simulation’s performance.

## Interface ISweepPointReport

This report summarizes the performance of a single grid point within a trading strategy backtest. It provides a detailed view of how trades performed at that specific point, encompassing profitability, risk metrics, and holding times.

The report includes key performance indicators like total and average profit percentages, win rate, and profit factor to assess overall profitability. It also reveals how much risk was taken, indicated by metrics like maximum drawdown and ratios like Calmar and Recovery Factor which assess annualized return against drawdown. 

You'll find information about typical trade durations, including the 95th and 99th percentiles of holding times, offering insights into how long positions were held. The Sharpe and Sortino ratios provide a time-weighted assessment of risk-adjusted returns.

Finally, it breaks down the reasons why trades were exited and includes a complete list of all trades executed at that point. This allows you to trace the reasoning behind each trade's profit and loss. This comprehensive detail allows you to understand exactly *why* a particular point performed as it did.


## Interface ISweepParams

The `ISweepParams` object holds all the settings needed to run a sweep, essentially combining the parameters you provide with some automatically added configurations. It includes a `logger` which lets you see debugging information during the sweep process. You'll also find `gridAxes`, which defines how the sweep explores different combinations of settings, and `reportOrder`, which dictates how the results are sorted and presented. These parameters are all crucial for controlling and understanding how the sweep is executed and the insights you gain from it.

## Interface ISweepMetricReport

This report represents a single bucket of results from a backtesting run, essentially a snapshot of performance. It collects data for each grid point, focusing on how well it performed based on a single metric – profit before stop. 

The report lists all the grid points, ranked according to their performance.
It identifies the top performers across several ranking criteria, highlighting the best overall combinations.
Finally, it provides a summary of the rule combinations used, capturing key details like hold, lock, stop, and trailing settings, along with the author who created them. This detailed tracking allows for deeper analysis of what strategies are proving successful.

## Interface ISweepIdeaProfile

This data structure represents the performance of a single trading idea over a specific time period. Think of it as a detailed record of how an idea played out, from its initial entry point to its eventual outcome. 

It includes information like the entry price, a sequence of historical candle data forming the trajectory, and a flag indicating whether the idea ultimately made money. You'll also find key metrics summarizing the idea’s performance, such as the maximum favorable and adverse price movements, the timing of those movements, and a measure of how the price generally behaved relative to the entry point. These metrics are calculated over the entire observation window and provide a broad view of the idea's behavior – the grading process focuses on the raw price action within the idea's hold period.

## Interface ISweepIdea

This describes a single trading idea – essentially, a public forecast made by someone. Think of it as a single prediction about a specific trading pair, like BTCUSD. Each idea has a unique ID, the date and time it was published, and the symbol it relates to. 

It also tells you which way the author thinks the price will move (up or down), and the author’s username on the platform where the idea was originally posted. Importantly, when running simulations, the process works on these complete ideas, rather than individual grid points.

## Interface ISweepGridPoint

This describes a single point within a grid used for trading strategies. 

Each point defines specific risk management parameters. 

You'll find settings here to control how long a position is held (in minutes), how much price can move against you before a stop loss triggers (hard stop), and how a trailing stop loss adjusts as the price moves favorably. There's also an option to lock in profits at a certain price level and exit if the price retraces. Finally, it manages how the take profit adjusts based on the highest price reached.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines the ranges of values that will be tested for key trading parameters like stop loss, profit taking, hold time, and profit locks. Think of it as specifying the boundaries within which the backtest will explore different trading strategies.

Each property—`hardStopPercent`, `trailingTakePercent`, `holdMinutes`, and `profitLockPercent`—represents a different setting you can adjust and experiment with.  Each also details when a particular setting will be ignored during the backtest.

`hardStopPercent` defines the maximum loss you're willing to tolerate on a trade, expressed as a percentage from the entry price. This setting significantly impacts risk management and is always actively checked.

`trailingTakePercent` controls how much of a gain a trade can give back before being considered a loss. This relates to managing runners and letting profits grow while mitigating some risk. It's only used when the trade has already achieved a certain level of profitability.

`holdMinutes` specifies the maximum time a trade can stay open. This impacts how frequently trades are executed and is a core factor in determining a trade's overall performance and grading.

`profitLockPercent` establishes a floor level that, when touched, locks in a portion of the profit.  The trade continues to run until the price pulls back to that level, offering a way to capture liquidity while protecting against immediate losses. Like the hard stop, this is part of the grading rule.

## Interface ISweepCallbacks

This interface provides a way to track the progress and key events of a backtesting simulation. It allows you to receive updates on what's happening behind the scenes, similar to seeing the progress messages printed to the console.

You'll receive notifications about the progress of long-running stages like profile creation or grid evaluation, with details on how many items have been processed and the total number to be processed. 

The callbacks also alert you when the system has gathered all the ideas and profiles, and when author tracks have been trained, giving you insights into the data being used.  

Each time a grid point is evaluated, a notification is sent, alongside any trades associated with that point. You'll also get ranked reports and the overall best result when computations are complete. Finally, a `onDone` callback signals the completion of the entire simulation, providing the final result.

## Interface ISweepBest

The `ISweepBest` interface represents the top result for a specific ranking criterion during a sweep. It contains just the criterion itself and a reference to the complete report associated with that winning point. 

You'll find all the details about the trades executed and other tracking information within the `report` object. 

Importantly, the actual trades aren't duplicated here – they're kept within the report's `tradesList`. Similarly, author track data is handled separately within the bucket’s tracks. This design ensures that information isn't needlessly repeated.


## Interface ISweepAbsorbedIdea

This represents an idea that couldn't be acted upon because the author already had a trade open. Think of it as a signal that was "swallowed" by a previous trade. 

It's useful for understanding why certain signals weren't executed.

The key thing is that it links back to the author who holds the open trade – this connection simplifies analysis because you can directly access the author's data without needing to combine information from different sources. It holds both the idea's ID and the author’s identifier for easy and direct access.

## Interface ISweep

The `ISweep` interface provides a way to execute a complete sweep analysis for a particular trading symbol. Think of it as the main entry point to running the entire process.

You provide the symbol you want to analyze and a list of `ISweepIdea` objects, which represent the different strategies or parameter sets you want to test. The `run` method then orchestrates a sequence of steps – starting with profiling strategies, applying author filters, evaluating them against a grid of conditions, and ultimately ranking the results. This gives you a comprehensive view of how different approaches perform. The result of this process is an `ISweepResult` containing all the detailed findings.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` interface represents a specific event within the trading framework, indicating that a signal has been scheduled and is currently awaiting the price to reach its entry point. This isn't the initial creation of the signal; it's a recurring update while the system monitors for activation.

The interface provides details about the waiting signal, including the signal itself and the current price being monitored. It also includes context information like the strategy and exchange names, the timeframe being used, and the trading symbol.

Progress indicators like `percentTp` (take profit) and `percentSl` (stop loss) are always zero in this state, as the position isn't yet active.  You’ll also find unrealized profit and loss data for the theoretical position, as well as flags indicating whether the event originates from a backtest or live trading environment, and a timestamp marking when the result was generated. This information helps track the signal's journey and provides a snapshot of its potential impact.


## Interface IStrategyTickResultScheduled

This interface describes a specific type of event within the backtest-kit framework – a scheduled signal. It happens when a trading strategy generates a signal that's waiting for the price to reach a particular entry point. 

Think of it as the system saying, "Okay, I have a signal, and I'm keeping an eye on the price to see if it moves into the zone we're targeting."

The data attached to this event includes all the important details about the signal: what strategy generated it, which exchange it's related to, the trading pair, the current price at the time the signal was scheduled, and whether it's part of a backtest or live trading. It also provides a timestamp indicating when this scheduled signal was created. You can use this information to understand exactly when and why a strategy decided to wait for a certain price level.


## Interface IStrategyTickResultOpened

This data represents a signal that has just been created and is now active. It's a notification that a new trading signal has been validated, saved, and is ready to be acted upon. 

The information includes the signal itself, along with details about where and when it was generated, such as the strategy name, the exchange, and the timeframe being used. You'll also see the current price at the time the signal opened, and whether this event occurred during a backtest or in a live trading environment. This allows you to easily monitor and analyze the signals that are being generated by your trading strategies.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an "idle" state - meaning no active trading signal is present. It essentially provides information about the conditions at the moment the strategy went idle.

You’ll find details like the strategy's name, the exchange it's connected to, the timeframe being used, and the trading symbol involved. 

The current price is also recorded, along with whether the data is coming from a backtest or a live trading environment. Finally, a timestamp marks precisely when this idle state began. It’s a snapshot of the market conditions and strategy context during a period of inactivity.

## Interface IStrategyTickResultClosed

This interface represents the final result when a trading signal is closed, providing a wealth of information about what happened. It tells you why the signal closed - whether it was due to a time limit, hitting a profit or loss target, or a manual closure.

You'll find details like the closing price, the exact time of closure, and crucially, a breakdown of the profit and loss, including fees and slippage. 

It also includes important identifiers like the strategy name, exchange, timeframe, and trading symbol, allowing you to track and analyze performance. A flag indicates if the event occurred during a backtest or in a live trading environment. If the closure was user-initiated, a unique close ID is provided, and a creation timestamp records when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes the result when a scheduled trading signal is cancelled before a trade is executed. This might happen if the signal’s conditions aren’t met or a stop-loss is triggered before a position can be opened.

The `action` property clearly indicates that the result is a cancellation. 

You'll also find details about the signal that was cancelled, including the `signal` itself, as well as the `currentPrice` at the time of cancellation.

The result includes timestamp information – `closeTimestamp` for when the signal cancelled, `createdAt` for when the result was generated – and tracking information like the `strategyName`, `exchangeName`, `frameName`, and `symbol` involved. 

A `reason` property explains why the cancellation occurred. You can optionally track cancellation IDs with `cancelId`, which are helpful when programmatically cancelling signals. Finally, a `backtest` flag lets you distinguish between backtesting and live trading scenarios.

## Interface IStrategyTickResultActive

This interface describes the data you receive when a trading strategy is actively monitoring a signal, awaiting either a take profit (TP), stop loss (SL), or time expiration. It contains information about the current signal being tracked, including the symbol being traded, the timeframe, and the strategy and exchange involved. 

You'll also find details about the current price used for monitoring, the progress towards take profit and stop loss targets (expressed as percentages), and the unrealized profit and loss (PNL) of the position. It indicates whether the data originates from a backtest or live trading environment and provides timestamps for tracking when the event occurred and when the last candle was processed during backtesting. Essentially, it's a snapshot of an active trading situation.

## Interface IStrategySchema

This defines the structure for strategies you register within the backtest-kit framework. Each strategy has a unique identifier, and you can add a note for documentation purposes.

You specify the minimum time interval between signal generation calls to control the frequency of signals.

The core of a strategy is the `getSignal` function, which calculates a signal based on the symbol, current date/time, and price.  It can generate signals immediately or schedule them based on an entry price.

You can also include optional callbacks to be triggered at specific points like when a position is opened or closed.  

Furthermore, you can assign risk profiles to your strategy, allowing for risk management considerations.  It also supports multiple risk profiles if needed.

Finally, you can associate action identifiers with a strategy, and provide runtime data for custom monitoring or external integrations.

## Interface IStrategyResult

This object holds the results of a single trading strategy after a backtest. It essentially provides a row in a comparison table. You'll find the strategy's name clearly identified, alongside a detailed breakdown of its performance statistics—everything from profit/loss to win rate.  It also includes a key metric value used for ranking strategies, which might be null if the results are invalid. Finally, it records the timestamps representing when the strategy started generating signals and when it last produced a signal, if any signals were generated at all.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the outcome of a trading strategy's performance in terms of profit and loss. It breaks down the details, including how much you've gained or lost as a percentage of your initial investment.

You’ll find the entry price and exit price, but these aren't raw numbers – they've been adjusted to account for realistic trading factors like fees (0.1%) and slippage (0.1%).

The `pnlCost` tells you the actual dollar amount you've made or lost.  It’s calculated using the percentage change and the total amount you invested. Finally, `pnlEntries` simply tracks the total amount of capital you initially put into the trades.

## Interface IStrategyCallbacks

This interface lets you define callbacks that are triggered at different points in a trading strategy’s lifecycle. Think of these as notification hooks you can use to monitor or react to what's happening.

You'll receive a `onTick` notification for every price update, giving you ongoing information about the market.

Other callbacks, like `onOpen`, `onActive`, and `onClose`, are triggered when a signal is initially opened, becomes actively monitored, or is ultimately closed.  `onIdle` tells you when no signals are active.

For signals entered on a schedule (delayed entry), `onSchedule` is called when the signal is created, and `onCancel` when a scheduled signal is cancelled.  

The `onWrite` callback is specifically used to record signal information during backtesting or testing scenarios.

Finally, several callbacks (`onPartialProfit`, `onPartialLoss`, `onBreakeven`) alert you to specific profit/loss states within a signal, and `onSchedulePing` and `onActivePing` allow you to perform custom, very frequent checks on scheduled or active signals respectively.

## Interface IStrategy

The `IStrategy` interface defines the core functionality for trading strategies within the backtest framework. It provides methods for handling ticks, retrieving signal information, checking conditions (breakeven, paused, stopped), managing positions (partial profits/losses, average buys), and performing backtesting and simulations.

The `tick` method is the main entry point for processing each price update, while `getPendingSignal` and `getScheduledSignal` allow access to signal data. Methods like `getBreakeven`, `getStopped`, and `getPaused` provide insights into the current state of the strategy. 

Position management includes functions like `partialProfit`, `averageBuy`, and `trailingStop` to fine-tune positions. The framework provides comprehensive data regarding position metrics, including profit, loss, entry prices, and time-based statistics. The `dispose` method ensures proper cleanup when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality needed for any storage adapter used within the backtest-kit trading framework. Think of it as a contract that ensures different storage solutions (like databases or files) can all interact with the backtesting process in a consistent way. 

It includes methods for responding to different signal events—when a position is opened, closed, scheduled, or cancelled. 

You'll also find methods to retrieve signals, allowing you to locate a specific signal by its ID or list all signals that are currently stored. 

Finally, there are specialized methods for handling "ping" events related to signals that are actively open or scheduled, enabling the system to keep track of their status and update their timestamps.

## Interface IStorageSignalRowScheduled

This interface describes a signal row that has been scheduled for execution. 

It indicates the signal is in a "scheduled" state, meaning it's waiting to be triggered.

The `currentPrice` property stores the VWAP price that was in effect when the signal was scheduled; this is the same price you'd find in a `StrategyTickResultScheduled` object. This price is important for accurately calculating trade execution details later.

## Interface IStorageSignalRowOpened

This interface describes a signal event when a trading strategy initiates a position. It essentially marks the beginning of a trade.

The `status` property confirms the signal is in an "opened" state, indicating a trade has started.

The `currentPrice` property stores the VWAP price at the moment the signal triggered the trade, allowing you to track the entry price for analysis and performance evaluation. Think of it as a record of where the trade began.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning it's no longer active. It contains important information about the signal's performance and how it was closed. 

Specifically, you'll find data related to the profit and loss (PNL) generated by the signal, the price at which it closed, and the reason for its closure.  The timestamp tells you exactly when the signal was closed. Think of it as a record of a completed trading opportunity. It's linked to data found in `IStrategyTickResultClosed`, ensuring consistency in the information reported.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to mark a signal as no longer active or valid.  The key property here is `status`, which is always set to "cancelled" to clearly indicate the signal's state. Think of it as a flag to show that something previously tracked is now disregarded.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored, ensuring consistency across different types of signals. It includes the timestamps of when the signal was created and last updated, which are pulled from the results of strategy execution. There's also a priority field, used to manage the order in which signals are processed – it essentially uses the current time to guarantee a fresh ordering. This foundational structure helps maintain data integrity and simplifies how signals are handled within the backtest kit.

## Interface IStateParams

`IStateParams` helps you organize and manage the initial settings for signals that hold data. Think of it as a way to define where your signal's data lives within a larger system, using `bucketName` to create a logical folder for related signals. It also lets you set a `initialValue` which acts as the starting point for the signal's data when it's first created and doesn't yet have any stored information. This is useful for ensuring your signals always have a defined starting point.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data that changes over time, specifically for automated trading strategies. Think of it as a place to store and update information about a trade as it progresses, like how much profit it's made, how long it's been open, and when to potentially exit.

This interface is designed to be flexible, allowing you to track metrics relevant to your specific trading approach—for example, tracking peak unrealized profit or the time since the trade was entered. 

Here's a breakdown of what it lets you do:

*   **Initialization:** You can signal when the state is ready.
*   **Reading the State:** You can retrieve the state's current value at a specific point in time.  The system prevents looking ahead – it won't return future state data.
*   **Updating the State:** This is the core function - it allows you to modify the data associated with a trade. Importantly, it handles situations where a backtest restarts, preventing conflicts with previously written data.  The update process also safeguards against look-ahead bias.
*   **Cleanup:** You can release any resources the state instance is using when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion. It's designed to help determine how much of your capital to allocate to each trade. 

The `method` property simply identifies this as a Kelly Criterion sizing approach.

The `kellyMultiplier` property controls the aggressiveness of the sizing.  A value of 0.25 (the default) represents a "quarter Kelly," a more conservative approach that limits potential losses. Higher values, closer to 1, would be more aggressive but also carry greater risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine trade size: a fixed percentage of your capital will be risked on each trade. 

It's straightforward - you specify a `riskPercentage`, which is a number representing the percentage of your total capital you’re willing to lose on a single trade. 

For example, a `riskPercentage` of 10 means 10% of your capital will be used to calculate the size of each trade. This approach helps maintain consistent risk exposure across different trade opportunities.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing strategies within the backtest-kit framework. It acts as a base for more specialized sizing schemas.

Each sizing schema needs a unique identifier, `sizingName`, for easy tracking and management.

You can also add a `note` to provide extra context or documentation for developers.

To control risk, you specify limits on position size with `maxPositionPercentage`, `minPositionSize`, and `maxPositionSize`.  `maxPositionPercentage` restricts the percentage of your account used for a single position, while `minPositionSize` and `maxPositionSize` set absolute boundaries.

Finally, `callbacks` provide a way to hook into specific points in the sizing process, allowing for advanced customization.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). It's designed for strategies that want to adapt their position size based on market volatility.

The `method` property simply confirms you're using the ATR-based sizing approach. 

`riskPercentage` determines what percentage of your trading capital you're willing to risk on each individual trade – a standard risk management practice. The `atrMultiplier` then dictates how far your stop-loss will be placed based on the ATR value; a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface, `ISizingParamsKelly`, defines how to configure your trading sizing strategy based on the Kelly Criterion. It’s primarily used when setting up your trading strategy within the backtest-kit framework.

The most important part is providing a `logger`. The `logger` allows your sizing logic to output debugging information, which is crucial for understanding how your sizing parameters are affecting your trades during a backtest.  Essentially, it’s how you can see what's happening under the hood.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for sizing your trades using a fixed percentage approach. It’s straightforward – you'll primarily need a logger to help you debug and monitor the sizing process. The logger allows you to output diagnostic information, which is crucial for understanding how your sizing strategy is behaving.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining how much of an asset to trade, specifically when using an Average True Range (ATR) based sizing strategy. It primarily focuses on providing a way to log information – the `logger` property allows you to track what's happening under the hood and helps with debugging. You'll pass an instance of an `ILogger` service here so you can see details about the sizing calculations and any potential issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, it allows you to observe and potentially influence how position sizes are determined. 

You can use the `onCalculate` callback to react when the framework calculates a position size. Think of it as a notification that lets you log the calculated size, run some checks to ensure it’s reasonable, or make adjustments based on certain conditions. It receives the intended trade quantity and some parameters relevant to the sizing calculation, giving you context for what’s happening.


## Interface ISizingCalculateParamsKelly

This interface defines the data needed to calculate position sizes using the Kelly Criterion. 

It requires you to provide the win rate, which represents the probability of winning a trade expressed as a number between 0 and 1. You also need to specify the average win/loss ratio, indicating the typical profit compared to the loss for a winning trade. These two values are combined to determine an optimal bet size based on the Kelly Criterion formula.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed for calculating trade sizes using a fixed percentage approach. It’s used when you want to size your trades based on a specific percentage of your available capital.

The `method` property is always set to "fixed-percentage" to identify the sizing method being used. 

You'll also need to provide a `priceStopLoss` which represents the price level at which the stop-loss will be triggered.


## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much of an asset to trade. 

It includes the symbol of the trading pair, like "BTCUSDT", so you know what you're trading. You'll also need to know your current account balance – how much money you have available. Finally, the planned entry price is crucial for sizing calculations; it represents the price at which you intend to buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the configuration needed when calculating position sizes using the ATR (Average True Range) method. It's essentially a set of parameters for a sizing strategy that relies on ATR to determine how much to trade.

The `method` property must be set to "atr-based" to indicate that this sizing approach will be used.

The `atr` property holds the actual ATR value itself, which is a numeric representation of the market's volatility. This value is crucial for calculating the appropriate position size based on the ATR sizing logic.

## Interface ISizing

The `ISizing` interface defines how a trading strategy determines how much of an asset to buy or sell. It's responsible for figuring out the right position size.

The core of this interface is the `calculate` function. This function takes parameters related to the trade (like risk tolerance, account balance, and market data) and returns a number representing the calculated position size. Essentially, it's the heart of how a strategy manages risk and capital allocation.


## Interface ISignalRow

This `ISignalRow` interface defines the structure of a signal used throughout the backtest-kit framework. Think of it as a comprehensive record of a trading signal, containing everything needed to execute and track its performance. Each signal gets a unique identifier (`id`) for easy reference.

Beyond the basic details like cost (`cost`), entry price (`priceOpen`), and the expected duration (`minuteEstimatedTime`), it also includes vital information for execution, like the exchange (`exchangeName`), strategy (`strategyName`), and timeframe (`frameName`).  The `scheduledAt` and `pendingAt` timestamps track the signal's lifecycle, while `symbol` identifies the trading pair. 

A key feature is the tracking of partial position closures (`_partial`), allowing for precise profit and loss calculations.  The interface also supports trailing stop-loss and take-profit mechanisms (`_trailingPriceStopLoss`, `_trailingPriceTakeProfit`) for dynamic risk management. For strategies using DCA (Dollar Cost Averaging), the `_entry` field records the entry prices and their associated costs. 

The `_peak` and `_fall` fields capture the highest and lowest price points reached during the trade, enabling analysis of price behavior.  Finally, the `timestamp` provides a record of when the signal was initially created. Essentially, this structure provides a complete history and context for every signal processed within the system.

## Interface ISignalIntervalDto

The `ISignalIntervalDto` helps manage how signals are delivered, especially when you need to bundle them together. It lets you request several signals at once, pausing the next one until a specified time interval has passed. Each signal represented by this DTO has a unique identifier – a string that acts like its digital fingerprint.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for executing a trade. It contains all the necessary details to open and manage a position. Each signal has a unique identifier, which is automatically created if you don't provide one.

You'll find information about the ticker symbol being traded, whether the trade is a "long" (buy) or "short" (sell) position, and a description explaining the reasoning behind the signal.

Crucially, the `ISignalDto` also includes entry price, take profit price, and stop-loss price levels to define risk management parameters. You need to ensure that your take profit and stop loss prices align correctly with the direction of the trade (long or short).  

The `minuteEstimatedTime` property allows you to set a time limit for the signal’s duration; if no limit is needed, use `Infinity`. Finally, it includes the cost associated with opening the trade.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to represent signal data specifically related to when a position is closed. It's used when a closing action is triggered by a user, like manually adjusting a trade. 

The `closeId` property holds a unique identifier for that user-initiated close, allowing you to track the specific action taken. 

Alongside the `closeId`, `closeNote` provides a space to record any notes or context the user added when closing the position. This helps with detailed analysis and understanding the reasoning behind trade adjustments.

## Interface ISessionInstance

This interface outlines how different session instances should behave, serving as a blueprint for local storage, persistent storage, and dummy setups. Think of a session instance as a place to hold temporary data specific to a particular trading combination – a symbol, strategy, exchange, and time frame. This is particularly useful for sharing information like results from AI models, intermediate calculations for indicators, or data that needs to be tracked across multiple moments in time.

The `waitForInit` method prepares the session, confirming its readiness. `setData` allows you to write new information to the session, marking the exact moment it was valid.  `getData` retrieves the data associated with a particular timestamp – crucially, it won't return future data to prevent looking ahead. Finally, `dispose` cleans up and releases any resources the session was using.

## Interface IScheduledSignalRow

This interface defines a signal that's held back, waiting for a specific price to be reached before it's activated. Think of it as a signal on hold – it’s not acted upon immediately, but waits for the market to move to a certain price level (defined by `priceOpen`).  Once that target price is hit, it transforms into a standard, active signal.  It's useful for strategies that want to enter based on a particular price target, rather than immediately. A key aspect of this signal is its scheduling; the `scheduledAt` time is tracked, initially equal to the `pendingAt` time, and then updated when the signal finally goes pending.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might have been canceled by a user. It builds upon the standard scheduled signal data, adding details specifically for cancellations that a user has requested. If a user cancels a scheduled signal, this interface will include a `cancelId` to identify that specific cancellation and a `cancelNote` to explain why the cancellation occurred. These extra fields aren't present if the signal wasn't canceled by a user.

## Interface IScheduledSignalActivateRow

This interface describes a scheduled signal, but with added information specifically for when a user manually triggers its activation. It builds upon the standard scheduled signal data, incorporating a unique activation ID and an optional note. This ID and note are useful when a signal isn’t activated automatically, but instead initiated by a user, letting them track and provide context for that particular action. Think of it as adding a record of *who* and *why* a signal was activated outside the normal automated process.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the timeframe your backtest covers. It tells the backtest system when it should start and stop analyzing data.  Essentially, `from` represents the beginning date of your backtest, and `to` marks the end date. Think of it as defining the window of time you want to simulate trading within.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides crucial details about the current trading environment within a backtest or live trading scenario. It essentially gives you a snapshot of what's happening right now. 

You'll find information like the specific trading pair (e.g., BTCUSDT) involved. If you're running a backtest, it includes the time period being analyzed. The interface also lets strategies pass along custom data – useful for advanced monitoring or generating unique reports. 

Furthermore, it provides context about the exchange, the strategy itself, and the timeframe being used, along with the precise timestamp and the current market price. Finally, it confirms whether the strategy is operating in a backtesting environment.

## Interface IRunContext

The `IRunContext` interface holds all the information needed when running code within the backtest-kit framework. Think of it as a single container that bundles together details about the trading strategy, the specific exchange being used, and the current market conditions. It merges information about how to route data (like exchange and strategy names) with runtime information (like the trading symbol and the exact time). This combined context is then used to manage and distribute the relevant data to different parts of the system.

## Interface IRiskValidationPayload

This data structure holds the information needed when validating risk. It builds upon the base `IRiskCheckArgs` and includes details about the current trading signal and the overall portfolio. 

Specifically, you'll find the `currentSignal` which represents the signal being evaluated—it’s already calculated, so you know things like the price open. The `activePositionCount` tells you how many positions are currently open. Finally, `activePositions` provides a list detailing each of those active positions.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and behave as expected. Think of it as a gatekeeper – it checks specific conditions before a trade can happen. If everything looks good, the function simply lets the trade proceed. However, if something isn't right, it signals a problem, providing details about why the trade was rejected. The function can do this by returning a rejection object or by throwing an error, both of which are handled in a consistent way.

## Interface IRiskValidation

This interface helps you define how to check if your trading strategies are behaving safely. It’s all about making sure your risk parameters are within acceptable bounds.

You essentially provide a function (`validate`) that performs the actual risk check; it takes the parameters you want to validate as input. This function is the core logic of your risk validation. 

Alongside the function, you can also add a descriptive note (`note`) to explain what the validation is doing or why it’s important – this makes the framework easier to understand and maintain.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading by providing key price information. It builds upon existing signal data and adds the entry price of a trade (`priceOpen`), as well as the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels. Think of it as a way to keep track of the original risk parameters for a trade, ensuring consistent validation and risk assessment throughout its lifecycle. It's primarily used to double-check that risk parameters remain aligned with the original signal.

## Interface IRiskSchema

This interface helps you define and manage risk controls for your trading portfolio. Think of it as a way to create custom rules to prevent potentially harmful trades.

Each risk schema has a unique name to identify it, and you can add a note for your own documentation.

You can also specify callbacks to be triggered at certain points during the trading process, like when a trade is rejected or allowed.

The core of a risk schema lies in its validations – an array of functions or objects that define your specific risk-checking logic. This allows you to tailor your risk management to your individual strategies.

## Interface IRiskRejectionResult

When a risk validation check fails, this object provides details about why. It includes a unique ID so you can track specific rejections and a helpful note explaining the reason in plain language. Think of it as a friendly explanation of what went wrong during the validation process.

## Interface IRiskParams

This interface, `IRiskParams`, defines the essential configuration for managing risk within the backtest-kit framework. It's like a set of instructions for how the system handles potential risks, whether you're testing strategies historically or running them live. 

You'll provide the name of the exchange you're using (like "binance") and a logger to help track what's happening behind the scenes. It also includes a crucial time service to ensure accurate calculations, especially important when backtesting to avoid looking into the future. 

The `backtest` flag simply tells the system whether it's a simulation or a real-time trading environment. Lastly, the `onRejected` callback provides a way to react when a trade signal is blocked due to pre-defined risk limits, allowing for custom handling before any notifications.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you manage how risk checks are handled, especially when multiple things are happening at once.  Think of it as a way to ensure that when you’re making sure a trade is safe, everyone involved sees the same information at the same time.  Specifically, the `reserve` option, when set to `true`, creates a temporary marker in the system’s records to prevent conflicts. This makes sure that any subsequent checks will account for the changes made, avoiding unexpected or incorrect trade execution. It helps to keep things synchronized when many calculations are being done simultaneously.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should even be considered. Think of it as a safety check performed *before* a trading signal is generated. It contains details like the trading pair involved, the signal that's being proposed, which strategy is making the request, and key information like the current price and timestamp. Essentially, it's a snapshot of the trading environment at the moment a signal is potentially being created, allowing risk management systems to evaluate if the conditions are suitable for a new trade.

## Interface IRiskCallbacks

This section defines callbacks related to risk management within the trading framework. Think of these as notification points that your code can subscribe to, letting you react to specific risk-related events. 

Specifically, `onRejected` gets triggered when a trading signal is blocked because it exceeds defined risk limits. Conversely, `onAllowed` is called when a signal successfully passes all risk checks and is considered safe to execute. 

By implementing these callbacks, you can build custom logic to respond to risk events – for example, logging them, adjusting strategies, or sending alerts. These callbacks provide a way to stay informed about and potentially influence risk-related decisions.

## Interface IRiskActivePosition

This interface describes a single active trading position that's being monitored, particularly useful when analyzing how different trading strategies interact. It holds all the key details about the position – what strategy opened it, which exchange it's on, the trading pair (like BTCUSDT), whether it's a long or short position, and the entry price. You'll also find information about stop-loss and take-profit prices, an estimated holding time, and a timestamp indicating when the position was initiated. It’s a way to keep track of all the vital information for a single, active trade.

## Interface IRisk

This interface defines how a trading system manages risk. It allows you to verify if a trading signal should be executed based on pre-defined risk limits.

The `checkSignal` method lets you assess if a signal is safe to proceed with, considering your risk constraints. A safer, more reliable version, `checkSignalAndReserve`, does this and also temporarily "holds" space for the upcoming position, preventing other strategies from accidentally exceeding the limits. This is crucial when multiple strategies are operating simultaneously.

To complete the process, you’ll use `addSignal` to officially register a new, opened position and `removeSignal` to clear a closed position. Remember, you *must* use `addSignal` or `removeSignal` after `checkSignalAndReserve` succeeds, to avoid accumulation of invalid reservation entries within the system.

## Interface IReportTarget

This interface lets you fine-tune what information gets recorded during your trading simulations. Think of it as a set of switches – each one controls a different type of event that you want to track.

You can choose to log details about strategy actions, risk management decisions, breakeven points, partial order executions, performance metrics, scheduled signals, and even events from live trading sessions or backtests.

Each property, like `strategy`, `risk`, or `live`, represents a specific category of events. Setting a property to `true` activates the logging for that category, while `false` turns it off. This allows you to focus on the data most relevant to your analysis and keep the logs manageable.


## Interface IReportDumpOptions

This interface helps you customize how reports are generated during backtesting. It lets you specify key details about the trading scenario, like the symbol being traded (like BTCUSDT), the name of the strategy used, and the exchange involved. You can also define the timeframe (or 'frame') of the data and a unique identifier for the signal, as well as the optimization walker’s name. Essentially, it's a collection of labels that provide context for your backtesting results.

## Interface IRecentUtils

This interface defines how different systems can store and manage recent trading signals. 

It includes methods to process incoming signal updates, retrieve the most recent signal for a specific trading context (like a particular symbol and strategy), and determine how long ago the last signal was generated. The system makes sure to prevent "look-ahead bias" by ensuring retrieved signals aren’t from the future – if a signal's timestamp is later than the requested time, it won't be returned. Essentially, this provides a standardized way to keep track of signals and ensure accuracy during backtesting and live trading.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, gives you a clear view of a trading signal's original parameters, even as those parameters might change over time. It builds upon the standard signal data to display the initial stop-loss and take-profit prices that were set when the signal was first created. This is helpful for transparency – you’ll always see the original SL/TP alongside any potentially adjusted, “live” values.

Here's what you’ll find within each signal row:

*   **cost:** The initial investment required to enter the position.
*   **originalPriceStopLoss:** The price at which the initial stop-loss was set.
*   **originalPriceTakeProfit:** The price at which the initial take-profit was set.
*   **partialExecuted:**  The percentage of the position that has been closed through partial trades.
*   **totalEntries:** The number of times the position has been averaged (how many entries were made).
*   **totalPartials:** The number of partial trades performed.
*   **originalPriceOpen:**  The price at which you first entered the position.
*   **pnl:** The current unrealized profit or loss.
*   **peakProfit:** The highest profit achieved by the position so far.
*   **maxDrawdown:** The largest loss the position has experienced.



The "original" values provide a record of the initial settings, distinct from any subsequent modifications due to trailing stop-loss or take-profit adjustments.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick, providing essential data for analyzing price action over a specific time interval. Each candlestick includes a timestamp marking when the data began, the opening price, the highest and lowest prices reached during that period, the closing price, and the volume of trades executed. This standardized format allows for consistent data representation across different backtesting and analysis tools. It ensures you have all the key information needed to understand what happened in the market during a given time frame.

## Interface IPositionSizeKellyParams

To calculate position sizes using the Kelly Criterion, you'll need to define a few key parameters. The `IPositionSizeKellyParams` interface holds these values. 

Specifically, you need to provide the `winRate`, which represents the likelihood of a winning trade, expressed as a number between 0 and 1. You also need the `winLossRatio`, which tells you, on average, how much you win compared to how much you lose on each trade. These two values work together to determine the optimal amount of capital to allocate to each position.

## Interface IPositionSizeFixedPercentageParams

This defines how much of your capital you'll allocate to a trade using a fixed percentage of your available funds.

The `priceStopLoss` property represents the price at which a stop-loss order will be triggered, helping to manage risk.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed for calculating position sizes using an Average True Range (ATR) approach.  Specifically, it contains the current ATR value.  This value is used to determine how much of your capital to allocate to a trade, scaling the position size based on market volatility. Essentially, a higher ATR means more volatility, and this interface provides that volatility measurement to guide position sizing.


## Interface IPositionOverlapLadder

IPositionOverlapLadder lets you fine-tune how the backtest kit identifies overlapping positions when using dollar-cost averaging (DCA). Think of it as defining a "comfort zone" around each DCA price.

The `upperPercent` property specifies how much higher than each DCA level you want to consider as a potential overlap – for example, 5% above.  

Similarly, `lowerPercent` defines how much lower than each DCA level you're also concerned about – perhaps 5% below.

These percentages help you control the sensitivity of the overlap detection, allowing you to adjust how aggressively the system flags potential issues.

## Interface IPersistStrategyInstance

This interface lets you customize how trading strategies save and load their data. Think of it as a way to control the persistent storage for a specific strategy running on a particular trading symbol and exchange.

If you want to go beyond the default file-based approach—perhaps you want to store data in a database or a different format—you can build an adapter that implements this interface.

The `waitForInit` method prepares the storage area for the strategy. `readStrategyData` retrieves the saved data, and `writeStrategyData` saves the current state, allowing strategies to pick up where they left off. Passing null to `writeStrategyData` will clear the stored data.

## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded, specifically within either backtesting or live trading sessions. Think of it as a way to replace the standard file-based storage with something else, like a database or an in-memory solution.

The system keeps track of signals using their unique IDs. When you need to retrieve signals, it checks through all the saved data.

To use it, you'd create your own storage adapter that implements these methods. `waitForInit` sets things up at the start, `readStorageData` retrieves all the saved signals, and `writeStorageData` stores new or updated signals.


## Interface IPersistStateInstance

This interface defines how to handle saving and loading strategy state for a specific trading context. Think of it as a way to ensure your strategy's progress isn't lost if something unexpected happens, like a crash.

It's primarily used by the `StatePersistInstance` to keep your strategy's data safe.

If you want to create your own custom way of storing this state – perhaps using a database or a different file format – you can implement this interface.

Here's what the methods do:

*   `waitForInit`:  Signals when the storage for a specific trading context is ready.
*   `readStateData`: Retrieves any previously saved state data related to this context.
*   `writeStateData`:  Saves the current state data for this context, including a timestamp.
*   `dispose`: Cleans up any resources the storage is using. You can think of it as closing a file or disconnecting from a database.

## Interface IPersistSignalInstance

This interface defines how a backtest kit stores and retrieves trading signals for a particular strategy on a specific exchange. Think of it as a way to save and load the signals generated by your trading strategy so you can resume a backtest or analyze results later.

If you want to customize how these signals are saved – perhaps using a database instead of a file – you can create your own adapter that implements this interface.

The `waitForInit` method allows you to set up the storage when it's needed. `readSignalData` retrieves the stored signal data, and `writeSignalData` is used to save new or updated signal data – you can even clear existing data by providing `null`.

## Interface IPersistSessionInstance

This interface lets you customize how trading sessions are saved and loaded, making sure your data is safe even if things go wrong. Think of it as a way to manage the specific data tied to a particular trading strategy, exchange, and timeframe.

If you want to change how session information is stored—maybe using a database instead of a file—you can create your own class that follows this interface.

Here's what the methods do:

*   `waitForInit`: Sets up the storage space for your trading session data.
*   `readSessionData`: Retrieves any saved session data.
*   `writeSessionData`: Saves the current state of your trading session.
*   `dispose`: Cleans up any resources used by the storage, although the default behavior does nothing.

## Interface IPersistScheduleInstance

This interface helps you manage how scheduled signals are saved and loaded for specific trading setups. Think of it as a way to customize where and how the backtest-kit remembers what actions should be taken at certain times. Each setup – defined by a symbol, a strategy name, and an exchange – gets its own dedicated storage area.

If you need more control over how these signals are handled, you can create a custom adapter that implements this interface.

The `waitForInit` method lets you prepare the storage space before anything else happens. `readScheduleData` retrieves the existing signal data, and `writeScheduleData` lets you save a new signal or clear out the previous one. Essentially, it’s the foundation for persisting scheduled actions during backtesting.

## Interface IPersistRiskInstance

This interface defines how your custom code can manage and save the risk positions for a specific trading context. Think of it as a way to control where and how the framework remembers the current risk exposure for a particular combination of risk name and exchange. 

You’ll use it if you want to replace the default file-based storage with something else, like a database or a cloud service.

The `waitForInit` method lets you set up the storage when it’s needed. `readPositionData` is used to load previously saved risk positions from storage at a particular time. Finally, `writePositionData` lets you save the current risk positions to storage, so they can be retrieved later.


## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent signal data for a specific trading setup. Think of it as a way to remember the last signal you received for a particular symbol, strategy, exchange, and timeframe. 

It's designed to keep backtesting and live trading separate – you can have different storage mechanisms for each.

If you need to customize how these recent signals are saved (maybe you don't want to use files), you can create an adapter that implements this interface.

The `waitForInit` method prepares the storage space when needed. `readRecentData` retrieves the last signal saved, and `writeRecentData` stores a new signal along with the timestamp.


## Interface IPersistPartialInstance

This interface defines how to save and retrieve partial profit and loss information for a specific trading strategy and symbol combination. Think of it as a way to keep track of progress on a trade, even if the trading system restarts.

It's designed to work within a particular “context,” which is identified by the symbol being traded, the name of the trading strategy, and the exchange being used.  Each individual trade signal gets its own space to store this partial data.

If you want to customize how this data is saved (instead of using the default file-based method), you can create your own adapter that implements this interface.

The `waitForInit` method gets the storage ready for use within the context.

`readPartialData` lets you load previously saved partial data for a specific trade signal.

Finally, `writePartialData` is used to save the current partial data for a trade signal.

## Interface IPersistNotificationInstance

This interface lets you customize how notifications are saved and loaded for a trading backtest or live trading environment. Think of notifications as important events that need to be remembered.

It allows you to create your own storage system instead of relying on the default file-based method. 

The `waitForInit` method prepares your storage for use, indicating whether it's a fresh start. `readNotificationData` retrieves all the previously saved notifications, pulling them back in. Finally, `writeNotificationData` handles saving the notifications, ensuring they are linked to a unique ID.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific trading context. Think of it as a way to persist information related to a particular signal and data bucket, often used for LLM memory.

It allows you to read, write, and list memory entries, and crucially, provides a "soft delete" function – marking entries as removed rather than permanently deleting them, which is useful for keeping historical data.

If you need to customize how memory data is stored (maybe using a database instead of files), you can build your own adapter that implements this interface.

The `waitForInit` method helps get things set up initially, and `dispose` is for cleaning up when you're done. The `hasMemoryData` method is a quick way to check if a specific piece of information exists.


## Interface IPersistMeasureInstance

This interface defines how a backtest-kit measure cache can persist data to storage, typically a file. It allows you to customize how cached results are saved and retrieved, useful if you need something other than the default file-based approach. 

The cache can handle "soft deletes"—removing data logically by marking it as removed while keeping the file on disk.

Here's a breakdown of what you need to do if you implement this interface:

*   **waitForInit:** You'll need to set up the storage for each bucket of measure data.
*   **readMeasureData:** This is how you'll retrieve cached data based on its key.
*   **writeMeasureData:**  You'll use this to save new data or update existing cached entries, including a timestamp.
*   **removeMeasureData:**  Marks an entry as deleted without physically removing it from the storage.
*   **listMeasureData:** Provides a way to iterate over the keys of all available, non-deleted cached entries.

## Interface IPersistLogInstance

This interface defines how your application can manage and store log data persistently, acting as a central place for all logs within the running process. Think of it as a way to save your logs to a file or database instead of just letting them disappear when the application closes.

The `waitForInit` method lets you signal when the log storage is ready to be used, ensuring everything is set up correctly before any logs are written.

`readLogData` retrieves all the stored log entries, allowing you to load and review the history of events.

`writeLogData` is responsible for actually saving new log entries, making sure that each entry is uniquely identified and that duplicates aren't added to maintain a clean, append-only log. 

By implementing this interface, you can tailor log storage to fit your specific needs.

## Interface IPersistIntervalInstance

This interface defines how your custom storage system will handle marking when a specific time interval has already been processed for a particular data bucket. Think of it as a way to remember "we've already done this."

It's used to ensure that a specific task only runs once per interval, even if the system restarts. If a record exists, it indicates the interval has fired. 

You can essentially "forget" that an interval has run by soft-deleting the record, allowing the system to re-execute the task later.

Here’s a breakdown of the methods:

*   `waitForInit`:  Allows you to set up storage for each bucket.
*   `readIntervalData`: Lets you retrieve information about a specific interval marker.
*   `writeIntervalData`: Used to create or update a marker indicating an interval has run.
*   `removeIntervalData`:  "Soft-deletes" a marker, effectively resetting the system so the interval can be run again.
*   `listIntervalData`: Provides a way to see all the markers for the current bucket that haven't been removed.

## Interface IPersistCandleInstance

This interface lets you manage how candle data is stored and retrieved for a specific trading context, defined by a symbol, time interval, and exchange. Think of it as a way to keep track of historical candle data for a particular trading setup.

It provides three main functions:

*   **waitForInit**: A way to set up the storage for your candle data when needed.
*   **readCandlesData**:  This is crucial; it fetches a range of candles from your storage.  If even one candle is missing in the requested range, it will return `null`, signaling a cache miss, so you'll know to get that data from the original source.
*   **writeCandlesData**:  Lets you save new candle data to your storage. It's designed to avoid accidentally overwriting complete, already saved candles, and might skip candles that aren’t fully closed yet.

By implementing this interface, you can customize where and how your trading framework stores its historical candle data, perhaps opting for a database or in-memory storage instead of the default file-based approach.

## Interface IPersistBreakevenInstance

This interface provides a way to manage and store breakeven data—that's the point at which a trade becomes profitable—for a specific trading strategy and exchange combination. Think of it as a personalized data container for each strategy's progress.

It allows you to control how this data is saved, potentially replacing the default file storage with something else, like a database. 

You can use the `waitForInit` method to set up the storage area for a particular trading setup. Then, the `readBreakevenData` method lets you retrieve previously saved breakeven information for a specific signal (a trading event) and time.  Finally, `writeBreakevenData` is used to save the breakeven data whenever it changes, ensuring you don’t lose track of your progress.

## Interface IPersistBase

This interface provides the basic tools for any custom system that wants to store and retrieve data persistently, like saving trading strategies or historical data. It's designed so you can build your own way of handling that storage, whether it's a database, a file system, or something else entirely.

The `waitForInit` method is a one-time setup process to prepare the storage location and ensure everything's ready. `readValue` gets a specific piece of data, while `hasValue` checks if that data even exists.  `writeValue` is how you save new data or update existing data, ensuring the save operation is reliable. Finally, `keys` gives you a way to list all of the data identifiers, sorted alphabetically, useful for checking the integrity of your stored information.

## Interface IPartialProfitCommitRow

This interface describes a step in your backtesting strategy where you're taking partial profits. Think of it as a record of one specific instance where you decided to sell a portion of your holdings. 

Each `IPartialProfitCommitRow` tells you *what* action was taken ("partial-profit"), *how much* of the position was sold (`percentToClose`), and *at what price* that partial sale occurred (`currentPrice`). This information is crucial for analyzing why and how your strategy generated profits.


## Interface IPartialLossCommitRow

This interface describes a request to partially close a position. Think of it as a message that says, "I want to sell a portion of this holding."

It includes the action type, which is always "partial-loss" for this specific request.

You also specify what percentage of the position you want to close – for example, 25% or 50%.

Finally, the interface stores the price at which the partial loss actually occurred. This is crucial for tracking performance and costs.

## Interface IPartialData

This interface, `IPartialData`, is designed to hold just a piece of data – specifically, the profit and loss levels – for a trading signal, making it suitable for saving and loading. It's like a snapshot of the signal's progress, but only including the key levels that have been hit.

When the system saves data, sets of profit and loss levels are transformed into arrays to ensure they can be easily stored as JSON.

The data is typically organized with the signal ID as a key, so you’ll find many `IPartialData` objects grouped together. When the system loads, this partial data is used to recreate the full state of the trading signal.

Here's a breakdown of what it contains:

*   `profitLevels`: An array representing the profit levels that have been achieved.
*   `lossLevels`: An array representing the loss levels that have been reached. 


## Interface IPartial

The `IPartial` interface is all about keeping tabs on how a trading signal is performing, specifically tracking profit and loss milestones. Think of it as a way to get notified when a signal hits significant profit or loss levels, like 10%, 20%, or 30%.

It has three key functions:

*   `profit`: This function is triggered when a signal is making money. It calculates the profit level, ensures you only receive notifications for *new* levels reached, and sends out those notifications.
*   `loss`:  Similar to `profit`, this function handles situations where a signal is losing money. It detects new loss levels and sends out notifications.
*   `clear`: This function is used when a trading signal is finished - whether it hit a target, a stop-loss, or simply ran out of time. It cleans up the signal's record, removes it from the active tracking list, and saves that cleanup process.

## Interface IParseArgsResult

The `IParseArgsResult` interface holds the outcome when you process command-line arguments. It combines your original input parameters with flags that tell the system how to operate – specifically, whether to run a backtest using historical data, execute paper trading with live data, or engage in live trading with real money. This allows you to easily control the trading environment directly from the command line. 

Essentially, it's a convenient way to specify the trading mode.

## Interface IParseArgsParams

The `IParseArgsParams` interface describes the information needed to run a trading strategy from the command line. It essentially outlines the key pieces of data that the backtest-kit framework expects to receive.

You'll need to specify the `symbol` of the trading pair you're interested in, like "BTCUSDT."

It also requires a `strategyName` so the system knows which trading strategy to execute.

Furthermore, you must define the `exchangeName` you wish to connect to, such as "binance" or "bybit."

Finally, the timeframe, or `frameName`, needs to be set; examples include "1h" for one-hour candles or "15m" for fifteen-minute candles.


## Interface IOrderBookData

The `IOrderBookData` interface holds the information about an order book, which represents the current state of buy and sell orders for a particular trading pair. It includes the `symbol` which identifies the trading pair, like "BTCUSDT".  You'll also find arrays of `bids` and `asks`, where each element in these arrays represents a single buy or sell order, respectively. Think of it as a snapshot of the market's intention to buy and sell.

## Interface INotificationUtils

This interface defines the core functions needed for any system that wants to be notified about what’s happening during a backtest or live trading. Think of it as a central point to receive updates about signals, profits, losses, and order status.

It includes methods to handle various events such as when a trade is opened or closed, partial profits or losses are available, orders are filled or rejected, and when there are errors or pauses.  The `handleSignal` method is a key one, dealing with the primary signal events.  You'll also find functions to manage and retrieve notifications and a way to clean up and dispose of any stored notification data. Essentially, it provides a standardized way for different systems to react to events generated by the trading framework.


## Interface INotificationTarget

This interface lets you control which notifications your trading strategy receives, helping to keep things focused and efficient. By default, you'll get *all* notifications, but if you only need specific updates, you can selectively subscribe to just those.

Here's a breakdown of the different notification types you can enable:

*   **Signal Events:** Keep track of when signals are opened, scheduled, closed, or cancelled.
*   **Profit & Loss:** Receive alerts when your strategy reaches predefined partial profit, loss, or breakeven levels.
*   **Commit Actions:** Get confirmation when the strategy makes commitments like partial profit taking or order cancellations.
*   **Order Synchronization:** Monitor the status of your orders during live trading, including open orders, scheduled orders, and confirmation of exits.
*   **Order Checks & Status:** Stay informed about the status of your orders, including checks to ensure they’re still open and notifications about rejections or continuations.
*   **Risk Management:** Receive alerts if the risk manager prevents a new signal from opening.
*   **Informational Messages:** Get manual or strategy-triggered notes and messages.
*   **Strategy Pause State:** Know when the strategy is paused, preventing new orders from being created.
*   **Error Handling:** Be alerted to both recoverable errors and critical errors that might halt your session.
*   **Validation Errors:**  Receive alerts if there are issues with your strategy configuration or input data.

Essentially, it's about fine-tuning what information your strategy listens for.

## Interface IMethodContext

The `IMethodContext` object acts like a little roadmap within your backtesting system. It tells the backtest-kit exactly which configurations to use for each trading scenario.

Think of it as specifying which exchange, strategy, and timeframe you're working with.

It's automatically passed around to make sure everything connects correctly and uses the right settings, simplifying the process of setting up and running your tests.

The object contains:

*   `exchangeName`: Identifies the exchange you’re simulating.
*   `strategyName`:  Specifies the trading strategy being tested.
*   `frameName`:  Indicates the timeframe used for the strategy (and is blank when testing live data).


## Interface IMemoryInstance

The `IMemoryInstance` interface sets the rules for how memory is managed within the backtest-kit framework. It handles things like storing, finding, and removing data points associated with a specific time.

Think of it as a system for keeping track of information related to your trading simulations.

Here’s a breakdown of what it does:

*   **Initialization:**  `waitForInit` sets up the memory system to be ready to use.
*   **Storing Data:** `writeMemory` allows you to save information (like trading signals or market conditions) along with a description and a timestamp.
*   **Searching:** `searchMemory` helps you find relevant data by searching through descriptions using a powerful full-text search. It also ensures results are only from before a certain point in time.
*   **Listing:** `listMemory` lets you see all the data stored up to a specific point in time.
*   **Removing:** `removeMemory` deletes a specific piece of data from the memory.
*   **Retrieving:** `readMemory` fetches a single data point by its unique ID, but only if it exists before a given timestamp.
*   **Cleanup:** `dispose` gracefully releases any resources the memory system is using when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you pick and choose what kinds of detailed reports you want to see from your backtesting process. It's all about controlling how much information you get about your strategy's performance.

You can turn on reports for things like:

*   How your strategy generates entry and exit signals.
*   When risk management blocks trades.
*   When stop-loss orders adjust.
*   How your partial profits and losses look.
*   A visual heatmap of your portfolio's activity across different assets.
*   Reports for comparing and optimizing different strategy versions.
*   How your strategy’s performance fares.
*   Signals that are waiting to be triggered.
*   What's happening in live trading sessions.
*   The main backtesting results with a complete record of every trade.
*   The lifecycle of your signals as they open and close.
*   Milestones related to highest profits.
*   Tracking maximum drawdowns.

Essentially, it's a way to fine-tune the level of detail in your backtesting reports to focus on what's most important to you.

## Interface IMarkdownDumpOptions

This interface defines the settings used when exporting data to Markdown files. Think of it as a set of instructions telling the system exactly where to find and what to include when creating those reports. It specifies the directory, the filename, and crucial details about the trading scenario, like the trading pair, the strategy used, the exchange involved, the timeframe, and a unique ID for the signal. By providing this information, you can precisely control the generation of documentation related to your backtesting results.

## Interface IMCPTextMessage

This represents a simple text message used within the Model Context Protocol (MCP) system. Each message has a unique ID to help keep track of it and ensure it's delivered correctly. The `type` property clearly identifies it as a text message.  Finally, the `text` property holds the actual human-readable content of the message.

## Interface IMCPSignalNotifyCommand

This command lets you send out information notifications related to your trading positions. Specifically, it's used to notify about the status of a position that's currently waiting to be executed for a particular trading symbol. 

The command needs to specify the symbol it relates to, like "BTCUSDT". It also requires the name of the MCP (Model Context Protocol) schema that’s sending the notification. Finally, you can add a descriptive note to the notification, so others can easily understand what's happening.


## Interface IMCPSchema

This schema defines how a strategy interacts with a system managing its trades, acting as a blueprint for these connections. It essentially links a name to a specific trading strategy, allowing commands to be sent to all instances of that strategy.

If you have multiple strategies registered, this schema becomes essential, forcing you to explicitly specify which strategy the commands should apply to. Otherwise, the system might guess, leading to potential errors.

You can also customize settings like the cost of entering a position and control which actions an external agent is permitted to trigger. The schema provides a way to define specific, limited access for the agent.

Further customization includes a function to format the portfolio data into messages for the agent, and several optional callback functions that can be triggered at various points in the process. These callbacks let you integrate with other systems or perform custom actions during the trading lifecycle.

## Interface IMCPPositionOpenCommand

This command is used to initiate a new trading position, specifically a moonbag position, within the backtest-kit framework. A moonbag position is characterized by a predetermined take-profit target (50%) and a stop-loss order that is precisely aligned to grid levels. To execute this, you'll need to specify the trading symbol, whether you're going long (buying) or short (selling), and the name of the Model Context Protocol (MCP) schema responsible for generating this command. Finally, you can include a descriptive note to explain the reason behind opening this particular trade.

## Interface IMCPPositionCloseCommand

This command is used to close an existing position for a specific trading pair, like BTCUSDT. It's part of a system that manages how trading strategies interact with the core platform. 

Essentially, when a strategy decides to close a position, it uses this command to tell the system *which* symbol to close, *which* strategy is making the request (identified by the MCP name), and to provide a brief explanation of why the position is being closed. This note helps with tracking and understanding trading decisions.

## Interface IMCPImageMessage

This represents an image message used within the Model Context Protocol. Think of it as a way to send images, like a chart or screenshot, between different parts of your system. Each image message has a unique ID to keep track of it and a type identifier to confirm it's an image.

It also includes the image's mime type (like "image/png") so the receiving end knows how to interpret the data. Finally, the core of the message is the base64-encoded image data itself.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your trading portfolio at a specific point in time. Think of it as a record of what you own and how much you own of each asset. It's passed to your strategy's functions, allowing it to make decisions based on the current state of your holdings. Each entry within the `IMCPContext` corresponds to a different asset you're trading.

## Interface IMCPCallbacks

These callbacks let you monitor what a backtest kit is doing internally, without altering how it actually runs. They provide insight into actions like retrieving portfolio status, opening or closing positions, and creating average buy or signal notification entries. Each callback is optional; if you don’t need to track a specific action, you simply don’t include the callback. If a callback does run, it will provide data related to the action performed, like the signal details or the commit data. Any errors within a callback will be logged but won't stop the backtest.

*   `onStatus`:  Gets called after the system retrieves the current portfolio status and provides a snapshot of the data and any messages generated.
*   `onPositionOpen`:  Notifies you when a new position is successfully opened, giving you access to the signal and details used for the operation.
*   `onPositionClose`:  Fires when a position is closed, providing the identifier of the signal it was associated with.
*   `onAverageBuy`:  Triggers after a DCA entry is created, giving you the signal identifier the entry was tied to.
*   `onSignalNotify`:  Informs you when a notification is sent for a signal, including the signal's identifier.

## Interface IMCPAverageBuyCommand

This command tells the system to execute a small buy order, contributing to a larger, ongoing buy strategy (often called a Dollar-Cost Averaging or DCA approach). It’s used when a trading strategy has an existing, open position for a particular trading pair like BTCUSDT.

The command specifies which trading pair (symbol) is involved and also identifies the specific strategy (MCP name) that’s initiating this buy order. The system uses this information to figure out where to add this small buy order within the overall trading plan. The cost of this buy is determined by the strategy’s pre-defined cost settings.


## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what's happening. It lets various components like agents, data storage, and policy checks record important events.

You can use it to track things like when something starts or stops, details about tool usage, whether validations pass or fail, and any errors that pop up.

It offers several ways to log messages:

*   `log` for general information.
*   `debug` for very detailed troubleshooting information, mostly for developers.
*   `info` for standard updates about successful actions.
*   `warn` for issues that might need attention but don’t stop the system from working.

These logs are extremely valuable for finding and fixing problems, keeping an eye on how the system is performing, and keeping records of what happened.

## Interface ILogEntry

ILogEntry represents a single record of something that happened during a backtest run – it’s a snapshot of what was going on. Each entry has a unique ID, a level (like "log", "debug", or "warn") to indicate its importance, and a timestamp. 

It also stores helpful contextual information: when the entry was created, a method context describing where the log came from, an execution context for environment details, the log's topic, and any additional arguments passed with the log message. These details help you understand exactly what was happening when the log was generated.

## Interface ILog

The `ILog` interface lets you access a history of what's been logged during your backtest. Think of it as a way to review all the events and messages generated by your trading strategy and the framework itself. 

The `getList` method is your key to retrieving this history – it gives you a list of all the logged entries, allowing you to analyze what happened step-by-step. This is particularly useful for debugging and understanding how your strategy performed.


## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents the performance statistics for a single trading symbol within your backtest. Think of it as a single row in a heatmap visualizing how different trading pairs are performing. It provides a wealth of information, including key metrics like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), maximum drawdown (the biggest loss from a peak), and trade counts.

You’ll find details on win rates, average profit and loss per trade, and streaks of wins and losses. It also includes more advanced indicators like expectancy, which predicts future performance based on past results.

Furthermore, it breaks down the trading process by looking at average trade durations, how profits are realized in winning trades versus losses in losing trades, and even buyer and seller pressure.  Finally, you can find details about the trend and trend strength to see how the market has been behaving.

This comprehensive set of data helps you analyze and compare the performance of different trading strategies across various symbols.

## Interface IFrameSchema

This schema defines a specific window of time used for backtesting, essentially setting the boundaries of your historical data. Think of it as defining "from this date to that date, and we'll be looking at data in one-minute intervals." Each frame has a unique name to identify it, and you can add a note for yourself to remember what this frame represents. 

You control how frequently data is generated within that timeframe with the `interval` property, which defaults to one-minute intervals if not explicitly set. The `startDate` and `endDate` properties precisely mark the beginning and end of the backtesting period.  You can also provide optional callbacks to hook into specific points in the frame's lifecycle, letting you react to events as the backtest progresses.

## Interface IFrameParams

The `IFrameParams` object holds the necessary information to set up a frame within the backtest-kit system. Think of it as the configuration details for a specific period or slice of data being analyzed. It includes a `logger` to help track what's happening during the backtest, providing valuable debugging information. You also specify the `interval` which acts like a label to clearly identify this particular frame of data being processed.

## Interface IFrameCallbacks

This section describes callbacks related to the lifecycle of a timeframe, the basic unit of time used in backtesting. 

Specifically, `onTimeframe` is triggered after the backtest kit has created the set of timeframes it will use for analysis. You can use this callback to inspect the generated timeframe data – for example, to log the start and end dates, the interval (like daily or weekly), or to confirm that the timeframes align with your expectations. It's a great place to add extra validation or debugging information. The callback accepts the timeframe array, the start date of the entire backtest period, the end date, and the interval being used.

## Interface IFrame

The `IFrames` interface is a core component for managing the timing of your backtesting simulations. It's essentially responsible for creating the sequence of moments in time that your trading strategies will be evaluated against.

The most important part of this interface is the `getTimeframe` function. When you call this function, it generates a list of specific dates and times. This list is created for a particular trading symbol (like 'BTCUSDT') and a defined timeframe (like '1h' for hourly data). The timestamps in the list are evenly spaced, reflecting the chosen timeframe interval. It’s how backtest-kit knows when to execute your trading logic.

## Interface IExecutionContext

The Execution Context provides a snapshot of the current environment when your trading strategy is running. Think of it as a set of essential details passed along during each step of the process.

It tells your strategy what symbol it's trading, the precise time of the operation, and crucially, whether it's in a simulated backtest or live trading mode.

This context is automatically provided by the framework, so you don’t need to manually manage it. It's essential for functions like retrieving historical data, handling market updates, and executing trades, ensuring they're aware of the current situation.

Here's a breakdown of what it includes:

*   **symbol**: The trading pair, such as "BTCUSDT."
*   **when**: The current timestamp – the exact moment of the action.
*   **backtest**: A flag indicating whether this is a backtest run (true) or live trading (false).

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint that tells the framework where to get data like historical prices (candles), order book information, and trades.

Each exchange needs a unique identifier, and you can optionally add notes for clarity.

The most important part is `getCandles`, which is responsible for retrieving historical price data. You’ll need to provide a function that knows how to pull candles from the exchange’s API or database.

You can also specify how to format trade quantities and prices to match the exchange's rules – if you don't, it will default to a Bitcoin-based precision.

Order book and aggregated trade data retrieval are optional; if not provided, the framework will raise an error if you try to use them.

Finally, you can configure callbacks to react to events like new candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. Think of it as a blueprint for setting up your exchange connection.

It requires you to provide several key functions: retrieving historical candle data, formatting order quantities and prices to match the exchange's rules, fetching order books, and retrieving aggregated trade data. These functions are responsible for fetching data from the exchange or a data provider.

You'll also need to provide a logger for debugging and an execution context, which gives information like the trading symbol and whether you are in backtest mode. The framework provides sensible defaults for these functions if you need a starting point.

## Interface IExchangeCallbacks

This interface lets you define what should happen when your trading system receives new candlestick data from an exchange. 

You can use it to react to new price information.

The `onCandleData` callback is triggered when new candle data arrives, providing details like the symbol, timeframe (interval), the starting date of the data, how much data was requested, and the actual candlestick data itself. This is how you can keep your backtest or trading system updated with real-time or historical market prices.


## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with a specific cryptocurrency exchange. It provides methods to retrieve historical and future market data, format trade quantities and prices to match the exchange's requirements, and calculate key indicators.

You can use this interface to fetch historical candle data, allowing you to analyze past price movements. It also allows you to get future candles, which is crucial for backtesting and simulating trading scenarios.

The framework helps ensure data consistency by preventing "look-ahead bias"—meaning it won’t let you use information from the future to make trading decisions during your backtest.

Here's what else `IExchange` offers:

*   Formatting tools for quantities and prices so you can submit valid orders to the exchange.
*   A way to calculate the VWAP (Volume Weighted Average Price), a commonly used indicator.
*   Access to the latest close price for a given time interval.
*   Retrieval of order book data to understand current buy and sell orders.
*   Getting aggregated trade data to see overall trading activity.
*   Flexible raw candle retrieval with options for specifying start and end dates or a limit on the number of candles.

## Interface IEntity

This interface serves as the foundation for all objects that are stored and retrieved from a database within the backtest-kit framework. Think of it as the common ancestor for things like trades, orders, or account snapshots – anything that needs to be saved and loaded. It ensures a consistent structure for these persisted data elements.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data during a backtest run. Think of it as a way to record snapshots of what's happening, allowing you to examine the process later.

You’ll use methods like `dumpAgentAnswer` to capture complete conversation histories, `dumpRecord` to store simple key-value pairs, and `dumpTable` to organize data into structured tables.  There are also functions to save error messages (`dumpError`), raw text (`dumpText`), and formatted JSON (`dumpJson`), as well as MCP status (`dumpMCPStatus`).

These 'dump' functions each receive a piece of information, a unique identifier for that piece of data, and a short description to help you understand what it represents.  Finally, the `dispose` method provides a way to clean up any resources used by the dump instance when it’s no longer needed. Essentially, it provides a flexible way to log information at various points during the backtest.

## Interface IDumpContext

The `IDumpContext` helps organize and identify data dumps within the backtest-kit system. Think of it as a little package of information that goes along with each dump. 

It tells the system exactly which trade the dump relates to (using `signalId`), what strategy or agent it belongs to (`bucketName`), and gives it a unique identifier (`dumpId`). 

There's also a helpful `description` field – it's a human-readable explanation of what’s in the dump, which can be used for searching and is displayed clearly in reports. Finally, `backtest` indicates whether the dump comes from a backtesting simulation or live trading.


## Interface ICommitRowBase

This interface defines the fundamental information needed when a trading action is about to happen, whether it's a real trade or a simulation. 

Every action has a `symbol` which identifies the trading pair, like BTC-USDT. 

It also includes a `backtest` flag. This flag is important to know whether the action is part of a historical simulation or a live trade.


## Interface ICheckCandlesParams

This interface defines the information needed to quickly check if your historical candle data exists for a specific trading pair. Think of it as a way to verify that your backtesting framework has the data it needs without having to search through all the files. You'll specify the trading symbol like "BTCUSDT," the exchange you’re using, the timeframe of the candles (like 1-minute or 4-hour), and the date range you want to check. It lets the system efficiently look for the necessary data to avoid errors during backtesting.

## Interface ICandleData

The `ICandleData` interface represents a single bar of data, often called a "candle," that you'll use when backtesting or calculating things like VWAP. Each candle contains key information about price movements and trading activity over a specific time interval. You’ll find the precise moment the candle started with the `timestamp`, and then details about the price action including the `open` price, the highest `high`, lowest `low`, and final `close` price.  Finally, the `volume` property tells you how much trading occurred during that same time period.

## Interface ICacheCandlesParams

This interface helps manage the process of preparing your trading data – specifically, how it's validated and then cached for faster access. Think of it as a set of options you can configure to control when certain actions happen. 

It allows you to define functions that get called at specific points: just before the initial validation check begins, and then again right before the warm-up phase kicks in if validation fails. These callbacks let you add custom logic, like logging or monitoring, to track the data preparation process. You can use these callbacks to understand and control how your data is being set up for backtesting.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary setback encountered while trying to execute an order. Think of it as a signal that something briefly went wrong – perhaps a network issue or a temporary problem on the exchange’s end. 

The system won't immediately give up; it will automatically try again a limited number of times. 

The `reason` property simply confirms that the issue is temporary. 

If there’s information about the specific error that caused the problem, it will be included in the `error` property. This allows for more detailed investigation if needed, though it's generally not critical for immediate action.

## Interface IBrokerOrderVerdictRejected

When an order placement fails due to a business rule or system limitation, this interface represents the final decision made by the backtest-kit framework. It's a way for the system to communicate that the order cannot be executed, and retrying won't help. 

Essentially, adapters or listeners don't create this directly; instead, they signal a failure—either by returning a value, throwing an error, or specifically throwing an `OrderRejectedError` or `OrderDeletedError`.  The framework then consolidates those signals into this `IBrokerOrderVerdictRejected` to ensure consistent handling.

If the `reason` is "rejected", it signifies a permanent inability to fulfill the order. For new orders, this means they're simply discarded. For existing orders, a "rejected" verdict triggers an immediate forced closure.

The `error` property holds the specific `OrderRejectedError` that caused the rejection, providing details about why the order failed.

## Interface IBrokerOrderVerdictDeleted

This event signals that an order has been definitively removed, like if the user canceled it directly on the exchange. 

It's a framework-managed notification, meaning your adapters or listeners don't create it – they communicate order confirmations or rejections through returns or errors.

When you see this event, the framework knows the order is gone and takes immediate action, bypassing certain checks.

It provides details about the specific error that caused the order to be deleted, allowing you to understand why it was removed.

## Interface IBrokerOrderVerdictConfirmed

This interface represents a final decision made by the backtest-kit framework about an order. It’s how the framework communicates whether an order can proceed or not. 

Think of it as the framework saying, "Okay, the order is good to go" or "The order is still valid."

Adapters and listeners don't actually *create* this verdict; instead, they use specific return values or errors to signal their approval or disapproval of the order.  A normal return or a 'true' value means the order is confirmed. Throwing an error tells the framework how to handle the situation - whether it's a temporary problem or a permanent rejection.

The `reason` property will be "confirmed" when the order passes all checks and is approved.

## Interface IBrokerOrderVerdictBase

This interface, `IBrokerOrderVerdictBase`, represents the outcome of a decision made by the framework regarding an order. It's a foundational piece for both validating orders and synchronizing them, regardless of the specific reason behind the verdict. 

Think of it as the standard response you'll get when the system is evaluating an order – it provides a way to consistently communicate the result. The `__type__` property acts as a tag, helping to distinguish between the different specific types of verdicts that can be returned.

## Interface IBroker

The `IBroker` interface acts as a bridge connecting your trading framework to a real exchange or broker. It’s essential for live order execution, handling everything from order placement to position management.

`waitForInit` is called once at the start to establish connections and reconcile any existing orders or positions on the exchange. Think of it as cleanup before trading begins.

`onOrderCloseCommit` handles closing positions (take-profit, stop-loss, or manual close).  It's the gatekeeper for closing orders—if something goes wrong, the framework will attempt to retry the close.  Errors can lead to automatic force-closing in extreme cases.

`onOrderOpenCommit` is the equivalent gatekeeper for opening new positions. It handles the placement of new orders and also manages retries if the exchange initially rejects the order.

`onOrderActiveCheck` is called regularly to confirm that open positions are still valid. It queries the exchange to ensure orders haven't been unexpectedly deleted.

`onOrderScheduleCheck` does the same for scheduled (resting) orders, verifying that they are still in place and haven’t been filled or canceled.

`onSignalActivePing` provides opportunities to act on real-time exchange data, such as gap SLs or early TP fills.

`onSignalSchedulePing` monitors scheduled orders, ready to activate them when conditions are met.

`onSignalIdlePing` lets you perform actions when the strategy isn't actively trading.

`onSignalScheduleOpen` allows you to create the initial resting order when a scheduled signal is triggered.

`onSignalScheduleCancelled` allows you to cancel a previously placed resting order.

`onSignalPendingOpen` handles the initial setup of a new position.

`onSignalPendingClose` facilitates the closing of a pending position.

`onPartialProfitCommit` and `onPartialLossCommit` are called for partial profit and loss adjustments respectively.

`onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit` and `onAverageBuyCommit` handle the commit of trailing stops, trailing take profits, breakeven stops, and average-buy orders.


## Interface IBreakevenData

This interface defines the data needed to save and load breakeven information for a trading signal. It's a simplified version of the full breakeven state, designed specifically for storing data in a format that can be easily converted to and from JSON. Essentially, it tells you whether the breakeven point has been achieved for a particular signal. This data is used to track progress and allow for restoring trading sessions.

## Interface IBreakevenCommitRow

This object represents a single event related to breakeven adjustments during a backtest. It signifies a planned action to recalculate or modify a breakeven point. 

The `action` property simply indicates that this event concerns a breakeven calculation. The `currentPrice` property stores the price at the moment this breakeven adjustment was triggered – it's the price considered when establishing the breakeven.

## Interface IBreakeven

The `IBreakeven` interface helps track when a trading signal’s stop-loss can be moved to the entry price, essentially aiming to protect profits. 

It works by monitoring the price movement and triggering an event when the price has moved sufficiently to cover trading costs. 

The `check` method determines if the breakeven condition is met, and if so, it records that breakeven has been reached, notifies listeners, and saves the state.

The `clear` method resets the breakeven state when a trade is closed, ensuring a clean slate for new signals. This is important when a trade reaches its take-profit or stop-loss, or expires.

## Interface IBidData

This defines the structure of a single bid or ask that appears in an order book. Each bid or ask has a `price`, which is represented as a string, and a `quantity`, also represented as a string, indicating how much of an asset is available at that price. Think of it as a snapshot of one line in the order book, showing both the price and the volume being offered.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as dollar-cost averaging or DCA) process. It essentially documents a commitment to purchase assets at a particular price, contributing to a larger averaging strategy.

Each `IAverageBuyCommitRow` contains details about the specific averaging entry, including the price at which the buy occurred (`currentPrice`), the cost of that purchase in USD (`cost`), and the updated total number of entries that will be part of the averaging strategy (`totalEntries`). Think of it as a record of one small transaction contributing to a larger DCA plan.

## Interface IAggregatedTradeData

IAggregatedTradeData describes a single trade that happened, providing key details for analyzing performance and building backtests. Each trade is identified by a unique ID.  You'll find the trade's price, the quantity of assets exchanged, and the exact time it took place recorded as a timestamp.  A crucial piece of information is `isBuyerMaker`, which tells you whether the buyer was acting as the market maker, helping to understand the trade's direction.

## Interface IAgentLogger

This interface, `IAgentLogger`, handles logging specific to the AI agent's actions. It's distinct from the general framework logging because it focuses on what the agent is doing – like its reasoning process, any tools it's using, and its final responses. This separation ensures that the agent's output is clearly identified in the logs for user review, and importantly, it avoids interfering with how users have already configured their own logging systems.

You'll primarily use the `agent` method to record these agent-related events. Think of it as a dedicated way to capture the agent's journey through a task.


## Interface IActivityEntry

An activity entry represents a single trading run, whether it's a backtest or a live trade. It's created when a run begins and automatically removed when it finishes, either successfully or with an error.

This entry helps keep track of what's currently happening and helps the system manage multiple tasks efficiently.

Each entry contains details like the trading pair's symbol (e.g., "BTCUSDT"), information about which strategy and exchange are running, and whether it's a backtest or a live activity. This information is used to avoid running multiple tasks at the same time.

## Interface IActivateScheduledCommitRow

This interface represents a task that's been added to a queue to activate a scheduled commit. Think of it as a message telling the system to go ahead and execute a pre-planned activation.

It includes the type of action – always "activate-scheduled" – and a unique identifier for the signal that's being activated.

Sometimes, a user might want to trigger the activation themselves, and in those cases, an activation ID is included to specify which activation request to process.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at whether a signal is currently active or scheduled. It’s designed to help you make decisions—like whether to execute a breakeven, profit, loss, or ping action—based on what's happening with the underlying trading signal.

Think of it as a way to safely check if it’s even appropriate to take certain actions.

Specifically, it offers two key methods: `hasPendingSignal` which tells you if there’s an existing open position with a signal, and `hasScheduledSignal` to see if a future signal is waiting to be triggered. These checks are important to prevent actions from being executed when they shouldn't be.

These functions require you to pass in information like whether you're in a backtest, the trading symbol, and details about the strategy and exchange.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom functionality. Think of it as a way to hook into your strategy's execution to do things like record data, send notifications, or integrate with external systems.

You define actions by registering them with `addActionSchema`, and each action has a unique name so the system knows exactly what it is. You can also add a note to help other developers understand what the action does.

The core of an action is its handler, which is a function or a partial implementation of `IPublicAction`. This handler gets called during each strategy run, giving you a chance to react to what's happening. Finally, you can also specify callbacks to control how the action behaves at different points in its lifecycle. It's a flexible system for adding tailored behavior to your trading strategies.


## Interface IActionParams

This interface, `IActionParams`, holds all the important information needed when you're setting up an action within your trading strategy. Think of it as a package containing everything the action needs to work correctly – from logging messages to understanding the overall context of the trading environment.

It includes a logger for tracking what's happening, details like the strategy and timeframe names, and whether you're in a backtesting simulation or live trading.  You also get access to the current signal and position data, allowing your action to make informed decisions based on the situation. Essentially, it provides the context and tools for your actions to operate effectively within the bigger trading picture.


## Interface IActionCallbacks

This API provides a way to hook into different stages of a trading strategy's lifecycle within a backtesting or live trading environment. It’s all about getting notified at key moments and reacting to events.

You can use these callbacks to do things like manage resources (opening/closing database connections, saving data), track what's happening, or even customize how a strategy interacts with an exchange. 

There are callbacks for initialization (`onInit`), cleanup (`onDispose`), and a wide range of events during the strategy's execution. These events are categorized by their source: signals from live or backtest trading (`onSignalLive`, `onSignalBacktest`), breakeven and profit/loss triggers (`onBreakevenAvailable`, `onPartialProfitAvailable`, `onPartialLossAvailable`), scheduled events (`onPingScheduled`, `onScheduleEvent`), and more.

For advanced scenarios, there are callbacks to directly influence the exchange behavior (`onPendingEvent`, `onPingActive`, `onPingIdle`), handle risk management decisions (`onRiskRejection`), and control order placement (`onOrderSync`, `onOrderCheck`). `onOrderSync` lets you explicitly approve or reject order attempts, while `onOrderCheck` allows you to monitor pending orders. Think of these as critical points where you can step in and fine-tune the strategy’s performance.

Most callbacks are optional – you only need to implement the ones you're interested in.  They can either return a value or be asynchronous, giving you flexibility in how you handle them. The overall design favors event-driven behavior, allowing actions to control exchange interaction directly.

## Interface IAction

This interface, `IAction`, acts as a central hub for managing events related to trading signals and order activity within the backtest kit. Think of it as a way to react to what's happening in your strategy – whether it's generating buy/sell signals, managing risk, or tracking order status.

It provides a collection of methods, each responding to a specific type of event.  For example, `signal` gets triggered every time a candle is evaluated, while `breakevenAvailable` alerts you when a stop-loss moves to the entry price.  You can use these methods to build custom logic such as displaying real-time monitoring dashboards or collecting data for analytics.

The framework differentiates between live and backtest scenarios, with dedicated event handlers for each (`signalLive`, `signalBacktest`).

Several methods deal with order management, giving you opportunities to react to order attempts (`orderSync`), confirm their status (`orderCheck`), or handle rejections (`riskRejection`).  The `dispose` method ensures proper cleanup when your trading logic is no longer needed.

Essentially, `IAction` is your bridge to reacting to the nuances of your backtesting and trading strategies. By implementing these methods, you can build a flexible and responsive trading system that suits your exact needs.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a backtest. It provides two key pieces of data: a complete, ordered list of these profitable events, with the most recent ones appearing first, and the total number of profitable events that were recorded. You can use this to analyze when and how the most significant gains were achieved in your simulated trading.

## Interface HighestProfitEvent

This data represents the single most profitable moment for a specific trading position. It captures key details, including the exact time the record was set (timestamp) and the trading pair involved (symbol). You’ll also find the name of the strategy that generated the trade, a unique identifier for the signal that triggered it, and whether the position was a long or short trade.

The record includes comprehensive financial information, like the total profit and loss (PNL) of the closed position, the highest profit reached (peakProfit), and the largest drawdown experienced. Additional useful information such as the price at which the record was achieved, the entry price, and any take profit or stop loss levels set for the position are also included. Finally, the data indicates if this event happened during a backtesting simulation.

## Interface HighestProfitContract

The HighestProfitContract provides details whenever a trading position reaches a new peak profit. It bundles key information together, like the trading symbol, the current price, and when the update happened. You'll also find the name of the strategy, the exchange being used, and the timeframe involved.  Critically, it includes the signal that triggered the trade and a flag to tell you if this profit update comes from a simulated backtest or from actual live trading. This allows you to react to profit milestones in sophisticated ways – for example, to automatically adjust stop-loss orders or take partial profits.

## Interface HeatmapStatisticsModel

This structure neatly packages the overall performance statistics for your entire trading portfolio, giving you a broad view beyond individual symbols. It contains aggregated data like the total profit and loss, the Sharpe and Sortino ratios, and the total number of trades executed across all your holdings.

You'll find key metrics reflecting risk-adjusted performance, such as average peak and fall profits, alongside measurements of trade duration and a breakdown of winning and losing streaks. It also provides insights into potential returns, calculated using metrics like annualized Sharpe ratio and expected yearly returns. Essentially, this provides a high-level summary to evaluate how your overall portfolio is performing.

## Interface DoneContract

This interface describes what happens when a background task, like a backtest or live trading, finishes running. It provides details about the execution, such as which exchange was used, the name of the strategy that ran, and whether it was a backtest or a live trade. You'll get this information when a background process completes, and it includes things like the trading symbol involved (e.g., BTCUSDT) and the name of the frame used, which is empty in live trading scenarios. Essentially, it’s a notification with key information about a finished trading process.


## Interface CronHandle

This object, returned when you schedule a task with the Cron system, lets you easily cancel that scheduled task. Think of it as a cleanup tool – when you’re done with a scheduled job, you can simply call a method on this object to remove it from the system. It's a straightforward way to ensure your scheduled tasks don't linger when they're no longer needed. Essentially, it's a way to undo the registration of a cron job.

## Interface CronEntry

A CronEntry defines when and how a specific task runs within the backtest framework. Each entry needs a unique name to identify it, and this name can't include colons. 

You also specify an interval, like "1m" or "1h", to determine the timing of the task. If you leave the interval out, the task will only run once, immediately when a matching tick occurs.

The `symbols` property is important for controlling the scope of the task.  If it's empty, the task runs just once across all backtests at each boundary.  If you provide a list of symbols, the task will execute separately for *each* of those symbols at each boundary.

Finally, there's a `handler` – the function that actually performs the task when the conditions are met.

## Interface CriticalErrorNotification

This notification signals a critical error that demands immediate attention and process shutdown. 

It's designed to be very specific – it indicates something went wrong that requires stopping what's happening.

Each notification has a unique ID so you can track it. You’ll also get a detailed error message, along with the technical details of what caused the problem, like a stack trace. 

Importantly, these notifications always come from a live context, meaning they aren't related to backtesting simulations.


## Interface ColumnModel

This interface helps you define how data will be displayed in a table. Think of it as a blueprint for each column you want to show.

Each column needs a unique identifier, which is its `key`.  You also give it a `label` – that's the name you'll see in the column header.

The `format` property is where the magic happens; it's a function that takes your raw data and transforms it into a readable string.

Finally, `isVisible` lets you control whether a column appears or not – you can use it to conditionally show or hide columns based on certain conditions.

## Interface ClosePendingCommitNotification

This notification lets you know when a pending signal has been closed before a full position is activated. It provides a comprehensive snapshot of the closed position's performance. The notification includes details like a unique identifier, timestamps for when the close was committed and the notification was created, and whether the signal originated from a backtest or live trading environment.

You'll also find key information about the trading pair, the strategy that generated the signal, and the exchange used. The notification breaks down the position’s financials, including total profit/loss (PNL), peak profit achieved, maximum drawdown, and associated pricing. It also offers insight into the DCA process, showing the total number of entries and partial closes. 

Finally, it provides a human-readable note explaining the reason for the close, along with the number of entries at peak profit and maximum drawdown. This allows you to understand the full context of the closed signal.

## Interface ClosePendingCommit

This signal tells the backtest engine that a previously opened position is being closed. It provides details about the closure, including a unique identifier (closeId) that you can provide to track the reason for the close. 

You'll also find key performance metrics included: the total profit and loss (pnl) of the position, the highest profit it reached (peakProfit), and the largest loss it experienced (maxDrawdown) throughout its lifetime. These numbers help you understand how the position performed before it was closed.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was activated. It provides a detailed breakdown of the signal's properties, including the trading pair, strategy name, exchange, and a unique identifier for both the original signal and the cancellation itself. The notification includes extensive performance metrics like PnL, peak profit, and maximum drawdown, which were all calculated up to the point of the signal's creation and cancellation, allowing you to understand the potential impact of the cancelled signal. Crucially, it also includes details about DCA entries, partial closes, and slippage/fees factored into the PnL calculation, offering a comprehensive view of the potential trade execution. The `backtest` property indicates if this cancellation occurred during a backtest or live trading. Finally, you can find optional notes explaining the reason for cancellation.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event, giving you a way to pause or revert an action.  You’ll specify the action as "cancel-scheduled" to indicate this is a cancellation request. Optionally, you can include a `cancelId` to provide a reason or identifier for the cancellation—this is helpful for tracking why a signal was stopped.  Alongside the cancellation, the interface also provides information about the position being canceled: you'll find details about its total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced. This data offers a snapshot of the position's performance before it was canceled.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a trading simulation or backtest. It essentially gives you a breakdown of how often breakeven points were hit.

You’ll find a list of individual breakeven events, each with its own specific details, stored in the `eventList` property. 

The `totalEvents` property simply tells you the total count of all these breakeven events that were recorded.

## Interface BreakevenEvent

This describes the data you’ll get when a trading signal hits its breakeven point – that’s the point where it’s neither profitable nor losing money. The event includes all the important details about that moment: when it happened (timestamp), which asset was traded (symbol), the name of the strategy used, and a unique ID for the signal.

You'll also find information about the position (long or short), the current market price, the entry price (breakeven level), and any take profit or stop loss prices that were set. If the strategy involved averaging in gradually (DCA), you’ll see details about the number of entries and partial closes executed, plus the original entry price before averaging.

Finally, the event provides a snapshot of the current profit and loss (PNL), a description of why the signal was generated (note), and the timing of the position’s activation and creation.  A flag indicates whether the trade occurred during a backtest or live trading.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a signal's stop-loss is moved back to the initial entry price. It's a signal that the strategy is reducing its risk – the profit has covered the transaction costs. 

These events are designed to be tracked once per signal and provide insights into the strategy's safety and risk management.

The event includes important details like the trading symbol, strategy name, exchange, and the frame it occurred in. It also provides the complete signal data, the current price that triggered the breakeven, whether it's from a backtest or live trading, and the exact time the event happened. This allows you to analyze breakeven points and understand your strategy’s performance over time.


## Interface BreakevenCommitNotification

This notification tells you when a breakeven point has been reached for a trade, whether it’s during a backtest or in live trading. It provides a wealth of information about the trade's history, including a unique ID, the exact time it happened, and whether it occurred during backtesting.

You'll find details about the traded asset (symbol), the strategy that generated the signal, and the exchange where it was executed. The notification also includes key price points like the entry price, take profit, stop loss, and how they might have changed due to trailing stops.

It gives you a complete picture of the trade’s financial performance, including profit & loss (PNL), peak profit, maximum drawdown, and how these numbers are expressed both in USD and as percentages. You can also see how many entries were used in the trade, if it involved any partial closes, and understand the original entry price before any averaging took place. Finally, a note field lets you see any specific reason provided for the trade.

## Interface BreakevenCommit

The BreakevenCommit event signifies when a trading strategy adjusts a position to break even. It provides a snapshot of the position's state at that moment, detailing the current market price and the overall profit and loss (PNL) accumulated so far.  You'll find information about the highest profit and largest drawdown experienced by the position, along with the direction of the trade (long or short). 

Key details like the original entry price, and the original and effective take profit and stop loss prices are also included.  Timestamp information indicates when the signal was generated and when the position initially started. This event gives you a complete picture of the circumstances surrounding a breakeven adjustment.

## Interface BreakevenAvailableNotification

This notification signals that your trading position now has the opportunity to break even – meaning the stop-loss order can be adjusted to your initial entry price. It's essentially a chance to protect your initial investment.

The notification provides a wealth of information about the position, including a unique ID, the exact time this opportunity arose, and whether it’s a backtest or live trade. You'll find details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange it's on.

It also includes critical data about the trade itself: the current price, your original entry price, the position direction (long or short), and the current take profit and stop-loss levels. You'll also see the original price levels before any trailing adjustments.

Beyond the basic details, the notification gives you insights into the position's performance so far, like total profit/loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced. You'll see how many entries were used (useful if you're using dollar-cost averaging) and the total cost of the investment. Finally, there's an optional note field that could explain the signal's reasoning. Dates show when the signal was created, went pending, and when this notification was generated.

## Interface BeforeStartContract

This event signals the start of a trading strategy run, giving you a chance to set things up before the actual trading begins. It's a guaranteed first step in a process – you'll always see an `AfterEndContract` later on, even if something goes wrong.

Think of it as a preparation zone before the simulation or live trading kicks off. You can use it to initialize things like opening log files, resetting counters, or sending out notifications that a run has started.

The event provides key details: the trading symbol involved, the name of the strategy, the exchange providing data, the timeframe being used, whether it’s a backtest or live run, the current price, and the time the event occurred.  In backtest mode, the time represents the planned start of the historical data, while in live mode it’s the current wall-clock time.  The `timestamp` property provides the same time information in milliseconds for easier use and serialization.


## Interface BacktestStatisticsModel

This model provides a comprehensive overview of a backtest's performance. It organizes various statistics, from the number of winning and losing trades to more advanced metrics like Sharpe and Sortino ratios.  You'll find detailed information about each trade, including price movements and profit/loss, all compiled into a single object.

The model includes data about the duration of trades, typical profit and loss percentages, and how often trades end in wins or losses. It also incorporates volatility measures like standard deviation and metrics for assessing risk-adjusted returns.

Beyond basic profitability, it reveals insights into trade durations and step sizes.  The included pressure metrics examine the relative frequency and strength of buying and selling forces during the trading period. Finally, a trend analysis using log-price regression helps assess the overall market direction and confidence in that assessment. Values that might be unsafe during calculations are represented as null, ensuring stability of the results.

## Interface AverageBuyCommitNotification

This notification is triggered whenever a new portion is added to a position using a dollar-cost averaging (DCA) strategy. It provides a detailed snapshot of the current state of the position, including the price at which the new portion was purchased and the overall average entry price. The notification includes a wealth of information, such as the trade identifier, timestamps, the strategy and exchange involved, and performance metrics like profit/loss, peak profit, and maximum drawdown, all calculated up to that point. You’ll also find details about the original entry price, take profit and stop loss levels, and the total number of DCA entries and partial closures.  It’s particularly useful for tracking DCA progress and understanding the position’s profitability and risk profile over time. This information helps in analyzing performance and understanding the impact of each averaging step.

## Interface AverageBuyCommit

This event signals a new average-buy (or DCA) action taken on a position. It’s emitted whenever a new purchase is made to lower the average entry price.

You'll find details about the price at which the new purchase occurred, along with the cost of that specific purchase. Importantly, it calculates and provides the effective average entry price after incorporating this new buy.

The event also includes performance metrics like unrealized profit and loss (pnl), the highest profit achieved so far (peakProfit), and the largest drawdown experienced by the position. 

You’ll also get access to the original entry price, as well as the current effective take profit and stop loss prices, potentially adjusted from their initial values, along with timestamps for signal creation and position activation. The `position` property clarifies whether the trade direction is long or short.

## Interface AfterEndContract

This interface, `AfterEndContract`, signals the completion of a trading strategy's execution. It's a guarantee that something has finished – whether it's a successful run, an interruption, or an error – and it lets you perform essential cleanup tasks.

Think of it as a final notification for things like flushing temporary data, closing files, or sending out completion reports. You can expect this event to happen exactly once for each start, and errors within your cleanup code won’t crash the entire system.

The `when` property is particularly important. In backtesting, it represents the historical time of the last candle processed, or the frame’s start time if nothing was processed. In live trading, it's the current time rounded to the nearest minute. Crucially, the difference between `afterEnd.when` and `beforeStart.when` tells you the actual duration of the run.

The event provides key details about the run, including the trading symbol, strategy name, exchange, and timeframe. A `backtest` flag indicates whether the run was a simulation or live trading, and a `currentPrice` offers a convenient snapshot of the asset’s value at the end.  Finally, the `timestamp` provides the same date information in milliseconds.

## Interface ActivePingContract

This describes what happens when a trading signal is actively being monitored – essentially, a regular check-in while the signal is still open.  The `ActivePingContract` provides information about these check-ins, emitted every minute for active signals. Think of it as a heartbeat to confirm the signal is still relevant and potentially to trigger custom actions.

The information included covers several key details: the trading pair involved (symbol), the name of the strategy managing the signal, the exchange being used, the timeframe or frame of the data, the complete data associated with the signal itself, the current market price, whether this is from a historical backtest or live trading, and a timestamp. 

You can listen for these events to implement custom logic, allowing you to dynamically manage your signal's lifecycle based on its status and market conditions.  For instance, you might close a signal based on price movement relative to the initial entry price.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, bypassing the usual price check. It provides a wealth of detail about the trade, including a unique ID, the exact time of activation, and whether it occurred in backtest or live mode. 

You’ll find all the specifics of the trade laid out here, from the symbol and strategy involved, to the order size and the planned take profit and stop-loss levels. The notification also includes information on DCA averaging (if used), partial closes, and detailed performance metrics like peak profit, maximum drawdown, and P&L calculations – all broken down with entry and exit prices. 

Essentially, this notification gives you a comprehensive snapshot of a scheduled trade as it comes to life, allowing you to track and analyze its performance. Details like the `scheduledAt` and `pendingAt` timestamps reveal the signal’s history, while the `currentPrice` tells you the market conditions at the time of activation. A helpful `note` field can provide extra context about the signal's reasoning.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a previously scheduled trading signal is put into action. It provides detailed information about the trade that's now being executed, acting as a record of what happened and why.

Here's a breakdown of what you'll find:

*   **`action`:** Confirms this is specifically an activation of a scheduled signal.
*   **`activateId`:** A custom identifier that helps you understand *why* the signal was activated – useful for tracking user-initiated activations.
*   **`currentPrice`:** The market price at the moment the trade started.
*   **`pnl`:** The overall profit and loss of the completed trade, accounting for every entry and partial closure.
*   **`peakProfit`:** The highest profit the trade has achieved so far.
*   **`maxDrawdown`:** The largest loss the trade has experienced up to this point.
*   **`position`:** Indicates whether the trade is a long (buy) or short (sell) position.
*   **`priceOpen`:** The price at which the position was initially entered.
*   **`priceTakeProfit`:** The price at which the trade will aim to close with a profit.
*   **`priceStopLoss`:** The price at which the trade will be automatically closed to limit potential losses.
*   **`originalPriceTakeProfit`:** The original take-profit price *before* any adjustments, like trailing stops, were applied.
*   **`originalPriceStopLoss`:** The original stop-loss price before any adjustments were made.
*   **`scheduledAt`:** When the signal was initially created.
*   **`pendingAt`:** The exact timestamp when the trade started being executed.
