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

This function lets you store data within a specific memory location, essentially creating a named storage space for your trading logic. Think of it like saving a variable with a unique label so you can retrieve it later. 

The function takes an object containing the bucket name (a way to categorize your memory), a unique memory ID (the name of the specific storage spot), the value you want to store, and a description for what’s being stored. 

It's designed to work seamlessly within a trading signal, automatically understanding whether it's running in a backtest or live environment and automatically using the correct signal based on the current execution context.


## Function warmCandles

The `warmCandles` function helps speed up your backtesting by pre-loading historical candle data. It downloads all the candles for a specific timeframe, from a starting date to an ending date, and stores them in a persistent storage. This means when you run your backtest, the data is already readily available, reducing delays and improving performance. It's particularly useful for longer backtesting periods or when dealing with large datasets. You provide the function with the parameters defining the date range and interval for the candles you want to pre-cache.


## Function waitForReady

This function ensures everything needed for trading is properly set up before you start. It waits until the necessary data registries are populated, checking them every second.

When running a backtest, it confirms that exchange, frame, and strategy data are ready. For live trading, it only verifies exchange and strategy data.

It's designed for situations where data loading happens asynchronously, like when using plugins or remote configurations, preventing errors by delaying the start of trading until everything is in place. If the setup takes too long, the function silently completes, allowing you to handle the error gracefully later. The `isBacktest` parameter lets you specify whether to wait for the frame schema as well.

## Function validate

The `validate` function is your safety net before running backtests or optimizations. It checks if all the things your trading strategies and configurations refer to actually exist and are correctly registered.

You can tell it to check specific parts, like just the exchanges or strategies, or if you're unsure, it can validate everything.

Think of it as a quick check to prevent frustrating errors later – it makes sure all the pieces are in place before you start simulating your trades. The validation results are saved for future use, so repeated checks are quicker.

## Function stopStrategy

This function lets you pause a trading strategy. It effectively stops the strategy from creating any new trading signals. 

Existing signals that are already active will finish running as planned. 

Whether you're running a backtest or live trading, the system will stop at a safe point – usually when it's idle or a signal has completed.

You just need to specify the trading pair (like BTC/USDT) to tell the system which strategy to stop, and it figures out the mode (backtest or live) on its own.


## Function shutdown

This function provides a way to cleanly stop the backtesting process. Think of it as a polite way to tell the system it's time to finish up. It triggers a shutdown event that lets all the different parts of the backtest – like data handlers or strategy executors – perform any last-minute cleanup tasks. It’s useful when you want to stop the backtest, for instance, when you press Ctrl+C or receive a signal that the process should terminate, making sure everything is handled properly before it ends.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it as hitting a pause button.

When paused, the system won't process new trade requests, but it will still manage any existing trades that are already in progress. These paused requests remain in a queue and are processed when you resume the strategy.

The pause status is saved, so it remains even if the system restarts. You’ll need to explicitly resume the strategy to continue trading. A notification event is also triggered whenever the pause status changes, so you can track when this happens. The function works in both backtesting and live trading environments.

You provide the symbol of the trading pair you want to pause and a boolean value (true or false) to indicate whether to pause or resume the strategy.

## Function setSignalState

The `setSignalState` function helps you manage and track the state of your trading signals, especially useful for complex strategies. It’s designed to work seamlessly within the backtest-kit framework, automatically adjusting to whether you’re in backtesting or live trading mode. 

Think of it as a way to update a specific value associated with a particular trading signal, ensuring everything stays synchronized. The function automatically handles finding the relevant, currently active signal.

It’s particularly helpful for advanced strategies, like those using large language models (LLMs), that need to gather data across multiple trades—for example, things like how long a trade is open and its maximum profit. 

The function's designed for scenarios where profitable trades might see drawdowns of -0.5% to -2.5%, and aim for gains between 2% and 3%, while short-lived trades might have smaller profits or even losses. There's a specific rule built in: if a trade remains open for a certain amount of time and isn’t performing well (profit less than a certain percentage), it should be closed.

The function requires a symbol (like "BTC-USD"), a dispatch object, and a data transfer object containing the bucket name, an initial value, and other data.


## Function setSessionData

This function lets you store data specific to a particular trading symbol, strategy, exchange, and timeframe. Think of it as a temporary, shared memory that lasts for the entire backtest or live trading run. It’s great for things like saving the results of complex calculations or keeping track of information needed across multiple candles, even if your program restarts. You can clear this stored information by passing `null` as the value. The framework automatically knows whether it's running a backtest or live trading session.

It takes the trading symbol (like "BTC/USDT") and the value you want to store. The value can be any JavaScript object or you can clear it by setting it to `null`.

## Function setLogger

You can now control how backtest-kit reports its activity. This function lets you plug in your own logging system. 

Essentially, it replaces the default logging with whatever you provide.

Your logger needs to conform to the `ILogger` interface. All the usual information – like the strategy name, exchange, and symbol – will automatically be included with any log messages generated by the framework.


## Function setConfig

This function lets you customize how the backtest-kit framework operates. You can adjust various settings to fine-tune its behavior by providing a configuration object. It's like tweaking the internal gears of the system. 

The `config` object lets you selectively change specific parameters; you don't have to redefine everything. There's also an `_unsafe` flag. Use this carefully, as it bypasses important checks, primarily needed in testing environments where strict validation might be a hindrance.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. Think of it as tweaking the layout and information displayed in those reports.

You can provide a set of new column configurations to override the default settings. 

The system will check to make sure your configurations are structurally sound, but if you're doing testing and need to bypass these checks, there’s a special flag to do so.

## Function searchMemory

The `searchMemory` function lets you find relevant memory entries based on a search query. It's like searching a database of past events or data points.

It uses a sophisticated method called BM25 to rank the results, so you’ll get the most important matches first.

The function intelligently figures out which signal to use and whether you’re in a backtest or live trading environment, so you don't have to worry about those details.

You provide a `dto` object with the name of the memory bucket you want to search and the query string itself. The function returns an array of results, each containing an ID, a score indicating relevance, and the actual content of the memory entry. This content will match the type of object you specify when you call the function.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a trading environment, but without actually needing a full backtest setup. Think of it as creating a temporary, controlled environment to test specific parts of your code. 

This is particularly helpful when you need to access things like the current timeframe or other context-dependent services, but you don’t want to run a complete backtest. 

You can customize the environment with options like the exchange name, strategy name, symbol, and whether you're in backtest mode or a live environment, but if you don't provide these, sensible defaults are used. It’s like having a mini-sandbox to isolate and test pieces of your trading logic.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data.

It automatically handles whether you’re running a test or a live trading scenario, making it adaptable.

To use it, you need to provide the bucket name and the unique ID of the memory entry you want to remove. It doesn't return any data; it simply performs the deletion.


## Function readMemory

The `readMemory` function lets you retrieve data that’s been stored in memory, associating it with the specific signal you're working with. 

Think of it as accessing a saved value, like a previous calculation or a piece of configuration, relevant to the signal's current state. 

It handles the complexities of knowing which signal is active and whether you're in a backtesting environment or a live trading scenario, so you don't have to worry about those details.

You provide the function with the name of the memory bucket and the unique identifier of the memory item you want to retrieve. 

The function then returns a promise that resolves to the stored data, assuming it exists and matches the expected data type.


## Function overrideWalkerSchema

This function lets you tweak an existing strategy comparison setup, often called a "walker." Think of it as making small adjustments to how strategies are tested against each other.

You provide a partial set of changes—only the parts you want to modify—and it updates the existing walker configuration.  Anything you *don't* provide stays as it was.

Essentially, it's a focused way to change a walker's behavior without rebuilding it from scratch.


## Function overrideSweepSchema

This function lets you modify a sweep configuration that’s already been set up within the backtest-kit framework. Think of it as tweaking an existing plan rather than creating one from scratch. It's useful if you need to make small adjustments to a sweep, like changing the number of iterations. Only the settings you provide will be changed – everything else stays the same. Keep in mind that the framework remembers sweep configurations, so any changes you make won't affect previously created sweep instances unless you clear that memory. 

You pass in a partial configuration object representing the updates you want to make.

## Function overrideStrategySchema

This function lets you tweak a trading strategy that’s already set up within the backtest-kit system. It's useful when you want to change just a few settings without completely redefining the strategy.

Essentially, you provide a set of changes—like tweaking a parameter or updating a configuration—and this function applies only those modifications to the existing strategy definition. The rest of the strategy's original settings remain untouched.

You’ll give it an object containing the specific fields you want to update. The function then returns a modified strategy schema that you can use going forward.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without completely replacing it. Think of it as making small adjustments to how much capital is allocated for each trade. 

You provide a partial sizing schema—essentially, only the settings you want to change—and the framework updates the original sizing configuration. Any settings you *don't* specify will remain as they were previously defined. This is a convenient way to refine your sizing strategy over time.

## Function overrideRiskSchema

This function lets you adjust existing risk management settings within the backtest-kit framework. Think of it as a way to fine-tune a risk profile without having to recreate it entirely. You provide a partial configuration – just the parts you want to change – and the system will update the existing risk settings, keeping everything else as it was. It’s useful when you need to make minor adjustments to a risk profile after it's already been set up.

## Function overrideMCPSchema

This function lets you tweak existing configurations for how the backtest kit interacts with your trading model. Think of it as a way to selectively update parts of a pre-existing setup.

You provide a piece of the configuration you want to change, and it merges that with the current setup, leaving the rest untouched. This is useful when you want to make small adjustments without redoing everything. 

It returns a promise that resolves to the updated MCP configuration.

## Function overrideFrameSchema

This function lets you modify a timeframe's configuration that's already set up for your backtesting. 

Think of it like updating a specific part of an existing timeframe setup – you can change things like the interval or data sources. 

It only updates the settings you provide; anything else that was already configured stays the same. This is useful if you need to tweak a timeframe after it's been initially defined. You provide a partial configuration object, and it returns a new, modified frame schema.

## Function overrideExchangeSchema

This function lets you modify an existing exchange data source within the backtest-kit framework. Think of it as a way to tweak a previously set up exchange, like changing its data feed or order book settings. It doesn't replace the entire exchange definition; instead, it updates only the parts you specify, leaving the rest of the original configuration untouched. You provide a partial configuration object, and the framework merges it with the existing exchange schema.

## Function overrideActionSchema

This function lets you modify how your trading actions are handled, without completely replacing the original setup. Think of it as fine-tuning an existing action – maybe you want to change how it responds in a development environment versus a production one. You can update specific parts of the action's configuration, like its callbacks, while leaving the rest untouched. It’s a great way to adjust behavior on the fly or adapt to different situations. To use it, you'll provide a configuration object with only the changes you want to make.


## Function listenWalkerProgress

This function lets you keep tabs on how a backtest is progressing. It's a way to get notified after each strategy finishes running within a backtest.

You provide a function that will be called with updates – these updates are handled one at a time to avoid issues with running things at the same time. Think of it as a way to monitor the backtest step-by-step.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you react to specific events happening during a trading backtest, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met. You provide a filter to define what kind of event you're interested in, and then a function to run when that event occurs. Once that event is processed, the listener automatically stops listening, so you don't need to manage the subscription manually. It's a clean way to ensure a particular step in your backtest happens before moving on.

