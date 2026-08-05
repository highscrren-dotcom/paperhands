---
title: private/classes
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


# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps you organize and check the configurations used for parameter sweeps, which are essential for optimizing trading strategies. It acts like a central hub for managing these configurations, ensuring they're set up correctly before you begin testing.

You can register new parameter sweep configurations using `addWalker`, and then use `validate` to double-check that a specific configuration and its linked strategies, risks, and actions all exist and are valid. The service also keeps track of previously validated configurations to speed up the process. 

If you need a complete overview of all the available parameter sweep configurations, the `list` function provides a handy way to see them all at once.

## Class WalkerUtils

WalkerUtils provides tools for working with walkers, which are essentially automated trading strategies. It simplifies the process of running and managing these strategies by handling details like logging and data retrieval. Think of it as a helper class that makes it easier to execute and monitor your trading setups.

The `run` function is your primary way to execute a walker, allowing you to step through its calculations and receive updates. If you just need to trigger a walker for a specific purpose – like logging or callbacks – you can use `background` to run it in the background without directly observing the results.

If you need to halt a walker's activity, `stop` allows you to interrupt the generation of new trading signals while letting existing ones finish gracefully. To retrieve the collected data from all strategies within a walker, `getData` consolidates the information.  You can then use `getReport` and `dump` to generate and save a report summarizing the walker's performance, customizing the data displayed.  Finally, `list` provides a quick overview of all currently active walkers and their states.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different "walker" schemas, which are essentially blueprints for how a walker behaves. 

It uses a special system to store these schemas in a way that helps prevent errors related to incorrect data types.

You can add new walker schemas using the `addWalker()` function (referred to as `register` in the code) and easily find them again by their name using the `get` method.

Before adding a new schema, `validateShallow` checks to make sure it has all the necessary components in the correct format.

If you need to change an existing schema, the `override` function lets you update only specific parts of it without replacing the entire schema.

The service also has internal components related to logging and data management, but you'll mainly interact with the methods mentioned above.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for updates from the optimization process and records important details like metrics and statistics. 

Think of it as a detailed logbook for your strategy experiments.

It allows you to monitor progress, identify the best-performing strategies, and compare different parameter settings.  The service ensures you aren’t accidentally subscribed to updates multiple times.

You can subscribe to receive these updates, and it will provide a way to stop listening when you're done.  Unsubscribing gracefully ensures no further data is recorded.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they run. It keeps track of how each strategy performs during a simulation or live trading session, gathering results and storing them efficiently. 

This service listens for updates from your trading simulations, compiling the data into easy-to-read markdown tables that compare the performance of different strategies. You can then find these reports saved on your computer, organized by walker name.

You can subscribe to receive these updates and later unsubscribe to stop the process. The service also offers convenient methods to retrieve specific data points, generate complete reports, and clear out old results to keep things tidy. Finally, there's a function to completely wipe the accumulated data, either for a single walker or all of them.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of trading strategies, often called "walkers," within the backtest-kit framework. It builds upon a private service to automatically pass along important information like the strategy name, exchange, frame, and walker identifier, making it easier for your strategies to access these details without explicit configuration.

Think of it as a helper that makes sure your trading strategies have the information they need to run correctly, while also keeping things organized.

It has a `run` method that's central to this process; you provide a symbol (like a stock ticker) and some context, and it handles the actual execution of the trading logic. This is how you trigger the backtesting of multiple strategies for a particular symbol.

Essentially, it handles the behind-the-scenes work of setting up and running your trading strategies.


## Class WalkerLogicPrivateService

This service manages the process of comparing different trading strategies, often referred to as a "walker" comparison. It orchestrates the execution of each strategy and keeps you informed about the progress along the way.

The service will provide updates as each strategy finishes running, allowing you to monitor its performance.  It also continuously tracks the best-performing metric seen so far. 

Ultimately, it compiles the results of all strategies into a final report, ranking them based on their performance.  It utilizes other internal services to handle the actual backtesting and markdown generation for the results.

To start a comparison, you'll provide the symbol to trade, a list of strategy names, the metric you want to optimize for, and details about the environment. The `run` method then executes the strategies one by one and gives you updates for each.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with walker functionality within the backtest-kit. It provides a straightforward way to access and manage different services involved in the walker process, making it easy to integrate into your applications.

This service relies on several other services like those responsible for logging, walker logic, schema handling, and validation across strategy, exchange, frame, walker, risk, and action components. 

The `validate` function ensures the walker and its associated strategy configurations are correct, performing checks to protect against potential errors. This validation is intentionally repeated for extra safety.

Finally, the `run` method lets you execute a comparison for a specific symbol while passing along important details about the walker, exchange, and frame being used.

## Class TimeMetaService

TimeMetaService helps track when candles happen for your trading strategies. It keeps a record of the latest timestamp for each symbol, strategy, exchange, and timeframe combination, ensuring you always know the current candle time.

It's particularly useful when you need to know the current time outside of the normal tick execution, like when running commands between ticks. 

Essentially, it acts like a central registry for candle times.

If you’re running a strategy, the timestamp information is automatically updated. You can quickly check if a timestamp exists or retrieve the latest one, waiting briefly if necessary.

To keep things clean, you can clear out these stored timestamps – either all of them or just for specific strategies – to prevent using outdated data. This is especially important at the beginning of a backtest or live trading session.

## Class SystemUtils

The `SystemUtils` class helps keep your backtest sessions isolated from each other. It's designed to prevent one backtest from accidentally affecting another, which is crucial for reliable results.

Essentially, it lets you temporarily disconnect all subscriptions to global event listeners.

This creates a clean slate for each test.

The `createSnapshot` method is key to this process. It takes a snapshot of the current event listener configuration. This allows you to revert back to the original state later, ensuring everything is restored after the session finishes. Think of it as creating a save point before making changes.

## Class SyncUtils

SyncUtils helps you understand and analyze the lifecycle of your trading signals. It gathers and presents information about signal openings and closures.

Think of it as a tool to track how your strategies perform and identify any patterns or issues.

It pulls data from a system that records signals—when they start and when they end—and summarizes them.  You can request specific data points, such as the total number of signals opened or closed, or request a detailed report.

The report itself is a well-formatted markdown document showing a table of signal events, including important details like entry/exit prices, profit/loss, and reasons for closing positions.

Finally, SyncUtils can automatically save these reports to files, making it easy to review past performance or share insights.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals by recording important events. It essentially listens for signals being opened and closed, which often relate to orders being placed and exited.

It saves these events as detailed records, including information about the signal itself and how it performed (like profit and loss).

Think of it as a detailed logbook for your trading activity.

You can tell it to start listening for these events with `subscribe` and stop with `unsubscribe`. The `subscribe` function makes sure you don't accidentally set up multiple listeners, which could cause problems.  The `loggerService` is there to help with debugging, and `tick` is the core part that actually processes the signal events and writes them to the report.

## Class SyncMarkdownService

This service helps you create and save reports about how your trading signals are working. It keeps track of signal events—when signals open and close—for each of your trading strategies.

Think of it as a detailed logbook for your trading.

You can tell it to start listening for these signal events, and it will organize the information into tables that show the entire lifecycle of each signal. It will also provide some overall statistics, like the total number of signals, opens, and closes.

You can then save these reports to files, which is useful for analyzing past performance and identifying areas for improvement. The reports are automatically named with details about the symbol, strategy, exchange, and whether it's a backtest or live run.

Importantly, you can clear the recorded data, either for a specific trading setup or everything at once.  There’s also a way to subscribe and unsubscribe to receive these signals, making sure you aren't accidentally accumulating data unnecessarily.

## Class SweepValidationService

This service keeps track of all your sweeps—those sets of data used for backtesting—and makes sure they're valid whenever they're used. It acts like a safety net, checking that each sweep actually exists and that its exchange setup is correct.

When you create a new sweep, you register it with this service. It won't let you register the same sweep name twice.

You can use the `validate` function to manually verify a sweep's existence and exchange setup. Importantly, it's designed to be efficient, so it only runs the validation check once for each sweep name.

If you need to see all the sweeps that are currently registered, the `list` function will give you a list of their schemas. 

The service relies on other components – a logger for recording activity and an exchange validation service for checking the exchange aspects of the sweep.

## Class SweepUtils

SweepUtils helps you explore and compare many different trading strategies simultaneously, like running a whole bunch of experiments at once. It takes a collection of trading ideas and systematically tests them under various conditions, giving you a comprehensive overview of their potential.

Essentially, it runs each idea once, evaluating its performance across a predefined grid of parameters. Think of it as a way to quickly see which strategies seem most promising based on their historical performance.

Here's what you can control:

*   **Exit Strategies:** You can fine-tune how trades are exited, including setting stop-loss percentages, trailing take-profit levels, and time limits.
*   **Entry Rules:** Every idea gets a chance to enter a trade – there are no initial restrictions.
*   **Author Grading:**  It analyzes how well each author's ideas perform, tracking profit, losses, and hit rates, but doesn't determine who's "best" – that's up to you.

The system produces a detailed report, ranking the best-performing strategies based on metrics like Sharpe ratio, Sortino ratio, profit, and recovery. The report also provides a breakdown of each strategy's performance, showing trade-level details.

The `run` function is the core of the framework. It takes a set of trading ideas and parameters, executes the simulation, and provides a report with rankings and performance details. Keep in mind that the system filters out some ideas – those from other symbols, neutral ideas, and duplicate submissions.  Finally, the sweep will select candidates, and a final test in a backtesting engine is the ultimate judge for chosen parameters.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage sweep schemas, which define how data is organized and processed. It's like a lookup table for these schema definitions.

It ensures a basic level of correctness when schemas are added, checking for essential information. When your application needs to work with a sweep, it uses this service to find the appropriate schema.

You can add new schemas using the `register` method, which replaces any existing schema with the same name. The `override` method allows you to make changes to an existing schema, combining the new information with the original.  And, of course, you can retrieve a specific schema using the `get` method. 

The service also has a logger, and an internal registry and validator for managing the schemas.

## Class SweepGlobalService

This service acts as the main access point for running sweeps. It checks that the sweep being requested actually exists and is compatible with the exchanges you're using. 

Think of it as a gatekeeper – it ensures everything is in order before passing the request on to the part of the system that actually performs the sweep calculations.

It uses other services to handle connection management and validation, keeping things organized.

The `run` function is the key method. You give it a symbol, a sweep name, and a list of ideas, and it will execute the complete sweep simulation, including filtering, evaluation, and ranking.

## Class SweepCoreService

The SweepCoreService acts as the central engine for running sweep simulations. It verifies that the necessary conditions are in place – ensuring the sweep reference exists and that the exchange dependencies are met. 

It then passes the simulation request onto a connection service that manages specific sweep instances.

The core components it relies on are a logger for tracking activity, a connection service to handle sweep instances, and a validation service to check the sweep's prerequisites.

The `run` method is the key entry point for initiating a sweep.  It takes a symbol, sweep name, and a list of ideas, and orchestrates the complete simulation process, which involves checking profiles, filtering ideas, evaluating grid performance, and calculating rankings.


## Class SweepConnectionService

The SweepConnectionService manages and provides access to sweep configurations, acting as a central connection point for sweep operations. It essentially handles creating and caching instances of ClientSweep objects, ensuring efficient reuse of configurations.

When you need to work with a specific sweep, this service retrieves the appropriate ClientSweep – it will create it the first time you ask, and then remember it for future use.

The service provides a `run` method that lets you execute a complete simulation for a given symbol, encompassing multiple stages like profiling, filtering, grid evaluation, and ranking.

If you need to refresh the sweep configurations, you can clear the cached ClientSweep instances; this forces the system to re-read the configuration and rebuild the clients from scratch. You can clear all of them or just a specific one.

## Class StrategyValidationService

This service helps you keep track of and verify your trading strategies. It acts as a central place to register your strategies, making sure they exist before you try to use them. 

Think of it like a librarian for your strategies: it organizes them and checks they’re correctly configured.

The service performs checks on strategies, including their risk profiles and any actions they use. To make things faster, it remembers the results of these checks, so it doesn't have to repeat them unnecessarily. 

You can add new strategies using `addStrategy`, validate existing ones with `validate`, and see a complete list of all registered strategies using `list`. It relies on other services like `riskValidationService` and `actionValidationService` to handle those specific validations.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. Think of it as a reporting and statistics tool for your strategies. It gathers information about events like when a strategy cancels a scheduled action, takes profit, or hits a stop-loss.

You can use it to get summarized data showing the frequency of different strategy actions. It can also create nicely formatted reports in Markdown format, which includes tables of all events with details like the price, action taken, and timestamps.  Finally, it can save those reports to files on your computer, making it easy to review performance history.

Essentially, it acts as a central place to pull together and present the data collected by the strategy management system. You can request reports for specific symbols, strategies, exchanges, and timeframes, and even customize the columns included.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're consistent and well-defined. It’s like a central library for strategy designs.

You add new strategy blueprints using `addStrategy`, and can find them again by their name using `get`. 

Before a new strategy blueprint is added, `validateShallow` checks it to make sure it has all the necessary components and they are the expected types.

If a strategy blueprint already exists, `override` lets you update parts of it without replacing the whole thing.

The service uses a specialized storage system to safely manage these blueprints.

## Class StrategyReportService

This service is designed to keep a detailed record of what your trading strategy is doing, specifically focusing on events like canceling signals, closing positions, taking partial profits or losses, and adjusting stop-loss and take-profit levels. It's like an audit trail for your strategy.

To start using it, you need to “subscribe” to the service, which sets things up to begin logging events.  Then, as your strategy performs actions, you’ll use the provided functions – like `cancelScheduled`, `closePending`, `partialProfit`, etc. – to record each event with specific details, such as the symbol traded, the price, and the strategy's performance metrics. Each event is saved immediately as a separate JSON file, allowing you to review exactly what happened and when.

When you're finished logging, you can "unsubscribe" to stop the process and clean up any resources. This service differs from other reporting methods by writing directly to files, which is ideal for maintaining a permanent, verifiable record of your strategy's activity.

## Class StrategyMarkdownService

This service helps you keep track of what's happening in your trading strategies and create detailed reports. Instead of writing every event to a file immediately, it holds onto them temporarily, which is more efficient for larger backtests.

Think of it as a temporary notebook for your strategy's actions like cancels, closes, take profits, and stop losses.

Here's how it works:

1.  **Start listening:** Use `subscribe()` to start collecting those actions.
2.  **Automatic recording:** The service automatically records important events as they happen in your strategy.
3.  **Get your data:** You can then use `getData()` to get statistics, or `getReport()` to generate a well-formatted markdown report of those actions.  You can customize the columns included in the report.
4.  **Save to file:** The `dump()` function lets you easily save those reports to a file, complete with a descriptive filename.
5.  **Clear the log:** When you’re done, `unsubscribe()` stops collecting data and cleans up.

The `getStorage` property manages how the temporary storage is created.  It's like a clever system that only creates a new storage space when it's needed, keeping things organized.

It's all about gathering information, creating readable reports, and keeping your backtesting process organized.

## Class StrategyCoreService

This service acts as a central hub for managing trading strategies, providing crucial information about active positions and facilitating various operations. It's designed to inject relevant context (like the trading symbol, timestamp, and backtest status) into strategy execution.

It handles tasks like retrieving pending signals, calculating position costs and profits, validating strategy configurations, and providing real-time position metrics (such as percentage closed, entry prices, and profit/loss details).

