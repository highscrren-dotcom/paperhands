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

The `writeMemory` function lets you store data within a specific memory space, essentially creating a labeled container for information. Think of it as saving a piece of information, like a trading decision or a calculated indicator, so you can retrieve it later.  This function is cleverly tied to the signal it's operating under, ensuring the data is relevant and consistent. It handles the complexities of knowing whether you're in a backtesting environment or a live trading scenario without you needing to worry about it. 

You provide a name for the memory bucket, a unique identifier for the memory location within that bucket, the actual data you want to store (which can be any type of object), and a short description to help you remember what's in there.  The function then persists this data, making it accessible to other parts of your trading logic.


## Function warmCandles

This function helps speed up your backtesting by pre-loading historical price data (candles) and storing them for quick access. It essentially downloads all the candles for a specific time period and interval you specify, so they’re ready to go when your backtesting strategy needs them. Think of it as prepping the data beforehand, so your backtest runs smoother and faster. You provide the starting and ending dates for the data you want to cache.

## Function waitForReady

This function helps ensure everything is set up correctly before you start trading, either in backtest or live mode. It waits patiently, checking every second, until all the necessary pieces – like the exchange, strategy, and in backtest mode, frame information – are loaded and ready. 

It's particularly useful when things are being loaded asynchronously, like when you’re using plugins or fetching configurations from a remote source. Think of it as a checkpoint to make sure everything is in place before you try to start your backtest or live trading session. If it waits too long and things aren't ready, it won't throw an error itself, but will let the subsequent trading process flag the problem.

You can tell it whether you're running a backtest (which needs frame data) or live mode (which doesn't).

## Function validate

This function checks to make sure all the different components you're using – like exchanges, trading strategies, and risk management tools – are properly set up and registered within the system. 

It can either validate a specific set of components you tell it to, or it can perform a full check of *everything* that's registered.

Think of it as a quality control step before you start a backtest or optimization; it helps prevent errors later on by confirming everything is in place. 

You can give it instructions to focus on certain areas, or just let it do a complete sweep. The results of these checks are stored to speed up future validations.

## Function stopStrategy

This function allows you to pause a trading strategy. 

It effectively halts the strategy from creating any new trading signals. Existing signals that are already active will finish their execution as usual. The system will then gracefully stop, either when it's idle or after a currently open signal is closed, adapting to whether it's running in backtesting or live trading mode. To use it, you simply provide the trading symbol associated with the strategy you want to stop.

## Function shutdown

This function provides a way to cleanly stop the backtesting process. Think of it as a polite way to tell the system it’s time to wrap up.

It triggers a shutdown event, allowing different parts of the backtest, like data handlers or strategy logic, to perform any final cleanup tasks they need to do.

You'd usually call this when you want to terminate the backtest, like when you press Ctrl+C. This helps prevent data corruption or other issues that can happen with an abrupt termination.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. 

Think of it as putting the strategy on hold. 

When paused, it won't process new trading signals, but any existing orders or signals will still be handled as usual.

The paused state is saved, so it will remain active even if the system restarts. To reactivate the strategy, you need to explicitly tell it to resume trading. A notification will be sent when the strategy is paused or resumed. The function works seamlessly whether you're in backtest or live trading mode. You provide the trading pair symbol and a boolean value (true for paused, false for resumed).

## Function setSignalState

The `setSignalState` function helps you manage and track information related to a specific trading signal. It's particularly useful when you're building strategies that react dynamically, like those driven by language models, and need to keep track of metrics for each trade.

Think of it as a way to update a piece of data—like a trade’s performance—and automatically tie it to a particular signal that's either waiting to be executed or already scheduled.

If no such signal is found, the function will alert you. It smartly determines whether you’re in a backtesting or live trading environment, so you don’t have to worry about that distinction. 

This function is designed for advanced strategies that accumulate performance data across multiple trades, using metrics like how long a trade stays open and its peak profit percentage.  The goal is to identify and manage trades that have potential for significant gains while also managing risk and cutting losses if a trade isn’t performing as expected.

## Function setSessionData

This function lets you store data that's specific to a trading symbol, strategy, exchange, and the timeframe you're using. Think of it as a temporary cache that lasts throughout a backtest or live trading session. It's a great way to keep track of things like intermediate calculations or LLM results so you don’t have to recompute them for every candle. You can even clear the stored data by passing `null`. The system automatically knows if it's running a backtest or live.

It takes two arguments: the trading symbol you’re working with, and the data you want to store, which can be any object or `null` to clear it.


## Function setLogger

This function lets you plug in your own logging system for backtest-kit. It's useful if you want to send logs to a specific place, like a file, a database, or a dedicated logging service.

When you provide a logger, any messages generated by the framework, like information about trading decisions or errors, will be passed to your logger.  These messages will also include helpful context, such as the trading strategy’s name, the exchange being used, and the trading symbol. This extra context makes it much easier to understand what's happening during your backtests.

## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. Think of it as fine-tuning how the whole system operates. You provide a set of configuration options, and this function applies them, effectively overriding the default settings. There's also a special flag, `_unsafe`, which you would use primarily in testing situations to bypass some safety checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like when you generate a markdown file. You can change how different pieces of data are displayed. It’s like tweaking the layout of a spreadsheet to show exactly what you want.

You provide a set of new column configurations, which will replace the default ones. The framework checks to make sure your new definitions are correct before applying them.

There's also a special flag, `_unsafe`, which you only use in testing scenarios to bypass those checks.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. It lets you search across your data using keywords and phrases.

Think of it as a powerful search engine specifically for your trading data.

It uses a method called BM25 to rank the results, making sure the most relevant entries appear first.

The function understands whether it's running in a backtesting scenario or a live trading environment automatically.

You provide it with the name of the memory bucket you want to search and the query you’re looking for.

It returns a list of entries, showing you the ID of each match, its relevance score, and the content itself.


## Function runInMockContext

This function lets you execute code as if it were running within a trading environment, but without needing a full-blown backtest. Think of it as a sandbox for testing or scripting where you can access things like the current time or exchange information.

You can customize the environment it simulates by providing details like the exchange name, strategy, timeframe, and symbol, or simply let it use default placeholder values. 

It’s especially helpful for verifying your code's logic that relies on these environmental factors, making your tests much easier to write. If you need to test something using the current time, this function is very useful.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data.

It automatically figures out whether you're running a backtest or a live trading session, so you don't have to worry about setting that manually.

To use it, you’ll need to provide the bucket name and the unique ID of the memory entry you want to remove. The function takes care of the rest, ensuring the appropriate signal is handled based on your current trading environment.


## Function readMemory

The `readMemory` function lets you retrieve stored data, like historical prices or calculated indicators, from a designated memory location. Think of it as accessing a pre-computed result you saved earlier. It uses a `bucketName` and a unique `memoryId` to pinpoint exactly where the data is stored. This function intelligently figures out whether your code is running in a backtest or a live trading environment, and also knows what signal it's currently working with. It returns the data as an object of a type you specify, ensuring type safety.


## Function overrideWalkerSchema

This function lets you tweak the walker configuration used for comparing different strategies. Think of it as a way to adjust how your backtest kit analyzes and evaluates trading strategies against each other.

It allows you to update specific parts of an existing walker setup – you don’t need to redefine the whole thing. Only the settings you provide will be changed, while the rest of the original walker configuration stays the same. This is useful for fine-tuning comparisons without starting from scratch. You pass in a partial walker configuration, and it returns a modified walker schema.

## Function overrideSweepSchema

This function allows you to modify a sweep configuration that's already been set up within the backtest-kit framework. Think of it as a way to fine-tune an existing sweep, rather than creating a whole new one. You only need to specify the parts of the sweep you want to change; everything else will stay the same. Keep in mind that the framework remembers sweep configurations, so any changes you make won’t affect previously created sweep instances until you clear that cache. 

It takes a partial sweep configuration as input and returns a promise resolving to the updated sweep schema.

## Function overrideStrategySchema

This function lets you modify an existing trading strategy's configuration. 

Think of it as a way to tweak a strategy without having to completely redefine it. You provide only the parts you want to change—like updating parameters or adding a new setting—and the rest of the strategy's setup stays the same. It's useful for fine-tuning strategies as you experiment and learn. The function returns a modified strategy schema object.


## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without having to rewrite the whole thing. It’s useful when you want to make small adjustments to how positions are sized. You provide a partial configuration – just the parts you want to change – and it updates the existing sizing schema. The rest of the original settings remain untouched.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit framework. Think of it as a way to refine a risk profile you've already set up, instead of completely replacing it. You provide a chunk of updated information—like adjusted position size limits or margin requirements—and the function applies just those changes, leaving the rest of the original risk configuration untouched. It’s useful for making incremental adjustments as your trading strategy or risk tolerance evolves.

## Function overrideMCPSchema

This function lets you modify a trading system's configuration, specifically the MCP (Model Context Protocol) settings. Think of it as tweaking an existing setup rather than starting from scratch. You provide a partial configuration – just the bits you want to change – and the function updates the existing MCP, leaving everything else untouched. It’s a handy way to adjust things without needing the entire original configuration.

## Function overrideFrameSchema

This function lets you modify how data is structured for a specific timeframe during backtesting. Think of it as a way to tweak the settings for a particular timeframe without having to rebuild the entire timeframe configuration. You provide a partial configuration – only the settings you want to change – and the function updates the existing timeframe's settings, leaving everything else untouched. It’s useful for fine-tuning your backtesting environment.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. It's a way to tweak a previously set-up exchange – you don’t have to recreate it entirely.  You provide only the changes you want to make; the rest of the exchange's original settings stay as they were. Think of it as a targeted update for your exchanges. The function returns a promise that resolves to the updated exchange schema.

## Function overrideActionSchema

This function lets you tweak an existing action handler – think of it as fine-tuning how your backtest kit reacts to specific events. You don't need to completely replace the original handler; instead, you can just modify certain aspects of it. This is really helpful if you want to change how events are handled in different environments, swap out the logic used, or adjust behavior without altering the core strategy itself. You provide a partial configuration, and only the fields you specify will be updated, leaving everything else untouched.

## Function listenWalkerProgress

This function lets you track the progress of your backtest as it runs. It calls a function you provide after each strategy in your backtest finishes executing. The progress updates are handled one at a time, ensuring that your callback function isn't overwhelmed, even if it's doing some asynchronous work. Essentially, it's a way to receive notifications about the completion of individual strategies within the overall backtest process. You'll get a `ProgressWalkerContract` object with each update, which contains details about the strategy that just finished.


## Function listenWalkerOnce

`listenWalkerOnce` lets you set up a listener that reacts to specific events happening during a trading simulation or backtest. It’s like saying, "Hey, I want to know when *this* particular thing happens," and once it does, your code runs, and the listener automatically stops listening. This is great when you need to wait for a specific condition to be met during your backtest, like a certain trade type being executed.

You provide a function (`filterFn`) that decides which events should trigger the action, and then you give it another function (`fn`) that gets called once when a matching event occurs. After that one execution, the listener is automatically removed, so you don't have to worry about cleaning it up.


## Function listenWalkerComplete

This function lets you be notified when a backtest run, managed by the Walker, finishes. It's designed for situations where you need to do something after the test is complete, especially if that "something" involves asynchronous operations.  The function will call your provided callback once the Walker has finished evaluating all strategies.  Importantly, your callback function will be executed one after another, in the order they are received, even if the function itself takes time to complete. This ensures that everything happens in a controlled and predictable sequence. To stop listening, simply call the function that's returned by `listenWalkerComplete`.

## Function listenWalker

The `listenWalker` function lets you keep track of what's happening as your backtest strategies run. It’s like setting up a listener that gets notified when each strategy finishes its part in the process.

These notifications, called "walker progress events," are delivered one after another, even if the code you provide to handle them takes some time to complete. 

Essentially, it helps you monitor the progress of your backtest and react to it as each strategy concludes, ensuring a smooth and controlled flow of events. You provide a function to be called for each event, and `listenWalker` takes care of queuing and handling the notifications.


## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process. It's like setting up an alert system that triggers when something goes wrong while checking your trading signals. 

You provide a function that gets called whenever an error occurs, allowing you to debug and monitor these issues. The errors are handled one at a time, in the order they happen, even if your error-handling function takes some time to complete. This makes sure everything is processed safely and predictably.

## Function listenSync

The `listenSync` function lets you react to events happening when orders are being processed, like when a signal is being opened or closed. It's like getting a notification that something's in progress.

If something goes wrong within your reaction to this event – for instance, an error occurs – how that error is handled affects whether the system retries the action or stops altogether.

A simple error typically leads to retries for opening or closing orders, keeping track of the attempt number. A rejection error means the action is immediately stopped. Certain errors signify a violation and are treated as temporary setbacks.

You provide a function as input to `listenSync`, and that function will be called whenever a synchronization event happens. If your function returns a promise, the system waits for that promise to finish before continuing. The function you provide should be able to handle the `OrderSyncContract` event data.


## Function listenStrategyCommitPerSignal

This function lets you keep an eye on what's happening with your trading strategies as they generate signals. It's like setting up an alert that goes off each time a new signal is created.

You can specify a filter to only receive notifications for specific signals – this helps you focus on the signals that matter most to you.

The system makes sure you don't get flooded with duplicate notifications for the same signal, so you’ll only hear about the initial action related to it. Because some actions repeat for the same position, this ensures you only receive one notification per signal.


## Function listenStrategyCommitOnce

This function lets you react to specific strategy changes within the backtest-kit framework. 

Think of it as setting up a temporary listener that only cares about events that meet certain criteria you define. Once an event matching your criteria occurs, the provided callback function runs, and then the listener automatically disappears. It's perfect for situations where you need to perform an action immediately after a particular strategy action happens and don't want to continue monitoring events afterward.

You'll provide a filter that determines which events trigger your action and a function that gets executed when a matching event occurs. The function returns a cleanup function that you can call to manually unsubscribe if needed.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a notification system that alerts you when certain actions occur, such as signals being canceled, orders being closed, or stop-loss and take-profit levels being adjusted. 

