---
title: private/functions
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


# backtest-kit functions

## Function writeMemory

The `writeMemory` function lets you store data in a specific memory location, associating it with the current signal's context. Think of it like saving information within a defined area for later retrieval. It handles the complexities of determining which signal is currently active, whether it's a live trading scenario or a backtest, so you don't have to worry about that. 

You provide a name for the memory bucket, a unique identifier for the memory slot, the data you want to store (which can be any object), and a description to help you understand what the data represents. This function is useful for tracking information related to a particular trading signal over time.


## Function warmCandles

The `warmCandles` function is designed to speed up your backtesting by pre-loading historical candle data. It essentially downloads and stores candles for a specific date range, which are then readily available for your strategies without needing to re-download them during the backtest. You provide it with a set of parameters, specifying the starting and ending dates for the candle data you want to retrieve. This helps avoid delays and improves the efficiency of your backtesting process, particularly when working with large datasets.


## Function waitForReady

This function ensures that all the necessary data registries are ready before you begin trading, whether you’re running a backtest or a live simulation. It essentially waits for the system to fully initialize, checking for the exchange, frame, and strategy registries.

In backtest mode, it verifies that all three – exchange, frame, and strategy – are populated because frames define the historical data used for backtesting. When running live, it only confirms the presence of the exchange and strategy registries, as frames aren’t used.

This is helpful when components load asynchronously, like when plugins or configurations are being fetched, preventing errors that might occur if the system tries to trade before everything is set up. If the setup takes too long, the function won’t throw an error itself; instead, you'll get a more informative error message when you try to start the backtest or live simulation.

You can specify `isBacktest` as `true` to enforce the frame schema requirement during backtesting, or omit this parameter to use the default value of `true`.

## Function validate

The `validate` function helps ensure your trading setup is correct before you start any tests. It checks that all the things your strategies and other components rely on—like exchanges, frames, and sizing methods—actually exist and are properly registered.

You can tell it to check just specific parts of your setup, or if you’re unsure, it will automatically check everything for you.

Think of it as a final safety check to avoid errors later on when running backtests or optimizations, making sure everything is ready to go. It remembers previous validation results to run quickly.

## Function stopStrategy

This function pauses a trading strategy, preventing it from creating new signals. It's useful when you need to temporarily halt a strategy's activity, like for adjustments or troubleshooting. Existing signals will finish their lifecycle, and the system will gracefully stop either when it’s idle or after a signal concludes. The function determines whether it's running in backtest or live mode automatically, so you don't need to specify that.

You tell it which symbol to stop by providing the trading pair, which it finds from the active method context.

## Function shutdown

This function provides a way to safely stop the backtesting process. It triggers a signal that lets all parts of the system know it's time to clean up and prepare to exit. Think of it as a polite way to tell the backtest to wrap things up before it finishes running, ensuring nothing is left unfinished. This is particularly useful when the backtest is stopped abruptly, like by pressing Ctrl+C.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it as putting the strategy on hold. When paused, it won't process new signals or act on them, but any existing orders will still be managed. The paused state is saved, so it persists even if the system restarts. To get things going again, you’ll need to explicitly unpause the strategy. When you pause or unpause, a notification is sent out which can be listened to. The function automatically adapts to whether it's running a backtest or a live trading session. 

You provide the trading symbol (like BTC-USDT) and a boolean value indicating whether to pause (true) or resume (false) the strategy.

## Function setSignalState

This function helps you manage and update the state of your trading signals. Think of it as a way to keep track of data specific to a particular trade, like how long it's been open or its maximum profit. 

It’s designed for advanced strategies that collect information during a trade’s lifecycle, especially those using large language models. The function automatically handles figuring out which trade it relates to, based on the current context. 

It's built to work well in both backtesting and live trading environments. The aim is to capture metrics like how long a trade remains open and the percentage of its peak gain, to then make informed decisions, like closing a trade if it’s been open for too long and isn't performing as expected.

The function requires a symbol (like 'BTC-USDT') and some initial data to represent the signal’s state. It also needs a way to "dispatch" or send this data, which could be an object or a special function. Finally, it needs a "dto" object containing the bucket name, the initial state value, and other relevant information.

## Function setSessionData

This function lets you store information that lasts throughout a trading simulation or live trading session. Think of it as a place to hold temporary data, like results from complex calculations or states of indicators. This data will be preserved even if the simulation or live trading restarts, making it perfect for things that need to remember information between price updates. You can clear the stored data by passing `null` as the value. The function automatically adapts to whether it’s running a backtest or live trading. 

You specify a symbol to associate the data with, and then provide the value you want to store – it can be an object or `null` to delete the existing value.


## Function setLogger

This function lets you plug in your own logging system to backtest-kit. 

Essentially, it allows you to control where and how the framework’s internal messages are displayed.

You provide a logger that conforms to the `ILogger` interface, and the framework will send its logging information to your system, along with helpful details like the strategy name, exchange, and symbol involved. This makes debugging and understanding what's happening during backtesting much easier.


## Function setConfig

This function lets you adjust the overall settings of the backtest-kit framework. Think of it as tweaking the engine before you start your simulations. You can change specific parts of the configuration, rather than having to redefine everything. 

It accepts a configuration object that only includes the settings you want to change – you don't need to provide the whole configuration. 

There’s also an "unsafe" option. Use this carefully; it bypasses important checks and is mainly intended for testing environments where you need maximum flexibility and might be intentionally setting things up in an unusual way.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, particularly when generating markdown reports. You can essentially tweak the default settings for any column, tailoring the report to show exactly the information you need. The function verifies that your custom column configurations are correct to prevent issues. There's also a special `_unsafe` option that allows bypassing these validations, which is useful in specific testing scenarios.

## Function searchMemory

The `searchMemory` function helps you find related memory entries based on a text query. 

It uses a technique called BM25 to rank the relevance of the entries, ensuring you get the most pertinent results. 

You provide it with a bucket name (where the memory is stored) and a search query.

The function is smart enough to figure out if it’s running in a backtest or live trading environment, and it can even retrieve pending or scheduled signals from the current context.

It returns an array of results, each containing a unique ID for the memory, a score indicating how well it matches your query, and the content of the memory itself. This allows you to quickly retrieve and use information from previously stored data.


## Function runInMockContext

This function lets you execute code as if it were running within a backtest-kit trading environment, but without needing a full backtest setup. Think of it as creating a pretend environment for testing purposes. 

It's particularly helpful when you need to use functions that rely on the trading context – things like figuring out the current timeframe – but you don't want to run a complete backtest.

You can customize this mock environment by providing details like the exchange name, strategy name, or even setting it to live mode. If you don't provide these details, it uses some default settings, setting up a simple live environment.


## Function removeMemory

This function lets you delete a specific memory record associated with your trading signal. Think of it as clearing out old data you no longer need. 

It handles the details of knowing whether you're running a test or a live trade, and it automatically deals with any related pending or scheduled signals. You just need to provide the bucket name and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve data stored in memory, specifically linked to the current trading signal. It's designed to be flexible, working whether you're running a backtest or live trading. 

You provide a description of where the data is located – the bucket name and a unique memory ID – and the function will fetch the data for you. The function automatically figures out the correct signal and whether you're in backtest or live mode, so you don't have to worry about those details. You can specify the type of data you expect to receive when you call the function.


## Function overrideWalkerSchema

This function lets you tweak an existing strategy comparison setup, also known as a "walker." Think of it as making small adjustments to a previously defined strategy profile – you're not creating a brand new one, just modifying an existing one. You only need to provide the parts you want to change; everything else stays the same. It returns the updated walker configuration.

## Function overrideSweepSchema

This function lets you modify a sweep configuration that's already set up within the backtest-kit. Think of it as updating a part of an existing plan rather than creating a whole new one. You can specify only the changes you want to make – everything else stays the same. Keep in mind that the framework remembers these sweep configurations, so changes might not immediately affect existing runs; you might need to clear the cache for them to take effect in subsequent tests.

## Function overrideStrategySchema

This function lets you modify a strategy that's already set up within the backtest-kit framework. It’s useful for making small adjustments to a strategy’s configuration without having to redefine the whole thing. You provide a new set of settings, and only those settings are changed – the rest of the original strategy remains untouched. Essentially, it's a way to tweak and refine your strategies as needed.


## Function overrideSizingSchema

This function lets you tweak an existing sizing schema, which is how your backtest kit decides how much to trade. Instead of creating a whole new sizing schema from scratch, you can use this to modify specific parts of one that's already been set up. Think of it as a quick way to adjust settings without replacing everything. You only need to provide the parts of the sizing configuration that you want to change, and the rest will stay as they are.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit framework. Think of it as a way to fine-tune a risk profile without starting from scratch. You provide a partial configuration—just the specific settings you want to change—and the function updates the existing risk schema, leaving everything else untouched. It's useful for making incremental adjustments to your risk controls.


## Function overrideMCPSchema

This function lets you tweak an existing configuration for how the backtest kit interacts with data – specifically, the Model Context Protocol. Think of it as a way to fine-tune the framework's understanding of data sources.

You're not replacing the entire configuration, just modifying specific parts of it. It's useful when you need to adjust a setting without redefining everything.

Essentially, you supply a piece of updated configuration, and the framework merges it with the original. Only the changes you provide will take effect.

## Function overrideFrameSchema

This function lets you modify the settings for a specific timeframe you're using in your backtest. Think of it as a way to fine-tune how data is organized and used for a particular timeframe, like adjusting the fields included or how they're formatted. It doesn't replace the entire timeframe configuration; instead, it only changes the parts you specify, leaving the rest untouched. You provide a partial configuration, and the function updates the existing timeframe accordingly.

## Function overrideExchangeSchema

This function lets you tweak an existing exchange's data source within the backtest-kit framework. Think of it as making targeted adjustments – you provide only the changes you want to make, and the rest of the exchange's configuration stays as it was.

It's useful when you need to update a previously set up exchange with new information without completely redefining it.

You essentially provide a partial configuration object, and the framework merges it with the existing exchange schema. This ensures that only the specified properties are modified, keeping the integrity of the original setup.

## Function overrideActionSchema

This function lets you modify how your trading actions are handled. Think of it as a way to tweak existing action handlers – like order placement or cancellation – without having to completely replace them. You can selectively update parts of the configuration, which is handy for things like adjusting callback functions for different environments or changing how actions behave on the fly, all without altering the core strategy. It's a targeted update, meaning only the fields you specify will change; everything else stays as it was.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It provides updates after each strategy finishes running within the backtest.

You'll receive events that give you information about the progress.

Importantly, these updates are handled one at a time, even if the function you provide takes some time to process each event. This helps prevent things from getting out of order or becoming overloaded.

To stop listening for these updates, the function returns another function that you can call.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you watch for specific events happening within a trading simulation and react to them just once. You tell it what kind of events you're interested in using a filter – a function that checks each event to see if it matches what you're looking for. When an event that matches your filter arrives, it triggers a callback function you provide, and then the function automatically stops listening. It's perfect for situations where you only need to react to something happening once, like waiting for a particular trade to occur.


## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes, specifically when all the strategies you've defined have been tested. It’s like setting up an alert that goes off when the whole backtesting process is done.  Importantly, it handles events in the order they arrive and makes sure your code that processes the completion doesn't run simultaneously, preventing potential issues. You provide a function that will be called when the backtest is complete, and that function will receive details about the finished process. The function you provide will also return a function to unsubscribe from these events when they are no longer needed.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like setting up an observer that gets notified after each strategy finishes running within a backtest.

You provide a function that will be called with event data for each completed strategy.

Importantly, these events are handled one at a time, even if your callback function does some asynchronous work – this ensures things don't get out of order or overloaded.

This function also returns an unsubscribe function that you can call to stop receiving these progress updates.


## Function listenValidation

This function allows you to keep an eye on potential problems during the risk validation process. It's like setting up an alert system; whenever a validation check fails and throws an error, this function will notify you. The errors are handled one at a time, even if the way you handle them involves asynchronous operations, ensuring things are processed in a controlled sequence. You provide a function that will be called whenever an error occurs, letting you debug or monitor those validation failures. When you’re done listening, you can unsubscribe using the function that `listenValidation` returns.

## Function listenSync

The `listenSync` function lets you monitor and react to events when the system is synchronizing orders, like when a signal is being opened or closed. Think of it as a way to keep an eye on the order process and take action if something needs immediate attention.

It's important to understand that if the function you provide throws an error, it can affect how orders are handled. Certain errors, like `OrderTransientError`, will cause the system to retry the order opening or closing process. However, `OrderRejectedError` will immediately cancel the order without any retry attempts. 

The callback function you supply gets passed an `OrderSyncContract` object, which contains information about the synchronization event. This function can be used to react to synchronization events.


## Function listenStrategyCommitPerSignal

This function lets you keep an eye on what's happening when a trading strategy makes decisions. It’s like setting up a notification system – whenever a strategy acts on a new trading signal, this function will let you know. 

You can also tell it to only notify you about specific types of actions by using a filter. This helps avoid being overwhelmed by every tiny detail and focuses your attention on what's most important.

To prevent unnecessary notifications, it ensures you only receive the first relevant event for each signal, even if multiple events related to that signal occur. This makes it easy to track the key moments in your strategy's activity.

## Function listenStrategyCommitOnce

This function lets you set up a listener that reacts to changes in your trading strategy, but only once. 

You tell it what kind of strategy event you’re interested in with a filter, and then provide a function that will run when that specific event happens. 

Once the event is detected and processed, the listener automatically stops listening, which is perfect for situations where you need to respond to something just one time. Think of it as a temporary alert system for your strategy.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy – things like when signals are cancelled, closed, or adjusted. It’s like setting up a notification system for key events in your strategy's life. Importantly, the events are handled one at a time, even if your notification code takes some time to process, preventing any conflicts or rushed actions. You provide a function that will be called whenever one of these events occurs, giving you a chance to react or log the information.  When you’re done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalWaitingPerSignal

This function lets you monitor events that occur while a trade is waiting to be filled, but only once for each unique signal ID. Think of it as a way to react to the first confirmation that a pending order is being processed. 

It's particularly useful when you need to know when a waiting order finally starts moving, allowing you to take specific actions based on that initial confirmation. 

You provide a filter to determine which waiting events you're interested in, and a callback function that gets executed when a matching event for a new signal ID occurs. The subscription can be stopped by returning the value returned by the function.

## Function listenSignalWaiting

This function lets you tap into events that happen while your trading strategy is waiting for a signal to trigger. Think of it as getting updates on what's happening in the market *before* a trade is actually made based on a specific signal. It sends updates for every tick while a signal is pending, which can be a lot of information, so use it carefully! If you only care about updates for particular signals, consider using the `listenSignalWaitingPerSignal` function instead. You provide a function that will be called with details about each waiting event. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalScheduledPerSignal

This function lets you react to scheduled tick results, but only when a new signal appears. It’s designed to help you process information related to individual signals as they become available.

You provide a filter function to decide which scheduled events you’re interested in, and a callback function to handle those events. The callback will be triggered each time a new signal ID is processed. This allows for focused, targeted reactions to signal-specific data.

Essentially, it provides a way to listen to scheduled tick results in a more refined way, filtering them by signal ID.


## Function listenSignalScheduled

This function lets you listen for signals that are scheduled, meaning they're waiting for a specific price to be reached before executing. Think of it as setting up an alert that triggers when a certain condition is met. You provide a function that gets called whenever a new scheduled signal is created, or when it’s still waiting for the target price. This is useful for reacting to planned trades as they happen. The function you provide will return another function which you can call to unsubscribe from this event.


## Function listenSignalPerSignal

This function lets you listen for trading signals, but with some control over which ones you receive. You provide a filter – a test that decides whether a signal is interesting – and a function that will be called whenever a new, filtered signal arrives. 

The system ensures you only get notified about distinct signals, even if they happen quickly.

It also makes sure that the events you receive always contain signal information, and won't include idle signals.

Essentially, it's a way to react to specific signals as they come in, without being overwhelmed by unnecessary updates.


## Function listenSignalOpenedPerSignal

This function lets you monitor when new trading signals are opened, specifically focusing on the details of each opening event. You provide a filter to select only the signals you're interested in and a function to execute when a matching signal is opened. Think of it as setting up a listener that gets notified about the start of each trade, providing you with the information needed to react to it. This is useful for backtesting and live trading scenarios alike. The function returns an unsubscribe function that allows you to stop listening when needed.

## Function listenSignalOpened

The `listenSignalOpened` function lets you react to moments when a new trading position is initiated, whether it’s from a direct order or triggered by a scheduled signal. It's essentially a way to be notified whenever a trade actually begins. You provide a function, which is your "callback," that gets executed each time a position opens, and that function receives details about the event. This provides a way to monitor and potentially react to the start of every new trade within your backtesting or live trading environment.

## Function listenSignalOnce

`listenSignalOnce` lets you set up a listener that will react to specific trading signals, but only once. It's like setting a trap – you define what kind of signal you're waiting for, and when that signal arrives, your function runs and then the listener disappears. This is super handy if you need to react to a single, particular event during your backtest, such as waiting for a specific price level to be reached before executing a trade. You give it a rule to identify the signal and a function to run when the signal matches, and it handles the cleanup for you.

## Function listenSignalNotifyPerSignal

This function lets you keep an eye on incoming signal information. It allows you to specify a filter to only receive notifications about signals that meet certain criteria. The callback you provide will be triggered each time a new, unique signal is received. Importantly, it avoids sending duplicate notifications for the same signal ID, even if a strategy repeatedly sends signal information – you'll only get notified once per signal. This is helpful for tracking distinct trading opportunities as they arise.

## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once. You provide a filter—a way to identify the signals you're interested in—and a function that gets executed when a matching signal arrives. The cool part is that it automatically stops listening after that single execution, so you don't have to manage the subscription yourself. It's perfect for actions you only want to perform one time in response to a particular signal.

Essentially, you define what kind of signal you’re looking for, provide the action you want to take when you find it, and the system handles the rest, ensuring it only happens once and then gracefully stops monitoring.


## Function listenSignalNotify

This function lets you keep track of notifications related to trading signals. Think of it as subscribing to updates whenever a strategy sends out a note about an active position.

These notifications are delivered one at a time, even if the code you provide to handle them takes some time to run – this ensures things happen in the right order.

To use it, you provide a function that will be called whenever a new signal notification becomes available. The function you provide will be responsible for reacting to that notification. When you're done needing these notifications, you can unsubscribe using the function that is returned.

## Function listenSignalLiveWaitingPerSignal

This function lets you listen for specific events happening while a trade is waiting to be triggered – think of it as monitoring a resting order. 

It’s designed to prevent you from getting bombarded with the same information repeatedly; it only calls your callback function once for each unique trading opportunity. 

It works exclusively with live trading data, so you won't see these events during backtesting replays.

The system keeps track of which signals it's already processed, ensuring that even if a signal continues to meet the criteria for a while, you only get notified once. 

The filtering function you provide gets checked first, so any events that don't meet your initial conditions won’t be considered for deduplication, guaranteeing that you won’t miss anything important.




The function returns a cleanup function that you can call to unsubscribe from the event stream.

## Function listenSignalLiveWaiting

This function lets you subscribe to updates while a signal is waiting to activate during a live trading execution. You'll receive a notification for each tick that passes before the signal triggers.

Think of it as a way to monitor the 'resting' period of a trade. 

