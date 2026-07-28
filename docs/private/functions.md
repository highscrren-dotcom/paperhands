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

The `writeMemory` function lets you store data persistently within your trading strategies, associating it with a specific "bucket" and identifier. Think of it as creating labeled containers for information that needs to be remembered across different parts of your code or even across multiple executions. 

It's particularly useful for remembering things like past calculations, configuration settings, or important metrics. 

The function handles the complexities of knowing whether you're running a backtest or live trading, automatically adapting to the environment. It also takes care of integrating with the system's signal handling, ensuring that any pending signals are processed as needed. 

To use it, you provide a data transfer object (DTO) that includes the bucket name, a unique memory ID, the value you want to store, and a short description to help you understand its purpose. The data will be stored, and the function will resolve once completed.


## Function warmCandles

This function helps speed up backtesting by pre-loading historical price data. It downloads candles – essentially, bars of price data – for a specified time period. Think of it as preparing the data in advance so your backtest can run more smoothly without constantly fetching it on the fly. You tell it a start date (`from`) and an end date (`to`), along with the data interval (e.g., 1-minute, 1-hour), and it will retrieve and store those candles. This is particularly useful for longer backtesting periods or when dealing with slower data feeds. It's a way to avoid delays during your tests and keep things running efficiently.

## Function waitForReady

This function helps ensure everything is set up correctly before you begin backtesting or live trading. It waits for the necessary data registries – those defining how exchanges, trading strategies, and historical data (frames) are structured – to be fully populated.

It essentially checks these registries every second until they're ready.

If you're performing a backtest, it makes sure all three types of registries (exchange, frame, and strategy) are available. For live trading, only the exchange and strategy registries are needed.

Think of it as a safety net at the start of your process, preventing errors that might occur if you tried to trade before everything was prepared. It's particularly helpful when components load asynchronously. If things don't load within a reasonable time, the function completes without erroring out, and you'll get an error message when you try to start the actual trading process.

You can specify whether you are running a backtest or live trade by setting the `isBacktest` parameter. When `true`, it verifies that the frame schema is also registered.

## Function validate

This function, `validate`, helps you ensure everything is set up correctly before you run any tests or optimizations. It checks that all the entities you're using – like exchanges, strategies, and risk settings – actually exist and are properly registered within the system.

You can tell it to validate specific entity types, or if you leave it blank, it will automatically check *everything*.

Think of it as a quick sanity check to avoid errors down the line, making sure all your pieces fit together. It remembers the results of previous validations to speed things up too.

## Function stopStrategy

This function lets you pause a trading strategy. It effectively tells the strategy to stop creating new trading signals. 

Any existing trades will finish normally, but no new ones will be started. The system will gracefully stop the strategy, whether it's in backtesting or live trading mode, usually at a point where it's safe to do so. 

You just need to specify the trading pair (like BTC-USDT) you want to pause the strategy for. The system figures out which strategy is active based on the current context.


## Function shutdown

This function provides a way to safely stop the backtesting process. It sends a signal that lets all parts of the system know it's time to wrap things up, allowing them to finish any important tasks, like saving data or closing connections. Think of it as a polite way to exit, ensuring nothing gets left unfinished. It's especially useful when you need to stop the backtest because of an external signal, like a user pressing Ctrl+C.


## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. It's useful if you need to investigate something, adjust settings, or prevent trades for a period.

When paused, the strategy won’t react to new market signals and won't create any new trade orders. However, it will still manage any existing open positions and scheduled trades, ensuring they are handled correctly.

Think of it as putting the strategy on hold. The setting is saved, so it remains paused even after a restart. To get the strategy back to normal, you need to explicitly resume it using `setStrategyPaused(symbol, false)`. 

You'll receive notifications about these pause events so you know when the strategy's status changes. The system automatically knows if it's running in backtesting or live trading mode.


## Function setSignalState

This function helps you manage and update the state associated with a specific trading signal. It's particularly useful when you're building strategies that involve accumulating data over multiple trades, like those used in sophisticated AI-driven approaches. 

The function automatically figures out whether you're in a backtesting environment or live trading mode, so you don’t need to worry about that.

It expects that there’s either a pending or scheduled signal already in place – if not, it will let you know. 

Essentially, it’s designed for strategies that track things like how long a trade is open and its peak profit or loss, and then use that information to make decisions about when to exit a trade. It’s geared towards strategies that aim for modest profits while carefully managing risk.

## Function setSessionData

The `setSessionData` function lets you store information that's relevant to a particular trading setup—like a specific symbol, strategy, exchange, and timeframe. Think of it as a temporary storage space that remembers things between candles during a backtest or even when your trading process restarts while running live.

This is really handy for holding onto things like the results of complex calculations or indicator states that you need to reuse across multiple candles.

You can also clear out this data by setting the value to null, effectively erasing the stored information. The function automatically adjusts to whether you're in backtest mode or live trading mode.

It takes two pieces of information: the symbol you're trading (like "BTC-USDT") and the value you want to store. The value can be any object or you can pass null to clear the data.

## Function setLogger

This function lets you plug in your own logging system for backtest-kit. 
You provide a logger that follows the `ILogger` interface, and all the framework's internal messages will be sent to it. 
It automatically adds useful information to the log messages, like the strategy name, exchange, and trading symbol, so you have more context when debugging or analyzing your backtests.

## Function setConfig

This function lets you adjust how backtest-kit operates globally. You can pass in a set of settings to change, like how data is handled or how calculations are performed. Think of it as fine-tuning the engine of the backtesting system.  

If you're working in a testing environment, there's a special `_unsafe` flag you can use to bypass some safety checks – this is usually needed for automated tests where you have more control over the setup. Be careful when using this flag, as it skips important validations.

## Function setColumns

This function lets you customize the columns that appear in your markdown reports, like those generated after a backtest. You can change things like the names, data types, or how the data is displayed. Think of it as tailoring the reports to show exactly the information that’s most important to you. 

The function accepts a configuration object that specifies your desired column changes. Importantly, it usually checks that your changes make sense to ensure the report isn't broken—unless you use the `_unsafe` flag, which is intended only for testing scenarios where you need to bypass those validations.

## Function searchMemory

The `searchMemory` function helps you find relevant memory entries based on a search query. It's designed to quickly locate information within your trading system's memory, using a technique called BM25 to rank the results by relevance. 

It simplifies the process by automatically figuring out which signal you’re currently working with and whether you’re running a backtest or a live trading session. You provide a `bucketName` to specify where to search and a `query` to define what you're looking for.

The function returns an array of results, each including a unique `memoryId`, a `score` indicating how well it matches your query, and the actual `content` of the memory entry. The `content` is typed based on the structure of data you're storing in memory.

## Function runInMockContext

This function lets you execute a piece of code as if it were running within a specific trading environment, but without actually running a full backtest.

It's great for testing and development. You can call functions that rely on the trading context – like getting the current timeframe – without needing a complete backtest setup.

You can customize the simulated environment by providing details like the exchange, strategy, timeframe, and trading symbol. If you don't provide these details, it uses default values, creating a simple live-mode context. 

The `when` parameter automatically sets the time to the beginning of the current minute.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as clearing out old data related to a particular trading decision. It automatically adjusts its behavior depending on whether you're running a test backtest or a live trading session.

You'll provide the name of the memory bucket and the unique ID of the memory entry you want to remove. 

The function handles the removal process efficiently and ensures it works correctly in different operational contexts.


## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in memory, specifically linked to a particular signal. Think of it as accessing a saved value related to a specific trading event or process. 

It automatically figures out which signal you're working with, and whether you're in a backtesting or live trading environment, so you don’t need to worry about that. 

You provide a description of where the data is located, including the bucket name and a unique identifier for the memory. The function will then return the data, formatted as an object of a type you specify.


## Function overrideWalkerSchema

This function lets you modify a previously defined trading strategy's walker configuration. Think of it as making tweaks to an existing strategy's setup, rather than creating a brand new one. You can selectively change specific parts of the walker – things like data sources or analysis methods – while keeping the rest of its settings intact. It's useful when you want to compare strategies with slight variations in their walkers. The function takes a partial configuration object representing the changes you want to make.

## Function overrideSweepSchema

This function lets you modify an existing sweep configuration. Think of it as updating a portion of a pre-defined trading setup. It’s useful when you want to change something like the number of bars to process without re-creating the whole sweep. Be aware that changes might not affect already running sweeps – you might need to clear the cache to ensure updates apply to new sweeps. You'll provide a partial configuration object that specifies what you want to change.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already been set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy—you can change specific settings without having to rebuild the entire strategy from scratch.

You provide a partial configuration object, and this function will update just the parts of the strategy that you've specified, leaving everything else untouched. It’s useful for making smaller adjustments or updates to strategies already in use. The function returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you adjust a position sizing strategy that's already set up within the backtest kit. Think of it as making small tweaks to an existing sizing plan. You provide a set of changes you want to make, and only those specific settings will be updated; everything else about the original sizing strategy stays the same. It’s useful when you need to refine a sizing schema without rebuilding it from scratch.


## Function overrideRiskSchema

This function lets you modify a risk management setup that's already been defined. Think of it as a way to tweak existing rules – you don't create a whole new one, just adjust specific parts. It's useful when you want to fine-tune parameters without rebuilding the entire risk configuration. You supply a new set of settings, and only those settings get updated; everything else stays the same.


## Function overrideMCPSchema

You can change parts of an existing MCP (Market Participant) configuration. This function lets you update specific settings within a previously defined MCP without needing to redefine the entire thing. It’s like making small tweaks to an existing setup. Only the settings you provide will be changed; everything else stays as it was. You give it a new partial configuration, and it returns a promise resolving to the updated MCP configuration.

## Function overrideFrameSchema

This function lets you modify how data is structured and handled during backtesting for a specific timeframe. Think of it as fine-tuning a timeframe's settings. 

It doesn't replace the entire timeframe configuration; instead, it allows you to update just the parts you want to change. Only the information you provide in the `frameSchema` argument will be altered, leaving the rest of the timeframe's settings as they were originally defined. This is helpful when you need to adjust things like data fields or aggregation methods without affecting other aspects of the timeframe.


## Function overrideExchangeSchema

This function lets you modify existing exchange data sources within the backtest-kit framework. Think of it as a way to tweak a previously set-up exchange – you don't need to rebuild it from scratch. 

You provide a partial configuration – only the parts you want to change – and the framework will update the existing exchange, leaving everything else untouched. It's perfect for adjusting settings without a full re-registration.

The function returns a promise that resolves with the updated exchange schema.


## Function overrideActionSchema

This function lets you tweak how a specific trading action, like placing an order or canceling one, behaves without completely replacing its existing setup. Think of it as a targeted adjustment – you provide only the parts of the action's configuration that you want to change, and the rest remains as it was. 

It's super handy for things like swapping out how an action responds in a development environment versus production, or quickly modifying the logic used without having to rewrite the whole action. You can dynamically change how actions are handled, all while keeping your core strategy intact. It’s great for keeping your code flexible and adaptable.


## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. It's like setting up a listener that gets notified after each trading strategy finishes within the backtest.

You provide a function (`fn`) that will be called with information about each completed strategy.

This listener is designed to be reliable: even if your callback function takes time to process, the events will be handled in the order they're received, and queued to prevent any issues from overlapping calls.

