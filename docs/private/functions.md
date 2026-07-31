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

The `writeMemory` function lets you store data that’s specific to a particular trading signal. Think of it as creating a labelled container for information that your strategies need to remember. 

You provide a name for the container (`bucketName`), a unique identifier for the memory within that container (`memoryId`), the actual data you want to save (`value`), and a short description to help you understand what’s being stored. 

This function handles the technical details of making sure the data is saved correctly, whether you're running a test or a live trading scenario, and ensures the right signal is being used. It essentially provides a convenient way to manage and persist data related to individual signals.


## Function warmCandles

The `warmCandles` function helps speed up your backtesting by proactively fetching and storing historical candle data. It's like pre-loading the data you'll need, so your backtest doesn’t have to download it repeatedly during the simulation. You tell it the start and end dates (the `from` and `to` dates) and the interval (like 1m, 5m, or 1h) for the candles you want to retrieve. This function then grabs those candles and saves them, making subsequent backtests much faster. Think of it as warming up your data before the race begins.


## Function waitForReady

This function ensures all the necessary components are fully set up before you begin trading, whether you're doing a backtest or live trading. It waits for confirmation that the schema registries—which define things like exchange data, trading strategies, and historical data windows—are populated.

It checks these registries every second, but only for a limited time.

In backtest mode, it waits for all three types of registries (exchange, frame, and strategy). For live trading, it only needs the exchange and strategy registries, as historical data isn't used.

Think of it as a safety check at the beginning of your program to avoid errors later on. If the registries don't become available within the timeout period, the function doesn't throw an error itself; instead, any subsequent attempts to start trading will likely generate an error message that helps you diagnose the problem. 

You can tell it whether you’re doing a backtest or live trading through the `isBacktest` parameter.

## Function validate

This function, `validate`, helps you make sure everything is set up correctly before you start any backtesting or optimization runs. It checks that all the things you're referencing – like exchanges, trading frames, strategies, and risk management settings – actually exist and are properly registered within the system.

You can tell it to validate specific items, or if you leave it blank, it'll check everything at once for a really thorough review. The system remembers the results of these checks to make future validations run faster. Think of it as a quick safety check to prevent errors later on.


## Function stopStrategy

This function allows you to halt a trading strategy's signal generation. It essentially pauses the strategy, preventing it from creating any new trading signals. 

Existing signals that are already active will still run to completion. 

Whether you're running a backtest or live trading, the strategy will gracefully stop at a safe point, typically when it's idle or after a signal has finished executing.

You simply need to specify the trading pair symbol – the framework figures out which strategy to stop based on your current setup.

## Function shutdown

This function lets you safely end a backtest run. It sends a signal to all parts of the backtest system, giving them a chance to clean up anything they're doing before the program finishes. Think of it as a polite way to tell everything to wrap up and exit, ensuring no data is lost or corrupted. It's particularly useful when you need to stop the backtest because of an external event, like pressing Ctrl+C.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it like hitting a pause button. 

When paused, the strategy won't react to new signals or create new orders, but it will still manage any existing positions and pending signals as usual. 

Any signals that were waiting to be acted upon will remain queued until you resume the strategy. This setting is saved and reapplies even if the system restarts. 

To get the strategy trading again, you'll need to explicitly unpause it. The system also sends out a notification when the paused state changes. The function works whether you're running a backtest or a live trading session.

You provide the trading pair (like "BTC-USDT") and a boolean value indicating whether to pause (true) or resume (false) the strategy.

## Function setSignalState

This function lets you update a piece of data that's tied to a specific trading signal. Think of it as saving a snapshot of information related to a particular trade.

It cleverly figures out if you're in a backtesting mode or live trading environment automatically.

The main purpose is to help strategies, often powered by AI, that track details about each trade—like how much profit they're making and how long they've been open—to improve their performance.

The function expects you to provide the trading symbol, a way to send the updated data (which could be an object or a special dispatcher), and an object containing the bucket name (where the data will be stored) and the initial value of the data. It then returns a promise that resolves with the updated data.

If there's no active trading signal to associate this data with, the function will let you know.


## Function setSessionData

The `setSessionData` function lets you store information that sticks around during a backtest or live trading session. Think of it as a place to hold data like the results of complex calculations or the state of an indicator – things you want to remember between candles and even across restarts. You can use it to cache results, track progress, or manage any temporary data that needs to be preserved during a trading run. 

To clear the stored data, simply pass `null` as the value. The function automatically handles whether it's running a backtest or a live session, so you don’t need to worry about that.

Here's what you need to know:

*   You provide a symbol (like "BTC-USD") to identify what data you're storing.
*   You pass in a value – an object containing the data you want to save.
*   Passing `null` removes the associated data.


## Function setLogger

You can now control where and how backtest-kit's internal logging appears. The `setLogger` function lets you plug in your own logger, which will receive all log messages from the framework. This is especially helpful if you want to integrate with your existing logging infrastructure or add extra context to the log messages, such as the trading strategy or exchange being used. The logger you provide should implement the `ILogger` interface, which defines the expected methods for logging.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the environment for your trading tests. You can change specific settings from the default values by providing a partial configuration object.

If you're working within a testing environment and need to bypass certain safety checks, the `_unsafe` flag allows you to do so, though use this cautiously. It’s mainly needed when building the testbed.

## Function setColumns

The `setColumns` function lets you customize the columns that appear in your backtest reports when they're generated in markdown format. You can use it to change how data is displayed, for example, by renaming or reordering columns.

It accepts an object containing the column configurations you want to change; this object doesn't need to include *all* columns, just the ones you're modifying. The framework will check your changes to make sure they're valid, but if you're working in a test environment and need maximum flexibility, there's a special flag to skip those checks.

## Function searchMemory

The `searchMemory` function helps you find relevant memory entries related to your trading signals. It uses a powerful search technique called BM25 to rank the results, making sure the most important entries appear first. 

This function automatically figures out which signal you're working with and whether you're in a backtesting or live trading environment, so you don't have to specify those details. 

You provide a `dto` object that includes the name of the memory bucket to search and the actual search query. The function then returns an array of results, each containing a unique memory ID, a score indicating its relevance, and the memory content itself. The content’s type is determined by whatever object you define.

## Function runInMockContext

This function lets you run pieces of code within a simulated backtest or live trading environment. It's particularly helpful for testing or scripting when you need to access things like timeframe data but don't want to run a full backtest.

You provide a function to execute and an optional configuration object to define the environment it runs in. 

If you don’t specify the environment details, it uses default placeholder values, effectively creating a simple, live-mode context. You can customize aspects like the exchange, strategy, timeframe, and whether it's in backtest mode to match your testing needs. The `when` parameter, if not provided, will default to the current minute.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data to keep things running efficiently.

It automatically handles the signal context, whether you’re running a backtest or a live trading session.

The `dto` object you provide contains two key pieces of information: the name of the bucket where the memory is stored and the unique ID of the memory entry you want to remove. 

Essentially, it's a straightforward way to erase unwanted memory data linked to a particular signal.

## Function readMemory

The `readMemory` function lets you retrieve data that’s been stored in memory, specifically within the context of a trading signal. Think of it as accessing a saved variable linked to a particular signal. 

It automatically figures out which signal it's currently working with, so you don't have to specify that manually. 

Also, the function knows whether it's running a backtest or a live trading session, and adjusts accordingly. 

You provide a description (bucketName) and a unique identifier (memoryId) to pinpoint the exact data you want to retrieve. The function returns the data, typed based on how you structured it initially.


## Function overrideWalkerSchema

This function lets you tweak existing strategy comparison setups, specifically the “walker” configurations. Think of a walker as a set of rules for exploring different strategy parameters.

You can use it to modify only the parts of a walker you want to change—like adjusting the range of a specific parameter—while keeping the rest of its settings as they were. It’s helpful when you want to refine an existing comparison without starting from scratch. The function returns a promise that resolves to the updated walker configuration. You provide a partial walker configuration object as input.

## Function overrideSweepSchema

This function lets you modify a sweep configuration that's already been set up within the backtest-kit. Think of it as updating a partially completed plan – you can change specific parts of the sweep without rebuilding the whole thing. It’s useful when you need to tweak a sweep's settings after it’s already started. Keep in mind that because of how the system handles sweep connections, changes made through this function won't affect existing sweep instances; they only impact new ones. You might need to clear the sweep connection service to ensure the updates are applied. You provide a partial configuration – only the fields you want to change need to be included.

## Function overrideStrategySchema

This function lets you modify a trading strategy that’s already set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy—you can update certain parts of its configuration without having to redefine the whole thing. 

You provide a new set of settings, and this function will merge them with the original strategy’s definition, leaving any parts you didn’t specify untouched. It’s useful for adjustments or refinements to a strategy after it's been initially created.

The input is a partial strategy configuration—just the pieces you want to change. It returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you tweak an already existing sizing configuration within the trading system. Think of it as making small adjustments rather than creating a whole new configuration from scratch. You provide a partial configuration – only the bits you want to change – and the function will update the original configuration, leaving the rest untouched. This is useful when you need to fine-tune sizing rules without completely redefining them.

## Function overrideRiskSchema

This function lets you tweak a risk management setup that's already in place. Think of it as a way to make small adjustments without having to redefine the entire risk configuration from scratch. You provide a piece of the configuration – just the parts you want to change – and the function updates the existing setup, leaving everything else untouched. It’s useful for making incremental changes to your risk controls.


## Function overrideMCPSchema

This function lets you tweak an existing MCP (Model Context Protocol) setup within the backtest-kit framework. Think of it as a way to fine-tune a configuration without having to rebuild it from scratch. You provide a partial configuration – just the bits you want to change – and the function updates the existing MCP, leaving everything else untouched. It’s useful for making small adjustments or overriding specific settings within a larger model context. The changes you make are applied as a promise, so the process is asynchronous.

## Function overrideFrameSchema

This function lets you modify an existing timeframe setup used in backtesting. Think of it as making targeted adjustments to a timeframe's settings without completely rebuilding it. You specify only the parts of the timeframe you want to change, and the rest of the original configuration stays as it was. It’s useful for fine-tuning your timeframe parameters after the initial setup. The function returns the updated timeframe configuration.

## Function overrideExchangeSchema

This function lets you modify how the backtest-kit understands data from a particular exchange. Think of it as a way to tweak an existing exchange's settings without having to redefine the entire configuration from scratch. You provide a set of changes – like updating the symbol mapping or changing a data field – and the function applies only those modifications to the existing exchange schema. It's useful for correcting small errors or adding customizations to how your backtest kit interprets exchange data. Only the properties you provide in the new configuration will be updated, leaving everything else untouched.

## Function overrideActionSchema

You can use this function to tweak how actions are handled within the backtest kit. Think of it as a way to adjust specific parts of an existing action handler – maybe you need to change a callback function or update some settings – without having to completely replace the original configuration. This is handy for things like adapting your event handling based on whether you're in a development or production environment, or even switching out different versions of your handler code. The function only updates the sections you specify; everything else stays as it was originally set.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, one strategy at a time. 

It allows you to register a function that will be called after each strategy finishes running during a backtest. 

Importantly, even if your tracking function takes some time to complete (like making a network request), the backtest kit will ensure that events are processed one after another in the order they are received, preventing any hiccups in the process. To stop listening, just call the function that’s returned by `listenWalkerProgress`.