Several key functions allow you to retrieve information regarding pending signals, their costs, and potential profits/losses. It also offers methods for adjusting positions, such as partial profit-taking or stop-loss modifications. Backtesting capabilities are available through the 'tick' and 'backtest' functions, which simulate strategy execution and allow for comprehensive testing. The service also includes methods for pausing, stopping, or canceling scheduled actions related to strategies. Finally, it provides utilities for retrieving position metrics related to performance, like drawdown and profit distances, to offer a complete view of a strategy’s behavior.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and routing trading strategy requests. It intelligently directs calls to the correct strategy implementation based on specific criteria like the trading symbol and the strategy being used, ensuring everything runs smoothly.

Here's a breakdown of what it does:

*   **Smart Routing:** It figures out which strategy should handle a given request.
*   **Performance Boost:**  It remembers recently used strategies (memoization) to avoid redundant work and speed things up.
*   **Safe Operations:**  It makes sure strategies are fully initialized before any trading actions are taken.
*   **Handles Live and Historical Data:** It's designed to work with both real-time trading ("tick") and backtesting historical data ("backtest").
*   **Provides Information:** It gives you access to information like pending signals, total amounts closed, effective prices, and more, all crucial for monitoring and understanding the strategy's performance.
*   **Control & Management:** You can pause, stop, or cancel strategies, and even force-close positions or adjust stop-loss and take-profit levels.
*   **Signals:** Facilitates the submission of custom signals to strategies.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage and store trading signals, allowing you to switch between different storage methods like persistent disk storage, in-memory storage, or a dummy adapter for testing. It acts as a central point for interacting with the storage, making it easy to change how data is saved without altering the core trading logic.

You can choose the storage method using convenient functions like `usePersist`, `useMemory`, and `useDummy`, which let you switch between persistent storage, in-memory storage, and a no-op adapter respectively. The `useStorageAdapter` function offers even greater control, allowing you to specify a custom storage adapter. 

The `getInstance` property is a special shortcut which makes sure that the right storage utils are used and avoids to create new ones everytime, but it's memoized so you can clear it when needed, for example, when the working directory changes.  The adapter also handles events like signal opening, closing, scheduling, and cancellation, relaying these actions to the currently selected storage implementation.  Finally, it includes methods for retrieving signals by ID and listing all signals.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. Think of it as a central point that can use different "backends" for storage—like keeping data in memory, on disk, or simply discarding it. 

By default, it uses an in-memory storage solution, but you can easily switch to persistent storage that saves signals to a file, or a dummy adapter that effectively ignores any signals. This lets you test different storage strategies without changing the core backtesting logic.

The adapter handles various events (signal opened, closed, scheduled, cancelled, and pings) by passing these to the currently active storage backend. It also offers methods for finding signals by ID and listing all signals. 

You can swap out the storage backend using `useDummy`, `usePersist`, and `useMemory` methods.  If you need to change where your signals are stored, calling `clear` forces a refresh of the storage adapter to ensure the correct path is used, especially if you've changed the working directory.

## Class StorageAdapter

The StorageAdapter is the central component for managing and accessing your trading signals, whether they are from backtesting or live data. It automatically keeps track of signals as they come in, making sure they're properly stored.

You can turn on signal storage using `enable`, which subscribes to the incoming signals; this happens only once to prevent unwanted duplicates.  Conversely, `disable` allows you to stop the storage process and clean up any subscriptions – it’s safe to call this repeatedly if needed.

Need to find a specific signal?  `findSignalById` lets you search by its unique ID, pulling data from both backtest and live storage.  If you want to see a complete list of signals, use `listSignalBacktest` for backtesting signals, or `listSignalLive` for live data.

## Class StateLiveAdapter

The StateLiveAdapter helps manage the state of your trading strategies, particularly for complex rules like those involving LLMs and capitulation. It allows you to easily swap out different ways of storing that state—whether it's in memory, on disk, or even discarded entirely for testing.

The adapter automatically saves key information like the highest peak percentage and how long a position has been open, so your strategies remember their progress even if the application restarts. This is crucial for LLM-driven strategies that need to track performance over time.

You can easily change how state is stored using handy functions like `useLocal`, `usePersist` (the default, which saves to a file), and `useDummy`. If you need even more control, you can implement your own custom storage mechanism with `useStateAdapter`.

To ensure no stale data sticks around, `disposeSignal` cleans up cached state when signals are closed or canceled. For scenarios where the working directory changes between strategy runs, `clear` helps generate fresh instances of the adapter, preventing unexpected behavior.

## Class StateBacktestAdapter

The StateBacktestAdapter helps manage and store data related to your backtesting strategies, offering flexibility in how that data is handled. It uses a pattern that allows you to easily switch between different storage methods, like keeping everything in memory, saving to files, or even using a dummy adapter that ignores all changes. 

You can quickly choose the storage method you need: use the default in-memory storage, persist data to disk, or use a dummy adapter for testing purposes.

The system remembers the state for each signal and bucket combination, and it has a mechanism to clean up this memory when a signal is finished.

The adapter keeps track of things like the highest peak achieved and how long a position has been open, which is useful for evaluating trading strategies based on rules involving these metrics. 

If you want to use your own storage logic, you can plug in a custom implementation. Don't forget to clear the cache if your base directory changes.

## Class StateAdapter

The StateAdapter acts as a central manager for handling and storing trading state, whether you’re running a backtest or a live trading session. It intelligently directs operations to either the backtest-specific state storage or the live state storage based on the context.

To avoid issues with lingering data, the adapter automatically cleans up old state instances whenever a signal is ended, ensuring everything stays tidy.  You use `enable` to get things started – it subscribes to signal events and makes sure everything is set up correctly just once.  `disable` simply stops that process and is safe to call repeatedly.

When you need to retrieve the current state of a signal, use `getState`, providing information like the signal ID and the bucket name.  Similarly, `setState` allows you to update that state, also routing the update to the correct storage area.

## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and make sure they're set up correctly. It acts as a central place to register your sizing approaches, ensuring they're available when needed.

It provides a simple way to add new sizing strategies to its internal registry.  Before you try to use a sizing strategy, you can use the validation feature to confirm it's registered and ready.

For efficiency, the service remembers the results of validations, so it doesn't have to repeat checks unnecessarily.  You can also view a complete list of all the sizing strategies you’ve registered.

## Class SizingSchemaService

The SizingSchemaService helps manage and store sizing schemas in a type-safe way. It utilizes a registry to keep track of these schemas, ensuring consistency and preventing errors.

You can add new sizing schemas using the `addSizing()` function (referred to as `register` in the code) and access existing ones by their names using the `get()` function. If a schema already exists, you can update parts of it instead of replacing the whole thing with the `override()` function.

Before a sizing schema is added, it's checked to make sure it has all the necessary parts and is structured correctly – this check is done by `validateShallow`. 

The service also has internal components for logging and managing the schema registry itself.

## Class SizingGlobalService

The SizingGlobalService is a central component responsible for determining how much to trade in each operation. It uses a connection service to handle the actual sizing calculations and a validation service to ensure those calculations are reasonable. This service is an essential part of the backtest-kit's internal workings and is also accessible through the public API. 

It keeps track of things like a logger for debugging and the connection and validation services it relies upon.

The core function, `calculate`, takes parameters defining the trade's risk and a context providing details about the sizing operation, and then returns the calculated position size.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for handling position sizing calculations within your backtesting environment. It intelligently directs sizing requests to the correct sizing implementation, ensuring that the right sizing method is used based on your configuration.

It's designed for efficiency; it remembers previously used sizing methods (memoization) so you don't have to recalculate them repeatedly. 

Think of it as a dispatcher – you tell it which sizing method you want to use (using the `sizingName`), and it takes care of the rest, performing the necessary calculations and applying any risk management rules. 

If you're using strategies that don't have custom sizing, the `sizingName` will be empty.

The `getSizing` property lets you access these sizing methods, while `calculate` is the method you'll call to actually determine the position size based on your specific parameters and context. It allows for various sizing approaches like fixed percentages or Kelly criterion methods.

## Class SessionLiveAdapter

This component helps manage and store data during live trading sessions, allowing for different storage methods to be easily swapped in and out. By default, data is saved to a file on your computer so it's not lost when you restart your program, but you can also choose to keep data only in memory for testing or use a dummy adapter that doesn't save anything at all. The system automatically keeps track of specific configurations like the trading symbol, strategy name, exchange, and timeframe to ensure the correct data is loaded or saved. 

You can quickly switch between storage options like local, persistent (file-based), or dummy adapters, and even create your own custom adapters if you need something specialized.  The `clear` function helps ensure fresh data is loaded by wiping out the cache of stored adapters when your project's working directory changes.

## Class SessionBacktestAdapter

This component provides a flexible way to manage and store data during backtesting sessions. It acts as an intermediary, allowing you to easily switch between different storage methods without changing the core backtesting logic.

It comes with built-in options: keeping data entirely in memory for speed, persisting data to disk for later recovery, or using a dummy adapter that simply ignores data writes for testing purposes. You can also plug in your own custom storage solutions.

The adapter keeps track of session data based on combinations of symbol, strategy name, exchange name, and frame name, optimizing performance through memoization.

To manage your backtest session data, you can retrieve existing data or update it using the provided methods. When you need to refresh the storage configuration, clearing the memoized cache is important, especially when the working directory changes.


## Class SessionAdapter

The SessionAdapter is like a central traffic controller for your trading data. It intelligently directs data storage and retrieval operations either to the backtesting environment or to a live trading session.

Think of it as having two different data stores: one for practicing (backtest) and one for real trading (live).

The `getData` method lets you retrieve existing data for a particular symbol, and it automatically chooses the right place to look – the backtest store or the live store – depending on whether you’re testing or trading.  You’ll specify the symbol, a few contextual details (like the strategy and exchange names), a flag indicating backtest mode, and the timestamp for the data.

Similarly, the `setData` method is used to update data. It will write the new information to the appropriate storage based on whether you're backtesting or trading live, again needing the symbol, context, a backtest flag, and a timestamp.


## Class ScheduleUtils

This class helps you keep track of and report on scheduled trading signals. It’s designed to simplify the process of understanding how your strategies are performing when it comes to scheduled actions.

You can use it to get data about signals, like how many are queued, how many are cancelled, and how long they typically wait. 

It also allows you to create easy-to-read markdown reports detailing the signal activity for a specific strategy and symbol.

Finally, you can save these reports directly to a file for later review and analysis. Think of it as a central place to monitor and understand the scheduled parts of your trading system.

## Class ScheduleReportService

This service helps you keep track of how your scheduled signals are performing by recording key events like when they're scheduled, when they become active, and when they’re cancelled. It listens for these signal events and stores them in a database, allowing you to analyze delays or other issues.

The service calculates how long it takes between a signal being scheduled and either its execution or cancellation, providing valuable insights for optimizing your trading strategies.  You can easily start and stop the service’s event listening using the `subscribe` and `unsubscribe` functions to ensure you're only collecting the data you need. The service avoids accidental multiple subscriptions with a safety mechanism. It's also designed to log helpful debug messages to assist in troubleshooting.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of scheduled trading signals and generate easy-to-read reports. It listens for when signals are scheduled and cancelled, keeping a record of each one for different strategies. 

It then compiles this information into nicely formatted markdown tables, providing statistics like cancellation rates and average wait times. These reports are saved as files, making it simple to review a strategy's signal activity over time. 

You can subscribe to receive these signal events, and the service manages the subscription process, so you don't have to worry about accidentally subscribing multiple times. You can also retrieve the accumulated data or reports for specific strategies and symbols, or clear out all the stored information when it’s no longer needed.

## Class RiskValidationService

This service helps you keep track of and verify your risk management settings. It acts like a central record keeper for all your defined risk profiles, making sure they're present before you try to use them. To improve speed, it remembers the results of previous checks so it doesn't have to re-validate profiles repeatedly. 

You can use it to register new risk profiles, check if a profile exists, and view a complete list of all profiles you’ve registered. It also provides a way to log any issues encountered during the process. Think of it as a reliable guard that ensures your risk configurations are always in order.


## Class RiskUtils

The RiskUtils class helps you analyze and report on risk rejections that occur during trading. It acts as a central place to gather information about these rejections and present them in a clear, understandable format.

Think of it as a tool to understand why trades were rejected, allowing you to identify potential issues with your strategies or risk management rules.

You can request statistical summaries of rejections, providing insights into how often they happen and which symbols or strategies are involved. It can also build detailed markdown reports, which include tables of rejection events with key information like the reason for rejection, the price at the time, and the active position count.  Finally, it can save these reports as files for easy sharing and long-term record-keeping. The reports include overall rejection statistics to give a quick overview of risk management performance.


## Class RiskSchemaService

This service helps you keep track of and manage your risk schemas, ensuring they're consistently structured and type-safe. It uses a special registry to store these schemas, making it easy to organize them.

You can add new risk profiles to the registry using the `addRisk()` method (which is represented by `register` here), and you can retrieve them later by their name using `get()`.

Before a risk schema is added, it’s checked for basic structure using `validateShallow` to make sure everything is in the right place and of the right type.

If you need to update an existing risk schema, the `override()` method allows you to apply partial changes without replacing the entire schema. The service also has internal components for logging and managing contexts.

## Class RiskReportService

The RiskReportService acts as a dedicated record-keeper for any signals that are flagged and rejected by the risk management system. It quietly listens for these rejection events and meticulously saves the details – including why the signal was rejected and what the original signal looked like – in a database.

Think of it as an audit trail for risk management decisions.

To get it working, you need to subscribe to the risk rejection events; the service will then start capturing those events.  When you no longer need it to track rejections, you can unsubscribe, which stops the service from listening.  The system prevents accidental double-subscription to ensure clean operation. You can also use the loggerService to provide some debug messages.

## Class RiskMarkdownService

This service helps you generate and save reports detailing risk rejections that occur during trading. It keeps track of these rejections, grouping them by the trading symbol and strategy being used. 

You can think of it as a data collector that listens for risk rejection events, then organizes them neatly into tables within markdown files. The reports include useful statistics, such as the total number of rejections and breakdowns by symbol and strategy.

The service automatically saves these reports to a designated folder on your disk, making it easy to review and analyze potential issues. It also provides functions to clear out the accumulated data, either completely or for specific trading symbol and strategy combinations. You subscribe to receive these rejection events and can then unsubscribe when you no longer need them.

## Class RiskGlobalService

RiskGlobalService acts as a central point for managing and validating risk-related operations within the backtest-kit framework. It works closely with other services to ensure that trading signals adhere to predefined risk limits. 

The service provides methods for checking if a signal is permissible, reserving resources for that signal, and registering or removing signals related to trades.  It also has functionality to completely clear existing risk data, either for a specific set of parameters or globally.  Validation is a key aspect, and the system optimizes this process to avoid unnecessary checks.  Essentially, it’s a critical component for maintaining controlled and safe trading activity.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within the trading system. It intelligently directs risk-related operations to the correct risk management component based on the specific risk configuration in use.

Think of it as a traffic controller for risk—it ensures the right checks are performed and that those checks are efficient. It avoids repeatedly creating risk management objects by caching them based on things like the risk name, exchange, and time frame, which speeds things up.

The `getRisk` method is the key to this caching and retrieval process.

The `checkSignal` method is used to determine whether a trading signal can proceed, taking into account various risk factors like portfolio drawdown and position limits.  There's also a `checkSignalAndReserve` method, which handles things carefully to prevent conflicting actions when multiple signals are being processed simultaneously.

Finally, `addSignal` and `removeSignal` are used to register and clean up signals, respectively, keeping the risk system synchronized with the actual trading activity, and `clear` allows for clearing of memoized risk instances.

## Class ReportWriterAdapter