The information includes details of the potential entry signal and theoretical profit and loss (which isn’t actually realized because the position isn't open yet). 

It's specifically designed for live trading situations, not backtesting, so it's safe for actions like sending notifications or placing mirrored orders. The data you receive is already filtered by action, so you don’t need to add extra checks to handle different types of events. 

You provide a function (`fn`) that will be called with each tick event while the signal is waiting. This function returns a function that you can call to unsubscribe from the updates.


## Function listenSignalLiveScheduledPerSignal

This function lets you react to specific events during live trading, but only when they're generated according to a pre-defined schedule. It ensures you only receive each signal once, preventing duplicate notifications. 

Think of it as setting up a special alert that only goes off for certain events during a live trade, and you’re guaranteed to only hear it once for each distinct signal. 

It only works with live trading; backtesting replays won't trigger it. The filtering happens *before* this deduplication, meaning your filter can’t accidentally hide a signal that would otherwise be processed. It distinguishes between multiple strategies running simultaneously to avoid interference.


## Function listenSignalLiveScheduled

This function lets you listen for events that happen when a strategy is waiting for a specific price to be reached during a live trade. It’s like getting a heads-up that your strategy is about to potentially enter a position.

Think of it as a starting signal – it only fires once when the strategy first sets up that price expectation. Subsequent updates while waiting for that price will be different events.

Crucially, this only works during live trading, not when you're reviewing past data (backtesting). This makes it perfect for things that need to happen in real-time, like sending alerts or mirroring orders.

You provide a function that will be called whenever a scheduled signal is created, and that function receives all the relevant information about the event directly.


## Function listenSignalLivePerSignal

This function lets you listen for real-time trading signals generated during a live backtest run. It's designed to be very specific: you'll receive a notification each time a *new* signal is produced.

The function takes two main parts: a filter and a callback. The filter lets you decide which signals you're interested in, allowing you to focus on certain conditions or strategies.  The callback is the function that gets executed whenever a new signal matching your filter arrives.

Importantly, this only works with signals that come from a `Live.run()` execution and ignores idle signals.  The system handles removing duplicate signals to ensure you don't process the same signal multiple times.


## Function listenSignalLiveOpenedPerSignal

This function lets you listen for when a new trading position is opened during live trading. 

It’s designed to only trigger once for each unique trading signal, ensuring you don't get bombarded with duplicate notifications.

Think of it as a way to react to new trades as they happen in real-time, specifically focusing on the initial opening of a position.

It only works with live trading executions and won't fire during backtesting replays.

The system uses a sophisticated method to avoid duplicates, even when multiple strategies are running simultaneously.  The filter you provide is checked first, and only then is the event considered for deduplication. This means a rejected event won’t affect whether a later, similar event is delivered.

You provide two things: a filter to select which events you care about and a function to run when a matching event is found.


## Function listenSignalLiveOpened

This function lets you hook into when a trading strategy actually starts a new position in a live trading environment. 

It's designed for actions that need to happen in real-time, like sending notifications or automatically placing mirrored orders. 

You’ll only receive these "position opened" events when using `Live.run()`, and not during backtesting simulations. This means you can safely use it for things that impact your real-world trading setup.

The event you receive contains all the details about the opening trade, including the signal information, entry price, and take profit/stop loss levels. You don't need to check the action type before accessing these details.


## Function listenSignalLiveOnce

This function lets you temporarily tap into live trading signals during a backtest run. You provide a filter – a way to specify which signals you're interested in – and a callback function that will execute once when a matching signal arrives. It's designed for one-time actions, like quickly checking a specific condition during a simulation; after that single execution, the function automatically stops listening and cleans up, preventing unwanted further actions. The signals you receive will come directly from a `Live.run()` execution.

## Function listenSignalLiveIdle

This function lets you listen for moments when your live trading strategy isn't actively trading – it's in a quiet, "idle" state. 

Think of it as a way to get notified when your strategy isn't doing anything, like a heartbeat signal.

You'll receive data about the current price, the trading symbol, and details about the strategy itself, but the `signal` property will always be empty because no trade is happening.

It's specifically for live, active trading, so you can safely use it for things that interact with the outside world, like sending notifications or triggering other actions—these won't happen during backtesting. 

The callback function you provide will be executed whenever this idle state occurs.


## Function listenSignalLiveClosedPerSignal

This function lets you listen for when a live trading strategy has closed a position. It's designed to ensure you only get notified once for each closed trade, even if there's a rare chance of duplicate emissions. 

It works specifically with live executions – you won't receive notifications from backtesting runs. 

The function uses a clever way to avoid duplicates, ensuring that even if you have multiple strategies running, each one gets the information about closed positions. 

You provide a filter that decides which closed positions you're interested in, and then a function that will be called for those positions. The filter is checked first, so no event is ever suppressed by the duplicate check.

## Function listenSignalLiveClosed

This function lets you listen for when a live trading strategy closes a position. 

It’s specifically designed for real-time actions like sending notifications or mirroring trades, as it only receives signals from active, live executions, not backtesting simulations.

When a position closes – whether due to a take-profit, stop-loss, time expiration, or manual closure – this function will trigger a callback. 

The callback provides detailed information about the closure, including the reason, timestamp, and profit/loss, all calculated after accounting for fees and slippage. 

You don’t need to check the event type because this callback only receives closed position events.

## Function listenSignalLiveCancelledPerSignal

This function lets you listen for when signals are cancelled during live trading. It’s designed to handle situations where a trade order isn’t filled.

Think of it as a safety net – it ensures you only process each cancellation once, even if there’s a glitch.

It works specifically with live trading executions and won't trigger during backtesting or replays. The system keeps track of which cancellations it’s already processed, preventing duplicate notifications.

You can use a filter to choose which cancellation events you want to be notified about, and the filter is applied before any duplicate checking happens. This makes sure you don't miss any important cancellation events.


## Function listenSignalLiveCancelled

This function lets you be notified whenever a live trading signal is cancelled before a trade is actually executed. 

Think of it as getting a heads-up when a potential trade falls through – maybe the price moved unexpectedly or the wait time simply expired. It's specifically for trades managed by `Live.run()`, so it won't trigger during backtesting.

You can use this to build things that need to react to cancelled signals in real-time, like updating a user interface or sending a notification. The `reason` property tells you why the signal was cancelled, and `cancelId` is available if the cancellation was initiated by a user. You don't need to check the action type, because the event is already filtered to be a cancelled event.

## Function listenSignalLiveActivePerSignal

This function lets you react to specific moments during live trading, focusing on individual signals.

It lets you set up alerts that trigger only once per trade, like when a trade hits a certain profit level.

Think of it as a way to get notified about important events in your live trading, but only the very first time they happen for a particular trade.

The alerts will only be triggered by actively running live trades, not when you're replaying historical data.

To avoid duplicate notifications, it keeps track of which signals it's already alerted on, ensuring you don't get bombarded with the same message repeatedly.

You provide a filter to decide which trades to watch and a callback function that gets executed when the filter criteria is met for the first time.


## Function listenSignalLiveActive

This function lets you listen for updates as your strategies are actively trading in a live environment. 

It provides a continuous stream of data about each open position, including profit and loss (`pnl`), and how close the price is to your take-profit or stop-loss levels. 

It's specifically designed for actions that need to happen *during* live trading, such as sending order updates or notifications – it will *not* trigger during backtesting. 

Because it delivers events directly related to specific actions, you don't need to filter them based on action type within your callback function.


## Function listenSignalLive

The `listenSignalLive` function lets you hook into a running live trading simulation to receive updates as they happen. It's designed for when you need to react to events coming from a `Live.run()` execution. 

These updates, called `IStrategyTickResult` events, are delivered one after another, guaranteeing they’re processed in the order they occurred. You provide a function that will be called each time a new event arrives, allowing your code to respond to the live trading activity. The function you provide will be executed asynchronously. This provides a way to unsubscribe from these updates whenever you’re done listening.

## Function listenSignalIdle

This function allows you to be notified whenever your trading strategy isn't actively holding a position. It’s a way to monitor periods of inactivity.

Whenever your strategy has no open trades, this function will trigger a callback. The information provided includes the current price, as well as details about the strategy, exchange, and timeframe being used. It's particularly useful for understanding periods of low activity or implementing logic that needs to run when no trades are open. The `signal` property will always be `null` in these events.


## Function listenSignalEventPerSignal

This function lets you keep a close watch on trading signals as they happen. You provide a filter to specify exactly which signal events you're interested in – for example, just the "opened" ones. Then, a callback function gets triggered each time a new signal appears, ensuring you're only dealing with unique signals. It handles things smoothly, so you don't get repeated notifications even if a signal has multiple events like opening and closing.


## Function listenSignalEventOnce

The `listenSignalEventOnce` function lets you temporarily listen for specific lifecycle events happening within the backtest. It's like setting up a quick alert – you define what kind of event you're interested in, and a callback function will run *only once* when that event occurs. Once that single event is handled, the listener automatically disappears, so you don’t need to worry about unsubscribing. This is handy if you need to react to a particular trade opening or closing and then move on.

You provide a filter function to identify the events you're looking for, and then a callback function that will be executed when a matching event is detected. The listener will then silently stop after that one execution.


## Function listenSignalEvent

The `listenSignalEvent` function lets you tap into the lifecycle of your trading signals – that is, when a new signal is created or an existing one is closed. It's a way to be notified about significant changes happening to your positions, whether they're triggered automatically or by your actions. These events, which include opening signals or closing them due to take profit, stop loss, or time expiration, are delivered in the order they occur, even if handling them takes some time. You provide a function that will be called each time one of these events happens, allowing you to react to them as needed in your trading strategy. This function returns another function that you can call to stop listening to the events.

## Function listenSignalClosedPerSignal

This function lets you monitor when a trading signal closes, but it only triggers a notification for each unique signal. You provide a filter to select the specific closed signal events you're interested in, and a callback function that gets executed when a new signal closes and matches your filter. Think of it as a way to react to signal closures in a targeted manner, avoiding redundant notifications for the same signal. The function returns an unsubscribe function that you can use to stop listening.

## Function listenSignalClosed

This function lets you monitor when a trading position closes, whether it’s a live trade or a backtest simulation. It’s perfect for tracking the final details of a trade, like the profit and loss (`pnl`), why it closed (`closeReason`), and exactly when it closed (`closeTimestamp`). You provide a function that will be called whenever a position closes, and this function returns another function to unsubscribe from the signal when you no longer need it.

## Function listenSignalCancelledPerSignal

This function allows you to monitor when a trading signal is cancelled. It’s particularly useful when you need to react to a signal being removed, either during live trading or when reviewing historical backtest data.

Essentially, you provide a function (`filterFn`) to decide which cancelled signals you're interested in, and another function (`fn`) that will be called for each of those specific cancelled signals. The function returns a function that, when called, will unsubscribe you from receiving these cancellation notifications.

## Function listenSignalCancelled

This function lets you listen for situations where a planned trading signal doesn't actually happen – specifically, when it’s cancelled before a trade is placed. 

Think of it as getting notified when a signal is dropped. 

It’s useful for understanding why signals might be missed, such as due to external factors or internal logic adjustments. The `reason` property within the event provides details about why the signal was cancelled. 

To use it, you provide a callback function that will be executed each time a signal cancellation occurs. The function returns an unsubscribe function which you can use to stop listening later.

## Function listenSignalBacktestWaitingPerSignal

This function lets you listen for specific events that happen while a backtest is waiting for a trading signal to become active. Think of it as catching the very first moment a potential trade condition is met, and then ignoring further updates until something changes.

It's designed to be used *only* during backtesting simulations – it won't trigger when you’re actually trading live.

The system avoids duplicate notifications by remembering the last signal it acted on within a particular backtest setup (strategy, exchange, timeframe, mode, and symbol).  A new signal will always generate a notification, even if it’s identical to a previous one.

You can use a filter function to narrow down the events you care about, and that filter is applied *before* the de-duplication happens, guaranteeing that no events are missed.


## Function listenSignalBacktestWaiting

This function lets you listen for special updates during backtesting, specifically when a signal is waiting to activate. It provides information about the signal and potential profit/loss before the trade actually begins.

Think of it as a way to observe what’s happening behind the scenes as your backtest prepares a trade – it gives you details on the signal and theoretical profit without the trade being open.

Because it only works during backtests and not live trading, it's ideal for analyzing your strategies and creating reports without being influenced by real-time market data.

You simply provide a function (`fn`) that will be called whenever a waiting signal event occurs, and this function handles the events directly without needing extra checks.


## Function listenSignalBacktestScheduledPerSignal

This function lets you listen for specific results from backtest executions, but it’s designed to only fire once for each trading signal. Think of it as a way to react to events that happen when a backtest is running, but only when they're unique. 

It ensures you only get notified for a particular signal a single time, even if there are multiple opportunities, which adds a layer of safety.

Crucially, this function only works with backtests and won't trigger during live trading. It uses a clever system to make sure signals don't get missed, even if you're running multiple strategies at once. 

You provide a filter to decide which events you're interested in, and the function guarantees that the provided callback is executed at most once per signal that matches the filter. This means your code will react to the key events of the backtest while avoiding unnecessary repetitions.

## Function listenSignalBacktestScheduled

This function lets you listen for specific events during a backtest when a strategy is waiting for a market condition to be met. Think of it as getting a notification when the backtest engine is preparing to potentially enter a trade based on a signal.

It's designed specifically for analyzing backtest results and reporting—it won't trigger during live trading. 

The notification you receive marks the very beginning of this waiting period; subsequent updates about the same signal will come through other event types. You'll receive the relevant data directly without needing to filter it.

You provide a function that will be called with details about the scheduled tick result. The function you provide will return another function that you can call to stop listening for these events.

## Function listenSignalBacktestPerSignal

This function lets you tap into the stream of signals generated during a backtest. Think of it as setting up a listener that gets notified whenever a new trading signal appears. You can specify a filter to only receive signals that meet certain criteria, and then a callback function to handle each signal individually. It's specifically designed to work with signals that come from actively running a backtest – it ignores signals when the backtest is idle. Each signal is delivered only once, ensuring you don’t process the same signal multiple times.


## Function listenSignalBacktestOpenedPerSignal

This function lets you listen for when a backtest starts a new trading position, but it's smart about making sure you only get notified once for each trade. It focuses specifically on backtesting scenarios, so you won’t get any signals from live trading.

The function ensures that you receive a notification at most once for each unique trading setup – considering the strategy, exchange, data frame, mode, and the asset being traded. It remembers the last signal it processed, preventing redundant notifications.

Importantly, you provide a filter function first, which decides whether an event is worth considering; the deduplication happens *after* this filter, ensuring that your filter can't unintentionally hide later events. This provides a safety net for your backtesting analysis.

## Function listenSignalBacktestOpened

This function lets you listen specifically for when a trading position is opened during a backtest. 

It's triggered when your strategy initiates a trade, either immediately or after a scheduled time. You'll receive details about the trade, including the signal data, entry price, and stop-loss/take-profit levels. 

This is a great way to analyze backtest performance or build reports, as it’s exclusive to backtesting and won't be affected by live trading activity. The information is neatly organized, so you don't need to filter through different event types.


## Function listenSignalBacktestOnce

This function lets you set up a listener that reacts to specific events generated during a backtest run. 

Think of it as a temporary ear to the backtest – it only listens for events that match your criteria, and then stops listening after it hears one matching event. 

You provide a filter – a rule that determines which events are interesting to you – and then a function to execute when a matching event occurs. 

The listener automatically cleans itself up after the single execution, so you don’t have to worry about managing subscriptions. It’s particularly useful for one-off diagnostics or capturing a single data point during the backtest process.


## Function listenSignalBacktestIdle

This function lets you listen for moments during a backtest when your strategy isn't actively trading or scheduling anything. 

Think of it as a notification that your strategy is "idle"—it's not making any moves.

The data you receive will include the current price, the trading symbol, and information about your strategy, exchange, and the timeframe being used. Importantly, the `signal` field will always be null in these events.

This is really useful for things like logging how often your strategy is inactive or for tracking when it completely stops trading, allowing analysis without interference from live trading data. It only works with backtest runs, not live trading.


## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest trading strategy closes a position, but it’s smart about preventing duplicate notifications. It only works with backtest data, so you won’t receive these signals from live trading. The function filters closed positions based on a criteria you provide, and then ensures that you only receive a notification for each unique signal—even if multiple strategies are running in parallel. Importantly, your filter function is checked before any duplicate checking happens, so it can't accidentally block a legitimate event. You get a callback with details about the closed position for each signal that passes your filter.

## Function listenSignalBacktestClosed

This function lets you monitor when positions are closed during backtesting simulations. 

It provides detailed information about each closure, including why it happened (like hitting a profit target, stop-loss, or time expiry), the exact time of closure, and the realized profit/loss after accounting for fees and slippage. 

Importantly, this callback is exclusive to backtesting; it won't be triggered in live trading scenarios, making it perfect for analyzing and reporting on your backtest results without interference. 

You don't need to check the event type - it directly provides the closure details you need. To stop listening, the function returns a cleanup function that you can call.


## Function listenSignalBacktestCancelledPerSignal

This function lets you listen for events when a trading signal is cancelled during a backtest. It makes sure you only receive each cancelled signal once, even if the backtest generates multiple notifications for the same signal. 

It’s useful for understanding why a signal wasn't acted upon during a backtest.

The function is specifically for backtesting; it won't trigger during live trading.

The filter function determines which cancelled events you’re interested in. It’s run before any duplication is applied, meaning a rejected event won't affect future events.


## Function listenSignalBacktestCancelled

This function lets you monitor backtest executions specifically for cancelled signals. It's useful for understanding why signals didn't result in trades during backtesting – perhaps the price moved unexpectedly, or a timeout occurred.

You'll only receive these cancellation notifications when running backtests; live trading won't trigger them.

The cancellation event provides details like the reason for cancellation (timeout, price movement, or user action) and a cancellation ID for user-initiated cancellations. This allows you to analyze and report on backtest behavior without interference from real-time trading data.


## Function listenSignalBacktestActivePerSignal

This function lets you listen for specific events happening during backtesting, but only the first time a particular signal meets your criteria.

Think of it as a way to set up one-time alerts for your backtests, like "notify me when this trade hits a 5% profit."

It only works with backtest data, so it won't trigger in live trading environments.

The function ensures you don't get bombarded with repeated notifications for the same trade. It only fires once for each unique combination of strategy, exchange, timeframe, mode, and symbol.

You provide a filter to define which events you're interested in, and your callback function will be executed *before* the system starts ignoring further events related to that signal. This means that the filter runs first, and events that don't pass the filter aren't even considered for future firing of the callback.

## Function listenSignalBacktestActive

This function lets you listen for updates during backtesting sessions, specifically when a trading strategy is actively holding a position. 

You'll receive data on each tick while a position is open, including the current profit and loss (`pnl`), and information about how close the price is to your take-profit and stop-loss levels.

It's important to note that this listener only works during backtest runs; it won’t be triggered in live trading environments. This makes it perfect for analyzing backtest results or generating reports without interference from real-time market data.

The information provided is tailored to the specific action being taken, so you don't need to filter events – the data you need is readily available. To use it, provide a function that will be called with the `IStrategyTickResultActive` event data for each tick. The function you provide returns another function that you can call to unsubscribe.

## Function listenSignalBacktest

The `listenSignalBacktest` function lets you tap into the flow of events happening during a backtest. It's a way to observe what’s happening as the backtest runs.

You provide a function that gets called whenever a signal event occurs, and this function will receive data about each event. 

Importantly, this only works for events generated during a `Backtest.run()` execution, ensuring you're only getting signals from active backtests. Events are handled one after another, so you can be confident in their order. This function also returns an unsubscribe function allowing you to stop receiving these signal updates.

## Function listenSignalActivePerSignal

This function lets you react to specific trading signals as they become active. It listens for updates related to positions and calls your provided function whenever a new signal becomes active based on your filtering criteria. Because a position's activity can trigger multiple ticks, this event will only fire once for each unique signal ID, representing the initial activation of that signal. You define what constitutes an "active" signal using a filter function, and your provided callback function handles the actual reaction to those active signals.


## Function listenSignalActive

This function lets you monitor what's happening with your trading strategies in real-time, specifically when you have positions open. It sends updates for each tick – every price change – while you're holding a trade. 

Each update includes important information like your current profit and loss, and how close you are to your take profit and stop loss levels.

Be aware that because it reports on *every* tick for *every* open position, you can receive a lot of updates, especially if you have multiple trades going. If you only need to know when a specific trade reaches a certain point, consider using `listenSignalActivePerSignal` instead. 

You provide a function that will be called with the active tick result.

## Function listenSignal

This function lets you receive updates about what's happening in your trading strategy. Think of it as a way to be notified whenever your strategy changes state—like when it's idle, opens a position, is actively trading, or closes a position. 

It’s designed to handle these updates one at a time, even if the function you provide needs to do some processing that takes a bit of time. This ensures things happen in the right order and avoids potential conflicts.

You give it a function that will be called whenever one of those events occurs, and it returns a function you can use to unsubscribe from those updates later.

## Function listenSchedulePingPerSignal

This function lets you listen for updates related to scheduled trading signals. It's designed to handle "ping" events that occur frequently while a trade is waiting to be activated. Instead of getting pinged every tick, you'll receive a notification once for each scheduled signal.

You provide a filter function to decide which signals you're interested in, and a callback function that will be executed whenever a new, relevant signal is ready. This helps you stay informed about your scheduled trades without being overwhelmed by constant updates. It returns a function you can call to stop listening.

## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific ping events and then automatically stops listening after it’s triggered just once. 

Think of it as a temporary listener; you provide a rule (the `filterFn`) to identify the events you care about, and a function (`fn`) to run when that event appears.

Once the event that matches your rule shows up, the provided function will run and the listener will automatically stop. This is a handy way to wait for a particular condition to be met and then perform an action.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It’s like setting up a little listener that gets notified every minute while a signal is being monitored.

You provide a function that will be called whenever a ping event occurs, giving you a chance to react to those events. 

This is particularly useful if you want to track the progress of a scheduled signal or build custom monitoring routines. The function you provide will receive information about the ping event, allowing you to tailor your actions accordingly. The subscription can be cancelled by returning the function.


## Function listenRiskOnce

The `listenRiskOnce` function lets you react to specific risk rejection events just once and then automatically stop listening. 

You provide a filter that determines which events you’re interested in, and a function to execute when a matching event occurs. 

It’s handy when you need to wait for a particular risk rejection condition to happen and then take action, without continuing to monitor for it afterward. The function returns a cleanup function you can use if you want to unsubscribe earlier.

## Function listenRisk

This function lets you be notified when a trading signal is blocked because it doesn't meet the risk criteria. 

You provide a function that gets called whenever a signal is rejected due to risk. 

Importantly, you only receive notifications for rejected signals – signals that pass the risk checks won't trigger this event. This helps avoid unnecessary notifications.

The notifications happen one at a time, in the order they’re received, even if your provided function performs asynchronous operations. A queued wrapper ensures this sequential processing.


## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how long different parts of your trading strategy take to run. It sends you updates as your strategy executes, providing data on timing metrics.

Think of it as a way to profile your strategy and find slow spots that might be holding you back.

These updates are handled in order, and even if your callback does some asynchronous work, it won't interfere with the sequence of updates. The framework makes sure callbacks are processed one at a time to prevent things from getting messy.

To use it, you provide a function (`fn`) that will be called whenever a performance event occurs, and this function will be passed a `PerformanceContract` object containing the details of the event. When you are done monitoring, the function returns a cleanup function that you can call to unsubscribe.


## Function listenPauseOnce

This function lets you temporarily listen for specific pause events and react to them just once. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. Once that first matching event triggers your function, the listener automatically stops, preventing repeated executions. It's a convenient way to handle a one-off action based on a pause state change. 

The `filterFn` helps you narrow down the events you're looking for.
The `fn` is what actually gets executed when a matching event happens.

## Function listenPause

The `listenPause` function lets you keep track of when a trading strategy is paused or resumed. It's perfect for informing users about these changes, like displaying a notification when trading is temporarily stopped. It makes sure that these notifications are handled one at a time, even if the notification process itself takes some time. You provide a function that gets called whenever the strategy's pause state changes.

## Function listenPartialProfitAvailablePerSignal

This function lets you keep an eye on when partial profit levels are reached during backtesting. It's a way to get notified about signals as they hit certain profit milestones. 

Importantly, it only sends you the *first* profit level reached for each signal to avoid duplicate notifications. If you need to track every single profit level change for a signal, you’ll have to manage that yourself with a different function or carefully control how you use this one's filter.

You provide a function to determine which events you're interested in, and another function to run whenever a matching event occurs. The function you provide will return a way to stop listening.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit condition is met during a backtest. You provide a filter – essentially a rule – that defines what kind of profit event you’re looking for. When that exact event happens, a callback function you specify runs once, and then the system automatically stops listening for further events of that type. It's ideal for situations where you need to react to a particular profit milestone and then move on.

## Function listenPartialProfitAvailable

This function lets you track your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gains. It's like setting up a notification system that tells you when you've hit those targets. Importantly, it makes sure these notifications are handled one at a time, even if your notification logic takes a bit of time to complete, which helps prevent unexpected issues. You provide a function that gets called with details about the profit level achieved, and the function returns another function to unsubscribe from these updates later.


## Function listenPartialLossAvailablePerSignal

This function lets you keep an eye on changes in the partial loss levels for each trading signal. You provide a filter to specify which signals you're interested in, and a function that will be called whenever a new partial loss level is available for a signal that matches your filter. It’s important to note that if a signal has multiple loss levels, you’ll only receive the first one that matches your filter, so make your filter as specific as needed to get the exact levels you want. The subscription can be cancelled by returning the value returned from this function.


## Function listenPartialLossAvailableOnce

This function lets you react to specific partial loss events happening in your trading system, but only once. You provide a filter – a way to describe exactly which events you're interested in – and a callback function that will be executed when a matching event occurs. Once that one event is handled, the subscription automatically stops, ensuring you don't keep reacting to the same condition. 

It's handy when you need to wait for a particular loss level to be reached and then perform a specific action, like adjusting your strategy.

The filter function tells the system *what* events to watch for. The callback function defines *what* happens when a matching event arrives.


## Function listenPartialLossAvailable

This function lets you be notified when your trading strategy experiences certain levels of loss, like 10%, 20%, or 30% down. It ensures that these notifications are delivered and processed in the order they occur, even if the notification handling involves asynchronous operations. Think of it as a way to keep track of your strategy's performance and react to significant loss milestones. You provide a function that will be called with details about the loss event each time it happens. Importantly, the system manages the order of these calls to prevent issues from multiple calls running at once.

## Function listenOrderStop

This function lets you monitor order stops—specifically, events triggered when an order check has definitively ended. Think of it as a way to be notified when an order stop has reached a final conclusion.

It works in conjunction with the order-continue channel, sending a signal only when the check is completely resolved, either because the order was deleted or because it encountered too many temporary failures. 

You'll receive notifications just before the order stop is closed.

Importantly, this feature only functions during live trading, as backtests don’t perform order checks.  If your callback function encounters an error, it will be logged, but it won't interrupt the overall process; the decision has already been made. 

You provide a function that will be called whenever a stop event occurs, and this function can even handle promises for asynchronous processing.

## Function listenOrderSchedulePerSignal

This function lets you react to events related to trading signals being scheduled. It’s like setting up a listener that gets notified whenever a new signal is created or its schedule changes. 

You can specify a filter to only receive notifications for particular signal events – for example, just the "scheduled" or "cancelled" actions. 

The function returns a cleanup function which you can use to unsubscribe from the events when you no longer need them. Essentially, it provides a way to keep track of what’s happening with your trading signals and act accordingly.


## Function listenOrderSchedule

This function lets you keep an eye on what’s happening with scheduled orders – those orders you set up to trigger when the price hits a certain level.

You'll receive notifications when a scheduled order is initially created, signaling the system is waiting for the price to reach your target, or when that order is cancelled for reasons like a timeout, price rejection, or user intervention.

It’s important to know that activation—when the scheduled order actually turns into an active order—isn’t reported through this listener. You'll get that information through the regular signal listeners.

Think of this as a central communication channel that the framework itself uses.  It's designed for observing and tracking scheduled order events, like logging, notifications, or audits, rather than for direct exchange integration. 

The framework guarantees that these events are handled in the order they arrive, even if your callback function takes some time to process them. 

You provide a function that gets called whenever a scheduled order event occurs, and it receives information about the event.


## Function listenOrderReject

This function lets you monitor when your orders are definitively rejected by the exchange. It's a notification about orders that the broker couldn't fulfill, and retrying won’t help.

You'll only receive these rejections when the system is absolutely certain the order won't go through – think of it as the final word from the exchange. 

Because it's a notification, any errors you encounter while handling these rejections won’t impact the trading process; they'll be logged instead. This makes it safe for things like sending messages to external services or audit logs.

To use it, you provide a function that will be called whenever an order is rejected. If your function returns a promise, it will be processed one at a time to avoid any issues.

## Function listenOrderFill

The `listenOrderFill` function allows you to receive notifications whenever an order is definitively filled by the broker. It's like a final confirmation that an order has actually gone through – after all the checks and potential rejections. 

You provide a function that will be called each time a fill event happens, and this function receives details about the order fill.

This notification channel is distinct from order synchronization; it’s specifically for confirmed fills, so it’s very reliable for things like sending updates via Telegram or audit trails.

Importantly, errors thrown within your callback function won't disrupt the process and will be handled internally. This makes it safe to use for external systems.

During backtesting, these confirmations happen instantly because there's no real exchange involved.


## Function listenOrderContinue

This function lets you keep an eye on orders that are still being checked after an initial verdict. Think of it as a way to track orders that are still potentially valid, even if they had a slight hiccup initially.

It works alongside the order-stop channel, providing updates on the order's status – whether it's confirmed open or if a temporary problem needs further monitoring. You'll receive these updates as long as the order remains under observation.

Importantly, this only works during live trading; backtesting doesn't involve these checks.  Any errors you encounter within the callback function won’t stop the process – they'll be logged and handled internally.

You provide a function (the `fn`) that will be called each time an order continues to be monitored. If that function returns a promise, the processing of those updates will happen one after another, ensuring a smooth flow of information.

## Function listenMaxDrawdownPerSignal

This function lets you keep an eye on the maximum drawdown experienced by each trading signal. It's like setting up an alert system that triggers when a signal hits a certain drawdown level. 

The function works by repeatedly checking for drawdown events and then calling a function you provide whenever a new signal's drawdown needs attention.

To avoid getting bombarded with the same signal's drawdown information, it only reports the *first* drawdown event for each signal ID. Any subsequent, more significant drawdown for that same signal won't trigger another notification.

You provide two things: a filter to decide which drawdown events are important, and a callback function to execute when a relevant event happens. This gives you control over which signals and drawdown levels are of interest.


## Function listenMaxDrawdownOnce

This function lets you set up a temporary listener for max drawdown events. You provide a filter to specify exactly which drawdown situations you're interested in, and a function that will run just once when a matching event occurs. Once that event triggers your function, the listener automatically stops, so you don't need to worry about cleaning it up. It’s perfect for situations where you need to react to a particular drawdown condition and then move on.

You define what you’re looking for using the `filterFn`, and the code that should run when you find it with `fn`.


## Function listenMaxDrawdown

This function lets you keep an eye on how much your trading strategy has lost from its peak, known as the maximum drawdown. It’s designed to notify you whenever a new drawdown record is set.

It works by queuing up these notifications and processing them one at a time, even if your notification handling takes some time. This ensures that events are handled in the order they occur. 

Think of it as a way to get alerts about significant downturns in your strategy’s performance. You can use these alerts to adjust your trading plan, like lowering risk exposure when things get tough.

You provide a function that will be called whenever a new drawdown event happens, allowing you to react to these events in real-time.


## Function listenIdlePingOnce

The `listenIdlePingOnce` function lets you listen for specific idle ping events—those that indicate periods of inactivity—and execute a callback function once a matching event is found. You provide a filter function that determines which events you’re interested in. The provided callback function will then be called just once when an event passes your filter.  The function returns an unsubscribe function that you can use to stop listening for these events when you no longer need to.

## Function listenIdlePing

This function allows you to be notified whenever the backtest kit is idle, meaning it's not actively processing any trading signals. It’s like getting a signal that everything is quiet and the system is ready for the next instruction.

You provide a function that will be called each time an idle ping event occurs.  This lets you respond to periods of inactivity within your backtesting process.

The function returns an unsubscribe function, so you can stop listening to idle ping events when they're no longer needed.

## Function listenHighestProfitPerSignal

This function lets you keep an eye on when a trading signal reaches its highest profit potential. It sends you updates whenever a new signal hits a peak profit, but it only reports the *first* peak it finds for each signal to avoid overwhelming you with data. You provide a filter to specify which signals you're interested in, and a function to be executed when a profitable signal is detected. Essentially, it's a way to be notified of potentially lucrative trading opportunities based on signal performance.


## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a specific trading condition is met – specifically, when a contract achieves the highest profit so far. You provide a filter that defines what kind of contract you're looking for, and a function that will run once when a matching contract is found. Once that single event is processed, the alert automatically goes away, ensuring you don’t continue to receive notifications. It’s perfect for situations where you need to react to a particular profit milestone and then move on.

You'll give it two things: a way to identify the specific contracts you want to watch, and the action you want to take when one of those contracts hits the highest profit level. The function then takes care of the monitoring and automatically stops listening after the first match.

## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy achieves a new peak profit during a backtest. It's like setting up a notification system that gets triggered whenever a record-breaking profit is made. 

Importantly, the notifications are handled one at a time, ensuring that even if your notification logic is complex or takes some time to run, it won't interfere with other events. This makes it perfect for things like automatically adjusting your strategy or tracking important profit milestones.

You provide a function that gets called whenever a new highest profit is reached, and this function will receive information about the event. When you’re done needing these notifications, you can unsubscribe using the value returned by `listenHighestProfit`.

## Function listenExit

The `listenExit` function allows you to be notified when a critical error occurs that will stop the backtest-kit process. This is different from handling regular errors, as these are errors that will cause the entire system to halt. 

It lets you register a function that will be called when a fatal error happens during background processes like `Live.background`, `Backtest.background`, or `Walker.background`.

These events are handled one at a time, in the order they are received, and your callback function can even be asynchronous without causing problems. This ensures that errors are handled safely and in a predictable sequence.


## Function listenError

This function lets you monitor and respond to errors that happen while your trading strategy is running, but that don't necessarily stop the whole process. Think of it as a safety net for potential hiccups like API connection problems. 

When an error occurs, it's sent to a callback function you provide. Importantly, these errors are handled one at a time, ensuring stability and preventing issues from piling up. It ensures that even if your error handling takes some time, things proceed in a controlled, sequential manner.

## Function listenDoneWalkerOnce

This function lets you listen for when a background task within your backtest completes, but only once. You provide a filter – a way to specify which completion events you're interested in – and a callback function that will run when a matching event occurs. Once the callback runs, the subscription is automatically removed, so you won’t receive any further notifications. It's useful for handling immediate actions after a specific background process finishes without needing to manage the subscription manually.

## Function listenDoneWalker

This function lets you be notified when a background process within a Walker finishes. 

It provides a way to react to the completion of those background tasks, ensuring they're handled one at a time, even if your reaction involves asynchronous operations. Think of it as a reliable way to know when something has finished running in the background and to deal with it safely. You provide a function that will be called when the background process is done, and this function returns another function to unsubscribe from the event.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running. 

You provide a filter to specify which completed tasks you’re interested in, and a callback function that will be executed just once when a matching task completes. 

After the callback runs, it automatically stops listening, so you don’t need to worry about manually unsubscribing. It’s a convenient way to handle a single notification about a background process finishing.


## Function listenDoneLive

This function allows you to monitor when background tasks initiated through Live.background() finish running. It’s like setting up an alert system for when these tasks are done. 

The events you receive will be in the order they occurred, and to make sure things don’t get chaotic, the system processes them one at a time.  You provide a function (`fn`) that will be called each time a background task completes, and this function will handle any asynchronous operations involved. This allows for a smoother and more controlled flow of data. It provides a way to react to finished background processes safely.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a way to check if the backtest event is the one you're interested in, and then a function that will run when that specific backtest is done. Once that callback executes, it automatically stops listening for further events, so you won't be notified again. It's a handy way to handle a single completion notification without needing to manage subscriptions yourself.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It’s like setting up a listener that gets triggered once the backtest is complete. 

The important thing is that these completion notifications are handled one at a time, even if your notification logic involves asynchronous operations – ensuring a smooth and predictable flow. To use it, simply provide a function that will be executed when the backtest concludes. When you are done listening, the return value of this function provides a way to unsubscribe from the event.

## Function listenCheck

The `listenCheck` function lets you monitor the status of your open orders with the trading system. It listens for "order check" events, which are like quick health checks to make sure your orders are still active on the exchange.

These events happen with every new tick of data while an order is being monitored, and *before* the backtest determines if a trade is complete. The event type tells you what kind of order it relates to: "active" for an open position, and "schedule" for a resting order that's waiting to be filled.

The system handles errors gracefully. Minor errors during the check, like temporary network problems, are tolerated and the system keeps trying. However, if the order is actually deleted from the exchange, that’s a terminal error and the backtest will stop. You can specify a function to be executed when these check events occur, and if that function returns a promise, the processing will pause until the promise resolves.

## Function listenBreakevenAvailablePerSignal

This function lets you keep an eye on when breakeven points become available for your trading signals. You can use a filter to narrow down the signals you're interested in and then provide a function that will be called whenever a new signal has a breakeven point calculated. Think of it as setting up a notification system to be alerted when a particular condition—a breakeven being available—is met for your signals. The function returns another function that you can call to stop listening to these notifications.

## Function listenBreakevenAvailableOnce

This function lets you watch for changes related to breakeven protection, but it stops watching after it sees just one matching event. You provide a way to identify the specific events you're interested in (a filter function) and a function that gets executed once when a matching event occurs. It's handy when you need to react to a particular breakeven situation and then don’t need to monitor it anymore. 

Think of it as a temporary listener that focuses on a single instance of something happening.

Here's a breakdown of what it does:

*   It takes a filter, allowing you to specify which breakeven events you're interested in.
*   It takes a callback function.
*   It executes this callback function only once when an event matches the filter.
*   After that single execution, it automatically stops listening, keeping things clean and efficient.


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss automatically moves to the entry price – essentially, it's protecting your profits. It’s triggered when the price has moved enough in your favor to cover all the transaction costs associated with the trade.

The system handles these notifications in a specific order, ensuring that even if your notification processing takes some time, things happen sequentially. It prevents multiple notifications from triggering at the same time, keeping things reliable.

To use it, you provide a function that will be called whenever a breakeven event occurs, and this function returns a way to unsubscribe from these notifications later.


## Function listenBeforeStartOnce

This function lets you react to a specific event that happens before a backtest starts, but only once. You provide a filter – essentially, a rule – to determine which events you're interested in. Then, you define a function that will run when that event occurs. The beauty is that once the function runs once, it automatically stops listening, so you don't need to manage that cleanup yourself. This is useful for setting up initial conditions or performing one-time setup tasks before the trading simulation begins.


## Function listenBeforeStart

This function lets you hook into what happens right before a trading strategy begins running for a specific asset. 

Think of it as getting a heads-up before things kick off.

It ensures that any actions you take in response to this signal happen one at a time, even if those actions involve asynchronous operations – so you don't run into conflicts or unexpected behavior. You provide a function that will be called just before each strategy starts, giving you a chance to prepare or perform any necessary checks. The registration returns an unsubscribe function.

## Function listenBacktestProgress

This function lets you keep tabs on how your backtest is running. It sets up a listener that will call your provided function whenever there's an update on the backtest's progress.

Think of it as a way to get notifications as the backtest runs, allowing you to display progress bars or perform other actions based on the current state.

The important thing to know is that these progress updates are handled one at a time, even if your function takes some time to complete. This makes sure things run smoothly and avoids potential conflicts. To unsubscribe from the progress updates, the function returns an unsubscribe function.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You provide a filter to specify which events you're interested in, and a callback function that will be executed when a matching event occurs. After that single execution, the listener automatically stops listening, keeping your code clean and efficient. It’s like setting up a temporary alarm that rings only once for a particular situation.


## Function listenAfterEnd

This function lets you listen for events that happen *after* a trading strategy execution finishes for a specific symbol. Think of it as getting notified when the engine is completely done with a particular trade. 

The events are delivered in the order they occur, and any asynchronous operations you perform within your callback function will be handled in a controlled, sequential manner to avoid any unexpected conflicts. It's a reliable way to perform actions, like cleanup or reporting, once a trading run is truly complete. You provide a function that will be called with details about the completed execution. This subscription can be cancelled by returning the result of the function.


## Function listenActivePingPerSignal

This function lets you keep an eye on active ping events, specifically reacting when a new signal appears. Imagine you want to know exactly when a particular condition is met for a trading position – this is your tool. It works by firing a notification only once for each new signal, allowing you to focus on the initial trigger and ignore subsequent updates for that same signal. You provide a filter to specify which events you're interested in and a callback function to handle those events. It essentially provides a way to react to the very first instance of a defined condition being met in a trading position.


## Function listenActivePingOnce

This function helps you react to specific active ping events, but only once. 

It's like setting up a temporary listener: it waits for an event that matches your criteria, runs your provided function once when it finds a match, and then automatically stops listening. This is great for situations where you need to respond to a particular event just one time and then move on.

You tell it what kind of event you're looking for with a filter function, and then provide a function to run when that event occurs. After the function runs once, the listener is automatically removed, so you don't have to worry about cleaning up.


## Function listenActivePing

This function lets you keep an eye on active signals within your backtest. It listens for events that happen every minute, providing insights into the status of your signals. 

Think of it as a way to monitor what's happening with your signals over time.

The events are handled one at a time, even if the function you provide takes some time to complete, ensuring things don’t get messed up by running multiple processes at once. You give it a function to be called whenever a new active ping event occurs, and that function will receive details about the event.  The function you provide returns a function that can be called to unsubscribe from these events.

## Function listWalkerSchema

This function gives you a peek behind the scenes, revealing a list of all the "walkers" that have been set up within the backtest-kit framework. Think of walkers as specialized components that analyze and process data during a backtest.  It's handy if you want to see what's happening under the hood, create tools to document your walkers, or build a user interface that adapts to the walkers you've defined. Essentially, it pulls together all the configuration information for each walker.


## Function listSweepSchema

This function allows you to see all the different "sweep" strategies that have been set up in your backtest environment. Think of sweeps as different ways you can systematically test various trading parameters or strategies. It gives you a list of all these registered sweeps, allowing you to examine them, understand the available options, or even build tools to display them. This is handy for checking your setup, documenting your choices, or creating user interfaces that let you interact with different sweep configurations.


## Function listStrategySchema

This function helps you see a list of all the trading strategies that have been set up in your backtest kit. It essentially gives you a snapshot of all the strategies you've defined and registered. Think of it as a way to check what strategies are ready to be used or to build tools that automatically display information about them. You can use it to quickly see what's available and ensure everything's configured correctly.


## Function listSizingSchema

This function lets you see all the sizing strategies currently in use within your backtest. Think of it as a way to peek under the hood and understand how your trades are being sized. It returns a list of configurations, allowing you to inspect them for debugging purposes or if you want to build tools that react to different sizing approaches. Essentially, it provides a snapshot of your sizing setup.

## Function listRiskSchema

This function lets you see a complete list of all the risk configurations you've set up in your backtest. Think of it as a way to inspect what risk factors your strategy is considering. It's helpful when you're trying to understand your system’s setup, creating documentation, or building a user interface that needs to display those risk settings. The function returns a promise that resolves to an array containing all the registered risk schemas.


## Function listMemory

This function helps you see everything currently stored in memory related to your trading signal. 

Think of it like looking into a temporary storage area for data associated with your trades. 

It automatically figures out which signal it's working with and whether you're in a testing (backtest) or live trading environment.

You provide a bucket name to specify where this memory is stored, and the function returns a list of entries, each containing an ID and the data itself.

## Function listMCPSchema

This function lets you see all the different data structures, called Model Context Protocols or MCPs, that your backtest environment is using. It essentially provides a comprehensive list of the registered MCP schemas.

Think of it like checking a catalog of all the different types of information your system is working with.

It's particularly helpful when you're troubleshooting, trying to understand how your system is organized, or building tools that need to know about all the different data formats. It fetches these schemas from those that were previously registered with addMCPSchema().

## Function listFrameSchema

This function helps you discover what types of data your backtest kit is using. It essentially gives you a list of all the "frames" or data structures that have been set up within your trading system. Think of it as a way to see the blueprint of your data – useful if you're troubleshooting, creating documentation, or building tools that need to understand the data format. It returns a list containing information about each of these defined data frames.

## Function listExchangeSchema

This function gives you a comprehensive look at all the exchanges your backtest kit is currently set up to handle. It's like a directory listing of all the trading platforms you've told your backtest kit to be aware of. This is really handy if you're trying to understand your setup, generate documentation, or create user interfaces that need to dynamically adjust based on the available exchanges. The function returns a list of these exchanges, letting you easily access their configurations and details.

## Function hasTradeContext

This function lets you quickly verify if the necessary conditions are met to interact with the trading environment. Essentially, it checks if both the execution and method contexts are running. If it returns `true`, you're good to go and can safely use functions like `getCandles`, `getAveragePrice`, or `formatPrice` – they need these contexts to work properly. Think of it as a gatekeeper for certain trading operations.

## Function hasNoScheduledSignal

This function helps you check if there's currently a scheduled trading signal for a specific asset, like 'BTCUSDT'. It returns `true` if there isn't a scheduled signal, meaning it’s safe to potentially generate one. Think of it as a safety check before creating a new trading instruction – it confirms nothing is already planned. The function smartly figures out if you're in a backtesting environment or live trading without you needing to specify.

It takes the symbol of the trading pair as input.

## Function hasNoPendingSignal

This function checks if there's a pending signal waiting to be triggered for a specific trading pair, like BTC-USDT. It returns `true` if there isn't one – essentially, it’s the opposite of `hasPendingSignal`. You can use this to make sure your signal generation code only runs when it's safe to do so, avoiding unwanted actions. It smartly figures out whether you're running a backtest or a live trading session without you needing to specify. To use it, just give it the symbol of the trading pair you want to check.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within the backtest-kit framework. Think of it as looking up the details of how a particular trading approach is designed and structured. You provide the name of the walker you're interested in, and the function returns its schema, which describes its inputs, outputs, and how it operates. This is useful for understanding and validating how a walker is set up.

## Function getTotalPercentHeld

This function helps you understand how much of your original position remains open. It tells you what percentage of the initial trade is still active, without considering any partial closures you might have made. A value of 100 means you haven’t closed any part of the position yet, while 0 means the entire position has been closed. It handles situations where you've added to your position through dollar-cost averaging (DCA) and then closed parts of it, giving you an accurate view of what's left. Think of it as a direct mirror of `getTotalPercentClosed`.

You need to provide the trading pair symbol (like BTCUSDT) as input.


## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, helps you understand how much of a trading position remains open. It tells you what percentage of the initial amount is still being held, with 100% meaning the entire position is still active and 0% indicating it’s completely closed.

It's designed to be accurate even if you’ve used dollar-cost averaging (DCA) to enter the position and have since closed parts of it.

The function handles whether you are in a backtesting environment or a live trading environment automatically.

You simply provide the symbol of the trading pair (e.g., BTC/USDT), and it returns a number representing the percentage of the position that hasn’t been closed.

## Function getTotalCostClosed

This function helps you figure out how much you've spent on a particular cryptocurrency or asset, like BTC or ETH. It calculates the total cost basis, taking into account any times you've added to your holdings over time, especially if you've closed parts of your position along the way.  It works whether you’re running a test backtest or a live trade. To use it, you simply tell it the symbol of the asset you're interested in, and it will return the total cost in dollars.

## Function getTimestamp

This function, `getTimestamp()`, gives you the current timestamp based on where your trading logic is running. When you're testing past trades (backtesting), it returns the timestamp associated with the specific point in time you’re analyzing. If you're running live, it gives you the actual, real-time timestamp. Essentially, it provides a reliable reference point for time within your trading system.

## Function getSymbol

This function lets you retrieve the symbol you're currently trading, like 'AAPL' or 'BTCUSDT'. It's a simple way to know what asset your backtest or live trading system is focused on. The function returns a promise that resolves to a string representing the symbol.

## Function getSweepSchema

This function lets you fetch the configuration details for a specific trading strategy "sweep" within the backtest-kit framework. Think of a sweep as a pre-defined set of parameters and rules for testing a trading strategy. By providing the name of the sweep, you'll get back an object containing all the information about that sweep, such as the parameters it uses and how it's structured. This is useful for understanding or dynamically adjusting how a backtest is run.

## Function getStrategyStatus

This function lets you peek at the current state of a trading strategy as it's running within a backtest or live environment. Think of it as a snapshot of what the strategy is doing behind the scenes – things like queued actions, user-triggered events, and the next signal being prepared. It provides this information for a specific trading pair, like 'BTC/USDT'. You don't have to worry about whether the system is in testing mode or live; it figures that out on its own.

## Function getStrategySchema

The `getStrategySchema` function lets you find the blueprint for a specific trading strategy. Think of it as looking up the detailed instructions or definition of how a strategy is built. You provide the strategy's name, and it returns a structured description of that strategy, outlining things like its inputs and expected outputs. This is useful for understanding what a strategy needs to function or for validating its configuration.

## Function getStrategyPaused

This function lets you check if a specific trading strategy is currently paused. When a strategy is paused, it won't place any new orders; it effectively stops generating new trading signals. However, any existing orders that are already in place – like those waiting to be filled or scheduled to close – will continue to operate as normal. The system figures out whether it’s running in a backtesting environment or a live trading situation automatically. You tell it which symbol (like BTC/USDT) you want to check.

## Function getSizingSchema

This function helps you find the details of a specific sizing strategy you've registered within your backtesting setup. Think of it as looking up the blueprint for how much of your assets will be used for a trade. It takes the name of the sizing strategy as input and returns a structured definition that outlines its behavior – things like how it calculates position sizes. This allows you to understand and potentially customize the sizing logic being applied to your trades during backtesting.

## Function getSignalState

This function helps you retrieve a specific piece of data associated with an active trading signal. It's designed to work with systems that manage signals, like pending or scheduled orders.

It cleverly figures out whether you're in a backtesting or live trading environment on its own.

Think of it as a tool for advanced strategies, particularly those that use AI (like LLMs) to make trading decisions. These strategies often track details about each trade, such as how long it's been open and the percentage gain or loss.

The function throws an error if it can't find a signal to work with.

It takes the symbol of the trading pair and a data transfer object as input.

## Function getSessionData

This function lets you retrieve data that’s specific to a trading symbol and persists throughout a backtest or live trading session. Think of it as a place to store information like calculations or results from AI models that you need to remember across different candles or even if the program restarts. The data is tied to the symbol you're trading, the strategy you're using, the exchange involved, and the timeframe you've chosen. It automatically adjusts based on whether you're in backtest or live mode. You provide the symbol of the trading pair to fetch the associated session data.

## Function getScheduledSignal

This function lets you retrieve the scheduled signal that's currently in effect for a specific trading pair. Think of it as checking what signal the system is using to make trading decisions right now.

If there isn't a scheduled signal active for that particular symbol, the function will simply return nothing.

It cleverly figures out whether you're running a backtest or in live trading mode without you needing to specify it.

You just need to provide the trading symbol you're interested in, like "BTCUSDT".


## Function getRuntimeInfo

This function gives you a snapshot of your current trading environment. Think of it as a way to quickly see what symbol you're trading, which exchange is being used, the timeframe for your charts, and even whether you're in a backtest simulation or a live trading situation. It’s useful for understanding the context of your code and making decisions based on the current conditions. You can also tailor the information received by providing custom data types.

## Function getRiskSchema

This function lets you fetch details about a specific risk type that your backtest is tracking. Think of it as looking up the definition of a particular risk factor, like maximum drawdown or volatility. You provide the unique name you gave that risk factor when you set it up, and it returns a structured object containing all the information about how that risk is calculated and managed. This is useful when you want to understand how a risk factor is being assessed within your backtest.

## Function getRemainingCostBasis

This function helps you figure out how much of your investment remains outstanding for a particular trading pair. It calculates the remaining cost basis in dollars, even if you've closed parts of your position along the way. It takes into account the cost of each individual purchase when you've used a dollar-cost averaging (DCA) strategy. 

Essentially, it tells you how much more money you'd need to spend to replicate the original position, considering any partial closures. This function is just another way to access the same information as `getTotalCostClosed`.

You just need to provide the symbol of the trading pair you're interested in, such as 'BTC-USD'.


## Function getRawCandles

This function helps you retrieve historical price data (candles) for a specific trading pair. You can specify how many candles you want, and optionally define a start and end date for the data you’re requesting. 

The function is designed to be reliable and prevent unintentional biases in your backtesting. 

You have several ways to define the data range: you can provide both start and end dates along with the number of candles, just a start and end date, or just the number of candles you need. If you don't specify a start or end date, the function uses a default reference point based on the execution context. It always validates that your requested data range is consistent with available data.

Here's a breakdown of the parameters:

*   `symbol`: The trading pair you’re interested in (like "BTCUSDT").
*   `interval`:  The time frame for each candle (e.g., "1m" for 1-minute candles, "1h" for 1-hour candles).
*   `limit`: How many candles to fetch.
*   `sDate`:  The starting date for the data, in milliseconds.
*   `eDate`: The ending date for the data, in milliseconds.


## Function getPositionWaitingMinutes

This function helps you understand how long a pending order for a specific trading pair has been waiting to be executed. It tells you, in minutes, how long the system has been holding back on a signal. 

If there isn’t a pending order waiting, the function will return null, indicating that nothing is currently held back. To use it, simply provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionPnlPercent

This function lets you quickly find out the unrealized profit or loss, expressed as a percentage, for a trade you're currently holding. It considers things like how much you've already closed out of the position, any dollar-cost averaging (DCA) you've used, and even takes into account slippage and trading fees.

If there isn't a trade currently being held, the function will let you know.

Behind the scenes, it figures out whether you're running a backtest or a live trading session and gets the current market price for you automatically. You just need to tell it the trading pair symbol you're interested in.


## Function getPositionPnlCost

This function helps you understand the potential profit or loss on a trade that's still open. 

It calculates the unrealized profit or loss in dollars for a specific trading pair, considering factors like the percentage change in price, your total investment cost, and even things like slippage and fees.

If there isn't an active trade happening, the function will let you know. It figures out if you're in a backtest or live trading environment and automatically gets the current market price to do its calculations. To use it, just give it the symbol of the trading pair you’re interested in, like "BTC-USDT".


## Function getPositionPartials

getPositionPartials lets you peek at the history of partial profit or loss closes that have been executed for a specific trading pair. It provides a list detailing when and how much of your position was closed through actions like commitPartialProfit or commitPartialLoss. If no signal is currently active, you'll receive an error. If no partial closes have happened, you'll get an empty list.

Each record in the list includes the type of partial close (profit or loss), the percentage of the position closed, the execution price at the time, the cost basis for accounting purposes, and the number of DCA entries that were accumulated at the time of the close. You specify the symbol (trading pair) you are interested in when calling this function.


## Function getPositionPartialOverlap

This function helps you avoid accidentally closing positions partially at the same price level. It checks if the current market price is close enough to any previously executed partial closing prices. 

Essentially, it verifies if the current price falls within a defined tolerance range around those existing partial close prices, preventing unintended duplicate actions. If there are no existing partial closes or no pending signals, it will return false.

You can customize the tolerance range (how close is "too close") using the `ladder` parameter, which controls the percentage thresholds for considering prices as overlapping.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp lets you find out when a specific trade experienced its biggest loss. It tells you the exact timestamp marking the lowest point of that loss for a given trading pair. If no trading signal exists for that pair, it will let you know with an error. You provide the symbol of the trading pair you're interested in, and it returns a timestamp.

## Function getPositionMaxDrawdownPrice

This function helps you understand the biggest loss a specific trading position has experienced. It looks back at the entire history of that position and finds the lowest price it hit while losing money. 

Think of it as a way to see how far "down" a position has gone.

To use it, you simply provide the symbol of the trading pair (like BTC/USDT), and it will return that maximum drawdown price.

If, for some reason, there’s no trading signal currently active for that symbol, the function will let you know by throwing an error.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading pair. It calculates and returns the percentage of profit or loss experienced at the point when the position reached its lowest value. Essentially, it reveals the deepest drawdown a position in that trading pair has seen throughout its existence.

To use it, you provide the symbol of the trading pair you're interested in, and it will return a number representing that drawdown percentage. 

Keep in mind, this function won’t work if there are no signals currently active for the specified symbol.


## Function getPositionMaxDrawdownPnlCost

This function lets you check how much money you lost at the point your position hit its biggest drawdown. It specifically looks at the profit and loss (PnL) in terms of the quote currency, like USD or BTC.

To use it, you simply provide the trading pair symbol you're interested in.

Keep in mind, if there are no signals currently pending, the function will let you know by throwing an error.

## Function getPositionMaxDrawdownMinutes

This function tells you how much time has passed since your position experienced its biggest loss. Think of it as a way to gauge how recently your strategy hit a low point. The value is measured in minutes, so a larger number means it’s been longer since that drawdown occurred. If your position is just starting out, this value will be close to zero, meaning the trough happened very recently. It won't work if there isn't an active trading signal for the specified trading pair.

## Function getPositionLevels

getPositionLevels helps you retrieve the prices at which you've entered into a trade using dollar-cost averaging (DCA). 

It gives you a list of prices, starting with the original opening price of the trade. 

If you've added more prices through commitAverageBuy, they'll be included in the list as well. 

If there's no active trade signal, it will let you know with an error. 

If you only have the initial entry price, it returns an array containing just that one price. 

You need to provide the trading pair symbol to know which trade you're getting the prices for.

## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you’ve added to a position using DCA (Dollar-Cost Averaging) for a specific trading pair. It essentially counts how many "extra" buys you've made after the initial purchase.

A value of 1 means it's just the original buy. Each time you use commitAverageBuy() successfully, this number increases, showing you’ve layered in more buys at different prices.

If there isn't a pending trade, the function will let you know. The system figures out whether it's running in a backtest or live trading environment automatically.

You just need to provide the symbol of the trading pair, like "BTCUSDT" or "ETHUSD".

## Function getPositionInvestedCost

This function helps you find out how much money you've invested in a particular trading pair, like BTC/USD, for the current trading signal. It calculates the total cost based on all the average buy entries made. 

Think of it as figuring out the total cost of buying shares, it will add up all the individual purchase prices.

If no trading signal is active, the function will let you know. It works seamlessly whether you're doing a backtest or a live trade.

You just need to provide the trading symbol as input, such as 'BTC/USD'.

## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position reached its most profitable point. It looks at the historical data for a given trading pair, like "BTCUSDT," and tells you the exact timestamp when the price was highest for that position.

If there’s a problem finding the information, you might get an error message indicating that there wasn't enough data related to the trading signals. You need to provide the symbol of the trading pair you’re interested in, for example, "BTCUSDT". It works by returning a timestamp, a numerical representation of a specific date and time.


## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while it was profitable. 

Think of it as tracking the best moment your trade went in the right direction. 

For long positions, it remembers the highest price above your entry price; for short positions, the lowest price below your entry price. 

It starts by recording the initial entry price when the position begins and gets updated as new price data arrives. It will always return a value, including the entry price, as long as a trading signal is active. It needs the trading pair symbol to work.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its most profitable moment. 

It calculates the number of minutes that have passed since the price reached its highest point for a specific trading pair. 

Think of it as a way to track how far a position has fallen from its peak – essentially, it's the same information as the drawdown time, but focused on profit. 

If the price is at its absolute highest right now, the value returned will be zero.

You'll need to provide the trading pair symbol (like "BTCUSDT") to get the information.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best possible profit. It calculates the difference between the current profit percentage and the highest profit percentage achieved so far. 

Essentially, it tells you how much room there is for improvement.

The result is always zero or positive – it won't show losses in this metric. 

To use it, you simply provide the trading pair symbol (like "BTC/USDT"). Keep in mind, it requires a pending signal to work.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your position is from its best possible performance. It calculates the difference between the highest profit you could have made and the profit you're currently making, ensuring that only positive differences are considered. Essentially, it tells you how much room for improvement your position potentially has. 

It requires the trading symbol, like "BTC-USDT," to work correctly. If there isn’t a pending signal, the function won't be able to calculate this distance and will let you know.

## Function getPositionHighestProfitBreakeven

This function checks if a trade position could have potentially reached a breakeven point at its highest profit level. 

It essentially verifies if it was mathematically possible to avoid losses based on the trade's performance.

To use it, you provide the symbol of the trading pair you’re interested in, like "BTCUSDT".

Keep in mind that the function requires a pending signal to exist; otherwise, it will throw an error, indicating it can’t perform the calculation.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. It tells you the highest percentage profit that was ever achieved during the position's entire history, pinpointing the moment that peak profit occurred. You provide the trading pair symbol, like "BTCUSDT," and it returns that highest profit percentage. If there's a problem, like no trading signals available, it will alert you.

## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a trading position. It calculates and returns the highest profit-and-loss cost experienced by a specific trading pair (like BTC-USD) since the position began. Essentially, it tells you the worst potential loss you faced while trying to achieve the best possible price for that trade. 

The function needs to know which symbol you're interested in to perform the calculation. It returns a promise that resolves to a numerical value representing that highest cost.

If there’s no active trading signal for that symbol, the function will stop and indicate an error.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its lowest point. It calculates the percentage difference between your current profit and loss (PnL) and the largest drop in PnL experienced. Essentially, it shows you how far your position has come back from its biggest setback. 

To use it, you provide the trading symbol (like 'BTCUSDT'). The function will return a number representing this drawdown recovery percentage. Keep in mind that it requires pending signals to be present to operate.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your trading position is from its lowest point in terms of profit and loss. It calculates the difference between your current profit and loss and the largest loss you've experienced – but only if that difference is positive. Essentially, it shows you how much "cushion" you have against potential further losses. To use it, you need to provide the trading symbol, like "BTC-USDT". The function will then return a number representing that distance in profit and loss. If there aren't any open trading signals, the function won't work and will let you know.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you understand how long a trade is expected to last. It gives you the estimated duration in minutes for a pending signal. 

Think of it as checking the expected lifespan of a trade before it's fully executed.

If there isn't a pending signal, the function will let you know. You need to provide the trading symbol to get this information.

## Function getPositionEntryOverlap

This function helps you avoid making duplicate DCA (Dollar Cost Averaging) entries when the price is very close to a previous entry level. It checks if the current price falls within a defined range around each existing DCA level.

Essentially, it prevents you from accidentally making multiple entries at nearly the same price.

The function takes the trading symbol and the current price as input. You can also customize the acceptable tolerance range around each DCA level, which is determined by percentages. If no existing DCA levels are found, it will return false.

## Function getPositionEntries

getPositionEntries lets you see how your current signal's position was built up, step by step. It gives you a list of each price and cost associated with opening the position, including any DCA (Dollar-Cost Averaging) steps you've taken. If you haven’t committed any DCA buys, you'll get a list with just one entry representing the initial position. If there’s no active signal, it will let you know. Each entry details the price at which it was bought and how much money was used for that purchase. You specify the trading pair, like 'BTC/USDT', to get the entries for that specific asset.

## Function getPositionEffectivePrice

This function helps you figure out the average price at which you've acquired a position for a specific trading pair. It calculates a weighted average, considering any previous partial closes and any direct purchases (DCA entries) you've made. If you haven't made any purchases or partial closes, it simply returns the initial price. It's designed to work seamlessly whether you're backtesting or in a live trading environment, and it will let you know if there's no pending signal to analyze. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionDrawdownMinutes

This function, `getPositionDrawdownMinutes`, tells you how much time has passed since a trading position reached its highest profit point. Think of it as a measure of how far the price has fallen from that peak. The value starts at zero when the position first hits its best performance and then steadily increases as the price declines. It's a way to gauge the duration of a pullback.

You’ll need a pending signal to use this function. It will let you know how long a position has been losing ground from its most profitable level. 

The function requires you to specify the trading symbol, like "BTCUSDT," to identify the position you want to analyze.


## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a particular trading position expires. It calculates this by looking at when the position was flagged as pending and comparing it to an estimated time. 

The result you get is the number of minutes remaining, but it will never be a negative number – if the estimated time has already passed, it will return zero.

If there’s no pending signal for the position you’re asking about, the function will let you know by throwing an error. To use it, you'll need to provide the symbol of the trading pair, like "BTC-USDT".

## Function getPositionActiveMinutes

getPositionActiveMinutes lets you check how long a trading position has been open. It gives you the number of minutes since the position was initially created. If there's a problem, like a missing trading signal, it will let you know. To use it, you simply need to provide the symbol of the trading pair you’re interested in, such as "BTCUSDT".

## Function getPendingSignal

This function lets you check if your trading strategy has a signal waiting to be executed. It retrieves the details of any pending signal for a specific trading pair, like 'BTCUSDT'. 

If there isn't a signal waiting, it will tell you by returning nothing. 

It works seamlessly whether you’re testing your strategy in a backtest or running it live, because it figures out the environment automatically. You just need to provide the symbol of the trading pair you're interested in.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls data from the exchange you're connected to. 

You can specify how many levels of the order book you want to see; if you don't, it uses a default value.

The function considers the current time when fetching data, which is important whether you're running a simulation or trading live. The exchange decides how to handle this timing information.


## Function getNextCandles

This function lets you grab a batch of future candles for a specific trading pair and time interval. Think of it as looking ahead to see what the price action might be like. It uses the underlying exchange's system to fetch those candles, ensuring you get the most accurate data available after the current time frame you're working with.  You tell it which symbol you're interested in, like "BTCUSDT," the candle interval – choices like "1m" for one-minute candles or "4h" for four-hour candles – and how many candles you want to retrieve.  The function then returns a promise that resolves to an array of candle data.


## Function getMode

This function lets you know whether the backtest-kit is running in backtest mode or live trading mode. It's a simple way to check the context of your code—are you analyzing historical data or actively making trades? The function returns a promise that will resolve to either "backtest" or "live", telling you the current operating environment.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how long it's been since the last trading signal was generated for a specific trading pair. 

It calculates the time in whole minutes – no fractions of a minute here. 

Whether the signal is still active or already closed doesn't matter, it just looks at the last signal recorded. This is handy if you need to implement a waiting period after a stop-loss order.

It first checks your backtest data and then moves to live data if needed. If no signals exist at all, it will let you know with an error. The function automatically knows whether it's running in a backtest or live environment.

You just need to provide the trading pair symbol (like "BTCUSDT") to use the function.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy was during a backtest. It calculates the largest percentage difference between the highest profit and the lowest loss seen during the strategy’s performance. 

Think of it as measuring the "distance" between the best and worst points on a profit/loss chart. 

Specifically, it looks at the peak profit percentage and the deepest drawdown percentage and finds the difference, ensuring the result is never negative. 

You need to provide the trading pair symbol (like "BTC-USD") as input, and the function will return a number representing this maximum drawdown distance. If there's no trading signal to analyze, it will let you know with an error.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit you made and the lowest point your profits dropped to during a backtest. 

Essentially, it tells you how much you could have lost from a peak gain. 

The calculation specifically focuses on the profit and loss (PnL) aspect, and it ensures the result is always zero or positive.

You provide the trading pair symbol (like "BTC-USDT") to the function, and it returns this drawdown distance as a number.

If the backtest doesn't have any trading signals, the function will let you know it can't proceed.

## Function getMCPSchema

The `getMCPSchema` function helps you access the details of a specific Model Context Protocol (MCP) that's been registered within the system. Think of an MCP as a blueprint for how different components interact. 

You provide the name of the MCP you're interested in, and the function returns a structured description of its elements and how it functions. This allows your code to understand and work with that particular MCP in a consistent way.  It's like looking up the official documentation for a specific process within the framework.


## Function getLatestSignal

This function helps you find the most recent signal—whether it's still active or has already closed—for a specific trading pair. It's really handy for things like cooldown periods. For example, you could use it to prevent opening a new trade right after a stop-loss triggers by checking the timestamp of the last signal. 

It looks for signals first in the historical backtest data and then in real-time data if it can't find anything in the backtest. If no signals exist, it will alert you with an error.  You don’t need to worry about whether you are running a backtest or live, it figures that out on its own.

You just need to provide the trading pair symbol, like "BTCUSDT", to get the latest signal information.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the details of a specific frame within your backtest setup. Think of it as finding the blueprint for how a particular piece of data is organized and used in your trading simulations. You provide the frame's unique name, and the function returns a description of its structure – essentially telling you what data it holds and how it's formatted. This is useful for understanding your data flow or dynamically adjusting your backtesting logic.

## Function getExchangeSchema

This function lets you fetch the details of a specific trading exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works, including things like what data it provides and how its trades are structured. You give it the name of the exchange you’re interested in, and it returns a structured object containing all that information. It’s useful for understanding the data you'll be working with and ensuring your backtesting strategies are compatible with the chosen exchange.


## Function getDefaultConfig

This function gives you a set of default settings for how the backtesting framework operates. It's like a starting point – a template showing all the adjustable knobs and levers that control things like how often data is fetched, how much slippage to account for, and limits on the number of signals generated. Think of it as a cheat sheet to understand all the configuration possibilities before you start customizing your own setup. You can look through the values to get an idea of the system’s baseline behavior.

## Function getDefaultColumns

This function provides you with a set of pre-defined column configurations used for generating reports. Think of it as a template for structuring your data tables. It gives you a clear picture of all the column options available, like those for strategy results, performance metrics, risk events, and more. You can examine the default settings to understand how each column is defined and then customize them as needed to fit your specific reporting needs.

## Function getDate

This function, `getDate`, simply retrieves the current date. 

It behaves differently depending on whether you're running a backtest or live trading.

During a backtest, it gives you the date associated with the specific historical timeframe being analyzed.  When running live, it returns the current, real-time date. It's a straightforward way to access the date relevant to the trading context.

## Function getContext

This function retrieves information about the environment in which your code is currently running. Think of it as a way to get a snapshot of the state of things during a specific part of your trading strategy. 

It returns a promise that resolves to a context object, giving you access to details like the current method and any relevant data associated with it. This can be helpful for debugging or tailoring your strategy's behavior based on the execution context.


## Function getConfig

This function lets you peek at the framework's internal settings. It provides a snapshot of all the configuration values that control how backtesting and trading simulations run. Think of it as a way to understand the defaults and fine-tuning options available.  The values cover areas like how frequently data is updated, limits on how many signals are generated, and settings related to order execution and reporting. Because it returns a copy, any changes you make won't affect the actual running configuration.

## Function getColumns

This function provides access to the column configurations used for generating reports. 

It gives you a view of the columns being used for backtest results, heatmap data, live trading information, partial fills, breakeven points, performance metrics, risk management, scheduling, strategy events, synchronization, profit tracking, drawdown analysis, walker panel profit and loss, and overall strategy results.

Importantly, the returned configuration is a copy, so any changes you make won’t affect the original settings. Think of it as a read-only snapshot of how your report columns are currently set up.

## Function getClosePrice

This function helps you retrieve the most recent closing price for a specific trading pair. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you're interested in, such as "1h" for a one-hour candle. It returns a promise that resolves to the closing price found for that candle. This is useful for quickly checking the latest market price without downloading a full history of data.


## Function getCandles

This function allows you to retrieve historical price data, known as candles, for a specific trading pair. You tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and how frequently you want the data – options range from one-minute intervals to eight-hour periods.  Specify how many candles you need, and the function will fetch them from the connected exchange. The data is pulled based on the current time and goes back into the past. The data returned is an array of candle objects, each containing information like open, high, low, close prices, and the timestamp.

## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover transaction costs. It checks if the current price has moved beyond a calculated threshold, which takes into account slippage and fees. Essentially, it tells you if you’ve made enough profit to break even on the initial trade. The function automatically figures out whether it's running in a backtest or a live trading environment. You'll need to provide the trading symbol and the current price to use it.

## Function getBacktestTimeframe

This function helps you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates, representing the timeframe that's been set up for testing. You provide the symbol of the trading pair you’re interested in, and it gives you the dates you can use for your backtest. Essentially, it tells you what historical data is ready for your simulated trades.

## Function getAveragePrice

This function, `getAveragePrice`, helps you determine the Volume Weighted Average Price (VWAP) for a specific trading pair, like BTCUSDT. 

It looks at the five most recent one-minute price candles to figure this out. The calculation involves finding the typical price of each candle (average of high, low, and close) and then weighting it by the volume traded at that price. 

If trading volume isn't available, it defaults to a simple average of the closing prices. To use it, you simply provide the symbol of the trading pair you're interested in.


## Function getAggregatedTrades

This function retrieves historical trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you've configured.

You can request all trades within a defined timeframe, or specify a `limit` to fetch only a certain number of recent trades. The trades are returned in reverse chronological order. If you don't set a `limit`, the function will gather trades from within a defined time window.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it as looking up a detailed description of what a particular action – like placing a buy order or calculating an indicator – is supposed to do. You give it the action's name, and it returns a structured definition that outlines all the information needed for that action. This is particularly useful when you need to validate or understand the expected input and output for a specific action in your trading system.


## Function formatQuantity

This function helps you display the correct quantity of an asset when trading, ensuring it adheres to the specific formatting rules of the exchange you're using. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity value as input. The function then uses the exchange's own formatting method to accurately represent the quantity, including the right number of decimal places. This is particularly important to avoid order rejections or errors due to incorrect formatting.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input. It then formats the price according to the specific rules of the exchange, ensuring the right number of decimal places are shown. This avoids manually calculating decimal places and adapts to the exchange's standards.


## Function dumpText

This function lets you save raw text data, like logs or reports, associated with a specific trading signal. Think of it as creating a snapshot of information relevant to a particular trade. It automatically figures out whether you're in a testing (backtest) environment or a live trading situation. You provide the data as a structured object containing the bucket name, a unique ID for the dump, the text content itself, and a short description of what the content represents.  The function handles the technicalities of saving the data in the right place and adapting to the environment.


## Function dumpTable

This function helps you display data in a clean, table format. It's designed to take an array of objects (like data from a backtest or simulation) and present it in a way that's easy to read.

It automatically figures out the right settings for where the table data is displayed, whether you're in a backtesting environment or running a live simulation. The column headings for the table are generated based on all the different properties found in your data.

You just provide the data—the function handles the rest, creating a useful and organized view of your results.


## Function dumpRecord

The `dumpRecord` function allows you to save a specific record of data – think of it as a snapshot of information – to a designated storage location. It’s designed to capture key-value pairs and associate them with a unique identifier and a descriptive note. This function intelligently handles the background process of identifying the active trading signal, whether you're in a testing environment (backtest) or a live trading scenario. Essentially, it provides a straightforward way to persist records for later analysis or review, simplifying the data management process within the trading framework. The data you pass in will be saved with the specified bucket and dump ID.


## Function dumpMCPStatus

This function helps you create a detailed report of the Model Context Protocol (MCP) status, tailored to the specific trading signal you're working with. It automatically figures out whether you're running a backtest or a live trading scenario.

The resulting report will be saved as a markdown file, combining text messages and including any embedded images as linked images.

You have options to control how this report is created, including silencing it completely or generating a simpler, text-only version for easier searching.

The function requires a data transfer object (`dto`) which includes the bucket name, a unique dump ID, the list of MCP messages, and a descriptive text.


## Function dumpJson

The `dumpJson` function lets you record complex data structures as formatted JSON within your trading strategy's logs. Think of it as a convenient way to save detailed snapshots of your strategy's state at specific points in time. It handles the formatting and automatically incorporates the relevant signal information for clear tracking.  The function takes an object containing the data you want to save, a description for the log entry, a unique dump ID, and the name of the bucket to store the data in. It works seamlessly whether you're running a backtest or a live trading session.


## Function dumpError

The `dumpError` function helps you report detailed error information linked to a specific trading signal. It's designed to simplify the process of recording and understanding errors during backtesting or live trading. This function takes an object containing the bucket name, a unique dump ID, the error description, and some content. It automatically figures out whether the process is a backtest or a live environment, and it handles resolving any pending or scheduled signals. Essentially, it's a convenient way to flag and document issues that arise during your trading activities.


## Function dumpAgentAnswer

The `dumpAgentAnswer` function allows you to output the complete conversation history with the agent, associating it with a specific signal. It's useful for debugging and auditing how the agent interacted during a trading scenario.

The function automatically figures out the correct signal to associate the conversation with, regardless of whether you're running a backtest or live trading. You simply provide the data containing the conversation messages, a description, and a unique identifier. The function handles the rest, ensuring the information is properly saved and linked.

## Function createSignalState

This function, `createSignalState`, helps you manage and track the state of your trading signals. It gives you a pair of functions – `getState` and `setState` – that are automatically linked to the current trading context, meaning you don't have to manually specify signal IDs. It's particularly useful for complex strategies, like those driven by AI, where you're building up information about each trade over time, such as maximum gains or how long a trade is open. The function intelligently figures out whether you're running a backtest or a live trade, simplifying your code. You can use this to track key metrics and adjust trades based on conditions like how long a trade has been open and its maximum percentage gain.

## Function commitTrailingTakeCost

This function lets you set a specific price for your take-profit order, regardless of any percentage-based adjustments you might have initially used. It's a handy shortcut for changing your take-profit to a fixed price point.

The system automatically figures out if you're in a backtesting or live trading environment, and it retrieves the current market price to calculate the necessary adjustments. 

You provide the trading symbol and the new, absolute take-profit price you want to set. The function then handles the complex calculations behind the scenes to make the adjustment.


## Function commitTrailingTake

This function helps manage your take-profit levels when using a trailing take-profit strategy. It lets you dynamically adjust the distance of your take-profit order from the original take-profit level you set initially.

It’s really important to understand that it always calculates changes based on the original take-profit, not any adjustments that have already been made. This helps avoid small errors from adding up over time.

If you provide a smaller, more conservative take-profit target, the function will update the level. If you give it a more aggressive target (further from entry), it will only make the change if it's a less aggressive shift.

Essentially, for long positions, it only moves your take-profit closer to your entry price. For short positions, it only moves your take-profit further away from your entry price. The function intelligently determines if you're running a backtest or a live trade.

You provide the symbol of the trading pair, the percentage adjustment you want to make to the original take-profit distance, and the current price to evaluate.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss to a specific price. It's a simple way to set the stop-loss, figuring out the percentage shift based on where the original stop-loss was placed. 

It works whether you're doing a backtest or live trading. 

The function automatically gets the current market price to calculate the new stop-loss level.

You'll need to provide the trading symbol and the new stop-loss price you want to use.


## Function commitTrailingStop

This function helps you refine your trailing stop-loss orders. Think of it as a way to dynamically adjust how far your stop-loss is from your entry price.

It’s important to remember that the adjustment is always based on the initial stop-loss you set, not any adjustments made previously. This prevents small errors from adding up over time.

The `percentShift` determines how much the stop-loss distance changes. A negative shift brings your stop-loss closer to your entry price, while a positive shift moves it further away.  However, the system only updates the stop-loss if the new value improves your protection – it always aims to safeguard your profits.

For long positions, your stop-loss can only move upwards (away from the entry price); for short positions, it can only move downwards (closer to the entry price).

Finally, this function handles whether it’s running in backtesting mode or live trading without you needing to worry about it.  It needs the trading pair symbol, the percentage shift you want to apply, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes about what your strategy is doing – maybe you want to note when a specific indicator triggers, or when you're taking action. These notes don't change your positions, they’re just for providing context. The framework automatically includes information like the trading symbol, the name of your strategy and exchange, and the current price, so you don't have to manually add those details. You can also add your own custom information to the notification using the `payload` parameter. It will automatically determine if it's running in backtest or live mode.


## Function commitPartialProfitCost

This function lets you partially close a trading position when you've reached a specific profit level, measured in dollar amounts. It simplifies the process by automatically calculating the percentage of the position to close based on the dollar amount you specify.

Think of it as a way to lock in some profits as your trade moves towards its target profit.

It handles whether you’re in a backtesting or live trading environment and figures out the current price for you.

To use it, you just need to provide the trading pair’s symbol and the dollar amount you want to recover. For example, providing $150 will close a portion of the position worth $150.


## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially helping you secure some gains as the trade progresses. You specify which symbol you’re dealing with and the percentage of the trade you want to close – for example, closing 25% of the position. This function handles whether you’re running a backtest or a live trade, simplifying the process. It's designed to help you manage risk and lock in profits as your trades move toward their target price.


## Function commitPartialLossCost

This function helps you partially close a trading position when you're already experiencing a loss, and you want to limit further losses. It automatically calculates the percentage of your position to close based on a specific dollar amount you specify. Think of it as a way to move your stop-loss order closer to your current price.

It simplifies the process by handling the conversion between dollar amounts and position percentages and will automatically determine whether you're in a backtesting or live trading environment. 

You provide the trading symbol and the dollar value you want to reduce your position by, and the function takes care of the rest, finding the current price to execute the trade. This function is designed to be used when the price is moving in the direction of your stop-loss.


## Function commitPartialLoss

This function lets you close a portion of an open trade when the price is heading towards your stop-loss level. Think of it as a way to reduce your risk and lock in some profits when things aren't going exactly as planned. You specify the trading symbol and the percentage of the trade you want to close, like closing 25% or 50% of your position. The system will automatically handle whether it's running in a backtesting environment or a live trading account. It’s important to remember this function is intended to be used when the price movement aligns with the direction of your stop-loss – meaning it's moving toward a potential loss.

## Function commitCreateTakeProfit

This function lets you tell the backtest kit that a take-profit order for an open position has been triggered on the exchange. It’s useful when the actual order execution happens outside the VWAP-based take-profit calculations the framework performs.

Think of it as a way to manually confirm the trade closure.

It's important because the strategy and exchange operate somewhat independently; a take-profit might be triggered by a price movement even as the framework's calculations are ongoing.

This function ensures the backtest kit accurately reflects what happened in the real world, marking the close with the reason "take_profit."  It won’t do anything if there isn't a pending signal already active. 

The function automatically recognizes whether it’s running in backtest or live trading mode. You can include extra details, like an ID and note, with the optional payload.

## Function commitCreateStopLoss

This function lets the backtest framework know that a stop-loss order for a position has been filled on the exchange. This is important because sometimes the actual order execution happens at a different price than what the VWAP-based stop-loss calculation predicted. 

Essentially, it bridges the gap between the strategy's calculations and what actually happened on the exchange.

It’s a way of confirming that the position has been closed due to a stop-loss, and the framework will reflect this with a "stop_loss" reason for the close. It won’t do anything if there isn't a pending position to close.

The function handles whether you're in a backtest or live trading environment automatically.

You can optionally include extra information, like an ID or note, with the function call to help track or annotate the event.


## Function commitCreateSignal

This function lets you feed custom signals into the backtest or live trading environment. Think of it as a way to inject your own signals, bypassing the standard signal retrieval process. 

You provide a symbol and a data object (the signal DTO).

The system will try to execute your signal right away. If you include a `priceOpen` value, it will execute immediately if that price is already reached; otherwise, a pending signal is created, waiting for the price to match.

Before executing, the system checks if your signal is valid and makes sure you’re not trying to inject multiple signals at once. The framework knows whether it's running a backtest or live trading session automatically.


## Function commitClosePending

This function lets you close a pending trade signal without interrupting your trading strategy. Think of it as a way to manually resolve a pending order without pausing the strategy’s ongoing analysis and signal generation. It won’t affect any signals that are already scheduled or stop the strategy from creating new ones; it just clears the pending signal itself. The function intelligently adjusts its behavior based on whether it’s running a backtest or a live trading session. You can optionally include details like an ID and a note with the commit.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy's normal operation. Think of it as removing a future signal from the queue – it won't be executed, but the strategy itself will keep running and generating signals. It won't affect any existing orders or stop the strategy from producing more signals in the future. It intelligently figures out if you're in a backtesting or live trading environment.

You can optionally include extra information like an ID or a note with the cancellation.


## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss order. It moves the stop-loss to the entry price – essentially making the trade risk-free – once the price has moved favorably enough to cover any fees and a small slippage buffer.

Think of it as a safety net that turns into a profit lock once the trade has gained enough ground.

The function handles things like determining whether you're in a backtesting environment or a live trading situation and retrieves the current price for calculations.

You just need to provide the trading pair symbol to use this feature.


## Function commitAverageBuy

This function lets you add a new purchase to your dollar-cost averaging (DCA) strategy for a specific trading pair. It essentially records a purchase at the current market price, building a history of your buys.  As you add more purchases, it calculates and updates the average price you paid for the asset.  The system automatically determines whether it's running in a backtest or live environment and retrieves the current price for the trade. You can also optionally specify a cost associated with the purchase.


## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal to activate before the price reaches the planned target. Think of it as giving a signal a head start. It essentially sets a flag that tells the strategy to treat the signal as active on the next price update.  The function adapts to whether you're in backtesting or live trading automatically, so you don't have to worry about that.  You can optionally include extra information with the activation, like an ID and a note for record-keeping purposes.


## Function checkCandles

The `checkCandles` function is a quick way to see if your historical trading data (candles) are already stored and ready to use. It checks your data storage, also known as the persist adapter, to see if the candles you need exist without having to load everything. This is done efficiently; the function only verifies the presence of each specific timestamp you're looking for. If even one candle is missing or out of sync, the entire check will fail, letting you know there's a problem before you begin a backtest. You pass in some settings, or parameters, to tell it what candles to check.

## Function cacheCandles

This function helps make sure your trading system has the historical candle data it needs. It fetches and stores candles for a specific trading symbol, time interval, and date range from a particular exchange. It works in two stages: first, it checks if the data already exists, and if not, it downloads the missing pieces and verifies the data again to ensure everything is accurate. You provide the symbol, interval (like 1 minute or 1 day), the start and end dates, and the name of the exchange to pull data from. There's also a mechanism to report progress during the initial check and when the data is being refreshed.

## Function addWalkerSchema

This function lets you register a custom walker, which is a crucial component for comparing the performance of different trading strategies. Think of a walker as a system that runs multiple backtests—one for each strategy—using the same historical data. It then assesses how well each strategy did, based on a metric you define. You provide a configuration object that tells the framework how to execute and evaluate these backtests, allowing for detailed performance comparisons.

## Function addSweepSchema

The `addSweepSchema` function lets you define and register a sweep, which is essentially a way to systematically test and optimize trading strategies. It's designed to run multiple simulations of a trading idea, varying different parameters.

During a sweep, each configuration is run once, letting the framework evaluate the strategy's performance across a range of conditions.

The function takes a sweep configuration object as input, which describes how the sweep will be executed. It automatically handles things like running simulations, training a whitelist for allowed exchanges, and evaluating the results to find potentially effective parameter combinations. You can customize the parameters being tested, and if you don't specify certain parameters, the framework will use default values.

## Function addStrategySchema

This function lets you register a new trading strategy with the backtest-kit framework. When you register, the framework will automatically check your strategy's settings to make sure it’s working correctly, like verifying the signals it produces and preventing it from sending too many signals at once.  Furthermore, when running in live mode, the framework handles ensuring the strategy’s data is saved reliably even if there are unexpected problems. To register, you simply provide the strategy's configuration as an object.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as defining your risk management rules. 

You'll provide a sizing schema – a set of instructions – that outlines things like how much of your capital to risk on each trade, the methods used for calculating position size (like fixed percentage, or more advanced techniques), and any limits on how large a position can be. 

Essentially, it’s how you teach the system to manage risk and control the size of your trading positions during the backtest. The sizing schema itself is a specific object that you’ll need to structure according to the framework’s requirements.


## Function addRiskSchema

This function lets you set up how your trading strategies manage risk. Think of it as defining the boundaries within which your strategies can operate.

You can specify limits on the total number of positions your strategies can hold at once.

It also allows for more complex risk checks beyond simple position limits, like analyzing portfolio metrics or correlations between assets. 

You can even define what happens when a trading signal is flagged as risky – either automatically reject it or allow it with a warning.

Importantly, this risk configuration is shared across all strategies using the same risk management instance, providing a holistic view of overall portfolio risk and ensuring they work together safely.

## Function addMCPSchema

This function lets you connect your trading strategy to an external system, often called an MCP agent, allowing it to monitor and control your trades in real-time. Think of it as building a bridge that allows another application to understand what your strategy is doing and even send it commands. 

You provide a configuration object that describes how this connection should work. This configuration handles things like how often the strategy’s status is reported and how portfolio information is displayed to the MCP agent. If you don't specify how the portfolio information is displayed, a basic text-based output will be used. Essentially, this setup allows external systems to stay informed and potentially interact with your trading strategy.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting simulations. Think of it as adding a new type of data feed, but instead of data, it's defining how your time periods are structured. 

You provide a configuration object that outlines the start and end dates of your backtest, the frequency of the timeframes (e.g., daily, hourly), and a function that will be called when new timeframes are generated. This allows for very flexible and customized backtesting scenarios. Essentially, you’re teaching the framework how to create the timeline for your tests.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your trading strategies. Think of it as adding a new data source.

You provide a configuration object, which tells the framework how to fetch historical price data, format the way prices and quantities are displayed, and calculate a common indicator called VWAP based on recent trades.

Essentially, it prepares the system to work with the specific data coming from that exchange.


## Function addActionSchema

addActionSchema lets you tell the backtest-kit framework about a new action you want it to perform during backtesting. Think of actions as ways to react to events happening in your trading strategy – like when a signal is generated or a trade reaches a profit target.

These actions can be used to do things like update a state management system, send notifications to a chat platform, log events, or even trigger custom calculations. 

The framework will create a specific instance of your action for each combination of strategy and timeframe, giving it all the important data from that simulation run.

You provide an `actionSchema` object which contains the configuration details for how the action should be executed.