These events are handled one at a time, so you don’t have to worry about things getting mixed up if your notification code takes a bit of time to run. It's a reliable way to track key changes in your strategy's behavior and react accordingly. You provide a function that will be called each time one of these strategy events happens.

## Function listenSignalWaitingPerSignal

This function allows you to monitor the "waiting" state of your trading signals. It’s designed to be triggered only once for each new signal, even though the "waiting" state might occur repeatedly. Think of it as a way to get notified when a resting order finally meets a specific condition you're looking for – it reports that first successful check and then stops until a new signal appears. 

You provide a filter function to specify which "waiting" events you’re interested in, and a callback function that will be executed when a matching event occurs. This lets you react to and potentially act upon those key moments in your strategy.


## Function listenSignalWaiting

This function lets you be notified whenever a trading signal is pending and hasn't yet triggered. It sends updates for every tick while a signal is waiting, which can be quite frequent. If you’re working with many signals, consider using `listenSignalWaitingPerSignal` instead to reduce the number of callbacks you receive. The callback receives an event containing information about the waiting tick.

## Function listenSignalScheduledPerSignal

This function lets you react to scheduled tick results, but specifically when a new signal is generated. It’s designed to allow you to focus on events related to distinct signals, whether you're running a live strategy or backtesting. You provide a filter function to decide which events you're interested in, and a callback function that will be triggered each time a new signal appears and meets your criteria. The function returns an unsubscribe function that you can call to stop listening.

## Function listenSignalScheduled

This function lets you listen for signals that are scheduled – meaning they're waiting for a specific price to be reached before they can be acted upon. 

Think of it as setting up an alert that triggers when a particular trading opportunity arises.

It provides the details of the signal, including its target price and other relevant information.

You'll receive an event the first time a scheduled signal is created, and then ongoing "waiting" events as the price moves closer to the trigger point.

When you're done listening, the function returns another function that you can call to unsubscribe from the scheduled signals.


## Function listenSignalPerSignal

This function lets you listen for trading signals, but with a bit more control. It allows you to specify a filter to only receive signals that meet certain criteria.

The function then ensures that you only receive one notification for each distinct signal, even if multiple events share the same signal ID.

You'll only get events that actually represent a signal (idle events are ignored), so you can be sure the data you're receiving is meaningful.

Essentially, it provides a way to react to new signals selectively and efficiently.

The function returns another function which can be called to unsubscribe from the signal.


## Function listenSignalOpenedPerSignal

This function lets you react to specific signals as they are opened, whether it's a live trading scenario or a backtest.  You provide a filter to narrow down which signals trigger your callback. 

Essentially, you'll get notified each time a new signal is opened, but only for the signals that match your criteria. This allows you to perform actions or track progress based on the opening of particular signals. The function returns a cleanup function to unsubscribe from the event stream.

## Function listenSignalOpened

This function lets you be notified whenever a new position is opened, whether it's triggered by your strategy or by a scheduled signal. Think of it as setting up an alert system for when trades start. You provide a function that gets executed each time a position opens, and that function receives information about the opened position. The function you provide will return a function that can be called to unsubscribe from the signal.

## Function listenSignalOnce

The `listenSignalOnce` function lets you react to specific trading signals, but only once. Think of it as setting up a temporary listener that waits for a certain condition to be met, executes your code, and then disappears. You provide a filter – a test to see if a signal matches what you’re looking for – and a function that gets run when that signal appears. It’s perfect for situations where you need to respond to a one-off event and then move on.


## Function listenSignalNotifyPerSignal

This function lets you listen for signal events and be notified specifically when a new signal appears. It's designed to handle situations where a strategy might send multiple signal updates for the same signal – you'll only receive one notification per unique signal ID. You provide a filter function to decide which signals you're interested in, and a callback function that will be executed when a matching signal event occurs. This helps keep your notifications clean and focused on the signals you truly need to react to.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals, but only once. You provide a filter—a rule to identify which signals you’re interested in—and a function that will be executed when a matching signal appears. Once that one signal triggers your function, the subscription automatically stops, ensuring you won't get repeated notifications from that same event. 

Think of it as a temporary alert for a very specific trading opportunity.

It's handy when you need to react to a single instance of a signal and then don’t want to be bothered by it anymore.

The filter function tells the system which signals to watch for, and the callback function is what actually *does* something when a matching signal comes through.


## Function listenSignalNotify

This function lets you listen for notifications when a trading strategy sends out a signal note related to an active trade. Think of it as a way to be informed about specific events triggered by a strategy, like a note about a trade being opened or closed. The notifications are delivered one at a time, even if the function you provide to handle them takes some time to complete. This ensures that everything happens in the correct order, and prevents any potential issues with multiple notifications happening at the same time. To use it, you just need to give it a function that will be called whenever a new signal notification arrives.

## Function listenSignalLiveWaitingPerSignal

This function lets you react to specific events happening while a trade is waiting for activation, but only from live trading scenarios. It ensures you only get notified once for each signal, even if the waiting period is long. 

Think of it as a way to listen for when a resting order might finally trigger, but only when the market is actively moving and not during a historical replay.

The function uses a smart system to avoid duplicate notifications. It remembers the last signal it acted on for each trade and ignores subsequent repeats of that same signal. Plus, your filter will always run first, so events it rejects won't even be considered for duplicate suppression.

You provide a filter to decide which waiting events you’re interested in, and a function to execute when a matching event is found. 


## Function listenSignalLiveWaiting

This function lets you listen for updates while a trading signal is waiting to be triggered during a live execution. Think of it as getting notified about the "resting" period before a trade actually happens.

You'll receive a stream of events, one for each tick, as long as the signal is still waiting. Each event contains details about the potential trade (the `signal`) and a theoretical profit and loss (`pnl`).

Important: This only works during live executions with `Live.run()`. It won't be triggered during backtests. This makes it a safe way to perform actions like sending notifications or mirroring orders.

The events are already filtered by action, so you don’t need to check the `action` field – you can directly access the signal and P&L information.

## Function listenSignalLiveScheduledPerSignal

This function lets you react to specific events generated during live trading, focusing on those that are "scheduled." Think of it as a way to listen for events that happen at predetermined times within your live trading system.

It ensures that you only receive each relevant event once, acting as a safeguard to prevent multiple triggers for the same underlying action. 

Crucially, this function *only* works with live executions; you won’t get events from backtest replays.

It uses a sophisticated system to avoid conflicts between multiple strategies running simultaneously – each strategy's events are handled independently. 

You provide a filter function which determines if an event should be considered; this function is evaluated *before* any duplicates are checked, so it always has the first chance. This prevents it from hiding subsequent, potentially important, events.


## Function listenSignalLiveScheduled

This function lets you tap into live trading executions specifically when a strategy requests an entry at a particular price. Think of it as a notification that the engine is now patiently waiting for the market to hit that target price.

It's a one-time notification - it only happens when the initial signal is generated. Subsequent ticks while waiting for that price will be delivered through other means.

Importantly, this callback only works during live executions; it won't trigger during backtests. This makes it perfectly safe for actions like sending out-of-band alerts or mirroring orders – things you only want to happen when you’re actively trading.

You'll receive a specialized event object directly without needing to check its action type.

## Function listenSignalLivePerSignal

This function lets you listen for individual trading signals as they come in from a live backtest. It’s like setting up a special alert that only triggers when a new signal is generated.

You provide two things: a filter to decide which signals you're interested in, and a function to execute when a matching signal arrives.

Importantly, this only works for signals produced during a Live.run() execution, and it ignores signals that don’t have an associated signal ID – effectively skipping any idle events. Signals are also handled in a way that avoids duplicates.


## Function listenSignalLiveOpenedPerSignal

This function lets you monitor when new trades are opened during live trading, but only when they match specific conditions you define. It guarantees that you'll only receive a notification once for each individual trade, even if multiple events related to that trade occur. 

Think of it as a filter – you tell it what kind of trade openings you're interested in, and it only alerts you about those. This function operates exclusively with live data, not historical backtests.

It uses a clever system to avoid duplicate notifications, ensuring that each signal is reported only once within a particular trading context – the combination of strategy, exchange, timeframe, mode, and symbol. 

The filter you provide is checked *before* any duplication is handled, meaning that any event it rejects will never be seen again, preventing it from suppressing subsequent, similar events. The callback function you supply is executed only for those events that pass your filter and haven’t been previously reported.


## Function listenSignalLiveOpened

This function lets you set up a listener that gets notified whenever a live trading strategy actually opens a position. 

Think of it as a real-time alert for when your strategy starts making trades.

You'll receive details about the trade, including the signal data like entry price and stop-loss/take-profit levels. 

It's specifically designed for live trading environments – backtesting won't trigger these notifications, so it's safe to use for things like sending alerts or automatically placing mirroring orders. No need to check the action type in the callback either; the information you need is readily available.


## Function listenSignalLiveOnce

This function lets you temporarily "listen" for specific signals coming from a live trading simulation. You provide a filter – essentially a rule – that determines which signals you're interested in. Then, you give it a function to run when a matching signal arrives. Once that function executes once, it automatically stops listening, so you don't need to worry about manually unsubscribing. It’s useful for quick, one-off checks or actions based on real-time data during a simulation run.


## Function listenSignalLiveIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything – it's not holding a position and has no scheduled actions. 

Think of it as a way to get notified when your strategy is "idle."

You'll receive these notifications only when running a live strategy; backtesting won't trigger this callback. This makes it perfect for tasks that need to happen in real-time, like logging heartbeat status, sending alerts, or mirroring orders.

The information provided with each idle event includes the current price, the trading symbol, and details about the strategy, exchange, and frame. You won't receive signal data because there's no trade happening at that moment.


## Function listenSignalLiveClosedPerSignal

This function lets you listen for when trading positions are closed in live trading scenarios. It ensures you only get notified once for each closed position, even if there's a slight chance of multiple signals for the same trade. 

It only works with live executions, so you won’t see these notifications during backtesting or replays.

The notifications are specific to each individual trade based on factors like the strategy, exchange, timeframe, trading mode, and symbol – meaning multiple strategies running won’t interfere with each other’s notifications. 

You provide a filter to specify which closed positions you're interested in, and a callback function that will be executed for those positions. The filter is checked before any deduplication happens, so it will never accidentally miss an event.

## Function listenSignalLiveClosed

This function lets you listen for when trades actually close while your strategy is running live. 

You'll get notified whenever a position closes, whether it's because of a take profit, stop loss, time expiry, or a manual closure. The notification includes details like the reason for the closure, the exact time it happened, and the profit and loss including fees and slippage.

Importantly, this only works with live executions – backtesting won't trigger these notifications. This makes it perfect for actions that need to happen in real-time, like placing mirroring orders or sending alerts. 

You provide a function that gets called with each closing event. This function can be stopped by returning the function returned by `listenSignalLiveClosed`.

## Function listenSignalLiveCancelledPerSignal

This function lets you listen for events when a live trading strategy's order is cancelled. It’s designed to prevent you from getting duplicate notifications about the same cancellation. 

Essentially, it's a safety net that ensures you only process a cancelled order once, even if something goes wrong. It only works with live trading, not when you're reviewing past data.

The filtering happens *before* the duplication check, which means your custom logic always gets a chance to see every cancellation. The listener remembers the last signal ID it processed, so any identical signals are ignored. This allows parallel strategies to run without interfering with each other. 

You provide a filter to select specific cancelled orders you're interested in, and a callback function to handle those selected events. The callback will only run once for each unique signal.


## Function listenSignalLiveCancelled

This function lets you listen for situations where a trading signal was cancelled before it ever resulted in a trade. 

Think of it as catching signals that didn't make it to execution – maybe the price moved unexpectedly, or the waiting time ran out.

It's specifically for live trading sessions using `Live.run()`, and won't trigger during backtesting. 

This makes it ideal for tasks that need to react to cancellations in real-time, like sending alerts or updating order tracking. 

The event data provides details like the reason for cancellation and a unique ID for user-initiated cancellations.


## Function listenSignalLiveActivePerSignal

This function lets you set up a listener that responds to specific events during live trading. It focuses on "active" ticks, which happen continuously while a position is open.

The listener only triggers once for each signal – the very first time a position meets your defined criteria. Think of it as a one-time alert for milestones like a trade hitting a certain profit level.

This function exclusively works with live executions; it won't be triggered by backtesting or replays.

It avoids duplicate notifications. If multiple strategies are running concurrently, they won't interfere with each other's alerts. Each strategy, exchange, timeframe, mode, and symbol combination is treated independently. Furthermore, within a single strategy, the listener only remembers the last signal it acted upon and won't repeat that signal.

The filtering logic you provide (`filterFn`) is checked *before* the de-duplication process, so any events it rejects won't be remembered and won't potentially mask later, relevant events.

You provide two things: a filter function that decides which events to consider, and a callback function that gets executed once for each matching signal.


## Function listenSignalLiveActive

This function lets you tap into the live trading activity of your strategy. It's designed to provide real-time updates on your open positions, including profit and loss (pnl) and how close the price is to your take-profit or stop-loss levels.

Think of it as a constant stream of updates as long as you have trades running.

Importantly, this function only works with live trading; it won't trigger during backtesting simulations. This makes it perfectly safe for actions that connect to external systems like sending notifications or mirroring orders. 

You provide a function (fn) that will be called with each incoming tick event. There's no need to filter the event based on action type; the data you need will be directly available.


## Function listenSignalLive

This function lets you listen for live trading signals generated by the backtest-kit framework. It's a way to get updates as a live simulation is running.

The signals are delivered one after another, ensuring you receive them in the order they happen.

You provide a function that will be called each time a new signal is available; this function handles the signal data.  Importantly, this only works with signals produced by `Live.run()`.

The function returns another function that you can call to unsubscribe from the signal stream.

## Function listenSignalIdle

The `listenSignalIdle` function lets you be notified whenever your trading strategy isn't actively holding a position. 