## Function listenWalkerOnce

`listenWalkerOnce` lets you temporarily listen for updates from a trading walker, but only react to the very first event that matches your criteria. You provide a function that decides which events you're interested in, and another function that gets executed when a matching event arrives. After that single execution, the listener automatically stops, so you don’t need to worry about cleaning it up. It's really handy when you need to wait for a particular state to be reached in the trading process. 

You specify a filter function to identify the relevant events, and a callback function that will be called only once when an event passes the filter.


## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your strategies. It’s like setting up a listener that gets triggered when everything is done. The listener function you provide will be called whenever the backtest completes, and it will receive information about the completion event. Importantly, the notifications are handled one at a time to ensure things run smoothly, even if your listener function needs to do some asynchronous work. You can unsubscribe from these notifications when you no longer need them by calling the function returned by `listenWalkerComplete`.

## Function listenWalker

This function lets you listen for updates as a trading strategy is being tested. It’s like setting up an observer to watch the backtest unfold. 

Specifically, you'll receive notifications after each individual strategy finishes running during a `Walker.run()`. 

The updates are delivered one at a time, and even if your callback function takes some time to process each update, the framework ensures that these notifications are handled in the order they arrive, without overlapping. This helps maintain a predictable and sequential flow of information. To stop listening, the function returns another function you can call.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process. Think of it as a way to catch errors when the system is checking signals.

When a validation check fails, this function will call the callback you provide, allowing you to debug or track these failures.

Importantly, the errors are handled one at a time, even if your callback function takes some time to complete. This ensures a predictable and orderly way to deal with validation issues.

To use it, you just pass in a function that will be triggered whenever a validation error occurs. The function will receive an error object, giving you details about the problem. You can then unsubscribe from these events whenever you want.

## Function listenSyncOnce

This function lets you set up a one-time listener for synchronization events related to orders. It's like setting up a trap – once the condition you specify is met (defined by `filterFn`), the provided function (`fn`) will be executed *only once*, and then the listener is automatically removed.

Crucially, this listener acts as a gatekeeper. If the function you provide throws an error, it can potentially block the order, with different error types indicating different levels of severity and retry possibilities. Think of it as a safety net to ensure specific conditions are met before an order proceeds.

You define what events trigger your function using the `filterFn`. The `fn` is what actually handles the event and can even perform asynchronous operations; the process will wait for the function to complete. The `warned` parameter is for internal use and doesn't need to be adjusted.

## Function listenSync

The `listenSync` function lets you monitor events related to signal synchronization, like when a signal is being opened or closed. It's designed for situations where immediate processing is critical, but potentially involves asynchronous operations.

Think of it as a way to react to changes in the system’s state and to ensure that any errors encountered during those changes are handled correctly.

If something goes wrong within your listener function, you can throw an error – this will determine how the system reacts. For instance, some errors might cause automatic retries, while others might lead to immediate shutdown. The function returns a method to unsubscribe from these synchronization events. 


## Function listenStrategyCommitOnce

This function allows you to temporarily watch for specific strategy changes within your backtesting environment. You provide a filter – a way to identify the exact events you're interested in – and a function that will run just *once* when that event occurs. After that single execution, the listener automatically stops, ensuring you don't inadvertently react to further events. It's ideal for situations where you need to respond to a particular setup or initialization of a strategy. 

Essentially, it’s a quick way to listen and react, then quietly disappear.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. You can register a callback function that gets notified whenever a significant event occurs, like a stop-loss being adjusted, a partial profit being taken, or a signal being closed.

These events are handled one at a time to avoid any conflicts, even if your callback function takes a bit of time to process. 

Essentially, it's a way to react to changes in your strategy's behavior as they happen. The function returns a way to unsubscribe from these events when you no longer need them.

## Function listenSignalOnce

`listenSignalOnce` lets you temporarily listen for specific signal events and react to them just once. 

You provide a filter – a way to identify the exact signals you're interested in – and a function to run when a matching signal arrives.

Once that signal is detected and your function executes, the subscription automatically ends. 

Think of it as a quick, temporary listener that helps you wait for a particular trading condition to occur.


## Function listenSignalNotifyOnce

This function allows you to react to specific signal events just once and then automatically stops listening. You provide a filter—a function that checks if an event is relevant—and a callback function that will be executed when a matching event occurs. After the callback runs the first time, the subscription is automatically cancelled, preventing further notifications. It’s a convenient way to handle a single, important signal without needing to manually unsubscribe later.

## Function listenSignalNotify

This function allows you to be notified whenever a trading strategy shares information about a signal. Think of it as subscribing to updates about what's happening with a specific trade. 

When a strategy uses a function to broadcast a note, this function will trigger your callback.

Importantly, these updates are handled one at a time, even if your callback takes some time to process, ensuring a consistent order of events. This queuing prevents conflicts and makes sure everything is handled smoothly. You provide a function as an argument; this function will be called whenever a new signal note becomes available.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific signals coming from a live trading simulation. It's designed for situations where you only need to react to an event once and then stop listening. 

You provide a filter function to define which signals you’re interested in, and a callback function that will be executed when a matching signal arrives. 

Once the callback runs, the listener automatically stops, ensuring it doesn’t interfere with other processes. This is useful for things like capturing initial state information or performing a single action based on a particular signal. The listener is specifically tied to events generated by `Live.run()`.


## Function listenSignalLive

This function lets you subscribe to live trading signals generated during a backtest run. It's useful for monitoring what's happening in real-time as the backtest progresses.

When you use `listenSignalLive`, you provide a function that will be called whenever a new signal event occurs. These signals are delivered sequentially, ensuring they are processed in the order they were received.

Importantly, you will only receive signals from backtests that are actively running using `Live.run()`. The function you provide will be responsible for handling the `IStrategyTickResult` data associated with each signal. This allows you to monitor the backtest's performance as it runs. When you are done listening, the returned function can be called to unsubscribe.

## Function listenSignalEventOnce

This function lets you react to a specific trading signal event just once and then automatically stop listening. You provide a filter to identify the exact event you're interested in, and a function to execute when that event occurs. Think of it as a temporary observer – it listens, responds, and then quietly steps away, making it ideal for situations where you only need to react to an event one time, like waiting for a particular order to be filled.


## Function listenSignalEvent

The `listenSignalEvent` function lets you monitor what's happening with your trading signals. It's like setting up an alert system for when a signal is created or closed. You'll receive notifications when a signal starts (either automatically or through your actions) and when it finishes, whether that’s due to a profit target, a stop-loss, or simply the time running out. 

This function handles things in order, ensuring that events are processed one after another even if the processing involves asynchronous operations. 

You provide a function that gets triggered each time a signal event occurs, giving you a chance to react to these changes in your trading system.


## Function listenSignalBacktestOnce

This function lets you tap into the stream of events generated during a backtest run, but only to receive a single event that matches your specific criteria. You provide a filter – essentially, a rule that determines which events you’re interested in – and a function that will be executed when an event matches that filter. After that single execution, the function automatically stops listening, freeing up resources. It’s ideal for situations where you need to react to a particular event just once during the backtest.


## Function listenSignalBacktest

This function lets you hook into the backtest process to receive updates as it runs. It's like setting up an alert system for your backtest. 

Specifically, you'll get notifications—called `IStrategyTickResult` events—as the backtest progresses, originating from calls to `Backtest.run()`. These notifications are delivered one after another, in the order they happen, so you can be sure you’re seeing the events in the right sequence. 

To use it, you provide a function that will be called with each of these events. When you're done listening, the function it returns lets you unsubscribe, ensuring no further events are sent to your callback.

## Function listenSignal

This function lets you react to what’s happening during a trading simulation. It’s like setting up a listener that gets notified whenever a trading strategy changes state—like when it's idle, opens a position, is actively trading, or closes a position.

The listener receives all these events, one after another, even if your reaction to the event takes some time to complete. To keep things orderly and avoid any conflicts, the system handles these events in a specific order and ensures they are processed one at a time.

You provide a function (`fn`) that will be called each time an event occurs. This function will receive an object containing details about the specific signal event that just happened.


## Function listenSchedulePingOnce

This function lets you set up a temporary listener for ping events – events related to scheduled tasks. You provide a rule (a filter) to identify the specific ping event you're interested in. Once that event happens, a function you provide will run just once, and then the listener automatically stops. It’s handy when you need to react to a particular event and then be done with it.

It takes two parts: the rule for identifying the event and the action to perform when that event is found. The function returns a way to turn off this listener whenever you need.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep tabs on what’s happening with your scheduled trading signals. It essentially sets up a listener that gets notified every minute while a signal is waiting to become active.

Think of it as a way to monitor the lifecycle of a signal – you can use it to track its progress and build custom checks or alerts.

You provide a function (`fn`) that will be called whenever a ping event occurs. This function will receive information about the ping, allowing you to react to it.

When you’re done needing this monitoring, the function returns another function that you can call to unsubscribe from the ping events.

## Function listenScheduleEventOnce

This function lets you react to a specific scheduled event, but only once. It’s perfect for situations where you need to wait for something to happen, like a new schedule being created or an existing one being removed. You provide a filter to specify exactly which events you're interested in, and a function to execute when that event occurs. Once the event is triggered and your function runs, the subscription automatically stops, so you won’t keep getting notifications.

It provides a clean way to handle these one-off events without manual cleanup.


## Function listenScheduleEvent

This function lets you keep an eye on scheduled trading signals as they're created or cancelled. You'll receive notifications when a signal is initially scheduled or if it's cancelled before it even starts, for example, due to a timeout or price rejection, or even user action.

Keep in mind, this doesn't tell you when a signal actually *starts* trading. That activation event is reported through other mechanisms. 

Essentially, it’s a way to be informed about the setup and potential early termination of your scheduled trading plans. The events will be handled in the order they arrive, even if your callback function does some asynchronous processing.

To use it, you provide a function that will be called whenever a relevant event occurs, and this function will return a function to unsubscribe.

## Function listenRiskOnce

`listenRiskOnce` lets you react to specific risk rejection events just once and then stop listening. 

Think of it as setting up a temporary alert. You provide a condition – a filter – that defines what kind of risk rejection triggers your alert, and then you give it a function to run when that condition is met. 

Once the condition is met and the function runs, `listenRiskOnce` automatically takes care of itself, unsubscribing so it doesn't keep running. 

This is perfect for situations where you only need to respond to a particular risk rejection event a single time, like waiting for a specific market condition to occur. 

The function takes a filter function and a callback as arguments. The filter function determines which events are of interest, and the callback handles the event when it's identified.


## Function listenRisk

The `listenRisk` function allows you to be notified when a trading signal is blocked because it violates risk rules. 

It’s like setting up a listener specifically for situations where a trade is rejected based on risk constraints.

You'll only receive notifications when a signal *fails* the risk checks; signals that pass quietly won't trigger anything, preventing unnecessary alerts. 

The events are handled in order, and if your callback function needs to do something asynchronous (like making an API call), the system will ensure that these tasks are processed one at a time to avoid conflicts. To stop listening, the function returns another function that you can call to unsubscribe.

## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing in terms of timing. It sets up a listener that will notify you whenever a performance metric is recorded during the backtest. Think of it as a way to profile your strategy – you can use these notifications to spot slow operations or bottlenecks that might be impacting performance. The listener guarantees that the events are processed one at a time, even if the callback function you provide takes some time to complete. 

The listener returns an unsubscribe function so you can easily stop receiving these performance updates when you no longer need them. You provide a function as an argument; this is the function that will be called whenever a new performance event is available.

## Function listenPauseOnce

This function lets you react to specific changes in a contract’s paused state, but only once. You tell it what kind of pause events you're interested in by providing a filter – a function that determines if an event should be processed. Once an event matching your filter arrives, the provided callback function will be executed just one time to handle the event, and then the subscription is automatically removed. This avoids accumulating listeners and ensures you're only reacting to the initial pause state change.

## Function listenPause

This function lets you track when a trading strategy is paused or resumed. It's designed to notify you when the pause status changes, allowing you to inform users about these changes. The callback function you provide will be triggered whenever the strategy's pause flag is altered, even when new positions are suspended or resumed, and signals continue to close as usual. Events are handled one at a time to prevent any conflicts when your callback function runs. Effectively, it provides a reliable way to build user notifications related to strategy pauses.

You give it a function that will be called each time the pause status changes. This function receives a special "event" object that contains information about the pause. The function you provide also returns a function that can be used to unsubscribe from these notifications when you no longer need them.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit condition is met during a trade. You provide a filter – essentially, a rule that defines what kind of profit event you're looking for – and a function to run when that event happens. Once the condition is met and the function runs, the alert automatically goes away. It’s a simple way to react to a particular profit milestone without needing to continuously monitor the trade. This makes it perfect for things like triggering a notification or executing a specific action based on a specific profit threshold being reached.

## Function listenPartialProfitAvailable

This function lets you monitor your trades as they reach specific profit milestones – think of it as getting notified when your trade hits 10%, 20%, or 30% profit. 

It's designed to handle these notifications in a reliable way; even if the notification process takes a little time, it ensures events are processed one after another, keeping things organized. 

You provide a function that will be called whenever a profit milestone is reached, and this function receives information about the trade in question. The function you provide is then wrapped in a mechanism that prevents it from running multiple times at once, ensuring smooth operation. It returns a function that you can call to unsubscribe from receiving these profit notifications later.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to specific partial loss events, but only once. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. After that single execution, the listener automatically stops listening, making it perfect for scenarios where you need to react to something just one time. It’s a convenient way to wait for a particular loss condition and then take action.


## Function listenPartialLossAvailable

This function lets you set up a listener that gets notified whenever a specific loss level is reached during a trading simulation. Think of it as a way to keep tabs on how much your strategy has lost at various points.

The listener receives events indicating these loss milestones, like 10%, 20%, or 30% loss. Importantly, these events are handled one at a time, in the order they're received.

Even if your callback function needs to do something that takes time (like making an API call), the system makes sure it finishes before processing the next event. This prevents things from getting out of order or getting overwhelmed. To stop listening, the function returns a cleanup function that you can call.

## Function listenOrderStopOnce

This function lets you set up a listener that reacts to specific order-stop events, but it only runs the callback once when a matching event occurs. Think of it as a temporary alert – you’ll get notified about the first event that fits your criteria, and then the listener stops listening.

You define what kind of events you're interested in using a filter function. This filter is applied to each event, and only events that pass the filter will trigger your callback.

The callback function is what actually handles the event data. If your callback function returns a promise, the whole process will pause until that promise resolves.


## Function listenOrderStop

This function lets you monitor order-check events where an order was stopped, like when it was deleted or encountered too many temporary issues. 

It works alongside `listenOrderContinue` and triggers once for each signal when the check is finalized.

You'll receive notifications *before* the teardown happens, indicating whether the order was actively stopped or canceled by the user. The `event.attempt` property tells you how many times it tried and failed.

Importantly, this is a notification channel – any errors in your code handling these events won't disrupt the backtest process. It's designed for observing what happened, not for changing the outcome. The backtest won't perform order checks itself, so it's purely for observation.

You provide a function as input. If that function returns a promise, the processing will happen one step at a time to ensure stability.

## Function listenOrderRejectOnce

This function lets you set up a special listener that only triggers *once* when a specific order rejection event happens. Think of it as a one-time alert for a particular type of order rejection.

It's similar to the `listenOrderReject` function, but with the important difference that it stops listening after it has triggered once.  The event being listened for is a terminal order rejection – one that indicates a final decision. It only reacts to events happening "live" and any errors thrown within the callback are handled quietly.

You provide a filter function to decide which rejection events you're interested in, and then you define a callback function that will be executed when a matching event occurs. If your callback function returns a promise, the backtest will pause until that promise resolves before continuing. The function returns an unsubscribe function that will stop the listener.

## Function listenOrderReject

This function allows you to react to order rejections that have definitively failed – meaning the broker adapter has determined retrying won't help. It's a notification channel, so it informs you *after* a rejection has been confirmed. 

Think of it as a mirror reflecting what has already happened; it only triggers when an order has been outright rejected by the exchange.

It’s designed for safe use with external services like telegram bots or audit logs as any errors you encounter within your handling function won't interrupt the process. 

You provide a callback function that will be executed whenever an order is rejected. If that callback returns a promise, the processing will happen in a controlled, sequential order. This allows you to handle rejections in a way that’s safe and doesn’t disrupt the backtesting framework's operation.

## Function listenOrderFillOnce

This function lets you set up a temporary listener for order fill events from your broker. It's designed to react to fills that match specific criteria you define—think of it as a one-time alert for a particular trading scenario. 

You provide a filter function that determines which events trigger the listener. Then, you give a callback function that gets executed once when a matching event arrives.  The callback can even handle asynchronous operations if it returns a promise; the process will pause until the promise resolves. It works similarly to `listenOrderFill`, but it only runs once and then stops listening.

## Function listenOrderFill

This function lets you listen for when your orders are actually filled – meaning, the broker has confirmed the order went through. It's like a final confirmation after an order has been placed or executed.

You'll get notifications for three types of events: when a new position order is filled, when a resting entry order is placed, or when an exit order executes.

Importantly, this isn't a gate like `listenSync`; it's a notification. Any errors you encounter while processing these notifications won't disrupt the core process. This makes it reliable for things like sending updates to Telegram or audit logs.

The function you provide will be called with details about each fill event. If your function returns a promise, the processing will happen one after another to ensure stability.

## Function listenOrderContinueOnce

This function lets you set up a listener that reacts to specific order-check events related to continuing trades, but it only runs once and then automatically stops listening. You provide a filter to specify exactly which events you're interested in, and a callback function that will be executed when a matching event occurs. Think of it as a short-term alert system for a very particular trading condition. If your callback function needs to perform some asynchronous operations, like making an API call, the framework will wait for it to finish before moving on. 


## Function listenOrderContinue

This function lets you keep tabs on orders that are still being actively processed or scheduled. Think of it as a way to get updates on orders *after* the initial check – it tells you if the order is still valid and being monitored, or if there was a temporary issue that's being worked through.

It works alongside `listenOrderStop`, which handles order terminations. This function deals with the confirmations that an order is still open and needs to be watched.

Importantly, this only happens during live trading; backtesting doesn't include these order checks.

If your callback function takes time to process the data, you can have it return a promise to queue the execution, ensuring the process isn't interrupted. Any errors within your callback will be logged but won't impact the overall order monitoring process.

## Function listenMaxDrawdownOnce

The `listenMaxDrawdownOnce` function lets you react to specific maximum drawdown events, but only once. Think of it as setting up a temporary alert. You define a filter – a condition that must be met – and a callback function that will run when that condition is met during a drawdown event. Once the callback executes, the listener automatically stops listening. This is helpful if you need to take action immediately when a particular drawdown threshold is reached, and you don't want to keep monitoring after that.

It takes two pieces of information: a filter to identify the events you’re interested in and a function to execute when a matching event occurs. The function returns a function that you can call to unsubscribe.

## Function listenMaxDrawdown

This function lets you monitor when a trading strategy hits a new maximum drawdown. It's like setting up a listener that gets notified whenever the strategy's worst performance changes. 

The function will call your provided callback function whenever this happens. Importantly, even if your callback function takes some time to run (like doing calculations or updating a display), the listener ensures that these notifications are processed one after another, in the order they arrive. This avoids issues where multiple notifications might trigger actions concurrently. 

You can think of it as a way to keep a close eye on your strategy's potential losses and react accordingly, perhaps by adjusting risk levels. To stop listening, the function returns another function that you can call to unsubscribe from these notifications.


## Function listenIdlePingOnce

This function lets you react to idle ping events, which are signals about periods of inactivity. You provide a filter to specify which events you're interested in – essentially, a rule to decide if a ping should trigger.  Then, you give it a function that will run *just once* when a ping matches your filter.  The function returns a cleanup function you can call later to unsubscribe from these events.

## Function listenIdlePing

The `listenIdlePing` function lets you monitor for periods of inactivity in your trading system. It’s like setting up a listener that gets triggered when nothing else is happening – no orders being placed, no signals being processed. You provide a function that will be executed each time this idle period occurs. This allows you to perform maintenance tasks or other processes that don't need to interfere with active trading. The listener is returned and can be unsubscribed from when it’s no longer needed.

## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a specific trading condition is met – specifically, when a contract reaches a new highest profit level. You provide a filter to define what kind of profit events you’re looking for, and a function to execute when that event occurs. Once the condition is met and the function runs, the alert automatically stops listening. Think of it as a temporary, targeted notification system for peak profit moments. It's really handy for reacting to very specific, high-profit situations without needing to continuously monitor.


## Function listenHighestProfit

This function lets you monitor when a trading strategy achieves a new peak profit. It's like setting up an alert system that triggers whenever the strategy's profit reaches a new high.

You provide a function as input, and this system will call that function whenever a new highest profit is reached. Importantly, it handles these profit updates one at a time, ensuring that your code doesn't get overwhelmed even if profits fluctuate rapidly.

It’s a reliable way to keep track of profit milestones and build logic that reacts to those significant achievements in your trading strategy. You can use it to adjust parameters, generate reports, or perform other actions based on profit performance.


## Function listenExit

This function lets you be notified when something goes seriously wrong and stops the background processes like live trading, backtesting, or data walking. 

Think of it as an emergency alert system for your trading framework.

When a critical error occurs that brings the whole process to a halt, this function will call your provided function.

It guarantees that your error handling logic runs one step at a time, even if it involves asynchronous operations, preventing unexpected behavior. 

Essentially, you provide a function that will be executed when a fatal error occurs, providing a way to respond to unrecoverable situations.


## Function listenError

This function allows you to be notified whenever a recoverable error occurs while your trading strategy is running. Think of it as a safety net—if something goes wrong, like a problem connecting to an API, the strategy won't crash. Instead, you’ll receive an error message that you can handle. The errors are handled in the order they happen, and any actions you take in response to the error won’t interfere with the strategy's ongoing execution. It ensures your error handling runs smoothly and doesn't cause unexpected issues. You provide a function that gets called whenever a recoverable error occurs, giving you the ability to log it, retry the operation, or take other corrective measures.


## Function listenDoneWalkerOnce