The function returns another function that you can call to unsubscribe from these progress updates, cleaning up when you're done.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to events as they happen during a backtest, but only once a specific condition is met. You provide a filter – essentially a rule – that determines which events you're interested in. When an event matches that rule, a function you provide is executed. Once that event is processed, the listener automatically stops listening, so you don’t have to worry about managing subscriptions yourself. This is a handy way to monitor for particular milestones within your backtest process.

You define the filter function to specify the events you want to react to. 
Then, you provide the function that will run when a matching event occurs.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes, ensuring all strategies have been tested. It's designed to handle events in the order they arrive, even if the notification involves asynchronous operations. Think of it as setting up a listener that will call your provided function once the entire backtesting process is done. Importantly, it prevents multiple callbacks from running at the same time, guaranteeing orderly processing. You provide a function that will be executed upon completion, and this function returns another function you can use to unsubscribe from these notifications later.

## Function listenWalker

The `listenWalker` function lets you keep track of how a backtest is progressing. It’s a way to be notified after each strategy finishes running within the backtest. This function ensures that any code you provide to handle these notifications runs one step at a time, even if your notification code takes some time to complete. To use it, you provide a function that will be called with information about the strategy that just finished. Essentially, it's like setting up a listener to receive updates during the backtest process.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. It’s like setting up an alert system that triggers whenever a risk validation process encounters an error.

You provide a function that gets called when these errors occur, allowing you to debug and monitor what's going on.

Importantly, errors are handled one at a time, so you won’t have any race conditions or unexpected behavior. It makes sure everything is processed in the order it happens.


## Function listenSyncOnce

This function lets you set up a listener that will only react to a specific type of signal synchronization event once. It's perfect for situations where you need to perform a single action based on a particular event.

Think of it as a gatekeeper for orders – if your listener throws an error, it can prevent the order from being processed, similar to how `listenSync` works. You need to be aware of the different types of errors that can occur – some might be temporary and retryable, while others indicate a more serious problem that requires immediate attention.

You provide a filter function to decide which events should trigger the listener, and then a callback function that will be executed *once* when a matching event occurs. If your callback returns a promise, the system will pause and wait for that promise to resolve before continuing.

## Function listenSync

The `listenSync` function lets you hook into events that happen when signals are being synchronized, like when an order is being opened or closed. It's designed for situations where you need to react to these signals and potentially influence the order's outcome.

Think of it as a gatekeeper for orders - if your listener function throws an error, it can prevent the order from going through, influencing whether it's retried or immediately rejected.

The function takes a callback which will be invoked whenever a synchronization event occurs. This callback has the power to control how the system handles the event. Different types of errors thrown from your callback dictate distinct behaviors: transient errors will trigger retries, rejected errors will stop the attempt entirely, and deleted errors are treated as transient. 

The `warned` parameter allows for future extensibility, but is not currently used.

## Function listenStrategyCommitOnce

This function lets you monitor changes to your trading strategies, but with a twist: it only reacts once. You provide a rule to identify the specific strategy events you're interested in. When an event matches that rule, a provided function runs just once to handle it, then the monitoring automatically stops. It's perfect for situations where you need to respond to a single, specific event related to your strategy's setup or updates. 

Essentially, it's a temporary listener that cleans up after itself.

The `filterFn` determines which events are relevant.
The `fn` is executed when a matching event occurs.


## Function listenStrategyCommit

This function lets you keep an eye on important changes happening within your trading strategies. It's like setting up a notification system – whenever a strategy adjusts its positions based on events like hitting profit or loss targets, or moving stop-loss orders, you'll be informed.

The notifications are handled in a specific order, and the system ensures that processing these events doesn't interfere with each other, even if your notification handling involves asynchronous operations.

You provide a function, and this function will be called whenever one of these events occurs, giving you a chance to react or log the changes. When you're done needing these notifications, the function returns another function that you can use to unsubscribe.

## Function listenSignalOnce

`listenSignalOnce` lets you set up a listener that reacts to a specific type of trading signal, but only once. You provide a filter to define what kind of signal you're looking for, and a function to execute when that signal arrives. Once the matching signal is received and your function runs, the listener automatically stops listening – it’s perfect for situations where you need to respond to something specific and then move on. This function returns an unsubscribe function, allowing you to manually stop the listener if needed.


## Function listenSignalNotifyOnce

This function lets you set up a listener that reacts to specific signal events, but only once. You provide a filter to define which events you're interested in, and a callback function to handle them. Once the filter matches an event, the callback runs, and the listener automatically stops listening. This is helpful for tasks you only need to perform one time based on a signal.


## Function listenSignalNotify

This function lets you listen for notifications when a trading strategy sends out a custom message related to an open trade. Think of it as subscribing to a stream of informational updates from your strategy. These messages are sent when the strategy uses the `commitSignalInfo()` function. 

Importantly, the messages are processed one at a time, even if your callback function takes some time to execute, ensuring orderly handling. The function returns an unsubscribe function that you can call to stop receiving these notifications.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific signals coming from a live trading simulation. You provide a filter—essentially a rule—to determine which signals you’re interested in. Then, you give it a function to execute when a matching signal arrives. Critically, this subscription is one-time; the function will run just once and then automatically unsubscribe, so you don’t have to worry about cleaning up. It only receives events generated during a Live.run() execution.

## Function listenSignalLive

This function lets you tap into the live trading signals generated when you're running a backtest. It’s designed to receive events sequentially, ensuring they're processed in the order they arrive. You provide a function that will be called for each signal event. Think of it as setting up a listener that gets notified whenever a new signal comes through during a live trading simulation. The listener you provide will receive a `StrategyTickResult` object containing information about the signal. When you are done with the listener, the function returns another function to unsubscribe.

## Function listenSignalEventOnce

This function lets you briefly listen for specific trading signals. You provide a condition – a filter – that determines which signals you're interested in. Once a signal matches that condition, a provided callback function runs, and the listener automatically stops. Think of it as setting up a temporary alert for a particular signal and then forgetting about it. It's perfect if you just need to react to a single occurrence of a specific event.

The `filterFn` defines what events you want to react to.
The `fn` is what actually happens when the matching event occurs.


## Function listenSignalEvent

This function lets you keep an eye on the activity of your trading signals – specifically, when they're first created and when they're closed. 

It provides a way to react to signals being opened, which could be due to automated scheduling or a manual action, and when they're closed, whether that’s because of a profit target, a stop-loss, or a time limit.

The events happen in order, and even if your response is a bit complex (like a delayed or asynchronous operation), the system will process them one at a time to keep things organized. You provide a function that gets called each time one of these signal lifecycle events occurs, giving you the details of what just happened.


## Function listenSignalBacktestOnce

This function lets you react to specific events generated during a backtest run, but only once. Think of it as setting up a temporary listener that will catch a signal meeting your criteria, do something with it, and then disappear. 

You provide a filter – a rule that determines which events you're interested in – and then a function that gets executed when a matching event occurs. 

The function automatically takes care of stopping the listener after it's been triggered once, so you don't need to worry about manual cleanup. It works exclusively with events produced by the `Backtest.run()` method.


## Function listenSignalBacktest

The `listenSignalBacktest` function lets you register a callback to receive updates during a backtest. Think of it as subscribing to a stream of events that happen as the backtest runs. These events, delivered as `IStrategyTickResult` objects, contain information about what’s happening within the backtest process. Importantly, you'll only get these events from backtests initiated by `Backtest.run()`. The events will be processed one at a time, in the order they are received, ensuring you don’t miss anything. The function returns a function that you can call to unsubscribe from these events when you're done.

## Function listenSignal

This function lets you listen for signals generated by your trading strategies. Whenever a strategy changes state – like going idle, opening a position, becoming active, or closing a position – you'll receive a notification. 

It's designed to handle these notifications in a safe and orderly way, processing them one at a time, even if your callback function takes some time to complete. This prevents potential issues from multiple signals being processed simultaneously.

You provide a function as input; this function will be called whenever a signal event occurs, giving you the details of that event. The function you provide will also be automatically unsubscribed when it returns.

## Function listenSchedulePingOnce

This function helps you react to specific "ping" events and then automatically stops listening. Think of it as a temporary listener that only runs once when a certain condition is met. You provide a filter to identify the exact events you're interested in, and then a function that gets executed when that event happens. Once the callback runs, the listener disappears, so you don't have to worry about manually unsubscribing. 

It's perfect for situations where you need to wait for something to happen and then do something specific just once, like responding to a particular market condition.

Here's how it works:

You give it a way to identify the events you want (the `filterFn`).
You tell it what to do when the right event comes along (the `fn`).
The function then listens, runs your function once when the event matches, and then stops listening.


## Function listenSchedulePing

This function lets you listen for regular "ping" signals emitted during the monitoring of scheduled trading signals. Think of it as a heartbeat signal confirming the signal is still waiting to be activated. 

These pings happen every minute while the signal is being watched.

You provide a function that will be called whenever a ping event occurs. This lets you track the status of the signal and implement custom monitoring checks or logging. The function you provide will also return a function that can be called to unsubscribe from these ping events when you no longer need them.

## Function listenScheduleEventOnce

This function lets you react to specific scheduled events, but only once. Think of it as setting up a temporary listener that waits for an event matching your criteria, runs a function once when it finds one, and then quietly disappears. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. This is perfect when you need to perform an action the very first time a certain scheduled event happens, and then you don’t want to keep listening. 

It automatically handles unsubscribing from the events after the single execution, so you don't have to worry about cleaning up.


## Function listenScheduleEvent

This function allows you to monitor the creation and cancellation of scheduled signals within the backtest or live environment. You'll receive notifications when a scheduled signal is initially created or if it's cancelled before it becomes active, for reasons like timeout or price rejections, or user intervention. 

It's important to note that this doesn't cover the moment a scheduled signal actually becomes active; that's handled by the regular signal emitters.  The events are delivered in the order they occur, and the callback function can be asynchronous.

To use it, simply provide a callback function that will be executed whenever a relevant event happens. The function will return another function that can be called to unsubscribe from the events.

## Function listenRiskOnce

`listenRiskOnce` lets you react to specific risk rejection events, but only once. You provide a filter – essentially a rule – to identify the events you're interested in. Then, you provide a function to execute when an event matches that rule.  After that function runs once, the listener automatically stops, so you don't keep getting notifications. It's a clean way to handle a one-time condition related to risk rejection. 

It's particularly handy if you need to wait for a specific risk event to happen and then take action, without continuing to listen afterward.


## Function listenRisk

The `listenRisk` function lets you be notified whenever a trading signal is blocked because it doesn't meet your risk criteria. 

It’s designed to only alert you about rejections – it won’t send notifications for signals that pass your risk checks, so you won't get overwhelmed with unnecessary updates.

These notifications happen one at a time, ensuring that processing is orderly, even if your callback function takes some time to execute. 

Essentially, you provide a function that will be called whenever a risk validation fails, and `listenRisk` handles the details of listening for those events and managing their processing.


## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of speed and efficiency. It's like setting up a listener that will notify you whenever a performance metric changes during your strategy's execution.

These notifications, called performance events, can help pinpoint slow areas or bottlenecks in your code.

You provide a function (`fn`) that will be called whenever a performance event occurs. Importantly, even if your function takes some time to process, the events will be handled one after another, ensuring orderly reporting and preventing conflicts. Think of it as a way to get detailed timing data about your strategy's operations, helping you optimize its performance.