This framework provides a flexible way to store and manage trading data, like backtest results or live trade information. It uses an adapter pattern, allowing you to easily swap out different storage methods without changing your core code. 

The system keeps track of storage instances for different types of reports (like backtest results, walker data, etc.), making sure you don't create unnecessary duplicates. If you need to change how your data is stored, you can simply update the adapter – a constructor that defines the storage mechanism. 

The default storage method writes data to JSONL files, but this can be changed. The framework also automatically creates storage when it needs to write data for the first time. A helpful feature allows you to disable actual writing with a "dummy" adapter, perfect for testing or when you just want to verify the data structure. Finally, you can easily clear the storage cache, ensuring new storage instances are created when the working directory changes.

## Class ReportUtils

ReportUtils helps manage how different parts of the framework, like backtesting, live trading, or performance analysis, record and share data.

You can use it to turn on or off specific types of reporting, for example, to only log data from your backtests and not your live trading environment.

The `enable` function lets you subscribe to these report services, meaning it starts listening for events and saving them to files; be sure to unsubscribe later to avoid issues. The `disable` function lets you stop those services without affecting others. 

Think of it as a way to control the flow of information for analysis and debugging, making sure you only record what you need when you need it.


## Class ReportBase

The `ReportBase` class provides a way to efficiently log trading events to files in JSONL format. It's designed for append-only writing, ensuring a history of your trading activity. 

Each report type gets its own file, and the system handles creating directories as needed. It includes safeguards like a 15-second timeout for writes to prevent stalls and automatically manages the writing process, including dealing with potential backpressure.

You can easily search through the logged data using metadata like the trading symbol, strategy name, exchange, timeframe, signal ID, and walker name.  This makes analyzing your backtest results much simpler.

The class handles setting up the file and writing stream just once, even if you call the initialization multiple times.  The `write` method is the core function for adding new data points to the log file, combining the data with essential metadata and a timestamp.


## Class ReportAdapter

The `ReportAdapter` helps manage how your backtesting data, like trades and performance metrics, is stored. It's designed to be flexible, allowing you to easily swap out the storage method without changing your core trading logic.

It keeps track of these storage methods, creating just one instance for each type of report you’re generating.

You can change the default storage method, for example, to a dummy adapter that doesn't actually save anything for testing purposes, or switch back to the standard JSONL file storage.

If your working directory changes between testing runs, it’s important to clear the adapter’s cache to ensure new storage instances are created correctly. This ensures data isn't accidentally mixed up from different runs.

Essentially, it simplifies the process of logging events and creating analytics pipelines during your backtesting.


## Class ReflectUtils

This class, `ReflectUtils`, provides a way to check the performance of your trading strategies in real-time, whether you're live trading or backtesting. It simplifies getting key metrics like profit and loss (PnL), peak profit levels, and drawdown information.

Think of it as a central place to grab vital stats on your active trades. It acts as a single point of access, ensuring all the data comes from a reliable source and is consistently validated.

Here's a breakdown of what it offers:

*   **Real-time Performance Stats:**  It lets you quickly see things like:
    *   Unrealized PnL (in percentage and dollar amounts)
    *   The highest profit price achieved
    *   The deepest drawdown (the largest loss)
    *   How long the position has been open, waiting for activation, or since the peak profit.
*   **Comprehensive Metrics:**  Beyond basic PnL, you can get the timestamp, PnL percentage, and PnL cost associated with the highest profit and maximum drawdown points. It even helps you calculate distances between current price and those points.
*   **Easy to Use:** `ReflectUtils` is a shared instance, so you don't have to worry about creating multiple objects; just access it directly.
*   **Works in All Modes:** It’s designed to work both during live trading and backtesting, making sure the metrics are consistent across different scenarios.



Essentially, `ReflectUtils` is a tool to monitor and understand your trading strategy's performance while it’s running.

## Class RecentLiveAdapter

RecentLiveAdapter helps you manage and retrieve recent trading signals, offering flexibility in where those signals are stored. Think of it as a central hub for accessing signal data.

It lets you choose between persistent storage (saving signals to disk) or in-memory storage (keeping them only in the current session). This adaptability makes it suitable for various testing and deployment scenarios.

The adapter itself doesn't actually store data; it delegates that responsibility to a 'backend' which you can easily swap out. It automatically caches the 'backend' to improve performance, but provides a way to clear that cache when needed, like when your working directory changes.

You can interact with it using methods to get the latest signal, determine how long ago a signal was created, and handle active ping events. It simplifies the process of working with recent signal data.

## Class RecentBacktestAdapter

This component lets you manage and access recent trading signals, providing flexibility in how and where those signals are stored. It acts as a bridge between your trading logic and the storage mechanism, making it easy to switch between different storage options.

You can choose to store signals in memory for quick access or persist them to disk for long-term preservation. The default setting uses memory storage.

The system intelligently creates and caches the storage instance, but it’s important to clear this cache when your environment changes, like when your working directory updates. This ensures you're always using the most current storage configuration.

You can easily swap storage adapters by using the `useMemory` or `usePersist` functions, and the `useRecentAdapter` function offers more advanced control. It also offers methods for getting the latest signal, calculating the time elapsed since a signal’s creation, and reacting to active ping events.

## Class RecentAdapter

This component handles storing and retrieving recent trading signals, working for both backtesting and live trading environments. It automatically updates its storage by listening for signal changes and provides a simple way to get the most recent signal for a specific trading pair and strategy.

To prevent issues with duplicate data, it ensures that it only subscribes to updates once.

You can enable or disable this signal storage, and it’s safe to disable it multiple times.

The `getLatestSignal` function fetches the latest signal for a given symbol and strategy, prioritizing signals from backtest data first. It’s designed to avoid "look-ahead bias" by only returning signals whose timestamp is before the specified time.

The `getMinutesSinceLatestSignalCreated` function calculates how much time has passed since the last signal was generated. Like `getLatestSignal`, it protects against look-ahead bias and uses the provided time as a reference point for the calculation.

## Class PriceMetaService

PriceMetaService is a tool designed to provide the most recent market price for a specific trading setup. Think of it as a central repository for price data, organized by symbol, trading strategy, exchange, and timeframe. It keeps track of these prices and updates them automatically as new ticks come in.

It’s particularly useful when you need to know the current price *outside* of the normal trading cycle – for example, when a command needs to be executed between ticks.

Essentially, it works like this: It creates a special data stream (a BehaviorSubject) for each unique combination of symbol, strategy, exchange, and timeframe. These streams are updated constantly, and you can get the latest price from them. If a price hasn’t been received yet, it will wait patiently for a short time.

To help keep things clean and efficient, the service offers a way to clear out these price streams when they're no longer needed, preventing old data from sticking around.  This clearing happens automatically at the start of each trading session (backtest, live, or walker).

The service also knows to use a different method for getting prices when it’s running within a trading execution, using the ExchangeConnectionService as a fallback. It's registered and managed centrally, and the StrategyConnectionService keeps it updated.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, based on different strategies. It provides a set of pre-built calculations, each designed for a specific approach to position sizing. 

Think of it as a toolbox where you can choose a method – like fixing a percentage of your account at risk, or using the Kelly Criterion, or basing your size on the Average True Range (ATR).

Each calculation checks to ensure that the information you provide is appropriate for the chosen method, helping you avoid errors. 

Essentially, it simplifies the process of determining the right position size, making it easier to implement your trading plans.


## Class Position

The Position class helps you determine where to place your take profit and stop loss orders when trading. It simplifies the process by automatically adjusting the direction of your order based on whether you're going long or short.

It provides two useful functions:

*   **moonbag:** This calculates take profit and stop loss levels using a simple strategy where your take profit is a fixed 50% gain from your entry price.

*   **bracket:** This allows for more customized take profit and stop loss levels. You specify the percentage for both, and it calculates the corresponding prices. 

Essentially, the Position class takes your trade details – like whether you're long or short, your entry price, and your desired stop loss/take profit percentages – and translates them into specific price levels for your orders.

## Class PersistStrategyUtils

This utility class helps manage how your trading strategies remember their state when things need to be saved or restored. It creates and manages these storage instances automatically, making it simpler to handle persistent data for each strategy.

You can customize how the data is stored by providing your own "adapter," essentially telling the system how to read and write the strategy's information.

The class is designed to work reliably, ensuring that operations involving deferred state like commit queues and signals are handled safely, even if something unexpected happens during the process.

It’s used internally by ClientStrategy to deal with these persistent state elements.

Here's a breakdown of what you can do:

*   **Change the storage method:** You can use the default file-based storage or opt for a dummy version that doesn’t actually save anything, useful for testing.
*   **Provide your own storage:** Register a custom storage method that suits your needs.
*   **Clear the cache:** Force a refresh of the storage instances, useful when the working directory changes during strategy runs.
*   **Read/Write Data:** It provides functions to read the stored strategy data and write updates back, simplifying data management.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file, ensuring data persistence. It acts as a reliable wrapper around a more basic storage system.

Each strategy’s data is stored under a specific, unchanging name ("strategy") within a designated storage area.

The constructor takes the trading symbol, strategy name, and exchange name to identify where to store the data.

Key properties include the symbol, strategy name, and exchange name, which are used for identification purposes.  There’s also a constant, `STORAGE_KEY`, that specifies the filename used for storing the data.  The `_storage` property handles the actual file-based storage.

The `waitForInit` method makes sure the storage area is ready before anything else happens.

`readStrategyData` retrieves the saved strategy state, or returns nothing if there’s no saved data. `writeStrategyData` saves the current state of the strategy, or clears the saved data if you provide null.  This class is designed to be crash-resistant thanks to how it handles file writes.

## Class PersistStorageUtils

This class helps you reliably save and load signal data, especially when running backtesting or live trading. It manages storage instances, making sure they're created and reused efficiently based on whether you're in backtest or live mode.

You can swap out the default storage mechanism with your own custom solution, like using a different file format or a database. It handles reading and writing all signals – each stored as its own file – and does so in a way that's designed to prevent data loss even if something unexpected happens. 

The system automatically initializes the storage only when you first need to read or write data, and keeps a record of which storage instance is being used for each mode. 

If your project directory changes, you’ll need to clear the storage cache to ensure the changes are reflected. You can also switch to a dummy storage instance for testing purposes, which won’t actually save any data.

## Class PersistStorageInstance

This class provides a way to store your trading signals persistently, using files on your computer. It’s designed to be reliable, even if something unexpected happens while it’s saving data. 

Each signal you're working with will be saved as its own JSON file, making it easy to manage and understand your data.  The system looks through all available files to find the signals you need.

You can control whether this storage is used during backtesting mode when you create an instance of the class. It handles writing and reading signals using a crash-safe process so data isn’t lost.

Here's a breakdown of what you can do:

*   **Initialization:** It ensures the underlying storage is ready to go.
*   **Reading:** It retrieves all stored signals from the files.
*   **Writing:** It saves your signals, individually, into their own files.



The internal file storage is handled by `_storage`, and the `backtest` property indicates if the storage is for backtesting or not.

## Class PersistStateUtils

This class helps manage how your trading state is saved and loaded, ensuring it's reliable even if things go wrong. It’s designed to keep track of state information for each trading signal and bucket, storing it in a specific file structure.

The core idea is that it remembers which method to use for saving and retrieving data – you can easily swap between a default file-based storage, a simple dummy storage (for testing), or even provide your own custom storage solution.

To make things safe, it makes sure writes are handled carefully and initializes storage only when needed. You can control whether the initial setup happens immediately or later.

There are methods to clear the system’s memory of which storage methods it’s using, and to clean up storage entries when a signal is no longer needed. It’s a helper for keeping your trading system's state consistent and recoverable.


## Class PersistStateInstance

This class provides a way to save and load state data for your backtesting strategies, primarily using files. It manages the storage of your data, organizing it by a unique identifier (`signalId`) and a bucket name (`bucketName`). 

Think of the `bucketName` as the name of the file where your strategy's state information is saved.

It ensures that writes to the storage are done safely and reliably.

The `waitForInit` method makes sure the storage is ready before you try to read or write anything.  

`readStateData` retrieves the saved state information. 

`writeStateData` is used to save your strategy’s state.

Finally, `dispose` is a simple operation; it doesn't actually clean anything up itself—that's handled by a separate utility function.

## Class PersistSignalUtils

This class helps manage and store signal data for trading strategies, ensuring data durability and reliability. It acts like a smart container, creating and managing individual storage areas for each strategy and symbol combination. 

It allows you to customize how signal data is stored, giving you the flexibility to use different storage methods like files or custom databases. 

The system intelligently creates storage instances only when they are needed, and makes sure that reads and writes happen safely. 

If something goes wrong, like a crash, it helps protect the signal data.

You can easily swap out the storage mechanism to test or use different persistence solutions, or even use a dummy for testing purposes without actually saving anything.


## Class PersistSignalInstance

This class helps you save and load signal data to files, making sure it's done reliably even if something goes wrong. It's designed to work with a specific trading strategy and exchange, identifying signals by their ticker symbol. 

The class essentially manages a file where your signal data is stored, automatically handling the saving process safely. It ensures the data is written completely, preventing potential data corruption.

Here's what you can do with it:

*   **Initialization:** You start by initializing the storage, which prepares the file-based system.
*   **Reading Signals:** It lets you retrieve previously saved signal data using the ticker symbol.
*   **Saving Signals:** You can use it to store the current signal data, identified by its ticker symbol. You can also clear the data by sending 'null'.


## Class PersistSessionUtils

This utility class helps manage how session data is saved and loaded, particularly useful for keeping track of information across different parts of a trading strategy. It ensures that each unique combination of strategy, exchange, and frame uses its own dedicated storage location, organized in a specific directory structure.

It's designed to be flexible, letting you easily switch between different ways of storing data, like using a standard file system or even a "dummy" method that doesn't actually save anything. 

The class intelligently caches these storage configurations to avoid unnecessary creation, and provides functions to read, write, and clear this data safely. There are methods to initialize, clean up, and even replace the default storage mechanism with a custom adapter if needed. You can also trigger a clean cache when your working directory changes, or release individual storage entries when they're no longer required.

## Class PersistSessionInstance

This class provides a way to save and load session data, specifically for trading strategies and exchanges. Think of it as a way to remember where you were in a trading simulation or live trading process, so you can pick up right where you left off. 

It focuses on storing data related to a specific strategy, exchange, and timeframe – essentially creating a unique storage location for each. The storage uses JSON files, and is structured to prevent conflicts if multiple symbols are using the same strategy.

The class manages the underlying file storage and creates a unique key for each symbol and backtest to prevent data clashes. It handles saving data like `SessionData` – that may include things like order history or account balances. 

Importantly, the `dispose` method doesn't actually do anything itself, because any needed cleanup is managed by a separate utility function (`PersistSessionUtils.dispose()`). This keeps session management organized.

## Class PersistScheduleUtils

This class helps manage how your trading strategies keep track of scheduled signals—those pre-planned actions that happen at specific times. It makes sure that these signals are saved reliably, even if your strategy crashes or restarts.

It uses a clever system to create specialized storage for each strategy, symbol, and exchange combination, making sure data is organized. You can even customize how this storage works by providing your own adapter.

When a strategy needs to read or write a scheduled signal, this class handles it safely and ensures that all operations happen together, preventing data inconsistencies. It also initializes the storage lazily, only when needed.

To customize the persistence, you can switch between different adapters like using files, or even a dummy adapter for testing purposes where no persistence is needed. If your working directory changes, you can clear the storage cache to ensure everything is fresh.

## Class PersistScheduleInstance