This function lets you listen for when a background process finishes, but it's special because it only triggers your callback *once* and then stops listening. You provide a condition—a `filterFn`—that determines whether the completion event is relevant to you. When a background process completes and meets your condition, your provided callback function `fn` will be executed. After that single execution, the listener is automatically removed, ensuring it doesn't keep firing. 

It's useful for scenarios where you need to react to a specific completion event just one time and then don’t want to be bothered by subsequent events.


## Function listenDoneWalker

The `listenDoneWalker` function lets you monitor when background tasks within a trading walker finish running. It’s a way to be notified about the completion of these tasks, ensuring you get the information reliably. 

When a background task is done, the function calls the callback you provide. Importantly, these completion notifications are handled one at a time, even if the callback itself takes some time to process, which helps prevent issues from multiple callbacks running simultaneously. You'll get a `DoneContract` object containing details about the finished task. To stop listening for these completion events, the function returns another function that you can call.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running. 

You provide a filter – a way to specify which completion events you're interested in – and a callback function that gets executed when a matching event happens. 

Importantly, this subscription only fires once and then automatically unsubscribes, so you don’t need to worry about cleaning up. It's perfect for triggering a one-time action upon the successful completion of a background process.

## Function listenDoneLive

This function lets you listen for when background tasks, started with `Live.background()`, are finished. It's designed to handle situations where you need to react to these completions, even if the reaction itself takes some time. The events arrive one after another, and your reaction function will be executed in the order they were received. To ensure stability, the function uses a queuing mechanism that prevents multiple reactions from happening at the same time. You provide a function as input; this function will be called when a background task completes, and it returns a function that allows you to unsubscribe from these events later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. 

You provide a filter – essentially, a rule – to determine which backtest completion events you’re interested in. 

Then, you give it a function that will run when a matching backtest finishes.  

After that single execution, it automatically stops listening, so you don’t have to manage the subscription yourself. It returns a function you can call to unsubscribe manually.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It’s like setting up a listener that gets triggered once the backtest is done. 

Importantly, the notifications happen one at a time, even if the notification handler you provide takes some time to complete – this avoids issues with things running out of order or conflicting with each other.

You give it a function that will be called when the backtest is finished, and this function returns another function that you can use to unsubscribe from these completion notifications later.


## Function listenCheckOnce

This function lets you listen for specific order check events, but with a twist – it only runs your provided code once for each matching event. 

Think of it as a single-shot listener for order checks. It's similar to `listenCheck`, but instead of ongoing monitoring, it executes your function just once when a condition is met.

You provide a filter function to determine which events trigger your code. 

Your callback function will be executed, and if that function returns a Promise, the system will wait for that promise to resolve before continuing. There's a system of error handling for different types of failures during the order check process, including transient errors that are retried and terminal errors that are immediately reported.

## Function listenCheck

This function lets you keep an eye on the status of your orders with the backtest kit. It listens for "order check" signals, which confirm if an order you're tracking is still active on the exchange.

You’ll receive updates whenever a new tick comes in while you're monitoring a signal, and these updates happen *before* the backtest determines if the signal is complete. These updates tell you if the signal is currently open or if it’s a scheduled order (like a resting entry order).

If something goes wrong during this check, it handles errors in a specific way. Minor issues, like temporary network problems, are tolerated and the monitoring continues. However, if the order is definitively deleted from the exchange, that’s a terminal error that will cause the backtest to exit.

You provide a callback function to process these order check events. This callback will be executed whenever a check ping occurs. If your callback returns a promise, the signal processing will pause until that promise resolves.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven condition to be met, then takes action once. It’s like setting a one-time alert.

You provide a filter—a rule that determines which breakeven events you’re interested in—and a callback function, which is the code that will run when that specific event happens.

Once the event that matches your filter is detected, the callback function runs, and the listener automatically stops itself, ensuring it doesn't trigger again. This is great for scenarios where you need to react to a breakeven event just once.

The `filterFn` helps you pinpoint only the breakeven events you care about, and the `fn` is the action you want to take when that event is found.


## Function listenBreakevenAvailable

This function lets you monitor when your trades reach a breakeven point—meaning the price has moved enough to cover your trading costs and essentially get you back to your original investment.

It’s designed to be reliable even if the processing of the breakeven event takes some time. You provide a function that will be called whenever this happens.

The events are handled one at a time in the order they occur, preventing any issues from simultaneous processing.  The function you provide will receive an object containing details about the trade that has reached breakeven. 

To stop listening for these events, simply call the function returned by `listenBreakevenAvailable`.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts. It’s designed to execute a piece of code only once for each matching event, and then it automatically stops listening. You provide a filter that determines which events you're interested in, and a function that will be executed when a matching event occurs. Think of it as setting up a one-time alert for a particular condition before the backtest begins.


## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins for a specific asset. It’s like setting up a listener that gets triggered just before the engine kicks off a new run. Importantly, any code you put inside that listener will run one step at a time, in the order the events arrive, even if your code is asynchronous. This ensures things happen in a predictable sequence and avoids unexpected conflicts during the startup process. You provide a function as input, and this function will be called with information about the upcoming strategy execution. When you no longer need to listen, you can unsubscribe using the function returned by `listenBeforeStart`.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It sets up a listener that gets triggered as the backtest runs, giving you updates on its status. 

The updates you receive are handled one at a time, even if your update routine takes some time to complete. This ensures everything stays in order and prevents any conflicts.

You provide a function that gets called with progress information – this function will be executed when a backtest progress event occurs. This function will also return a function that you can call to unsubscribe from the listener when you no longer need the updates.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading period has finished, but only once. You provide a filter to define which events you're interested in, and a callback function that will be executed when a matching event occurs. The great thing is that it automatically stops listening after it has triggered that one time, so you don't have to worry about managing subscriptions. Think of it as setting up a temporary alert for a very specific situation.

It takes two pieces of information:
*   A filter function that determines if an event is relevant.
*   A callback function that will run exactly once when a matching event is found.

The function returns a cleanup function that you can call to manually stop the listener before it runs once.


## Function listenAfterEnd

This function lets you tap into what happens *after* a trading strategy has finished running for a particular asset. Think of it as a notification that the engine has wrapped up its work on a symbol.

The beauty of it is that the callback function you provide will be executed one at a time, even if it’s doing something that takes a little longer, like making an API call. This prevents things from getting messy and ensures events are handled in the order they arrive.

To use it, you simply pass in a function that will be called with details about the completed strategy execution. This allows you to perform actions like logging results, updating dashboards, or triggering other processes based on the finished run. 


## Function listenActivePingOnce

This function lets you watch for specific activity pings and react to them just once. It’s like setting up a temporary alert – you tell it what kind of ping you're looking for, and when it sees one that matches, it runs your provided code. After that single execution, it automatically stops listening, so you don't have to worry about cleaning up the subscription yourself.

You provide a filter function to define what kind of activity ping you're interested in. 

Then, you give it a function that gets executed when a matching ping occurs. 

This is handy for situations where you need to react to a particular event just one time and then move on.

## Function listenActivePing

This function lets you keep an eye on the activity of your signals. It listens for notifications, which happen every minute, related to signals that are currently active.

Think of it as a way to monitor the lifecycle of your signals and adjust your strategies on the fly. 

The events arrive in order, and any code you put inside your callback function will be executed one at a time, even if it involves asynchronous operations. This helps prevent issues that can arise when things happen simultaneously. You provide a function that will be called whenever a new active ping event is detected.

## Function listWalkerSchema

This function gives you a look at all the different trading strategies, or "walkers," that are currently set up within the backtest-kit system. 

It gathers information about each walker, including details about their configuration.

Think of it as a way to see what's running behind the scenes, allowing you to inspect, document, or even build tools that automatically adapt to the strategies you're using.


## Function listSweepSchema

This function allows you to see all the different sweep schemas that have been set up in your backtest. 

Think of sweep schemas as pre-defined strategies or parameters you want to test – this function gives you a view of them all.

It's helpful for checking your configuration, generating documentation, or creating user interfaces that adapt to the available sweep schemas. It essentially lists all the different approaches your backtest kit is prepared to test.


## Function listStrategySchema

This function allows you to see a complete list of all the trading strategies that have been set up within your backtest-kit environment. Think of it as a way to catalog all the different approaches you're using to trade. It's handy for troubleshooting, creating documentation, or if you want to build a user interface that dynamically displays available strategies. The function returns a promise that resolves to an array containing information about each registered strategy.

## Function listSizingSchema

This function lets you see all the different ways you've set up how your trades are sized within the backtest. It fetches a list of all the sizing configurations you’ve defined and made available. Think of it as a way to peek under the hood and see exactly how much of each asset you're planning to trade in different scenarios. It's a handy tool if you're troubleshooting your sizing logic or need to display sizing options in a user interface.


## Function listRiskSchema

This function lets you see all the risk schemas that are currently active within the backtest-kit framework. It’s like getting a complete inventory of all the risk configurations you've set up. This is handy for checking your setup, creating documentation, or if you need to build tools that adapt to different risk profiles. The function returns a list of these risk schemas, allowing you to inspect and understand the configurations being used.


## Function listMemory

This function lets you see a list of all the memory entries associated with the current signal. 

It automatically figures out which signal you're working with and whether you're in a backtest or live trading environment, so you don't have to worry about those details.

You provide a `bucketName` to specify which collection of memories you want to view.

The function returns a promise that resolves to an array. Each item in that array represents a memory entry, and contains its unique `memoryId` and the `content` it holds, structured as an object of type `T`.

## Function listMCPSchema

The `listMCPSchema` function lets you see all the different data structures – we call them MCP schemas – that your backtest kit is using. It essentially provides a directory of all the registered schemas, allowing you to inspect them. This is particularly helpful when you're trying to understand how your system is organized, building tools to display this information, or debugging any issues. The function returns a promise that resolves to an array of these MCP schemas.

## Function listFrameSchema

The `listFrameSchema` function helps you discover all the different data structures your backtest kit is using to represent trading data. Think of it as a way to see what kinds of information is available for analysis. It fetches a list of these schemas, allowing you to examine them for debugging purposes, generating documentation, or building interfaces that adapt to the data being used. Essentially, it provides a comprehensive view of the data structures defined in your backtest framework.

## Function listExchangeSchema

This function provides a way to see all the exchanges that your backtest kit is set up to handle. It gives you a list of their configurations, which is handy for troubleshooting, creating documentation, or building user interfaces that need to adapt to different exchanges. Essentially, it's a simple way to understand which exchanges are currently recognized by your backtest kit.

## Function hasTradeContext

This function simply tells you whether the system is ready for trading actions. 

It verifies that both the execution and method contexts are currently enabled. 

Think of it as a readiness check – if it returns `true`, you can safely use functions that interact with the exchange, like retrieving candle data or formatting prices. If it’s `false`, those functions won't work correctly.

## Function hasNoScheduledSignal

This function lets you quickly check if a trading signal is currently scheduled for a specific symbol, like "BTCUSDT". It returns true if no such signal exists, effectively being the opposite of the `hasScheduledSignal` function. Think of it as a safety check – use it before attempting to create or process new signals to ensure you're not interfering with existing plans. It intelligently figures out whether your code is running in a backtesting or live trading environment, so you don't need to worry about that. You just provide the symbol you're interested in, and it tells you whether a signal is waiting.