You give it two things: a filter that determines which events it cares about and a function to execute when a matching event is found. After that one execution, it automatically stops listening.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It’s useful for actions you need to take *after* all the strategies in a backtest have been evaluated. The function ensures that these actions happen one at a time, even if the code you provide to handle the completion takes some time to run – it queues them up to avoid issues. You provide a function that will be called with details about the completed backtest when it's done. The function returns a way to unsubscribe from these notifications when you no longer need them.

## Function listenWalker

This function lets you track the progress of a backtest as it runs. It provides a way to be notified when each individual trading strategy within the backtest has finished executing. The notifications are delivered sequentially, one after another, ensuring that even if your notification handling involves some delay or asynchronous operations, the order of events is preserved. To prevent any potential conflicts, the processing of these events happens in a carefully managed queue.

You give it a function to execute when an event occurs, and it returns a function you can use to unsubscribe later.


## Function listenValidation

This function lets you keep an eye on any problems that pop up when your system is checking risks. 

It's like setting up a listener that gets notified whenever a validation check throws an error. 

You can use this to debug issues or simply monitor how your risk validation is performing. 

The errors are handled one at a time, ensuring a smooth and controlled process even if your error handling involves asynchronous operations. You provide a function that gets called whenever an error occurs, and this function lets you unsubscribe from the listener when you no longer need it.

## Function listenSyncOnce

This function lets you set up a listener that will only trigger *once* when a specific type of synchronization event happens related to orders. Think of it as a one-time alert for a particular condition. 

The `filterFn` lets you define exactly what kind of event you're looking for.  Once that event occurs, the `fn` (your callback function) will be executed just once. If your callback function returns a Promise, the process will pause until that Promise is resolved.

It's important to know that this listener acts as a gatekeeper.  If your callback function throws an error, it can signal different kinds of problems, ranging from temporary issues (which might be retried) to more serious, permanent rejections or protocol violations.  You can find more details about these error types in the `listenSync` documentation. 

Finally, `warned` is an internal parameter you usually don’t need to worry about.


## Function listenSync

The `listenSync` function lets you keep an eye on when signals are being synchronized, like when an order is being opened or closed. It's a way to react to these events and make sure everything happens in the right order.

If something goes wrong during this synchronization – like an error occurs – the function will throw an error that needs to be handled. 

How the error is handled determines what happens next.  A temporary error might cause the system to retry the operation a few times, while a permanent error will immediately stop the process.

You provide a function (`fn`) that gets called when a synchronization event happens; this function can do whatever is necessary, like updating data or triggering other actions. The `warned` parameter is there for internal use, and you don’t need to worry about it.


## Function listenStrategyCommitOnce

This function lets you watch for specific strategy actions and react to them just once. You give it a filter – a way to identify the exact events you're interested in – and a function to run when that event happens. After the callback runs one time, the function automatically stops listening, so it’s great for handling things like waiting for a strategy to be fully initialized or a particular change to occur. 

It provides a convenient way to respond to an event and then forget about it.


## Function listenStrategyCommit

This function lets you tap into happenings within your trading strategy. It's like setting up a notification system that tells you when things change – whether a scheduled order gets cancelled, a trade gets closed for profit or loss, or stop-loss and take-profit levels are adjusted.

The changes are delivered one at a time, even if your response to them involves some processing time. 

You provide a function that will be called whenever one of these events occurs, and this function can handle the information about the specific change that happened. To stop listening, the function returns another function you can call to unsubscribe.

## Function listenSignalOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. You tell it what kind of signal you're looking for by providing a filter – a rule that determines if a signal is interesting to you. When a matching signal arrives, the provided callback function executes, and then the listener automatically stops listening, so you won't receive any more signals of that type.

It’s really handy when you need to react to a particular condition and then move on.

Here’s a breakdown:

*   `filterFn`: This is like a sieve. It checks each incoming signal and only lets the ones that meet your criteria pass through.
*   `fn`: This is what happens when a matching signal gets through the sieve. It’s the action you want to take.

The function returns an unsubscribe function. You can call this function if you need to stop the listener before it fires.

## Function listenSignalNotifyOnce

This function lets you react to specific trading signals, but only once. You tell it what kind of signal you're looking for with a filter – a function that determines if a signal is interesting to you. Then, you provide a callback function that will run just one time when a matching signal arrives. After that, the subscription automatically stops, so you don't need to worry about cleaning things up.

It's perfect for situations where you need to act on a signal immediately and then don't need to listen anymore.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy shares information about a trade – specifically, a "signal info" event. Think of it as a way to receive updates about what's happening with a position.

These updates are sent when a strategy uses `commitSignalInfo()` to broadcast a note.

Importantly, these notifications are handled in the order they're received, and the processing of each notification happens one at a time, preventing any issues from overlapping operations.

To use it, you provide a callback function that will be executed whenever a new signal info event is available. This callback will receive information about the event. The function returns another function to unsubscribe from these notifications.

## Function listenSignalLiveOnce

This function lets you subscribe to live trading signals, but with a twist – it only delivers one event and then stops listening. 

Think of it as a temporary alert system. You provide a filter to specify which signals you’re interested in, and a callback function that will run once when a matching signal arrives. Once that single event is processed, the subscription is automatically cancelled, so you don’t need to manage that yourself. It's perfect for situations where you only need a quick response to a specific, fleeting condition during a live trading simulation.


## Function listenSignalLive

This function lets you hook into a live trading simulation, allowing your code to react to events as they happen. It's specifically designed for use with `Live.run()`. Think of it as setting up a listener – whenever a new trading signal event occurs during a live backtest, the function you provide will be called. Importantly, these events are handled one at a time, in the order they arrive, ensuring you don’t miss anything. You pass in a function, and that function receives the event details, giving you access to the real-time information needed to potentially adjust your strategy or display data. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenSignalEventOnce

This function allows you to temporarily listen for specific lifecycle events happening within the backtest. It's designed for situations where you need to react to an event just once, like waiting for a trade to open or close. You provide a filter to specify which events you’re interested in, and a callback function that will run when a matching event occurs. Once the callback has run, the subscription automatically stops, preventing it from triggering again.

## Function listenSignalEvent

The `listenSignalEvent` function lets you keep track of what's happening with your trading signals. You'll receive notifications when a signal is first created or when it's closed, whether it's part of a live trading setup or a backtest.

These notifications, called signal events, include details about how the signal was opened (like a scheduled order or user action) and why it was closed (like hitting a stop-loss or profit target).

Importantly, these events are delivered in the order they happen, even if the process of handling them takes some time. This helps ensure you have a reliable record of each signal's journey. To use it, you provide a function that will be called whenever a signal event occurs. When you’re finished listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen" for specific events happening during a backtest run. You provide a filter to specify which events you're interested in, and a function to handle them.  The callback function you provide will only be triggered once when a matching event occurs and then automatically stops listening, so you don't have to worry about unsubscribing yourself. It's useful for quickly capturing a particular data point or observing a specific condition during a single backtest execution.


## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest. Think of it as subscribing to updates about what's happening in your simulated trading environment.

You provide a function that gets called whenever a significant event occurs during the backtest execution, like a new tick or a strategy decision.

Importantly, these events arrive in the order they happened, and they're processed one at a time, so you're guaranteed a sequential view of the backtest process.

It only works with events coming from a `Backtest.run()` execution.

When you're done listening, the function returns another function that you can call to unsubscribe and stop receiving those updates.

## Function listenSignal

This function lets you tap into the trading signals generated by the backtest kit. It's a way to be notified whenever a strategy changes state—like when it's idle, opens a position, is actively trading, or closes a position.

You provide a function that will be called whenever a signal event occurs. This function receives details about the event, like the strategy’s current state.

A key feature is that the events are handled one at a time, even if your callback function takes some time to complete.  This prevents your code from getting overwhelmed by multiple signals happening simultaneously. To unsubscribe, the function returns another function which can be called to stop listening to the signals.


## Function listenSchedulePingOnce

The `listenSchedulePingOnce` function helps you react to specific ping events, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met. When that condition is met, a function you provide gets executed, and then the listener automatically disappears. This is helpful when you need to respond to a single event and don’t want to keep listening indefinitely.

You give it two things: a filter to identify the events you’re interested in, and a function that will be run when a matching event occurs. The filter acts like a gatekeeper, ensuring only relevant events trigger your function.  Once the function runs, the temporary listener shuts down.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It provides a way to receive notifications, essentially pings, every minute while a signal is in this waiting phase. You give it a function – your custom code – and this function will be called whenever a ping event occurs, allowing you to track the signal’s lifecycle or perform any specific monitoring actions you need. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenScheduleEventOnce

This function lets you react to a specific, one-time scheduled event. It's like setting up a temporary listener that only runs once when a particular type of scheduled event happens.

You provide a filter to specify which events you're interested in, and a function to execute when that event occurs.  Once the event triggers your function, the listener automatically disappears, so you don't have to worry about manually unsubscribing. This is perfect if you need to perform an action just once in response to a scheduled event like creation or cancellation.

The `filterFn` defines which events it will respond to. The `fn` is what gets run when a matching event occurs.

## Function listenScheduleEvent

This function lets you keep an eye on when scheduled orders are created or cancelled. You'll get notified when a scheduled order is initially set up ("scheduled") or when it's cancelled before it even starts ("cancelled"). This is useful for both live trading and reviewing past performance (backtesting).

Keep in mind, this doesn't tell you when a scheduled order *starts* – that's a different event handled elsewhere.

The events happen in the order they're received, and even if your callback function takes some time to run, everything will still be processed correctly.

To use it, you provide a function that will be called whenever a scheduled order’s lifecycle changes.  This function receives information about the specific event that occurred. When you are done listening, the function returns another function that allows you to unsubscribe.


## Function listenRiskOnce

The `listenRiskOnce` function lets you watch for specific risk rejection events and react to them just once. It’s like setting up a temporary listener – it listens for events that match your criteria, runs your provided function when it finds one, and then automatically stops listening. This is handy when you need to wait for a particular risk rejection to happen and then take action, but don't want to keep listening afterward.

The function takes two parts: a filter to decide which events you’re interested in, and a function to execute when the right event arrives. The filter determines which events will trigger the action, and the provided function will be executed only one time when a matching event is detected. After that, the listener stops. 

You get back a function that you can call to unsubscribe, in case you need to stop listening before the one-time trigger.

## Function listenRisk

This function lets you be notified whenever a trading signal is blocked because it doesn’t meet your risk criteria. 

It only sends you updates when a signal is rejected—you won't get flooded with notifications for signals that *are* allowed.

The notifications arrive one after another, ensuring that your response to each rejected signal happens in the order they occurred.

To use it, you provide a function that will be called whenever a risk rejection happens; this function will receive details about the rejected signal.  The function you provide will also return a function you can call to stop listening for these risk rejection events.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are executing. It listens for performance updates, which are basically timing reports for different parts of your strategy’s operations.

These updates are delivered one at a time, even if your callback function takes some time to process each one, ensuring things run in order.