This class helps you save and retrieve scheduled trading signals to a file, making sure your data is preserved even if there's an unexpected interruption. It’s designed to work with a specific trading symbol, strategy name, and exchange.

Think of it as a reliable way to store information about when a trade should happen, using the symbol as a unique identifier. 

The class handles the technical details of writing data to a file safely, making it easy to keep track of your scheduled trading actions. It initializes the underlying storage, reads existing schedules, and writes new schedules or clears them out as needed.


## Class PersistRiskUtils

This class helps manage how your trading positions are saved and retrieved, especially when dealing with risk management. It ensures that each risk profile has its own dedicated storage, and you can customize how that storage works with different adapters. 

It’s designed to safely handle reading and writing position data, even if unexpected things happen, and it remembers these positions so you don’t lose track.

Here’s a breakdown of what you can do:

*   **Customize Storage:** You can swap in different ways to save data, like using files or even a dummy system for testing.
*   **Cache Management:** The system intelligently creates storage instances only when needed, preventing unnecessary overhead.
*   **Clean Up:** You can clear out the stored data when it's no longer needed, like after a process restart.
*   **Easy Switching:** You can easily switch back to the default file-based storage or a dummy version for testing.

## Class PersistRiskInstance

This class helps you reliably save and load position data for your risk management system. It's designed to be a safe and straightforward way to persist data to a file.

It automatically handles writing data in a way that minimizes the risk of data loss, even if something goes wrong during the writing process. 

Essentially, it wraps a lower-level storage mechanism to manage JSON files, always using a specific identifier ("positions") to store the data.

You provide a risk name and exchange name when you create an instance, which helps organize your data.

The `waitForInit` method makes sure the storage is ready before you start using it.

The `readPositionData` method retrieves the saved position data, and `writePositionData` stores new or updated position information.

## Class PersistRecentUtils

This class, PersistRecentUtils, helps manage how recent trading signals are saved and loaded. Think of it as a helper for remembering the latest signals for each trading strategy and market.

It automatically creates and manages these storage instances based on things like the trading symbol, strategy name, exchange, and even the timeframe you're using. 

You can even customize how these signals are stored by swapping out the default storage method with your own.

The class also handles reading and writing these signals safely and reliably, even if there are unexpected interruptions. 

If you need to clear the stored signals – for example, if your program’s working directory changes – there's a `clear` function for that. There are convenient shortcuts to use a default JSON file-based storage or a dummy storage for testing.


## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent data for a trading strategy. It’s designed to store information about signals, using a file-based system to ensure safety and consistency.

It remembers details like the trading symbol, the name of your strategy, the exchange used, the timeframe (like a 5-minute or daily chart), and whether the test is a backtest or live trading. It organizes this data based on these factors, creating separate storage for different contexts.

The `waitForInit` method makes sure the storage is ready before anything else happens. You can use `readRecentData` to load the latest saved signal information and `writeRecentData` to save new signals, effectively keeping a record of your strategy's recent performance. Think of it as a way to track and preserve key data points for analysis and future improvements.


## Class PersistPartialUtils

This class, `PersistPartialUtils`, helps manage how partial profit and loss data is saved and retrieved, particularly for trading strategies. It keeps track of different storage instances for each symbol and strategy combination, making sure data is handled efficiently.

You can customize how this data is stored, using different adapters or even switching to a dummy adapter that doesn't actually save anything.  The class uses a clever system to avoid creating unnecessary storage instances – it only creates one for each unique symbol, strategy, and exchange combination.

Retrieving and saving partial data is done through `readPartialData` and `writePartialData`, which handle the underlying storage and automatically set up the necessary data containers when needed.  The `clear` method is useful to reset the storage if the program's working directory changes. Finally, there are helper functions like `useJson` and `useDummy` that let you quickly switch between different storage methods for testing or configuration.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and retrieve incomplete data related to your trading strategies. Think of it as a way to temporarily store information that you might need to finish later, like a draft of your work. 

It's designed to be reliable, ensuring that even if your program crashes, your data won't be lost. It uses a file to store this information, organized by the trading symbol, strategy name, and exchange.

The class manages this data storage safely, making sure writes are complete even if things go wrong. You can use the `waitForInit` method to make sure the storage is ready and the `readPartialData` and `writePartialData` methods to manage the temporary data. Essentially, it provides a simple way to checkpoint your work.


## Class PersistNotificationUtils

This class provides tools for safely and reliably saving and loading notification data. It's designed to be a behind-the-scenes helper used by other components to handle the actual storage.

It manages how notifications are stored, using separate files for each notification, and ensures that these operations happen in a way that avoids data loss even if something unexpected occurs.

You can customize how the data is persisted by providing your own notification instance creators. If you don't customize, it defaults to using files or a dummy (no-op) storage. 

The system keeps track of which storage is being used, and caches things to avoid unnecessary work. Clearing the cache forces it to use a fresh storage instance, which can be important when the application’s working directory changes.

## Class PersistNotificationInstance

This class provides a way to reliably save and load notification data, like trade signals or alerts, to a file. It's designed to work well even if your program crashes unexpectedly.

Each notification gets its own separate file, making it easy to manage and find specific events.  The system uses a standard file format (JSON) for storing this information.

It offers a straightforward setup, you just tell it whether you're running a backtest or live trading. 

The `waitForInit` method makes sure the storage is ready before you start using it.  `readNotificationData` retrieves all the saved notifications, and `writeNotificationData` saves a batch of notifications to disk. This approach allows for safe data persistence, ensuring that notifications are not lost even during unexpected interruptions.

## Class PersistMemoryUtils

This utility manages how memory data is saved and loaded, ensuring that information persists even if the system restarts. It’s designed to work closely with the `MemoryPersistInstance` to provide a reliable way to store and retrieve data.

The framework keeps track of these memory entries in files, organized by a unique identifier (`signalId`) and a category (`bucketName`), and each entry has its own ID (`memoryId`).

You can customize how this data storage works by providing your own custom storage constructors. It also includes methods for initializing storage, reading, writing, and removing memory entries, all of which happen asynchronously.

A handy feature is the ability to clear the storage cache, which is useful when certain conditions change during a trading strategy's execution. Finally, there's a way to delete individual entries and a mode that uses a dummy implementation for testing or when you don't want any data to actually be saved. The `listMemoryData` function allows you to iterate through all stored data, which is especially useful for rebuilding indexes.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data, primarily using files. It's designed to work with the backtest-kit framework and handles the complexities of saving data safely.

Think of it as a manager for your memory data, organized into buckets identified by a signal ID and a bucket name. 

The class handles writing and reading data, and can even mark entries as deleted (soft delete) instead of permanently removing them. When you need to retrieve a list of all the available memory entries, it filters out those that have been marked as deleted.  It’s worth noting that cleaning up the underlying memo cache is handled separately, so this class itself doesn't manage that aspect.

## Class PersistMeasureUtils

The PersistMeasureUtils class helps manage how data from external APIs is stored and retrieved, especially when you need that data to persist between different runs. It acts like a central hub for caching API responses, ensuring they're handled consistently and reliably.

It uses a clever system of "buckets" based on timestamps and symbols to organize the cached data. You can even customize how these buckets are stored – whether it's in a file, a database, or even just in memory as a temporary solution.

The class automatically manages the creation of these buckets, and reads, writes, and removes data from them. It ensures that these operations are handled safely, even if something goes wrong during the process.

If you need to change how the caching works, you can swap out the default storage method with your own custom solution, allowing for flexible adaptation to your specific requirements. There are also built-in options to use a simple file-based solution or even a "dummy" solution that effectively ignores all caching operations for testing or debugging purposes. Finally, it provides a way to clear the internal caches to prevent issues with changing working directories.

## Class PersistMeasureInstance

This class helps you store and retrieve measure data, essentially acting as a persistent layer for your backtesting environment. It uses files to keep your data safe, and ensures that writing data happens reliably.

When an entry is removed, it's not truly deleted from the file system; instead, a flag marks it as removed, allowing you to keep a historical record. To list available data, it filters out those entries marked as removed.

The `bucket` property defines where your data is stored.
It uses an underlying storage mechanism and provides a way to ensure initialization happens correctly.

You can read a single measure entry by its key, write new data, or "soft-delete" entries. The `listMeasureData` method offers a way to loop through all available measure data.


## Class PersistLogUtils

This class helps manage how your log data is saved and retrieved. It acts as a central point for interacting with the persistent storage of log entries.

It uses a cached copy of the logging instance to avoid repeated setup.

You can customize how the logs are persisted by providing your own storage adapter, or switch back to the default file-based approach, or even use a dummy adapter for testing purposes where no data is actually saved.

The `readLogData` method gets all the log entries that have been saved, while `writeLogData` adds new entries – ensuring that duplicate entries are ignored. 

This class is designed to handle log data safely, even in situations where the application might crash, making sure your log history remains reliable. It is primarily used by `LogPersistUtils` to manage log persistence. The `clear` method is particularly useful when starting a new strategy iteration, especially when the current working directory changes.

## Class PersistLogInstance

This component handles storing trading backtest logs to files, providing a simple way to keep a record of your testing. It acts as a persistent layer, ensuring your log data isn't lost. Each log entry is saved as a separate JSON file, making it easy to review individual events. 

The system works by adding new log entries to the storage; it won't overwrite existing entries, protecting against data loss. It also includes a mechanism to initialize the storage, ensuring everything is ready before logs are written. You can retrieve all stored log data at once, pulling all those individual files together into a consolidated view.


## Class PersistIntervalUtils

This framework component helps keep track of which intervals have already fired for your trading strategies, preventing redundant actions. It stores simple markers in a directory called `./dump/data/interval/`, where each marker indicates that a specific interval has already run for a particular data bucket and key.

You can think of it as a persistence layer that remembers what's already been done.

The system uses a constructor to create these markers, and you can easily swap out the default constructor for custom implementations. It also provides methods for reading, writing, and deleting these markers, and a way to list all the markers for a specific bucket.

If your working directory changes between strategy runs, you'll need to clear the cache to ensure everything works correctly. There are also built-in options for switching to a default file-based persistence or a dummy implementation for testing purposes.

## Class PersistIntervalInstance

This component provides a way to save and retrieve data related to trading intervals, using files to store the information. Think of it as a persistent memory for your backtesting system.

It automatically handles saving data safely and allows you to "soft delete" entries – meaning they're not actually erased but marked as removed, which is useful for allowing intervals to re-trigger.

The `bucket` property defines where this data is stored within the file system. 

You can read specific interval data by key, write new data, or remove existing data (softly).

Finally, it provides a way to list all active interval markers, ensuring you only see the ones that haven’t been marked for removal. It ensures that the system efficiently manages interval data and allows for dynamic adjustments to trading strategies.

## Class PersistCandleUtils

This class helps manage a persistent cache of historical candle data, which is essentially the price history of assets. It stores each candle as a separate file, organized by exchange, symbol (asset), and time interval.

The system checks if the number of cached files matches what's expected, to make sure you're using valid data.  It automatically updates the cache if it detects any missing information.

You can customize how the cache is handled using different constructors, or revert back to the standard file-based or dummy (no-save) options.  The `clear` method is useful when your working directory changes.

The `readCandlesData` method retrieves the cached candle data, and `writeCandlesData` saves new data to the cache. It's important to remember that these methods create the underlying cache instance only when they are first used.


## Class PersistCandleInstance

This component provides a way to persistently store and retrieve candle data, acting as a bridge between your trading logic and a file system. Think of it as a local, file-based cache for your historical candle data.

Each candle is saved as a separate file, making it easy to manage and retrieve individual data points. 

When retrieving data, it will return null if a candle's timestamp isn't found, essentially prompting a refresh from the original source.

The writing process is designed to be safe: it avoids saving incomplete candles (those where the closing time is in the future) and overwriting existing data, ensuring a consistent and append-only cache. If a candle is found to be invalid, it’s flagged with a warning and treated as if it's missing, prompting a re-fetch.

You define the symbol, interval, and exchange name when creating this component, which organizes the storage for those specific trading parameters.


## Class PersistBreakevenUtils

This class helps manage and store the breakeven state for your trading strategies. It essentially acts as a central place to read and write this data, ensuring that your strategies remember important information across sessions. 

It handles saving breakeven information to files, organized by the trading symbol, the strategy you're using, and a unique identifier for the signal.  The files are stored in a directory structure like `dump/data/breakeven`.

It uses a clever system to only create these storage instances when they're needed, making things efficient. You can also customize how the data is saved, using either the standard file-based method, a dummy version that doesn’t actually save anything, or your own custom adapter.  If your working directory changes, it's important to clear the cache so it can refresh this information.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data for trading strategies. It's designed to work with a specific trading symbol, strategy name, and exchange.

It leverages a file-based storage system, making sure that data is saved safely even if the program crashes.  Each piece of data is identified by a unique signal ID.

The constructor sets up the storage context using the provided symbol, strategy, and exchange names.

Internally, it manages the underlying file storage and uses the signal ID to organize the data.

You can use `waitForInit` to ensure the storage is ready before attempting to read or write data.

`readBreakevenData` lets you retrieve the breakeven information for a specific signal and date.

And `writeBreakevenData` is used to save new or updated breakeven data, again linked to a signal and timestamp.


## Class PersistBase

`PersistBase` provides a foundation for reliably saving and retrieving data to files, ensuring your data isn't lost or corrupted. It’s designed to handle file operations safely, even if there are interruptions or errors.

This class helps manage where your data files are stored, automatically checking and correcting any issues with existing files when it starts up. It uses a special technique called "atomic writes" to guarantee that when data is saved, it’s either fully saved or not at all – preventing partially written files. 

It offers ways to efficiently loop through all the data it's holding, and it can retry attempts to delete files if needed.

The class stores data in a specific folder, and you provide the name of your data type when creating it.  It allows you to read, write, and check for the existence of your data, always ensuring the integrity of your stored information.  You can also easily get a list of all the data items it's managing, presented in alphabetical order.

## Class PerformanceReportService

The PerformanceReportService helps you understand where your trading strategies are spending their time. It essentially watches for performance events—like how long different parts of your strategy take to execute—and records them. 

You can think of it as a data collector for bottlenecks. It listens for these performance signals, saves them with relevant details, and stores them so you can later analyze them.

To use it, you subscribe to receive these timing updates. When you’re finished, you need to unsubscribe to stop the data collection. The service ensures you don't accidentally subscribe multiple times.

The service uses a logger for displaying debugging information, and a "track" property handles the process of receiving and saving the performance data.

## Class PerformanceMarkdownService

This service is designed to meticulously track and analyze the performance of your trading strategies. It listens for performance data, organizes it by strategy, and then crunches the numbers to give you insights like average performance, minimum and maximum values, and percentile ranges. 

It can even generate detailed markdown reports, including a breakdown of potential bottlenecks, and saves these reports directly to your logs directory.

Here’s a bit more detail on how it works:

*   It uses a storage system to keep performance metrics separate for each combination of symbol, strategy, exchange, timeframe, and whether it's a backtest.
*   You subscribe to receive performance updates, and it ensures you don't accidentally subscribe multiple times. Remember to unsubscribe when you’re done!
*   The `track` function is the engine that processes those performance events and updates the metrics.
*   You can request specific performance statistics or trigger a full report generation, and the `dump` function lets you save those reports directly to disk.
*   Finally, a `clear` function allows you to wipe the accumulated performance data when needed.

## Class Performance

The Performance class offers tools to analyze how your trading strategies are performing. It allows you to gather combined performance data for specific symbols and strategies, giving you a breakdown of metrics like total execution time, average durations, and volatility. 