Think of it as getting a signal when your strategy is just observing the market – no trades are open. 

It provides data like the current price and information about the strategy itself, but importantly, the `signal` will always be null because no trade is active. 

You provide a function (`fn`) that will be called with these idle events, letting you react to periods of inactivity in your strategy. This is useful for tasks like logging, generating alerts, or conducting broader market analysis during these quiet periods.


## Function listenSignalEventPerSignal

This function lets you react to specific signals as they appear in your backtest. It's like setting up a listener that gets notified whenever a new signal comes along. You can tell it exactly which types of events you're interested in using a filter function, so you only get notified about the signals you care about. The listener is designed to avoid sending duplicates based on the signal's ID, and it handles situations where a signal might have both an opening and closing event. To stop listening, the function returns another function which, when called, unsubscribes from the events.


## Function listenSignalEventOnce

This function lets you briefly listen for specific trading events. 

It takes a filter – a way to define which events you're interested in – and a callback function that will run just once when a matching event happens. After that single execution, the listener automatically stops, preventing unnecessary ongoing processing. Think of it as a quick way to react to a particular event and then move on.


## Function listenSignalEvent

This function lets you keep an eye on what’s happening with your trading signals. You can register a function that gets called whenever a signal is either started (opened) or stopped (closed). 

It's particularly useful for understanding the reasons behind signal closures, like reaching a take-profit target, a stop-loss, or the signal's time expiring. 

The system handles these events in order, even if your callback function takes some time to process each one, ensuring nothing gets missed. This is helpful for both live trading and analyzing past performance (backtesting). You’ll receive information about the signal's lifecycle events, including when and how they were triggered.


## Function listenSignalClosedPerSignal

This function lets you keep an eye on when trading signals are closed, but in a very specific way: you'll only get notified about the closing of each *unique* signal.

Think of it as setting up a listener that reacts to the finality of a trade for each individual signal.

You provide two key pieces of information:

*   A filter – a way to choose exactly which closed signal events you want to hear about.
*   A function – this is what gets called whenever a closed signal event matches your filter. It receives all the details of that event.

The function itself returns another function that you can call to unsubscribe from receiving these closing signal updates.


## Function listenSignalClosed

This function lets you monitor when positions are closed, whether from a live trading environment or a backtest. It's useful for tracking the details of each closure. 

Whenever a position closes, you'll receive information about it, including the profit and loss, the reason for closure, and the timestamp of the event.  You provide a function (`fn`) that will be called each time a position closes, and this function receives an object containing those details. The function you provide also returns a function that you can call to unsubscribe from these closure events.

## Function listenSignalCancelledPerSignal

This function lets you keep track of when signals are cancelled, providing information specific to each signal. It's like setting up an alert system that only triggers when a signal is stopped. 

You define a filter function (`filterFn`) to specify which cancelled events you're interested in – for example, you might only want to be notified about cancellations related to a certain asset.  Then, a callback function (`fn`) is executed each time a cancelled event matches your filter.  The function returns a cleanup function that you can call to unsubscribe from these notifications when you no longer need them.


## Function listenSignalCancelled

This function lets you be notified when a trading signal is cancelled before a trade even begins. Think of it as getting alerted when something prevents a planned trade from happening. 

You provide a function that gets called whenever a signal is cancelled, and that function receives information about why the cancellation occurred. This can be useful for understanding issues with your trading strategy's signal generation.

The function returns a way to unsubscribe from these cancellation events when you no longer need them.

## Function listenSignalBacktestWaitingPerSignal

This function lets you listen for specific "waiting" events during backtesting. Think of "waiting" as the time a trade is resting, waiting for activation. 

It guarantees you only receive each signal once, even if it's waiting for a long time.  It's designed to prevent repeated notifications for the same trade.

This listener only works with backtest executions, meaning it won't trigger during live trading.

The events are filtered and deduplicated based on a combination of factors like the strategy used, the exchange, the time frame, the execution mode, and the traded symbol, ensuring that multiple strategies running simultaneously don't interfere with each other.

The provided filter function lets you specify exactly which waiting events you're interested in, and it's checked *before* any deduplication happens.

## Function listenSignalBacktestWaiting

This function lets you keep a close eye on what's happening during backtesting, specifically when a signal is waiting to be triggered. 

Imagine it as a way to see the potential impact of a trade *before* it actually happens. You'll get updates on each tick while the system is waiting for a signal to activate. 

The data you receive includes details about the signal and theoretical profit and loss (pnl), but remember, no position is open yet, so there's no actual risk involved. 

This is a high-frequency stream of data, only used for backtesting—you won’t see these events in live trading.  It's designed for detailed analysis and reporting without any interference from real-world market activity.

You just need to provide a function that will be called with each waiting event. When you're done, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestScheduledPerSignal

This function lets you react to specific results generated during backtesting, ensuring you only receive each signal's data once. It's like setting up a notification system that only sends a message for each signal once, even if the backtest generates multiple related events. 

Think of it as a safety net, making sure you don’t process the same signal data multiple times unexpectedly.

It only works with backtesting data and won’t trigger during live trading.

You can use a filter function to specify which signals you're interested in; this filter is applied *before* any deduplication, guaranteeing that rejected signals won't interfere with later matching events. The listener keeps track of which signal IDs have already been processed within a single backtest run, preventing duplicates while allowing for new signals to be recognized.


## Function listenSignalBacktestScheduled

This function lets you listen for specific events that happen during a backtest when a strategy is waiting for a market condition to be met. Think of it as being notified when a strategy places an order but hasn't yet filled – it's the moment the backtest engine begins to wait for the price to reach that level.

You'll only get these signals during backtests, not when the strategy is actively trading live. This makes it a great way to analyze backtest performance or generate reports without being affected by real-time market activity.

The information delivered to you is tailored specifically to these "waiting" events, so you don’t need to filter the events based on their type. You receive exactly what you need right away. 

To stop listening for these events, the function returns another function that you can call.

## Function listenSignalBacktestPerSignal

This function lets you tap into the stream of signals generated during a backtest. It’s designed to handle events one signal at a time, so you can react specifically to each trading opportunity. You’ll only receive signals that come from actively running a backtest. The function also automatically ignores “idle” signals where no specific action is triggered.

To use it, you provide a filter function to decide which signals you want to process and a callback function that runs whenever a filtered signal appears. The callback receives the details of the signal event. The subscription created by this function can be stopped by calling it again.

## Function listenSignalBacktestOpenedPerSignal

This function lets you listen for when a backtest starts a new trade (opens a position). 

It ensures you only get notified once for each trade signal, even if the backtest runs multiple times.

The callback you provide will only be called for events generated during backtesting, not live trading. 

To avoid accidentally missing events, the filtering happens *before* any duplicate removal, so if your filter rejects an event, it won’t affect future events.

You can specify conditions (the `filterFn`) to narrow down the events you’re interested in.


## Function listenSignalBacktestOpened

This function lets you tap into what's happening when a trading position is opened during a backtest. 

Think of it as a notification system specifically for when a strategy starts a trade – whether it's an instant decision or a planned one. You'll get details like the signal that triggered the trade, including the entry price and any stop-loss or take-profit levels. 

This is solely for backtesting; you won't see these signals during live trading, making it perfect for analyzing past performance and generating reports without getting mixed up with real-time data. It delivers events directly related to the trading action, so you don’t have to filter them. You just pass in a function, and that function will be called whenever a position opens in your backtest.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen in" on the signals generated during a backtest, but only for a single event that meets your specific criteria. Think of it as setting up a temporary alert.

You provide a filter – a condition that determines which signals you're interested in – and a callback function that will run once when a matching signal appears. Once that one event has been processed, the listener automatically disappears, so you don't have to worry about manually cleaning up. This is useful for things like quickly checking a particular market condition during a test run.

It only works with signals coming from a `Backtest.run()` execution. The `filterFn` helps you narrow down the events you care about, and the `fn` is the function that gets executed once a filtered event is detected.


## Function listenSignalBacktestIdle

This function lets you listen for moments during a backtest when your strategy isn't actively trading – it's in a period of quiet.

Think of it as a way to monitor when your strategy is just "waiting."

You'll receive notifications whenever your strategy has no open positions and isn’t scheduled to do anything, providing data like the current price and symbol.  This is particularly useful for things like keeping track of how often your strategy is idle or for generating reports specifically about backtest behavior.

Crucially, this only works during backtest runs; it won't trigger during live trading, ensuring your analysis remains clean and focused on simulated performance. The data is delivered directly to you, so you don’t need to filter events based on action type.


## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest simulation finishes for a particular signal. It ensures you only receive each signal's closing information once, even if the backtest runs multiple times.

Think of it as a way to get notified about the final result of a trading signal within a backtest—like knowing a trade is completely done.

You provide a filter to specify which closed events you’re interested in. The provided callback function is then executed only for the signals that meet this criteria and haven't already been processed.

It’s specifically designed for backtesting, so it won’t trigger during live trading. It works independently for each combination of strategy, exchange, frame, mode, and symbol, preventing interference between parallel strategies. The filter you give it runs first, so it won’t inadvertently block a future, matching event.


## Function listenSignalBacktestClosed

This function lets you listen for specific events that happen when a backtest trading simulation finishes a position. 

It’s like setting up a notification system that tells you when a trade closes, and why – whether it was due to a profit target, a stop-loss, time expiring, or a manual closure. 

You’ll get details like the closing timestamp and the realized profit or loss, accounting for fees and slippage. This is specifically for backtest simulations, not live trading, making it perfect for analyzing your strategies without getting mixed up with real-time market data. 

You don’t need to check what kind of event it is, because you'll only receive the closing event directly. To use it, you provide a function that will be called each time a position closes during a backtest. When you are done listening, the function returns another function which you can use to unsubscribe.

## Function listenSignalBacktestCancelledPerSignal

This function lets you listen for specific cancelled order events during backtesting. It focuses solely on backtest runs, ensuring live trading won't trigger it.

It makes sure you only receive each cancelled signal once, even if the backtest produces duplicates. 

The function first checks your provided filter to see if an event is relevant. Only then does it consider deduping the events, so the filter always has a chance to see every event. You give it a way to identify the events you’re interested in, and a function to execute when those events occur. This helps you react to cancelled orders in a targeted and safe way during backtesting.

## Function listenSignalBacktestCancelled

This function lets you monitor when a planned trading signal is cancelled during a backtest. 

It’s specifically for backtesting scenarios, meaning it won't trigger during live trading.

You'll receive notifications when a signal is dropped before it ever becomes a trade – essentially, before any real money is involved.

The notification tells you why the signal was cancelled (like a timeout or price movement) and, if you cancelled it manually, provides a cancellation ID.

Use this to analyze backtest results and generate reports without interference from live trading data.


## Function listenSignalBacktestActivePerSignal

This function lets you monitor the active results during backtesting, specifically designed to trigger actions only once per trading signal. It's perfect for setting up alerts or taking action the first time a trade reaches a certain milestone, like a 5% profit.

The system ensures that you only receive notifications for the initial event that satisfies your criteria. It operates solely within backtesting environments, so there's no risk of it triggering during live trading.

To prevent interference, the deduplication process operates independently for each unique backtest scenario (strategy, exchange, time frame, mode, and symbol). Your filter determines which events are even considered, and only the first matching event per signal will trigger the callback.

## Function listenSignalBacktestActive

This function lets you tap into the real-time data stream during a backtest execution. 

Specifically, it provides information about each tick while a position is open. 

You'll get details like the current profit and loss, and how close the price is to your take-profit or stop-loss levels.

This data feed is exclusive to backtesting – it won't be available during live trading, making it ideal for analyzing backtest results and generating reports without interference from live market activity. 

The data is already organized by action, meaning you don't need to filter it – you can directly access the relevant information.


## Function listenSignalBacktest

`listenSignalBacktest` lets you tap into the flow of your backtest, receiving updates as the simulation progresses. It’s like setting up a listener that gets notified whenever a signal is generated during the backtest run.

This function is specifically for events coming from `Backtest.run()`.

You provide a function (`fn`) that will be called with each event; it processes these events one after another, ensuring they are handled in the order they occur. This makes it great for tracking and reacting to the backtest's progress in a predictable way.  The function returns another function that you can call to unsubscribe from these events later.


## Function listenSignalActivePerSignal

This function lets you react to specific active signals as they happen during a backtest or live trading. Think of it as setting up a listener that's triggered whenever a position starts and meets a particular condition you define. The listener will only fire once for each unique signal ID. Because active ticks continue for the duration of a position, you’ll only get the initial event, and then the listener will stop firing for that signal.

You provide a filter function to decide which signals should trigger your callback, and then the callback function itself executes when a matching signal is active. This is useful for monitoring, debugging, or implementing custom logic related to individual positions as they unfold.


## Function listenSignalActive

This function lets you tap into real-time data about your active trades, both during live trading and backtesting. 

It sends updates every tick for each position you have open, providing information like current profit and loss, progress towards your take profit, and distance from your stop loss. 

Because it reports for *every* tick on *every* open position, you might receive a lot of events – if you only need to know when something significant happens for each position, consider using `listenSignalActivePerSignal` instead.

You provide a function that will be called with each of these active tick result events.


## Function listenSignal

This function lets you tap into the stream of trading signals generated by backtest-kit. Whenever a trade changes status – whether it's starting, running, or closing – your provided function will be called. It's designed to handle these events one at a time, even if your function needs to do something asynchronous, ensuring things don't get jumbled up. You'll receive data about each trade's state as an argument to your function, which you can use for logging, analysis, or other purposes. The function returns an unsubscribe function, allowing you to stop listening to signals when you no longer need to.

## Function listenSchedulePingPerSignal

This function lets you react to schedule ping events, which happen regularly when a trading signal is waiting to be activated. It's designed to simplify handling these events, so you only get notified once for each signal that's waiting. You provide a filter to decide which events you're interested in, and a function to execute when a matching event occurs, providing details about the signal. The function returns a cleanup function that you can use to stop listening for these events when you no longer need it.