This is really helpful for pinpointing where your strategy might be slow or inefficient and how you can improve its overall speed.

You give it a function that will be called whenever a performance event happens, and it returns another function that you can use to stop listening for those events.

## Function listenPauseOnce

This function lets you react to specific changes in the pause state of a contract, but only once. You provide a filter to determine which state changes you're interested in, and then a function to execute when a matching change happens. After that single execution, the listener automatically stops listening, so you don’t have to worry about cleaning it up. Think of it as a one-shot notification system for pause events. 

It's particularly useful when you need to react to a pause state change only once, like initializing a component or performing a specific action based on the initial paused state.


## Function listenPause

This function lets you keep track of when a trading strategy is paused or resumed. It's great for things like informing users about these changes – for example, displaying a message when trading is temporarily halted.

Essentially, it provides a notification system that ensures any actions taken in response to a pause or resume happen in the correct order, even if those actions involve asynchronous operations. This helps prevent unexpected behavior and ensures consistency.

You give it a function to run whenever the strategy's paused state changes, and it takes care of notifying you whenever the pause flag is toggled. This includes when new positions are put on hold and when existing orders are still being closed.

## Function listenPartialProfitAvailableOnce

This function lets you react to a specific profit level being reached in your trades, but only once. You define a condition – a filter – that determines when you want to be notified. When that condition is met, a callback function you provide will run, and then the subscription automatically stops. It's handy for scenarios where you need to take action just once based on a particular profit target. Essentially, it’s a one-time alert for when a certain profit level is hit.


## Function listenPartialProfitAvailable

This function lets you be notified when a trading strategy reaches specific profit milestones, like 10%, 20%, or 30% profit. 

It ensures that these notifications happen one at a time, even if your notification code takes some time to complete. Think of it as a line – notifications are handled in the order they arrive.

You provide a function that will be called each time a profit milestone is reached, and that function receives information about the trade. The function you provide returns another function that you can call to unsubscribe from these notifications later.

## Function listenPartialLossAvailableOnce

This function lets you watch for specific changes in your trading account's partial loss levels and react to them just once. You provide a filter that defines what kind of change you're interested in, and then a function that will run when that specific change happens. After that function runs, the listening automatically stops, so you don’t have to worry about managing subscriptions.

It's handy when you need to react to a particular loss condition just one time.

Here's what you need to know:

*   You give it a filter – this is like a rule that decides whether an event is important enough to trigger your reaction.
*   You also provide a function, which is what will actually *do* something when the filtered event occurs.
*   The listening stops automatically after the function runs once.


## Function listenPartialLossAvailable

The `listenPartialLossAvailable` function lets you keep track of how much of your trading capital has been lost during a backtest. It sends notifications when the loss level hits certain milestones, like 10%, 20%, or 30% – essentially, it tells you when you've reached a significant loss point.

These notifications are delivered one at a time, and the function makes sure your code processing those notifications doesn't run concurrently, even if the code itself takes some time to execute.

You provide a function (`fn`) that will be called whenever a loss milestone is reached, and this function receives information about the loss event. The function you provide will return a function that you can call to unsubscribe from these notifications.

## Function listenOrderStopOnce

This function lets you react to specific order-check STOP events, but only once. Think of it like setting up a temporary alert – it will trigger once when the right condition is met, then automatically stop listening.

You provide a filter to define what kind of events you're interested in, and a callback function that will be executed once when a matching event occurs.

If your callback function involves any asynchronous operations, like making an API request, the framework will wait for those operations to complete before moving on.  This ensures everything is handled in the correct order. You can think of it as a short-lived, targeted listener.


## Function listenOrderStop

This function lets you listen for specific order-related events where a STOP action is triggered. It’s like setting up a notification system for when orders are either removed entirely or experience repeated, temporary failures.

Think of it as a way to react to orders that have reached a terminal state – either because they've been deleted or because they've encountered too many problems.

The event will only happen once for each signal being monitored. It’s fired just before the order is completely shut down.

Importantly, this is a notification; any errors you encounter within your listener won't interrupt the overall process – they'll be logged but won't halt the order's finalization.

You provide a function as input, and this function will be called whenever a relevant event occurs. If your function returns a promise, the processing will happen step-by-step to manage the operations.


## Function listenOrderRejectOnce

This function allows you to react to specific order rejections in your trading system, but only once. It's like setting up a temporary alert that fires just the first time a particular rejection condition happens. You define a filter to pinpoint the exact rejection events you're interested in, and then provide a callback function that will be executed once the matching event occurs. The callback can also handle promises, so you can perform asynchronous operations. Think of it as a focused, one-time notification system for order rejections.

## Function listenOrderReject

This function lets you listen for when your orders are definitively rejected by the exchange. 

Think of it as the final word on an order – if you receive a signal here, the exchange says “no” and there’s no point in trying again.

It’s designed for situations where you need to react to rejections, like sending notifications to a webhook or auditing rejected orders.

It’s important to understand that errors within your listener function are handled internally and won’t disrupt the system; it’s safe for external integrations.

To use it, you provide a function that will be called whenever an order is rejected, and the function will return a cleanup function you can use to unsubscribe. If your function returns a Promise, the processing of events will be queued.

## Function listenOrderFillOnce

This function lets you set up a listener that reacts to specific order fill events – those moments when an order is confirmed by the broker. It's designed for one-time use; after it handles the event it matches, the listener stops working. Think of it as a quick way to grab a single piece of information from a stream of order fills.

You define what events you're interested in using a filter function. Only events that pass this filter will trigger your callback. The callback itself handles the data from the matching event.

If your callback function needs to do some asynchronous work, like making an API call, the system will wait for the callback to finish before proceeding. This ensures that the event is fully processed before the listener is removed. It's very similar to `listenOrderFill` but with the important distinction of being a one-time event listener.


## Function listenOrderFill

This function lets you set up a listener that gets notified when an order is definitely filled and confirmed by the broker. 

Think of it as a reliable signal – it only fires when the broker has acknowledged the order has actually gone through, unlike some other notifications which might be preliminary.

You'll receive events for opening positions, placing resting orders, and closing positions. 

Importantly, this is a notification, not a gate. Any errors thrown within your listener won’t interrupt the process; they’ll be handled internally and logged, so it's safe to use with external services like Telegram or audit trails. 

The callback function you provide will be executed whenever a confirmed fill event occurs. If the callback returns a Promise, the execution will be handled asynchronously.


## Function listenOrderContinueOnce

This function lets you temporarily listen for specific order-check events that happen after a verdict, but only once. It's like setting up a temporary ear to catch a particular signal.

You provide a filter – a rule – to determine which events you're interested in. Then, you supply a function that will be executed once when an event matching your filter appears.

Think of it as saying, "Hey, only tell me about these kinds of order events, and when you do, run this little routine." The function you provide will be executed and then the listener will automatically stop. If your function returns a promise, the processing will pause until that promise completes.


## Function listenOrderContinue

This function lets you keep an eye on orders that are still active or have encountered temporary issues during a check. It's like a notification system that tells you when an order is confirmed to be open or if a problem was resolved and monitoring is continuing.

Think of it as a follow-up to an initial check – it reports on the outcome of that check.

This feature is only used during live trading; backtesting doesn't involve these checks.  Any errors that happen while you're handling these notifications won’t interrupt the overall trading process – they'll just be logged.

You provide a function that gets called whenever a continue event occurs; if your function returns a promise, the processing will be done one at a time.


## Function listenMaxDrawdownOnce

This function lets you watch for specific max drawdown events and react to them just once. You tell it what kind of drawdown events you're interested in using a filter – for example, only those exceeding a certain percentage. When an event matching your filter appears, it runs your provided function, then automatically stops listening. This is handy if you need to take action only when a particular drawdown threshold is breached.

The `filterFn` is the key to selecting the relevant events. 

The `fn` is what gets executed when the right event is detected.


## Function listenMaxDrawdown

The `listenMaxDrawdown` function lets you keep an eye on how much your trading strategy has lost from its peak value. 

It's like setting up an alert that gets triggered whenever a new drawdown record is hit. 

The alerts are handled one at a time, even if your response to the alert takes some time to complete. This is helpful if you want to adjust your strategy or risk levels based on drawdown milestones—for instance, automatically reducing position size when a certain drawdown level is reached. You provide a function that gets called each time a new drawdown event occurs, allowing you to react to it.

## Function listenIdlePingOnce

This function lets you react to signals indicating periods of inactivity within your application. It listens for "idle ping" events, which are notifications about times when activity has paused. 

You provide a filter—essentially, a rule—to determine which of these events you’re interested in. Then, you specify a function that will be executed *only once* when an event matches your filter. 

The function returns a cleanup function that you can call to unsubscribe from these events, preventing further callbacks. This ensures that you’re only reacting to the relevant signals and that you can easily stop listening when no longer needed.

## Function listenIdlePing

This function lets you react to moments of inactivity in your trading system. It essentially notifies you whenever there are no trades actively being monitored or scheduled. 

You provide a function that will be called each time this happens. This is useful for performing maintenance tasks or checking system health when the system isn't busy executing trades.

The function you provide receives an `IdlePingContract` object, which provides details about the idle event.  Unsubscribing from these events is simple – the function returns a cleanup function you can call.


## Function listenHighestProfitOnce

This function allows you to set up a temporary listener for events that signal the highest profit achieved so far. You provide a condition – a filter – to define what kind of profit event you’re interested in. Once an event matches your condition, the provided callback function will be executed just one time, and then the listener automatically stops, preventing further notifications. It's a convenient way to react to a specific profit milestone and then clean up the listener.


## Function listenHighestProfit

This function lets you listen for when a trading strategy achieves a new peak in profit. It's designed to keep track of those significant milestones during a backtest or live trading session.

When a strategy hits a higher profit level, this function will notify you. Importantly, it handles these notifications in a controlled, sequential order, even if your callback function takes some time to complete – preventing any issues caused by simultaneous actions. You can use this to monitor profit levels and react accordingly, such as adjusting risk parameters or celebrating milestones.

To use it, you provide a function that will be called whenever a new highest profit is reached. This callback function will receive information about the event. The function you provide will return a function you can call to unsubscribe from listening to these events.


## Function listenExit

The `listenExit` function allows you to be notified when a critical error occurs that halts the entire process, such as those in background tasks. It's like having an emergency alert for situations where the program needs to stop immediately.

This isn't for handling minor setbacks; it's for those big problems that prevent the program from continuing.

Any errors are delivered to your callback function in the order they happened, and the system makes sure they’re handled one at a time to avoid chaos. Essentially, it ensures you're aware of and can react to truly fatal issues.


## Function listenError

This function lets you catch and respond to errors that happen during your trading strategy's execution, but aren't critical enough to stop everything. 

Think of it as a safety net for minor issues like temporary API connection problems. It ensures these errors are dealt with, and your strategy can keep running smoothly. 

The errors are handled one at a time, in the order they occur, even if the error handling itself takes some time. It also makes sure only one error response happens at a time, preventing potential conflicts. You provide a function that will be called when an error occurs, allowing you to log it, retry an operation, or take other corrective actions. When you're done, you can unsubscribe from these error notifications.


## Function listenDoneWalkerOnce