## Function listenPauseOnce

This function lets you set up a listener that reacts to changes in a pause state, but only once. You provide a filter to specify which events you're interested in, and a callback function that will run just the first time a matching event occurs. After that single execution, the listener automatically stops, so you don't need to worry about manually removing it. It's great for one-off actions related to pause states. 

Here’s how it works:

*   `filterFn`:  Defines the conditions that must be met for the event to trigger your callback.
*   `fn`:  The function that will be executed when a matching event is found. It receives the pause event data.

The function returns a function that you can use to stop the listener before it fires.

## Function listenPause

This function allows you to monitor when a trading strategy is paused or resumed. It's designed to give you a reliable way to inform users about these changes, even if your notification process takes some time. 

You provide a function that will be called whenever the strategy's pause state changes – essentially, when it starts or stops trading. This ensures that any actions you take, like displaying a notification, happen in the correct order and one at a time. The function will return an unsubscribe function that can be called to stop listening.


## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that will only react to a specific partial profit event once. You provide a filter—essentially, rules that define the kind of event you’re looking for—and a callback function. When an event matches your filter, the callback will run just once, and then the listener will automatically stop listening. This is really handy when you need to react to a particular profit condition just one time. 

It's a convenient way to ensure you handle an event only when it absolutely needs to be addressed and then clean up the listener afterwards.

## Function listenPartialProfitAvailable

This function lets you set up a listener to be notified when your trades hit certain profit milestones, like 10%, 20%, or 30% gain. It's a way to track progress and potentially adjust your strategy as your trades become profitable. The events are handled in the order they happen, even if the code you write to respond to them takes some time to run. To prevent any issues with multiple things happening at once, it uses a system to make sure your code runs one step at a time.

You provide a function as input; that function will be called whenever a partial profit event occurs, giving you details about the trade. The function you provide will be automatically removed when you're done with the listener, giving you a clean way to unsubscribe.

## Function listenPartialLossAvailableOnce

This function lets you react to specific, temporary reductions in your trading account’s balance. You provide a filter—a rule that defines what kind of loss event you're interested in. When an event matching your rule occurs, the function executes a callback you provide, just once. After that single execution, it automatically stops listening, ensuring you don't get triggered again. Think of it as a one-time alert for a specific loss scenario. 

It's helpful if you need to react immediately to a particular type of market movement and then want to forget about it.


## Function listenPartialLossAvailable

This function lets you get notified whenever your trading strategy hits specific loss levels, like 10%, 20%, or 30%. Think of it as setting up a system to watch out for potential trouble spots in your trading. The events are delivered one at a time, ensuring things happen in the right order, even if your response to these events takes some time to complete. It makes sure that the callback function you provide runs safely, preventing any conflicts or unexpected behavior. You'll provide a function that will be called with details about the loss event when it occurs, and this function returns a way to unsubscribe from these notifications when you no longer need them.

## Function listenOrderStopOnce

This function lets you set up a listener that only reacts to specific order-check STOP events once. It's similar to `listenOrderStop`, but the callback you provide will only be executed the first time an event matches your criteria. 

You define what events you’re interested in using a `filterFn`, which is like a test that events must pass. The `fn` is the function that gets called with the matching event data. If your callback function uses `async/await` or returns a promise, the processing will pause until that promise is fulfilled. This one-time subscription automatically removes itself after the callback is invoked.

## Function listenOrderStop

This function lets you keep an eye on order-check events that have stopped, ensuring you're notified when something goes wrong or an order is no longer valid. It works by listening for specific signals and triggering a notification—essentially a heads-up—when an order check encounters a permanent problem, like the order being deleted or failing repeatedly.

The notification happens just before the order check is shut down, so you'll get details like why the check stopped and how many times it failed in a row.

Important note: this only functions in live environments; backtests don't perform order checks. Any errors in your callback function won’t halt the process—they’ll be logged and ignored, allowing the teardown to proceed.

You provide a callback function that will be executed when a stop event occurs. If your callback returns a promise, the execution will be handled asynchronously, ensuring it doesn’t block other operations.

## Function listenOrderRejectOnce

This function lets you set up a listener that reacts to order rejection events, but it only triggers once for the first matching event. Think of it as a one-time alert for specific order rejections. It's similar to the `listenOrderReject` function, but designed to be used just once before being automatically removed.

You provide a filter—a way to specify exactly which rejection events you’re interested in.  When an event matches your filter, the provided callback function is executed. If that callback function involves promises, the processing will wait for those promises to finish before continuing. Finally, the listener is automatically removed after executing once.


## Function listenOrderReject

This function lets you listen for situations where your orders are definitively rejected by the exchange. Think of it as a notification about orders that simply won't go through.

It’s designed for situations where the broker adapter has thrown an `OrderRejectedError`, signifying that retrying is useless.

Importantly, this only fires for permanent rejections – temporary issues are handled automatically by the system.

If you're running a backtest, these rejection events won’t occur because there's no actual exchange interaction.

This isn't a place to make decisions that change the trading flow; it's purely for observing what happened. Any errors within your handler will be caught silently and logged. Because of this, it’s safe for things like sending messages via telegram or auditing purposes.

You provide a function that gets called when a rejection occurs, and it accepts an `OrderRejectContract` object containing details about the rejected order. This function can optionally return a promise; if it does, the processing will be handled sequentially to prevent overwhelming the system.


## Function listenOrderFillOnce

This function lets you listen for order fill events from your broker, but with a twist: it only triggers your callback *once* for events that match your criteria. 

It's similar to `listenOrderFill`, which listens continuously, but this version automatically unsubscribes after the first matching event.

You provide a filter function to specify what kind of order fills you're interested in. When a matching event comes through, your callback function will be executed just once. 

If your callback function returns a promise, backtest-kit will pause execution until that promise resolves. This function returns a cleanup function that you can call to unsubscribe manually, although it will unsubscribe automatically after the first matching fill.


## Function listenOrderFill

This function allows you to monitor when your orders have been definitively filled by the broker. It's like a final confirmation that an order has actually gone through.

You'll receive notifications for three types of order fills: when a new position is opened, when a resting order is placed, or when an order to close a position is executed.

Keep in mind that this isn't a gate – any errors within your listener function won’t interrupt the process; they'll be handled internally. This makes it ideal for sending updates to external systems like Telegram or audit logs.

The callback function you provide will be triggered with details about the order fill event, and if that function returns a promise, the processing will be handled in a queued manner. 


## Function listenOrderContinueOnce

This function lets you set up a listener that reacts to order-related events, specifically when a trading order is being continued after an initial check. 

It's designed to only trigger your code once for a matching event. Think of it as a brief, targeted alert.

You provide a filter—a rule that decides which events you’re interested in—and a callback function. The callback then gets executed with the details of that single event. 

If your callback returns a promise, the system will wait for that promise to finish before moving on. This allows you to perform asynchronous operations safely within your callback.


## Function listenOrderContinue

This function lets you listen for updates on orders that are still being processed and haven't been definitively closed. Think of it as getting notified when an order is still alive and well, or if there was a minor hiccup that's being handled. It works alongside another function, `listenOrderStop`, to give you a complete picture of order status – `listenOrderStop` handles orders that have been stopped or rejected.

This is particularly useful for keeping track of orders that might be taking a bit longer than expected or dealing with temporary issues.  It's important to know that the system only uses this feature during live trading; it doesn't operate during backtesting.

If your listener function encounters an error, it won't interrupt the system’s internal monitoring process; the error will be logged and handled internally.  If you return a promise from your callback function, the processing will happen one after another.

## Function listenMaxDrawdownOnce

This function allows you to react to specific max drawdown events in your backtest, but only once. It's like setting up a temporary alert that triggers just one time when a certain condition is met. You define what that condition is using a filter – a function that determines whether an event is relevant. Once the condition is met, the provided callback function is executed, and the subscription is automatically cancelled. This is a convenient way to react to a particular drawdown situation without ongoing monitoring.

## Function listenMaxDrawdown

This function lets you be notified whenever a trading strategy hits a new maximum drawdown. Think of it as a way to keep a close eye on how much potential loss your strategy is experiencing. 

It works by registering a function that will be called whenever a new drawdown high is reached. The key thing to know is that these notifications are handled in order, and any processing your callback function does won't interfere with other events – it's all managed carefully to prevent any issues. 

This is particularly helpful for things like automatically adjusting your risk exposure based on how your strategy is performing. To stop listening for these drawdown events, the function returns another function that you can call to unsubscribe. The function you provide receives an event object containing details about the drawdown.

## Function listenIdlePingOnce

This function lets you react to idle ping events, but only once for each event that matches your criteria. You provide a function (`filterFn`) that decides which idle ping events you're interested in. Then, you give it a callback function (`fn`) that will be triggered once when an idle ping event passes the filter. When the callback has run once it will be unsubscribed automatically. This is useful for things like initial setup or a one-time adjustment based on idle state.

## Function listenIdlePing

The `listenIdlePing` function lets you set up a listener that gets notified when the backtest kit is completely idle. This means it triggers whenever there are no signals being actively monitored or scheduled. You provide a callback function, which will be executed each time an idle ping occurs, receiving an `IdlePingContract` object with details about the event. The function itself returns a function that you can call to unsubscribe from these idle ping notifications.

## Function listenHighestProfitOnce

This function lets you watch for specific, high-profit trading events and react to them just once. You tell it what kind of profit event you're looking for using a filter – essentially, a rule that determines if an event is interesting. When an event matching your rule appears, a provided function will be executed with the details of that event, and then the function automatically stops listening. It's a great way to trigger a one-time action based on a particular profit achievement.

You provide two things: a filter function to identify the events you're interested in, and a callback function to run when a matching event occurs. The callback will only run once, and then the subscription ends.

## Function listenHighestProfit

This function allows you to be notified whenever a trading signal achieves a new peak profit. It’s like setting up an alert that fires every time a strategy performs its best. Importantly, these alerts are handled one at a time, ensuring that any actions you take based on the alert (like adjusting your strategy) won't interfere with each other.

You provide a function that gets executed whenever this highest profit milestone is reached. This function will receive information about the signal that hit that profit level.

Think of it as a way to monitor and react to the best-performing moments of your trading strategies. It's designed to make sure your reactions are consistent and avoid any conflicts.


## Function listenExit

This function lets you react to severe errors that cause the backtest or live trading process to stop completely. It’s like setting up a safety net for situations where something goes wrong and the system needs to shut down.

Think of it as an emergency signal – when a critical error occurs, this function will trigger your callback.

It makes sure these errors are handled one after another, even if your response involves some asynchronous operations, so things stay predictable. It’s specifically for those kinds of errors that can’t be recovered from.


## Function listenError

The `listenError` function lets you set up a listener to catch errors that happen while your trading strategy is running, but aren't severe enough to stop the whole process. Think of it as a safety net for things like temporary API connection problems.

It ensures that when an error occurs, your provided function is called to handle it – maybe logging it, retrying, or adjusting your strategy. 

Importantly, these error events are handled one at a time, in the order they occur, even if your error handling function involves some asynchronous operations. This prevents multiple error handling processes from running simultaneously, keeping things predictable.


## Function listenDoneWalkerOnce