## Function listenSchedulePingOnce

This function lets you set up a temporary listener that reacts to specific ping events. 

You provide a filter to identify which events you’re interested in, and a function to execute when a matching event arrives. 

Once that single event is processed, the listener automatically goes away, preventing unwanted ongoing reactions. It's perfect for situations where you need to respond to something happening just once.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals as they wait to become active. It sends out a "ping" every minute while a scheduled signal is being monitored. 

You can provide a function that will be called whenever a ping is received. This gives you a way to track the status of these signals and implement any custom checks you might need. 

Essentially, it’s a way to receive updates on signals that are waiting to be triggered, enabling you to monitor their progress.


## Function listenScheduleEventPerSignal

This function lets you monitor events related to scheduled signals, allowing you to react to changes in their status. It's designed to handle situations where a signal might be scheduled or cancelled. You provide a filter to specify which events you're interested in, and a callback function that gets executed whenever a new signal matches your filter.  The function helps avoid duplicate processing by ensuring each signal ID is processed only once. It returns a function to unsubscribe from the events when you no longer need to listen.

## Function listenScheduleEventOnce

This function lets you listen for specific scheduled events – like a new schedule being created or an existing one being removed – but only once. You provide a filter to identify the events you're interested in, and a function that will be executed when a matching event occurs. After that single execution, the function automatically stops listening, which is really handy when you only need to react to an event just one time. It’s a quick way to ensure something happens once in response to a scheduled action.


## Function listenScheduleEvent

This function lets you keep an eye on what's happening with your scheduled trading signals. You'll be notified when a signal is initially scheduled and when it's cancelled before it actually begins.

Think of it as a way to react to signals that are being set up or removed – for instance, if a signal is cancelled because it's too expensive or a user changed their mind. 

It's important to note that it *doesn't* tell you when a signal officially starts trading; that's handled by a different system.

The events you receive will be processed in the order they happen, ensuring things are handled predictably even if your callback function takes some time to complete.

To use it, you provide a function that will be called whenever a relevant event occurs, giving you the details of that event. The function you provide will return another function that you can call to unsubscribe from the events.

## Function listenRiskOnce

The `listenRiskOnce` function lets you monitor risk rejection events and react to them, but only once. It's like setting up a temporary alert that triggers and then disappears. You tell it what kind of risk event you're looking for, and it will call your provided function when that event happens. Once that one event is handled, the monitoring automatically stops, so you don’t have to worry about managing subscriptions. This is perfect for situations where you need to react to a specific risk condition just once.

It accepts two things: a filter function to determine which events you care about and a callback function that will be executed when a matching event is found. The function returns a cleanup function that you can use to manually unsubscribe if needed, although it typically unsubscribes itself after the first match.


## Function listenRisk

The `listenRisk` function lets you monitor when trading signals are blocked because they don't meet risk criteria.

It's designed to only notify you when a signal is *rejected* – you won't be bombarded with events for signals that are perfectly fine.

Think of it as a way to be alerted specifically to problems with your trading strategy’s risk management.

The events are handled in order, and any processing you do within the callback will be done one at a time to keep things organized and avoid conflicts.

To use it, you provide a function that will be called whenever a risk rejection event occurs, and it returns a function to unsubscribe when you're done listening.

## Function listenPerformance

The `listenPerformance` function lets you monitor how your trading strategies are performing in real-time. It allows you to subscribe to events that record the time it takes to complete different operations within your strategy. Think of it as a tool for profiling – it helps you pinpoint where your strategy might be slow or inefficient.

These performance events are delivered in order, and the callback function you provide will be executed sequentially, even if it involves asynchronous processing. This ensures that performance data is processed reliably without unexpected concurrency issues. By using this, you can easily identify performance bottlenecks and optimize your trading strategies for better speed and efficiency. You provide a function that will be called when a performance event occurs.

## Function listenPauseOnce

This function lets you temporarily react to changes in a trading system's pause state, but only once. 

Think of it as setting up a listener that responds to a specific situation (like a system being paused) and then automatically disappears afterwards.

You provide a filter to determine which pause state changes you're interested in, and a function to run when that specific event happens. The listener will execute your function just once and then stop listening, so you don't need to manage unsubscribing yourself.


## Function listenPause

This function lets you keep track of when a trading strategy is paused or resumed. It’s like setting up a listener that gets notified whenever the pause status changes. 

It's useful for things like informing users when trading is temporarily halted or restarted. 

The events you receive are processed in the order they happen, and even if your notification process takes some time, it won’t interfere with other events. It makes sure things stay orderly.

You provide a function that will be called whenever the pause state changes.


## Function listenPartialProfitAvailablePerSignal

This function lets you keep an eye on when partial profits become available for your trading signals. It sends you updates whenever a new signal reaches a partial profit level. 

To avoid getting repeated notifications for the same signal, it only reports the first profit level it sees. If you need to track every single level change for a signal, you can use the more general `listenPartialProfitAvailable` function and manage the tracking yourself, or refine your filter to focus on a specific level.

You provide a filter function to select which events you're interested in, and a callback function that will be executed when an event matching your filter occurs. The function returns an unsubscribe function that you can call to stop receiving these updates.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit condition is met during a backtest. You provide a filter to define exactly what condition you’re looking for, and a function to run when that condition occurs. Once the filter matches, your function will execute and the alert will automatically disappear, preventing it from triggering again. This is helpful when you only need to react to a particular situation once during a backtest simulation.


## Function listenPartialProfitAvailable

This function allows you to be notified whenever your trading strategy hits specific profit milestones, like 10%, 20%, or 30% profit. It ensures that these notifications are handled one at a time, even if the process of handling them takes some time. You provide a function that will be called each time a profit milestone is reached, and this function will receive information about the event. The function you provide will be executed sequentially, preventing any overlapping or confusing concurrent processes.


## Function listenPartialLossAvailablePerSignal

This function lets you keep an eye on changes to the partial loss levels for each trading signal. You provide a filter to specify which signals you're interested in, and a function to execute whenever a new signal's partial loss level changes. It’s designed to only report the initial change for each signal’s loss level, preventing repeated notifications for the same signal if multiple levels are affected. If you need to track every single level change, make sure your filter focuses on one level at a time.


## Function listenPartialLossAvailableOnce

This function lets you watch for specific situations where your partial loss level changes, but only once. You provide a rule (the `filterFn`) to define what situations you're interested in, and a function (`fn`) that will run when that situation happens. Once the rule is met and your function executes, the monitoring stops automatically, so it's great for handling one-off events. 

Think of it like setting a temporary alarm for a particular loss level condition.


## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost, but in stages. 

You provide a function that will be called whenever a loss milestone is reached – for example, when the loss hits 10%, 20%, or 30%. 

The events are handled one after another, even if your function takes some time to complete, ensuring that things happen in the right order. To avoid issues, it makes sure only one event is processed at a time.


## Function listenOrderStop

This function lets you listen for events related to order stops – specifically, when an order stop check has reached a final state.

Think of it as a notification system for order stops that have either been removed or encountered too many problems.

You provide a function that will be called whenever one of these events happens; that function receives information about the event, like why it ended (deleted or exhausted) and how many failures occurred. 

This is a 'live-only' feature, so it doesn't apply during backtesting. It's purely for observation and reacting to events – any errors in your reaction won't disrupt the automated process. If your function throws an error, it's logged and ignored, allowing the system to proceed. If your function returns a promise, the events will be processed sequentially.


## Function listenOrderReject

This function lets you monitor when orders are definitively rejected by the exchange - meaning they won't be retried. It's a notification channel, so any errors you encounter while processing these rejections won’t interfere with the trading system. 

Think of it as a safety net catching those orders the exchange won't accept.

You provide a function to handle each rejected order; this function will be called whenever an order is permanently rejected, and it's safe to use for things like sending alerts or logging events. If your handling function involves asynchronous operations, they'll be processed one after another. Because this operates in the "live" environment, it won't trigger during backtesting, as the system will bypass the exchange.

## Function listenOrderFill

The `listenOrderFill` function lets you monitor when your orders are actually filled by the broker, after they've been confirmed. It's like a final check to ensure your order went through and was acknowledged by the exchange.

This function only sends notifications when an order is successfully filled, rejected, or when an order is placed for a scheduled entry. You won't get notifications about orders that were canceled or force-closed.

Think of it as a way to be alerted when a trade really happens – it’s perfect for sending updates to external services, like a Telegram bot or an audit log.

If you provide a function that returns a promise, the processing of those order fills will happen one after another to ensure accuracy. Any errors within your function won't disrupt the overall process; they'll be recorded and handled internally.

During backtesting, these fill events are automatically considered confirmed, so you won't receive any signals.

## Function listenOrderContinue

This function lets you react to updates on ongoing orders. Think of it as getting notified when a system re-evaluates an order that's still open, either confirming it's still valid or acknowledging a temporary issue that needs further monitoring.

It works alongside a related channel that triggers initial checks. This one focuses on the result of those checks – whether the order remains active or needs more observation.

It’s important to know that this only happens during live trading, not in backtesting scenarios. Any errors within your callback function won’t stop the overall process, they'll be recorded and handled separately.

You provide a function that will be called each time this event occurs. If that function returns a promise, the processing of those results will be handled in a sequence.

## Function listenMaxDrawdownPerSignal

This function lets you keep an eye on how much your trading signals lose at their worst points. 

It’s like setting up a notification system specifically for drawdown events. You tell it what signals you’re interested in using a filter, and then it calls your function whenever a new signal experiences a drawdown that matches your criteria.

Importantly, it avoids sending you duplicate notifications; it only reports the initial drawdown for each signal, even if the losses get even deeper later on. This helps prevent you from being overwhelmed with unnecessary alerts. You essentially provide a way to choose which signals to track and a function to be executed when a drawdown event occurs for those signals.

## Function listenMaxDrawdownOnce

This function lets you set up a temporary listener for max drawdown events. You provide a filter to specify exactly which drawdown conditions you're interested in, and a function to run *once* when that condition is met. After that single execution, the listener automatically stops, so you don’t have to worry about cleaning up. It's perfect for reacting to a particular drawdown scenario and then moving on.

Essentially, it's a one-time alert for a specific drawdown event.

It takes two arguments:

*   A filter function: This tells the system which drawdown events you want to watch for.
*   A callback function: This is the function that gets executed only once when an event matching your filter occurs.

The function returns an unsubscribe function which can be called to manually stop the listener.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new maximum drawdown levels. It’s like setting up an alert that triggers whenever your strategy’s losses reach a new peak. 

Importantly, the alerts are handled one at a time, even if the processing of each alert takes some time, ensuring a smooth and predictable flow.

You provide a function that gets called whenever a new maximum drawdown is detected, allowing you to react to these milestones – perhaps adjusting risk levels or rebalancing your portfolio.  The function you provide will be automatically unsubscribed when you no longer need to listen for these events.

## Function listenIdlePingOnce

This function lets you react to periods of inactivity in your application, but only once. You provide a way to select which inactivity events you're interested in, and a function to run when a matching event occurs. Importantly, it only runs once and then automatically stops listening, so you don't need to worry about cleaning up the subscription.

Here's how it works:

*   `filterFn`: You give it a test to see if an inactivity event is the one you want.
*   `fn`: You provide the code to execute when an inactivity event passes your test.

The function returns another function to unsubscribe, in case you need to stop listening early.

## Function listenIdlePing

This function lets you listen for moments when the backtest kit isn't actively processing anything – no trades are being monitored or scheduled. 

It calls your provided function whenever a period of inactivity is detected.

The function you provide will receive an `IdlePingContract` object, which likely contains details about the event. 

Importantly, the callback is registered with queued asynchronous processing, so it won’t block the main execution flow.

When you're done listening, the function returns an unsubscribe function that you can call to stop receiving these events.

## Function listenHighestProfitPerSignal

This function lets you track the highest profit achieved for each trading signal. It sends you updates whenever a new signal reaches its peak profit. 

To avoid getting constant notifications for the same signal, it only reports the very first peak profit it finds for each signal. 

You can also use a filter to only receive updates for signals that meet specific criteria. Essentially, it's a way to monitor the best performance of your different trading strategies.


## Function listenHighestProfitOnce

This function lets you set up a listener that waits for a specific type of trading event – one that involves the highest profit. You provide a way to identify the exact event you’re looking for, and then a function to run when that event occurs. Once the event is found and the function runs, the listener automatically stops, preventing it from triggering again. It’s a handy way to react to a particular profit condition just once.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. It's like setting up a listener that gets notified whenever a new highest profit is achieved.

The events are handled in the order they happen, even if your callback function takes some time to complete. To ensure stability, it manages the callback execution in a way that prevents multiple callbacks from running simultaneously. This is great if you want to log these milestones, adjust your strategy based on profit levels, or generally keep track of performance. You provide a function to be called each time a new highest profit is detected.

## Function listenExit

This function lets you be notified when something goes critically wrong during a background process like a live trade, backtest, or walker. 

It's different from handling regular errors—these are errors that will actually stop the process.

The function ensures that when an error occurs, your code gets executed in a safe and orderly manner, preventing any potential conflicts or issues that might arise from multiple callbacks running at once. You provide a function that will be called with the error details when a fatal error happens. When you’re done listening for these errors, you can unsubscribe using the function that's returned.

## Function listenError

The `listenError` function allows you to monitor and react to errors that happen during your trading strategy's execution, but aren't critical enough to stop everything. Think of it as a safety net for potential hiccups like temporary API issues. 

It provides a way to catch these errors and deal with them without interrupting the trading process. The errors are handled one at a time, in the order they occur, ensuring a smooth and predictable workflow, even if your error handling function takes some time to complete. This helps keep your strategy running reliably even when unexpected problems arise.


## Function listenDoneWalkerOnce

This function lets you react to when a background process within your backtest completes, but in a way that only triggers once and then stops listening. You provide a filter to decide which completion events you're interested in—it's like setting up a specific condition. When a matching event happens, your provided callback function runs just once to handle it. After that, the subscription automatically ends, so you don't need to manage it yourself. 