`listenDoneWalkerOnce` lets you react to when a background task within the trading framework finishes, but only once. You provide a way to identify the specific finishing tasks you’re interested in using `filterFn`, and then a callback function `fn` that will be executed when a matching task is done. This function automatically cleans up by unsubscribing after it's run, so you don’t have to worry about managing subscriptions.


## Function listenDoneWalker

This function lets you keep track of when background tasks run by the Walker are finished. It's like setting up a listener that gets notified when a process in the background is done.

You provide a function (`fn`) that will be called when a task finishes. The listener ensures that these notifications happen one at a time, even if your function does something complicated or takes time to complete.

It returns a function that you can use to unsubscribe from these notifications later, so you can stop listening when you no longer need to. This is useful when you're building things that need to react to the completion of background processing.


## Function listenDoneLiveOnce

`listenDoneLiveOnce` lets you react to when a background task finishes running, but only once. You provide a function to determine which finished tasks you're interested in, and then a function to handle those specific events. The function you provide will only run once when a matching background task completes, and then it will automatically stop listening, keeping your code clean. This is helpful for scenarios where you need to take action immediately after a background process finishes but don't want to continuously monitor its completion.


## Function listenDoneLive

This function lets you listen for when background tasks, started with Live.background(), finish running. It's great for knowing when a process is truly complete and ready for the next step.

The events are handled one after another, even if your callback function needs to do some asynchronous work, ensuring things happen in the correct order. To prevent conflicts, it uses a queue to manage your callbacks, making sure they don't run at the same time.

You provide a function (`fn`) that will be called when a task is done. This function receives a `DoneContract` object, which contains details about the completed task. When you’re finished listening, the function returns another function that you can call to unsubscribe from the events.

## Function listenDoneBacktestOnce

This function lets you react when a background backtest finishes, but only once. You provide a filter to specify which backtests you're interested in, and a callback function that will be executed when a matching backtest completes. The callback runs just one time and then automatically stops listening, so you don't need to worry about manually unsubscribing. It's a convenient way to perform actions after a specific background test is done.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. Think of it as setting up a listener that gets triggered when the backtest is done. 

The notification happens even if the backtest involves complex, time-consuming tasks. It makes sure the notifications happen one at a time, even if your response to the notification involves doing something that takes a while. 

You provide a function that will be called once the backtest is complete, and this function will receive information about the completed backtest. The function you provide will be executed sequentially, which ensures events are handled in the order they occur.


## Function listenCheckOnce

This function lets you listen for specific order check events, but with a twist: it only runs your callback function *once* when the condition you set is met. Think of it as a temporary listener that disappears after it's triggered.

It's designed for events related to order checks—essentially, keeping an eye on the status of orders. 

You provide a filter function to determine which events you're interested in, and then a callback function that gets executed just once when a matching event occurs. If your callback function takes some time to finish (like if it returns a promise), the system will wait for it to complete before continuing.

## Function listenCheck

The `listenCheck` function lets you listen for order check events, which are essentially pings to confirm if an order is still active on the exchange. It's crucial for ensuring your trading system accurately reflects the current state of your positions.

This function processes these checks asynchronously, meaning it won't block other operations. You’ll receive events whenever a signal is being monitored, before the final evaluation of the backtest.  These events tell you if the order is currently active or if it's a scheduled order (like a resting entry order).

When an error occurs during the check, it’s categorized and handled differently:

*   Transient errors (like temporary network issues or `OrderTransientError`) are tolerated, meaning the system will retry the check. The system allows for multiple failed attempts before declaring the order as closed.
*   A `OrderDeletedError` signifies that the order has been definitively removed from the exchange, and the system will immediately terminate operations for that order.
*   Rejected orders are treated as transient errors to avoid unnecessary disruptions.

You provide a callback function (`fn`) to handle these events, and it can be an asynchronous function, allowing for signal processing to wait for its resolution.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection, but only once. You provide a filter – a way to specify exactly what kind of breakeven change you're interested in. When a breakeven change matches your filter, the function will execute the code you provide (your callback function) just one time, and then automatically stop listening. It's a handy way to react to a particular breakeven event and then move on without ongoing monitoring.

You define what events you want to react to with `filterFn`, and what you want to do when that event happens with `fn`. The function will then automatically unsubscribe after executing the callback.


## Function listenBreakevenAvailable

This function lets you monitor when a trade’s stop-loss automatically adjusts to the entry price, essentially protecting your profits. It’s triggered when the trade has made enough profit to cover all transaction costs. 

The system handles these events one at a time, ensuring that even if your callback function takes some time to process, events are handled in the order they arrive. This helps prevent unexpected behavior caused by running things at the same time.

You provide a function (`fn`) that will be called whenever a breakeven event occurs, and this function will receive information about the trade that reached breakeven. The function returned by `listenBreakevenAvailable` can be called to unsubscribe from the event.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts, but only once. You provide a filter to identify the events you're interested in, and then a function to run when that event occurs. Once the event is triggered and the function runs, the subscription is automatically removed, so it won’t fire again. It's a clean way to perform a one-time action before a backtest kicks off, like initializing something or performing a check. 


## Function listenBeforeStart

The `listenBeforeStart` function lets you get notified just before a trading strategy begins running for a specific asset. Think of it as a heads-up before the engine kicks off a new strategy. 

This function ensures that any actions you take in response to this notification happen one at a time, even if they involve asynchronous operations. This prevents any conflicting instructions from happening simultaneously and maintains order. You provide a function that will be called with information about the upcoming strategy execution.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is progressing. It’s like subscribing to updates as the backtest runs in the background. 

You provide a function that will be called with progress information as the backtest moves forward. Importantly, these updates are handled one at a time, even if your provided function needs to do something that takes a little time. This ensures everything stays in order and prevents issues caused by running things simultaneously. To stop listening for these updates, the function returns another function that you can call.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You tell it what kind of event you're interested in using a filter—a test to see if the event matches what you need.  Then, you provide a function that will be executed when a matching event occurs.  Importantly, after that one execution, the subscription automatically stops, so you don't have to manually manage it. It’s a simple way to handle single, important events at the end of a backtest without keeping the subscription active.


## Function listenAfterEnd

This function lets you react to what happens *after* a trading simulation or backtest finishes for a specific asset. 

Think of it as a way to perform clean-up tasks, log final results, or trigger other actions once the main simulation is done.

The events are handled one at a time to prevent issues with tasks running at the same time, even if your cleanup code involves asynchronous operations.  You provide a function that will be called when this event occurs, and the function returns another function to unsubscribe.


## Function listenActivePingOnce

This function lets you listen for specific active ping events and react to them just once. It's like setting up a temporary alert – you define what kind of event you’re looking for, and when it happens, a function you provide will run. After that function runs, the alert automatically disappears. This is really handy if you need to wait for a particular condition to be met within the active ping data and then perform an action.

You give it two things: a filter – which tells it what kinds of events to watch for – and a function – which tells it what to do when the right event arrives. Once that event is detected, the provided function runs, and the listener is automatically turned off.


## Function listenActivePing

This function lets you keep an eye on active signals within your trading system. It listens for events that occur every minute, providing insights into the status of those signals. 

Think of it as a way to monitor the lifecycle of your signals and react to changes as they happen.

It ensures that the updates you receive are processed one at a time, even if your handling function takes some time to complete. This helps prevent unexpected behavior caused by concurrent operations. You simply provide a function that will be called whenever a new active ping event is detected.

## Function listWalkerSchema

This function gives you a way to see all the different "walkers" that are currently set up in your backtest kit. Think of walkers as specialized tools used to process and analyze data during a backtest. Calling this function returns a list of these walkers, which you can then use to inspect their configurations or build tools to manage them. It's a great help when you're trying to understand how your backtest is structured or troubleshooting any issues.

## Function listSweepSchema

This function provides a way to see all the different trading strategies that have been set up and registered within the backtest-kit framework. Think of it as a directory listing of your custom trading approaches.  It’s helpful if you're trying to understand what strategies are available, troubleshoot any issues, or if you need to dynamically display these strategies in a user interface.  The function returns a list of objects, each representing a unique sweep schema.

## Function listStrategySchema

This function lets you see a full list of all the trading strategies your backtest-kit is set up to use. Think of it like checking the inventory of available strategies. It's particularly helpful when you're trying to understand what strategies are loaded, building tools to display them, or troubleshooting any issues. The function returns a promise that resolves to an array of strategy schema objects, giving you details about each strategy.

## Function listSizingSchema

This function lets you see all the different sizing strategies that are currently set up within your backtesting environment. Think of it like getting a complete inventory of how your backtest will determine position sizes. It pulls a list of these sizing configurations, making it handy for checking your setup, creating documentation, or even building a user interface to manage these settings. The result is a list of sizing schemas, each outlining a specific method for calculating trade sizes.

## Function listRiskSchema

This function lets you see all the risk configurations that your backtest kit is using. Think of it as a way to get a complete inventory of how your trading strategy is managing risk. It returns a list of these configurations, which can be helpful if you’re troubleshooting, creating documentation, or designing user interfaces that need to display or interact with risk settings. Essentially, it gives you a clear view of all the risk rules your backtest is operating under.


## Function listMemory

This function lets you view all the stored memories associated with your signal. Think of it as a way to peek at what’s been saved and remembered for a particular trading signal. 

It simplifies things by automatically figuring out which signal you're working with and whether you're in a backtesting or live trading environment. 

You just need to provide a bucket name to specify where the memories are stored. The function then returns a list of those memories, each with a unique ID and its content.

## Function listMCPSchema

This function lets you see a complete inventory of all the data structures (called MCP schemas) that your backtest kit system knows about. Think of it as a way to list all the different kinds of information your system can handle.

It gathers all the MCPs that have been previously registered using the `addMCPSchema` function. This helps with understanding what data is available, troubleshooting, or even creating tools that need to know about all your data types. It returns a list, so you can easily iterate through them.

## Function listFrameSchema

This function gives you a peek at all the different frame schemas that your backtest kit is using. Think of it as a way to see all the blueprints for how your data is organized and processed during a backtest.  It pulls together a list of these schemas, which can be handy for checking things out, building helpful guides, or creating user interfaces that adapt to the schemas you're using. Basically, it shows you all the frames that have been set up with `addFrame()`.

## Function listExchangeSchema

This function provides a simple way to see all the exchanges your backtest-kit is set up to use. It fetches a list of all the exchange schemas you've added, giving you a clear overview of the trading environments your backtest kit is prepared to simulate. This is particularly helpful if you're setting up a new environment, troubleshooting, or want to create a user interface that adapts to different exchanges. Think of it as a quick way to check what exchanges are available for testing.


## Function hasTradeContext

This function simply tells you whether the system is currently in a state where it can execute trades. 

It verifies that both the execution context and the method context are active.

If it returns `true`, you know you can safely call functions related to trade execution, such as retrieving candle data or formatting prices. If it returns `false`, you shouldn't try those actions.

## Function hasNoScheduledSignal

This function helps you check if there's currently a signal planned for a specific trading pair, like 'BTC-USDT'. 

It returns `true` if no signal is scheduled, which is useful for making sure your system doesn't try to generate signals when they aren't expected.