This function lets you react to when background tasks finish, but only once. You provide a way to identify which specific finishing tasks you're interested in, and then you give it a function to run when a matching task completes. Once that one execution happens, it automatically stops listening, so you don't need to worry about unsubscribing manually. Think of it as setting up a single, targeted alert for a particular kind of background job completion.


## Function listenDoneWalker

The `listenDoneWalker` function lets you be notified when a background task within a Walker finishes processing. 

Think of it as setting up a listener that gets triggered when a long-running operation managed by the Walker is done. 

This function provides a way to react to the completion of these background tasks. 

Importantly, events are handled one at a time, even if your reaction involves asynchronous operations, ensuring a controlled and sequential execution flow. You provide a function that will be called when a task finishes, and `listenDoneWalker` returns a function that you can use to unsubscribe from these events later.


## Function listenDoneLiveOnce

This function lets you listen for when a background task finishes running within your backtest. It allows you to specify a condition—a filter—to determine which completion events you're interested in. Once a matching event occurs, a provided callback function will be executed, and the listener will automatically stop listening. This is useful for reacting to specific background tasks without needing to manually unsubscribe.

## Function listenDoneLive

This function lets you monitor when background tasks, initiated by `Live.background()`, finish running. It's particularly useful if you need to react to the completion of these tasks in a reliable, sequential order. Whenever a background task finishes, the function you provide will be called with information about the completed task. To ensure order and prevent issues, the callback is processed one at a time, even if it involves asynchronous operations. You can unsubscribe from these completion notifications whenever you need to stop listening.

## Function listenDoneBacktestOnce

You can set up a listener that gets notified when a background backtest finishes, but only once. 

Think of it as a temporary alert—it runs your function once when a specific backtest condition is met and then stops listening. 

You provide a filter to specify which backtest completions should trigger the notification, and then a function that will be executed when the backtest is done and matches your filter. This function will only run one time and then the listener will automatically disappear. It’s a clean way to react to specific backtest events without continuous monitoring.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. Think of it as setting up a listener that gets triggered once the backtest is complete. Importantly, the events are handled one at a time, ensuring things happen in the order they were received, even if your notification code takes some time to run. This helps prevent unexpected issues caused by things happening out of sequence. You provide a function that will be executed when the backtest finishes, and the function returns another function you can call to unsubscribe from these completion notifications.

## Function listenCheckOnce

This function lets you set up a listener that reacts to specific order check events – essentially, signals related to order confirmations.  Unlike a standard listener, this one only fires *once* for each matching event. It’s designed to handle situations where you need to respond to a particular order check occurrence, like verifying initial data or triggering a one-time action.

The function takes a filter – a way to specify exactly which order check events you're interested in. It also needs a function to run when a matching event is found. This callback will only be executed once for each event that passes your filter.

If the callback function you provide returns a promise, the backtest kit will pause processing until that promise resolves, ensuring the callback completes before moving on.


## Function listenCheck

`listenCheck` lets you keep an eye on your orders to make sure they're still valid on the exchange. It’s like a health check for your positions.

It listens for updates – specifically, it checks if an open position or a pending order is still active. This happens continuously while a signal is being monitored, before the backtest evaluates if it’s finished.

The system sends different types of events: "active" for open positions and "schedule" for resting orders.

If something goes wrong during this check, errors are handled in a specific way. Minor errors are tolerated and the system will retry, but more serious errors, like the order simply not being found, are treated as a critical issue that will shut down the backtest.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven protection event to happen. You provide a filter to define exactly which events you're interested in, and a function to execute when that event occurs. Once the event is found and the function runs, the listener automatically stops listening – it's perfect for situations where you only need to react to something once. It's a simple way to react to a one-time breakeven condition. 

The `filterFn` helps you narrow down the events you're interested in.

The `fn` is the action you want to take when the specific event is detected.

## Function listenBreakevenAvailable

This function lets you receive notifications whenever a trade's stop-loss automatically adjusts to the entry price, essentially becoming breakeven. This happens when the trade has gained enough profit to cover the initial costs involved. It’s like a safety net that kicks in when things are going well!

The notifications are handled in the order they’re received, and the system ensures that your callback function is executed one at a time, even if it involves asynchronous operations. To use it, you provide a function that will be called whenever a breakeven event occurs, and the function will return an unsubscribe function that you can call to stop receiving these notifications.


## Function listenBeforeStartOnce

The `listenBeforeStartOnce` function lets you react to specific "before start" events in your backtesting process, but only once. You provide a filter to identify which events you're interested in, and a function to execute when that event occurs. Once the event is processed, the listener automatically stops listening, ensuring it doesn't interfere with subsequent tests. This is useful for setting up initial conditions or performing a one-time action before a trading simulation begins.

## Function listenBeforeStart

This function lets you tap into the moment before a trading strategy begins running for a specific asset. You provide a function that will be called just before each new strategy execution starts. Importantly, these calls happen one after another, even if your function takes some time to complete – this ensures things don't get messy with multiple callbacks happening at once. Think of it as a signal that says, "Hey, a new strategy is about to begin – do what you need to do!" 


## Function listenBacktestProgress

You can sign up to receive updates as a backtest runs. This function lets you provide a function that will be called whenever the backtest makes progress. 

The updates are delivered one at a time, even if your function takes some time to process each one. This ensures that the progress information is handled in the order it's received, and prevents any issues caused by trying to process multiple updates at once. It’s useful for displaying progress to the user or logging details during the backtest. You'll get back a function that you can call to unsubscribe from these updates later.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading period has finished, but it's designed to only run once. You provide a filter to specify which events you're interested in – only those that match your criteria will trigger the callback function. Once the callback runs, the subscription is automatically cancelled, so you don't need to worry about cleaning up.

It's useful when you need to perform a one-time action based on a particular event after a backtest or live trading session concludes.

Here’s how it works:

*   You give it a filter function, which decides if an event should be processed.
*   You provide a callback function, which will be executed once for the first matching event.
*   The function returns an unsubscribe function, though you don't generally need to call this as the subscription is handled automatically.


## Function listenAfterEnd

This function lets you register a callback that gets triggered after a trading strategy execution finishes for a specific symbol. Think of it as a notification that says, "Okay, the trading is done for this symbol, and here's the information about what just happened."  The callback you provide will be executed one at a time, ensuring that any asynchronous operations within it won't interfere with the sequence of events. This helps maintain order and reliability in your backtesting process. To stop listening for these events, the function returns another function that you can call to unsubscribe.


## Function listenActivePingOnce

This function lets you temporarily watch for specific active ping events and react to them just once. 

You provide a filter to define which events you're interested in, and a function to run when a matching event occurs. 

Once the function executes the callback, it automatically stops listening, ensuring you don't get further notifications. 

Think of it as a quick way to monitor for a particular condition and take action, then move on.


## Function listenActivePing

This function lets you keep an eye on the status of active signals. It listens for events that are sent out every minute, providing information about the lifecycle of these signals.

Think of it as setting up a listener to be notified whenever something changes with your active signals. 

The events are handled one at a time, even if your callback function takes some time to process, ensuring things don't get messed up by running too many things at once. To use it, you provide a function that will be called whenever a new active ping event occurs, and this function will receive all the relevant information about that event.

## Function listWalkerSchema

This function gives you a list of all the different trading strategies (walkers) that are currently set up and ready to be used within the backtest-kit system. Think of it as a directory of available strategies.

It's particularly helpful if you're trying to understand what strategies are available, build tools to manage them, or just generally debug your setup. The function returns a promise that resolves to an array detailing each strategy’s configuration.


## Function listSweepSchema

This function helps you discover all the different sweep schemas that have been set up in your backtest kit setup. It's like getting a complete inventory of the trading strategies or approaches that your system recognizes. This is handy when you're troubleshooting, documenting your system's capabilities, or want to create user interfaces that can adapt to different trading strategies. The function returns an array containing information about each sweep schema.

## Function listStrategySchema

This function lets you see a complete list of all the trading strategies currently set up within your backtest. Think of it as a way to inventory your strategies – it shows you what's available and ready to be used. It's incredibly helpful when you're trying to understand how your system is configured, or if you're building tools to manage or display those strategies. The function returns a list of strategy schemas, each describing a particular trading approach.

## Function listSizingSchema

This function gives you a peek at all the different ways your backtest kit is determining how much of an asset to trade. It pulls a list of all the sizing schemas you've set up.  Think of it as a way to see your risk management rules defined – helpful for checking your configurations or creating tools to display them. It returns a list of sizing configurations that have been registered through the `addSizing` function.

## Function listRiskSchema

This function lets you see all the risk configurations currently active in your backtest kit setup. Think of it as a way to check what risk parameters are in play. It returns a list of these configurations, allowing you to examine them for debugging purposes or to build tools that need to understand the risk profiles being used. Essentially, it provides a snapshot of all the risk schemas that were previously added using `addRisk()`.

## Function listMemory

The `listMemory` function helps you see all the saved data associated with the current trading signal. Think of it as looking through a digital notebook for that signal. It automatically figures out if you're running a test (backtest) or a live trade, and it knows which signal is currently active, so you don't have to specify those details. You provide a `bucketName`, which is like the name of the folder where the memory entries are stored. The function then returns a list of memory entries, each containing a unique ID and the actual data content.

## Function listMCPSchema

This function gives you a complete list of all the different trading strategies (represented as MCP schemas) that are currently set up and ready to use within the backtest-kit framework. Think of it as a way to see all the different "recipes" for trading that you’ve defined. It’s a really handy tool for understanding what’s going on, building tools to manage those strategies, or even creating a user interface that lets you choose between them. The function returns a promise that resolves to an array of these MCP schemas.

## Function listFrameSchema

This function provides a way to see all the different data structures, or "frames," your backtest kit is using. It essentially gives you a list of all the schemas that have been defined.  You can use this to understand what data is being tracked, help with troubleshooting, or even create tools to visualize your backtest setup.  Think of it as a directory listing of your backtest data structures.


## Function listExchangeSchema

This function gives you a list of all the exchanges that backtest-kit knows about. It's like a directory of available exchanges, each described by its schema. You can use this to see what exchanges are supported, inspect their configurations, or dynamically build user interfaces that adapt to the available exchanges. Essentially, it's a way to discover the range of trading venues backtest-kit is equipped to handle.

## Function hasTradeContext

The `hasTradeContext` function helps you determine if your code is running in a state where it can safely interact with trading-related functions. 

Essentially, it verifies that both the execution and method contexts are currently active. 

Think of it as a safety check - if this function returns `true`, it means you're good to use functions like `getCandles` or `formatPrice` that rely on the trading environment. If it returns `false`, it means these functions are unavailable and you should avoid calling them.


## Function hasNoScheduledSignal

This function, `hasNoScheduledSignal`, helps you determine if a trading signal is currently scheduled for a specific asset, like 'BTC-USDT'. It returns `true` if no signal is scheduled, and `false` otherwise. Think of it as the opposite of checking *for* a scheduled signal; you'd use this to make sure your system doesn't try to generate a signal when one's already in place. The function smartly figures out whether it's running in a backtesting environment or a live trading scenario without needing explicit configuration. You provide the trading pair’s symbol – the name of the asset you’re interested in – as input.

## Function hasNoPendingSignal