It's helpful when you only need to act on a specific outcome of a background task.


## Function listenDoneWalker

This function lets you keep track of when background tasks managed by a walker finish processing. It's like setting up a listener that gets notified when a specific job is done.

Importantly, the notifications happen one after another, even if your callback function needs to do some asynchronous work – it ensures things don't get jumbled up. 

You provide a function as input which will be called when a walker's background execution is complete. The function you provide receives an event containing details about the completion. The function you provide also returns a function you can call to unsubscribe from the events.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. You provide a filter – a way to specify which completed tasks you're interested in – and a function that will be executed once when a matching task finishes. Think of it as setting up a listener that fires just once for a specific type of completed background operation, then automatically stops listening afterward. It's a clean way to handle events that should only be processed once during your backtesting process.

## Function listenDoneLive

This function lets you react to when background tasks within your backtest finish running. It's designed for when you need to know when those processes are done.

Essentially, it sets up a listener that gets triggered each time a background operation completes. 

The events happen one after another, even if the function you provide to handle them takes some time to finish. This ensures things are processed in the correct order and prevents issues from happening simultaneously. It queues up your handling function to avoid conflicts. You get a `DoneContract` object with each event, which will contain information about the completed task. To stop listening, the function returns another function you can call.


## Function listenDoneBacktestOnce

The `listenDoneBacktestOnce` function lets you react to when a background backtest finishes, but only once. You provide a filter – essentially a rule – to decide which backtest completions you care about. When a backtest finishes and matches your filter, a special function (your callback) gets triggered just the one time to handle it. After that, it automatically stops listening, so you won't get repeatedly notified. 

It's a clean way to process a specific backtest completion without lingering subscriptions.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s a way to react to the completion of a backtest that's happening outside of your main program flow. 

When you use it, you provide a function (called `fn`) that will be executed when the backtest is done. This is useful for tasks like cleaning up resources, displaying results, or starting the next backtest.

The framework ensures that these completion notifications happen one at a time, in the order they occurred, preventing unexpected issues if your notification function takes some time to run. It effectively queues up these completion events and handles them sequentially.

## Function listenCheck

The `listenCheck` function lets you keep track of whether your orders are still active on the exchange. It listens for "check" events related to your signals, like a constant pulse confirming the order's status.

These events happen frequently as the backtest runs, *before* the final evaluation of the trade. You'll receive two main types of events: "active" for open positions and "schedule" for orders waiting to be filled.

If something goes wrong during the check—like a temporary network issue—the backtest will try a few more times before giving up. However, if the order is truly deleted from the exchange, it will stop the backtest immediately. 

You provide a function (`fn`) to handle each check event, and it’s a way to be notified whenever the check system runs. This function will be called for each order check event and will be paused until promise resolves.

## Function listenBreakevenAvailablePerSignal

This function lets you keep an eye on when a breakeven point becomes available for a trading signal. You provide a filter to decide which signals you're interested in, and then a function that gets called whenever a new breakeven point is calculated for a signal that matches your filter. Think of it as a notification system specifically for breakeven updates related to the signals you care about. When you’re done listening, the function returns another function you can call to unsubscribe.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to specific situations where a breakeven protection is triggered. Think of it as a temporary alert—it only runs once when a particular condition you define is met. It’s perfect for scenarios where you need to take action just the first time a certain breakeven level is reached, then you want to stop listening.

You provide two key pieces: a filter that determines which events you're interested in, and a function to execute when a matching event occurs. Once that event happens, the listener automatically stops, so you don’t have to worry about managing subscriptions yourself.


## Function listenBreakevenAvailable

This function allows you to get notified when a trade's stop-loss automatically adjusts to the original entry price – that's your breakeven point. It's designed to handle situations where a trade has become profitable enough to cover the initial costs, like commissions. 

You provide a function that will be called whenever this breakeven event occurs. The system makes sure these notifications are handled one at a time, even if your provided function takes some time to complete, ensuring everything runs smoothly and in the right order.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen just before a trading backtest begins. It's designed for actions you need to perform only once at the start, like setting up initial conditions or validating data. You provide a filter to specify exactly which events you're interested in, and a callback function that will execute only the first time the event occurs. After that single execution, the subscription is automatically removed, keeping things clean and preventing unintended side effects.

## Function listenBeforeStart

This function lets you hook into what happens just before a trading strategy begins running for a specific asset. It provides a way to execute a function right before a new strategy starts, ensuring that any actions you take are done in a controlled, sequential order. The system handles this queuing automatically, so your functions won't interfere with each other even if they take some time to complete. You pass in a function as an argument, and this function will be called whenever a new strategy is about to start.


## Function listenBacktestProgress

This function lets you monitor the progress of a backtest as it runs. It provides updates during the background processing stage of a backtest. The updates are delivered one after another, ensuring that even if your callback takes some time to execute, the updates still appear in the correct order. To stop listening for updates, the function returns a cleanup function that you can call. You give it a function that will be called with progress information during the backtest.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You provide a filter – a way to select which events you're interested in – and then a function to execute when a matching event occurs. After that one execution, the function automatically stops listening, keeping your code clean and preventing unwanted repeated actions. It’s perfect for tasks like logging a final summary or performing a single cleanup action after a backtest.

## Function listenAfterEnd

This function lets you react to what happens *after* a trading strategy finishes running for a specific asset. Think of it as a notification that the engine is completely done with a particular test. 

Importantly, the notifications happen one at a time, even if your reaction code takes some time to complete—this ensures things don't get messed up by running processes simultaneously. 

You provide a function that will be called with details about the completed test whenever this event occurs. The function you provide returns a way to unsubscribe from these notifications later if needed.


## Function listenActivePingPerSignal

This function lets you listen for active ping events, but with a twist – it only calls your code once for each unique signal. Think of it as a way to react to the very first moment a specific condition is met for a monitored position. 

It's perfect for situations where you only care about the initial reaction to a condition, and don't want to be bombarded with updates as the position continues to change. You provide a filter function to decide which events you want to hear about, and then a callback function that gets executed whenever a new signal is detected that matches your filter. This subscription can be canceled whenever needed, as it returns a function that can unsubscribe.

## Function listenActivePingOnce

This function lets you temporarily listen for specific "active ping" events. You tell it what kind of event you’re looking for using a filter, and it will run a provided function *just once* when it finds a matching event.  After that one execution, it automatically stops listening, keeping your code clean and efficient. Think of it as a way to react to a single, specific occurrence of something and then move on. It’s handy for situations where you need to wait for a particular condition to be met.


## Function listenActivePing

This function lets you keep an eye on active signals within your backtest. It listens for updates, happening roughly every minute, that tell you about the state of these signals. 

Think of it as a way to track the lifecycle of your signals – when they start, when they change, etc. 

You provide a function that will be called whenever a new active ping event occurs. Importantly, this ensures that the event handling happens one at a time, even if your function takes some time to complete. This helps prevent unexpected issues when processing these updates.

## Function listWalkerSchema

This function lets you see all the different "walkers" that are currently set up within your backtest-kit system. Think of walkers as reusable components that perform specific tasks during a backtest. 

It essentially provides a list of all the configurations and actions these walkers are designed to handle. You can use this to inspect the setup, generate documentation, or even build a user interface that adapts to the available walkers. It’s handy for getting a clear picture of what's happening under the hood.


## Function listSweepSchema

This function lets you see all the different sweep configurations that are currently loaded into the backtest-kit system. Think of a sweep as a set of parameters you want to test in your trading strategy. This function essentially gives you a complete list of all those parameter sets you've defined. It's really handy if you want to check what’s going on behind the scenes, create helpful documentation, or even build a user interface that shows all your sweep options.


## Function listStrategySchema

This function lets you see a full list of all the trading strategies currently set up in your backtest. It's like taking a peek behind the curtain to understand what strategies are available for testing. You can use this to check your work, generate documentation, or create user interfaces that adapt to the available strategies. The function returns a list of strategy descriptions, providing information about each one.


## Function listSizingSchema

This function lets you see all the sizing strategies that have been set up within the backtest-kit framework. Think of sizing as how much of an asset you buy or sell – this gives you a peek at all the rules you've defined for those decisions. It's really helpful for checking things, generating documentation, or building tools that need to know about those sizing strategies. The function returns a list of these sizing configurations.

## Function listRiskSchema

This function lets you see all the risk schemas that are currently set up in your backtest. Think of it as a way to peek under the hood and understand how your risk management is configured. It returns a list of all the risk configurations you've added, making it handy for troubleshooting, generating documentation, or creating interactive displays of your risk settings. Basically, it’s your window into how your backtest assesses and manages risk.


## Function listMemory

This function helps you retrieve a list of saved memory entries associated with your current trading signal. Think of it as a way to see what data has been previously stored and is ready to be used. 

It's designed to work seamlessly within the backtest-kit framework, figuring out the active signal and whether you're in a testing or live trading environment all on its own.

To use it, you simply need to provide a bucket name to specify where the memory entries are stored. The function then returns an array, with each item containing a unique memory ID and the associated data.

## Function listMCPSchema

This function helps you see all the different models and contexts your trading system understands. It pulls together a list of all the MCP schemas that have been registered within the backtest-kit framework. Think of it as a way to inventory what your system is capable of processing – great for troubleshooting, generating documentation, or creating user interfaces that adapt to your models. It returns a list of these schemas, giving you a clear picture of the system’s configuration.

## Function listFrameSchema

This function helps you see a complete inventory of the different data structures – we call them "frames" – that your backtesting system understands. It's like a catalog of all the types of information your backtest can process, such as price data, order details, or account balances. You can use this to check that everything is set up correctly, create helpful documentation, or even build tools that react to the different types of data your backtest uses. It returns a list of these frame schemas, which you can then examine.

## Function listExchangeSchema

This function helps you discover all the different exchanges your backtest-kit setup is aware of. It fetches a list of exchange schemas, essentially telling you which exchanges are available for backtesting. This is super handy for things like checking your configuration, creating documentation, or building interfaces that adapt to the exchanges you’re using. You get an array containing information about each exchange.

## Function hasTradeContext

This function simply tells you whether the system is ready for you to perform trading actions. It checks if both the execution and method contexts are running. You need this to be true before you can safely use functions that interact with the exchange, such as fetching candle data, calculating averages, formatting prices, or getting the current date. Think of it as a "go" signal for executing trade-related operations.


## Function hasNoScheduledSignal

This function, `hasNoScheduledSignal`, quickly checks if there's currently no planned or active trading signal for a specific symbol, like 'BTCUSDT'. It's essentially the opposite of checking if a signal *does* exist.

You can use it to safely control when your trading signals are generated, making sure signals aren’t accidentally created when they're not intended. 

The function intelligently figures out if it's running in a backtesting environment or in a live trading scenario without you needing to specify it.

It takes the trading pair's symbol as input.

## Function hasNoPendingSignal

This function checks if there's an active pending signal for a specific trading pair. It returns `true` if no pending signal exists, meaning the system is ready for a new signal. Think of it as the opposite of `hasPendingSignal` - it's useful for making sure you don't accidentally generate signals when one is already waiting. It adapts to whether you're running a backtest or live trading, so you don't need to worry about that. 

You just need to provide the symbol, like "BTCUSDT," and it will tell you if it's safe to proceed with generating a signal.


## Function getWalkerSchema

The `getWalkerSchema` function helps you find details about a specific trading strategy, or "walker," that’s been set up within the backtest-kit framework. Think of it as looking up the blueprint for a particular trading approach. You simply give it the name of the walker you're interested in, and it returns a description of how that walker is configured – what data it uses, how it makes decisions, and so on. This is useful for understanding and debugging your trading strategies or integrating with other parts of the system. The name you provide must match a walker already registered in the framework.


## Function getTotalPercentHeld

This function tells you what percentage of your original position you still hold for a given trading pair. Think of it as a way to see how much of your initial investment is still actively in play. A value of 100 means you haven't closed any portion of the trade yet, while 0 means the entire position has been closed out. It handles situations where you've taken partial profits along the way, even if you've made multiple purchases (DCA). You simply provide the trading pair's symbol, and it returns a percentage representing how much is still open. It's essentially the same as using `getTotalPercentClosed`.

## Function getTotalPercentClosed

This function helps you understand how much of a trading position remains open. It tells you what percentage of your initial position is still active – for example, if it returns 50, that means half of your position hasn’t been closed yet.

It takes the trading pair's symbol as input, like 'BTCUSDT'.

The calculation takes into account any dollar-cost averaging (DCA) entries that might have been added to the position and considers partial closures.

The framework intelligently determines if it's running in a backtesting environment or a live trading scenario, so you don't need to worry about that.


## Function getTotalCostClosed

This function helps you figure out how much money you've spent on a particular trading pair, like BTC/USD. It looks at your current holdings and calculates the total cost basis, taking into account things like dollar-cost averaging (DCA) when you’ve made multiple purchases.  Essentially, it tells you the total investment amount for a position that hasn't been fully closed out. The function automatically knows whether it’s running in a backtesting or live trading environment, making it adaptable to different situations. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getTimestamp

This function provides a way to get the current timestamp within your trading strategy. 

It's context-aware, meaning it behaves differently depending on whether you're running a backtest or live trading. 

During backtesting, it returns the timestamp associated with the specific historical timeframe being analyzed. When you’re trading live, it returns the actual, current timestamp. This is useful for tracking events or synchronizing actions within your strategy.

## Function getSymbol

This function retrieves the symbol you're currently trading with, like "BTCUSDT" or "ETHUSD". It's a simple way to confirm which asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string containing the symbol.

## Function getSweepSchema

This function helps you find the specific configuration details for a sweep, which is a predefined set of test scenarios. Think of it as looking up the blueprint for a particular backtesting experiment. You provide the name of the sweep you're interested in, and the function returns a schema that describes how that sweep is set up – things like the assets being traded, the timeframe, and other critical parameters. This lets you understand and potentially modify existing sweep setups.

## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy during a backtest or live trading session. It provides a snapshot of things like queued actions, pending signals, and user interactions, essentially giving you a view of what the strategy is *about* to do.  You tell it which trading pair (like BTC-USDT) you're interested in, and it returns this snapshot for that specific pair. It figures out whether it's a backtest or a live environment all on its own.

## Function getStrategySchema

The `getStrategySchema` function helps you find details about a specific trading strategy that's been set up within the backtest-kit framework. Think of it as looking up the blueprint for a particular strategy. You give it the strategy's name, and it returns a structured description outlining how that strategy works – things like what inputs it needs and how it calculates trades. This lets you understand and potentially adjust strategies without digging directly into their code.


## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. When a strategy is paused, it won't open any new trades – the `getSignal` function won't be called, and any new trade requests are held. Importantly, any existing trades that are already open or scheduled to execute will continue to be managed as usual, like closing orders. The system automatically figures out whether it's running in a backtesting or live trading environment.

To use it, you just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT". The function will return a `true` or `false` value, indicating whether the strategy is paused for that symbol.


## Function getSizingSchema

This function lets you fetch the specific rules and logic used to determine your trade sizes. Think of it as looking up a predefined recipe for how much to buy or sell based on a given name. You provide the name of the sizing strategy you want to use, and it returns a detailed description of how that sizing strategy works. This allows you to understand and potentially customize your trading size calculations.

## Function getSignalState

The `getSignalState` function helps you retrieve a specific value associated with a trading signal. It automatically figures out which signal is active – whether it's a signal waiting to be executed or one scheduled for later. If no active signal is found, it will let you know.

This function is particularly useful for advanced strategies, like those using AI, that need to keep track of details for each trade, such as how long a trade is open or its percentage gain. 

It’s designed to work seamlessly in both backtesting and live trading environments.

You provide the trading symbol and a configuration object containing the bucket name and an initial value. The function then returns a promise that resolves with the retrieved value.

## Function getSessionData

This function allows you to retrieve data associated with a specific trading symbol that's been saved for the current backtest or live trading session. Think of it as a way to store and reuse information between candles, even if the backtest restarts. It's particularly helpful for keeping track of things like the results of complex calculations or the state of indicators that need to be remembered across multiple candles, without needing to recompute them each time. The function handles whether you're in a backtest or live trading mode automatically. You provide the symbol of the trading pair you're interested in, and it returns the stored data, or null if no data exists.

## Function getScheduledSignal

This function lets you retrieve the currently planned trading signal for a specific asset, like "BTCUSDT". 

It's designed to find out what the strategy is *scheduled* to do.

If there isn't a signal planned right now, it will tell you by returning nothing.

It cleverly figures out whether you’re running a test (backtest) or a real-time trade (live mode) without you needing to specify it. 

You just need to provide the symbol of the asset you are interested in, like you would when placing a trade.

## Function getRuntimeInfo

This function gives you a snapshot of your current trading situation. It's like checking the status of your backtest or live trading environment. You’ll get information like which symbol you're trading, the exchange being used, the timeframe, and the strategy currently active. It also tells you whether you’re running a backtest (analyzing historical data) or a live, real-time trade.

## Function getRiskSchema

This function lets you access pre-defined structures for managing different types of risk in your trading strategy. Think of it as a way to get a template or blueprint for how to track and analyze a specific risk factor. You provide the name of the risk you’re interested in, and it returns a detailed schema outlining how that risk is measured and reported. It's helpful for ensuring consistency and accuracy in your risk management process.

## Function getRemainingCostBasis

This function tells you how much money is still tied up in a particular trading pair, like BTC-USD, considering any partial closing of your position. It figures out the remaining cost basis, even if you’ve made multiple purchases (Dollar-Cost Averaging or DCA) and then sold off portions of your holdings. Essentially, it's a handy way to see what's left to account for regarding your initial investment in that asset. It works the same way as `getTotalCostClosed`.

You just need to provide the symbol of the asset you’re interested in, like "BTC-USD".

## Function getRawCandles

This function lets you retrieve historical candle data for a specific trading pair and timeframe. You can control how much data you get by specifying a limit, or define a start and end date for the period you're interested in. 

The function smartly handles different combinations of start dates, end dates, and limits, ensuring it doesn't accidentally look into the future when generating data. If you only specify a limit, the function will default to a reference point based on the current execution context.

Here's a breakdown of what you can do:

*   Specify both a start and end date along with a limit for a precise data range.
*   Provide just a start and end date to fetch all candles within that period.
*   Give an end date and a limit to retrieve data up to that date.
*   Use a start date and a limit to get candles from a certain point onward.
*   Just use a limit to get candles relative to the present.

The function requires a trading pair symbol like "BTCUSDT" and a valid candle interval, such as "1m" (one minute) or "1h" (one hour). Remember that the end date you provide must always be in the past, as the function can't look ahead in time.

## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a trading signal has been patiently waiting to be put into action. It's a quick way to see if a signal is delayed or still pending. 

If no signal is currently waiting, the function will return null, indicating that everything is proceeding as expected. 

You provide the trading symbol – like 'BTCUSDT' – to specify which signal you're inquiring about. The function then returns the time in minutes that signal has been on hold.

## Function getPositionPnlPercent

This function helps you understand how your open trades are performing financially. It calculates the percentage profit or loss on your current positions, taking into account factors like partial closes, dollar-cost averaging, potential slippage, and fees. 

If there are no open trades, it will return null, indicating no pending signal to evaluate. The function smartly figures out whether it's running in a backtest or live environment and gets the latest market price for an accurate calculation. You simply provide the trading pair symbol (like 'BTCUSDT') to get this percentage.


## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently facing on a trade that's still open. It calculates the unrealized profit and loss in dollars based on the difference between your entry price and the current market price.

It factors in all the details of your trading, including any partial closes, dollar-cost averaging, potential slippage, and trading fees, to give you a complete picture.

If there isn’t an active trade currently being held, the function will return null.

It also cleverly knows whether it's running a backtest or a live trading session and will automatically get the latest price for you. You just need to provide the symbol of the trading pair, like "BTC-USDT".


## Function getPositionPartials

getPositionPartials lets you peek at the partial profit or loss closures that have happened for a trading signal. It gives you a list of events showing how much of the position was closed, at what price, and the cost basis and entry count at the time. If no signal is active, it will return null. If partial closures haven't occurred yet, you'll get an empty list. You need to provide the symbol of the trading pair you're interested in to check.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out portions of your positions at the same price level repeatedly. It checks if the current market price is close to a previously executed partial close price.

Essentially, it's a safety check to prevent unwanted duplicate actions. 

The function looks at the existing partial close prices and calculates a tolerance range around each one. If the current price falls within that range, it means you're potentially in the same area, and the function will return `true`. If there are no partial closes yet, or the current price is too far from any existing ones, it returns `false`.

You can customize the size of the tolerance range using the `ladder` parameter, which allows setting percentages for the upper and lower bounds.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a specific trading position experienced its biggest loss. It looks at the history of a particular trading pair, like BTC/USDT, and tells you the timestamp – a precise date and time – when the price was at its lowest point for that position. If there’s no active trading signal for that symbol, it won't be able to provide a timestamp and will return null. Essentially, it's a tool to understand the risk profile of your past trades.


## Function getPositionMaxDrawdownPrice

getPositionMaxDrawdownPrice lets you find the lowest price a specific trade ever hit while it was losing money. It essentially tells you how far in the red that trade went at its worst point.

If there’s no active trade for the symbol you specify, the function will return null, indicating no data is available.

You provide the trading pair symbol (like 'BTC-USD') as input, and it returns a number representing the maximum drawdown price.

## Function getPositionMaxDrawdownPnlPercentage

This function lets you find out the lowest percentage profit or loss a specific trading position ever experienced. It essentially shows you the deepest point of drawdown for that position, expressed as a percentage of its initial capital. The function requires you to specify the trading pair symbol to look up. If no trading signal exists for that symbol, the function will return null.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand how much money you lost at the very bottom of a trade. It looks at a specific trading pair, like "BTC-USDT," and tells you the total cost in the quote currency (like USDT) at the point when the position hit its lowest value. 

If there aren't any signals currently being processed for that trading pair, the function will return null, meaning it can’t calculate that information right now. You provide the symbol of the trading pair you're interested in to get the data.


## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how much time has passed since a position experienced its biggest loss. It essentially tracks how long ago things were at their lowest point for a specific trading pair. 

Think of it as a measure of how far a position has recovered from its worst performance. 

If the position is currently at its lowest point, the value will be zero. 

If there's no active trade happening for that symbol, the function will return null. You need to provide the symbol of the trading pair you're interested in to get this information.

## Function getPositionLevels

This function helps you see the prices at which you’ve entered a trade when using a dollar-cost averaging (DCA) strategy. It gives you a list of prices, starting with the original price you bought at (priceOpen). If you’ve added more buys to average down the price, those prices will be listed after the initial one. 

If there's no active trade currently being built, this function will return nothing. If you bought once but didn’t add any more buys, you'll get an array with just the initial price. To use it, you just need to tell it the trading pair symbol, like 'BTCUSDT'.

## Function getPositionInvestedCount

This function helps you track how many times you've adjusted a trade using a dollar-cost averaging (DCA) strategy. 

It tells you the number of DCA entries made for the current signal. A value of 1 means it's the original entry, and each subsequent use of `commitAverageBuy()` increases this number.

If there's no ongoing signal to evaluate, the function returns null. 

You don't need to worry about whether you're in a backtest or live trading environment; the function handles that automatically.

You just need to provide the trading pair symbol to get this count.


## Function getPositionInvestedCost

This function helps you figure out how much money you’ve put into a specific trade. It calculates the total cost of buying the asset, considering all the individual purchase prices recorded during the trading process.

Essentially, it adds up all the costs associated with entering a position. If there's no active trade in progress, it will return null.

The function automatically adapts to whether you're running a backtest or a live trading session.

You provide the symbol of the trading pair (like BTC-USD) to see the invested cost for that particular trade.


## Function getPositionHighestProfitTimestamp

This function helps you find the exact time when a specific trade – the one for a particular trading pair like 'BTC-USDT' – reached its most profitable point. It essentially tells you when that trade was performing at its absolute best. If there aren’t any trading signals currently active for that pair, it won't be able to provide a timestamp and will return nothing. You provide the trading pair's symbol to identify the position you’re interested in.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It starts by remembering the price you bought or sold at when the position began. 

For long positions, it keeps track of the highest price above your entry price. For short positions, it finds the lowest price below your entry price.

It provides this information as a promise that resolves to a number representing the highest profit price. You won’t get a null value as long as there’s an active position. 

You just need to tell it which trading pair's position you're interested in.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trade has been in a losing position relative to its best moment. 

It calculates the number of minutes that have passed since the trade reached its highest profit.

Think of it as a way to measure how far a trade has fallen from its peak; it's similar to how much it's "drawn down."

The time is zeroed at the moment the profit was maximized.

If there's no active trade, the function will return null.

You provide the trading pair symbol, like "BTCUSDT," to tell the function which trade to analyze.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best-ever performance. It calculates the difference between the highest profit percentage ever achieved for a specific trading pair and the current profit percentage.

Think of it as a measure of how much "wiggle room" your trade still has to potentially reach its peak profitability.

If no trading signals exist for the specified symbol, it won't be able to calculate this distance and will return a null value. 

You provide the trading pair's symbol (like "BTCUSDT") to the function, and it gives you back that percentage difference.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its potential peak profit. It calculates the difference between the highest profit achieved so far and the current profit, ensuring the result is never negative. Essentially, it tells you how much room you have to grow before reaching that peak profit level. If no trading signals are active, the function won't return a value. 

You provide the trading pair symbol (like "BTC-USDT") to tell it which position to analyze.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have realistically reached a profit target, considering its highest point. It checks if achieving that profit was mathematically possible based on the trade's data.

If there's no open trade or signal for a specific trading pair, it will indicate that there's no information to analyze.

You provide the trading pair symbol as input, such as "BTCUSDT". The function then assesses if the highest price reached during the trade would have allowed it to break even.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. It tells you the highest percentage profit achieved during the position's entire lifespan, pinpointing the moment that peak profit was reached. 

If there’s no active trading signal for the provided symbol, the function won’t be able to provide a result and will return null.

You'll need to supply the trading pair's symbol – like 'BTCUSDT' – to get this information.


## Function getPositionHighestPnlCost

This function helps you understand the peak cost associated with a trading position. Specifically, it tells you the profit and loss (PnL) amount, expressed in the currency of the traded asset, that occurred when the position reached its most profitable price point. 

Think of it as finding the highest water mark of profitability for a particular trading pair. 

If there's no available signal data for the position, the function will return null.

You need to provide the trading symbol (like "BTC/USD") as input.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a particular trading position has been. It calculates the largest percentage drop from its peak profit to its lowest point.

Essentially, it tells you how far the position’s profit has fallen from its highest point.

The result is a percentage representing this drawdown.

If no trades are currently active for the specified trading pair, the function won't return a value.

You just provide the trading pair symbol – like "BTC-USDT" – and the function does the rest.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much worse your position could have gotten, measured in profit and loss. It calculates the difference between your current profit/loss and the lowest point your profit/loss reached during the backtest. Think of it as a measure of how far you fell before recovering. 

If there's no trading signal for the specified symbol, the function won’t be able to calculate anything and will return null. You need to provide the trading pair symbol, like 'BTC-USDT', to get this drawdown information.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the current signal and tells you the original estimated duration in minutes. 

Essentially, it's checking how much time was initially planned for the position to be open before it might expire.

If there’s no active signal currently, it will return null. You'll need to provide the trading symbol (like 'BTC-USDT') to check the estimation.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally entering a DCA order at a price you’ve already targeted. It checks if the current price is close enough to an existing price level you've set for your DCA strategy. 

Essentially, it prevents you from placing multiple orders very near each other, which isn't ideal.