## Function hasNoPendingSignal

This function helps you check if there’s a signal waiting to be triggered for a specific trading pair, like 'BTC-USDT'. It returns `true` when there isn't a pending signal, meaning nothing’s waiting to be acted upon. Think of it as the opposite of `hasPendingSignal` – you’d use this to make sure you're not generating new signals when one is already waiting. The function figures out whether it's running in a backtesting environment or a live trading setting on its own. You provide the symbol of the trading pair you’re interested in, and it tells you if a signal is currently pending for that pair.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtest-kit setup. It's like looking up a recipe – you give it the name of the strategy you're interested in, and it returns the detailed instructions on how that strategy is built and what data it expects. This schema describes things like the inputs the strategy needs and the calculations it will perform. Using this function allows your code to dynamically understand and interact with different trading strategies.


## Function getTotalPercentHeld

The `getTotalPercentHeld` function helps you understand how much of an initial position you still have open. It calculates the percentage, giving you a clear picture of whether you're holding the entire position (100%) or if parts have already been closed (closer to 0%). This function is particularly useful when you've made multiple purchases (DCA - Dollar Cost Averaging) and then closed some of those purchases. It's essentially the inverse of `getTotalPercentClosed`, providing a simple way to see what's left. You just need to provide the trading symbol.

## Function getTotalPercentClosed

This function tells you what percentage of your position in a particular trading pair is still open. Think of it as a way to see how much of your trade hasn't been closed yet. A value of 100 means you haven’t closed any portion of the trade, while 0 means the entire position has been closed. 

It handles situations where you’ve closed parts of your position over time, especially if you used dollar-cost averaging (DCA). The function figures out whether it’s running in a backtest or a live trading environment without you needing to specify.

You just need to provide the symbol of the trading pair you’re interested in, like "BTCUSDT".


## Function getTotalCostClosed

This function helps you determine the total cost of your current position in a particular trading pair, like BTC/USD. It calculates the cost in dollars, taking into consideration any dollar-cost averaging (DCA) involved when you’ve partially closed the position. 

The function figures out whether it's running in a backtesting scenario or a live trading environment all on its own. 

You simply provide the symbol of the trading pair you're interested in, such as "BTC/USD", and it will return the total cost basis.

## Function getTimestamp

This function, `getTimestamp`, gives you the current time, but its behavior changes depending on whether you're running a backtest or live trading. When you're testing historical data (backtest mode), it returns the timestamp associated with the specific timeframe the backtest is currently analyzing. If you're running in live mode, it provides the actual, real-time timestamp. It’s a simple way to get the time without needing to worry about the environment.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like 'AAPL' or 'BTCUSDT'. It's useful when you need to know which asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string representing the trading symbol.

## Function getSweepSchema

This function helps you find the configuration details for a specific sweep. Think of a sweep as a pre-defined test or scenario you want to run. 

You give it the name of the sweep you're interested in, and it returns a structured object that describes all the settings and parameters associated with that sweep. This lets your code understand exactly how to execute that particular test. 

Essentially, it's like looking up the recipe for a specific trading experiment.


## Function getStrategyStatus

This function lets you peek at the current, temporary state of a trading strategy as it's running, specifically within a backtest or live trading environment. It gives you information about things like signals that are waiting to be processed, any actions requested by users, and the order in which signals are being handled. You provide the trading pair symbol, like "BTCUSDT", to see the status for that specific trading pair. Think of it as a quick glance at what's happening behind the scenes in the strategy's execution.


## Function getStrategySchema

The `getStrategySchema` function lets you fetch the definition of a trading strategy that's been registered within the backtest-kit system. It takes the strategy's name as input, which acts as a unique identifier. This function returns a structured object (`IStrategySchema`) that outlines the strategy's configuration, including required inputs, parameters, and potentially other details needed for backtesting. Essentially, it's a way to access the blueprint of how a particular strategy is designed to operate.


## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. 

If a strategy is paused, it won't place any new trades – the `getSignal` function won’t be called, and any pending trade requests are held. Existing trades that are already in progress, like pending orders or scheduled signals, will still be managed and closed as usual.

The function automatically figures out whether it's running in a backtesting environment or in a live trading setup.

You just need to provide the trading symbol, like 'BTCUSDT', to see if the strategy is paused for that particular pair.


## Function getSizingSchema

The `getSizingSchema` function helps you find the specific rules for determining how much of an asset to trade. It's like looking up a recipe – you give it a name, and it returns the sizing strategy associated with that name. This function is used to retrieve the sizing schema details based on a unique identifier, allowing your backtest to execute trades with defined sizing logic.


## Function getSignalState

This function helps you retrieve a specific value associated with a trading signal. It automatically figures out whether you're in a backtesting environment or a live trading setting.

It's particularly useful for strategies that involve analyzing data across multiple trades, like those powered by AI models. Think of it as a way to track how things are going for each individual trade within a larger strategy.

The function requires a symbol to identify the trading pair and a data transfer object containing the bucket name and an initial value. It will throw an error if there isn't a pending or scheduled signal currently active. 

This function is designed for strategies that aim to manage risk and profit, often employing rules based on factors like how long a trade has been open and its current profit percentage.

## Function getSessionData

This function lets you retrieve data that's stored specifically for a trading setup – a combination of a symbol, strategy, exchange, and timeframe. Think of it as a temporary storage space for things like results from complex calculations or states of indicators that you want to keep around between candles during a backtest or even while the system is running live. The data persists across candles and can even survive restarts when running live, making it ideal for caching information and keeping track of ongoing processes. It automatically figures out if it's running a backtest or in live mode so you don’t have to worry about that. You provide the symbol you're interested in, and it will return the associated data, or null if no data exists for that symbol.

## Function getScheduledSignal

This function allows you to retrieve the currently scheduled signal for a specific trading pair. Think of it as checking what signal your strategy is currently planning to act upon. 

It's designed to be straightforward to use, handling whether you're in a backtesting simulation or a live trading environment automatically.

If no signal is scheduled, it will return nothing.

You simply provide the symbol – like 'BTCUSDT' – to identify the trading pair you're interested in. The function then returns a promise that resolves to the scheduled signal data, or null if there's nothing scheduled.

## Function getRuntimeInfo

This function gives you important details about your current trading session. It pulls together information like the specific asset you're trading, the exchange it's listed on, the timeframe you're using, and the strategy that's running. You'll also find out if you're running a test backtest or a live trading session. Think of it as a quick status report on what's happening right now.

## Function getRiskSchema

To understand how your trading strategies manage risk, you can use `getRiskSchema`. This function lets you look up a specific, named risk profile that's already been set up within the system. You provide the name of the risk profile you're interested in, and it returns the details of that risk schema, allowing you to inspect its configuration. This is helpful for verifying the structure and parameters associated with a particular risk assessment.

## Function getRemainingCostBasis

This function helps you figure out how much of your investment remains for a particular trading pair, even if you've sold off portions of it along the way. It calculates the cost basis—essentially, the unclosed portion of your investment—taking into account any dollar-cost averaging (DCA) entries that occurred before partial sales. It's essentially the same as getting the total cost of what you've already closed, just framed in terms of the remaining cost basis.

You just need to provide the trading symbol you’re interested in. 

For example, if you bought Bitcoin through a series of DCA entries and then sold some, this function will tell you how much cost basis remains for that Bitcoin.


## Function getRawCandles

The `getRawCandles` function helps you retrieve historical candlestick data for a specific trading pair and time frame. You can control how many candles you get and the date range they cover. 

It's designed to be reliable, ensuring that your data doesn't accidentally include information from the future, which is crucial for accurate backtesting.

You can specify the start and end dates, the number of candles you want, or a combination of these to fetch the data you need. If you don't provide dates, the function will automatically determine a suitable range based on the available data and the execution context. The function always validates the end date to prevent future data leakage.


## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been patiently waiting to be executed. It tells you the number of minutes a scheduled signal has been pending activation for a specific trading pair, like "BTCUSDT." If there isn't a signal waiting, it will return null, meaning no action is currently held back. You just need to provide the symbol of the trading pair you're interested in, and it will give you the waiting time.

## Function getPositionPnlPercent

This function helps you quickly understand how profitable your current trading position is. It calculates the percentage of unrealized profit or loss, taking into account things like how much you've already closed your position, the average price you bought in at (using DCA), potential slippage, and trading fees. 

If there isn't an active trading signal, it will return null. The function automatically figures out whether you're in a backtesting or live trading environment and grabs the current market price for you, so you don't have to worry about those details. You just need to provide the trading pair symbol like 'BTCUSDT' to get the percentage.

## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss in dollars for a trade you’re currently holding. It considers factors like the percentage gain or loss, how much you initially invested, and even accounts for things like partial trade executions, dollar-cost averaging, slippage, and fees – all to give you a very accurate picture.

If there's no active trade currently open, the function will return null.

It smartly adapts to whether you're running a backtest or a live trading session, and automatically retrieves the current market price, simplifying your workflow. You just need to tell it the trading pair symbol, like "BTCUSDT," and it does the rest.


## Function getPositionPartials

getPositionPartials lets you see details about any partial profit or loss closures that have happened for a specific trading pair. It gives you a list of events, each describing a bit of the position that was closed.

If no trades are currently in progress, it will return null. If partial closures have happened, it provides an empty array.

Each entry in the list tells you whether it was a profit or loss close, the percentage of the position closed, the price at which it happened, and important accounting information like the cost basis and the number of entries involved. You need to provide the symbol of the trading pair you’re interested in to see the relevant partial closures.

## Function getPositionPartialOverlap

This function helps prevent accidentally executing multiple partial close orders near the same price. It checks if the current market price falls within a defined range around any previously executed partial close prices.

Essentially, it's a safety net to avoid redundant trading actions.

The function takes the trading symbol and the current price as input, and optionally a configuration to define the tolerance range. It returns true if the current price is considered to be within an acceptable range of a previous partial close, and false otherwise. If no partial closes have occurred, it also returns false.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp helps you find out exactly when a specific trading position experienced its biggest loss. It returns a timestamp, marking the moment the price hit its lowest point for that position. If there's no active trading signal for the given symbol, the function will indicate that by returning null. You provide the symbol of the trading pair as input, and it gives you a historical point in time.

## Function getPositionMaxDrawdownPrice

This function helps you understand the potential downside risk of a specific trading position. It calculates the largest drop in price that a position has experienced since it was opened. Essentially, it tells you how far "in the red" the position has gone at its lowest point.

If there's no active trading signal for the given symbol, the function will indicate that by returning null. 

You provide the symbol of the trading pair (like 'BTCUSDT') to get the drawdown information for that position.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand how much your trading position lost at its lowest point. It calculates the percentage of profit or loss experienced when the price hit its nadir during the entire time the position was open. 

Essentially, it tells you the worst PnL percentage you could have seen for that particular trading pair. 

If there isn't a pending signal to evaluate, the function will return null, indicating there's no data to analyze.

You provide the symbol of the trading pair (like 'BTC-USDT') to get this information.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total profit and loss incurred up to the point when the position experienced its biggest drawdown. 

Essentially, it tells you how much money you lost at the worst possible time for that specific trading symbol.