This function helps you determine if there's an active, waiting-to-be-triggered signal for a specific trading pair, like 'BTCUSDT'. It tells you definitively whether a signal is currently pending. Think of it as the opposite of `hasPendingSignal` – it’s useful for making sure you don't accidentally generate new signals when one is already in progress. The function cleverly figures out whether it's running in a testing environment or a live trading situation, so you don't need to worry about that. You just provide the trading pair's symbol, and it returns true if there's no pending signal, and false if one exists.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the configuration details for a specific trading strategy, or "walker," within the backtest-kit framework. Think of it as looking up the blueprint for how a particular trading approach is designed to operate. You provide the name of the walker, and the function returns a structured object containing all the information about it. This allows you to understand and potentially modify the setup of a walker without directly altering its core code.


## Function getTotalPercentHeld

This function tells you what percentage of your initial position in a specific trading pair you still hold. Think of it as a way to see how much of your original investment hasn’t been sold off yet. A value of 100 means you haven't taken any profits or losses, while 0 means the entire position has been closed.

It's particularly good at handling situations where you've made multiple purchases (DCA) and then closed parts of your position; it accurately reflects the percentage remaining. 

It’s essentially the same as using `getTotalPercentClosed`, so you can use whichever name you prefer. You simply provide the trading pair symbol, such as "BTC/USDT", and it will return the percentage.

## Function getTotalPercentClosed

This function tells you what percentage of your position in a specific trading pair is still open. Think of it as a way to see how much of your holdings are still active – a value of 100 means you haven't closed any part of the position, while 0 means it’s fully closed. It handles situations where you’ve closed the position in multiple steps (Dollar-Cost Averaging or DCA) and gives you an accurate percentage. It works whether you’re running a backtest or a live trade, automatically adjusting to the current context. To use it, simply provide the trading pair's symbol, like 'BTCUSDT'.

## Function getTotalCostClosed

This function helps you figure out how much you've spent on a particular trading pair, like BTC/USDT. It looks at all your purchases and partial sales (DCA entries) to give you an accurate total cost. It’s especially useful for understanding your investment in a position you still hold. The function knows whether it's running in a backtest or a live trading environment because it figures that out on its own. You just need to provide the symbol of the trading pair you’re interested in.

## Function getTimestamp

The `getTimestamp` function gives you the current timestamp, and how it behaves changes depending on whether you’re running a backtest or live trading. When backtesting, it returns the timestamp for the specific timeframe the backtest is looking at. If you’re running live, it gives you the actual, current time.

## Function getSymbol

This function retrieves the symbol you're currently trading, like "BTCUSDT" or "ETHBTC". It's a simple way to know which asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string representing the symbol.

## Function getSweepSchema

To get the details of a specific backtest sweep, use the `getSweepSchema` function. You provide the name of the sweep you’re interested in, which acts as a unique identifier. This function then returns a structured object containing all the information about that sweep, letting you understand its configuration and settings. It's useful for inspecting how a backtest was set up.

## Function getStrategyStatus

This function lets you peek at the current state of a trading strategy as it's running. Think of it as a snapshot of what's happening behind the scenes – things like signals waiting to be processed, actions that haven't been completed, and what's currently being tracked. It works whether you're running a backtest or a live trading scenario, so you don’t need to worry about setting up anything specific. To get this snapshot, you simply provide the trading pair symbol you're interested in.

## Function getStrategySchema

The `getStrategySchema` function helps you find the blueprint for a specific trading strategy you've registered within the backtest-kit framework. It takes the name of the strategy as input.

Think of it as looking up a strategy's definition – it returns all the details like what inputs it expects and what calculations it performs. This allows you to understand and potentially validate how a strategy is set up. You provide the strategy’s unique identifier, and the function returns a structured description of that strategy.

## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. When a strategy is paused, it won't initiate any new trades; the `getSignal` function won't be called, and any new trade requests are held back. However, existing orders and signals are still managed – meaning those trades can still close as expected. The system figures out if it's running a backtest or live trading automatically. You just need to provide the trading symbol, like "BTCUSDT," to see the paused status.

## Function getSizingSchema

The `getSizingSchema` function helps you find the specific sizing strategy you’re using within your backtest. Think of sizing as determining how much of an asset you'll trade – this function locates the pre-defined rules for that sizing. You give it the name of the sizing method you want, and it returns the configuration details for that particular sizing scheme. This lets you access and understand exactly how your trades are being sized.

## Function getSignalState

This function helps you retrieve a specific data value that's linked to a signal, which could be one that's about to happen or one that's already planned. It figures out whether you're in a backtesting environment or live trading automatically.

It's especially useful for advanced strategies, like those driven by language models, that track details about each trade—things like how much profit it's made or how long it’s been open.

Think of it as a way to keep track of important metrics for each trade as it unfolds, allowing for dynamic adjustments based on performance.

You provide the symbol of the trading pair and a data transfer object that contains the bucket name and the initial value you want to retrieve. The function then retrieves the state value linked to the active signal. 

If there isn't a signal to link to, the function will error.

## Function getSessionData

This function lets you retrieve data specifically associated with a trading symbol during a backtest or live trading session. Think of it as a way to store and remember information across different candles – like the results of a complex calculation or a state that needs to be maintained.  This data isn't lost when a candle changes or even if the program restarts in live mode. You provide the symbol (e.g., "BTC-USDT") to identify which data you're looking for. If no data is associated with the symbol, it will return null.

## Function getScheduledSignal

This function lets you check if a scheduled signal is currently running for a specific trading pair. It essentially tells you if a pre-defined signal is active and ready to be used. 

If a signal *is* active, you'll receive details about it in a structured format. If no signal is scheduled, it will return nothing, indicating that no automated signal is currently set to execute.

The function figures out whether it's being used in a testing environment or a live trading situation on its own, so you don't need to worry about that. You just need to specify the trading pair you're interested in.


## Function getRuntimeInfo

This function gives you important details about the current trading environment. It pulls together information like which asset you're trading, the exchange being used, the timeframe of your analysis, and the specific strategy in play. You'll also find out if you’re running a backtest (testing historical data) or a live trading session. Essentially, it provides a snapshot of the context for your trading activity.

## Function getRiskSchema

The `getRiskSchema` function lets you fetch a specific risk schema that's been registered within the backtest-kit framework. Think of risk schemas as blueprints for how to measure and manage risk in your trading strategies.  You provide a unique name, or identifier, for the risk schema you're looking for, and the function returns the detailed schema definition. This is useful when you need to programmatically understand or interact with a particular risk measurement.

## Function getRemainingCostBasis

This function, `getRemainingCostBasis`, helps you figure out how much of a particular asset you still own. Think of it as the remaining cost of your initial investment, even if you've sold off portions of it along the way. It’s especially useful if you’ve been buying the asset over time (Dollar Cost Averaging or DCA) and then selling bits of it later. It accurately calculates this value, considering all those different purchase prices. Essentially, it tells you the dollar amount that’s still “unrealized” in your position, representing what's left to be sold. This function is just another name for `getTotalCostClosed`, providing a more descriptive way to understand what it does. You just need to provide the trading pair symbol, like "BTCUSDT."


## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and timeframe. You have a lot of flexibility in how you request this data.

You can specify the number of candles you want (`limit`), a start date (`sDate`), and an end date (`eDate`). If you only provide an end date and a limit, it will automatically calculate the start date. If you only give a limit, it'll use the current execution context as a reference point.

Importantly, all methods used to get candles are designed to prevent any look-ahead bias, ensuring fair backtesting results.

Here's a breakdown of what the function needs:

*   **symbol:** The trading pair you're interested in (like "BTCUSDT").
*   **interval:** The timeframe for the candles (options include "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", and "8h").
*   **limit:** How many candles you want to retrieve (optional).
*   **sDate:**  The starting date for the candles in milliseconds (optional).
*   **eDate:** The ending date for the candles in milliseconds (optional).

## Function getPositionWaitingMinutes

This function tells you how long a pending trade signal has been waiting to be executed. It checks a specific trading pair, like 'BTCUSDT', and returns the wait time in minutes. If there isn’t a scheduled signal for that pair, it will return null, indicating no waiting is occurring. You use the symbol of the trading pair as input, for example, "BTCUSDT".

## Function getPositionPnlPercent

This function helps you figure out how much profit or loss you're currently facing on a trade that's still open. It calculates the percentage of unrealized profit or loss for a specific trading pair. 

The calculation considers factors like any partially closed positions, the average cost of your initial purchases (DCA), potential slippage, and trading fees. 

If there isn't a trade currently in progress, it will return null.

It smartly adjusts to whether you're running a backtest or a live trade, and it automatically gets the latest price data to make the calculation accurate. You just need to provide the symbol of the trading pair.

## Function getPositionPnlCost

This function helps you understand how much money you've potentially gained or lost on a trade that hasn't been fully settled yet. It looks at the current market price and calculates the unrealized profit or loss for your open positions. 

Think of it as a snapshot of your pending gains or losses, factoring in things like how much you initially invested, any partial trades you've made, and even potential slippage and fees.

If you don’t have any open positions related to a signal, the function will return null. The function is designed to work seamlessly whether you’re running a backtest or a live trading session, and automatically retrieves the current price for calculations. You only need to provide the trading pair symbol.

## Function getPositionPartials

This function helps you see how your trading position has been partially closed, either for profit or loss. It gives you a list of events showing when those partial closures happened.

If there isn't an active trading signal, it won't return anything. If you've made partial closures but haven’t had any profit or loss taken, it returns an empty list.

For each partial closure, you'll get details such as the percentage of the position closed, the price at which it was closed, the cost basis at the time, and the number of entries involved. You provide the trading pair symbol to specify which position you want to check.

## Function getPositionPartialOverlap

This function helps you avoid accidentally executing multiple partial closes for the same trading symbol around the same price. It checks if the current market price falls within a defined tolerance range around any previously executed partial close prices.

Think of it as a safety net to ensure you're not triggering unintended trades.

The function takes the trading symbol and the current price as input. You can optionally provide a configuration to adjust the size of the tolerance zone, defining how close the current price needs to be to trigger a match.

If no partial closes have been executed, or if the current price doesn't fall within the tolerance range of any existing partials, the function returns false. Otherwise, it returns true, signaling a potential overlap.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a specific trading position experienced its biggest loss. It looks at a past position and tells you the timestamp—a precise date and time—when the price hit its lowest point for that position. 

If there's no active trading signal related to that symbol, the function won't return anything and will indicate that.

You provide the trading pair symbol, like 'BTC-USDT', to specify which position you're interested in learning about.

## Function getPositionMaxDrawdownPrice

This function helps you understand the risk exposure of a specific trading position. It calculates and returns the lowest price a position experienced while losing money – essentially, the maximum drawdown. Think of it as identifying how far “down” a position went before potentially recovering. 

If there isn’t an active trading signal for the specified symbol, the function will indicate this by returning null. You need to provide the symbol, like "BTC-USDT," to get the drawdown price for that particular trading pair.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the maximum drawdown percentage based on the profit and loss (PnL) experienced during the position's entire lifespan. Essentially, it tells you the lowest PnL percentage the position reached before recovering.

The function requires you to specify the trading pair symbol you're interested in.

If there isn't a corresponding trading signal for the position, the function will return null, indicating there's no data to analyze.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost (expressed in the currency of the asset being traded) incurred up to the point when the position experienced its largest loss. 