Think of it as the opposite of checking *for* a scheduled signal. It smartly adapts to whether your backtest is running or in live trading mode. 

You provide the trading pair symbol as input, and it tells you whether or not a signal is on the horizon.


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, helps you check if a trading signal is currently waiting to be triggered for a specific asset, like 'BTC-USDT'. It returns `true` if there isn't a pending signal; think of it as the opposite of `hasPendingSignal`. It's really useful for making sure your signal generation logic only runs when it's appropriate – for example, preventing new signals from being created when one is already in progress. The function smartly figures out whether it's running in a backtesting environment or a live trading setup. You just need to provide the symbol of the trading pair you're interested in.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint, or schema, for a specific trading strategy, which we call a "walker." You give it the name of the walker you're interested in, and it returns a detailed description of how that walker is structured and what data it expects. Think of it as looking up the recipe for a particular trading approach. This is useful for understanding and validating the configuration of your trading systems.

## Function getTotalPercentHeld

This function helps you understand how much of a trading position you still hold. It gives you a percentage – if it’s 100%, you haven't closed any part of the position yet. A value of 0 means the entire position has been closed. 

Importantly, it works even if you've made multiple smaller sales (partials) and used dollar-cost averaging (DCA) when entering the position. 

It's essentially the same as using `getTotalPercentClosed`, so you can use whichever you prefer. You just need to provide the trading pair symbol, like "BTCUSDT".


## Function getTotalPercentClosed

This function helps you understand how much of a trade is still open. It tells you the percentage of your position that hasn't been closed, ranging from 100% (meaning the entire position is still active) to 0% (meaning the position is fully closed). 

It’s especially useful when you've closed parts of a position over time using dollar-cost averaging (DCA) – it takes those partial closures into account.

You just need to provide the trading pair's symbol, like "BTCUSDT," and it will figure out whether it’s running in a backtesting simulation or a live trading environment.


## Function getTotalCostClosed

This function calculates the total cost basis in dollars for a currently open position you're holding. It's particularly useful if you've been using a Dollar-Cost Averaging (DCA) strategy, as it accurately reflects the cost even with partial closures. The function intelligently figures out whether it's running in a backtesting environment or a live trading context. To use it, simply provide the trading pair symbol, like 'BTC-USDT'.

## Function getTimestamp

This function provides a way to retrieve the current timestamp within your trading simulations or live trading environments. It's handy for tracking time-based events.

When you're backtesting a strategy, it gives you the timestamp for the specific timeframe being analyzed. If you're running in a live trading scenario, it delivers the actual, real-time timestamp. Essentially, it gives you the "now" according to the system.

## Function getSymbol

This function allows you to retrieve the currently active trading symbol. It's a simple way to know what asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string representing the symbol.

## Function getSweepSchema

This function lets you access the details of a specific trading simulation, or "sweep," that's been set up within the backtest-kit framework. Think of a sweep as a pre-defined scenario for testing a trading strategy. By providing the name of the sweep, this function will return a description of that sweep, outlining its parameters and configurations. It's a handy way to understand exactly how a particular backtest is structured.

## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy during a backtest or live trade. It provides a snapshot of what’s happening behind the scenes—like signals waiting to be processed, actions queued up, and the ID of the signal currently being handled. Think of it as a way to understand the internal workings of the strategy without interfering with the actual trading process. It automatically figures out whether it's running a backtest or a live trade, so you don't need to specify that. You give it the trading pair symbol, like "BTCUSDT", to get the status information for that specific trading strategy.

## Function getStrategySchema

This function helps you find information about a specific trading strategy that's been set up within the backtest-kit framework. It takes the name of the strategy as input, and returns a detailed description of what that strategy does – things like the inputs it needs and the calculations it performs. Essentially, it's a way to peek under the hood and understand how a particular strategy is built. You can use this information for debugging, documentation, or just to learn more about the strategies available.


## Function getStrategyPaused

This function lets you check if a particular trading strategy is currently paused. When a strategy is paused, it won't initiate any new trades—the `getSignal` function isn't called, and any new trading requests are held until the strategy is resumed. Importantly, any existing trades or signals that are already in progress will continue to be managed and closed as usual. The system automatically figures out if it’s running in a backtesting or live environment. You just need to provide the symbol of the trading pair you're interested in to get the paused status.

## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade, based on a name you give it. Think of it as looking up a pre-defined trading plan. You provide a name identifying the sizing strategy you're interested in, and it returns the details of that sizing approach. It's useful for understanding and applying different order sizing methods within your backtesting setup.

## Function getSignalState

This function helps you retrieve a specific value associated with a trading signal. Think of it as checking the status or a data point related to a particular trade idea. 

It automatically figures out whether you're running a test or live trading, so you don't need to worry about that.

This is particularly useful when you’re building strategies that need to track information over multiple trades – for example, monitoring how a trade's performance changes over time. It's designed to work well with sophisticated strategies that use large language models (LLMs) and require detailed analysis.
The function looks for an active signal, either one that's pending or scheduled, and will let you know if neither is found.

You provide the trading symbol, like "BTC-USDT", and some initial data.


## Function getSessionData

This function lets you retrieve data specifically saved for a trading strategy’s run. Think of it like a temporary storage space linked to a particular trading pair (like BTC-USD), the strategy you're using, the exchange, and the timeframe you've chosen.

This stored data sticks around even if the backtest or live trading session restarts, making it perfect for holding things like the results of complex calculations or intermediate states that need to be remembered between each new candle.

To get this data, you simply need to tell the function which trading pair you're interested in.

## Function getScheduledSignal

This function lets you retrieve the scheduled signal that's currently in effect for a specific trading pair. Think of it as checking what signal the system is using to guide trades right now. 

It will tell you what the signal is, and if there isn’t one active, it will simply report that – effectively returning nothing. 

The function smartly figures out whether it's running in a backtest or a live trading environment without you needing to tell it.

You provide the symbol of the trading pair (like 'BTCUSDT') to know which signal applies to that specific pair.

## Function getRuntimeInfo

This function provides essential details about your current trading session. Think of it as a quick check-in to see what's happening – which symbol you're trading, the exchange you're using, the timeframe of your chart, and the strategy you've selected.  It also tells you if you're running a simulation (backtest) or a live trade. It returns this information as a promise that you can easily access in your code.

## Function getRiskSchema

This function lets you fetch a specific risk schema that's been registered within the backtest-kit system. Think of risk schemas as blueprints for how to measure and manage risk during a trading simulation. To use it, you need to provide the unique name (identifier) of the risk schema you're looking for, and it will return the schema's details. This is helpful when you want to understand or work with a particular risk measurement strategy.

## Function getRemainingCostBasis

The `getRemainingCostBasis` function helps you figure out how much of your investment in a particular asset is still open. It calculates the cost basis—essentially, how much you initially spent—that hasn't been realized through partial sales. 

This is particularly useful if you've been buying into an asset over time using a dollar-cost averaging (DCA) strategy and have already sold off some portions.

It accurately accounts for those layered purchases and partial closures, providing a precise view of what’s left. This function is functionally the same as `getTotalCostClosed`.

You just need to give it the trading symbol, like "BTC-USD", to get the remaining cost basis amount.

## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candlestick data for a specific trading pair and time interval. 

You have a lot of control over what data you get – you can specify a start and end date, or just a limit of candles to retrieve. The function automatically handles the calculations needed to adjust your date range or candle limit based on your chosen parameters.

It’s designed to work safely within the backtest environment, ensuring that your strategies don't accidentally peek into the future.

Here's what you can do:

*   Specify both a start and end date along with a limit for the number of candles.
*   Provide just a start and end date to get all candles within that period.
*   Give an end date and a limit to fetch candles leading up to that date.
*   Just use a limit to get candles starting from the default reference time.

You’ll need to provide the symbol (like "BTCUSDT") and the desired candle interval (like "1m" for one-minute candles). The function takes milliseconds for date inputs and returns an array of candle data objects.

## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a trading signal has been patiently waiting to be put into action. 

It tells you the waiting time in minutes.

If there’s no signal currently waiting, it will return null.

You just need to provide the trading pair symbol (like "BTCUSDT") to see the waiting time for that specific pair.


## Function getPositionPnlPercent

This function helps you quickly understand how profitable your open trades are right now. It calculates the percentage gain or loss on your positions, considering factors like partial fills, dollar-cost averaging, and even slippage and fees. If you don't have any open trades, it will return null. It smartly figures out whether you’re in a backtesting or live trading environment, and it also gets the current market price for you to ensure accurate calculations. You just need to provide the trading pair symbol (like 'BTC/USDT').


## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss, in dollars, for a trade that’s still open. It's like checking how much money you'd gain or lose if you sold your position right now, based on the current market price. 

The calculation takes into account things like how you bought the asset (averaged in), any fees you paid, and even any slippage that might have happened.

If there's nothing currently being traded, the function will tell you by returning null. It smartly knows whether it’s running in a backtesting simulation or a live trading environment and automatically gets the current price for you. You just need to provide the symbol of the trading pair, like "BTC-USDT".

## Function getPositionPartials

getPositionPartials lets you see the history of partial profit or loss takings for a specific trading symbol. It gives you a list of events where you've taken partial profits or losses, like when you use commitPartialProfit or commitPartialLoss.

If there's no active trading signal, it won't return anything.

If partials haven't been executed, you'll get an empty list.

Each entry in the list tells you the type of partial (profit or loss), the percentage of the position closed, the price it was executed at, the cost basis and the number of entries at the moment of that partial. You simply provide the symbol of the trading pair you are interested in.

## Function getPositionPartialOverlap

This function helps ensure you're not accidentally triggering multiple partial closes around the same price level. It checks if the current market price falls within a defined range around any previously executed partial close orders. 

Essentially, it's a safety measure to prevent redundant actions. 

The function calculates a tolerance zone based on the partial close price and percentage steps. If the current price falls within that zone, it indicates a potential overlap, and the function returns true. Otherwise, if there are no existing partials or signals, it returns false. You can configure the size of this tolerance zone using the `ladder` parameter.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks at the history of a position, like for a particular cryptocurrency pair, and tells you the exact date and time when the price reached its lowest point. If there’s no active trading signal for that position, it won't provide any data and will return null. You just need to specify the symbol, like "BTCUSDT", and it will give you the timestamp of that maximum drawdown.

## Function getPositionMaxDrawdownPrice

This function helps you understand how much a specific trade lost at its lowest point. It looks at the price movement for a particular trading pair, like BTC/USD, and tells you the maximum drawdown, essentially the biggest price drop experienced during that trade's history. If there's no active trade for that symbol, it won't return a value. You give it the symbol of the trading pair you're interested in, and it will return a number representing the maximum drawdown.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand how risky a particular trade was. It tells you the maximum percentage loss experienced by a position, calculated based on its profit and loss (PnL). Specifically, it identifies the point where the position’s PnL hit its lowest value during its entire lifespan.

If there's no active trading signal for the specified symbol, the function will return null.