If there isn't a current trading signal for the symbol, the function won't return any data.

You provide the trading symbol, like "BTC-USDT," and it gives you a single number representing that loss in the quote currency (like USDT).

## Function getPositionMaxDrawdownMinutes

This function helps you understand the timing of your largest losses in a trade. Specifically, it tells you how many minutes have passed since your position reached its lowest point. 

Think of it as measuring how long ago you hit rock bottom in a trade. 

If the function returns a value of zero, it means the worst drawdown happened just now. 

It uses the trading symbol as input, and will return `null` if there isn’t a trade open for that symbol.

## Function getPositionLevels

getPositionLevels lets you check the prices at which you've entered a trade using dollar-cost averaging (DCA). It retrieves a list of prices, starting with the initial price when you began the trade and including any additional prices used when you added more to the position later. 

If there's no ongoing trade, the function will return nothing. If you only have the original entry price, it will return a list containing only that price. You simply provide the trading pair symbol, like "BTCUSDT", to see the price levels.

## Function getPositionInvestedCount

This function helps you track how many times you've added to a position using a dollar-cost averaging (DCA) strategy. 

It tells you the number of individual entries that make up the current pending signal – essentially, how many times you’ve bought into a trade.

A value of 1 means you only made the initial purchase. Each subsequent call to `commitAverageBuy()` increments this count.

If there’s no active pending signal, the function will return null. 

It automatically figures out whether it’s running in a backtest or live trading environment. You just need to pass in the trading pair symbol to check.

## Function getPositionInvestedCost

This function lets you find out how much money you've committed to a particular trading pair. It calculates the total cost based on all the buy orders placed for that pair.

Think of it as checking the total amount you've spent to build up your position.

If there aren't any open trades for that symbol, it will return null.

It automatically adjusts its behavior depending on whether you’re running a backtest or a live trading session.

You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a trading position reached its peak profit. 

It looks back at the position's history and identifies the specific timestamp – a date and time – when the price generated the most profit.

To use it, you just need to provide the trading symbol, like "BTCUSDT."

If there's no signal yet associated with the position, it will return null, meaning there's no information to retrieve.


## Function getPositionHighestProfitPrice

This function helps you understand the best potential profit your current trade has seen so far. It identifies the highest price achieved for a long position, or the lowest price for a short position, since the trade began.

The function starts by recording the initial entry price when the position is opened. Then, as new price data comes in (either from ticks or candles), it continuously updates this record if the price moves favorably towards the trade’s target. 

You'll always get a price back – it will be at least the initial entry price – as long as a trade is active. It requires the symbol of the trading pair to function.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its best performance. It calculates the time, in minutes, since the moment your position reached its highest profit. Think of it as a way to see how far your position has fallen from its peak—it's essentially the same as tracking how long it’s been in a drawdown.  The time is zero when the position hits its highest profit level. If no trading signal is active for the given symbol, the function will return null. You need to provide the trading pair symbol to the function.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. 

It calculates the difference between the highest profit percentage achieved and the current profit percentage. 

Essentially, it tells you how much room there is for your trade to potentially recover or surpass its previous peak. 

If no trading signals are available for the specified symbol, the function will return null, indicating no calculation is possible. You provide the symbol of the trading pair, like "BTCUSDT," to get this information.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its potential peak profit. It calculates the difference between the highest profit you could have made and the profit you've made so far, but only considers positive differences. 

Essentially, it shows you how much further your trade could potentially improve.

The function takes the trading symbol (like BTC/USD) as input. 

If no trading signals are pending, the function will return a null value.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade had a chance to reach a breakeven point at its peak profit. 

Essentially, it checks if, during the trade's lifecycle, the price could have moved in a way that would have made the trade profitable and then back to the point where no profit or loss existed.

You give it the trading symbol (like "BTCUSDT") and it will tell you whether breakeven was mathematically possible at the high point of the trade.

If there's no active trading signal for that symbol, the function won't be able to provide an answer and will return null.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It calculates the highest percentage profit achieved by a position for a given trading pair, looking back at the entire time the position was open. Essentially, it reveals the peak profit point for that trade. If no signals are pending, the function won't return a value. You provide the trading pair's symbol – like 'BTC/USDT' – to retrieve this information.

## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a trade. Specifically, it tells you how much it cost to reach the position's most profitable point. 

It looks at a particular trading pair, like BTC/USD, and identifies the moment when the profit was the highest. The function then returns the cost incurred to reach that peak profit.

If there are no trading signals, it will return null, meaning there's no data to analyze for that position. You simply provide the symbol of the trading pair you’re interested in.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading pair. It calculates how far the current profit of a position is from its lowest point during a drawdown, expressed as a percentage. 

Essentially, it tells you how much cushion there is between current profits and the biggest loss experienced so far. 

The result represents the percentage difference between the current profit and the lowest profit achieved during the drawdown period. If no trading signals exist for the specified symbol, the function will return null. You provide the trading pair's symbol, like "BTCUSDT," to retrieve this data.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential risk exposure of a specific trading position. It calculates the difference between the current profit and loss (PnL) of the position and the lowest PnL it reached during a drawdown period. Essentially, it tells you how far your current profit is from the lowest point the position has seen. 

A higher number indicates a more significant recovery from a drawdown. If there’s no active trading signal, the function will return null. 

You need to provide the trading symbol, like "BTCUSDT", to get the result for that particular pair.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the current pending signal and tells you the originally estimated duration in minutes. 

Think of it as checking the initial plan for how long the trade was meant to be open. 

If there isn't a pending signal, it won't be able to give you an estimate and will return null.

You'll need to provide the trading symbol, like "BTCUSDT", to get the estimate.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps prevent accidentally adding multiple DCA entries around the same price. It checks if the current market price falls within a predefined range around your existing DCA entry levels. 

Essentially, it’s a safeguard to avoid overlapping entries, ensuring your strategy executes as intended.

The function analyzes the symbol you're trading and the current price, comparing it against your existing DCA levels to determine if a new entry would be too close to an existing one. The ladder parameter allows customization of that range, defining how much higher or lower the current price can be while still being considered within the tolerance zone. If no DCA entries exist, it will return false.

## Function getPositionEntries

This function allows you to peek at the history of how your current trade was built, specifically focusing on the prices and costs used for each step. It helps you understand the progression of a trade, whether it was a single entry or a series of DCA (Dollar Cost Average) actions. 

You'll receive a list showing each price point and the amount spent at that level. If no trade is currently in progress, the function will return nothing. If you made a single purchase without any DCA, you'll get a list containing just that one entry. The symbol you're trading, like 'BTCUSDT', is required to retrieve this information.

## Function getPositionEffectivePrice

This function helps you figure out the average price at which you've acquired a position, taking into account any dollar-cost averaging (DCA) you've done. It calculates a weighted average, considering both the cost and the price at the time of each transaction.

If you've made partial sales, the calculation is done step-by-step, combining prices from each partial close with any subsequent DCA entries. If no DCA has been performed, it simply reflects the initial opening price.

The function will tell you that there's no price to calculate if no pending signal is present, and it seamlessly works in both backtesting and live trading environments. You just need to provide the trading pair symbol to it.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how long a particular trade has been losing ground since it reached its highest profit. It’s essentially a timer counting up from the moment a trade was at its most profitable. If the trade is still at its peak, the time elapsed is zero. The value increases as the price declines from that peak. If there's no active trade, the function won't return a number.

You provide the symbol of the trading pair (like BTCUSDT) to get the drawdown time for that specific trade.

## Function getPositionCountdownMinutes

This function helps you understand how much time is left on a specific trading position. It calculates the time remaining until a position's expiration, ensuring the result is never negative – if the time has already passed, it returns zero.

If there isn't a pending signal for that position, the function will indicate this by returning null.

To use it, you just need to provide the trading pair symbol, like "BTC-USDT," and it will give you the countdown in minutes.


## Function getPositionActiveMinutes

This function helps you figure out how long a particular trading position has been open. It calculates the number of minutes the position has been active, starting from when it was initially created. 

You provide the symbol of the trading pair, like 'BTCUSDT', and it returns the active minutes as a number. 

If there isn't a pending signal associated with that position, the function will return null.


## Function getPendingSignal

This function helps you check if your trading strategy currently has a pending order waiting to be filled. It takes the trading pair symbol as input, like "BTCUSDT". 

It then looks for any existing pending signal related to that symbol. 

If a pending signal is found, it returns detailed information about it.  Otherwise, if there's nothing waiting, it tells you by returning null. 

The function smartly figures out whether it’s running a backtest or a live trading session without you needing to specify.


## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 

It automatically accounts for the current time when fetching the data, which is important for both backtesting and live trading scenarios. 

You can specify how many levels of the order book you want to receive; if you don’t specify a depth, it uses a default maximum. The function retrieves the order book data from the exchange you're connected to.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and timeframe. It essentially asks the exchange to give you the next set of candles that come *after* the current time in your backtest. You provide the symbol like "BTCUSDT", the interval like "1h" (for one-hour candles), and how many candles you want to get. The function will return an array of candle data objects.

## Function getMode

This function tells you whether the trading system is currently running a backtest (historical data simulation) or operating in live mode with real trades. It returns a simple indication: either "backtest" or "live". This is useful for adapting your code based on the environment it's running in.


## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset. It's useful for things like making sure you wait a certain amount of time before placing another order after a stop-loss is triggered. 

It doesn't care whether the previous signal is still active or has already been closed – it just looks at the timestamp of the most recent signal. If there are no signals at all, it will return null.

The function automatically figures out whether you're running a backtest or live trading, so you don’t have to worry about that. You just need to provide the trading pair’s symbol to tell it which asset you’re interested in.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy was during its backtest. It calculates the largest difference between the highest profit and the biggest loss experienced, expressed as a percentage. Essentially, it tells you how far the position’s profit could have fallen from its peak. 

The result represents the peak-to-trough percentage difference in profit. If no trading signals were generated, the function will return null, meaning there’s no drawdown data to analyze. You need to provide the trading pair symbol (like BTC-USDT) to get this information.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss experienced during a backtest.

Essentially, it tells you the potential downside exposure you faced.

The function takes the trading symbol (like "BTC-USDT") as input and returns a number representing that maximum drawdown distance in profit and loss terms. 

If there isn't a trading signal to analyze, it will return null.

## Function getMCPSchema

This function lets you access predefined structures, or "schemas," that describe how different parts of a trading system communicate. Think of it like getting a template for how data should be organized when exchanging information between components. You provide the name of the schema you need, and it returns the corresponding definition. This helps ensure everyone's speaking the same language within your trading system, making things much more reliable and predictable. The name you provide must exactly match a registered MCP name.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal generated by your strategy, whether it's still active or has already closed. It doesn't care if the signal resulted in a profit or loss; it simply gives you the latest one recorded. This is really handy for things like preventing your strategy from making hasty trades immediately after a stop-loss—you can use the timestamp of this latest signal to enforce a cooldown period. The function checks both your historical backtest data and any live trading data to find that signal. If there are no signals available, it will return null. It automatically adjusts based on whether you're running a backtest or live trading. You just need to provide the trading pair symbol, like "BTCUSDT".

## Function getFrameSchema