Essentially, it tells you how much money was lost before the position potentially started to recover.

To use it, you'll need to provide the trading pair symbol, like 'BTCUSDT'. The function then returns a number representing that cost, or null if there's no active trading signal for that symbol.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how recently your trading position experienced its biggest loss. It tells you, in minutes, how much time has passed since the point where the position was at its lowest value. The number will be zero if the lowest point was just reached. If there’s no active trade happening for a specific symbol, the function will return null. You need to provide the symbol of the trading pair you’re interested in, like 'BTC-USDT'.

## Function getPositionLevels

getPositionLevels lets you find out the prices at which your initial buy and any subsequent DCA (Dollar-Cost Averaging) buys occurred for a specific trading pair. It gives you a list of prices, starting with the original price when you first bought the asset.

If you haven't placed any DCA orders, you'll just see the initial price listed.

If there's no pending signal, it means there’s no trade in progress, and the function will return null. You pass the trading pair symbol (like 'BTCUSDT') to the function to get the relevant price levels.

## Function getPositionInvestedCount

getPositionInvestedCount lets you check how many times a position has been topped up with additional buys after the initial investment. It essentially tells you the number of DCA (Dollar-Cost Averaging) entries made for a particular trading pair. A value of 1 means the position consists only of the original investment. Each time you successfully use commitAverageBuy, this number increases, showing how many additional buys have been added. If there are no ongoing trading signals for that symbol, the function will return null. It figures out whether it's running in a backtest or a live trading environment on its own. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionInvestedCost

This function helps you figure out how much money you've put into a specific trade. It calculates the total cost basis for the current signal, which includes all the costs associated with buying into the position. 

Think of it as adding up all the initial costs of your buy orders. 

If there's no signal currently active, the function will return null. It automatically adjusts based on whether you're in a backtesting environment or a live trading scenario. You just need to provide the trading pair symbol like 'BTC-USD' to get the information.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a trading position reached its peak profit. It returns a timestamp, which is a specific moment in time, marking the highest profit achieved for a given trading pair. If there's no data available for a position, the function will indicate that by returning null. You provide the symbol of the trading pair you’re interested in, like 'BTCUSDT', and it tells you when that position made the most money.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being in a profitable state. 

It starts by noting the price when the position was opened. 

For long positions, it looks for the highest price above the entry price; for short positions, it tracks the lowest price below the entry price.

Essentially, it keeps a record of the best possible price movement in your favor during the entire lifespan of the position. 

You'll need to provide the symbol of the trading pair you're interested in. 

It will always return a value as long as the position is active, guaranteeing a price value, starting with the initial entry price.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its most profitable moment. 

It calculates the number of minutes that have passed since the price reached its highest point for a specific trading pair. Think of it as a way to gauge how far a trade has fallen from its peak. 

If the trade is currently at its highest profit, the value will be zero. 

The function returns a number representing those minutes, or null if there's no active trade for that symbol. You provide the trading symbol (like BTCUSDT) as input.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best potential profit. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, but only considers the positive difference. 

Essentially, it shows you the potential "upside" remaining in a trade.

You provide the trading symbol, like "BTCUSDT," and the function returns a number representing this distance as a percentage. 

If there are no trading signals for that symbol currently, the function will return null.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit you could have made and the profit you're currently experiencing. 

The result is a number representing that distance, expressed as a profit and loss (PnL) cost. 

If there's no active trading signal for the given symbol, the function will return null. 

You provide the trading pair symbol, like "BTCUSDT," to identify which position you want to analyze.

## Function getPositionHighestProfitBreakeven

This function helps determine if a trading position could have reached a breakeven point at its peak profit. It checks if, mathematically, achieving breakeven was possible at the highest price the position reached. 

If no trading signals are currently active for a particular trading pair, the function will return null, indicating there’s nothing to evaluate. 

You provide the symbol of the trading pair you're interested in – for example, "BTCUSDT" – and the function will do the calculation.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It looks at a trading position, like one for a particular cryptocurrency pair, and tells you the highest percentage profit it ever reached during its lifetime. Think of it as identifying the peak of the trade’s profitability. If there's no active trading signal for that specific pair, the function will return null, meaning it can’t calculate that high-water mark. You provide the trading pair's symbol, like "BTC-USDT," and it gives you that peak percentage.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It calculates the cost associated with reaching the highest profit point for that position. 

Essentially, it tells you how much it "cost" to achieve the peak profit for a given trading pair. 

If there's no pending signal related to the position, the function will return null, indicating a lack of relevant data. To use it, you simply provide the trading pair symbol, such as "BTC-USD".


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk exposure of a specific trading position. It calculates how far the position's profit has come from its lowest point, expressed as a percentage. Think of it as measuring the recovery from the deepest losses. 

The value represents the difference between the current profit percentage and the largest percentage loss experienced. If there's no active trading signal for that symbol, the function will return null. You'll need to provide the trading pair's symbol, like "BTC-USDT", to get the result.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the risk of a trading position. It calculates how far the current profit or loss is from the lowest point it reached during a drawdown.

Think of it as measuring the “safety net” below your current position – how much room there is before it hits its lowest point.

The result is a number representing this distance, expressed in profit and loss (PnL) cost. If there isn't a current position, the function won’t return any value.

You give the function the symbol of the trading pair (like BTC-USD) to get the information for that specific pair.

## Function getPositionEstimateMinutes

This function helps you understand how long a trade is expected to last. It looks at the current, pending trading signal and tells you the originally estimated duration in minutes. Essentially, it's checking the `minuteEstimatedTime` value from the signal's data. 

If there isn't a pending signal at the moment, it will return nothing. You need to provide the symbol of the trading pair you're interested in, like 'BTC-USDT'.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing duplicate DCA orders at similar prices. It checks if the current price falls within a defined range around your existing DCA entry levels.

Think of it as a safeguard—it prevents you from accidentally buying the same asset at nearly the same price twice. 

The function returns `true` if the current price is close enough to one of your existing entry levels and `false` if there are no pending signals. You can also customize the tolerance range to be more or less strict. This helps in refining your trading strategy and avoiding unnecessary orders.


## Function getPositionEntries

This function helps you understand the details of your current trading position. It retrieves a history of the prices and costs associated with each step taken to build up your position – whether that was the initial buy or a later DCA (Dollar Cost Averaging) purchase. 

If there isn’t a pending trading signal, it will tell you that by returning null. If you simply bought once and didn't do any DCA, it will return a list with only one entry. Each entry in the list shows the price at which you bought and the amount of money you spent on that particular purchase. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position for a specific trading pair. It calculates a weighted average, considering any previous transactions and partial closes. Essentially, it gives you an idea of your cost basis, reflecting the actual price you've paid over time.

If no trades have been made yet, it will show the initial opening price.

You don’t need to worry about whether you’re running a backtest or a live trade; the function handles that automatically.  It will return null if there is no pending signal to calculate the price for.

To use it, simply provide the symbol of the trading pair you are interested in, like "BTCUSDT".


## Function getPositionDrawdownMinutes

This function helps you understand how long a trading position has been losing ground since it reached its highest profit point. It tells you the number of minutes that have passed since that peak. 

The value will be zero at the moment the position's profit is at its highest. As the price drops from that high, this number increases. 

If there's no active trading signal, the function will return null. You need to specify which trading pair (symbol) you're interested in to get this drawdown information.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes helps you understand how much time is left before a trading position expires. It figures out the time elapsed since a pending signal was created and compares it to the estimated time. 

If the estimated time has passed, it returns zero, meaning the position is considered expired.  You won’t get negative numbers; it always returns zero or a positive value representing minutes remaining.

If there isn’t a pending signal, it will tell you by returning null. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getPositionActiveMinutes

This function helps you understand how long a specific trading position has been open. It calculates the number of minutes the position has been active, giving you insight into its duration. 

You provide the trading symbol – like BTCUSDT – and the function will return the active minutes as a number.

If there's no currently pending signal associated with that position, it will return null.

## Function getPendingSignal

This function helps you find out what pending signal, if any, your strategy currently has active for a specific trading pair. It's designed to easily check the status of a signal without needing to know whether you’re in a backtest or a live trading environment – it figures that out automatically. If there isn’t a pending signal for the given symbol, the function will tell you by returning null. You provide the symbol, like "BTCUSDT", and it does the rest.


## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls data directly from the exchange you're connected to.

You can optionally specify the depth of the order book – how many levels of bids and asks you want to see, though there's a default maximum.

The function is designed to work consistently whether you're doing a backtest (simulated trading) or live trading. It passes time information to the exchange, but how that information is used depends on the trading environment.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. Think of it as requesting a set of upcoming candles from the exchange. You provide the symbol (like BTCUSDT), the timeframe (like 15 minutes), and how many candles you want. The function then fetches those candles that come after the current time within the backtest environment. It leverages the exchange's specific way of getting future data, ensuring accuracy and compatibility.

## Function getMode

This function tells you whether the backtest kit is currently running a simulation (called "backtest" mode) or is connected to a live trading environment ("live" mode). It's a simple way to check the context of your trading logic – are you testing, or are you actually trading? The function returns a promise that resolves to either "backtest" or "live", giving you a clear indication of the current operating mode.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. It's like a timer, but only counting in whole minutes.

Whether the signal is still active or has already ended doesn't matter – this function just looks at when the *last* signal was made. 

You might find this useful for setting up pauses after a stop-loss order to avoid quickly re-entering a trade. 

The function first checks your historical backtest data and, if it doesn't find anything there, looks at your current, live trading data.  If no signals exist at all, it will return null.  It automatically adapts to whether you're in backtest or live mode.

It takes a single input: the symbol of the trading pair you're interested in (like "BTCUSDT").

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy. It calculates the maximum difference between the highest profit and the lowest loss experienced during a trading period for a specific trading pair. 

Think of it as measuring how far a trading strategy can fall from its peak. The result is expressed as a percentage, and it will be zero or positive. 

If no trading signals are available for the specified symbol, the function will return null. To use it, you simply provide the trading pair symbol you're interested in.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand how much risk your trading strategy took during a backtest. It calculates the difference between the highest profit you made and the lowest point your profit dipped to. This essentially tells you the maximum potential loss you could have experienced if you had cashed out at the worst possible time. The result represents a monetary value, reflecting the cost of that drawdown. It needs a symbol to operate on, specifying the trading pair you're interested in. If there's no trading data available, it won't return a value.


## Function getMCPSchema

This function lets you access the defined structure of a specific Market Conditions Profile (MCP). Think of it as retrieving the blueprint for how a particular MCP is organized. You provide the name of the MCP you’re interested in, and the function returns a detailed description of its expected format. This allows your code to understand and correctly interpret the data contained within that MCP. The name must be a unique identifier assigned to the MCP.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal, whether it's still active or has already been closed, for a specific trading pair. It’s great for implementing cooldown periods – for example, preventing new trades for a set time after a stop-loss event. The function checks both historical and current data to find the latest signal and will return nothing if no signal is found. It automatically adapts to whether you're running a backtest or a live trading scenario. You simply provide the symbol of the trading pair you’re interested in to get the signal details.


## Function getFrameSchema

The `getFrameSchema` function helps you find details about a specific frame used in your backtesting setup. Think of frames as containers for your data – things like OHLC data or volume. This function takes the frame's name as input and returns a description of that frame, outlining what data it holds and how it’s structured. It's like looking up the blueprint for a particular frame to understand its contents. You use this to make sure your data and calculations are aligned correctly within your backtest.