To use it, you simply provide the trading pair symbol, such as "BTC-USD," and it will return a number representing that maximum drawdown percentage.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand how much money you lost during a trade. It calculates the total cost in terms of the quote currency (like USD or EUR) at the point when the trade reached its lowest value. If there’s no open trade, it won't return a value. You give it the symbol of the trading pair, like "BTC-USD," and it tells you the cost.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how long ago a trade experienced its biggest loss. It calculates the time in minutes that has passed since the price reached its lowest point for a specific trading pair. 

Think of it as a way to see how far removed you are from the worst point of a trade. 

The value will be zero if the drawdown happened just now. If there's no active trade data, the function will return null.

You need to provide the symbol, like "BTC-USDT," to specify which trading pair you're interested in.

## Function getPositionLevels

`getPositionLevels` helps you check the prices at which you've entered a trade using dollar-cost averaging (DCA). It gives you a list of prices, starting with the original price when you first started the trade and including any additional prices used when you added more to the position later. 

If there’s no active trade set up, it will return nothing. If you started a trade but haven't added any more buys, you’ll get just the initial price in a list. To use it, you need to provide the trading symbol, like 'BTCUSDT'.

## Function getPositionInvestedCount

This function helps you track how many times you've adjusted a trade using dollar-cost averaging (DCA) for a specific trading pair. 

It tells you the count of DCA entries related to the current pending signal. A value of 1 means it's the initial trade and no DCA has occurred yet. Each time you use `commitAverageBuy()` successfully, the count goes up. 

If there isn't a pending signal for that trading pair, it will return null. The function figures out whether it's running in a backtest or live trading environment automatically.

You just need to provide the symbol of the trading pair (like BTCUSDT) to use this function.

## Function getPositionInvestedCost

This function helps you figure out how much money is tied up in a particular trade. It calculates the total cost basis, which includes all the entry costs associated with a pending signal for a specific trading symbol. Think of it as figuring out your total investment in a trade so far.

If there isn't a signal pending, the function will return null. It's designed to work seamlessly whether you're doing a backtest or live trading, automatically adjusting to the current environment. You just need to provide the symbol of the trading pair you're interested in.


## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position (like buying or selling Bitcoin) made the most profit. It looks at the entire history of that position and tells you the exact timestamp – a date and time – when it reached its peak profitability. 

If there isn't a signal associated with that position, the function will return null, meaning it can’t determine a peak profit time. You just need to give it the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It's like keeping track of the best moment your trade has gone in the right direction. 

Initially, it starts by remembering the price you bought or sold at. Then, it constantly updates this record as new price data comes in. For long positions, it looks for the highest price above your entry price; for short positions, it searches for the lowest price below your entry price. 

You won't get a null value if a trade is currently active, ensuring you always have some information about the trade's performance. It requires the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its best performance. It calculates the time in minutes since the price reached its highest profit point for a specific trading pair. 

Think of it as a way to see how far a position has fallen from its peak – it’s essentially the same as checking how long it’s been in a drawdown. 

If there's no active trading signal for the given symbol, the function will return null. You provide the trading pair's symbol, like 'BTCUSDT', to check its performance.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far (peak profit) and the current profit, ensuring that the distance is never negative. 

Think of it as a measure of how much room you still have to grow in terms of profit for a particular trading pair.

If no trading signals are currently active for a given symbol, the function won't return any value. You need to provide the trading pair symbol to this function.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its best potential profit. It calculates the difference between the highest profit you could have made and what you're currently making. 

Think of it as a measure of how much room you have to improve your position’s performance.

It uses the trading symbol to identify the specific position. If no trading signals are pending, the function will return null, meaning there’s no basis for comparison.

## Function getPositionHighestProfitBreakeven

This function checks if a trade could have reached a breakeven point at its highest potential profit level. Essentially, it's looking back at a trade's history to see if it was mathematically possible to break even at the point where it made the most money. 

It requires a trading symbol (like BTC/USDT) to perform the check.

If there aren’t any active trading signals for that symbol, the function will return null, indicating it can't evaluate.

## Function getPositionHighestPnlPercentage

This function helps you understand the performance of a specific trading pair, like BTC-USDT. It looks back at a position’s history and tells you the highest percentage profit it ever achieved during its lifespan. 

Essentially, it shows you the peak gain for that particular trade. 

If there's no trading activity for that symbol, the function will return null. You need to provide the trading pair symbol as input to get this information.

## Function getPositionHighestPnlCost

This function helps you understand how much it cost to achieve the highest profit for a specific trading pair. It looks back at a position's history and tells you the total profit/loss incurred at the point where the most profit was made. 

If there's no existing signal for that trading pair, the function will return null, indicating it can't provide that information.

You provide the trading pair's symbol (like "BTC/USD") to specify which position you're interested in. The returned value represents the cost in the quote currency.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk exposure of a specific trading pair. It calculates how far the current profit percentage of your position is from its lowest point during a drawdown. Essentially, it shows you the potential loss you could have experienced if you had bought in at the worst possible time. 

The result is a percentage value, and if there isn't a current trading signal for that pair, the function won't return anything. You provide the trading pair symbol (like BTC-USDT) as input.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your trading position is from its lowest point, expressed in terms of potential profit or loss. It looks at the difference between your current profit/loss and the largest drop you’ve experienced so far. 

Essentially, it tells you how much "buffer" you have against further losses.

If there aren't any signals currently active for a specific trading pair, this function won't be able to calculate anything and will return null.

You’ll need to provide the trading symbol (like "BTC-USDT") as input.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you find out how long a trading position is expected to last, based on a signal. It tells you the estimated duration in minutes.

Essentially, it looks at the signal data to see how long the position was initially planned to be open before it might expire.

If there's no active signal currently, it will return null.

To use it, you simply provide the trading symbol (like 'BTCUSDT').

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally making multiple DCA (Dollar-Cost Averaging) entries at roughly the same price.

It checks if the current market price is close to any previously established DCA entry levels, essentially creating a safety net.

You provide the trading symbol and the current price, and optionally a configuration for how much price fluctuation is acceptable around each entry level.

The function returns `true` if the price is within a tolerance range of an existing level, indicating a potential overlap, and `false` otherwise, meaning there’s no immediate concern about duplicate entries. This is useful for making sure your trading strategy executes as intended.


## Function getPositionEntries

getPositionEntries lets you see the details of how a trade was built up, particularly if it involved a DCA (Dollar Cost Averaging) strategy. It gives you a list of each individual purchase made for the current signal, showing the price at which it was executed and the amount of money spent on each. If there’s no active signal to analyze, it will return nothing. If a single trade was placed without any DCA, you’ll receive an array containing just one entry. You need to provide the trading pair symbol to get the information.


## Function getPositionEffectivePrice

This function helps you figure out the average price at which you've acquired a position based on your current trading strategy. It calculates a weighted average, taking into account any previous trades and considering the effects of DCA (Dollar-Cost Averaging).

Essentially, it's like finding the true cost of your position, not just the initial price.

If there's no current trade in progress, it will return null.

The function intelligently adapts to whether it's running a backtest or a live trading scenario.

You just need to provide the trading symbol (like BTC-USDT) to get the result.


## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. 

Think of it as a measure of how far your trade has fallen from its best moment. 

It starts at zero when a trade first begins and increases as the price moves away from that peak. 

If no trade is currently active, this function will return null.

You provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionCountdownMinutes

getPositionCountdownMinutes helps you figure out how much time is left before a trading position might expire. It calculates this by looking at when the position was marked as pending and comparing it to an estimated expiration time. 

If the estimated time has already passed, the function will tell you zero minutes remaining. You won't get negative numbers – it always returns a non-negative value.

If there's no pending signal for a specific trading pair, this function will return null. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function lets you check how long a particular trading position has been open. It returns the number of minutes the position has been active, giving you insight into its duration. 

If there isn't a signal currently associated with the position, the function will return null.

To use it, you simply need to provide the symbol of the trading pair you're interested in, for example, "BTCUSDT".

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order based on a signal. It retrieves the details of that pending signal if one exists. 

If there isn’t a pending signal for the specified trading pair, it will return nothing.

The function automatically figures out whether it’s running in a backtesting simulation or a live trading environment.

You just need to provide the symbol of the trading pair (like "BTCUSDT") to find out about the pending signal related to it.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It gets the data directly from the exchange you're connected to. 

The function takes the symbol of the trading pair as input, and optionally, you can specify the depth – how many levels of the order book you want to see. If you don't specify a depth, it will use a default value. 

It's designed to work smoothly whether you're running a backtest or live trading, letting the exchange handle how the time information is used.


## Function getNextCandles

This function helps you retrieve a batch of future candles for a specific trading pair and timeframe. 

Think of it as looking ahead to see what the market might do.

You provide the symbol (like "BTCUSDT"), the interval (like "5m" for 5-minute candles), and how many candles you want to fetch. 

It uses the underlying exchange connection to grab these candles, ensuring you get data that comes *after* the current time in your backtest.


## Function getMode

This function simply tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It returns a promise that resolves to either "backtest" or "live," so you can adjust your code’s behavior accordingly. It's a quick way to check the environment your code is operating in.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. It’s useful if you need to implement rules like a cooldown period after a stop-loss is triggered. The function checks both your historical data and potentially your live data to find that latest signal timestamp. If no signals exist for that pair, it will return null. It automatically adjusts to whether you're running a backtest or in live trading mode. You just need to specify which trading pair (like BTC-USD) you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk associated with a trading strategy. It calculates the largest difference between the highest profit and the lowest loss experienced during a backtest, expressed as a percentage. Think of it as a measure of how far your profits could potentially fall from a peak. 

It specifically looks at the percentage change in profit, making it easy to compare different strategies regardless of the overall capital involved. 

If the backtest doesn't have any trading signals for the specified symbol, it won’t be able to provide this drawdown information. You need to provide the trading pair symbol you're interested in.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss your position experienced.

Think of it as measuring the "biggest drop" your profits could have taken.

The result represents the PnL cost distance, and it will be zero or positive. If there's no trading activity, the function won't be able to provide a result.

You give it the trading symbol (like BTC-USD) to specify which strategy’s performance you’re analyzing.


## Function getMCPSchema

The `getMCPSchema` function helps you find the structure and definition of a specific Model Context Protocol (MCP) within your backtest-kit setup. Think of it as looking up the blueprint for a particular data exchange format. You provide the name of the MCP you're interested in, and the function returns a detailed description of its expected data format – essentially, what information it contains and how it’s organized. This is useful for ensuring that your data aligns with the expected protocols when building your trading strategies.


## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, whether it's still active or has already been closed. It's handy for things like preventing rapid trading—you could use it to pause new trades for a set time after a signal triggers, regardless of if it was successful or not. The function looks for signals first in the historical data and then in real-time data, and will return nothing if there are no signals available. It automatically adjusts its behavior depending on whether it’s being used in a backtesting environment or in live trading. You just need to specify the trading pair, like "BTCUSDT".

## Function getFrameSchema

This function helps you understand the structure of a particular frame within your backtest. Think of it as looking up the blueprint for a specific step in your trading simulation. You provide the name of the frame, like "candle" or "trade," and it gives you a detailed description of what data and properties that frame contains. This is useful for verifying that your data is organized correctly and for understanding how different parts of the backtest interact. It's like having a reference guide to ensure everything fits together smoothly.