The `getFrameSchema` function lets you look up the details of a specific frame within your backtesting setup. Think of it as finding the blueprint for how a particular piece of your trading strategy is structured. You give it the name of the frame you're interested in, and it returns a description of that frame, outlining its properties and how it's meant to be used. This is helpful for understanding how different parts of your backtest fit together.


## Function getExchangeSchema

The `getExchangeSchema` function helps you access information about a specific cryptocurrency exchange. It takes the exchange's name as input, like "binance" or "coinbase". The function then returns a detailed schema describing that exchange, including things like available trading pairs and order types. This is useful when you need to understand the structure and capabilities of a particular exchange within your backtesting environment. Think of it as looking up the blueprint for how a specific exchange works.


## Function getDefaultConfig

This function gives you a starting point for configuring your backtesting environment. It provides a set of default values for various settings that control how the backtest runs, from candle fetching to notification limits and signal generation. Think of it as a cheat sheet showing you all the knobs you can tweak and what their standard settings are. It's particularly useful for understanding all the available options before customizing them for your specific trading strategy. You'll find settings for things like how often to check order status, the maximum number of signals to generate, and even limits on the number of rows displayed in performance reports.

## Function getDefaultColumns

This function gives you the standard set of column definitions used when creating markdown reports. Think of it as a template showing you exactly what columns are usually included – things like backtest results, heatmap data, live ticks, and performance metrics. It's a helpful way to see the structure and available options for report columns before you start customizing your own. You can look at the returned object to understand what each column represents and how it's configured by default.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the current date within your trading strategies and backtests. It essentially tells you what date the system is operating on. If you’re running a backtest, it will give you the date associated with the specific timeframe being analyzed. Otherwise, in a live trading environment, it returns the actual current date.

## Function getContext

This function provides access to the context of the current method being executed. Think of it as a way to peek inside what's happening during a specific step in your trading strategy. It returns an object packed with details about the environment – things like the current time, the method's details, and other relevant information that might be useful for decision-making within your backtest. This context helps you understand the situation as your trading logic unfolds.


## Function getConfig

This function lets you peek at the settings that control how backtest-kit operates. It gives you a read-only snapshot of all the global configuration values, like how often it checks for new signals, limits on how many signals it generates, or settings for candle fetching. It's a safe way to see what's going on under the hood without risking changing any important settings. The returned values influence many aspects of backtesting, from how signals are generated to how results are displayed.

## Function getColumns

This function provides access to the column definitions used for generating reports. It returns a set of configurations, each representing columns for different types of data like closed trades, heatmap rows, live ticks, and strategy events. Think of it as a way to see exactly what data is being used to build your reports. The function returns a copy, so any changes you make won’t affect the original column configuration.

## Function getClosePrice

This function lets you fetch the closing price of the most recent candle for a specific trading pair and timeframe. 

To use it, you'll need to provide the symbol of the asset you're interested in, like "BTCUSDT" for Bitcoin against USDT. 

You also need to specify the candle interval—how frequently the candles are created—options include things like "1m" for one-minute candles, "1h" for one-hour candles, and various other durations. 

The function returns a promise that resolves to the closing price as a number.

## Function getCandles

This function allows you to retrieve historical candlestick data for a specific trading pair. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the desired time interval, such as "1h" for one-hour candles.  You also specify how many candles you need, setting a limit. The function will then pull this historical data from the exchange you’re connected to. Keep in mind the data will be based on the current time the system is using.


## Function getBreakeven

This function helps determine if a trade has reached a point where it's profitable enough to cover transaction costs. It looks at the current price of a trading pair and compares it to a calculated threshold – essentially, it checks if the price has moved favorably enough to offset fees and potential slippage. The calculation considers the defined percentage for slippage and fees, doubling the result to create the breakeven threshold. It automatically adjusts its behavior depending on whether it's running a backtest or a live trade.

To use it, you'll need to provide the trading symbol and the current market price. It will then return `true` if the price has exceeded the breakeven threshold, indicating the trade has covered its costs, and `false` otherwise.


## Function getBacktestTimeframe

This function helps you discover the specific dates used for a backtest of a particular trading pair, like BTCUSDT. It returns a list of dates representing the timeframe used in the backtest. Think of it as checking what period your backtest covers for a given asset. You provide the trading pair symbol, and it gives you back the dates associated with that backtest.

## Function getAveragePrice

This function helps you figure out the average price a symbol has traded at, using a method called VWAP. It looks at the last five minutes of trading data, specifically the high, low, and close prices of each minute.

Essentially, it weighs each price by the volume traded at that price to give a more accurate representation of the overall average. If there's no trading volume recorded, it just calculates a simple average of the closing prices instead. You provide the symbol you want to analyze, like "BTCUSDT" for Bitcoin against USDT.


## Function getAggregatedTrades

This function retrieves historical trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're connected to.

You can request all available trades within a reasonable timeframe, or specify a `limit` to get just the most recent trades. If you don't provide a `limit`, it will return trades from the past hour. The `limit` parameter lets you control how many trades are returned, effectively allowing for pagination.


## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it as looking up the details of what a particular action—like placing a buy order or selling—is supposed to do. You provide the name of the action, and it returns a description of that action, including what data it needs and what it produces. It's useful for validating your actions or understanding how they fit into the bigger picture of your trading system. The action name acts as a unique identifier to pinpoint the exact schema you’re looking for.

## Function formatQuantity

The `formatQuantity` function helps you ensure your trading quantities are formatted correctly for a specific exchange. It takes the trading pair, like "BTCUSDT," and the raw quantity you want to trade, and then returns a formatted string. This formatting will take into account the exchange’s rules for decimal places, which can vary depending on the asset. It's a good way to avoid errors caused by incorrect quantity formatting when placing orders.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price value, and then formats the price to match the specific rules of that exchange. This ensures the displayed price has the correct number of decimal places, making it look accurate and professional. Essentially, it handles the exchange-specific formatting for you.


## Function dumpText

The `dumpText` function lets you save raw text data, like log messages or analysis outputs, associated with a specific signal. Think of it as a way to record observations about what's happening during a trade. It automatically figures out whether you're running a backtest or a live trading session, and resolves the current signal, so you don't have to worry about those details. You provide the bucket name, a unique ID for the dump, the actual text content, and a description to help you remember what it is later. This function helps in debugging and understanding your trading strategy's behavior.

## Function dumpTable

This function helps you output data in a structured table format, ideal for inspecting results during backtesting or live trading. 

It takes an array of objects (records) and displays them as a table. The table's headers are automatically determined by examining all the keys used in the data. 

It cleverly handles the environment, whether you're running a backtest or a live trade, without needing explicit configuration. You also don't have to worry about finding the correct signal to attach this table to; it figures it out itself. 

You provide the table's name (bucketName), a unique identifier (dumpId), the data itself (rows), and a brief description to help understand the table's contents.

## Function dumpRecord

This function lets you save a record of data – think of it as a snapshot of information – and associate it with a specific signal. It's designed to be easy to use regardless of whether you're running a backtest or a live trading environment because it automatically figures out the correct settings for where to save it. You provide the record itself, a descriptive label for it, and identifiers that link the record to a bucket and a dump.  Essentially, it provides a way to archive and track specific data points tied to your trading signals.


## Function dumpJson

The `dumpJson` function is your tool for recording detailed information about your trading decisions. It takes a complex object – think of it as a collection of data related to a specific trade – and transforms it into a neatly formatted JSON string. This JSON string is then associated with a unique identifier and a description, allowing you to later review and understand exactly what happened during a particular moment in your backtest or live trading. It smartly handles the context of whether you are backtesting or trading live, and manages signal resolution for you. You provide the data, a description, and an ID, and `dumpJson` takes care of the rest.


## Function dumpError

This function helps you record and track errors that happen during your trading simulations or live trading. It takes a chunk of information – like the name of the data storage, a unique ID for the error, the error message itself, and a short explanation – and saves it, linking it to the specific trading signal involved. It smartly figures out whether you're in a backtesting environment or live trading, so you don’t have to worry about that detail. This is useful for debugging and understanding why things went wrong. 


## Function dumpAgentAnswer

This function helps you save the complete conversation history of an AI agent, linking it to a specific trading signal. It's really useful for debugging or reviewing how the agent interacted during a trade.

The function takes an object containing the bucket name, a unique dump ID, the agent's messages, and a description of what the dump represents. 

It automatically figures out whether you're running a backtest or a live trading environment based on the current setup and handles finding the relevant trading signal for you. This makes it simple to capture and analyze agent interactions without worrying about the specifics of your environment or signal management.


## Function createSignalState

The `createSignalState` function lets you manage the state of a signal, making it easier to track and update its values within your trading strategy. It automatically figures out whether your strategy is running in backtest or live mode, so you don't have to specify it each time.

This function is particularly useful for strategies that collect data about individual trades, such as how long a trade is open or its maximum profit.

It returns two functions: `getState` to retrieve the current state and `setState` to update it. These functions are linked to a specific "bucket" and an initial value you provide.

Think of it as a way to keep track of the health and performance of your trading signal as it goes through different trades. It’s designed to help complex strategies, potentially powered by AI, analyze trade metrics and adjust accordingly.


## Function commitTrailingTakeCost

This function lets you change the trailing take-profit price to a specific level. It's a shortcut that simplifies setting a take-profit – it figures out the percentage difference from your original take-profit distance. The framework automatically handles whether you're in a backtest or a live trading environment, and it gets the current market price to perform the calculation. You just need to provide the trading symbol and the absolute price you want the take-profit to be.

## Function commitTrailingTake

This function lets you fine-tune the take-profit level for a pending trade. It’s designed to adjust the distance from the original take-profit target, ensuring accuracy over time. 

Think of it as gently nudging your take-profit order – it always calculates changes relative to where you initially set the target.

The `percentShift` value controls how much the take-profit distance changes, with negative values bringing the take-profit closer to your entry price and positive values moving it further away. Importantly, if you're trying to make your take-profit more conservative, it won't let you; it only updates to a more conservative distance.

For long positions, it only allows you to lower the take-profit, and for short positions, it only allows you to raise it. This prevents your take-profit from getting pushed too far away from your original intention.

Finally, it automatically figures out whether it’s running in a backtesting environment or a live trading context, so you don't have to worry about that.


## Function commitTrailingStopCost

This function helps you modify a trailing stop-loss order to a specific price. 

It's a simpler way to set a stop-loss, handling some details behind the scenes. It calculates the correct percentage shift based on how far your original stop-loss was from the entry price.

It works whether you’re running a backtest or a live trading session, and it automatically gets the current market price to do the calculation.

You provide the trading pair (like "BTC-USDT") and the new price you want the stop-loss to be at. The function will then adjust the trailing stop-loss to that level.


## Function commitTrailingStop

This function lets you modify the trailing stop-loss distance for a pending trade. It's important to note that it always calculates adjustments based on the original stop-loss level, not the current trailing one, to avoid errors from repeated changes.

The `percentShift` parameter controls how much the stop-loss distance changes, expressed as a percentage. A negative shift brings the stop-loss closer to your entry price, while a positive shift moves it further away.

The function smartly handles updates: the first call sets the trailing stop-loss, and subsequent calls only make changes that improve protection – it won't tighten a long position’s stop or loosen a short position’s stop.

Finally, the function automatically recognizes whether it's running in a backtesting environment or a live trading setting.