## Function getExchangeSchema

The `getExchangeSchema` function is your way to access the specific details and structure of a trading exchange within the backtest-kit framework. You give it the name of the exchange you’re interested in, like "Binance" or "Coinbase," and it returns a detailed schema describing that exchange. This schema contains information about the exchange’s data format, how trades are structured, and other exchange-specific configurations necessary for accurate backtesting. Essentially, it's retrieving the blueprint for how that exchange works within the system.


## Function getDefaultConfig

This function provides you with a set of sensible starting values for configuring the backtest kit. Think of it as a template that you can then customize. It gives you a good overview of all the settings you can adjust, from how often the system checks for new data to limits on the number of signals and notifications it generates, and even controls for things like slippage and fees. It’s a helpful starting point if you’re unsure where to begin with setting up your backtest.

## Function getDefaultColumns

This function provides the standard set of columns used when creating markdown reports in the backtest-kit framework. It gives you a ready-made structure for report columns, including those related to strategy performance, risk management, and event tracking. Think of it as a template – you can examine the predefined column options and their settings to understand what's possible for your own customized reports. This is a good place to start when setting up your report layout.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the date relevant to your trading process. It fetches the date based on where your code is running - whether it's in a backtesting simulation or in a live trading environment. When backtesting, it will give you the date associated with the specific historical timeframe you're analyzing. If you’re running live, it will return the present, real-time date. Essentially, it gives you the correct date for your situation.


## Function getContext

This function provides access to the environment your current trading method is running in. Think of it as a window into how the backtest is configured and what data is available. It returns an object containing details about the execution environment, helping you understand the situation your method is operating under. This is useful for conditional logic or accessing specific settings during your method’s process.


## Function getConfig

This function allows you to see the settings that control how backtest-kit operates. It provides access to various parameters that influence things like candle fetching behavior, signal generation, order placement, and reporting. Think of it as a way to peek under the hood and understand the defaults used throughout the backtesting process. The returned values are a snapshot of the current configuration, meaning changes you make directly to the returned object won't affect the actual running configuration.

## Function getColumns

This function allows you to see the columns that will be used to generate your markdown reports. 

It provides a snapshot of the current column configuration, which includes things like columns for strategy results, performance metrics, and risk events.

Think of it as a way to peek at how your backtest results will be organized and presented, ensuring everything is set up correctly before you run your backtest.  The returned data is a copy, so any changes you make won't affect the actual configuration.


## Function getClosePrice

This function helps you fetch the closing price of the most recent candle for a specific trading pair and time interval. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the desired candle interval – options include short intervals like "1m" (one minute) up to longer ones like "4h" (four hours). The function then returns the closing price as a number, giving you a snapshot of recent price action. It’s a simple way to get the latest close price for your analysis or trading strategies.

## Function getCandles

This function retrieves historical price data, also known as candles, for a specific trading pair. You provide the symbol of the trading pair like "BTCUSDT", the desired time interval between each candle (options include 1 minute, 3 minutes, and longer durations), and how many candles you want to retrieve. The function then pulls this data from the connected exchange, working backwards from the current time. Essentially, it's your way to access past market activity for analysis or backtesting.


## Function getBreakeven

This function helps you determine if a trade has reached a point where it's profitable enough to cover the initial costs. It checks if the current price of an asset has moved beyond a breakeven threshold, which accounts for slippage and trading fees. Essentially, it's looking to see if you've made enough profit to break even on the trade. 

The calculation used to find this threshold incorporates slippage and fee percentages, doubling their impact. It will automatically adapt to whether you're running a backtest or a live trade.

To use it, you just need to provide the symbol of the trading pair and the current market price.

## Function getBacktestTimeframe

This function helps you discover the available timeframe options for a specific trading pair, like BTCUSDT. It fetches a list of dates that represent the possible start points for your backtesting. Think of it as finding out what historical data is accessible for a particular cryptocurrency or stock. You provide the symbol of the trading pair, and it returns an array of dates.

## Function getAveragePrice

This function, `getAveragePrice`, helps you find the Volume Weighted Average Price (VWAP) for a specific trading symbol like BTCUSDT. It looks at the last five one-minute candles to figure this out.  The VWAP is calculated by finding the typical price of each candle (average of high, low, and close), multiplying it by the volume traded, summing those products, and then dividing by the total volume. If there’s no volume data available, it will instead calculate a simple average of the closing prices. You just need to give it the symbol you're interested in, and it will return a promise that resolves to the VWAP price.

## Function getAggregatedTrades

This function retrieves a list of combined trades for a specific trading pair, like BTCUSDT. 

It pulls this data from the exchange you're using within the backtest-kit framework.

By default, it retrieves all trades within a defined time window.  

You can also specify a `limit` to request a specific number of trades, and it will paginate through the trades to get you that many. The trades are fetched in reverse chronological order.

## Function getActionSchema

This function helps you find the detailed definition of a specific trading action, like buying or selling. You give it the name of the action you're interested in, and it returns a structured object that describes that action – including what parameters it expects. Think of it as looking up the blueprint for a particular trading move. It's useful when you want to dynamically generate forms or validate user input related to actions.

## Function formatQuantity

The `formatQuantity` function helps ensure your trade quantities are correctly formatted for the exchange you're using. It takes a trading symbol (like "BTCUSDT") and the raw quantity you want to trade, then applies the exchange's specific rules for decimal places. This function is vital for submitting valid orders because different exchanges have different precision requirements. Essentially, it translates your number into a string that the exchange understands.

## Function formatPrice

The `formatPrice` function helps you display prices correctly for different trading pairs. It takes the trading symbol, like "BTCUSDT," and the actual price as input. It then uses the specific formatting rules set by the exchange to ensure the price is shown with the right number of decimal places. This makes your displayed prices consistent with how the exchange itself presents them.

## Function dumpText

The `dumpText` function lets you save raw text data, like logs or reports, associated with a specific signal. Think of it as a way to record information related to a particular trading event. 

It handles the signal identification for you, figuring out which signal it belongs to, and it adapts to whether you're running a backtest or a live trading scenario.

You provide a data object (`dto`) containing the bucket name, a unique identifier for the data, the actual text content, and a description for what that content represents. This function then securely saves that text data.


## Function dumpTable

This function helps you display data in a structured table format, perfect for examining results during backtesting or live trading. It takes an array of objects, which represents your data, and presents them in an organized table. The function smartly figures out the correct context – whether you're in a backtest or a live trading environment – and uses that information. It also automatically detects and uses any pending or scheduled signals that are relevant to the current operation. The table's column headers are automatically generated based on all the different keys found in your data.

To use it, you'll need to provide a bucket name, a unique identifier for the data (dumpId), the array of data objects (rows), and a short description of the data. The function will handle the rest, formatting and presenting your data in a readable table.


## Function dumpRecord

The `dumpRecord` function allows you to save a structured piece of data—think of it as a flat collection of key-value pairs—associated with a specific signal. It’s useful for capturing relevant information during a trading simulation or live execution. The function intelligently figures out which signal to connect this data to, and it adapts to whether you're running a backtest or a live trading environment.

You provide a data object containing the name of the bucket, a unique identifier for the dump, the record itself (the key-value data), and a brief description for clarity. This function handles the technical details of saving the record, ensuring it's properly stored and consistent with the system's mode of operation.


## Function dumpJson

The `dumpJson` function lets you save complex data structures, like results or configurations, as formatted JSON within your backtest or live trading environment. It's designed to neatly present nested objects in a readable JSON format, associating them with a specific bucket and ID. This function handles the technical details of where and how the JSON is saved, adapting to whether you're running a backtest or a live trade. You just provide the data you want to save, a description, and it takes care of the rest, ensuring the data is linked to the correct signal.


## Function dumpError

The `dumpError` function lets you report detailed error information linked to a specific data bucket and dump ID. Think of it as a way to flag and categorize errors that occur during your backtest or live trading. It automatically identifies whether you're running a backtest or a live session and handles the signal context for you, so you don’t have to worry about those details. You provide a description of the error, along with the bucket name, dump ID, and its content.

## Function dumpAgentAnswer

The `dumpAgentAnswer` function helps you save and review the complete conversation history between the agent and the user. It essentially creates a snapshot of the messages exchanged, linked to a specific signal.

This function automatically figures out whether you're in a backtesting environment or a live trading scenario, and it also identifies the relevant signal to associate with the message dump. 

You provide a data object containing the bucket name, a unique identifier for the dump, the actual messages, and a brief description to help you understand what the dump represents. This is useful for debugging, auditing, or analyzing agent behavior.


## Function createSignalState

The `createSignalState` function helps you manage the state of a trading signal, especially when dealing with complex strategies like those driven by LLMs. Think of it as a way to keep track of things like peak profit, how long a trade has been open, and other metrics you're calculating for each trade.

It creates two functions: `getState` and `setState`.  You use `getState` to see the current signal value and `setState` to update it.

The best part is that these functions automatically figure out whether you're in backtesting mode or live trading mode; you don’t have to tell them.

This is really designed for situations where you're collecting detailed information about each trade, potentially across many trades to analyze the overall performance of a strategy. The example describes situations that might involve drawdown of up to 2.5% and peak profits around 2-3% for profitable trades, and a focus on keeping peak profits very low for stop-loss trades. If a trade is open for a certain amount of time and hasn't reached a certain profit level, there's a rule to exit it.

## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It's a shortcut that automatically figures out the right percentage shift needed to achieve that price, based on the original take-profit distance you initially set. The system knows whether it’s running a backtest or a live trade, and it gets the current market price to help calculate the adjustment. You just need to provide the symbol of the trading pair and the take-profit price you want.


## Function commitTrailingTake

The `commitTrailingTake` function lets you dynamically adjust the take-profit distance for a pending trade. It’s designed to refine your take-profit levels based on market movement.

A key thing to remember is that the adjustment is always calculated based on the original take-profit distance set when the trade was initially placed, not any previously adjusted trailing take-profit. This helps avoid cumulative errors in your take-profit management.

The `percentShift` parameter determines the size of the adjustment; larger shifts will override smaller ones, always moving the take-profit closer to the entry price.  A negative shift pulls the take-profit closer to the entry price, making it more conservative, while a positive shift moves it further away, making it more aggressive.

The function intelligently handles adjustments based on the trade direction. For long positions, the take-profit will only be moved closer to the entry price. For short positions, it will only be moved further away.

Finally, the function automatically recognizes whether it’s operating in a backtesting or live trading environment, adapting its behavior as needed. You provide the trading pair symbol, the percentage adjustment, and the current market price.

## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss order. It simplifies updating the stop-loss by handling the conversion from an absolute price to the percentage shift it represents based on your original stop-loss distance. The function automatically figures out whether it's running in a backtest or live trading environment and also retrieves the current price to make the adjustment. You provide the symbol of the trading pair and the new absolute stop-loss price you want to set. The function will then return a boolean, indicating whether the change was successful.

## Function commitTrailingStop

The `commitTrailingStop` function helps you manage your trailing stop-loss orders. It lets you adjust how far your stop-loss is from your entry price.

It's important to remember that it calculates adjustments based on the original stop-loss distance you initially set, not the current, potentially adjusted, trailing stop-loss. This prevents small errors from building up over time.