## Function getExchangeSchema

This function helps you access the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works – things like the names of its symbols, how orders are structured, and more. You provide the name of the exchange, and it returns a structured object containing all that information. This is useful when you need to understand the specific requirements for trading on a particular exchange within your backtesting strategy.

## Function getDefaultConfig

This function provides you with a starting point for configuring your backtests. It returns a collection of settings that control various aspects of the framework, from how often data is fetched to limits on the number of signals and notifications generated. Think of it as a template – you can use this to understand all the configurable options and then adjust them to tailor your backtests to your specific needs. It's a handy resource for understanding the default behavior of the system.

## Function getDefaultColumns

This function provides a handy way to see the standard columns used when creating reports. It gives you a look at the pre-defined column configurations, including those for backtest results, heatmaps, live data, and various event types like strategy activity, risk metrics, and scheduling. Think of it as a blueprint showing you all the column options available and how they’re initially set up. You can inspect this configuration to understand what data is tracked and displayed by default.

## Function getDate

This function, simply named `getDate`, provides a way to retrieve the current date within your trading strategy.  It works differently depending on whether you're running a backtest or live trading. During a backtest, it returns the date associated with the specific timeframe being analyzed. When trading live, it delivers the current, real-time date. Essentially, it gives you the date information you need, tailored to the context of your trading environment.

## Function getContext

This function lets you access details about the current process happening within your trading strategy. Think of it as a way to peek behind the scenes and understand what's currently going on. It gives you a snapshot of the environment where your code is running, providing information useful for debugging or customizing behavior. The function returns a promise that resolves to a context object, which holds various pieces of information related to the current method execution.

## Function getConfig

This function lets you peek at the framework's configuration settings. It provides access to a wide range of values that control how backtests and trading strategies behave, such as retry attempts for fetching data, maximum numbers of signals, and whether certain features like DCA are enabled. The configuration includes limits on how much data is displayed in reports and the maximum number of notifications you'll receive. Importantly, the function returns a copy of these settings, so you can examine them without changing the actual framework's internal configuration.

## Function getColumns

This function provides access to the column configurations used for generating your backtest reports. It gathers details about how various data types are displayed – things like closed trade results, heatmap rows, live ticks, and performance metrics. 

Think of it as a way to peek at how your report is structured and what information is being shown.

It returns a copy of the configuration, so any changes you make won't affect the original setup. This is useful for understanding your report’s layout or debugging display issues.

## Function getClosePrice

To grab the final closing price of a trade, use `getClosePrice`.  You’ll need to tell it which trading pair you're interested in, like "BTCUSDT," and the timeframe of the price data you want, such as "1m" for one-minute candles.  This function returns a promise that resolves to the closing price of the most recent candle for that symbol and interval. It's a quick way to check the last known price without needing to fetch a whole history of candles.

## Function getCandles

This function helps you retrieve historical price data, or "candles," from a trading exchange. You provide the symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and specify the timeframe for each candle, such as 1 minute, 5 minutes, or an hour.  You also tell it how many candles back you want to go. The function then pulls that data from the exchange's systems and provides it to you. It's a core tool for analyzing past performance and building trading strategies.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the costs associated with it. It takes the trading symbol and the current price as input and checks if the price has moved beyond a certain threshold, calculated based on slippage and fees. This is a quick way to see if a trade is likely to be in the green, considering all the expenses involved. The function automatically adapts to whether you're running a backtest or a live trading scenario.

## Function getBacktestTimeframe

This function helps you find out the dates that are available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates, essentially defining the period you can use to run simulations and test your strategies. You provide the trading symbol as input, and the function gives you back the date range for that symbol's backtest data. This lets you know what historical data is ready for analysis.


## Function getAveragePrice

This function, `getAveragePrice`, helps you figure out the average trading price for a specific asset, like BTCUSDT. It does this by looking at recent trading activity – specifically the last five one-minute intervals – and calculating the VWAP (Volume Weighted Average Price). Essentially, it gives more weight to prices where there was more trading volume.

If there's no trading volume during that period, it falls back to calculating a simple average of the closing prices instead.

You just need to tell it which symbol you're interested in, and it will return the average price as a number.

## Function getAggregatedTrades

This function allows you to retrieve a history of combined trades for a specific trading pair, like BTCUSDT. It pulls this data from the connected exchange.

You can request a specific number of trades with the `limit` parameter, or if you don't specify a limit, it will fetch trades from within a defined time window.  The trades are retrieved in reverse chronological order, starting from the current time.  If you set a `limit`, the function will keep going back in time until it has the requested number of trades.

## Function getActionSchema

Need to know what an action's expected inputs and outputs are? `getActionSchema` lets you look up the schema for a specific action by its name. This is useful for understanding how actions work and ensuring you're providing the correct data.  You simply provide the action's identifier, and the function returns a detailed schema describing its structure.


## Function formatQuantity

This function helps you display the correct quantity of an asset for trading. It takes the trading pair, like "BTCUSDT", and the raw quantity as input. Then, it automatically formats the quantity to match the specific rules of the exchange you're using, ensuring the decimal places are handled correctly. This is important for displaying orders and balances accurately.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a numerical price as input. It then uses the specific formatting rules of that exchange to ensure the price is displayed with the correct number of decimal places. Think of it as automatically handling the nuances of how different exchanges show prices, so you don't have to. This makes it easier to present price data in a user-friendly way.

## Function dumpText

The `dumpText` function allows you to output raw text data, like logs or intermediate results, associated with a specific signal. It’s useful for debugging and understanding what’s happening during your trading simulations or live trades. The function automatically handles the signal context and adjusts its behavior based on whether you’re running a backtest or a live trading session.

You provide the function with details like the bucket name, a unique dump ID, the actual text content, and a descriptive label for the data you’re dumping. The function then safely sends this data to the appropriate storage location.


## Function dumpTable

This function helps you display data in a structured table format, perfect for reviewing backtest results. It takes an array of objects and presents them as a table within the context of the trading signal you're working with.

The function figures out which signal to associate the table with, and whether you're running a backtest or live trading scenario, all on its own.

It dynamically determines the column headers by looking at all the different keys present in the objects you provide, making sure everything is displayed correctly.


## Function dumpRecord

The `dumpRecord` function helps you save data snapshots, like key-value pairs, associated with a specific trading signal. Think of it as creating a record of what happened at a particular point in time.  It automatically figures out which trading signal you're working with and whether you're in a backtesting or live trading environment, so you don’t need to specify those details.  You provide the function with information like the bucket name, a unique identifier for the dump, the actual data record you want to save, and a short description for later reference. This is useful for debugging, analyzing past performance, or creating detailed audit trails of your trading activities.


## Function dumpMCPStatus

This function lets you create a snapshot of the Model Context Protocol (MCP) status, essentially a record of the system's state at a specific point. It automatically figures out the relevant signal to associate with the snapshot, adapting to whether the system is in backtest or live mode.

When using the default setup, it will save the messages as a Markdown file, including any images encoded in base64 as embedded images with links.

You can control how this snapshot is saved – silence it completely, or just save a text-only version for easy searching.

The function takes a data object (`dto`) containing the bucket name, a unique identifier for the snapshot, the messages themselves, and a descriptive text.

## Function dumpJson

The `dumpJson` function lets you save complex data structures, like nested objects, as formatted JSON text within your backtest or live trading environment. Think of it as a way to record details about a specific moment or event during your tests or real trades. This function handles the technicalities of ensuring the data is properly associated with the current signal, and it automatically adapts to whether you're running a backtest or a live trading session. It takes an object containing the bucket name, a unique identifier for the dump, the JSON data itself, and a descriptive message. Essentially, it's a simple tool to keep a record of data for later analysis or debugging.


## Function dumpError

The `dumpError` function lets you record error details related to a specific trading signal. Think of it as a way to tag an error with a unique identifier and a short description, linking it to the context of what was happening during the backtest or live trade. It intelligently handles the current trading signal and automatically figures out whether you're in a backtest or live environment, so you don't have to worry about that. This helps when troubleshooting and understanding errors that occur during your trading process.

It takes a data object containing the bucket name, dump ID, the error content itself, and a description to clarify the issue. This information is then stored, allowing you to later review and analyze errors within the framework.


## Function dumpAgentAnswer

This function allows you to output the complete conversation history with the AI agent, linking it to a specific signal. It's incredibly useful for debugging and reviewing how the agent interacted during a trading scenario. The function handles the technical details – determining the correct signal and adapting to whether you’re running a backtest or a live trading session – so you can focus on analyzing the agent's responses. You provide the function with a data object that includes the signal's bucket name, a unique dump ID, the messages exchanged with the agent, and a descriptive summary.


## Function createSignalState

The `createSignalState` function helps you manage and track the state of your trading signals in a straightforward way. It generates a pair of functions, `getState` and `setState`, that are linked to a specific "bucket" and an initial value. 

You don't need to manually specify the signal ID; it automatically figures out whether you're in backtesting or live mode. 