The function takes the trading pair's symbol and the current price as input. You can also adjust the tolerance range – how close the price needs to be to be considered a match – using the `ladder` parameter. If there aren’t any existing entry levels, it will return false.


## Function getPositionEntries

getPositionEntries helps you see how your current trading strategy has been building a position. It gives you a list of the prices and costs used for each step, whether it was the initial buy or a later DCA (Dollar Cost Average) addition. If there’s no active signal, you won’t get any data. If you only made one buy, you’ll get a list containing just that one entry. Each item in the list shows the price at which the trade was executed and the amount of money spent. You provide the symbol, like 'BTCUSDT', to specify which trading pair's data you want to see.

## Function getPositionEffectivePrice

This function helps you understand the average price at which you've accumulated a position in your current trading strategy. It calculates a weighted average, considering any previous buys and partial closes. 

Think of it as a way to see your overall entry price, factoring in DCA (Dollar-Cost Averaging) if you’ve been gradually adding to your position. 

If you haven't initiated a trade, or there's no pending signal, the function will return null. It intelligently adapts to whether it's running in a backtesting environment or a live trading scenario.

You just need to provide the trading pair symbol to get this calculated price.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trading position reached its highest profit. Think of it as a countdown timer showing how long you've been losing ground from your best moment. The number represents minutes, and it starts at zero when you hit that peak.

It only works if a trade is currently active. If there's no active trade, it won't provide a value.

You provide the symbol of the trading pair (like "BTCUSDT") to get the drawdown time for that specific position.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a trading position expires. It calculates the time based on when the position was initially pending and compares it to an estimated expiration time.

The result is always a positive number, showing the remaining minutes. If there's no pending signal for that specific trading pair, it will return null.

Essentially, it's a way to keep track of your positions and be aware of any approaching deadlines.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function lets you check how long a specific trading position has been open. It calculates the total minutes the position has been active, starting from when it was initially created.

You provide the trading pair symbol (like BTCUSDT) as input.

If there isn't a pending signal for that position, the function will return null, indicating no active position to measure.

## Function getPendingSignal

This function helps you find out what signal your trading strategy is currently waiting on. 

Think of it like checking if your strategy has already made a decision to buy or sell.

It takes the trading pair symbol, like "BTCUSDT", as input.

It will give you the details of the pending signal if one exists, or nothing (null) if there isn't an active signal.

The function smartly figures out if it's running a backtest or a live trading session without you needing to specify.


## Function getOrderBook

This function retrieves the order book details for a specific trading pair, like BTCUSDT. It pulls the data from the connected exchange. 

The function takes the trading symbol as input and an optional depth parameter, which controls how many levels of the order book you want to retrieve. If you don't specify a depth, it uses a default value.

The timing of this request is managed automatically based on the current trading context, whether it's a backtest or live trading environment. The exchange might use the timing information or not, depending on the situation.

## Function getNextCandles

This function helps you retrieve a batch of future candles for a specific trading pair and timeframe. It’s designed to get data that comes *after* the current time being used by the backtest. You provide the symbol (like "BTCUSDT"), the candle interval (like "1h" for one-hour candles), and how many candles you want to retrieve. The function then uses the underlying exchange to fetch those future candles. 


## Function getMode

This function tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It's a simple way to check what environment your code is operating in. The function returns a promise that resolves to either "backtest" or "live" to indicate the current mode. You can use this to adjust your trading logic based on the context.

## Function getMinutesSinceLatestSignalCreated

This function tells you how much time has passed, in minutes, since the last trading signal was generated for a specific trading pair. It doesn't matter if that signal is still active or has already ended; it just looks at the last signal recorded. This is handy for things like setting up a waiting period after a stop-loss order is triggered.

If no signals have ever been recorded for that trading pair, the function will return null.

It automatically figures out whether it's running in a backtesting environment or a live trading environment.

You just need to provide the trading pair’s symbol, like "BTCUSDT", to use this function.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of your trading strategy. It calculates the maximum drawdown, which is the biggest drop from a peak profit to a low point. 

Essentially, it tells you the largest percentage loss your strategy could have experienced between its best performance and its worst.

You provide the trading pair symbol (like 'BTC-USDT') and it returns a number representing that drawdown percentage. If no trading signals exist, it won't be able to compute the value and will return null.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss your strategy experienced. 

Think of it as measuring the "downfall" from a peak profit point – it tells you the potential for losing gains. 

It focuses on profit and loss (PnL) cost to give you a clear picture of financial exposure. The result is zero if the strategy didn't have any losses. If no trading signals exist, it won't return a value. 

You need to provide the trading pair symbol, like "BTCUSDT," to get the drawdown distance.


## Function getMCPSchema

This function lets you access the details of a specific Model Context Protocol (MCP) that's been registered within the backtest-kit framework. Think of an MCP as a way to organize and share information about a trading model. 

You provide the name of the MCP you're interested in, and the function returns a structured description of what that MCP contains – things like the expected data format and available fields. This helps ensure consistent communication and understanding between different parts of your backtesting system.


## Function getLatestSignal

This function helps you find the most recent trading signal—whether it’s still active or has already closed—for a specific trading pair. It's a handy way to manage things like cooldown periods, ensuring you don't jump back into trading too quickly after a significant event like a stop-loss. The function looks for this latest signal first in historical data and then in real-time data, and it will return nothing if there's no signal available at all. It automatically adjusts its behavior based on whether you're running a backtest or live trading.


## Function getFrameSchema

The `getFrameSchema` function lets you find the blueprint, or schema, for a specific frame within your backtest setup. Think of a frame as a container for your data – like a candlestick chart or a time series. You give it a name, and this function finds the definition associated with that name. It’s how you access the structure and expected data types for a particular frame in your trading strategy. This is useful when you need to understand or work directly with the format of the data held within a specific frame.


## Function getExchangeSchema

The `getExchangeSchema` function lets you access the details of a specific cryptocurrency exchange that backtest-kit knows about. You give it the name of the exchange, like "binance" or "coinbase", and it returns a structured description of that exchange, including information about its markets and data formats. This schema provides a standardized way to interact with different exchanges within the backtest-kit framework. Essentially, it’s how backtest-kit understands the layout and data provided by each exchange.

## Function getDefaultConfig

This function provides you with a set of pre-defined settings that the backtest-kit uses to operate. Think of it as a starting point for how the system is configured. It lists a lot of numbers and boolean values, each controlling a specific aspect of the backtesting process, like how often it checks prices, how many candles it fetches, or how many notifications it sends. Examining these defaults helps you understand all the adjustable knobs and levers you have to fine-tune your backtesting and trading strategies.

## Function getDefaultColumns

This function provides a set of pre-defined column configurations used for generating reports. Think of it as a template for structuring the data you see in your backtesting results. 

It gives you access to default column definitions for various data types like closed trades, heatmaps, live events, and more. 

You can examine this configuration to understand what columns are available and how they're initially set up before customizing them for your specific needs. It’s a good starting point for tailoring your reports.


## Function getDate

This function, `getDate`, simply retrieves the current date. 

It behaves differently depending on whether you're running a simulation (backtest) or a live trading session. During a backtest, it will return the date associated with the specific historical timeframe being analyzed. When running live, it gives you the current, real-time date. It's a straightforward way to know what date your code is operating under.

## Function getContext

This function allows you to retrieve information about the current process running within the backtest-kit framework. Think of it as a way to peek inside what's happening behind the scenes. It returns an object that holds details about the environment in which your code is executing, like what method is being run and potentially other relevant data. You can use this information to adapt your strategies or logging based on the specific context. Essentially, it’s a snapshot of the current state.

## Function getConfig

This function allows you to view the settings used by the backtesting framework. It provides access to various parameters that control things like how often data is fetched, limits on the number of signals generated, and flags enabling different features. The returned configuration is a copy, so any changes you make won’t affect the actual running system. Think of it as a way to peek at the framework's internal settings and understand how it's behaving.

## Function getColumns

This function lets you see what columns are being used to build your backtest reports. 

It gathers information about all the different types of data displayed – things like closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled tasks, strategy events, synchronization updates, peak profits, maximum drawdowns, walker panel profit and loss, and walker strategy results.

The returned configuration is a copy, so any changes you make won't affect the original column setup. This is helpful for understanding how your data is structured and for debugging report generation.

## Function getClosePrice

To get the most recent closing price for a specific trading pair, use this function. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the time interval of the candles you're interested in. The available intervals are short, like one minute ("1m"), or longer, up to eight hours ("8h"). It will then return a promise that resolves to the closing price of the most recent candle for that symbol and interval.


## Function getCandles

This function lets you retrieve historical price data, or "candles," for a specific trading pair like BTCUSDT. 

You tell it which symbol you're interested in, how frequent the candles should be (like every minute, hour, etc.), and how many candles you want to pull. 

The function then fetches that data from the connected exchange.

The candles are retrieved starting from the most recent time available.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated fees and slippage. It looks at the current price of a trading pair and compares it to a calculated breakeven point, which factors in those costs. If the price has moved sufficiently in a positive direction, the function returns true, indicating the breakeven has been surpassed. The function intelligently adjusts its behavior depending on whether it's running in a backtesting environment or a live trading situation. You provide the trading symbol and the current price to assess.

## Function getBacktestTimeframe

This function helps you find out what date range is being used for a backtest of a specific trading pair, like BTCUSDT. It returns a list of dates, representing the start and end points of the backtest period for that symbol. You can use this to understand the historical data being used in your backtesting simulations. Essentially, it tells you what time window your backtest is analyzing.


## Function getAveragePrice

The `getAveragePrice` function helps you determine the VWAP (Volume Weighted Average Price) for a particular trading symbol. 

It looks back at the five most recent one-minute candles to figure this out.

Essentially, it's calculating the average price weighted by the trading volume – more volume at a certain price gives that price more influence.

If there's no trading volume available, the function will simply calculate the average of the closing prices instead.

You just need to provide the symbol of the trading pair you’re interested in, like "BTCUSDT".

## Function getAggregatedTrades

This function allows you to retrieve a list of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're using within the backtest-kit framework.

You can request a specific number of trades using the `limit` parameter.  If you don't provide a limit, the function will fetch trades from within a defined time window. 

The function efficiently retrieves trades, especially when a large number is needed, by paginating backwards until the desired amount is gathered.

## Function getActionSchema

Need to know what an action's structure is? `getActionSchema` lets you look up the definition of a specific action by its name. This function is handy when you want to understand the expected inputs and outputs for a particular action within your backtesting setup. It returns a schema object describing that action, making it easy to work with and validate data. You provide the action's unique identifier as input, and it provides the blueprint.

## Function formatQuantity

This function helps you display the right amount of a trading asset, like Bitcoin or Ethereum, by following the specific rules of the exchange you're using. It takes the symbol of the trading pair (like "BTCUSDT") and the actual quantity you're dealing with. The function then converts this quantity into a properly formatted string, ensuring the correct number of decimal places are shown, based on the exchange's standards. It's essentially a shortcut to make sure your displayed quantities look accurate and professional.


## Function formatPrice

The `formatPrice` function helps you display prices correctly for different trading pairs. It takes the trading pair symbol, like "BTCUSDT," and the raw price value as input. The function then uses the specific formatting rules defined for that exchange to ensure the price is shown with the correct number of decimal places. This avoids confusion and provides a consistent display for your users.

## Function dumpText

The `dumpText` function lets you send raw text data, like logs or debugging information, associated with a specific signal. Think of it as a way to permanently store snippets of information tied to a particular trading event. 

It handles the technical details of figuring out which signal you're working with, whether you're in a backtesting simulation or a live trading environment. You just provide the text content along with a descriptive label. This function ensures the information is stored safely and reliably for later review or analysis.

## Function dumpTable

This function helps you display data in a clear, table format. It takes an array of objects and turns them into a readable table that's linked to the current trading signal. 

It intelligently handles whether you're running a backtest or a live trading session, and it automatically figures out the correct signal to associate with the table. The table's column headers are created based on all the different keys found within your data, ensuring a complete and organized view. You just need to provide the data itself, a bucket name, a unique dump ID, a description, and the array of objects to be displayed.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data, structured as a simple set of key-value pairs, associated with a specific data bucket and a unique identifier. Think of it as archiving a snapshot of information for later review or analysis. It handles the details of which signal to attach the data to, figuring it out automatically based on the environment it's running in – whether it’s a backtest or a live trading session. You provide a description to help you understand what the record represents when you look at it again.


## Function dumpMCPStatus

This function helps you create a snapshot of the Model Context Protocol (MCP) status, essentially a record of what's happening during a trading simulation or live execution. It automatically figures out the signal it’s tied to and whether you’re in a backtest or live trading environment.

The function generates a report, typically saving text messages directly into a Markdown file and including any images found within the messages as linked images. If you want to suppress this report or just keep a simple text-based record, there are options for that too.

It takes a data transfer object (`dto`) containing the bucket name, dump ID, a list of MCP messages, and a description for the snapshot. The output is saved in the specified location, providing a detailed view of the MCP status at a particular moment.


## Function dumpJson

The `dumpJson` function helps you output a complex object as a nicely formatted JSON string, specifically for use within a trading signal. It’s designed to make debugging and understanding data flows much easier.

It automatically handles whether the code is running in a backtest or live environment, and resolves the signal that's currently being processed.

You provide the function with the data you want to display – this includes the signal's bucket name, a unique identifier for the dump, the actual JSON data, and a short description to explain what the JSON represents. The function then generates the JSON output within a fenced code block, making it directly usable in reports or logs.


## Function dumpError

The `dumpError` function is a handy tool for reporting errors within your trading strategies, especially during backtesting or live trading. It allows you to associate an error message with a specific data bucket and dump ID, providing context for debugging.  It automatically figures out whether you're running a backtest or live trading based on the current environment, and conveniently resolves the active signal, saving you from manually managing signal state. Essentially, it helps you pinpoint and understand exactly where errors occur within your trading system.