You can easily generate reports that present this data in a readable format, often using Markdown. These reports help highlight potential bottlenecks in your strategy’s operations by showing you time distributions and percentile analysis.

Finally, the class provides a convenient way to save these detailed reports to your hard drive, so you can review them later or share them with others. The reports will be saved in a directory structure similar to `./dump/performance/{strategyName}.md` if you don’t specify a custom path.

## Class PartialUtils

This class offers a way to gather and display information about partial profits and losses, which are smaller, incremental changes in your trading positions. It's designed to help you analyze how your strategies are performing in detail.

You can request summary statistics like total profit/loss counts.

It can also generate a clear, formatted report in Markdown that lists each individual profit or loss event, including details like the symbol traded, the strategy used, the price, and when it happened.

Finally, you can easily save these reports to files so you can keep track of your trading history and review it later. The reports are named in a straightforward way, making them easy to find and organize.

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by recording when you take partial profits or losses. 

It listens for signals indicating these partial exits, whether it's a profitable or loss-making move. 

It saves this information, including the price and level at which the partial exit happened, into a database. 

To use it, you’ll subscribe to receive these signals, and later, when you’re done, you’ll unsubscribe. The service also ensures you don’t accidentally subscribe more than once.


## Class PartialMarkdownService

The PartialMarkdownService helps you create and save reports detailing your trading performance, specifically focusing on profits and losses. It listens for these events as they happen, keeping track of them for each symbol and strategy you're using.

This service then organizes this information into easy-to-read markdown tables, providing a clear overview of your trading activity and overall statistics. You can easily save these reports to your hard drive for later review or analysis.

You can subscribe to receive these events, and unsubscribe when you no longer need them. The service offers methods to retrieve specific data, generate reports, and save those reports to disk. Furthermore, it provides functionality to clear accumulated data, either for a specific symbol/strategy combination or all data.

## Class PartialGlobalService

This service helps track and manage partial profits and losses across your trading strategies. Think of it as a central hub for these operations, ensuring everything is logged and handled consistently.

It’s designed to be integrated into your strategies using dependency injection, which means it's a clean and organized way to manage how partial profits and losses are tracked.  The service itself doesn't do the heavy lifting – it relies on another service, `PartialConnectionService`, to actually manage the data.

It also keeps an eye on things by validating that your strategies, risks, and exchanges are correctly configured.  You'll find services for validating various components like strategies, risks, exchanges, frames, and actions.

The `profit`, `loss`, and `clear` functions are how you report changes in profit/loss levels or when a signal closes. Each of these actions is logged for monitoring purposes before being passed on to the `PartialConnectionService` to handle the actual updating of data.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It acts as a central hub, creating and maintaining specific data containers, called ClientPartial instances, for each unique signal. Think of it as a factory that produces these containers and keeps them organized.

It ensures that there's only one ClientPartial instance created for each signal, remembering it for future use. This process uses a technique called memoization to avoid unnecessary creation and improves efficiency.

When a signal reaches a profit or loss milestone, this service handles the update, notifying other parts of the system. Similarly, when a signal is closed, it cleans up the associated data container.

The service is integrated into the broader trading strategy and relies on other supporting services to function. It's responsible for managing the lifecycle of these ClientPartial instances, making sure they're created, updated, and eventually removed when no longer needed.

## Class OrderTransientError

This class, `OrderTransientError`, is essentially a marker to signal that an order-related failure is temporary—like a network blip or a brief exchange issue—and should be retried. It doesn't trigger any special handling within the backtest-kit framework itself; a regular error would be treated the same way. It’s mainly for clarity, letting developers know that a retry is the appropriate response without needing to dig into the framework’s internal logic.

Here’s a breakdown of how it affects different parts of the system:

*   **Order Opens:** If an order open fails, the system will automatically retry it with the same signal, attempt number increasing each time. It’s crucial to check if a previous order with the same ID exists before retrying to avoid unexpected behavior. If retries fail, it signifies a critical problem.
*   **Order Closes:** Similar to opens, failed close attempts are retried. Persistent failures lead to a forced position closure.
*   **Order Checks:** Failed check pings are tolerated and monitoring continues; several consecutive failures will eventually lead to a termination.
*   **Important:** Exhausting the retry attempts for *any* of these situations is considered fatal and will signal an error.
*   **Persistence:** The retry counters for opens and closes are saved, so even after a crash, the system picks up where it left off (with a limited number of retries remaining). The check counter isn't persistent.



The `isOrderTransientError` method and the `fromError` constructor are provided primarily for application-level tools like logging and metrics, ensuring consistent identification across different module versions.

## Class OrderRejectedError

This error signals a definitive rejection of an order by the exchange – it's a situation where retrying the order won't work. You'll typically throw this from components responsible for communicating with the broker, like within order gates, when a fundamental business reason prevents an order from being filled.

Here's what happens when this error is thrown:

*   **Open Orders:** The system immediately drops the order and doesn't attempt to retry it. Any pending retry attempts are canceled, preventing the order from resurfacing later.
*   **Close Orders:** The engine immediately forces a closure of its position, using the original reason (like a take-profit or stop-loss). While the system attempts to close the position, the actual reconciliation with the exchange is left to the broker adapter.
*   **Error Handling:** The framework logs the error, but doesn't consider it a fatal error – the trading process continues.

It’s crucial to only throw this error when the exchange provides a clear, unrecoverable reason (like account restrictions or a delisted symbol). Don't use it for temporary problems like timeouts or rate limits, as those should be handled with standard retries.

There are some important considerations:

*   **Context Matters:** Throwing it in certain monitoring channels will result in a different, more manageable error handling.
*   **Runtime Identification:** The framework identifies this error based on a unique symbol, making it reliable across different module setups.
*   **Live Environment:** This error is significant in live trading environments but may not have an effect during backtesting due to short-circuiting.

## Class OrderDeletedError

The `OrderDeletedError` signals that the exchange has definitively confirmed an order no longer exists – perhaps it was manually canceled or liquidated. This error is specifically thrown within order checks (like active or scheduled order confirmations) and represents a business fact, not a network problem. When this error occurs, the framework immediately resolves it to a "deleted" verdict, bypassing retry attempts.

This is *not* the same as a filled order or a temporary connection issue. A filled order requires a different confirmation process, and network problems should trigger a standard error, not a "deleted" status. Throwing this error in the wrong place (like during order opening or closing) will result in unexpected behavior. 

The error’s runtime type can be reliably identified using a specific symbol, ensuring it’s recognized even in complex module setups. This error won't happen during backtesting because there's no live exchange to query.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading strategy's performance. It's designed to be flexible, letting you choose where those notifications are sent – whether it’s to memory, a file, or a dummy location for testing.

Think of it as a central hub for all your notifications, like signal events, profit/loss updates, order confirmations, and errors. You can easily switch between different notification methods without changing your core strategy logic.

It offers several pre-built options for where to send notifications, including an in-memory option for quick testing, a persistent option for saving notifications to disk, and a dummy option that does nothing.

You can also customize the notification system by providing your own notification adapter. This is useful if you want to integrate with a specific messaging service or build your own custom notification logic.

The `handle` methods (like `handleSignal`, `handlePartialProfit`, etc.) are the main entry points for sending different types of notifications. These methods then forward the notification to your chosen adapter.

Finally, `clear` is important if your environment changes between strategy runs, like when the current working directory is updated; it ensures a fresh notification adapter is used.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, especially when something important happens during a trading simulation. It's a behind-the-scenes helper that ensures everything is checked and working correctly before a notification is sent.

The `validate` function checks various aspects of your trading setup – the strategy, the exchange, and the data frames – making sure they're all valid. It’s designed to be efficient; it only performs these checks once for each unique combination of strategy, exchange, and frame.

The `commitSignalNotify` function is the main way to trigger a notification. It takes information about the signal, the symbol being traded, and other relevant details, then sends out a notification to anyone who’s listening. This includes checking the validations and making sure the signal is resolved before the notification goes out.

## Class NotificationBacktestAdapter

This component, `NotificationBacktestAdapter`, is designed to handle notifications during backtesting, providing flexibility in where and how those notifications are stored. It acts as a central point for routing various events – like strategy signals, partial profits/losses, order confirmations, and errors – to a specific notification backend.

You can choose different "notification adapters" to control where the information goes: by default, notifications are stored in memory.  However, you can easily switch to a persistent adapter to save notifications to disk, or use a "dummy" adapter which silently ignores them entirely.

The `handle...` methods are the primary way to send notifications; they all forward the information to the currently selected adapter.  You can change the adapter using `useDummy`, `useMemory`, `usePersist`, or `useNotificationAdapter`. `clear` ensures you’re getting a fresh notification instance, especially useful if your working directory changes. `getData` allows you to retrieve all stored notifications, and `dispose` clears them out when you're finished.

## Class NotificationAdapter

The NotificationAdapter is the central component for handling notifications during backtesting and live trading. It automatically keeps track of notifications, whether they're related to backtest data or current trading activity.

You can enable the adapter to start receiving notifications by subscribing to various signals, and it makes sure you only subscribe once to avoid issues.  Similarly, disabling the adapter cleanly unsubscribes from these signals, and it's safe to call this multiple times.

Accessing the notifications themselves is straightforward – just use the `getData` function, specifying whether you want backtest notifications or live trading notifications.  Finally, `dispose` provides a way to completely clear out all stored notifications.


## Class MemoryLiveAdapter

This component provides a flexible way to manage your trading memory, allowing you to choose where that memory is stored – whether it's in the current process, saved to files, or even discarded entirely. You can easily switch between different storage methods with functions like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter`, letting you adapt to various testing and deployment needs.

The adapter uses a system of memoized instances, meaning it efficiently reuses memory for specific signals and buckets, and you can clear these memoized instances using `disposeSignal` when a signal is closed. It provides methods to write, search, list, remove, and read data from memory, all powered by BM25 full-text scoring for powerful searches. If you’re working with files, data is automatically saved to a directory structure within your project. Don’t forget to clear the cache using `clear` when your working directory changes.

## Class MemoryBacktestAdapter

This component provides a flexible way to manage memory storage during backtesting, allowing you to choose different storage methods depending on your needs. It's designed to be adaptable, letting you swap out the underlying storage mechanism without changing your core backtesting logic.

By default, it uses an in-memory storage system that’s fast but doesn't save data. You can easily switch to a persistent storage option that saves your data to disk, or use a dummy adapter for testing purposes.  

You can use functions like `useLocal`, `usePersist`, and `useDummy` to quickly change the storage method. The `disposeSignal` method is crucial for cleaning up memory when signals are closed, and the `clear` method is vital for ensuring correct behavior when the working directory changes during testing. The framework also provides methods to write, search, list, remove, and read data from memory.

## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing memory storage, whether you're running a backtest or a live trading environment. It keeps track of memory instances and cleans them up automatically when signals are closed, so you don’t have to worry about outdated data lingering around.

You control whether memory storage is active using `enable` and `disable` – `enable` sets everything up, and `disable` cleans up.

For interacting with the memory itself, you have several key functions:

*   `writeMemory`:  Lets you store data, automatically directing it to the correct location (backtest or live).
*   `searchMemory`:  Allows you to find memory entries using a search query, leveraging full-text search for more powerful results.
*   `listMemory`: Provides a way to view all the data currently stored in memory.
*   `removeMemory`:  Deletes specific entries from memory.
*   `readMemory`: Retrieves a single, specific piece of data you’ve stored.

These functions handle the details of where the data is saved, making it easier to manage your memory data within the backtest-kit framework.

## Class MaxDrawdownUtils

This utility class helps you understand and analyze maximum drawdown events, which are crucial for risk management. Think of it as a tool for looking back at how much your trading strategies have lost at their worst points.

It gathers information from events related to maximum drawdown, allowing you to see statistics and generate reports about specific trading strategies or symbols. 

You can request statistical data, like the maximum drawdown itself, or generate detailed markdown reports that show a history of these drawdown events.  The reports can be saved directly to a file for later review or sharing. You can also customize what columns are displayed in the report to focus on the information that is most important to you.


## Class MaxDrawdownReportService

This service is responsible for tracking and recording maximum drawdown events during backtesting. It keeps an eye on the `maxDrawdownSubject` and whenever a new drawdown occurs, it saves that information as a JSON record to a database for later analysis.

Think of it as a vigilant observer noting every time your trading strategy hits a new low point.

The service uses a `loggerService` and `tick` object to handle the drawdown events. 

To get it working, you need to "subscribe" to the drawdown subject; this starts the recording process.  A handy part is that subscribing only happens once—repeated attempts will just give you the same way to stop it.  When you're done, "unsubscribe" to stop the recording and free up resources.

The data saved includes key details like the time, symbol, strategy name, exchange, timeframe, signal ID, position, current price, and even the price targets set in the signal. This detailed record helps you understand exactly what happened when the drawdown occurred.


## Class MaxDrawdownMarkdownService

This service helps create and store reports detailing maximum drawdown, a key risk metric for trading strategies. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these events and unsubscribe to stop listening. The service provides methods to retrieve the raw data, generate a formatted markdown report, and write the report directly to a file. 

The `clear` function lets you reset the accumulated data, either for a specific combination of symbol, strategy, exchange, and timeframe, or for everything at once. This lets you manage and refresh the stored drawdown information as needed.

## Class MarkdownWriterAdapter

This component helps you manage how your trading reports are saved, offering flexibility in where and how they're stored. It uses a design that lets you easily switch between different storage methods, like saving each report as a separate file, collecting them all in one JSON file, or completely suppressing the output. 

You can choose between a few built-in options—a folder-based system for individual files, a JSONL approach for central logging, or a dummy option that effectively disables markdown generation. The system remembers the storage setup you choose, making it efficient and preventing redundant initialization. 

If you need to change the storage location or refresh the storage, a `clear` function provides a simple way to do that. You can influence how your markdown is saved by setting a custom markdown adapter, letting you control the implementation of storage. Finally, you write markdown data to the currently selected storage through a `writeData` method.

## Class MarkdownUtils

The MarkdownUtils class helps you control when and how markdown reports are generated for different parts of your trading system, like backtests, live trading, or performance analysis.

You can use the `enable` method to turn on markdown reporting for specific areas; it’s important to remember to use the function it returns to turn them off again later to avoid memory problems.

The `disable` method lets you stop markdown reporting for particular components without affecting others, which is useful if you only want to generate reports in certain situations.

Finally, `clear` allows you to wipe the data collected for reports without stopping the reporting itself, so you can start fresh with a new set of data.

## Class MarkdownFolderBase

This adapter helps you generate trading reports with each report saved as its own markdown file in a well-organized directory structure. It's designed for easy human readability and manual review of your backtest results. 

Think of it as creating a neat folder system where each report has its own `.md` file, making it simple to browse and understand your trading strategy's performance. 

The adapter doesn't manage streams; it directly writes files.

The location of the files is determined by the `path` and `file` options you provide, making customization straightforward. The initialization process is simple; it doesn't require any special setup. The `dump` method handles writing the content and creating any necessary directories.


## Class MarkdownFileBase

This class helps you manage and write markdown reports to files in a structured way, specifically designed for trading backtesting. It organizes reports into separate JSONL files, making them easy to process later with standard JSON tools. The system writes data line by line, ensuring smooth handling even with large amounts of information.

The adapter automatically creates the necessary directories and includes important metadata like the trading symbol, strategy name, exchange, timeframe, and signal ID with each report. To prevent delays, it has built-in timeouts and manages writing speed to avoid bottlenecks. 

You don't need to worry about file paths or stream management; the class handles all of that for you. Initialization happens only once, and dumping data is a simple process involving providing the markdown content and any relevant metadata. This provides a centralized and reliable method for logging and analyzing your trading results.