When you call this function, you specify the symbol you're trading, a percentage to adjust the stop-loss distance by, and the current market price.

Negative percentages tighten your stop-loss (bringing it closer to your entry price), while positive percentages loosen it (moving it further away). The function only makes changes that increase your profit protection – it won’t move your stop-loss in a direction that would reduce it.

For long positions, the function will only move the stop-loss higher, and for short positions, it'll only move it lower. It works automatically whether you're backtesting or trading live.

## Function commitSignalNotify

This function lets you send out informational messages about your trading strategy. Think of it as a way to add notes or alerts related to decisions being made, but without actually changing your open positions. 

It's helpful for things like logging when a specific condition is met within your strategy, sending custom alerts, or just keeping track of what's happening during a trade. 

The function automatically figures out whether you’re in backtest or live mode, and grabs details like your strategy and exchange names. It even gets the current price for you, so you don't have to.

You provide the trading symbol, and optionally add extra details to your notification.


## Function commitPartialProfitCost

This function helps you partially close your trades when you've reached a certain profit level, measured in dollars. It simplifies the process by automatically calculating the percentage of your position to close based on the dollar amount you specify.

Essentially, it's a quick way to lock in some profit while letting the rest of the trade continue running towards your ultimate take profit target. 

The function handles details like determining whether you're in a backtest or live trading environment, and fetching the current price, so you don't have to.

You provide the trading symbol and the dollar amount you want to commit to closing, and the function takes care of the rest. 
The price needs to be heading in the direction of your take profit for this to work.


## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trade when the price is moving in a profitable direction, effectively moving you closer to your target profit. You specify which symbol you're trading and what percentage of the position you want to close. It handles whether you're running a backtest or a live trading session, so you don't have to worry about that. This function is useful for locking in some profits along the way. 

For example, if you have a trade open for "BTCUSDT" and you want to close 50% of the position when it's profitable, you would call `commitPartialProfit("BTCUSDT", 50)`.


## Function commitPartialLossCost

This function lets you partially close a position when the price is trending in a loss direction, helping you manage risk. It simplifies the process by taking a dollar amount you want to close, and automatically calculates the percentage of your position that represents.  You specify the symbol you’re trading and the dollar value you want to commit to the partial close. The framework handles the details of figuring out the percentage and gets the current price for you. It works in both backtesting and live trading environments.

## Function commitPartialLoss

The `commitPartialLoss` function helps you partially close your open positions when the price is moving in a direction that would trigger your stop loss. 

Essentially, it lets you reduce your risk by closing a portion of the position, for example, if you think the market might reverse.

You specify the trading symbol and the percentage of the position you want to close, with a value between 0 and 100. The function will automatically adapt to whether it's running in a backtesting environment or a live trading account. 


## Function commitCreateTakeProfit

This function lets the system know that a take-profit order for a pending trade has actually been filled on the exchange, even if it bypassed the usual VWAP-based checks. It's used to reconcile what the strategy *thinks* is happening with what's *actually* happening on the exchange, ensuring accurate reporting.  Essentially, it tells the framework a take-profit order went through, resulting in a trade closure.

The function confirms the closure with a "take_profit" reason on the next market update. If there's no active pending trade signal, the function does nothing. The system recognizes if it's running in a backtest or a live trading environment.

You can also include extra details like a transaction ID or a note about the trade with the optional `payload` parameter.

## Function commitCreateStopLoss

This function tells the backtest kit that a stop-loss order you previously set up has been filled on the exchange. Sometimes, the price moves so quickly that the exchange executes the order even if it bypasses the usual VWAP-based check. 

Think of it as letting the framework know, "Hey, that stop-loss order we were anticipating? It just happened!"

It's important to note that the closing of the position will happen on the next tick, and the reason for closing will be registered as "stop_loss". If you don't have a pending signal, this function won't do anything. 

The function automatically adapts to whether you're running a backtest or a live trading session.

You can also add extra information like an order ID or a note to this report if you want to keep track of things.

## Function commitCreateSignal

This function lets you send custom signals into the backtest or live trading environment. Think of it as a way to inject your own trading logic directly into the system, bypassing the usual signal retrieval process.

You provide a data object – the `dto` – that represents your signal, along with the symbol it applies to.  The system then handles it, potentially executing immediately based on price conditions or scheduling it for later.

The system checks to ensure that a signal isn't already being processed, and it validates your signal data to prevent errors.  It intelligently figures out whether it's running a backtest or a live trading session.

It's useful for situations where you need to control the timing and execution of signals with a very fine level of detail.

## Function commitClosePending

This function lets you close a pending trade without interrupting your strategy's overall operation. Think of it as tidying up a pending order – it removes the pending signal from the active position, but the strategy keeps running and can still generate new signals.  It's designed to be quick and clean, not affecting scheduled signals or triggering any stop flags. You can optionally add a note or ID to record why you're committing the close. The framework will automatically handle whether you're running a backtest or a live trading session.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled trading signal without interrupting your trading strategy. Think of it as hitting the pause button on a future trade instead of stopping the whole process. It clears the pending signal that was waiting for a specific price to activate. Importantly, it won't affect any existing orders or stop your strategy from creating new signals, and it doesn’t trigger a stop flag. The system figures out if it’s running a backtest or live trading based on its environment.

You specify the trading pair's symbol to cancel the signal for, and optionally include some extra information like an ID and a note related to the cancellation.


## Function commitBreakeven

The `commitBreakeven` function helps automate risk management during trading. It automatically shifts your stop-loss order to the price you initially entered the trade at, essentially eliminating risk.

This happens when the price moves favorably enough to cover both slippage (a slight price difference) and trading fees. 

The function handles determining whether it’s running in a backtesting environment or a live trading environment without needing explicit instructions, and it gets the current price information for you. You simply need to specify the trading pair symbol.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new buy order to your existing trading strategy, specifically designed for dollar-cost averaging (DCA). 

It essentially records a purchase at the current market price, keeping a running average of your purchase prices to calculate an effective open price. 

This function automatically figures out whether it’s being used in a backtest or a live trading environment and will fetch the current price for you. You need to provide the trading pair's symbol, and optionally a cost. This action also signals a "average-buy commit" event, which can be used by other parts of your trading system.


## Function commitActivateScheduled

The `commitActivateScheduled` function lets you manually trigger a scheduled signal before the price actually hits the target level. 

Think of it as a way to override the automatic activation.

It’s useful if you need to force a trade to happen sooner.

You specify the symbol you're trading, and optionally, provide extra details like a commit ID and a note for record-keeping. 

The framework automatically knows whether it's running a backtest or a live trading session.


## Function checkCandles

The `checkCandles` function helps verify if your historical price data (candles) are already saved and ready to use. It's like a quick check to see if you need to download the data again. Instead of loading everything, it efficiently checks for each timestamp to see if a candle exists, making it fast and avoiding unnecessary downloads.  You provide some parameters to guide this check, telling it what data to look for.

## Function cacheCandles

The `cacheCandles` function makes sure your trading data is stored correctly. It checks if the data you need (candles for a specific symbol, timeframe, and date range) is already saved. If not, it fetches the missing data from an external source and then verifies that the storage is complete. This process repeats once to guarantee that you have a reliable, up-to-date record of historical market data. It's like a double-check to avoid errors in your backtesting.

You provide details like the trading symbol, the time interval (e.g., 1 minute, 1 day), the start and end dates, and the exchange you're using. You can also include callback functions to track the beginning of the check and the start of the data download.

## Function addWalkerSchema

This function lets you register a "walker," which is essentially a way to run and compare multiple trading strategies against each other using the same historical data. Think of it as setting up a race between different strategies, all running the same course. You provide a configuration object, which defines how the walker should operate, including which strategies to test and how to measure their performance. This enables systematic comparison and analysis of different trading approaches.

## Function addSweepSchema

This function lets you register a sweep, which is essentially a way to systematically test and optimize trading strategies. Think of it as running a series of experiments on your trading ideas. 

It takes a configuration object that defines how the sweep should be executed.

The sweep works by simulating your trading strategy over a period, using a single candle for each experiment. It learns from the simulated trades and evaluates different parameter combinations to find the best settings for entries and exits. If you don't specify some parameters, the system will use default values.


## Function addStrategySchema

This function lets you register a new trading strategy with the backtest-kit framework. Think of it as telling the system about a new way you want it to trade.

When you register a strategy this way, the framework automatically checks it to make sure it's set up correctly – things like the price data, stop-loss logic, and timestamps all make sense.  It also helps prevent signals from being sent too frequently. Finally, if you're running the backtest in a "live" mode, the system can safely store information about your strategy even if something unexpected happens.

You pass in a configuration object that describes how the strategy should work.


## Function addSizingSchema

This function lets you tell the backtest-kit framework how to determine the size of your trades. You provide a configuration object, which specifies things like whether you’re using a fixed percentage, a Kelly criterion, or an ATR-based approach for sizing.

It also allows you to set parameters like your acceptable risk level, multipliers for different sizing methods, and constraints on the minimum or maximum size of a position.

Essentially, it's how you teach the system how to calculate how much to buy or sell in each trade. The configuration can also include custom logic using callbacks.


## Function addRiskSchema

This function lets you configure how risk is managed within your backtesting system. 

Think of it as setting up rules to prevent your strategies from taking on too much risk simultaneously. 

It allows you to define limits on how many positions your strategies can hold at once and implement custom checks for things like portfolio balance or correlations. You can even create callbacks to handle situations where a trading signal is rejected or allowed based on risk considerations. 

Importantly, multiple strategies use the same risk management system, which means it can analyze risk across all your strategies at the same time. This shared view of positions helps ensure overall stability and prevents unwanted surprises. You'll provide a configuration object detailing these risk rules.


## Function addMCPSchema

This function lets you connect a strategy to an MCP (Market Connectivity Protocol) agent. Think of it as linking your trading strategy to a system that can observe its performance and send it instructions.

When you register a schema, the MCP will track the strategy's status and be able to issue commands to adjust positions.

The MCP also handles displaying portfolio information to the agent; if you don’t provide custom display logic, it will show a basic text message for each traded asset. You provide the MCP configuration object to tell the framework how to connect.


## Function addFrameSchema

This function lets you tell the backtest-kit how to generate the timeframes it will use for your backtesting analysis. Think of it as defining the scope and granularity of your historical data. You provide a configuration object that specifies the start and end dates for your backtest, the interval at which timeframes should be created (like daily, weekly, or monthly), and a function that will be called whenever a new timeframe is generated. Essentially, you're teaching the system how to break down your data into manageable chunks for evaluation.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your simulations. Think of it as registering a data source – you’re providing the framework with the details needed to fetch historical price data, format prices and quantities, and even calculate a moving average price (VWAP) based on recent activity. You’ll need to provide a configuration object describing the exchange.

## Function addActionSchema

This function lets you register a new action handler within the backtest-kit framework. Think of actions as triggers that react to events happening during your backtest, like signals, profit targets, or losses. 

These actions allow you to connect your backtest to external systems, such as sending notifications to a messaging app, logging key events, or even triggering custom logic based on what's happening in the simulation. 

Each action is specific to the strategy and the timeframe being tested, receiving all relevant events generated during that execution.  You provide a configuration object, `actionSchema`, when registering the action to define its behavior.