The function takes a single object as input, which contains the bucket name, dump ID, the error message content, and a descriptive explanation of the error.  It then asynchronously sends this information for logging or analysis.


## Function dumpAgentAnswer

This function helps you save a complete record of an agent's conversation. It takes all the messages exchanged – think of them as a transcript – along with a description for context. 

The function automatically figures out which signal the conversation belongs to and whether it's a backtest or a live trading environment, so you don’t have to worry about those details.  You provide the messages, a unique identifier (`dumpId`), a bucket name for storage, and a brief description.  Essentially, it’s a way to archive agent interactions for later review or debugging.


## Function createSignalState

The `createSignalState` function helps you manage the state of a trading signal, making it easier to track and update values during your backtesting or live trading sessions. It automatically figures out whether you're in backtest or live mode, so you don’t have to worry about manually specifying it.

Think of it as a handy tool for strategies that need to gather information over time, like measuring metrics for each trade.

This is particularly useful for complex strategies that react to market conditions and accumulate data, such as those used in sophisticated AI-driven trading systems. For example, you might use it to track how long a trade is open and its percentage gain before deciding when to exit.


## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price level. 

It simplifies the process of setting a take-profit by figuring out the correct percentage shift from the original take-profit distance. 

The framework automatically handles the environment (whether you're backtesting or trading live) and gets the current price to make the calculation. 

You just need to provide the trading pair symbol and the new take-profit price you want to set.


## Function commitTrailingTake

This function helps you fine-tune your take-profit levels for existing pending orders. It adjusts the distance between the current price and your take-profit based on a percentage shift, always referencing the original take-profit level you initially set.

It's designed to prevent small errors from building up over time, which could lead to unexpected results.

The function prioritizes more conservative take-profit levels: if you try to make your take-profit more aggressive (further from entry), it will only do so if the new level is already closer to the entry price than the existing one.

For long positions, it only allows you to move the take-profit closer to the entry price.  For short positions, it only allows it to move further away.

It also figures out whether you’re in backtesting mode or live trading automatically.

You need to provide the trading symbol, the percentage adjustment you want to apply, and the current market price to check.


## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss, regardless of the percentage it was initially set at. It simplifies updating your stop-loss by automatically calculating the necessary percentage shift based on how far it was originally placed from the entry price. The system handles determining whether it's running in a backtest or live trading environment, and it also gets the current market price to ensure accurate calculations. You just need to provide the symbol you're trading and the absolute price you want the stop-loss to be. It returns a promise that resolves to a boolean, indicating success or failure.


## Function commitTrailingStop

The `commitTrailingStop` function lets you dynamically adjust the stop-loss distance for your trading signals. 

It's designed to fine-tune your risk management by moving your stop-loss closer or further away from your entry price. Remember, it always calculates adjustments based on the *original* stop-loss distance you set initially, which prevents compounding errors over time.

You can tighten your stop-loss using a negative percentage shift or loosen it with a positive one. 

Importantly, the function intelligently prevents you from accidentally tightening your stop-loss too much - it only adjusts to a more protective position, and always respects whether you’re in a long or short trade (for longs, it only allows a higher stop-loss, and for shorts, only a lower one). It also figures out whether it’s running in a backtest or a live trading environment automatically.


## Function commitSignalNotify

This function lets you send out informational messages about your trading strategy's decisions. Think of it as a way to leave notes for yourself or trigger external alerts without actually changing your positions. It’s perfect for highlighting important events happening within your strategy, like when a specific indicator crosses a certain level.

The function automatically knows whether you're in backtesting or live trading mode, and it pulls in details like your strategy's name and the exchange you're using. It will also get the current price for you. You just need to specify the trading symbol and optionally add extra information to your notification.


## Function commitPartialProfitCost

This function lets you automatically close a portion of your trading position when you've reached a specific profit level, measured in dollars. It simplifies the process by calculating the percentage of your position to close based on the dollar amount you specify. Essentially, you tell it how much profit in dollars you want to secure, and it handles the rest, ensuring the price is moving in a favorable direction toward your take profit target. The function knows whether it's running in a backtest or live trading environment and automatically gets the current price to execute the partial close. You just need to provide the trading symbol and the dollar amount you want to lock in.

## Function commitPartialProfit

This function helps you automatically close a portion of your open trades when the price is moving in a profitable direction, essentially moving you closer to your take profit target. You specify the symbol of the trading pair and the percentage of the position you want to close – for example, closing 50% of the trade. It intelligently determines whether it's running in a backtesting environment or a live trading account, so you don't have to worry about that. This allows for taking profits and managing risk without constant manual intervention.


## Function commitPartialLossCost

This function lets you partially close a trading position when you're experiencing a loss, but want to do it in a simplified way. It takes a dollar amount as input, which represents how much of your position you want to close, and automatically figures out what percentage of your investment that represents. Think of it as a quick way to move toward your stop-loss level.

The function will handle the details of executing this partial close, including checking the current price and adapting to whether you're in a backtesting or live trading environment.

You just need to specify the trading symbol and the dollar amount you want to use to close a portion of your position. It assumes the price is trending in the direction of your stop loss.


## Function commitPartialLoss

The `commitPartialLoss` function helps you automatically close a portion of your open trade when the price moves in a way that suggests it's heading towards your stop-loss level. It allows you to manage risk by taking profits or reducing losses incrementally. 

You specify which trading pair you're dealing with and the percentage of the position you want to close – it must be a value between 0 and 100.  

The function cleverly figures out whether it's running in a simulated backtest environment or a live trading scenario. 

Essentially, it's a tool for a more nuanced approach to trading, letting you react to price movements in a targeted way.


## Function commitCreateTakeProfit

This function tells the system that a take-profit order for a position has been executed on the exchange, even if it wasn't triggered by the usual VWAP-based calculation. It's used to handle situations where the order filled due to a price movement, like a candle reaching a high or low.

The system knows that the strategy and the exchange operate independently. The framework calculates take-profit targets based on VWAP, but the actual order might be filled at a different price.

When this function is called, the system will acknowledge the closed position and specify "take_profit" as the reason for the close on the next update.  If there isn’t a pending signal, nothing happens.

It automatically knows whether it’s running a backtest or a live trading session.

You provide the trading symbol to identify the position, and you can optionally add a note or reference ID with the `payload` for tracking purposes.

## Function commitCreateStopLoss

This function lets you tell the backtest framework that a stop-loss order has been executed on the exchange, even if it wasn't triggered by the standard VWAP check. It's used when the exchange fills the order at a price dictated by market conditions like a high or low point.

The function informs the system about this closure, associating it with a "stop_loss" reason. If no related pending signal exists, it simply does nothing. The framework automatically recognizes whether it's running a backtest or a live trading scenario.

You can optionally provide extra information with the function call, such as a commit ID or a note to document why the stop-loss was triggered.

## Function commitCreateSignal

This function lets you inject custom trading signals into the backtest or live environment, bypassing the standard signal retrieval process. Think of it as a way to manually trigger a trade based on your own logic.

You provide the trading symbol and a data object (`dto`) containing the signal details.  A price target can be optionally included - if you provide one, the trade will execute immediately if the target is met, otherwise it waits for the price to reach that level.

The function checks to make sure your signal is valid and that no other signals are already pending to prevent conflicts. It dynamically adjusts based on whether you’re running a backtest or live trading session.

## Function commitClosePending

This function lets you finalize a pending signal, essentially closing out a position that was previously set to be managed. Think of it as acknowledging and completing a trade that was already in progress. Importantly, it doesn't interrupt the overall strategy – it won't halt signal generation or affect any other scheduled actions.

You can optionally include details like a transaction ID or a note with this action to keep your records clear. The framework automatically figures out whether you're running a backtest or live trading session. 

It’s a way to manage and resolve pending trades while maintaining the flow of your trading strategy.


## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy's overall execution. Think of it as a way to postpone a planned action. 

It removes the signal that was waiting for a specific price to trigger, ensuring your strategy can continue to generate and evaluate new signals. Importantly, this won't affect any signals that are already active, and it won’t pause your strategy; it will just clear out the pending one. 

You can optionally include information like an ID and a note along with the cancellation, which can be useful for tracking and understanding your trading decisions. The function intelligently adapts to whether it's running in a backtesting environment or a live trading setting.


## Function commitBreakeven

This function helps you manage your risk in a trade by automatically adjusting your stop-loss order. It shifts the stop-loss to your entry price – essentially making it a zero-risk position – once the price has moved favorably enough to cover the fees and a small slippage buffer.

The function handles the specifics of the threshold calculation for you. It also figures out whether you’re running a backtest or a live trade and grabs the current price, so you don’t need to worry about those details. You just need to specify the trading pair (like BTCUSDT).


## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new purchase to a trading position, helping to average out your entry price over time. It essentially records a purchase at the current market price and keeps track of the average cost of all your buys. 

The function handles the details of determining whether you're in a backtest or live trading environment and automatically gets the current market price. You just need to provide the symbol of the trading pair. Optionally, you can also specify a cost. This function also signals to the system that a new average buy has been committed.


## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits your target.

Think of it as a way to say, "Hey, this signal should be activated now, even though the price hasn't quite reached the level we expected."

It's useful if you need to react to a signal immediately, regardless of the exact price.

The function automatically adapts to whether you're running a backtest or a live trading environment.

You can optionally include information like a signal ID and a note with your manual activation.


## Function checkCandles

The `checkCandles` function verifies if your historical candle data is already available and correctly positioned within your storage system. It efficiently checks for the existence of candles without needing to load the entire dataset. This process utilizes a ranged read approach, where the storage adapter determines if a candle exists for each expected timestamp, providing a quick confirmation without unnecessary data retrieval. If even one candle is missing or out of place, the function will report a miss.

## Function cacheCandles

The `cacheCandles` function helps to make sure your trading system has the historical candle data it needs. It focuses on a specific trading symbol, time interval, and date range. It works by first checking if the data already exists, and if not, it automatically downloads and verifies the missing data to ensure accuracy. This two-step process – checking then warming – is performed with a single attempt to retrieve the data, streamlining the data acquisition process. You provide details like the symbol, interval, date range, and exchange name to this function, and it handles the rest.

## Function addWalkerSchema

This function lets you register a new "walker" to use with backtest-kit. Think of a walker as a way to run multiple trading strategies against the same data and then compare how well they did. 

Essentially, it sets up the framework to systematically test and evaluate different strategies side-by-side.

You provide a configuration object, which defines how the walker will execute the backtests and what metrics will be used to judge the strategies' performance. This allows for a structured and comparative analysis of different trading approaches.


## Function addSweepSchema

This function lets you define and register a sweep, which is a powerful way to test and optimize trading strategies. Think of it as a systematic way to explore different combinations of trading parameters and see how they perform. 

The sweep runs a simulation, evaluating each parameter combination across a range of market conditions. It essentially tests your trading ideas by running them through a single candle and analyzing the results. 

It automatically learns which accounts to allow or block during the simulation, and it calculates performance based on the chosen parameters.  If you don't specify all the parameters, the framework will use sensible defaults.

## Function addStrategySchema

This function lets you register a new trading strategy with the backtest-kit framework. Think of it as telling the system about a new way you want to generate trading signals. When you register a strategy, it will automatically be checked for common errors like invalid prices or issues with stop-loss orders. The framework also helps prevent your strategy from sending too many signals too quickly and ensures that your strategies can safely handle unexpected interruptions, especially when running live. You provide a configuration object describing your strategy, and that's all it takes to incorporate it into the system.


## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as registering a strategy for deciding how much to invest in each trade.

You provide a sizing schema, which outlines the method used to calculate position size—whether it's based on a fixed percentage of your capital, a Kelly Criterion approach, or using Average True Range (ATR) – along with details like risk tolerance and position limits. The schema also allows you to define callbacks to respond to key events during the sizing calculation process. Essentially, it’s how you customize how your trades are sized within the backtest.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. Think of it as defining the rules and boundaries for your strategies to operate within. 

It's used to register a risk management configuration, which controls things like the maximum number of positions you can hold at once and allows for complex, custom checks on your portfolio – like monitoring correlations between assets. 

Importantly, multiple trading strategies can share a single risk management setup, allowing for a broader view of overall risk across your portfolio. The system keeps track of all open positions, which you can access and use to make risk-related decisions.

## Function addMCPSchema

This function lets you connect your trading strategies to an external system, often referred to as an MCP agent. Think of it as building a bridge that allows another program to observe your strategy's performance and even send trading commands. 

You provide a configuration object that describes how this connection should work. 

The MCP allows the agent to see the current state of your strategies, and it's the way you'll get position commands.  If you don't customize it, the system will generate simple text messages summarizing trades for each symbol.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe it can use. Think of it as defining how your data will be sliced up into trading periods – for example, daily, weekly, or monthly. You provide a configuration object that describes the start and end dates for your backtest, the interval (like 1 day or 1 week), and a special function that will handle any events that happen during timeframe generation. This allows you to customize the way the backtest kit creates the time-based data it needs.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for trading, like Binance or Coinbase. Think of it as registering where the system will pull historical price data and other essential information.  You'll provide a configuration object – essentially, a blueprint – that defines how the framework should interact with that specific exchange. This setup allows the system to fetch candles, format prices, and even calculate VWAP (a common trading indicator) based on recent price action. By adding these exchange schemas, you’re tailoring the backtest-kit to your specific trading needs and data sources.


## Function addActionSchema

This function lets you connect your backtest-kit framework to external systems or custom logic through actions. Think of it as a way to plug in things that react to events happening during your trading strategy's backtest.

These actions are triggered by events like signals, profit/loss updates, and breakeven points. They are versatile; you can use them to manage state in tools like Redux, send notifications via Telegram or Discord, log events, track analytics, or just run custom code whenever something important happens in your backtest. 

Essentially, you define how your backtest interacts with the outside world by registering these action handlers. You pass in a configuration object that tells the framework what action to execute and when. Each action gets its own instance for every combination of strategy and timeframe it's used in, meaning it receives all the relevant data from that specific run.