## Class MarkdownAdapter

This component provides a flexible way to manage how your markdown data is stored, allowing you to easily change the underlying storage mechanism. It uses an adapter pattern, meaning you can swap out different ways of storing markdown content without changing the core logic of your application. 

You can choose between several storage options: the default is to store each markdown entry as a separate file, or you can consolidate them into a single JSONL file.

For testing or development, a dummy adapter is available to prevent any actual writes, acting as a placeholder.  The system remembers which storage method you’re using, ensuring consistency throughout your project. Convenient shortcuts like `useMd` and `useJsonl` make switching between these options simple.

## Class MCPValidationService

The MCPValidationService helps ensure your Model Context Protocols (MCPs) – the building blocks of your trading strategies – are properly set up and consistent. It keeps track of all registered MCPs, checking that they exist and that their dependencies are valid whenever they're used.

Think of it as a safety net, preventing errors that can arise from missing or misconfigured MCPs. Unlike other registration systems, you can't re-register an MCP with the same name; it enforces uniqueness to avoid confusion.

Here's what it offers:

*   **MCP Tracking:** The `addMCP` method lets you register a new MCP, ensuring it's not already registered.
*   **Validation:** The `validate` method confirms an MCP is registered and its strategy dependency is correct. This check is only performed once per MCP name to improve performance.
*   **Listing:**  You can use the `list` method to see all the MCPs that have been registered.

The service uses a `loggerService` for reporting and a `strategyValidationService` to handle the validation of strategy dependencies.  It relies on an internal map `_mcpMap` to store and manage the MCP information.

## Class MCPUtils

This class, `MCPUtils`, acts as a bridge between a trading strategy and an external agent (like a monitoring or control system) using the Model Context Protocol (MCP). Think of it as a way to give your automated trading strategy a voice and allow it to be influenced from outside.

It provides tools to observe and interact with the trading strategy. You can get reports on the portfolio's health – how many positions are open, overall profit/loss – presented in a human-readable format for the agent. It also lets you manually open or close positions, or add to an existing position through a DCA (Dollar Cost Averaging) approach.

The `getDefaultMessages` method generates a summary of the current portfolio's status, while `getHistoryMessages` provides a log of past trades.  `getNotificationMessages` allows the agent to see any notes or reasoning that was recorded when a position was initially opened. `getStatus` offers a snapshot of the current state of each symbol being traded.

You can also directly control the strategy using methods like `commitPositionOpen`, `commitPositionClose`, `commitAverageBuy`, and `commitSignalNotify` which lets the agent tell the strategy to open, close, add to or note a position. All of these actions are carefully checked to ensure they are valid and won't disrupt the trading process.

## Class MCPSchemaService

The MCPSchemaService acts as a central place to store and manage schema definitions used within the backtest-kit framework. Think of it as a library of blueprints describing how different parts of the system communicate.

It keeps track of these blueprints, associating each with a specific name. 

When a new blueprint is added or an existing one is modified, the service performs a basic check to ensure it's structurally sound.

The service's main functions include:
*   Adding new schema blueprints.
*   Updating existing blueprints with new information.
*   Retrieving a specific blueprint when it's needed.

This makes it easy for other parts of the system to use and rely on consistent and validated blueprint definitions.

## Class LookupUtils

The `LookupUtils` class acts like a central tracking system for what's currently happening in your backtests and live trading sessions. It keeps a record of each activity, whether it's a backtest run, a live trading instance, or a step within a strategy. 

Whenever a backtest or live session begins, an entry is added to this system; when it finishes, the entry is removed. This helps manage and coordinate activities efficiently.

The `addActivity` function registers new activities, and it's safe to call it multiple times with the same activity - any duplicates are automatically handled. Similarly, `removeActivity` cleans up completed activities, which is very important to ensure accuracy, especially if errors occur.  `listActivity` lets you see a snapshot of all activities currently in progress. 

Essentially, it’s a tool for understanding what's running and ensuring everything is cleaned up properly, particularly relevant when dealing with parallel processing or potential errors during execution. 



It’s accessed through a singleton called `Lookup`, so you don't create instances of this class directly.

## Class LoggerService

The LoggerService helps standardize how logging happens across the backtest-kit framework. It automatically adds important details to your log messages, like the specific strategy, exchange, and frame being used, along with the symbol, timestamp, and whether it’s a backtest.

You can configure a custom logger to handle the actual logging, or if you don't provide one, it'll use a basic "no-op" logger that doesn't do anything.

The service includes properties for managing the context information and the underlying logger. 

You'll find dedicated methods for logging messages at different severity levels – general messages (`log`), detailed debugging information (`debug`), informational updates (`info`), and potential warnings (`warn`). Setting a custom logger through `setLogger` gives you full control over where and how those messages end up.


## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting framework. Think of it as a central point for all your logging needs, allowing you to easily switch between different storage methods without changing your code.

It offers several built-in options: you can store logs in memory (the default), persist them to disk for later review, use a dummy adapter that simply discards logs, or write them to a JSONL file. This adaptability comes in handy for different stages of development and testing.

You can easily change which storage method is used through convenient functions like `usePersist`, `useMemory`, and `useDummy`. The `clear` function is important to use when the working directory changes, ensuring your log adapter always uses the correct path. The `log`, `debug`, `info`, `warn` methods simply pass the logging responsibility to the currently configured adapter.


## Class LiveUtils

LiveUtils helps manage live trading operations, providing simplified access and crash recovery. It acts as a central point for running and monitoring strategies.

The `run` function initiates live trading for a specific symbol and strategy, continuously generating ticks while handling potential crashes and restoring from saved states. The `background` function offers a similar process without yielding results, suited for tasks like persistence or callbacks.

You can also retrieve details about a pending or scheduled signal with functions like `getPendingSignal` and `getScheduledSignal`.  Several methods give insight into the position’s status - total percentages closed, cost basis, effective price, invested amounts, and PnL.  `getBreakeven` assesses whether price has reached a break-even point.

`stop` halts new signal generation, while `commitClosePending` and `commitCancelScheduled` allow for manual intervention.  The `commitAverageBuy` function handles adding new DCA entries, and functions like `commitTrailingStop` let you adjust stop-loss levels. A suite of methods lets you examine positions details like maximum drawdown and profit distances.  Finally, `getReport` generates a comprehensive markdown report of activity, and `list` shows the status of all active trading instances.


## Class LiveReportService

LiveReportService helps you keep a detailed record of what’s happening with your live trading strategies. It's designed to capture every important moment—when a strategy is waiting, when a trade is opened, when it's active, and when it's closed—and store that information in a database. 

Think of it as a live monitoring system for your strategies.

It works by listening for signals from your strategy, logging all the details of each event, and writing those records into a database. This allows you to analyze performance in real-time.

You can easily start and stop the service from receiving signals – it prevents you from accidentally subscribing multiple times. And if you're done tracking, a simple unsubscribe function allows you to stop the data flow. 

The service relies on a logger to provide debugging output, and it handles the process of turning those live trading events into data that can be stored.

## Class LiveMarkdownService

This service helps you automatically generate and save reports on your live trading activity. It quietly listens for trading events—like when a strategy is idle, a trade is opened, is active, or is closed—and keeps track of all the details. 

It then uses this data to create neat, readable markdown tables summarizing your trades, and also calculates helpful statistics like your win rate and average profit. These reports are saved automatically in a log file named after your trading strategy.

You can subscribe to receive live updates, but be aware that you'll need to unsubscribe when you're done. The service also provides methods for retrieving the accumulated data, generating the full report, saving it to disk, and clearing the stored data, either for a specific trade setup or everything at once. It organizes data based on symbol, strategy, exchange, frame, and whether it's a backtest, giving you tailored reports for different setups.

## Class LiveLogicPublicService

LiveLogicPublicService acts as a central hub for managing live trading operations, streamlining the process by automatically handling essential context information like the strategy and exchange being used. It builds upon the LiveLogicPrivateService, making it easier to use by removing the need to constantly pass context data to functions – things like getting candles or generating signals just work without extra steps.

This service continuously runs, providing a never-ending stream of trading results (signals to open, close, or cancel positions).

It’s designed to be resilient, automatically saving and restoring its state in case of crashes, ensuring your trading process can recover. It uses the current time to keep everything synchronized in real-time.

The `run` method is the primary way to interact with it – you simply provide a symbol and the context, and it handles the rest, continuously generating trading results.


## Class LiveLogicPrivateService

The LiveLogicPrivateService is designed to manage and orchestrate live trading operations continuously. It functions as an ongoing process, constantly monitoring and reacting to market data.

It uses an infinite loop to keep checking for trading signals, and generates updates in real-time. You'll receive notifications only when trades are opened or closed, not when they're just active.

This system is built to be resilient; if something goes wrong, it automatically recovers and resumes trading from where it left off. It’s also designed to be efficient with memory, streaming results rather than storing large amounts of data.

The `run` method is the core of this service - simply provide a symbol and it will begin streaming the relevant trading updates.


## Class LiveCommandService

The LiveCommandService acts as a central point for interacting with live trading features within the backtest-kit framework. It's designed to be easily integrated into your applications through dependency injection.

It manages several internal components that handle different aspects of the live trading process, including logging, live logic execution, strategy and exchange validation, schema management, and risk and action validation. 

The `validate` function checks the validity of your trading strategy and its associated risk settings, optimizing performance by remembering past validation results. 

The core functionality is provided by the `run` method. This method initiates and manages the live trading process for a specific trading symbol, passing along information about the strategy and exchange being used. It's structured as an infinite generator that automatically attempts to recover from crashes, ensuring continuous trading operations.

## Class IntervalUtils

The `IntervalUtils` class helps you control how often certain functions are executed, especially within trading strategies. It provides a way to ensure that a function runs at most once during each specified time interval. There are two main ways it does this: in-memory, where the state is kept in the program's memory, and file-based, where the state is saved to a file so it persists even if the program restarts.

Think of it as a gatekeeper for your functions, preventing them from being called too frequently. The `fn` property is for functions that don't need persistent state, while `file` is for those that need to remember their last execution across program restarts. 

You can also clean up old function states using `dispose` and `clear`, and reset counters for a fresh start. Each function gets its own isolated "instance" managed by this system, ensuring it behaves predictably.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profit events your trading strategies have achieved. It acts as a central place to gather and present information about which strategies performed best for specific symbols, exchanges, and timeframes. 

You can think of it as a tool to examine your best-performing setups.

The `getData` method lets you pull out specific statistical information about those high-profit moments.  The `getReport` method generates a nicely formatted markdown report summarizing all the highest profit events.  Finally, `dump` allows you to automatically create and save that markdown report as a file for later review or sharing. You provide the symbol, strategy name, exchange, and timeframe you're interested in, and it handles the rest.

## Class HighestProfitReportService

This service keeps track of the moments your trading strategy achieves the highest profit. It listens for updates on the `highestProfitSubject` and records each new profit milestone.

Think of it as a reporter diligently noting down every time your strategy hits a new peak in profitability.

The service writes these significant events to a special database, formatted as JSONL records.  These records include crucial details about the trade, such as the timestamp, the trading symbol, the strategy and exchange names, the timeframe, and information about the signal itself (like its ID, position, current price, and stop-loss/take-profit levels).

You can tell the service to start monitoring by calling `subscribe()`. This kicks off the process of writing these profit records.  To stop it, use `unsubscribe()`, which will sever the connection and prevent further data logging.  `subscribe()` only runs once; calling it repeatedly will simply return the same unsubscribe function.

## Class HighestProfitMarkdownService

This service helps create reports showcasing the highest profit events for your trading strategies. It listens for profit data and organizes it based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these profit events, and the system prevents accidental multiple subscriptions. Unsubscribing clears all collected data and stops the data flow.

The `tick` function handles individual profit events, routing them to the correct storage area. You can retrieve accumulated statistics with `getData`, generate formatted reports with `getReport`, or save the reports directly to disk using `dump`.

To completely reset the data, use `clear`. Providing specific parameters to `clear` lets you wipe just a specific set of data; otherwise, it clears everything.

## Class HeatUtils

HeatUtils is a handy helper for creating and managing portfolio heatmaps. It streamlines the process of gathering and presenting performance data for your trading strategies. Think of it as a central place to pull together all the key stats—like total profit, Sharpe ratio, and maximum drawdown—for each symbol used by a strategy.

You can use it to get the raw data behind a heatmap, or to generate a ready-to-use markdown report that summarizes the performance of your strategy across different symbols.

Finally, it makes it easy to save those reports directly to your computer's file system, organizing them neatly with automatically generated filenames.


## Class HeatReportService

This service helps you track and analyze your trading performance by recording when signals close. It focuses on capturing data related to closed signals, specifically including profit and loss information.

The service listens for signal events and saves these closed signal events in a database to create heatmap visualizations of your portfolio's activity.

You can subscribe to receive these signal events and an unsubscribe function is provided to stop the data collection when no longer needed, preventing accidental duplicate subscriptions. The service ensures that it only records closed signals and ignores other signal actions. 






## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading strategies by creating portfolio heatmaps. It listens for trading signals and gathers data about how your strategies are performing.

It provides a detailed breakdown of your portfolio, showing key metrics like profit and loss, Sharpe Ratio, and maximum drawdown, both for individual assets and the portfolio as a whole. You can also generate reports in Markdown format for easy sharing and documentation.

The service keeps track of data efficiently using a memoized storage system, ensuring that data for each exchange, timeframe, and backtest mode is isolated. It's designed to handle potential errors in calculations and offers a way to clear accumulated data when needed. Subscribing and unsubscribing to receive updates is straightforward, and the service handles preventing duplicate subscriptions.


## Class FrameValidationService

This service helps you keep track of and ensure the validity of your trading timeframes, often referred to as "frames." Think of it as a central manager for your timeframe configurations.

It lets you register new timeframes with names and associated structures using the `addFrame()` function.

Before you try to use a timeframe in your backtesting or trading logic, you can use the `validate()` function to quickly confirm it’s been properly registered.

To get a quick overview of all the timeframes you've set up, use the `list()` function, which returns a list of all registered frames. 

The service is designed to be efficient, remembering the results of previous validations to avoid repeated checks. It uses `loggerService` to log and `_frameMap` to store frames.

## Class FrameSchemaService

The FrameSchemaService helps you manage and organize your frame schemas. It's like a central place to store and access these schemas, ensuring they’re consistent and well-defined. 

It uses a specialized system to keep track of your schemas in a way that catches errors early on, making your code more reliable.

You can add new schemas using the `register` method, update existing ones with `override`, and easily retrieve them by name using `get`. Before adding a schema, the service checks that it has all the necessary parts, guaranteeing a basic level of correctness.

## Class FrameCoreService

FrameCoreService is the central place to get timeframes for your backtesting. 

It's like a helper that relies on other services to do its job. 

Essentially, it takes a symbol (like AAPL) and a timeframe name (like '1m' for one minute) and figures out the dates that correspond to that timeframe. 

This is crucial for iterating through your historical data during a backtest. 

It uses `FrameConnectionService` to actually retrieve the timeframe data and `FrameValidationService` to ensure the data is correct.


## Class FrameConnectionService

The FrameConnectionService helps manage and route operations to the correct trading timeframe (frame) implementation. It acts as a central point for accessing and working with frames, automatically determining which frame to use based on the context.

To improve efficiency, it remembers (caches) the frame instances it creates, so it doesn't need to build them again.

Here's what it does:

*   **Automatic Frame Selection:**  It figures out which frame to use based on the context.
*   **Caching:** It stores and reuses frame instances to speed things up.
*   **Timeframe Boundaries:** It provides the start and end dates for the backtest period. This ensures the backtest focuses on a specific date range.
*   **Clearance:** It has a way to clear the cached frames, which is important for ensuring that each backtest run uses the freshest data and doesn't get stuck using old timeframes. This is typically handled automatically at the start of a backtest.



The `getFrame` function is the main entry point for obtaining a frame. The `getTimeframe` function is used to define the period for backtesting.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your configured exchanges and make sure they're set up correctly before you start trading. It acts as a central place to register new exchanges, check if an exchange is valid, and quickly retrieve a list of all registered exchanges. 

Think of it as a gatekeeper for your exchanges, preventing errors and ensuring a smooth trading process. 

It maintains a registry, allowing you to add new exchanges with their specific details. Before any operation is performed, it validates the existence of the exchange. The service also remembers its validation results to speed things up. 

You can use it to register new exchanges, verify that an exchange is valid, and get a complete list of all exchanges you've configured.

## Class ExchangeUtils

The ExchangeUtils class offers a collection of tools to simplify interacting with different exchanges. It acts as a central point for common exchange-related operations like fetching data and formatting values, ensuring consistency across your trading strategies. 

It's designed to be easy to use, automatically managing instances for each exchange to keep things isolated.

Here's a breakdown of what it can do:

*   **Fetch Historical Data:** You can easily retrieve candles (OHLCV data) for a specific trading pair and time interval. It figures out the starting date for you.
*   **Calculate Average Price:** It can compute the Volume Weighted Average Price (VWAP) based on recent candle data.
*   **Get Current Price:**  Quickly get the most recent closing price for a trading pair and interval.
*   **Format Values:** It helps you correctly format trade quantities and prices to match the specific rules of each exchange.
*   **Access Order Books and Trades:** Retrieve order book data and aggregated trades to understand market depth and activity.
*   **Flexible Candle Retrieval:**  Fetch raw candle data allowing for custom date ranges and limits. Importantly, it accounts for potential look-ahead bias when running backtests, using the backtest's execution time instead of the current time.

## Class ExchangeSchemaService

This service helps keep track of different exchange configurations in a safe and organized way. It uses a special storage system to ensure everything is typed correctly, reducing errors.

You can add new exchange configurations using `addExchange()` (represented by the `register` property) and get them back later by their name using `get`. 

Before adding a new exchange, `validateShallow` checks if it has all the necessary pieces and in the right format, preventing issues down the line. 

If an exchange already exists, you can update parts of it using `override`. Essentially, it’s a central place to manage and access all your exchange setups.

## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges within the backtesting framework. It intelligently combines exchange connection details with information about the specific backtest or live trading scenario – things like the date and whether it's a backtest.

It provides a suite of functions for retrieving essential market data, including:

*   Historical candle data, with the ability to fetch future candles specifically for backtesting.
*   Average prices (VWAP).
*   The closing price of the most recent candle.
*   Formatted price and quantity representations.
*   Order book information.
*   Aggregated trade data.
*   Raw candle data with highly customizable date and quantity retrieval.

Behind the scenes, this service streamlines the process of validating exchange configurations and memoizes this validation to optimize performance. It's a critical component, used internally by the system’s core logic for both backtesting and live trading environments.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs requests to the correct exchange based on the currently active context. To improve performance, it intelligently caches these connections, so it doesn't have to repeatedly establish them.

It provides a unified way to retrieve various data points like historical candles, the next set of candles based on the current time, average prices (calculated differently in live and backtest modes), and the close price for a specific interval. You can also request the order book and aggregated trades.

The service also handles formatting prices and quantities, making sure they conform to the specific requirements of the exchange being used, ensuring compatibility and preventing errors. Finally, it provides a flexible method to fetch raw candles allowing you to specify date ranges and limits.

## Class DumpAdapter

The DumpAdapter acts as a central point for persisting various types of data during a testing process, allowing you to choose where that data is stored. It uses a flexible system where you can easily switch between different storage options like files, memory, or even discarding the data entirely.

To start using it, you first need to activate it using `enable()`, and later deactivate using `disable()`. This ensures the adapter is listening for the right signals and managing its memory correctly.

The adapter provides methods like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, `dumpError`, and `dumpJson` to save different kinds of data—from detailed message histories to simple key-value pairs, table data, and complex JSON objects. It also supports special MCP status snapshots.

You have control over *how* this data is saved. You can use the default markdown format with `useMarkdown`, store data in memory with `useMemory`, ignore data with `useDummy`, or even write to both memory and markdown with `useMarkdownMemoryBoth`.  For advanced users, `useDumpAdapter` allows injecting custom storage implementations.  Finally, `clear()` allows you to refresh the adapter's internal caching.

## Class CronUtils

This utility class helps schedule periodic tasks in your backtesting framework, especially when running tests in parallel. It ensures that a specific task runs only once at a particular time, even when multiple parallel tests try to execute it simultaneously.

Think of it as a way to coordinate actions across different tests that might be triggered at the same moment. It uses a unique key system and in-flight promises to manage this coordination.

Here's a breakdown of the main parts:

*   **Entry Management:** Tasks are registered with names and generations to ensure uniqueness and prevent conflicts.
*   **Singleshot Coordination:**  A critical feature that prevents multiple tests from triggering the same task at the same time. It uses a promise-based system to ensure only one handler executes per boundary.
*   **Watermarking:** Tracks the last fired boundary to avoid accidentally re-firing tasks.  If a boundary was missed due to time jumps, the next tick will automatically trigger the missed tasks.
*   **Memory Management:** Regularly clears old entries and marks to prevent memory leaks.
*   **Lifecycle Integration:** Allows you to easily integrate scheduled tasks with the backtesting engine's lifecycle.

Essentially, `CronUtils` provides a robust and efficient way to manage periodic tasks in a parallel backtesting environment, ensuring accuracy and preventing unwanted side effects.


## Class ConstantUtils

The ConstantUtils class provides a set of pre-calculated percentages designed to help manage take-profit and stop-loss levels in your trading strategies, using a method inspired by the Kelly Criterion and incorporating risk decay. These constants, like TP_LEVEL1, TP_LEVEL2, and TP_LEVEL3, define points along the path to your final take-profit target. For instance, TP_LEVEL1 is set at 30%, so it activates when the price has moved 30% of the distance to your overall take-profit goal. Similarly, SL_LEVEL1 and SL_LEVEL2 offer early warnings and final exits for stop-loss management. These values allow for a layered approach to profit-taking and risk reduction.

## Class ConfigValidationService

The ConfigValidationService helps keep your trading configurations healthy and profitable. It checks your GLOBAL_CONFIG settings to make sure they make mathematical sense and won't lead to losing trades.

Think of it as a safety net that catches potential errors, like negative slippage or unrealistic profit margins. It verifies that your stop-loss and take-profit distances are set up properly, and ensures timeouts and retry attempts are reasonable. 

The service pays close attention to your take-profit settings, guaranteeing that it will cover all potential trading costs – slippage and fees – so you can actually profit when your target is reached. It’s designed to prevent problems before they impact your trading performance.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape. It makes sure that each column definition has all the necessary parts like a unique identifier, a descriptive label, a formatting function, and a setting to control visibility. 

It also verifies that the identifiers (keys) are all distinct within the groups of columns.

Essentially, this service acts as a safety net, catching errors early on to prevent problems down the line and ensuring your column definitions are structurally sound. You can use its `validate` method to check the configurations.

## Class ClientSweep

ClientSweep is a powerful tool designed to efficiently search for the best parameter settings for your trading strategies, especially when dealing with many ideas from different authors. It's like a fast-track version of backtesting, allowing you to quickly evaluate numerous strategies without the time-consuming process of running full backtests for each possibility.

It focuses on grading trading ideas in isolation, so it doesn’t consider how strategies interact with each other—that kind of swarm analysis is something you'd do later.

Here’s how it works:

First, it organizes your submitted trading ideas, removing duplicates and focusing on relevant ones. Then, it rapidly creates performance "profiles" for each idea by simulating how they would have performed over a defined period, pulling the necessary historical data as needed. It then learns from these ideas to create a list of authors whose ideas consistently underperform and excludes them from further consideration. Finally, it meticulously calculates how each idea would have fared across a range of parameter combinations, ranking them based on metrics like Sharpe ratio and total profit.

Importantly, ClientSweep isn't a replacement for thorough backtesting—it's a preliminary step. The parameter combinations it identifies as promising *must* be validated with a full backtest to ensure they truly work as expected. Think of it as a way to narrow down your options before doing the more detailed work.  The system keeps you informed at each stage with callbacks, and it's designed to be run repeatedly without needing to reset its state.

## Class ClientSizing

ClientSizing helps you figure out how much of an asset to trade based on a variety of strategies. 

It lets you use different sizing approaches, like fixed percentages, Kelly criterion, or ATR (Average True Range).

You can also set limits on how much you're willing to risk, both in terms of the minimum and maximum position size, and a maximum percentage of your capital.

If you need to do extra checks or keep records of your sizing decisions, you can add custom callbacks. Ultimately, ClientSizing works behind the scenes to help your trading strategy determine the right amount to invest in each trade. The `calculate` method is the core of this process – it takes input data and returns the calculated position size.

## Class ClientRisk

The ClientRisk component manages risk across multiple strategies, ensuring trading signals stay within defined limits. It acts as a central control point to prevent over-leveraging or violating pre-set risk parameters. Think of it as a safety net for your trading system, preventing it from taking on too much risk at once.

It's designed to work with several strategies simultaneously, analyzing their combined positions to enforce maximum concurrent positions and allowing for custom risk validations. This shared analysis helps prevent strategies from inadvertently triggering a chain reaction of risky trades.

The `checkSignal` method is the core functionality, evaluating signals and determining if they're permissible based on the established risk rules. There's also a concurrency-safe version, `checkSignalAndReserve`, which reserves a spot in the active position map to prevent race conditions. This ensures that the system accurately tracks positions and avoids situations where multiple strategies try to enter the same position simultaneously.

The system keeps track of active positions and persists them to disk, although this is skipped when running in backtest mode. Signals are registered with `addSignal` when opened and removed with `removeSignal` when closed. It's essential to ensure these paired calls are made to prevent reservation buildup.

## Class ClientFrame

The ClientFrame helps manage the timeframes used during backtesting. It’s responsible for creating arrays of timestamps representing the historical periods you want to analyze. 

To avoid unnecessary work, the ClientFrame caches these timeframe arrays, so it doesn't recreate them if you ask for the same timeframe again. You can control how far apart these timestamps are, choosing intervals from one minute all the way to one day. 

You can also provide functions to check if a timeframe is valid or to keep a record of what's happening. This class works closely with the core backtesting logic, powering the iteration through historical data. It takes parameters during setup to define its behavior. The key method, `getTimeframe`, retrieves the timestamp array for a specific trading symbol, using the cached results when available.

## Class ClientExchange

This `ClientExchange` component is the go-to for getting data from an exchange, acting as a bridge between your backtesting system and the actual market data. It handles fetching historical and future candle data, calculating the volume-weighted average price (VWAP), and formatting prices and quantities according to exchange rules. It’s designed with efficiency in mind, using techniques to minimize memory usage.

Need to grab historical price movements? The `getCandles` method does that, moving backward from a defined point in time. Planning a backtest and need to peek into the future?  `getNextCandles` fetches data moving forward.  The `getAveragePrice` method helps you understand recent trading activity by calculating the VWAP, and `getClosePrice` gives you the last known closing price for a specific interval.

Beyond basic prices, you can also format trade quantities and prices accurately with `formatQuantity` and `formatPrice`, ensuring your data is presented correctly.  The `getRawCandles` method offers flexible control over date ranges and data limits.  Finally, you can retrieve order book and aggregated trade data to gain a broader market understanding, all while preventing any potential look-ahead bias during your backtests.

## Class ClientAction

The `ClientAction` class is a central component for managing and executing custom action handlers within your trading strategy. Think of it as a bridge connecting the core strategy logic with your custom code that handles things like logging, notifications, or managing external state.

It handles the lifecycle of these action handlers, ensuring they are initialized only once and cleaned up properly when no longer needed. It also routes different types of events – signals from live trading, backtesting, or scheduled events – to the appropriate parts of your custom handler logic.

You can use `ClientAction` to build complex integrations with external services, like sending updates to a Telegram bot when a trade is executed or tracking performance metrics in a database.

Specific event methods such as `signalLive`, `breakevenAvailable`, and `riskRejection` each deal with different scenarios occurring during trading, allowing you to tailor your responses precisely. Events like `scheduleEvent` and `pendingEvent` provide a means for manually controlling and monitoring signals. 

Importantly, certain methods like `orderSync` and `orderCheck` are designed to pass exceptions directly, ensuring errors are handled explicitly in your custom code.

## Class CacheUtils

CacheUtils helps you easily cache the results of your functions, especially those used in trading strategies. It's like having a handy assistant that remembers calculations so you don't have to repeat them unnecessarily.

You can wrap regular functions with `fn` to cache their results based on time intervals – for example, caching data for every 5-minute candle.  The framework automatically handles invalidating the cache when the time interval changes.

For asynchronous functions, `file` provides persistent caching by storing results in files. These files are organized under a specific directory structure so you can easily find them. This is very useful for functions that take a long time to execute and you don’t want to recompute them every time.  Using the same function reference ensures that each function has its own independent cache.

If you need to completely clear the cache for a function—perhaps after a significant change in your strategy—`dispose` lets you do so.

`clear` and `resetCounter` functions are useful for cleaning up and resetting the caching system when your environment changes between strategy runs, ensuring everything starts fresh. They guarantee that the cache is properly initialized.


## Class BrokerBase

This class serves as a base for building adapters that connect your trading strategy to real-world exchanges. It handles all the core functionality you’d need, such as placing orders, managing stop-loss and take-profit levels, and tracking your positions.

Think of it as a starting point; you'll extend it to connect to specific exchanges.

Here's a breakdown of what it does:

**Initialization:** `waitForInit()` is your chance to set up connections to exchanges, log in, or load any necessary configurations before trading starts.  It's crucial to handle potential issues here like orphaned orders from previous crashes.

**Event Handling:**  The various `on...Commit` methods are called throughout the trading process:

*   `onOrderOpenCommit`:  When a new position is opened.
*   `onOrderActiveCheck`: Periodically checks if the open order is still active.
*   `onOrderScheduleCheck`: Periodically checks if a scheduled (limit) order is still waiting.
*   `onSignalActivePing`:  Provides information about the active state of an open position.
*   `onSignalSchedulePing`: Provides information about the scheduled (limit) order.
*   `onSignalIdlePing`:  Triggered when there's no trading activity.
*   `onSignalScheduleOpen`: Called when creating scheduled/limit orders.
*   `onSignalScheduleCancelled`:  Called when scheduled orders are canceled.
*   `onSignalPendingOpen`:  Called when a position starts.
*   `onSignalPendingClose`: Called when a position is closed.
*   `onOrderCloseCommit`: When a position is closed.
*   `onPartialProfitCommit`: When a portion of a position is closed for profit.
*   `onPartialLossCommit`: When a portion of a position is closed for a loss.
*   `onTrailingStopCommit`: When a trailing stop-loss is adjusted.
*   `onTrailingTakeCommit`: When a trailing take-profit is adjusted.
*   `onBreakevenCommit`: When the stop-loss is set to breakeven.
*   `onAverageBuyCommit`: When a new DCA (Dollar Cost Averaging) entry is added.