You provide the trading symbol, the percentage adjustment, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to quietly log or announce things happening within your strategy without actually impacting your trades. 

It’s perfect for things like noting when a specific indicator hits a certain level or tracking events happening within a trade.

The function takes the trading symbol (like "BTCUSDT") and an optional payload to include extra information.  It automatically figures out if you're in backtest or live mode, and it gets details like your strategy's name and the exchange it's running on, so you don't have to worry about passing those in.  It will also grab the current price for you.


## Function commitPartialProfitCost

This function lets you automatically close a portion of your trade when you've reached a certain profit level, measured in dollars. It simplifies the process by calculating the percentage of your initial investment needed to match that dollar amount. 

Think of it as a way to lock in some profits as your trade moves towards its target profit.

It handles the details of figuring out the current price and whether you're in a backtest or live trading environment, so you don't have to worry about those.  You just tell it the symbol you’re trading and the dollar amount you want to close.


## Function commitPartialProfit

This function allows you to automatically close a portion of your open trade when the price moves in a profitable direction, essentially taking some profits along the way. You specify the symbol of the trading pair and the percentage of the position you want to close, such as closing 25% of your trade.  It’s designed to work seamlessly whether you’re running a backtest or a live trading bot. The system checks to ensure the price is moving toward your take profit level before executing the partial close.


## Function commitPartialLossCost

This function lets you partially close a position when it’s losing money, specifically by a set dollar amount. Think of it as a way to automatically trim your losses and move closer to a stop-loss level. It handles the complexity of converting that dollar amount into a percentage of your invested cost, making the process easier.

The system will ensure the price movement aligns with the loss direction before executing this partial close.  It also figures out if it’s running a backtest or a live trade, and gets the current price for calculations.

To use it, you just need to provide the symbol (like "BTCUSDT") and the dollar amount you want to close. For example, `commitPartialLossCost("BTCUSDT", 100)` would close a portion of the position equivalent to $100 in value.

## Function commitPartialLoss

This function helps you partially close a trading position when the price is moving in a way that would trigger a stop-loss order. It lets you close a specific percentage of your open position – for example, closing half of what you're holding. This is useful when you want to reduce your risk without completely exiting the trade. The function handles whether you're in a backtesting environment or a live trading situation automatically.

To use it, you provide the symbol of the trading pair (like "BTCUSDT") and the percentage of the position you want to close, expressed as a number between 0 and 100. It returns a boolean value indicating whether the action was successfully executed.


## Function commitCreateTakeProfit

This function tells the backtest kit that a take-profit order for a position has been filled on the exchange. It's used when the order execution doesn't follow the usual VWAP-based take-profit check, which can happen when the order fills based on the price reaching a high or low. The framework will acknowledge the closure with a "take_profit" reason on the next tick. It won't do anything if there isn't a pending position already associated with a signal. The function handles whether it’s running a backtest or a live trading session automatically. You can optionally provide additional information, such as an ID and note, along with this confirmation.

## Function commitCreateStopLoss

This function tells the backtest kit that a stop-loss order for a position has been filled on the exchange. It's used when the exchange executes the stop-loss before the framework's VWAP-based check.

Essentially, it synchronizes the framework's understanding of the trade with what actually happened on the exchange.

The trade will be closed immediately, and the reason for the closure will be registered as "stop_loss."

If there isn't a pending signal for that symbol, the function does nothing.

You can also optionally include extra information with the function call, like a transaction ID or a note about the event. 


## Function commitCreateSignal

This function lets you manually inject signals into the backtest or live trading process, bypassing the usual signal retrieval mechanism. It's handy when you need to feed in signals from external sources or test specific scenarios.

You provide a symbol and a signal data object (DTO). The system will then use the provided price to determine when the signal should be acted upon: if a price is given, it immediately acts on the signal if the price is already met, otherwise it's scheduled for when that price is reached; otherwise, it executes immediately at the current price.

The system checks to make sure there aren't already signals being processed and validates the signal data to prevent errors. Importantly, the system automatically knows whether it’s running a backtest or a live trade.

**Parameters:**

*   `symbol`: The trading pair you’re working with (e.g., "BTCUSDT").
*   `dto`: The signal data you want to inject.

## Function commitClosePending

This function lets you finalize a pending order that's already been set up by your trading strategy. It's useful when you want to acknowledge a pending signal without interrupting the strategy's normal operation or preventing it from creating new signals. Think of it as confirming that you're proceeding with a trade that's already been planned. It handles whether you're in a testing or live trading environment automatically.

You can optionally add a note or an ID to the commitment for record-keeping purposes. 
It doesn't impact scheduled signals or make the strategy stop generating signals.

## Function commitCancelScheduled

This function lets you cancel a scheduled signal without interrupting your trading strategy's normal flow. Think of it as removing a signal that was waiting for a specific price to activate – it essentially clears that pending order. It's important to know that this action doesn't affect any currently active signals or pause the strategy; it also won't trigger a stop condition, so the strategy can keep generating new signals as usual. The framework intelligently determines whether it's running a backtest or a live trade, so you don't need to specify that.

You can optionally include extra information like an ID or a note when cancelling the scheduled signal, using the `payload` parameter.

## Function commitBreakeven

The `commitBreakeven` function automatically adjusts your stop-loss order to break even once the price reaches a certain level. Essentially, it's designed to protect your initial investment by moving the stop-loss to your entry price, eliminating risk. This happens when the price has moved favorably enough to cover any fees and slippage associated with the trade.  The function cleverly determines whether it’s operating in a backtest or live trading environment and retrieves the current price to make its decision. You simply need to provide the trading pair symbol for the function to work.


## Function commitAverageBuy

The `commitAverageBuy` function is used to add a new buy order to a dollar-cost averaging (DCA) strategy. It essentially records a buy at the current market price, contributing to the overall average purchase price for the asset. This function automatically adjusts the average entry price for the position and signals this averaging action. It also intelligently determines whether it's running in a backtesting or live trading environment and fetches the latest average price for the trading pair. You provide the symbol of the trading pair as an argument, and optionally a cost.


## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal ahead of time. Essentially, it flags a signal as ready to activate, but the actual trade won't execute until the next market tick, allowing the strategy to process it. You can use this if you want to proactively manage your trading signals. It automatically adapts to whether you're running a backtest or a live trading environment.

You provide the symbol of the trading pair you're working with.  Optionally, you can include extra details about the signal, like an ID or a note, for record-keeping purposes.


## Function checkCandles

The `checkCandles` function is a quick way to see if your historical candlestick data is already available and stored. It verifies if the data exists using the persistence adapter. This is helpful because it only needs to check for specific timestamps, rather than loading the entire dataset, which saves time and resources. You provide validation parameters to tell the function exactly what data to look for.

## Function cacheCandles

This function helps make sure your trading data (candles) is available and up-to-date in the system's persistent storage. It's designed to fetch candle data for a specific trading symbol, time interval, start time, and end time, and for a particular exchange. The process involves a double-check: it first verifies if the data exists, and if not, it downloads and re-validates the data to guarantee accuracy. You can optionally provide callbacks to track the start of the initial check and the beginning of the data download process.

## Function addWalkerSchema

This function lets you add a new strategy comparison walker to the backtest-kit. Think of a walker as a tool that runs multiple trading strategies simultaneously on the same historical data. It then analyzes how well each strategy performs, typically using a predefined metric to determine the winner. 

To use it, you provide a `walkerSchema` object, which contains all the necessary configuration details for your walker. This allows the framework to understand how to run and evaluate the different strategies you want to compare.


## Function addSweepSchema

The `addSweepSchema` function lets you register a sweep, which is essentially a way to systematically test and refine trading strategies. Think of it as a way to automatically explore different parameter combinations to see how they perform.

It works by running each trading idea across historical data, simulating trades, and then analyzing the results to figure out the best settings. 

The process involves evaluating your strategy with different entry and exit parameters.  If you don't specify exact values for those parameters, the system will use sensible defaults. It's a powerful tool for optimizing your strategies and understanding their behavior across a range of conditions.


## Function addStrategySchema

This function lets you register a new trading strategy with the backtest-kit framework. Think of it as telling the system about a new way to generate trading signals.

Once registered, the framework will automatically check your strategy to make sure it’s working correctly – this includes validating things like the price data, stop-loss and take-profit rules, and the timing of your signals.

It also prevents a situation where your strategy sends too many signals in a short amount of time, and when running live, it makes sure your strategy's data survives even if something goes wrong.

You provide the strategy's configuration details, which is represented as a `strategySchema` object.

## Function addSizingSchema

This function lets you tell the backtest-kit system how to determine the size of your trades. Think of it as providing the rules for how much capital you’ll allocate to each trade based on factors like your risk tolerance and volatility. You’ll define things like the sizing method you want to use—whether it's a fixed percentage, something more advanced like the Kelly Criterion, or based on Average True Range (ATR)—and set parameters to control the risk involved. You can also specify limits on the size of your positions and even set up callbacks to run custom calculations during the sizing process. Essentially, it's how you customize your risk management strategy within the backtest-kit framework.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up rules to ensure you don't take on too much exposure. 

You can specify limits on the total number of positions your strategies hold simultaneously. It also allows for more sophisticated risk checks, like monitoring portfolio metrics or correlations between different assets. 

Finally, you can define actions to take when a trading signal is flagged as risky – for example, rejecting it or allowing it with modifications. Because strategies share a common risk assessment, it facilitates analyzing risk across all strategies simultaneously, giving a holistic view of overall exposure.

## Function addMCPSchema

This function lets you connect your trading strategy to a Model Context Protocol (MCP). Think of it as establishing a communication channel so an external agent can monitor and potentially influence your strategy's actions.

Essentially, it registers the strategy with the framework, allowing the MCP to receive updates about its status and even send commands related to positions. 

The MCP acts as a bridge, providing a consistent way for the agent to see what's happening with your strategy's portfolio. If you don’t provide custom rendering, the system will automatically generate basic text messages describing trades for each symbol.

You provide the MCP configuration as an object to this function.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your tests. Think of it as registering a way to generate the historical data your backtest will run on. You’ll provide a configuration object that describes the timeframe's start and end dates, the interval (like daily, weekly, etc.), and a function that will be called when events related to that timeframe occur. This is how you essentially define the "lookback period" your strategy will be evaluated against.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use. Think of it as registering a data source—it tells the system where to get historical price data and how to interpret it. The registered exchange should be able to provide historical candle data, handle formatting prices and quantities, and calculate VWAP based on recent trading activity. You provide a configuration object that describes the exchange's capabilities.

## Function addActionSchema

This function lets you register a new action handler within the backtest-kit framework. Actions are a powerful way to connect your trading strategy to external systems or trigger custom logic based on events occurring during the backtest. Think of them as event listeners that respond to moments like a trade signal being generated, reaching a break-even point, or realizing a profit or loss.

You can use actions to manage your strategy's state, send notifications through services like Telegram or Discord, track events, gather analytics, or generally automate tasks in response to strategy events. 

Each action handler is specific to a particular strategy and the timeframe it's operating within. They receive details about everything that happens during the backtest, giving you a lot of flexibility in how you respond to events.

To set up an action, you’ll provide an `actionSchema` which defines its configuration.