This is particularly useful for advanced strategies that gather data, like metrics on each trade (things like how high a trade's profit went or how long it was open), especially when using large language models (LLMs). The function is designed to work well with strategies aiming for small but consistent profits, even when they face short-term losses.

## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade, overriding any existing trailing settings. It's designed to be easy to use by handling some of the behind-the-scenes details like determining if you’re in a backtest or live trading environment, and getting the current price. Essentially, you tell it the symbol you're trading and the absolute price you want the take-profit to be, and it will do the rest, calculating how to adjust the trailing percentage based on the initial take-profit distance. It automatically works whether you're practicing with historical data or actively trading.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit level for a trade you've already set up. It's designed to automatically adjust the take-profit distance based on a percentage change from the original take-profit level you initially set.

It’s important to understand that it always calculates changes based on the *original* take-profit distance, not the current trailing take-profit. This prevents tiny errors from adding up each time you adjust it.

The system prioritizes keeping your take-profit conservative – if you try to set a more aggressive take-profit (further from the entry price), it will only do so if the new level is actually closer to the entry than the previous one.

For long positions, only a lower take-profit will be accepted, and for short positions, only a higher one. The function also intelligently figures out whether it's running in a backtest or a live trading environment.

You’ll provide the trading symbol, the percentage adjustment for the take-profit, and the current market price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific amount. It's a shortcut that simplifies setting a stop-loss based on a target price rather than a percentage shift. The system figures out whether it's running a backtest or live trading, and it automatically gets the current market price to make the calculation. You just need to tell it the trading symbol and the new stop-loss price you want.


## Function commitTrailingStop

This function helps you fine-tune your trailing stop-loss orders. It lets you adjust the distance of your stop-loss relative to your original entry price. 

It's really important to remember that the calculations are based on the initial stop-loss you set, not any previous adjustments. This prevents errors from building up if you use this function multiple times.

When you make changes, the new stop-loss level will only be applied if it offers better protection for your profits – for long positions, it needs to move your stop-loss higher, and for short positions, it needs to move it lower.

Think of it as automatically adjusting your stop-loss, ensuring it only gets better at safeguarding your profits, and it figures out whether you're in a backtest or live trading environment on its own. You provide the trading pair, the percentage shift you want to apply, and the current price to make the assessment.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to add notes or alerts during a trade, without actually changing your positions. 

You can use it to highlight important decisions your strategy is making, send notifications to external systems, or keep a record of events happening within a trade.

It automatically handles some details for you, like knowing whether you're in backtest or live mode and pulling in information about your strategy and the exchange. It even gets the current price for you, so you don't have to. 

You provide the symbol you’re trading and can also include additional details in a payload to make your notification more specific.


## Function commitPartialProfitCost

This function lets you close a portion of your trading position to secure some profit. It’s designed to be easy to use – you just specify the dollar amount you want to close, and it handles the calculations to determine the corresponding percentage of your position. Think of it as a shortcut for partially closing a trade while aiming for your target profit.

It's helpful when you want to lock in gains incrementally. The function figures out how much of your position to close based on the dollar amount you give it, assuming the price is moving in a favorable direction toward your take profit target.

The function knows whether it’s running in a backtesting environment or a live trading setting, and it automatically gets the current price to make the calculations. You provide the symbol of the trading pair (like BTCUSDT) and the dollar amount you want to close.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price is moving in a profitable direction, helping you secure some gains along the way. It's designed to close a specific percentage of your current position, specified as a number between 0 and 100. The function handles whether it's running in a backtesting environment or a live trading scenario, so you don't need to worry about that. You provide the symbol of the trading pair and the percentage you want to close.

## Function commitPartialLossCost

This function helps you partially close a trading position when you're experiencing a loss, and want to limit further potential downside. It allows you to specify the dollar amount you want to close, and the system will calculate the corresponding percentage of your position to close. Think of it as a convenient way to move your stop-loss order closer to the current price.

It handles some of the complexities for you, such as determining the correct percentage based on your initial investment and fetching the current price of the asset. This function works whether you're in backtesting or live trading mode.

You provide the symbol of the trading pair and the dollar amount you want to close. For example, if you use a dollar amount of 100, the system will close a portion of the position equal to $100 in value. It's important that the price is moving in a direction that would trigger a stop-loss.


## Function commitPartialLoss

The `commitPartialLoss` function allows you to automatically close a portion of your open trade when the price moves unfavorably, essentially inching towards your stop-loss level. It’s designed to help mitigate losses by closing a specified percentage of your position. You tell the function which trading pair you're dealing with and what percentage of the trade you want to close, and it takes care of executing that action, automatically determining whether it’s running in a backtesting or live trading environment. It's important to note that this function only works when the price is trending in the direction of your stop-loss.


## Function commitCreateTakeProfit

This function lets you tell the backtest kit that a take-profit order for an existing position has been filled by the exchange, even if it wasn't triggered by the VWAP calculation. It's useful because the exchange might execute the order at a different price point, like a high or low, bypassing the usual VWAP-based take-profit check.

Essentially, it acknowledges that the position closure is happening, and the system will record it as a take-profit closure on the next tick.

The function will only do anything if there's a pending signal for the specified trading pair.

You can optionally include extra information with the function call, like an ID and a note for the commit. The framework automatically knows whether it's running a backtest or a live trading scenario.

## Function commitCreateStopLoss

This function tells the backtest-kit that a stop-loss order for a position has been filled on the exchange. Sometimes, the actual order executes at a price different from what the VWAP-based stop-loss calculation suggested.

This helps keep the backtest and the exchange in sync.

It's used to confirm the closure happened due to the stop-loss, noting the reason as "stop_loss" for the position's eventual close. If there isn't a pending signal for a position, nothing happens.

The function automatically knows whether it's running a backtest or a live trade.

You need to provide the trading symbol (like "BTCUSDT") and can optionally include extra information like an ID and a note with the function call.

## Function commitCreateSignal

This function lets you manually submit a trading signal to the backtest kit, giving you more control over when signals are executed. Instead of relying on the framework's default signal retrieval, you can provide your own signal data.

The signal's timing depends on whether you include a `priceOpen` value: if you don't provide one, the signal executes right away at the current price.  If you *do* include a `priceOpen`, the signal will execute immediately if that price has already been reached; otherwise, it will be scheduled to trigger when that price is hit.

The system verifies the signal data to ensure it's valid, and it won't accept the signal if another signal or deferred action is already active.  It figures out whether it's running a backtest or a live trading simulation based on the current environment.

You provide the trading symbol (like "BTCUSDT") and the signal data itself (an `ISignalDto` object) to this function.

## Function commitClosePending

This function lets you cancel a pending order without interrupting your trading strategy. It's useful when you want to clear a pending signal – essentially, a standing order – but still want your strategy to continue generating new trading suggestions. Think of it as temporarily pausing a specific order, unlike closing a position which would stop the strategy. The function automatically adapts to whether you're in a testing (backtest) or live trading environment.

You specify which trading pair (symbol) the pending order belongs to. Optionally, you can also include details like an ID or a note to help track why you cancelled the order.


## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal within your trading strategy. It’s useful if you need to adjust your plans without completely halting the strategy's activity. Think of it as hitting a pause on a future action – it removes the scheduled signal while allowing the strategy to keep running and generating new signals. This function works whether you're in a backtesting or live trading environment, adapting automatically to the context. You can optionally include extra information like an ID or a note to help track why you cancelled the signal.


## Function commitBreakeven

This function automatically adjusts your stop-loss order to break even once the price has moved favorably. It essentially eliminates risk by setting the stop-loss at your entry price, covering any fees and a small slippage buffer. The function handles whether it's running in a backtest or live environment and retrieves the current price for you, making the process straightforward. You just need to provide the trading pair symbol like "BTCUSDT".

## Function commitAverageBuy

The `commitAverageBuy` function helps you gradually build a position in an asset using a dollar-cost averaging (DCA) strategy. It essentially adds a new purchase order to your existing plan, buying a portion of the asset at the current market price. This function automatically figures out whether it’s running in a testing environment or a live trading setup and fetches the current price for you. It also keeps track of the average price you've paid for the position so far and sends a notification that a new purchase has been made. You can optionally specify a `cost` parameter.

## Function commitActivateScheduled

The `commitActivateScheduled` function lets you manually trigger a signal that's been scheduled for activation.  Normally, a signal waits for a specific price to be reached before activating. This function bypasses that automatic waiting period.

It's useful when you want to acknowledge the signal's existence and trigger its handling immediately, even if the price hasn't hit the target.  This happens on the next tick of the strategy.

The function works whether you're running a backtest or a live trading session, automatically adapting to the current environment.

You provide the symbol of the trading pair you're working with. Optionally, you can include a payload, like a note or an ID, to help track the signal’s activation.


## Function checkCandles

The `checkCandles` function verifies if the necessary historical candle data is already stored and ready for use. It efficiently checks for the existence of these candles using the data persistence adapter. This process only requires a single request to retrieve data; it doesn't load the entire dataset, making it quick and resource-friendly. If even one candle is missing or misaligned in time, the entire check will fail. The function takes parameters to specify what data to check.

## Function cacheCandles

The `cacheCandles` function is designed to make sure your trading system has the historical candle data it needs. It checks your existing storage for candles covering a specific timeframe (symbol, interval, start time, end time, and exchange).

If the data isn't found, it automatically fetches the missing candles and verifies the data again.

Think of it as a safety net—it proactively retrieves any missing historical data to prevent errors during backtesting or live trading. The function reports progress at the start of the check and when warming up.


## Function addWalkerSchema

This function lets you add a new "walker" to the backtest-kit system. Think of a walker as a specialized tool that runs multiple trading strategies against the same historical data. It then analyzes how these strategies performed, allowing you to compare them directly based on a chosen performance metric. To use it, you provide a configuration object that defines how the walker should operate and which strategies it should evaluate.

## Function addSweepSchema

This function lets you define and register a "sweep" – essentially a way to systematically test a trading strategy across a range of parameter values. Think of it as automating the process of trying many different variations of your trading idea.

The sweep framework will execute your strategy once for each combination of parameters you specify, using a single candle to evaluate each setup.

It will also train a whitelist/ban list of authors during this process and perform calculations to evaluate the grid of entry and exit parameters based on the results. You can define the parameters to test, or if you leave them out, default values will be used.


## Function addStrategySchema

This function lets you register a new trading strategy within the backtest-kit framework. Think of it as telling the system about a new way you want to trade. When you register a strategy, the framework automatically checks to make sure it's set up correctly, verifying things like signal timings and stop-loss logic.  It also helps prevent issues like too many signals being generated too quickly, and ensures that even if something goes wrong, the strategy’s data remains safe.  You provide a configuration object, which contains all the details about your strategy, when you call this function.

## Function addSizingSchema

This function lets you tell the backtest framework how to determine the size of your trades. It essentially sets up the rules for deciding how much capital to allocate to each position.

You provide a sizing configuration object that outlines things like the method used for sizing (whether it's based on a fixed percentage, Kelly Criterion, or ATR), the specific risk parameters involved, limits on position size, and even a way to customize calculations with callbacks. Think of it as defining the framework’s guidelines for managing risk and determining trade sizes.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up guardrails to prevent overexposure and ensure stability. 

You can specify limits on how many positions you can hold at once, and implement more complex checks like analyzing correlations between different strategies. 

The beauty of it is that multiple trading strategies can share the same risk management rules, providing a holistic view of your portfolio's risk profile.  The system keeps track of all active positions and makes that data available for your custom risk validations.


## Function addMCPSchema

This function lets you connect your trading strategies to an external system, often referred to as an MCP agent. Think of it as establishing a communication channel so the agent can monitor and interact with your strategies in real-time.

You provide a configuration object that defines how the agent will receive updates about your strategy's status, like its positions and performance.

The agent can also send commands to adjust positions.  The MCP effectively ties the agent to specific instances of your strategy, allowing for synchronized control.

If you don't specify a custom method for displaying portfolio information to the agent, a default system will send basic text messages for each traded asset.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your backtesting. Think of it as registering a way to create the series of historical data points your trading strategy will analyze.

You provide a configuration object, which specifies things like the start and end dates of your backtest, the interval at which your data will be generated (e.g., daily, hourly), and a function that handles events related to timeframe generation.

Essentially, it’s how you teach the backtest-kit how to build the historical data it needs to run your tests.


## Function addExchangeSchema

This function lets you tell the backtest-kit about a new exchange you want to use for your backtesting. It's essentially registering the data source for that exchange.

By adding an exchange, you'll be able to access historical price data, the framework will handle how prices and quantities are displayed, and it will also calculate a VWAP (volume-weighted average price) based on recent trades.

You’ll need to provide a configuration object that defines the exchange's details.

## Function addActionSchema

This function lets you plug in custom actions to your backtest kit strategy. Think of actions as little helpers that react to specific events happening during your backtest, like a trade hitting a profit target or a new signal being generated.

You can use these actions to do things like automatically update your trading journal, send a notification to a messaging app, or record data for later analysis.

Essentially, it’s how you extend the framework to respond to events in a way that's relevant to your specific needs. You provide the framework with a configuration, and it handles creating and managing these action handlers during each backtest run. Each action gets a unique chance to respond to events that occur during each strategy’s execution.