These methods have default, logging-only implementations.  You'll override these to interact with the actual exchange.  The framework automatically logs all events, making debugging easier.  You don’t need to implement methods you aren't using, as it provides default, no-op versions.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper for your trading operations, ensuring everything goes through a registered broker adapter. Think of it as a safety net – if something goes wrong during a trade, it prevents unwanted changes to your system's state.

During backtesting, the adapter essentially does nothing, allowing for faster simulations. When you're live trading, it forwards actions like opening, closing, and checking orders to the actual broker.

The `BrokerAdapter` automatically handles several events, like opening and closing signals, and periodically sends pings (checks) to the broker, but you'll also need to call certain methods yourself within your trading logic (like `Live.ts` or `strategy.ts`).

Here's a breakdown of what it does:

*   **Construction:**  It's initialized without any specific setup.
*   **Broker Handling:** It manages a `BrokerProxy` to communicate with the broker.
*   **Commit Methods:**  It provides methods like `commitOrderOpen`, `commitOrderClose`, and others that relay information to the broker.  These methods are essential for triggering trades. They are skipped during backtesting.
*   **Registration:** You must register a broker adapter using `useBrokerAdapter` *before* activating the adapter with `enable`.
*   **Activation/Deactivation:**  `enable()` subscribes to events and makes the adapter active, while `disable()` unsubscribes and deactivates it. `clear()` is used to reset the adapter for situations where the environment might change between test runs.
*   **Safeguarding Core Logic:** Certain critical operations (`commitPartialProfit`, `commitTrailingStop`, etc.) are intercepted before they modify core trading logic, allowing for an extra layer of validation and protection against unexpected issues. Throwing an error within these commits will halt the intended changes.



Essentially, it is the crucial bridge between your trading logic and the actual broker, offering control, safety, and flexibility.

## Class BreakevenUtils

This class provides tools for understanding and analyzing breakeven events in your trading strategy. It helps you gather and present data related to when your positions reached their breakeven point.

You can use it to get summarized statistics about your breakeven events, like the total number of times breakeven was achieved.

It can also create detailed markdown reports, showing a table of breakeven events with information such as the symbol traded, strategy used, entry price, current price, and time of the event.  This table includes important details to help analyze performance.

Finally, it allows you to easily save these reports as markdown files, which you can then share or review later. The files are named clearly using the symbol and strategy name, making them easy to organize.

## Class BreakevenReportService

The BreakevenReportService helps you track when your trading strategies reach breakeven. It essentially acts as a listener, paying attention to events where a trading signal hits its breakeven point. 

When a breakeven event occurs, this service diligently logs it, including all the details about the signal involved. 

This information is then stored in a database, allowing you to later analyze and monitor your trading performance.

To make sure you’re not accidentally recording events multiple times, it prevents multiple subscriptions.

You can start receiving these breakeven reports by using the `subscribe` function, which will return a function you can use to stop listening with `unsubscribe`.

## Class BreakevenMarkdownService

This service helps you automatically create reports detailing when your trading strategies hit breakeven points. It listens for breakeven events and organizes them by symbol and strategy. 

The service compiles this information into nicely formatted markdown tables that show you the details of each event. You can also get overall statistics like the total number of breakeven events.

It saves these reports directly to your computer's file system, keeping them organized in a dedicated directory. 

You can subscribe to receive these events in real time, or request reports and statistics on demand. It also offers a way to clear out the stored data when it's no longer needed, either for a specific strategy or everything at once.

## Class BreakevenGlobalService

This service, called BreakevenGlobalService, is a central point for managing breakeven calculations within the trading system. Think of it as a gatekeeper that makes sure everything related to breakeven is handled consistently and can be easily monitored.

It doesn't actually *do* the calculations itself; instead, it passes those tasks on to another service, BreakevenConnectionService. What it *does* do is log every action it takes, providing valuable insights into the breakeven process.

The service is injected into the main trading strategy, making it a key part of how the system works. It's also responsible for validating various elements like the trading strategy, associated risks, exchanges, and the specific data being used. To prevent unnecessary checks, validation results are cached.

The `check` function determines if a breakeven event should occur, while `clear` handles resetting the breakeven state when a trade closes. Both functions record these events for auditing and debugging.

## Class BreakevenConnectionService

The BreakevenConnectionService manages the tracking of breakeven points for trading signals. It's designed to efficiently handle these calculations by creating and storing a single breakeven tracking object for each unique signal, preventing unnecessary overhead.

Think of it as a factory that creates and manages these tracking objects, ensuring they are properly initialized and configured. It uses a clever caching system to remember which signals already have tracking objects set up.

The service works closely with the ClientStrategy and uses services like a logger and an event emitter to keep everything coordinated. When a signal is checked or cleared, this service handles the operations and cleans up the tracking objects when they're no longer needed. Essentially, it's responsible for making sure breakeven calculations happen correctly and resources are used efficiently.

## Class BacktestUtils

This class provides tools to run backtests and examine the results of your trading strategies. It's designed to be easily accessible and simplifies common backtesting operations.

The `_getInstance` property ensures each symbol-strategy combination has its own isolated backtest instance.

The `run` method executes a backtest, providing a stream of results (tick results, openings, closings, cancellations). The `background` method performs a backtest without directly yielding results, useful for tasks like logging.

Several methods allow you to query the status of a running backtest, such as retrieving pending or scheduled signals, checking for the existence of signals, determining breakeven points, and getting price/cost information about the current position.

You can also get insights into position details like total percentage closed, total cost, and the list of entries.  It calculates metrics like average entry price, PnL, and drawdown.

The framework offers fine-grained control. You can adjust trailing stops and take profits, manually close positions (partial or full), commit average buy entries, trigger signal notifications, and control the strategy's paused state.  Methods for early signal activation and manually manipulating signals are available.

Finally, there are functions to retrieve statistics, generate reports, and export them to a file. Listing backtest instances is also supported.

## Class BacktestReportService

This service is designed to record every significant event during a backtest, specifically focusing on how trading signals behave. It essentially keeps a detailed log of your strategy’s actions – when it's waiting, opening a position, actively trading, or closing a position.

The service connects to your backtest process to listen for these signal events and saves them. 
Each tick event, including all the details about the signal, is recorded for later examination.

You can subscribe to receive these events, and it’s designed to prevent accidental duplicate subscriptions. To stop listening, there’s an unsubscribe function that ensures everything is cleaned up properly. If you haven't subscribed, unsubscribing won't have any effect.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for incoming data ("ticks") during a backtest and keeps track of the signals generated by your trading strategies.

It organizes this information, creating tables filled with signal details, and then saves those tables as markdown files—easy-to-read documents—in a designated folder.

Here's a breakdown of its key functions:

*   **Data Collection:** It gathers information about closed trading signals for each strategy you're testing, ensuring data is properly organized and isolated for each symbol, strategy, exchange, and timeframe.
*   **Report Generation:** It can create reports summarizing the performance of your strategies, presenting the data in a clear, markdown-formatted table.
*   **Saving Reports:** These reports are automatically saved to disk, allowing for easy review and analysis. You can specify the file location.
*   **Clearing Data:** The service provides a way to clear out all the accumulated data, or just data for a specific symbol and strategy, allowing you to start fresh with new backtests.
*   **Event Handling:** You need to connect the service to your backtest process so it can receive and process the incoming "tick" data. It handles this by subscribing to events and offering a way to unsubscribe when you're finished.

## Class BacktestLogicPublicService

This service helps you run backtests, making it easier to manage the details of each test. It automatically handles things like the strategy name, exchange, and frame, so you don't have to pass them repeatedly to every function.

It uses a private service to do the actual backtesting work, but adds a layer to make the process more streamlined.

Here’s what you can do with it:

*   You can access logging and execution context information through the `loggerService` property.
*   It uses a `backtestLogicPrivateService` for the core backtesting logic.
*   The `timeMetaService` handles time-related data.
*   The `frameSchemaService` manages how data is structured.
*   The `exchangeConnectionService` manages connections to exchanges.
*   The `run` method is the primary way to start a backtest. You provide the symbol you want to test, and it handles the rest, sending results as a stream of signals.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService orchestrates the backtesting process, focusing on efficiency and flexibility. It works by first obtaining the timeframe information, then stepping through each timeframe, evaluating the strategy.

When a trading signal appears, the service retrieves the necessary candle data and executes the backtest logic. It intelligently skips forward in time until the signal is closed.

The results are streamed directly to the consumer, meaning that instead of building up a large array of results, they are delivered as they become available—this is very memory-friendly.  You can even stop the backtest prematurely by breaking the generator.

The service relies on several other core services, including those for managing strategy logic, exchanging data, handling timeframes, managing method contexts, and dealing with actions, time metadata, and price metadata.  The `run` method is the main entry point, taking a symbol as input and returning an async generator that yields different types of tick results.

## Class BacktestCommandService

This service acts as a central point to control your backtesting processes. It handles the core logic of running simulations, connecting different parts of your system, and ensuring everything is set up correctly.

Think of it as a gatekeeper; it validates your trading strategies and risk settings before allowing a backtest to proceed. It keeps track of these validations to prevent unnecessary repeats, speeding up your workflow.

The `run` method is the workhorse here. It's what you use to actually execute the backtest for a specific trading symbol, providing the strategy, exchange, and frame you're testing.  The result is streamed to you as a sequence of events, representing how the strategy would have performed. 

It relies on several other services for its functions, including those for logging, schema management, risk and action validation, strategy validation, and exchange/frame validation.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers, ensuring they are correctly set up and available when you need them. Think of it as a central manager for your actions. 

It lets you register new action handlers using `addAction`, and then `validate` will confirm an action handler exists before you try to use it, preventing errors. The service also remembers its validation results, so it’s faster to check actions you've validated before. 

Finally, `list` gives you a complete overview of all the action handlers you’ve registered.


## Class ActionSchemaService

The ActionSchemaService helps you organize and manage the blueprints for your trading actions. It acts like a central hub where you define what a particular action looks like – what methods it uses, and how it's structured.

This service is built to keep things type-safe, preventing errors and making sure your action definitions are consistent. It uses a specialized storage system to manage these action blueprints and checks that any methods being used adhere to specific guidelines.

You can register new action blueprints, updating or even modifying existing ones.  It verifies that the structure and method names are correct, making sure everything aligns with how your actions are intended to work. 

The service also lets you make small changes to existing blueprints without having to redefine them from scratch. Essentially, it makes managing complex trading action definitions much easier and more reliable.

## Class ActionProxy

The `ActionProxy` acts as a safety net when using custom logic within your trading strategies. It essentially wraps your code to prevent errors from crashing the entire system. Think of it as a protective layer that catches problems, logs them, and allows the trading process to continue smoothly.

It's designed to work with handlers that implement `IPublicAction`, providing a way to invoke them while ensuring stability.

Here's a breakdown of how it works:

*   **Error Handling:** Any issues within your custom methods (like `init`, `signal`, `breakevenAvailable`, etc.) are automatically caught and logged. The system doesn’t halt; it just reports the error and moves on.
*   **Flexibility:** It handles situations where you don't implement all the required methods – it defaults gracefully instead of breaking.
*   **Factory Pattern:** You create an `ActionProxy` using `fromInstance()`, which ensures that every action handler is wrapped with this safety layer.

The `ActionProxy` has several lifecycle methods, each responsible for handling specific events:

*   `init`: Initializes the action handler.
*   `signal`: Processes signals during trading.
*   `signalLive`: Processes signals in live trading mode.
*   `signalBacktest`: Processes signals during backtesting.
*   `breakevenAvailable`:  Handles events related to breakeven points.
*   `partialProfitAvailable`: Handles events related to partial profit levels.
*   `partialLossAvailable`: Handles events related to partial loss levels.
*   `pingScheduled`: Handles scheduled ping events.
*   `scheduleEvent`: Handles scheduled signal lifecycle events.
*   `pendingEvent`: Handles pending signal lifecycle events.
*   `pingActive`: Handles active ping events.
*   `pingIdle`: Handles idle ping events.
*   `riskRejection`: Handles risk rejection events.
*   `orderSync`:  A critical synchronization point for order placement (errors propagate).
*   `orderCheck`: Verifies the status of orders (errors propagate).
*   `dispose`: Cleans up resources.

It's important to note that `orderSync` and `orderCheck` deliberately *don't* have the error-catching behavior of the other methods; any errors they encounter are intentionally passed on. This is to guarantee that critical order-related issues are flagged immediately.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It's responsible for orchestrating the execution of actions defined in your strategy's configuration.

Essentially, when a strategy needs to take action – whether it’s based on a market tick, a scheduled event, or a risk assessment – this service steps in. It retrieves the necessary actions from the strategy's definition, ensures everything is valid, and then calls the appropriate handler for each action in a specific order.

Here's a breakdown of its key functions:

*   **Initialization:** It prepares each action for use by fetching its initial state.
*   **Signal Routing:** It delivers market signals to the registered actions, differentiating between backtesting, live trading, and other environments.
*   **Event Handling:** It handles various events, such as breakeven availability, partial profit/loss, scheduled pings, and order synchronization, routing them to the correct actions.
*   **Validation:** It performs validation checks on strategies, exchanges, frames, risks, and actions to ensure everything is set up correctly. This validation process is optimized to avoid repeated checks.
*   **Cleanup:** It releases resources when a strategy is finished.
*   **Data Clearing:** It allows for clearing of action data, either globally or for specific actions and strategies.

In short, the ActionCoreService ensures that your trading strategies execute consistently and reliably by coordinating the actions based on your strategy’s defined rules.

## Class ActionConnectionService

This service acts as a central hub for directing various actions related to your trading strategies. It's designed to route specific actions (like signals, profit targets, or scheduled events) to the correct implementation based on details like the action's name, the strategy being used, and the environment (live or backtest). 

To make things efficient, it remembers recently used actions, so you don't have to recreate them every time. It relies on a few supporting services for logging, schema management, and strategy core functionality.

The service provides several methods for handling different lifecycle events like signal generation, profit adjustments, scheduled tasks, and order-related checks. Each of these methods takes context information to ensure the right action is triggered. You can also clear out those cached actions if needed, essentially forcing a fresh creation. This helps ensure you are working with updated logic, particularly important during development or if you need to reset a strategy's state.

## Class ActionBase

This class, `ActionBase`, is your starting point for creating custom actions within the trading framework. It handles things like logging events and provides access to details about the strategy. Think of it as a template you extend to add your own logic – whether that’s for sending notifications, managing your data, or reacting to specific trading events.

When you extend `ActionBase`, you don't have to implement every method; default logging behavior is provided for most of them.

The lifecycle of an action handler involves initialization (`init`), handling various signal events (`signal`, `signalLive`, `signalBacktest`), responding to milestones like breakeven and partial profit/loss, monitoring signals via pings, and finally cleanup (`dispose`).

Several events are triggered during strategy execution:

*   `signal`: All-purpose signal events for both live and backtest.
*   `signalLive`: Only for live trading, use for actions needing real-world impact.
*   `signalBacktest`: Exclusively for backtesting, ideal for analysis and metric collection.
*   `breakevenAvailable`: Signals when the stop-loss reaches the entry price.
*   `partialProfitAvailable`: Notifies you when profit milestones are hit.
*   `partialLossAvailable`: Alerts you when loss milestones occur.
*   `pingScheduled`, `pingActive`, `pingIdle`: Provide information about the signal's status (waiting, active, or idle).
*   `riskRejection`: Indicates when a signal is rejected by the risk management system.

Remember to use the `dispose` method to release any resources your custom actions might use. Also, avoid implementing the deprecated order gates (`orderSync` and `orderCheck`) if possible to enable specific warning behavior.
