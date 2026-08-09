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

The WalkerValidationService helps you keep track of and confirm your parameter sweep setups, often used for finding the best settings for your trading strategies. It acts like a central registry for these setups, letting you add new ones and quickly check if a specific setup exists before you start using it. To speed things up, the service remembers the results of previous checks, so you don't have to re-validate the same configurations repeatedly.

You can think of it as a way to organize your parameter sweeps, making sure everything is in order before running your backtests.

Here's what it does:

*   **Adding Setups:** You use `addWalker` to register your parameter sweep configurations.
*   **Checking Validity:** `validate` makes sure your configurations and the strategies they use are properly defined and available. It goes a step further by checking the strategies' associated risks and actions, too.
*   **Listing Setups:** `list` gives you a complete overview of all registered parameter sweep configurations.



The service depends on several other services to achieve this including `loggerService`, `walkerSchemaService`, `strategyValidationService`, `strategySchemaService`, `riskValidationService`, and `actionValidationService`. It uses a private `_walkerMap` to store the registered walker configurations.

## Class WalkerUtils

WalkerUtils provides a set of helpful tools to manage and run walkers, which are essentially automated trading strategy comparisons. It simplifies the process of executing walkers and retrieving results by handling details like logging and automatically identifying relevant information from the walker's configuration. You can think of it as a central hub for interacting with walkers.

It offers methods for running walkers, both in the foreground and background—the latter being useful when you only need side effects like logging.  You can also stop walkers, gather their data, generate reports, and even save these reports as files. A handy list function lets you see the status of all running walkers. The system ensures that each walker instance is isolated for a specific symbol and walker combination, preventing conflicts.

## Class WalkerSchemaService

The WalkerSchemaService helps you manage and store information about different trading strategies, which we call "walkers." It uses a special system to keep track of these strategies in a way that prevents errors due to incorrect data types.

You can add new strategies using the `addWalker()` method (implemented through `register`), and then easily find them again by their name using `get()`.

Before a new strategy is added, it’s quickly checked to make sure it has all the necessary information (`validateShallow`).

If you need to update an existing strategy, you can use `override()` to make changes while keeping the original data intact.

The service relies on a logging system (`loggerService`) to keep track of what's happening and a tool registry (`_registry`) for safe storage.

## Class WalkerReportService

This service is designed to keep a record of how your trading strategies are being optimized. It essentially monitors the optimization process and stores the results in a database.

It listens for updates as your strategies are tested and logs important details like performance metrics and statistics. The service also tracks which strategy performs best and keeps an eye on how the optimization is progressing. 

To get it working, you subscribe to the optimization events.  You'll also get a function back when you subscribe that you need to call to stop listening. If you ever need to stop tracking the optimization, you can use the unsubscribe function.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they are being tested. It listens for updates from the trading simulation (the "walker") and keeps track of how each strategy is performing.

It uses a clever system to ensure each strategy's results are stored separately.

When a test run is complete, it generates easy-to-read markdown tables that compare the performance of your strategies, highlighting key metrics. These reports are then saved as files, making it simple to review and analyze your trading results.

You can subscribe to receive updates during the test or unsubscribe when you're done, and there are methods for clearing accumulated data if you need to start fresh. The service also offers ways to retrieve specific data points or generate customized reports, and you can control where the reports are saved.


## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, also known as walkers. It builds upon a private service to automatically pass important information like the strategy's name, exchange, frame, and walker name along with each request. 

Think of it as a layer that simplifies how you execute your strategies, ensuring the right context is always available.

The `run` method is the primary way to initiate this process.  You provide a symbol (like a stock ticker) and some context information, and it will run your backtests for all strategies associated with that symbol. This method returns a generator that produces results as they become available.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies by orchestrating their backtesting processes. It acts as a central coordinator, ensuring each strategy runs and its progress is tracked.

Think of it as a pipeline: it takes a symbol, a list of strategies you want to compare, and a key metric to evaluate them by. 

As each strategy finishes its backtest, you receive updates, allowing you to monitor the comparison in real-time.  Ultimately, the service delivers a ranked list of all strategies, helping you identify the best performers. 

It relies on other services – BacktestLogicPublicService, BacktestMarkdownService, and WalkerSchemaService – to handle the actual backtesting and result formatting.


## Class WalkerCommandService

WalkerCommandService acts as a central hub for accessing and managing walker functionality within the backtest-kit framework. It's designed to simplify how you interact with core components and makes it easy to integrate them into your applications.

Think of it as a helper service providing convenient access to various validation and execution services.

Here's a breakdown of what it offers:

*   It bundles together important services like the walker logic service, schema services, and validation services for strategy, exchange, frame, and walker configurations.
*   It offers a `validate` function to rigorously check your walker and strategy setups. This validation is performed twice to ensure accuracy and prevent errors, serving as an extra layer of protection.
*   The `run` function is how you initiate the comparison process for a specific trading symbol, passing along crucial information about the walker, exchange, and frame being used. It provides results in an asynchronous generator, allowing for efficient processing.

## Class TimeMetaService

The TimeMetaService helps you reliably access the current candle timestamp, even when you're not directly within the regular trading loop. It keeps track of the latest timestamp for each symbol, trading strategy, exchange, and timeframe combination.

Think of it as a convenient place to look up the current time for your strategies. 

It essentially provides a synchronized, up-to-date timestamp, automatically updated by the system. It offers a shortcut when you need the current time outside of a strategy tick, such as when executing a command between ticks. If the timestamp isn’t immediately available, it will wait briefly.

You can clear the cached timestamps to ensure you’re working with fresh data, either for all strategies or just a specific one. The service is managed automatically, keeping things updated and preventing outdated information.


## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions separate and clean. It prevents one test from accidentally affecting another by temporarily disconnecting the event-bus, effectively creating isolated environments.

You can use `createSnapshot` to create a backup of how everything is currently connected to the event bus.  This function essentially clears the active listeners for the global event subjects.  After your backtest, you can use the returned `RestoreSnapshot` function to put everything back to how it was before, ensuring no lingering effects from the test.

## Class SyncUtils

SyncUtils helps you understand what's happening with your trading signals by providing information about their lifecycle. It gathers data from signal opening and closing events, letting you analyze overall trading activity.

You can pull out key statistics like the total number of signals, opens, and closes. It can also build detailed markdown reports—essentially, nicely formatted tables—showing all the signal events for a specific symbol and strategy.

These reports include crucial details for each signal: what triggered it (open or close), the trade direction, price points, profit/loss information, and timestamps.

Finally, SyncUtils can save these reports as markdown files, automatically creating the necessary folder structure, making it easier to review your trading history. The filenames are designed to clearly identify the symbol, strategy, exchange, frame and whether the data is from a backtest or live run.

## Class SyncReportService

The SyncReportService is designed to keep a record of what's happening with your trading signals, specifically when they're created and closed. Think of it as a detailed log for auditing and understanding your trading activity.

It listens for events related to signals – when a new signal is opened (like when an order is filled) and when a signal is closed (when a position is exited). For each of these events, it records important information, like the details of the signal and the profit or loss when it closes.

You can easily start and stop the service from listening to these events using the `subscribe` and `unsubscribe` functions, ensuring that you don't accidentally subscribe multiple times. The service uses a logging system to help you debug and understand how it's working. The captured data is then sent to a storage system for safe keeping.

## Class SyncMarkdownService

This service is responsible for gathering and presenting information about signals, specifically when they're opened and closed. It listens for signal events and organizes them, creating reports you can save.

Think of it as a data collector and reporter for your trading signals.

Here's a breakdown of what it does:

*   **Tracks Signal Events:** It monitors signal openings and closings, associating each event with specific details like the asset traded, the trading strategy, the exchange, and the timeframe used.
*   **Generates Detailed Reports:** It compiles these events into easy-to-read markdown tables that show the entire lifecycle of a signal, including important details like timestamps and closing reasons.
*   **Provides Statistics:** You can get summaries of the events, such as the total number of signals, how many were opened, and how many were closed.
*   **Saves Reports:** You can save these reports as markdown files to a designated directory.
*   **Data Management:** It allows you to clear and reset the collected data, either for a specific trading scenario or everything at once.

You subscribe to receive signal events, and when you are done you can unsubscribe. This will detach the service from any signal events and clears the data.


## Class SweepValidationService

The SweepValidationService helps keep track of all your trading strategies (sweeps) and ensures they're properly set up. It makes sure that when a sweep is used, it actually exists and is compatible with the exchange it's designed for.

Think of it like a security guard for your sweeps – it won't let you register the same sweep twice, and it checks that everything is in order before allowing a sweep to be used.

Here's what you can do with it:

*   **Register a new sweep:** Tell the service about a new strategy, including its details.
*   **Verify a sweep:** Confirm that a particular sweep is valid and ready to use.
*   **Get a list of all sweeps:** See a complete list of all registered sweeps and their configurations.

It relies on other services – a logger to record information and an exchange validation service to check compatibility – to function correctly. The service also keeps a record of sweeps in a map for easy access and validation.

## Class SweepUtils

The SweepUtils framework helps you explore and evaluate numerous trading ideas simultaneously. It’s designed to quickly test a wide range of strategies and identify potential winners through a process called a "parameter sweep."

Imagine running hundreds of trading strategies at once, each with slightly different settings, and getting a clear picture of which ones perform best. That's essentially what SweepUtils does. It profiles each idea by analyzing a single candlestick and then mathematically evaluates the results across a grid of defined parameters.

You can fine-tune several aspects of these strategies:

*   **Exit Strategies:** Control how trades are closed using hard stops, trailing stops, profit locks, and time limits.
*   **Entry Rules:** Every trading idea gets a chance to enter a trade, with no initial filtering or restriction based on author.
*   **Author Performance:**  Each author's ideas are assessed independently based on their track record (hits, misses, hit rate).

The framework then provides a comprehensive report, including the top four strategies based on metrics like Sharpe Ratio, Sortino Ratio, profit, and recovery, along with detailed trade-level reports for each idea.

The `run` function is the core of the system. It takes a set of trading ideas and runs the entire simulation process, from profiling to ranking.  Before running, the system removes redundant or incomplete ideas to ensure data quality. It’s important to understand that the final validation and the ultimate test is running the selected parameters through a full backtest using the `Backtest.run` function.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage definitions for sweep operations. Think of it as a directory for your sweep schemas.

It ensures basic correctness when a new schema is added, checking for essential information.

The system keeps track of these schemas, associating them with specific sweep names.

You can register new schemas, effectively adding them to the directory. If a schema already exists with the same name, it will be replaced.

It's also possible to modify existing schemas by only changing certain parts, and this service provides a way to retrieve a registered schema given its name. This makes it easy for other components to access and use the schema information.

## Class SweepGlobalService

SweepGlobalService acts as the main gateway for interacting with sweep simulations. Think of it as the front door to the sweep system.

It checks to make sure the requested sweep exists and is compatible with the exchange before passing the request on. 

This service manages connections and keeps track of sweep data to improve performance. 

The `run` function is your go-to method to kick off a complete sweep simulation; you provide the symbol, sweep name, and a list of ideas to evaluate. It handles the entire process, from initial setup to ranking the results.


## Class SweepCoreService

This component, the SweepCoreService, acts as the central engine for running sweep simulations. It ensures everything is set up correctly before launching a simulation, checking that the necessary resources exist and are available. 

Think of it as a gatekeeper – it sits between the initial request and the actual simulation execution. It relies on other services to handle logging, connection management, and validating the sweep’s setup.

The core function, `run`, takes details about the symbol, sweep name, and ideas, then orchestrates the entire simulation process, which includes filtering ideas, evaluating performance, and generating rankings.


## Class SweepConnectionService

This service manages connections and client instances for different sweep operations. It's responsible for creating and maintaining these clients, ensuring you don’t recreate them unnecessarily.

Think of it as a central point for handling sweep-specific configurations.

The `getSweep` method is key – it retrieves the appropriate client for a given sweep name, creating it the first time you need it. This client is cached, so subsequent requests for the same sweep are much faster. If the sweep’s definition is missing certain details, it will fill in some defaults.

The `run` method is the workhorse; it executes a complete sweep simulation based on provided data, handling steps like profiling, filtering, grid evaluation, and ranking.

Finally, `clear` allows you to discard these cached clients.  This is useful when you need to ensure that you’re working with the latest sweep definitions or to release resources.

## Class StrategyValidationService

This service helps manage and check your trading strategies, making sure they're set up correctly before you start trading. It keeps track of all your strategies in a registry and verifies that each one exists and has the necessary settings like risk profiles and actions, if you're using them. To improve speed, it remembers the results of previous checks, so it doesn't have to repeat the same validations again.

You can add new strategies using `addStrategy()`, and get a list of all registered strategies with `list()`. The `validate()` function confirms that a strategy exists and its related configurations are valid. 

Essentially, this service acts as a quality control layer for your trading strategies, ensuring they are ready to be used.

## Class StrategyUtils

StrategyUtils is a handy tool for analyzing how your trading strategies are performing. It acts as a central point to access and organize information about events triggered by your strategies, like when a trade is canceled, profits are taken, or losses are managed.

You can use it to get statistical data, providing insights into the frequency of different actions your strategies take. It also helps create nicely formatted markdown reports that summarize these events in a clear, tabular format. These reports include key details like the symbol, action taken, price, and timestamps.

Finally, you can easily export these reports as files, creating a permanent record of your strategy's activity, complete with a filename that incorporates the symbol, strategy name, exchange, frame, and a timestamp for easy tracking. It handles creating the necessary directories for these files as well.

## Class StrategySchemaService

This service helps keep track of different strategy schemas, essentially blueprints for how trading strategies are structured. It uses a special system to ensure everything is typed correctly and consistently.

You can add new strategy schemas using the `addStrategy()` method, and retrieve them later using their names. Before a schema is added, it's quickly checked to make sure it has all the necessary components and data types.

If a strategy schema already exists, you can update parts of it using the `override()` method. Finally, `get()` lets you pull a specific strategy schema from the registry by its name. The service also has internal components for logging and managing its data.

## Class StrategyReportService

This service is designed to keep a detailed record of your trading strategy's actions, like canceling signals, closing positions, and taking profits or losses. It creates individual JSON files for each event, offering a clear audit trail of what your strategy is doing.

Think of it as a persistent log – unlike other reporting methods that might hold events in memory, this one immediately writes everything to disk.

To start using it, you need to "subscribe" to the service. Once subscribed, it will record events such as canceled signals, closing trades, partial profit/loss adjustments, trailing stop adjustments, and breakeven movements.  You can then "unsubscribe" when you no longer need to track these events.  The service uses a special method to ensure only one subscription is active at a time.

The service also provides properties and functions for logging various trade-related events, each providing details about the trade, its context, and the relevant financial metrics.

## Class StrategyMarkdownService

This service helps track and report on your trading strategy's activity during backtesting or live trading. It gathers details about events like signals being canceled, orders being closed, and partial profits/losses taken.

Instead of writing each event immediately to a file, this service temporarily stores them in memory, which is faster. Think of it as a buffer. This lets you analyze all events together and generate a nice, organized report later.

Here’s how it works:

1. **Start Listening:** You tell the service to start listening for events using `subscribe()`.
2. **Events Happen:** The service automatically records events as your strategy executes.
3. **Get the Report:**  You can request the gathered data using `getData()` to see raw statistics or `getReport()` to generate a formatted markdown report. `dump()` creates a file with the report.
4. **Stop Listening:**  When you’re done, you stop the service using `unsubscribe()`, which clears the stored data.

It keeps track of events for each symbol, strategy, exchange, and frame. It creates a space to temporarily hold events and caches these spaces to improve efficiency.

The service gives you flexibility: you can clear data for specific strategy combinations or wipe everything clean. You can also customize the columns included in the generated reports.


## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for managing trading strategies within the backtest-kit framework. It's responsible for handling validations, retrieving position information, and coordinating execution context. Think of it as the go-to place for critical strategy-related operations.

It uses several internal services, including `StrategyConnectionService` and `ExecutionContextService`, to manage connections, inject data, and maintain the overall state.

**Key functionalities include:**

*   **Validation:**  It ensures strategy and risk configurations are correct and efficiently reuses validation results to avoid unnecessary checks.
*   **Signal Retrieval:**  It allows you to get information about pending signals, like the estimated remaining time or profit/loss metrics.
*   **Position Details:** Provides detailed information about a position, such as its entry prices, costs, average buy history, and potential profits/losses. It handles complex calculations related to DCA entries.
*   **Control Functions:**  Offers methods to pause, stop, or cancel scheduled signals or to manually trigger actions like partial profits or stop-loss orders.
*   **Backtesting & Ticking:**  Provides methods to run strategies in backtest mode and advance them through time.
*   **State Management:** Handles clearing caches of strategy data.

Essentially, `StrategyCoreService` provides a structured way to interact with and monitor the behavior of trading strategies within the backtest environment. It encapsulates a lot of the complex logic involved in managing a running strategy.

## Class StrategyConnectionService

This framework provides a way to route trading strategy operations to the correct implementation. It handles strategy routing based on symbol and strategy name, caching these implementations for efficiency. Before operations, it ensures the strategy is initialized. It manages both live (tick) and historical (backtest) trading.

Here's a breakdown of key aspects:

*   **Strategy Routing:** It automatically directs calls to the right strategy implementation based on the specific symbol and strategy being used.
*   **Caching:** The system remembers previously created strategy implementations to avoid repeated creation, speeding up the process.
*   **Initialization:**  It makes sure strategies are properly set up before they start running.
*   **Multiple Operations:** The framework supports both real-time trading (tick) and historical simulations (backtest).

The `StrategyConnectionService` itself offers various methods for managing strategies, including:

*   **Retrieving Strategies:** Functions like `getStrategy` get existing strategy implementations.
*   **Monitoring Signals:**  Methods like `getPendingSignal`, `getScheduledSignal` provide information about active trading signals.
*   **Tracking Performance:** You can get data like total position size, cost, and profit/loss using functions like `getTotalPercentClosed`, `getPositionPnlCost`.
*   **Controlling Strategies:** Functions enable pausing, stopping, or canceling operations on strategies.
*   **Managing Partial Positions:** Methods related to `partialProfit` and `partialLoss` allow for closing portions of a position.
*   **Adjusting Signals:**  `trailingStop` and `trailingTake` allow adjustments to the profit and loss limits.
*   **Validation:** Several validation methods let you check if an action would succeed without actually executing it.

## Class StorageLiveAdapter

This component acts as a flexible intermediary for managing how trading signals are stored, allowing you to easily switch between different storage methods. It’s designed to work with various storage backends, like persistent disk storage, in-memory storage, or even a dummy adapter for testing.  The default behavior uses persistent storage on your disk.

You can easily change the storage mechanism using methods like `useDummy`, `useMemory`, and `usePersist`, which quickly switch to those storage types respectively.  `useStorageAdapter` gives you even more control, letting you specify your own custom storage adapter.

The `getInstance` property is an optimization; it creates and remembers the storage adapter you’re using, so it doesn’t have to rebuild it every time you need it. If you change your working directory, use `clear` to force a refresh of this cached instance.

Methods like `handleOpened`, `handleClosed`, `findById`, and `list` are passed through to the currently active storage adapter, making them consistent regardless of which storage type you are using. There are also ping event handlers for signals that are active or scheduled, ensuring their `updatedAt` timestamp is current.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how backtest data is stored, allowing you to easily switch between different storage methods. It acts as a bridge between the backtest kit and the actual storage mechanism, using a design pattern that allows you to swap out storage implementations without changing the core testing logic. By default, it uses in-memory storage, but you can switch to persistent storage (which saves data to disk) or a dummy storage (which doesn't store any data at all, useful for testing).

You can choose which storage to use with handy shortcuts like `useDummy`, `usePersist`, and `useMemory`. The `clear` method is important if you're running multiple strategy iterations and the working directory changes between them, ensuring a fresh storage instance for each run.  The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods pass signal events along to the currently selected storage adapter. You can also find signals by ID or retrieve a list of all stored signals.  Finally, `handleActivePing` and `handleSchedulePing` update signal timestamps when ping events are received.

## Class StorageAdapter

The StorageAdapter acts as the central hub for managing both historical backtest data and real-time trading signals. It automatically keeps track of signals as they are generated.

You can easily retrieve signals whether they are from backtesting or live trading environments through a consistent interface.  To prevent redundant subscriptions, the adapter uses a special mechanism to ensure it only subscribes once.

The adapter offers methods to enable and disable signal storage; enabling connects it to the signal source and disabling disconnects it.  You can find individual signals by their unique ID, or list all signals specifically from backtest or live trading.  It's designed to be safe to call the disable function repeatedly without causing issues.

## Class StateLiveAdapter

The StateLiveAdapter provides a flexible way to manage trading state, allowing you to easily swap out different storage methods for your data. It's designed to handle situations where you need to monitor trades and automatically adjust your strategy based on their performance – for example, using a large language model to analyze trade behavior.

It uses a pattern that lets you change how your state is stored without altering the core logic of your trading system. By default, it saves data to a file, ensuring your progress isn't lost even if your application restarts. However, you can choose to store data only in memory (useful for quick testing) or even use a dummy adapter that discards any data written (helpful for debugging).

The adapter keeps track of key information like peak performance and how long a position has been open, which are used to make decisions about whether a trade is performing as expected. When you’re finished with a specific trading signal, there's a way to clean up the stored data associated with it. 

You can switch between different storage methods – like using in-memory storage, file system storage, or a dummy adapter – and even create your own custom storage implementations. Finally, if you need to refresh your data based on changes in your working directory, you can clear the cached instances.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage the state during backtesting, allowing you to easily switch between different storage methods. It's designed to track information like peak percentage and time a position has been open, which is useful for things like automated trading rules based on large language model (LLM) insights.

You can choose between several built-in storage options: a simple in-memory solution (default), a file-system based one for persistence, and a dummy adapter for testing. The `useLocal`, `usePersist`, and `useDummy` functions let you quickly change which storage method you’re using.  If you need more customization, `useStateAdapter` lets you plug in your own adapter implementation.

The `disposeSignal` function is important for cleaning up old data when a signal is finished, ensuring that you’re not holding onto unnecessary information. `getState` and `setState` are used to read and update the tracked state values. Finally, `clear` is handy for refreshing the state when the working directory changes.

## Class StateAdapter

The StateAdapter acts as a central hub for managing both backtesting and live trading states. It carefully handles subscriptions to signal events, automatically cleaning up any lingering instances when a signal is finished. 

To start using the state storage, you'll use the `enable` property—this ensures that the subscriptions happen only once. 

If you need to stop the state storage, use `disable` which can be called multiple times without issue.

You can retrieve the current state using `getState`, providing details like signal ID and a timestamp.  Similarly, `setState` lets you update the state, directing the changes to either the backtest or live environment based on configuration.

## Class SizingValidationService

This service helps you keep track of and confirm your position sizing strategies, making sure they're set up correctly before you start trading. 

It acts as a central place to register your sizing approaches, like fixed percentage or Kelly Criterion, so you don't have to remember every detail yourself.

Before using a sizing strategy, you can ask this service to check if it’s registered – this avoids potential errors.

To speed things up, the service remembers the results of these checks, so it doesn't have to re-validate strategies repeatedly.

You can also easily see a list of all the sizing strategies currently registered with the service.




Adding a sizing strategy is straightforward using `addSizing`, while `validate` is how you confirm a strategy exists.  Finally, `list` gives you a quick overview of your configured sizing approaches.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of sizing schemas, which are essentially blueprints for how trades are sized. It uses a specialized registry to store these schemas in a type-safe way, ensuring consistency and preventing errors.

You can add new sizing schemas using `register`, or update existing ones with `override`. 

If you need to use a specific sizing schema, `get` allows you to retrieve it by its name.

Before a sizing schema is registered, `validateShallow` checks if it has the necessary properties and types, ensuring it's structurally sound. The service also has access to logging and execution context information for debugging and monitoring purposes.


## Class SizingGlobalService

The SizingGlobalService is a central component that determines how much of an asset to trade in each operation. It uses a connection service to perform these calculations and includes validation steps to ensure accuracy. Think of it as the engine that translates your risk tolerance and trading strategy into concrete position sizes. 

It has a logger for tracking what's happening and relies on other services for sizing calculations and validations. The core functionality lies in the `calculate` method, which takes your desired risk parameters and trading context to produce the final position size. This is the part used both behind the scenes and in the public trading tools.

## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategy determines position sizes. It acts as a dispatcher, directing sizing requests to the specific sizing implementation that’s been set up.

Think of it as a central hub that finds the right tool for the job when calculating how much of an asset to trade.

It remembers which sizing tools it’s used before, a process called memoization, so it doesn’t have to recreate them every time. This speeds up the sizing process considerably.

You specify which sizing method to use with a parameter, allowing for flexibility.

This service calculates position sizes by considering risk and utilizing different sizing approaches, like fixed percentages or methods based on volatility. If your strategy doesn’t use sizing configurations, you'll use an empty string for this parameter.


## Class SessionLiveAdapter

The SessionLiveAdapter helps manage and store data during live trading sessions, offering flexibility through a design that allows easy swapping of data storage methods. It's built around the idea of adapters, so you can choose how your session data is handled – whether it’s kept in memory, saved to a file, or simply discarded.

By default, the adapter stores session data persistently on disk, ensuring that it survives restarts. You can easily switch to an in-memory adapter for testing or a dummy adapter if you just want to track data without saving it.

The adapter intelligently remembers which adapter is active, making it efficient. If you need to change the way your data is stored – for example, when your working directory changes – there’s a `clear` function to refresh this memory.

You can read and update session values using the `getData` and `setData` methods, providing access to the current data associated with a specific symbol, strategy, exchange, and frame. `useLocal`, `usePersist`, `useDummy` and `useSessionAdapter` provide a convenient way to switch the underlying data storage mechanism.

## Class SessionBacktestAdapter

The SessionBacktestAdapter helps manage and store data during backtesting runs, offering flexibility in how that data is handled. It acts as a bridge, allowing you to easily swap out different storage mechanisms without changing the core backtesting logic.

By default, it uses an in-memory storage, meaning data is lost when the process ends.

However, you can switch to file-based storage to save data to disk, or to a dummy adapter if you only care about processing and not storing the results.

You can also create your own custom storage adapters.

The adapter keeps track of session data based on the trading symbol, strategy name, exchange, and frame type, and it remembers previously used adapters for efficiency.

To clear the stored adapters, use the `clear` method; this is particularly useful when the working directory changes during a test.

The `getData` method lets you retrieve a specific data point from a past backtest session, and `setData` allows you to update the data stored for a session.

## Class SessionAdapter

The SessionAdapter acts as a central point for handling data storage during both backtesting and live trading. It intelligently directs data operations to either the backtest-specific storage or the live trading storage, depending on whether you're running a simulation or a real-time trade.

You can use `getData` to retrieve stored values associated with a particular symbol, taking into account the strategy, exchange, frame, and whether you're in backtest mode.  Similarly, `setData` allows you to update those stored values, again ensuring the correct storage location is used based on your backtest settings.


## Class ScheduleUtils

This class, `ScheduleUtils`, helps you keep track of and understand how your scheduled signals are performing. Think of it as a central hub for managing and reporting on signals that happen at specific times. It bundles together several functions for easily collecting data and creating reports.

It's designed to be used easily and conveniently, as it's available as a single, ready-to-use instance.

You can use it to:

*   Gather data about signals that are waiting to be processed.
*   See how many signals have been canceled, and calculate cancellation rates.
*   Calculate how long signals are waiting on average.
*   Generate readable markdown reports that summarize these statistics for a specific trading strategy and symbol.

The `getData` method retrieves the statistics. The `getReport` method creates a formatted markdown report.  Finally, the `dump` method allows you to save these reports directly to a file. This helps with monitoring and analysis of your automated trading processes.

## Class ScheduleReportService

This service helps you keep track of when signals are scheduled and what happens to them over time. It listens for events related to signals—when they're initially scheduled, when they start processing, and when they’re cancelled. 

The service automatically records the time it takes from when a signal is scheduled until it either starts or is cancelled, which is useful for understanding potential delays in your trading.

You can tell it to start listening for these events and later tell it to stop. It makes sure it's only listening once to avoid duplicate entries. The service uses another service for logging debug information and processes incoming signal ticks, handling the various lifecycle events like scheduling, opening, and cancellation.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and analyze your scheduled trading signals. It monitors when signals are scheduled and cancelled, keeping a record of each event for every strategy you're using. 

It then organizes this data into easy-to-read Markdown reports that include details about each signal, along with key statistics like cancellation rates and average wait times. These reports are automatically saved to your logs directory.

The service allows you to subscribe to signal events, unsubscribe when you no longer need to track them, and access specific data or reports for individual strategies or all of them. You can even clear the collected data when it’s no longer needed, either for a specific strategy or everything at once. It uses a storage system to keep the data separate for each combination of symbol, strategy, exchange, frame, and backtest.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management setups. It essentially acts as a central place to register different risk profiles and make sure they're properly defined before you use them in your trading strategies. 

Think of it as a checklist: you add your risk profiles to the service’s registry, and then use the validation tool to confirm that a profile exists before proceeding. To improve efficiency, the service remembers the results of previous validations so it doesn’t need to repeat the same checks. You can also view a complete list of all registered risk profiles.

Here’s a quick rundown of what you can do:

*   **addRisk():**  This lets you add a new risk profile to the service’s registry.
*   **validate():**  This method checks if a specified risk profile actually exists.
*   **list():**  This retrieves a full list of all the risk profiles currently registered with the service.

## Class RiskUtils

This utility class helps you analyze and understand risk rejection events within your trading system. Think of it as a tool to diagnose why your strategies might be getting flagged for potential issues.

It gathers information about risk rejections – things like when they happened, which symbol was involved, the strategy used, and the details surrounding the rejection.

You can use it to pull out key statistics like the total number of rejections, broken down by symbol and strategy, providing a quick overview of potential problem areas.  It also creates easy-to-read markdown reports that display all the rejection events in a table format, including details like price, position, and the reason for the rejection.

Finally, you can automatically save these reports to files, making it simple to keep track of risk events and share them with others. These files are named clearly, so you can easily identify which symbol and strategy they relate to.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas in a structured and type-safe way. It uses a registry to store these schemas, making it easy to keep track of them.

You can add new risk profiles using `addRisk()`, effectively registering them within the system. To get a specific risk profile back, you simply use its name with the `get()` method.

Before adding a risk schema, `validateShallow()` checks it to make sure all the essential parts are present and in the right format.

If you need to update an existing risk profile, the `override()` function allows you to make changes without replacing the entire schema. 

The service relies on a logger to help with debugging and monitoring its operations.

## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system blocks trades. It acts like a detailed logbook for rejected signals, capturing why they were rejected and what the pending trade would have looked like.

This service connects to your risk management system and listens for signals that are flagged as unacceptable. Every time a signal is rejected, it records the details – the reason for the rejection and information about the intended trade – and saves them for later review.

You can set up the service to start listening for these rejection events, and when you're done, you can easily tell it to stop listening. The service is designed to prevent accidentally subscribing multiple times, ensuring a clean and organized tracking system.


## Class RiskMarkdownService

This service helps you create and store reports about rejected trades, specifically focusing on why those rejections happened. It listens for "risk rejection" notifications, keeping track of each rejection event linked to a particular symbol, trading strategy, and testing setup.

It then automatically generates easy-to-read markdown reports detailing these rejections, including summaries like the total number of rejections and breakdowns by symbol and strategy.

These reports are saved as files on your computer, making them accessible for review and analysis.

You can subscribe to receive these rejection events, and when you're done, unsubscribe to stop receiving them. 

The service provides methods to retrieve statistical data, generate reports, save those reports to files, and clear out the accumulated rejection data. It uses a storage system that isolates data for different combinations of symbols, strategies, exchanges, frames, and backtest setups.

## Class RiskGlobalService

RiskGlobalService acts as the central hub for managing risk in your trading system. It's responsible for validating risk configurations and ensuring that trading signals adhere to predefined limits. Think of it as a gatekeeper, preventing trades that would violate your risk rules.

It works closely with other services like RiskConnectionService, and it utilizes memoization to make validation efficient – it remembers results to avoid repeated checks.

Key functions include:

*   **Signal Validation:** `checkSignal` and `checkSignalAndReserve` assess whether a trade signal is permissible based on risk limits, with the latter providing added safety in concurrent environments.
*   **Signal Registration:** `addSignal` formally records when a trade is initiated, while `removeSignal` marks trades as closed.
*   **Data Management:** `clear` allows for the removal of risk data, either for a specific risk instance or for all risk data.



This service is critical for maintaining a controlled and secure trading environment within the backtest-kit framework.

## Class RiskConnectionService

This service acts as a central hub for handling risk-related operations within your trading system. It intelligently connects your requests to the correct risk management implementation based on a specific identifier, like a risk name. To speed things up, it remembers previously used risk implementations, avoiding unnecessary repeated setup.

Think of it as a smart router for risk checks and signal management. 

Here's a breakdown of what it does:

*   **Signal Validation:** It checks if a trading signal is safe to execute, considering various limits like portfolio drawdown and symbol exposure.
*   **Concurrency Control:** Offers a special method (`checkSignalAndReserve`) to handle situations where multiple signals need to be validated simultaneously, ensuring everything happens safely.
*   **Signal Tracking:**  It keeps track of open and closed signals, updating risk calculations accordingly.
*   **Cache Management:** It proactively clears cached risk implementations when needed, giving you control over the risk system's memory.
*   **Dependency Injection:** It relies on other services like `RiskSchemaService` and `TimeMetaService` to function, enabling a flexible and modular design.

## Class ReportWriterAdapter

This framework provides a flexible way to handle and store reports generated during backtesting and live trading. It uses an adapter pattern, meaning you can easily swap out different storage methods without changing your core strategy logic.

The system keeps track of storage instances, ensuring only one is used for each type of report (like backtest results, live trading data, or walker output). This helps optimize resource usage.

By default, reports are saved as JSONL files, but you can customize this by providing your own storage adapter.

To make things convenient, the framework automatically creates the necessary storage when you first write data. 

You can temporarily disable reporting altogether using the dummy adapter, which is helpful for testing or when you don't need to save results.

If the location where your reports are saved changes, you'll need to clear the storage cache to ensure everything is written correctly.

## Class ReportUtils

ReportUtils helps manage how different parts of the system, like backtests, live trading, or performance analysis, send data for reporting.

It lets you choose which services should be actively logging events to JSONL files for later review and analysis.

Think of it as a way to turn on or off data collection for specific areas of the framework.

The `enable` function lets you subscribe to these reporting services.  It’s important to remember to unsubscribe later – it provides a cleanup function for that purpose – to avoid resource issues.

`disable` stops those logging activities for selected services without needing a separate cleanup step.

## Class ReportBase

The `ReportBase` class helps you easily store and manage event data as JSONL files, which is great for analyzing trading backtests. It automatically creates the necessary directories and handles writing data to a file, one line at a time, ensuring data isn't lost even if there are errors. 

This class focuses on appending new data—it's designed for logging events, not updating existing ones. It keeps track of important metadata like the trading symbol, strategy, exchange, timeframe, and signal ID, making it simple to search and filter your data later.

The `waitForInit` method is a handy way to ensure everything is set up correctly before you start writing, but you can call it multiple times without worry. The `write` method is your go-to for adding new event data, formatting it with metadata and a timestamp, and safely writing it to the file. It also includes a timeout to prevent writes from getting stuck for too long.

## Class ReportAdapter

The ReportAdapter helps manage how your backtest results are stored and analyzed. Think of it as a flexible system that allows you to easily change where and how your trading data is saved.

It uses a pattern that lets you swap out different storage methods without changing your core code. It also remembers which storage method is being used for each type of report, avoiding unnecessary setup.

By default, it saves data to JSONL files, but you can switch to a different storage solution or even a dummy adapter that simply ignores all writes, useful for testing.

The `useReportAdapter` method lets you define the specific storage method to use.  It's important to clear the cache with `clear()` if your working directory changes, so you don't run into unexpected issues.

## Class ReflectUtils

This utility class provides a way to easily track key performance indicators (KPIs) for your trading positions, such as profit and loss, peak profit, and drawdown. It acts as a central hub for accessing this information, ensuring consistency and validation across your backtesting and live trading environments. Think of it as a toolbox for quickly getting insights into how your strategies are performing.

You can use it to retrieve metrics like:

*   **Unrealized PnL:**  How much you're currently gaining or losing on a pending trade, expressed as a percentage or in currency.
*   **Peak Profit:** The highest price achieved during a trade's lifespan.
*   **Drawdown:** The maximum loss experienced during a trade’s lifespan.
*   **Time-based metrics:**  How long a position has been active, waiting, or in drawdown.
*   **Distances from Peaks:**  The difference between the current price and the highest profit or deepest drawdown.

The `ReflectUtils` class is designed to be simple to use, as it provides a single, globally accessible instance, and all its methods operate asynchronously, returning promises that resolve with the desired KPI values.  It's particularly helpful for monitoring and analyzing strategy performance, whether you're running backtests or actively trading.

## Class RecentLiveAdapter

RecentLiveAdapter helps you manage and access recent trading signals, providing a flexible way to store that data. It acts as a middleman, allowing you to easily switch between different storage methods like persistent storage on disk or a simple in-memory solution. You can change the storage method at any time, making it adaptable to various testing or production needs.

The adapter uses a factory to create the actual storage mechanism and remembers the result to avoid recreating it unnecessarily, but you can clear this memory when needed – for example, when testing scenarios involving changing file paths. It offers handy functions to fetch the most recent signal for a specific trading setup, figure out how long ago a signal was generated, and swap between persistent and in-memory storage. Essentially, it simplifies managing and retrieving your recent trading data.


## Class RecentBacktestAdapter

This component helps you manage and access recent trading signals, offering flexibility in how and where those signals are stored. It's designed to be adaptable, letting you choose between storing signals in memory or on disk.

The `RecentBacktestAdapter` uses a pattern that allows you to easily swap out different storage methods without changing the core logic of your trading system. By default, signals are stored in memory, which is quick and convenient. However, you can also switch to persistent storage, ensuring your signals are saved even if your application restarts.

You can control the storage mechanism using methods like `useMemory` and `usePersist`, which dictate whether signals are stored in memory or on disk. The `clear` method is important if your working directory changes, as it forces the adapter to rebuild its storage utils.  It provides methods to retrieve the most recent signal and calculate how long ago it was created, and handles active ping events by passing them along to the chosen storage adapter.

## Class RecentAdapter

The RecentAdapter acts as a central hub for managing how recent trading signals are stored and accessed, whether you're running a backtest or a live trading system. It automatically updates its signal storage by listening for incoming data. 

You can easily retrieve the most recent signal for a specific trading pair and strategy context. To prevent look-ahead bias, it ensures that signals retrieved are only those that occurred before a specified time. 

It handles subscribing and unsubscribing to data streams to avoid issues with multiple subscriptions. 

The adapter provides a way to check how long ago the last signal was created, again considering a time cutoff to maintain data integrity.


## Class PriceMetaService

PriceMetaService helps keep track of current market prices for your trading strategies. It ensures you always have the most up-to-date price information, even when you need it outside of the regular trading tick process, like when executing commands between ticks.

Think of it as a memory bank for prices, organized by symbol, strategy, exchange, and timeframe. It automatically updates these prices as new ticks come in, and it remembers them for later use. If a price hasn't been received yet, it waits briefly to make sure it gets the latest value.

This service is designed to be straightforward. It manages these price snapshots automatically, preventing outdated data and making it easy to access the latest market prices whenever you need them. You can clear out these stored prices if you want to release memory or reset the data, either for a specific price or for all prices at once. It’s a useful tool for ensuring your strategies always work with current market conditions.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, using different position sizing strategies. Think of it as a toolbox with pre-built methods to help you calculate the right size for your trades. 

Each method, like fixed percentage, Kelly Criterion, and ATR-based, has built-in checks to ensure the sizing setup matches the method itself, helping to avoid calculation errors. 

The methods take into account factors like your account balance, the price of the asset, and specific parameters related to each sizing approach. 

For example, the Kelly Criterion method requires information about your win rate and win-loss ratio, while the ATR-based method uses the Average True Range to determine size. 

These calculations are designed to help manage risk and potentially improve trading performance.

## Class Position

The `Position` class provides helpful tools for determining take profit and stop loss prices when you're placing trades. It figures out the right direction for these levels automatically, depending on whether you're going long or short.

It offers two main functions:

*   **moonbag:** This calculates take profit and stop loss levels based on a "moonbag" strategy.  Essentially, it places a take profit at a fixed distance (50%) above the current price.

*   **bracket:** This function calculates both take profit and stop loss levels, allowing you to specify custom percentages for each.  It's great for more traditional bracket order setups.

Both functions take information about the position type (long or short), the current price, and percentages for stop loss and take profit. They then return an object containing the calculated take profit and stop loss prices.

## Class PersistStrategyUtils

This class helps manage how a trading strategy's temporary data is saved and loaded. It's designed to keep track of things like pending orders or signals that haven't been fully processed yet.

It uses a clever system to create a special "storage" for each strategy, based on the symbol being traded, the name of the strategy, and the exchange being used. This storage is made only when needed, which helps with efficiency.

You can also customize how this data is saved – perhaps to a file, a database, or even to nowhere at all (for testing purposes).  If you change how data is saved, the class makes sure it forgets its previous methods.

If your environment changes (like when you change the working directory), it provides a way to refresh the storage.


## Class PersistStrategyInstance

This component helps you save and load the state of your trading strategies. Think of it as a way to remember where your strategy was last, so you can pick up where you left off even after unexpected interruptions.

It's designed to work specifically with one strategy at a time, using a predefined name ("strategy") to identify the data it manages. The component handles the details of safely writing data to a file, minimizing the risk of losing information if something goes wrong.

You provide the symbol, strategy name, and exchange name when you create this component, which helps it organize where the data is stored.

Here's what it lets you do:

*   **Initialization:**  Ensures the storage is ready to go.
*   **Loading:** Retrieves the saved state of your strategy.
*   **Saving:** Stores the current state of your strategy, allowing you to reload it later.
*   **Clearing:**  Allows you to delete the saved state, effectively starting fresh.



It uses a constant key (`STORAGE_KEY`) to identify the data within the storage. The internal `_storage` property handles the actual file storage work behind the scenes.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded for persistence, particularly when switching between backtesting and live trading modes. It keeps track of storage instances, making sure you don't create unnecessary ones.

You can customize how the data is stored by providing your own storage constructors – essentially, defining how the storage itself works.

It handles reading and writing all the signal data for a specific mode (like "backtest" or "live") and ensures that these operations happen reliably. Each signal is kept in its own file, identified by its ID.

If your working directory changes during a backtest, it's important to clear the cache to prevent issues.

There are also convenient shortcuts for using a default file-based storage or a dummy storage for testing purposes.

## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals persistently using files. It's designed to be reliable, even in situations where the system might crash during a write operation.

Each signal is saved as a JSON file, making it easy to manage and understand individual signals. 

The `backtest` property controls how the storage behaves during backtesting scenarios. 

The `waitForInit` method ensures the storage is properly set up before you start reading or writing data. 

`readStorageData` retrieves all the saved signals, and `writeStorageData` saves a batch of signals, ensuring each one is properly identified by its unique ID. This is the standard implementation for keeping your trading signals safe and accessible.

## Class PersistStateUtils

The PersistStateUtils class helps manage how your trading strategy's data is saved and loaded, making sure things are reliable even if the system crashes. It keeps track of different storage instances based on unique identifiers (signalId and bucketName), allowing for flexible storage solutions.

You can customize how data is stored, switching between different implementations like using a simple file-based approach or a custom adapter. The class also ensures operations are performed safely and in a controlled manner.

To make things efficient, it caches these storage instances, avoiding unnecessary setup. When you need to reset the storage, like when your working directory changes, you can clear the cache.

It provides convenient functions to read, write, and initialize state, with the option to temporarily use a dummy instance that doesn't actually save anything. This is helpful for testing or development. Finally, you can register your own custom storage mechanisms to tailor the data persistence to your specific needs.

## Class PersistStateInstance

This class provides a way to save and load trading state information to a file. 

It essentially acts as a bridge, managing the underlying file storage and ensuring data is written reliably. Each instance focuses on a specific signal and uses a unique identifier (bucketName) to organize data within the storage. 

The `waitForInit` method makes sure the storage is ready before you try to read or write anything. `readStateData` retrieves the saved state based on the identifier, and `writeStateData` saves new state. Importantly, the `dispose` method doesn't do anything directly – it relies on a separate utility function to clear any cached data.

## Class PersistSignalUtils

This class helps manage how signal data is saved and loaded, ensuring consistency and reliability. It acts as a central place to handle persistent data for your trading strategies.

Each strategy gets its own dedicated storage area, and you can customize how this storage works using different adapters. The system intelligently creates and manages these storage instances, and all updates happen in a controlled way.

The `readSignalData` function retrieves saved signal information, and `writeSignalData` saves new or updated data, or clears it entirely. The system makes sure these actions happen reliably, even if there are unexpected problems.

You have flexibility in how the data is persisted – you can use a file-based system, a dummy adapter for testing, or plug in your own custom solution. The `usePersistSignalAdapter`, `useJson`, and `useDummy` functions allow you to easily switch between these options. The `clear` function allows you to wipe out the storage data when the working directory changes.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, helps you save and retrieve signal data to a file, ensuring your progress isn't lost. It's designed to work seamlessly within a trading strategy and provides a safe way to store information related to a specific trading symbol, strategy name, and exchange.

It handles the details of writing data to a file in a reliable manner, even if unexpected things happen during the process. The class keeps track of the trading symbol, strategy, and exchange it’s managing, and it uses these details to organize the stored data.

Here's a breakdown of what it does:

*   It initializes the underlying storage, making sure everything is ready to go.
*   You can use it to read the latest saved signal data.
*   And it allows you to save updated signal data, or clear the stored information entirely. 
*   It protects against data loss by writing changes atomically.

## Class PersistSessionUtils

This utility class helps manage how session data is saved and loaded, particularly for trading strategies. It's designed to be reliable even if your program crashes unexpectedly.

The class keeps track of session data based on the strategy name, exchange, and frame name, using a consistent file structure to store the information. It allows you to customize how data is stored, offering built-in options for file-based storage or a dummy (no-op) mode for testing.

The `waitForInit` method prepares the storage space for session data, and it's useful for setting up the initial configuration. Reading and writing data are handled by `readSessionData` and `writeSessionData`, respectively, and the whole process is designed to be safe and efficient.

You can clear the storage cache using `clear` if necessary (like when your working directory changes). To clean up when a session is no longer needed, use `dispose`. Finally, `usePersistSessionAdapter` lets you plug in your own custom data storage solutions.

## Class PersistSessionInstance

This class helps you save and load the state of your trading sessions, like the settings and data that get built up as a strategy runs. It’s designed to work with files on your computer to keep this information persistent, so you don't lose it when you stop and restart your backtesting.

It organizes session data based on the strategy name, exchange, and a specific "frame" – essentially a snapshot in time – and the symbol being traded. It also distinguishes between live and backtesting scenarios.

The `waitForInit` method sets up the storage. `readSessionData` retrieves previously saved session information, and `writeSessionData` saves current data.  The `dispose` method doesn’t actually do anything on its own; cleanup is managed separately by other tools to ensure everything is properly cleared.

## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and loaded, ensuring they aren’t lost even if there are interruptions. It’s designed to work particularly well with the ClientStrategy when it's actively trading.

The system automatically creates and manages a storage area for signals for each unique combination of the trading symbol, strategy, and exchange. You don’t typically interact with this directly.

You can customize how these signals are stored by providing your own way of saving and retrieving them.  For example, you can use a file-based system, or a completely fake one for testing.

If the environment changes (like when the current working directory shifts), you should clear the storage to make sure you are using the most up-to-date storage settings. This ensures the persistence functions work correctly.

## Class PersistScheduleInstance

This class helps you save and retrieve schedule data for your trading strategies. It’s designed to be reliable, even if things go wrong unexpectedly. 

Think of it as a way to store information about when your trading signals should happen, associating them with a specific trading symbol, strategy, and exchange. 

It uses files to persistently store this data, and makes sure those writes are handled safely so you don’t lose information.

Here's a breakdown:

*   **Initialization:** `waitForInit` makes sure the storage is ready to use.
*   **Reading data:** `readScheduleData` fetches the scheduled signal for a particular symbol – basically, getting the instructions on when to trade. If nothing is stored, it returns nothing.
*   **Saving data:** `writeScheduleData` saves the signal instructions, or clears them out if you need to.

## Class PersistRiskUtils

This class helps manage and save information about your active trading positions, particularly for risk management. It keeps track of these positions in a way that's reliable, even if there are unexpected interruptions.

It uses a clever system to create specialized storage for each trading strategy (risk profile), making sure data is handled correctly. 

You can customize how this storage works by providing your own "adapters" – different ways of saving and retrieving data.  

The `readPositionData` method retrieves previously saved position data, while `writePositionData` saves the current state. It sets up these operations so they happen consistently and safely.

If you need to change the way position data is stored (perhaps switching to a different file format or using a test setup), functions like `usePersistRiskAdapter`, `useJson`, and `useDummy` allow you to do so easily. The `clear` function helps ensure that things are reset correctly when the environment changes.

## Class PersistRiskInstance

This class helps manage and save trading positions to a file, ensuring data isn't lost even if something unexpected happens. It's designed to work with a specific name for the risk and the exchange being used.

Think of it as a safe keeper for your trading data, guaranteeing it’s written to the file correctly and reliably.

It automatically handles saving and loading position data, making it easier to keep track of your trades.

Here's a breakdown of what it does:

*   **Initialization:**  `waitForInit` makes sure the storage area is ready before you start working with it.
*   **Reading Data:** `readPositionData` retrieves all your saved position information from the file, using a consistent key.
*   **Writing Data:** `writePositionData` saves new or updated position information back to the file.



It uses a predefined key (`STORAGE_KEY`) so that it always knows where to find the position data. The `_storage` property is the underlying system that actually handles the file operations.

## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, ensuring they're handled consistently across different setups. It's designed to be a behind-the-scenes helper used by other parts of the system for remembering recent signals.

The class cleverly uses memoization, meaning it creates and stores signal instances only once for each specific combination of symbol, strategy name, exchange, and timeframe. This avoids unnecessary work and keeps things efficient.

You can customize how these signals are persisted—for example, by using a different storage method.  The `usePersistRecentAdapter` function lets you swap in your own storage implementation, and clearing the cache is simple with the `clear` method. There are also shortcuts like `useJson` for standard file storage and `useDummy` for testing where no actual persistence is needed.

Essentially, it handles the complex details of saving and loading recent signals so other parts of the backtesting framework can focus on the trading logic.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and load the most recent trading signal data for a specific trading setup. It's designed to work with files to store this information, ensuring the saves are reliable.

It keeps track of details like the trading symbol, strategy name, the exchange it's used on, the timeframe being analyzed, and whether it’s a backtest or live trading session. It combines these pieces of information to create a unique identifier for where to store data.

The `waitForInit` method sets up the storage area before any data is written. 

You use `readRecentData` to retrieve the last saved signal and `writeRecentData` to save a new signal. It's like a simple system for remembering the latest happenings in your trading.


## Class PersistPartialUtils

This class helps manage how partial profit/loss data is saved and loaded for each trading strategy. It's designed to make sure this data is stored reliably, even if there are unexpected issues.

The system keeps track of different storage methods, allowing you to customize how data is saved, or use a default file-based option or even a dummy version that does nothing. 

It automatically creates and manages storage instances for each symbol and strategy combination, ensuring efficient data handling. You can clear the stored instances if your environment changes, like when the working directory shifts. 

Importantly, it provides methods to read and write this partial data, and the system handles the initial setup of storage when needed, ensuring that everything runs smoothly.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you reliably save and retrieve small pieces of information related to your trading strategies. It's designed to work with file storage, ensuring that your data isn't lost even if something unexpected happens.

Think of it as a safe place to store temporary data for a specific trading strategy, exchange, and symbol.  It uses a unique identifier (signalId) to keep track of each piece of data.

The class initializes a storage area, reads existing partial data based on a signal ID, and lets you write new or updated data back. It's built to handle writing data safely, so it prevents potential issues caused by interruptions. 

You'll use the `symbol`, `strategyName`, and `exchangeName` to identify which data belongs to which trading setup, and `signalId` to pinpoint the specific data point you're working with. The `_storage` property is the internal file system area that the data is being persisted to.

## Class PersistNotificationUtils

This class provides a way to safely store and retrieve notification data, essential for tracking events during backtesting and live trading. It automatically manages the underlying storage, ensuring that each notification is saved as a separate file and protected against data loss.

You can easily swap out the storage mechanism, for instance, to use a file system, a different storage adapter, or even a dummy implementation for testing purposes. The class intelligently caches these storage options, creating a new one only when needed.

If you need to change where your base directory is located, like when moving between strategy runs, you should clear the cache to force a fresh start.


## Class PersistNotificationInstance

This class provides a way to save and retrieve notifications to files, making sure your data persists even if something unexpected happens. It's designed to work well with backtesting scenarios and stores each notification as its own JSON file, easily identified by its unique ID. 

The system keeps track of all notification IDs, allowing you to retrieve them one by one. 

The `waitForInit` method sets up the underlying storage. The `readNotificationData` function retrieves all stored notifications. And `writeNotificationData` saves a batch of notifications, making sure each one is written securely and reliably. It uses a file-based storage system to keep your notifications safe.

## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how your trading data is saved and loaded, especially when dealing with crashes or needing to rebuild indexes. It keeps track of storage instances for specific signals and buckets, making sure you don't have to recreate them every time.

You can customize how the storage works by providing your own class to handle the data, or use the built-in JSON or dummy (no-op) options. 

It handles tasks like reading, writing, and deleting memory entries and offers a way to clear the cache when things change, like when the working directory is updated.  It also has a method to iterate through all stored data, useful for rebuilding indexes.  The system creates and initializes storage as needed, so you don’t have to worry about that explicitly.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data to files. It acts as a bridge between your trading logic and a file system, ensuring your data survives restarts.

Think of it as a place to save snapshots of your trading state. It uses a signal ID and bucket name to organize the data.

You can read, write, and remove memory entries by their unique ID. When removing, it doesn't truly delete the data; instead, it marks it as "removed," allowing for potential recovery if needed.

When listing memory data, it automatically filters out any entries that have been marked for removal.

Importantly, this class doesn't handle the cleanup of cached data; that's managed separately to keep things efficient. It's designed to be a reliable and straightforward way to persist your memory data.

## Class PersistMeasureUtils

This utility class helps manage how your trading strategy’s cached data from external APIs is saved and retrieved. It ensures that each cache instance is created based on the combination of a timestamp and a symbol, providing a structured way to handle persistent data. The system allows you to customize how this cached data is stored, using a provided constructor.

You can swap out the default storage method with your own implementation, or use a “dummy” mode for testing where data isn’t actually saved. Reading, writing, and deleting cached data is handled consistently, and the system is designed to safely manage the state of the cache even if the application crashes.

The `usePersistMeasureAdapter` function enables you to register a new way to handle persistence. A `clear` function is available for when the environment changes, like when the working directory shifts between strategy runs. Listing all available data within a specific cache bucket is also possible.

## Class PersistMeasureInstance

This component manages persistent storage for measure data, offering a way to reliably save and retrieve information for your trading strategies. It builds upon a foundational storage layer, ensuring that writes happen completely or not at all. 

Think of it like a safe for your data—it keeps things secure and consistent. It also allows for soft deletions, meaning entries aren't permanently removed but flagged as such, which is useful for historical analysis.

The `bucket` property specifies where this data is stored. 

Key functionalities include reading data by a unique `key`, writing new entries, and providing a way to list all available, non-deleted data.  The `waitForInit` method ensures the storage is ready before you start using it. If you need to delete data, `removeMeasureData` simply marks it as removed rather than physically deleting the file.  `listMeasureData` gives you a stream of valid data keys to work with.

## Class PersistLogUtils

This class helps manage how log entries are stored and retrieved. It acts as a central point for interacting with the logging system, keeping things consistent and reliable. 

It holds a single, global log instance that's created only when needed, and you can customize how that instance works by swapping out the underlying technology.  

You can use it to switch between a real file-based storage, a JSON-based one, or even a dummy version that does nothing – great for testing!

The class also ensures that writing log data is done safely, avoiding duplicates and preventing data loss.  It reads all existing logs when you request them and handles writing in a way that protects against crashes.  Clearing the cached log instance is recommended when the working directory changes, guaranteeing a fresh start for new strategy runs.

## Class PersistLogInstance

This component handles saving and retrieving your trading logs to disk. It's designed to be reliable, ensuring your log data isn't lost even if there are unexpected interruptions.

Each individual log entry is stored as a separate JSON file, making it easy to manage and potentially analyze them individually. When you need to read the complete log, it goes through each of these files.

Importantly, it’s an append-only system – new log entries are added, but existing ones are never changed or deleted, providing a historical record. The storage itself is managed internally, but you don't need to worry about the low-level details of how the files are handled.

Before reading or writing, you might need to initialize the storage, which is taken care of by `waitForInit`. To add new log entries, use `writeLogData`, and to retrieve all existing entries, use `readLogData`.

## Class PersistIntervalUtils

This utility helps track when specific time intervals have already occurred during your backtesting or trading strategy runs. It essentially remembers which intervals have "fired" for a particular data bucket and key.

The system stores this information as files in a designated directory (`./dump/data/interval/`). A file's mere existence signifies that the interval has already happened; its absence means it hasn’t yet.

You can customize how this tracking is done, choosing from different "adapters" like a standard file-based approach, a JSON-based method, or even a dummy adapter that does nothing at all – helpful for testing.

The `readIntervalData` and `writeIntervalData` methods handle loading and saving this interval status, while `removeIntervalData` provides a way to "soft delete" a marker.  The `listIntervalData` method lets you iterate through the recorded intervals.  `clear` is used when your working directory changes.

## Class PersistIntervalInstance

This component handles saving and retrieving data related to trading intervals, primarily by writing files. It’s designed to make sure that these operations happen reliably, even if there are interruptions.

The system stores interval data in files, and when data is "removed," it doesn't actually delete the file – instead, it adds a flag to indicate that the data is no longer active.

You can use `waitForInit` to ensure the storage is ready before you start working with it.

`readIntervalData` retrieves a specific interval marker. If the marker doesn't exist or has been soft-deleted (marked for removal), it will return nothing.

`writeIntervalData` saves a new interval marker with its associated data.

`removeIntervalData` effectively pauses an interval’s activity by marking it as removed; the file remains but is ignored by later reads.

`listIntervalData` provides a way to see all the currently active interval markers, excluding any that have been soft-deleted. It provides a list of keys representing the active interval data.

## Class PersistCandleUtils

This class, `PersistCandleUtils`, helps manage how your historical candle data (like open, high, low, close prices) is stored and retrieved. It's designed to keep things efficient by caching data to disk. 

Each candle is saved as a separate file, making organization straightforward. The system checks if the cached data is still valid before using it, and automatically updates the cache if it's missing information.

You can customize how the data is persisted by providing your own constructor for the candle cache, and it's used internally by the `ClientExchange`.  If you need to change where or how your data is stored, you have options to switch between different implementations, like using a default file-based approach, a dummy adapter for testing, or a custom solution. If your working directory changes, you should clear the cache to ensure fresh data.

## Class PersistCandleInstance

This class helps you save and retrieve historical candle data for a trading symbol, like keeping a record of past price movements. It stores each candle as a separate file, making it easy to access individual data points.

It's designed to work with a specific trading symbol, interval (like 1-minute or 1-hour candles), and exchange. The system will automatically try to fetch data if it's not already stored, and it warns you if it finds any corrupt data files.

When writing candles, it only saves those that are fully complete and avoids overwriting existing data, ensuring you have a consistent and append-only history.  The `waitForInit` method prepares the underlying storage for use.  Retrieval (`readCandlesData`) is strict – if even one timestamp is missing, it considers the whole request a cache miss. Similarly, `writeCandlesData` skips incomplete candles and prevents overwriting.

## Class PersistBreakevenUtils

This class helps manage and save breakeven data—that's the point where a trade becomes profitable—for your trading strategies. It's designed to make sure this data persists even when your program restarts.

Think of it as a way to remember where your trades "stand" across sessions.

It stores this data in files, organized by the trading symbol (like BTCUSDT), the strategy you're using, and a unique identifier for each trading signal. The files are structured so you can easily find the breakeven information you need.

This utility automatically creates and manages the storage for these files, ensuring they're written safely and reliably. It intelligently caches these storage instances to avoid unnecessary file reads and writes.

You can even customize how the data is stored and managed by providing your own storage implementation. There's a built-in default using regular files, and options for a dummy implementation that doesn’t actually store anything, which is great for testing. Finally, you can clear the cache if your working directory changes.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, like the price at which a trade becomes profitable. It's designed to work safely, even if your application crashes unexpectedly. 

It keeps track of the symbol, strategy name, and exchange associated with the data.

The class uses a file to persistently store the data, ensuring it survives application restarts. It utilizes a unique identifier (signalId) for each set of breakeven data, effectively acting like a key to organize the information.

The `waitForInit` method sets up the initial storage, while `readBreakevenData` fetches the data for a specific signal and `writeBreakevenData` saves new or updated data. Essentially, it handles the read and write operations to keep your breakeven information safe and accessible.


## Class PersistBase

`PersistBase` is designed to simplify saving and retrieving data to files in a reliable way, especially useful for applications needing to store information persistently. It handles the complexities of safely writing to files, ensuring data integrity even if something goes wrong during the writing process.

The framework automatically manages the directory where your data is stored and includes features to detect and fix any corrupted files. It also provides a way to iterate through all the stored data in an asynchronous manner.

You specify a name for your data and a base directory for storage when you create a `PersistBase` instance.  When you need to read or write a specific piece of data, you identify it using an entity ID. This class ensures each file write happens safely, and includes a built-in mechanism to check if data already exists before writing. It initializes and validates the storage directory only once, guaranteeing a consistent starting point.

## Class PerformanceReportService

This service helps you understand where your trading strategies are spending their time. It's designed to record how long different parts of your strategy take to execute, creating a detailed timeline for optimization.

The service listens for timing events emitted during strategy runs, saving this data along with relevant information. This lets you pinpoint bottlenecks – the slow parts – and focus your efforts on making your strategy run faster and more efficiently.

To use it, you’ll subscribe to receive performance events. When you're finished collecting data, you’ll need to unsubscribe.

It’s also built to prevent accidental double-subscriptions, ensuring data isn't corrupted.


## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you monitor and understand how your trading strategies are performing. It keeps track of key metrics for each strategy you run, like average performance, the best and worst results, and other important percentiles.

It gathers information by listening for performance events and organizes them by symbol, strategy, exchange, timeframe, and whether it's a backtest or live trading.

You can then request summaries of this data to see how a specific strategy is doing. The service can also generate easy-to-read markdown reports that highlight potential bottlenecks in your strategy’s performance. These reports are automatically saved to your logs directory. 

Finally, you can clear out the stored performance data when you no longer need it.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to analyze and report on strategy performance, identifying areas where things might be slowing down or becoming unreliable.

You can use it to retrieve detailed performance statistics for a specific trading strategy and symbol, seeing metrics like average execution time and volatility.

It allows you to create readable markdown reports that summarize performance, highlighting bottlenecks and potential issues.

Finally, you can save these reports directly to your computer, making it easy to track progress and share results.

## Class PartialUtils

This class provides tools for analyzing and reporting on partial profit and loss data. Think of it as a way to get a detailed look at how your trading strategies are performing, even when only considering portions of trades.

It gathers information about partial profit/loss events—like when a portion of a trade is realized—and lets you examine this data through statistics and reports.

You can request statistical summaries, like the total number of profit and loss events for a particular trading symbol and strategy.

It can also generate easy-to-read markdown reports. These reports will include a table of your partial profit/loss events, showing details such as the type of event, symbol traded, strategy used, price levels, and timestamps.

Finally, you can easily save these reports to files for later review or sharing, with filenames that clearly identify the symbol and strategy involved.  The tool handles creating the necessary directories to store these reports.

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by recording each time you take a partial profit or loss. It essentially monitors for events signaling these partial exits and saves details like the price and level at which they occurred. 

You can tell it to start listening for profit-taking events, and it will record each one. Similarly, it tracks partial loss events too.

To stop recording these partial events, you use the unsubscribe function that's provided when you initially subscribe. This makes sure you’re not accidentally accumulating unnecessary data.

The service also has a built-in logger to help you debug and understand what’s happening. It relies on another service called `tickProfit` and `tickLoss` to handle those respective events and writes the collected data to a database.

## Class PartialMarkdownService

This service helps you keep track of and report on your trading profits and losses. It listens for events representing profits and losses, organizing them by the trading symbol and strategy used. You can then generate easy-to-read markdown reports summarizing these events, along with overall statistics.

The service automatically saves these reports as files, so you can review your performance over time. You can also clear out the accumulated data if needed, either for everything or for specific trading setups.

To use it, you'll subscribe to the profit and loss signals, and then the service handles the rest, accumulating data and making it available for reporting. It manages the storage of this data internally, ensuring each symbol and strategy combination has its own isolated storage space.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It's designed to be injected into the core trading strategy, simplifying how strategies interact with the underlying connection layer. The service keeps a record of all partial operations through logging, providing a valuable tool for monitoring and debugging.

It relies on several other services—like those for strategy, risk, exchange, and frame validation—to ensure proper configuration and data integrity.

The `profit`, `loss`, and `clear` functions are the primary methods for interacting with the service, each logging the action before passing it on to the `PartialConnectionService` for actual execution. The `validate` function ensures the strategy's configuration is correct, and it remembers previous validations to avoid unnecessary checks.

## Class PartialConnectionService

This service helps manage and track partial profits and losses for trading signals. It keeps track of these "partial" positions, ensuring that the framework doesn’t lose sight of gains or losses on open trades.

Essentially, it acts as a central hub for creating and managing objects that handle the specifics of profit and loss tracking for each individual signal.

The service remembers these objects, so it doesn't have to recreate them every time. When a signal is finished (either a profit or a loss), the service cleans up the associated data, preventing issues and ensuring efficiency.

It receives important services like logging and action handling from the larger system and uses those to manage the partial position data. The `getPartial` function is a key part – it’s how the system retrieves or creates those tracking objects. The `profit`, `loss`, and `clear` functions are the main ways the service updates and manages the partial profit/loss information.

## Class OrderTransientError

This class, `OrderTransientError`, is a way to signal that an order-related operation failed temporarily – think network glitches or exchange hiccups. It's a clear signal to your code that a retry is appropriate. It's essentially a catch-all for unexpected errors, as the framework doesn't treat it differently.

Here's a breakdown of what "transient" means in different situations:

**For opening an order:** The system will automatically try to submit the same order again, repeatedly. Before resending, check if the order already exists on the exchange to avoid duplicates. Complete failure to open triggers a critical system failure.

**For closing an order:** The system will keep trying to close the position until successful, even if it means keeping the position open longer than expected. A complete failure to close will trigger a critical system shutdown.

**For checks (order status verification):** Failed checks are tolerated, and monitoring continues. Multiple consecutive failures eventually trigger a shutdown.

**Important notes:**

*   The counter for transient errors resets after each consecutive failure, not every tick.
*   Exhausting the retry attempts for a transient error is a critical failure.
*   The `isOrderTransientError` method is helpful for identifying these errors in your own application code, mainly for logging.
*   This error isn't used during backtesting.

## Class OrderRejectedError

This error signifies a definitive rejection of an order by the exchange—it's a situation where retrying the order is futile. It's primarily thrown within the order gates, specifically when interacting with the broker adapter, action schemas, or sync listeners. When this error occurs, the framework takes immediate action: open orders are dropped, retry attempts are canceled, and the system prepares to generate a new order signal. Close orders are also force-closed, bypassing retry loops while still triggering standard close lifecycle events. 

Importantly, this isn't a network issue; it's a business rejection – like a delisted symbol or account restriction – and shouldn’t be used for transient problems like timeouts.  Throwing it incorrectly, like from a check channel, degrades it to a transient error.  The error carries a runtime brand for reliable identification even across different module copies and is only relevant in live or specifically mocked environments. The message is optional and purely for informational purposes.

## Class OrderDeletedError

This error, `OrderDeletedError`, signals a definitive confirmation from the exchange that an order you're tracking no longer exists – essentially, the exchange says it's gone. It’s not just a temporary problem; it's a business reality.

You'll only throw this error when dealing with order checks—specifically, when actively verifying order status with the broker.

When this error happens, the framework takes immediate action: if it's an open position, it closes the position outright. If it’s a scheduled order, it cancels the schedule. Importantly, the framework skips any re-attempts to confirm the order's status.

It's crucial to distinguish this from other issues.  A filled order isn't deleted; that needs a different handling process. Similarly, network problems aren’t “deleted” orders; they are handled with retries.

Throwing this error in the wrong place (outside of order checks) will result in the framework treating it as a temporary problem, leading to repeated attempts. The error itself is identified by a special runtime brand, ensuring it's recognized even when your project uses multiple copies of the code.  Finally, be aware that this error only applies to live, actively connected exchanges; it's not used during backtesting.

## Class NotificationLiveAdapter

This component, `NotificationLiveAdapter`, is designed to handle sending notifications about your trading activity, like signals, profits, losses, and errors. It's flexible because it lets you choose *how* those notifications are sent – whether it's to memory, a file, or even nowhere (a dummy adapter for testing).

Think of it as a central hub that receives events from your trading strategy and then passes them on to the chosen notification method. You can easily switch between different notification methods without changing your core trading logic.

The `_notificationLiveFactory` controls which notification method is active, and `getInstance` ensures that the active method is efficiently reused.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, `handleError`) are the entry points for different types of notifications – they simply forward the information to the currently selected adapter.

For managing notifications, you can retrieve them all with `getData` or clear them out with `dispose`.

Finally, `useNotificationAdapter`, `useDummy`, `useMemory`, and `usePersist` give you control over which notification method is used. `usePersist` stores notifications persistently, `useMemory` keeps them in memory, `useDummy` disables notifications, and `useNotificationAdapter` lets you provide your own custom implementation. `clear` helps ensure proper re-initialization when environment settings change.

## Class NotificationHelperService

This service is a helper for sending out notifications about signals. It's a core part of how the backtest-kit works internally.

It primarily handles validating different aspects of your trading setup – strategy, exchange, frame, risk, and action – to make sure everything is set up correctly. Importantly, this validation doesn't happen every time; it's smartly cached so it only runs once for each unique combination of strategy, exchange, and frame.

The key function you’ll use is `commitSignalNotify`. This function is what triggers the actual notification. It checks that everything is valid, finds the relevant signal, and then sends out a notification that can be received by other parts of the system and saved for later review. Think of it as the final step in letting everyone know a signal is being acted upon.

## Class NotificationBacktestAdapter

This component helps you manage notifications during backtesting, offering flexibility in how those notifications are handled. You can easily switch between different ways to store and process notifications, like keeping them in memory, saving them to a file, or completely ignoring them. The default behavior is to store notifications in memory, but you can swap this out for persistence or a dummy adapter that does nothing.

This framework provides methods for various notification events, such as signal updates, profit/loss changes, order confirmations, and error conditions. All of these event handlers ultimately forward the information to the currently active notification adapter.

To change how notifications are handled, use convenience functions like `useMemory`, `useDummy`, or `usePersist` to select the desired adapter.  If your working directory changes during backtesting, remember to call `clear` to ensure that a new notification adapter instance is created with the correct settings.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for handling notifications during both backtesting and live trading. It automatically receives updates by listening to signals generated by the trading system.

You can enable the adapter to start receiving notifications; this subscription happens only once to prevent redundant updates. Conversely, you can disable it to stop receiving notifications, and this can be done safely as many times as needed.

Accessing your notifications is straightforward - a simple function call retrieves all stored notifications, specifying whether you want the backtest or live notification data.

Finally, a cleanup function allows you to completely clear all stored notifications when you're finished with the adapter.

## Class MemoryLiveAdapter

This component, `MemoryLiveAdapter`, provides a flexible way to manage data during live trading. It acts as a central hub for storing and retrieving data related to trading signals and buckets, and it’s designed to be adaptable to different storage methods.

Think of it as a layer that sits between your trading logic and how data is actually saved – you can easily switch between different storage options without changing your core code. By default, it uses a file-system based storage to ensure data persists even if the application restarts, but you can also use in-memory storage for faster access or a dummy adapter for testing.

You can manage individual data entries by writing, reading, searching, listing, or removing them using specific identifiers. To keep things tidy, the adapter automatically cleans up memoized data when signals are closed.  You can explicitly clear this memoized cache if your working directory changes, ensuring fresh instances are created.  Essentially, `MemoryLiveAdapter` provides a robust and customizable solution for handling real-time trading data.

## Class MemoryBacktestAdapter

This component, the MemoryBacktestAdapter, provides a flexible way to manage memory storage for your backtesting framework. Think of it as a central hub for how your backtest stores and retrieves data.

It’s designed to be adaptable, allowing you to easily switch between different storage methods – a standard in-memory solution, a persistent file-based option, or even a dummy adapter for testing purposes. The default is a simple in-memory storage using BM25 technology.

You can easily change the storage method by using the `useLocal`, `usePersist`, `useDummy`, or `useMemoryAdapter` functions. The `usePersist` option saves data to files, while `useDummy` is handy for testing without actually storing anything.  You can also bring your own custom storage solution.

The `disposeSignal` method is crucial for cleaning up memory when a signal is finished, preventing leaks.  It clears out the cached data associated with a particular signal. The adapter also includes functions for writing, searching, listing, removing, and reading data.  Finally, `clear` ensures that new data is correctly loaded when your working directory changes during strategy iterations.

## Class MemoryAdapter

The MemoryAdapter acts as the central hub for managing how data is stored and retrieved during backtesting and live trading. It intelligently directs memory operations—writing, searching, listing, removing, and reading—to either the backtest environment or the live environment, depending on the specific request.

This adapter is designed to be efficient and reliable, automatically subscribing to signal lifecycle events to clean up old data and prevent issues caused by stale information.  The `enable` property initiates this process with a one-time subscription, while `disable` allows for safe and repeated removal of this subscription.

It's a key component for ensuring accurate and consistent memory usage across both testing and live scenarios.

## Class MaxDrawdownUtils

This class helps you understand and analyze the maximum drawdown experienced during trading simulations or live trades. It's designed to give you insights into the risk associated with a particular trading strategy.

You can use it to get a summary of drawdown statistics for a specific trading symbol and strategy. 

It also allows you to create readable markdown reports detailing the drawdown events. These reports can be viewed directly or saved to a file for later review. 

Essentially, it provides tools to examine and report on how much a strategy lost from peak to trough.

## Class MaxDrawdownReportService

This service is responsible for tracking and recording maximum drawdown events, which represent significant losses in a trading strategy. It essentially listens for signals indicating a new drawdown has occurred and saves those events to a database for later analysis.

The service connects to a stream of drawdown data and writes each occurrence as a structured record. Each record contains detailed information about the drawdown, including when it happened, which asset was involved, the trading strategy used, and specifics about the order placed (entry price, stop-loss, take-profit).

To start tracking drawdown events, you need to subscribe to the data stream. The first time you subscribe, it begins recording; any subsequent subscription attempts won’t re-trigger the process. You can later unsubscribe to stop the recording. If you never subscribed, unsubscribing won't have any effect.


## Class MaxDrawdownMarkdownService

This service is designed to create and save reports about maximum drawdown, a crucial metric for assessing risk in trading. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe.

You can start receiving these events by subscribing, and stop listening and clear the data by unsubscribing. Each time a drawdown event occurs, the `tick` method processes it.

To retrieve the accumulated data for a specific symbol, strategy, exchange, and timeframe, use the `getData` method.  The `getReport` method transforms this data into a readable markdown report. If you want to save the report directly to a file, the `dump` method will generate it and write it to the specified path. Finally, the `clear` method allows you to remove all accumulated data or selectively clear data for specific combinations of symbol, strategy, exchange, and timeframe.

## Class MarkdownWriterAdapter

This framework provides a flexible way to handle creating and storing markdown reports during backtesting or live trading. It uses an adapter pattern, meaning you can easily swap out how the reports are saved – whether that’s to individual files in a folder, a single append-only JSONL file, or even discarded entirely.

The system automatically manages the storage instances, ensuring only one is created for each type of report (like backtest results or walker data), which improves efficiency.  You can change the default behavior to use a different storage method.

The `writeData` method handles actually writing the markdown content, and it automatically sets up the storage if it hasn’t been initialized yet. You have quick options to switch between a standard folder-based approach, a centralized JSONL log, or disabling all output. If you’re running multiple iterations of a strategy and the working directory changes, you can clear the cache to ensure fresh storage is used.

## Class MarkdownUtils

This class helps you control which parts of the backtest-kit framework generate markdown reports. You can pick and choose which areas – like backtesting, performance analysis, or strategy evaluation – produce reports.

The `enable` method lets you turn on markdown reporting for certain features. Think of it as subscribing to get updates and data for generating reports. Critically, after you enable services, you *must* use the cleanup function it returns to properly stop receiving those updates later – otherwise, you risk memory issues.

`disable` is used to stop markdown report generation for specific areas without affecting others. It immediately halts the data collection and report creation processes.

Finally, `clear` provides a way to reset the data used for markdown reports. It’s useful if you want to refresh the data for a specific report type, while keeping the reporting process itself active.

## Class MarkdownFolderBase

This adapter is designed to create easily navigable, human-readable reports by writing each report section to its own individual markdown file. Think of it as the standard way to organize your backtest results into distinct files within a directory structure. 

Each report file's location is based on the specified path and filename you provide, automatically creating any necessary folders along the way. 

It’s straightforward to use because it writes directly to files without needing any special setup or stream management. If you want to browse and examine your reports manually, this adapter is a great choice.

The adapter's constructor simply takes a key identifying the report target, and it has a `waitForInit` method that doesn’t actually do anything because it doesn't require any initialization steps. 

The core functionality lies in the `dump` method: provide it with the markdown content and some options (like the desired path and filename), and it handles creating the file and writing the content.


## Class MarkdownFileBase

The `MarkdownFileBase` class provides a way to automatically generate and manage markdown reports as JSONL files. Think of it as a centralized logging system for your trading reports. 

It creates a dedicated file for each type of markdown report (like trade details or performance summaries) and appends new data to these files in a consistent JSONL format. This format includes useful metadata like the trading symbol, strategy name, exchange, frame, and signal ID, allowing you to easily filter and analyze your reports later.

The class handles file creation, ensures data is written reliably with timeout protection and backpressure handling, and manages errors by reporting them through an exit emitter. Initialization is handled safely to avoid issues even if called multiple times.

To use it, you simply provide the name of the markdown report type during initialization, and then call the `dump` method to write content, including the markdown text itself and associated metadata. This makes it straightforward to keep a record of your trading activity for analysis and auditing.


## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility and efficiency. It lets you easily switch between different storage methods, like saving each markdown piece in a separate file or appending them to a single JSONL file.

Think of it as a central place to control how your markdown data is handled.

It’s designed to be adaptable—you can plug in your own storage methods if needed—and it avoids creating multiple storage instances for the same type of markdown, which saves resources.

Convenience methods like `useMd`, `useJsonl`, and `useDummy` provide quick shortcuts to common storage configurations. The `useDummy` adapter is particularly useful for testing or situations where you don't need to actually save anything. 


## Class MCPValidationService

This service helps ensure the integrity of your Model Context Protocols (MCPs) within the trading system. It keeps track of all registered MCPs and verifies that when an MCP is used, it actually exists and its dependencies are correctly set up. 

Think of it as a gatekeeper for your MCPs—you can't register the same MCP name twice, which prevents conflicts.

Here's what it does:

*   It registers MCPs, making sure each has a unique name.
*   It validates MCPs to confirm they are registered and their strategy dependencies are valid. It does this check only once per MCP name for efficiency.
*   It provides a way to list all registered MCPs.

Essentially, it helps prevent errors and ensures that your system is using the correct and valid MCP configurations.

## Class MCPUtils

The `MCPUtils` class acts as a bridge between a trading strategy and an agent, allowing the agent to observe and interact with the strategy’s live trading activity. It's essentially a centralized hub for communication and control.

It provides several key functions for getting information about the strategy:

*   `getDefaultMessages` gives you a snapshot of the entire portfolio, formatted for the agent to easily understand. It’s a comprehensive view of what’s currently happening.
*   `getHistoryMessages` provides a record of past trades, showing closed positions, results, and reasoning behind each decision. This helps the agent learn from past activity and avoid repeating mistakes.
*   `getAgentMessages` delivers direct messages from the strategy itself to the agent, like alerts about unusual behavior or potential problems. Think of it as the strategy proactively communicating important updates.
*   `getNotificationMessages` delivers specific events related to positions, such as opens, closes, and important notes, along with explanations for these actions. This creates a more complete narrative around the trades.
*   `getStatus` offers a real-time view of the current portfolio status, including price, entry/exit points, and profit/loss.

Beyond just observation, `MCPUtils` also enables direct control:

*   `commitPositionOpen` allows you to manually open a position, specifying levels and stop-loss settings.
*   `commitPositionClose` enables you to manually close a pending position.
*   `commitAverageBuy` lets you add a dollar-cost averaging (DCA) entry to a pending position.
*   `commitSignalNotify` allows you to send notifications to the agent about the pending position, which can be helpful for tracking and analysis.

Crucially, all of these functions operate with strict validation, ensuring the integrity of the entire trading process.

## Class MCPSchemaService

The MCPSchemaService acts like a central library for managing different blueprints, or schemas, that define how models and contexts interact. It keeps track of these schemas, associating each one with a specific name. 

When a new schema is added or an existing one is updated, the service performs a quick check to ensure it has the necessary elements. 

The service is essential for the backtest-kit framework because other components use it to understand and process messages related to trading strategies.

Here’s a breakdown of what you can do with it:

*   **Registration:** You can register new schema blueprints, giving them a unique name. If you try to register a schema with the same name again, it will replace the existing one.
*   **Modification:** You can also partially modify existing schemas, which is helpful for making small adjustments.
*   **Retrieval:**  You can retrieve a specific schema by its name, allowing other parts of the system to access and use it.

## Class LookupUtils

This component manages a record of ongoing backtesting and live trading activities. Think of it as a central log that keeps track of what's currently happening. Each time a backtest is started, or a live trade begins, an entry is added to this record. When those processes finish, the entries are removed.

It’s used to optimize how candles are processed - specifically, whether or not to temporarily pause the system to avoid overwhelming it when running in parallel.

You don’t need to create this object directly; it’s available as a pre-built singleton called `Lookup`.

Here's what you can do with it:

*   Add a new activity to the record when it starts.
*   Remove an activity from the record when it completes.  It’s really important to remove these entries, even if something goes wrong.
*   Get a list of all currently active activities to see what’s running.

## Class LoggerService

The LoggerService helps ensure your trading activities are logged consistently and with helpful details. It essentially acts as a wrapper around a logger you provide, automatically adding information like which strategy, exchange, and frame are being used, as well as the symbol, time, and whether it's a backtest. If you don’t configure a specific logger, it will default to a “no-op” logger that doesn't actually do anything.

You can customize the logging by setting your own logger implementation using `setLogger()`. The service provides methods like `log`, `debug`, `info`, and `warn` for different logging levels, all of which include the automatically added context. It uses `methodContextService` and `executionContextService` internally to manage and append this extra information.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage your backtest kit's logging. It allows you to easily switch between different logging methods, like storing logs in memory, persisting them to disk, or even disabling logging completely. By default, it uses an in-memory store, but you can swap it out with persistent storage or a dummy adapter that does nothing.

The `LogAdapter` keeps track of a log factory, and builds the actual logging instance only when needed, reusing it for efficiency.  You can use methods like `usePersist`, `useMemory`, and `useDummy` to change how logs are handled.  The `useJsonl` method lets you write logs directly to JSONL files.  

If the base path for your logs needs to change, like when the current working directory updates between strategy runs, calling `clear` forces a rebuild of the logging instance to use the updated path. The `log`, `debug`, `info`, `warn`, and `agent` methods simply forward log messages to the currently active logging method.

## Class LiveUtils

The `LiveUtils` class simplifies live trading operations by providing tools and utilities for managing and interacting with live trading processes. It acts as a central point for common tasks, ensuring consistency and streamlining development.

It offers ways to run live trading, both in the foreground (yielding results) and in the background (for side effects). You can retrieve details about pending or scheduled signals, and get insights into the current position's performance like total percentage closed, cost basis, or profit/loss metrics.

There are functions to manage the position, for instance, adjusting stop-loss and take-profit levels, executing partial closes, and adding DCA entries. You can also pause or stop trading activity.  The class includes utility methods for retrieving and exporting statistical data related to the ongoing trading process, providing a convenient way to monitor performance and generate reports. Crucially, it incorporates crash recovery, persisting state to disk so trading can resume where it left off. A key feature is the ability to commit changes, like signal activations or partial closes, to the live trading system.

## Class LiveReportService

The LiveReportService is designed to keep a record of everything happening with your trading strategy as it runs live. It listens for events like when the strategy is idle, when a trade is opened, when it’s actively trading, and when a trade is closed.

Think of it as a detailed logbook for your trading activity. 

It carefully captures all the information about each event, and stores it securely in a database. To prevent accidental duplicate logging, it makes sure it only subscribes to the live signal once. 

You can easily start and stop this logging process – the `subscribe` property gives you a way to start listening, and the `unsubscribe` function cleanly stops it when you're done. It also has a `loggerService` property you can use for debugging purposes.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports of your live trading activity. It listens for every event that happens during trading – from when a strategy is idle to when a trade is opened, active, or closed.

It organizes these events and presents them in easy-to-read markdown tables, including key statistics like win rate and average profit/loss. These reports are automatically saved as `.md` files in a designated log directory, making it simple to track and review your trading performance.

You can subscribe to receive these live events, and the service ensures you don't accidentally subscribe multiple times.  You can also retrieve specific data or reports for a particular trading symbol and strategy or completely wipe the accumulated data if needed. It uses a system of storage to keep data separate for different trading combinations, ensuring clean and organized reports.


## Class LiveLogicPublicService

LiveLogicPublicService acts as a central point for managing live trading activities, handling the complexities of context and data flow behind the scenes. It builds on top of LiveLogicPrivateService, making it easier to use by automatically passing along essential information like the strategy and exchange names to the functions you use.

Think of it as a helpful assistant that sets up the environment for your trading strategy before it even begins.

It streams trading events – signals to open, close, or cancel positions – in a continuous, never-ending sequence.

Importantly, this system is designed for resilience: if something goes wrong, it can recover and pick up where it left off, thanks to saved state. It relies on the current time to keep everything synchronized and progressing in real-time.

To start trading, you simply tell it which symbol you want to trade and provide basic context; it takes care of the rest.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, working behind the scenes to keep things running smoothly. It uses a continuous loop to monitor the market and react to changes.

The core of this system is an infinite generator—it never stops producing updates—yielding information about trades that have been opened or closed.  It cleverly streams results rather than storing them all at once, which helps with efficiency.

If something goes wrong and the process crashes, it automatically recovers, ensuring your trading strategy continues without interruption.  You can specify which asset, or symbol, you want to trade.

Here's a breakdown of what it uses internally:

*   It relies on a `loggerService` for logging events.
*   `strategyCoreService` handles the strategy's logic.
*   `methodContextService` provides context for the methods being used.



Essentially, this service provides a robust and continuous way to execute your trading strategy and receive real-time updates on its performance.

## Class LiveCommandService

This service, `LiveCommandService`, is your gateway to running live trades within the backtest-kit framework. It simplifies the process of interacting with the underlying live trading logic, making it easier to integrate into your applications through dependency injection.

It handles the heavy lifting of validating your trading strategy and associated risk settings, and it does this efficiently by remembering previous validations. 

The `run` method is the core functionality, allowing you to initiate live trading for a specific symbol.  It continuously generates results (either opening, closing, or canceling trades) while automatically recovering from any crashes, ensuring a robust and persistent trading process. You pass in the symbol to trade and some contextual information like the strategy and exchange names.


## Class IntervalUtils

The `IntervalUtils` class helps manage functions that need to run only once within a specific time interval. It provides two ways to do this: one that keeps track of the firing in memory, and another that persists the information to a file, so it remembers even if the program restarts. 

You get a single, easy-to-use `Interval` object to work with these features.

When you wrap a function using `fn`, it will only run once per interval, and it can be told to retry if it initially returns nothing. The `file` method does something similar, but uses a file to store the information, ensuring that the function runs only once per interval even if your program restarts.

If you no longer need a function's interval management, you can "dispose" of it to release the resources it was using. You can also clear *all* of these interval trackers to start fresh, which is useful when your project's working directory changes. Finally, there's a way to reset the counter used by the file-based functions, which can prevent conflicts when starting over.

## Class HighestProfitUtils

This class helps you analyze and understand your trading results by focusing on the periods of highest profit. It's like having a tool to extract and summarize the best moments of your strategies.

The class provides a single, readily available instance to access information gathered about highest profit events.

You can use it to retrieve detailed statistics for a specific trading symbol, strategy, exchange, and timeframe.

It also generates markdown reports that list all instances of the highest profit events, allowing for a clear overview of performance.

Finally, you can have these reports saved directly to a file for later review or sharing.

## Class HighestProfitReportService

The `HighestProfitReportService` helps keep track of your best trading results. It listens for updates on the `highestProfitSubject`, which signals when a new highest profit is achieved.

Each time a new highest profit is detected, the service records details like the timestamp, symbol, strategy name, exchange, and the specifics of the trade signal (position, prices). This information is saved in a JSONL report database for later analysis.

To start saving these profit records, you need to use the `subscribe` method. This ensures that you only subscribe once – subsequent calls to `subscribe` will simply return the original unsubscribe function.

If you want to stop the service from recording new highest profits, you can use the `unsubscribe` method, which effectively disconnects it from the `highestProfitSubject`.

## Class HighestProfitMarkdownService

This service is designed to automatically create and store reports detailing the highest profit generated for specific trading strategies. It keeps track of events related to profit, organized by symbol, strategy, exchange, and timeframe.

It subscribes to a stream of data (`highestProfitSubject`) to collect this information. Once subscribed, it will continue to receive and process profit events. Importantly, subscribing multiple times won't re-subscribe – it remembers the initial subscription.  You can unsubscribe to stop receiving updates and clear all stored data.

When it receives a new profit event, it sorts and stores it based on the symbol, strategy, exchange, and timeframe used in the trade.  You can request the raw data, generate a formatted markdown report, or save the report directly to a file.

Finally, you can clear the stored data entirely or selectively clear data for a specific symbol, strategy, exchange, and timeframe. This allows you to reset the tracking for particular combinations while preserving other data.

## Class HeatUtils

HeatUtils offers tools to visualize and analyze portfolio performance through heatmaps, making it easier to understand how your strategies are doing. Think of it as a way to quickly get a visual overview of your trading results.

It automatically gathers statistics for each symbol used by a strategy, providing a comprehensive breakdown of performance.

You can retrieve the raw data using `getData` to examine detailed metrics like total profit and loss, Sharpe ratio, and maximum drawdown for each symbol.

`getReport` generates a nicely formatted markdown table that summarizes these key performance indicators, allowing you to easily compare symbols and identify areas for improvement.  This report sorts symbols by total profit, highlighting top performers.

Finally, `dump` allows you to save that report directly to a file, so you can share it or keep a record of your strategy's progress – it creates the necessary folders if they don't already exist.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading results by recording when your signals close. It specifically focuses on closed signals that have profit and loss (PNL) data, allowing for a portfolio-wide view of your trading performance. 

This service listens for signal events and saves this information to a database, which can then be used to generate heatmap visualizations.

To get started, you’ll subscribe to receive these signal events; the service prevents you from subscribing multiple times. You can also unsubscribe to stop receiving the updates. 

The HeatReportService uses a logger for debugging and works with a tick object to process signal data.

## Class HeatMarkdownService

The Heatmap service helps you visualize and analyze the performance of your trading strategies. It listens for trading signals, collects data, and organizes it to give you a clear picture of what's happening across your portfolio.

It keeps track of key metrics like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), and maximum drawdown for each symbol you're trading. You can see these metrics aggregated for entire strategies and get detailed breakdowns per symbol.

The service generates reports in Markdown format – easy-to-read tables summarizing your trading performance.  It’s also designed to handle potential errors gracefully, avoiding issues that can arise from unusual data.  It cleverly manages storage so that data for different exchanges, timeframes, and backtesting modes are kept separate and readily available.

You can subscribe to receive updates as new trading signals come in and unsubscribe when you no longer need them.  The clear function allows you to reset the data for a specific exchange, timeframe, or all exchanges, letting you effectively start fresh when needed. Finally, you can easily save the generated reports to a file.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframe configurations and make sure they’re set up correctly. Think of it as a central manager for your timeframes. 

You can add new timeframes using `addFrame`, providing a name and a schema definition. 

Before you start any trading operations based on a timeframe, it's a good idea to use `validate` to confirm it exists. This helps prevent errors and unexpected behavior. 

If you need to see all the timeframes you’ve registered, `list` will give you a handy list of their schemas. 

Internally, the service is designed to be efficient, storing the results of validations to avoid repeated checks.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas in a safe and organized way. It uses a specialized system to store these schemas, making sure everything is typed correctly and avoiding errors. 

You can add new frame schemas using the `register` method, and retrieve them later using the `get` method and their assigned name. If a schema already exists, you can update parts of it with the `override` method.

Before schemas are added, the `validateShallow` process checks that they have the necessary components and the correct types, ensuring consistency within your system. The service also includes logging capabilities, managed through the `loggerService` property, to help you debug and monitor its activity.

## Class FrameCoreService

FrameCoreService is a central component that handles the creation of timeframes needed for backtesting. It works closely with other services, like those managing frame connections and validating data. Think of it as the engine that provides the sequence of dates and times your trading strategy will be tested against.

It uses a `FrameConnectionService` to actually retrieve the timeframe data.

The `getTimeframe` method is its key function, allowing you to specify a symbol (like a stock ticker) and a timeframe name (like "1h" for hourly data), and it will return an array of dates representing the periods to be backtested.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing backtest frames. It automatically directs requests to the correct ClientFrame implementation based on the current method context. To optimize performance, it remembers which ClientFrames have already been created, so it doesn't have to recreate them unnecessarily.

Think of it as a smart router for your backtest data, ensuring you're working with the right timeframe.

It provides a way to get the timeframe boundaries (start and end dates) for a specific symbol, enabling you to focus your backtest on a particular period.

The `clear` function is crucial for ensuring your backtests always use the most up-to-date data – it's like refreshing the system to prevent stale data from influencing results. It's a good practice to use it at the beginning of a backtest or walk forward analysis.

Essentially, it handles the details of working with and managing different backtest timeframes so you can concentrate on building and evaluating your trading strategies.

## Class ExchangeValidationService

This service helps you keep track of and make sure your exchanges are properly set up and available for use. It acts like a central manager for your exchange configurations, allowing you to register new ones and confirm they're ready to go.

The service keeps a record of all registered exchanges and performs checks to ensure they exist before any operations are attempted. To speed things up, it remembers the results of previous validations, so it doesn't have to repeat those checks unnecessarily.

Here’s what you can do:

*   **Register Exchanges:** Use `addExchange()` to add new exchange configurations to the system.
*   **Validate Exchanges:** `validate()` lets you double-check if an exchange is registered and ready for use.
*   **List Exchanges:** `list()` provides a way to see all the exchange configurations that have been registered. 

Essentially, it helps prevent errors by guaranteeing that the exchanges you’re working with are valid and present.

## Class ExchangeUtils

This class, ExchangeUtils, is designed to make interacting with different exchanges easier and more consistent within the backtest-kit framework. It acts as a central helper, providing convenient ways to retrieve various data points like candles, average prices, and order books. Think of it as a tool that simplifies common exchange-related tasks.

It uses a special pattern to ensure each exchange has its own dedicated processing space, preventing conflicts.

Here's what it can do:

*   It can fetch historical candle data, automatically figuring out the correct time range based on the interval and amount of data you need.
*   It calculates the average price based on recent trading activity.
*   It can retrieve the closing price from the most recent candle.
*   It formats quantities and prices to match the specific rules of each exchange, ensuring accurate order placement.
*   It can get order book data and aggregated trade histories.
*   It provides a way to fetch raw candle data with customized date ranges, and includes safety measures to prevent bias when used in backtesting scenarios.

## Class ExchangeSchemaService

This service helps you keep track of information about different cryptocurrency exchanges – think of it as a central address book for their details. It uses a special system to store these details safely and accurately, ensuring everything is typed correctly.

You can add new exchanges using `addExchange()` and find them again later using their name with `get()`. Before adding, `validateShallow` quickly checks that the basic information for a new exchange is present and in the right format. 

If you need to update an existing exchange's details, `override` lets you make changes in a controlled way.  The service also keeps a log of activity, with helpful logging capabilities provided through `loggerService`. It utilizes a registry (`_registry`) to hold all the exchange schemas.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that important information like the trading symbol, timestamp, and backtest settings are consistently passed along. It builds upon connection and execution services to provide a unified interface. 

This service handles tasks such as retrieving historical and future (in backtest scenarios) candle data, calculating average prices (like VWAP), obtaining order book information, and formatting prices and quantities. It also supports fetching aggregated trades and raw candle data with customizable date ranges. To avoid unnecessary repetition, the validation process for exchange configurations is cached. Essentially, it streamlines exchange-related operations while maintaining awareness of the overall trading context.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently directs requests for data and operations to the correct exchange implementation based on the configured exchange name. To optimize performance, it remembers (caches) these exchange connections, so it doesn't have to recreate them repeatedly.

This service provides a consistent interface (`IExchange`) for accessing exchange data, including historical candle data, order books, and aggregated trades.  You can request candles from the past (`getCandles`), retrieve the next batch of candles based on the current timestamp (`getNextCandles`), get the average price (using real-time data or VWAP calculations depending on whether you're in live or backtest mode), or format prices and quantities to match the exchange’s specific requirements. It handles complexities like determining the correct exchange to use and ensuring that prices and quantities are formatted accurately for each platform. You can also retrieve raw candle data with custom start and end dates.


## Class DumpAdapter

The `DumpAdapter` provides a way to save different kinds of data during a trading backtest, like message histories, records, tables, text, errors, and JSON objects. It's designed to be flexible, allowing you to choose where this data is stored – by default, it writes to markdown files.

You can easily switch between different storage methods: write to memory, discard all data with a dummy backend, or provide your own custom storage solution. It’s important to activate the adapter using `enable` before using any of its dumping methods, and deactivate it using `disable` when you're done. The `clear` function is useful when your project's base directory changes, ensuring that old data doesn't stick around. Essentially, the adapter handles the details of how data is saved, letting you focus on the backtest itself.

## Class CronUtils

The `CronUtils` class helps schedule tasks to run at specific times within backtesting environments. It ensures that even when multiple backtests run simultaneously, the same tasks only execute once at the intended time.

Think of it as a system that makes sure events align correctly across parallel tests. It tracks entries by name and uses a generation counter to prevent issues if an entry is re-registered while a previous one is still running.

Key aspects include:

*   **Registration:** You register tasks with a name and interval.
*   **Coordination:** It manages in-flight tasks to avoid duplicated execution.
*   **Lifecycle:** It can be enabled to automatically synchronize with the testing process or disabled to reset the entire schedule.
*   **Memory management:** It clears out old records to keep things clean.
*   **Watermarking:** It keeps track of the last executed time to avoid skipping events.

This framework enables you to schedule actions that fire at specific boundaries within your backtests, even when those tests are running concurrently.

## Class ConstantUtils

This class provides a set of predefined percentages that are useful for setting take-profit and stop-loss levels when trading. These levels are calculated using a method inspired by the Kelly Criterion and incorporate a decay system to manage risk. Essentially, the values represent points along the journey to your ultimate profit or loss target.

For example, if you're aiming for a 10% profit, TP_LEVEL1 would trigger when the price reaches 3% profit, TP_LEVEL2 at 6%, and TP_LEVEL3 at 9%. The stop-loss levels work similarly, helping to protect your capital and manage risk during the trade.

*   TP_LEVEL1: Represents an early opportunity to lock in a portion of your profit.
*   TP_LEVEL2: Allows you to secure a significant amount of profit while potentially allowing the trend to continue.
*   TP_LEVEL3: A final exit point, leaving you with minimal exposure.

Similarly:

*   SL_LEVEL1: Alerts you to a potential weakening of your trade setup.
*   SL_LEVEL2: Provides a definitive exit point to avoid substantial losses.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading configurations are mathematically sound and have the potential to be profitable. It thoroughly checks the global configuration settings, looking for things like incorrect values or combinations that would lead to losses.

Specifically, it verifies percentage-based parameters like slippage and fees to ensure they're non-negative. It also makes sure that your minimum take-profit distance is sufficient to cover all trading costs, guaranteeing a profit when the take-profit is reached.

The service also checks relationships between parameters – for example, ensuring stop-loss distances are set up correctly – and validates that time-related parameters are positive whole numbers. Finally, it looks at settings related to how candle data is fetched and processed, confirming those values are also reasonable. Essentially, it's a safety net to prevent common configuration errors.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It’s designed to check that your column definitions conform to the expected structure, preventing errors later on.

It examines all the columns defined in your configuration, verifying several essential things.  Each column must have a key, a label, a format, and a visibility setting.  The key and label values also need to be strings, and importantly, these keys need to be unique within their groups.  Finally, the format and visibility properties must actually be functions that can be executed.

The `validate` method performs this complete validation process on your column configurations. The `loggerService` property is used for any internal logging during this validation.

## Class ClientSweep

ClientSweep helps you efficiently find the best settings for your trading strategies. It's designed to quickly test many different strategy ideas against historical data, looking for the most promising combinations of parameters like stop-loss levels, take-profit targets, and holding durations.

It works by simulating each strategy idea once for each grid point, avoiding the need to rerun full backtests for every possible setup. The system focuses on individual strategy performance, without considering how strategies might interact with each other.

Here’s how it operates:

First, it prepares your strategy ideas by filtering out irrelevant ones and organizing them by publication time. 
Next, it builds performance profiles for each strategy idea by pulling candle data as needed. 
Then, it creates a list of authors to exclude based on poor performance, using the full range of available data.
Following that, it evaluates each strategy against every grid point, checking for common trading errors and calculating profitability metrics.
Finally, it ranks the strategies based on their performance and compiles a result report.

This process provides several opportunities to monitor its progress via callbacks at different stages. Importantly, the results from ClientSweep are meant to be verified with a full backtest to confirm its findings. It identifies potential winners, but a full engine backtest validates those choices. 

Each ClientSweep run is independent of previous runs, and it doesn’t store any state between runs.

## Class ClientSizing

This component helps determine how much of an asset to trade based on various strategies. It offers different sizing methods like a fixed percentage, Kelly Criterion, or using Average True Range (ATR), giving you flexibility in your approach. You can also set limits on the minimum or maximum position size, and a percentage cap on how much capital can be used for any single trade. 

The component also allows you to add custom checks and logging for more control over the sizing process. It's a key part of how a trading strategy decides on the right amount to invest in each trade.

To use it, you provide configuration details through parameters, and then the `calculate` method figures out the appropriate position size based on the provided data.

## Class ClientRisk

ClientRisk handles portfolio-level risk management to prevent signals from breaking configured limits. It keeps track of maximum concurrent positions and allows for custom validations based on active positions. Multiple strategies can share a single ClientRisk instance, enabling cross-strategy risk analysis.

The `constructor` takes `IRiskParams` to configure the risk checks.

Key properties include:

*   `params`: Holds the initial risk parameters.
*   `_activePositions`: A map tracking active positions across strategies.
*   `_reservedKeys`:  Manages temporary placeholders for signals that are being processed but haven't fully completed, preventing concurrency issues.
*   `waitForInit`: Initializes positions by loading them from stored data (skipping this in backtest mode).
*   `_updatePositions`: Persists the current positions (skipping in backtest mode).

The core functionality lies in `checkSignal`, which determines if a signal is allowed based on risk limits, and `checkSignalAndReserve`, a safer version that reserves a placeholder to avoid concurrency problems.

The `addSignal` method registers a new, opened signal, while `removeSignal` cleans up when a signal is closed. These methods are called by the StrategyConnectionService.

## Class ClientFrame

The ClientFrame helps build backtests by creating the sequences of timestamps needed to run simulations. It avoids repeating work by remembering previously calculated timeframes. 

You can adjust how far apart these timestamps are, choosing intervals from one minute to one day.  

It also allows you to add extra steps – like verifying data or recording events – as the timeframe is being prepared. Essentially, this component feeds the backtesting engine the timeline it needs to operate.

The `getTimeframe` property is the core of its function – it’s responsible for producing these timestamp arrays, and it intelligently caches them to boost performance.

## Class ClientExchange

This `ClientExchange` component is your bridge to getting historical and future market data. It's designed to be efficient and reliable, using techniques to minimize memory usage.

Think of it as a toolkit for fetching data – it can grab historical candles, predict future ones for backtesting, and even calculate the volume-weighted average price (VWAP) to understand average pricing over time.  It also handles formatting prices and quantities to match specific exchange requirements, ensuring accurate presentation.

Here's what you can do with it:

*   **Retrieve Candles:** You can pull historical and future candle data for specific symbols and time intervals. The system automatically adjusts timestamps to align with interval boundaries.
*   **Calculate VWAP:** It calculates the VWAP, a crucial indicator for understanding the average price paid for an asset.
*   **Format Data:** It helps present the data in a way that's correct and understandable for the exchange you're working with, handling decimal places and rounding.
*   **Get Order Books and Trades:** Access the current order book to see available buy/sell orders and retrieve aggregated trade data.
*   **Flexible Raw Data Retrieval:** `getRawCandles` gives you a lot of control – specify start and end dates and a limit to fetch exactly the data you need, while preventing any potential look-ahead bias.

The entire system is built with considerations for preventing look-ahead bias, ensuring your backtests and live trading strategies are accurate and fair. Each method is designed to be optimized for memory use and works consistently with different data sources.

## Class ClientAction

The `ClientAction` component acts as a central hub for managing and executing custom logic within your trading strategies. It handles the lifecycle of your action handlers, ensuring they're properly initialized, and routes events to the appropriate methods within those handlers. Think of it as a way to connect your strategy's core logic to things like logging, notifications, or analytics.

It manages the creation and cleanup of these handlers, making sure resources are handled efficiently.  It also guarantees certain initialization and cleanup steps happen only once using a "singleshot" approach.

`ClientAction` provides a variety of event handling methods, each geared towards specific scenarios like signal events (live, backtest, or both), breakeven and profit/loss levels, scheduled events, and order synchronization.  You can connect your own custom callbacks to these events to trigger specific actions based on what’s happening in the market. If an error occurs during order synchronization or checking, it is explicitly passed up to the calling function, instead of being caught and swallowed.

## Class CacheUtils

This utility class, `CacheUtils`, provides a way to automatically cache the results of your functions, which can significantly speed up your backtesting process. It's designed to be easy to use and helps avoid redundant calculations.

The main way to use it is through the `fn` property. You give it a function, and it returns a modified version of that function that automatically saves its results based on the timeframe you specify. This means if you call the function again with the same inputs within that timeframe, it will use the cached result instead of recalculating.

For asynchronous functions that benefit from persistent storage, there's also the `file` property. This wraps functions so they read and write to files on your disk for caching. These files are stored in a specific directory structure, and each function gets its own isolated cache instance.

If you need to completely start over with caching for a particular function, the `dispose` method clears the cache for that specific function.  You can also use `clear` to clear the entire cache, which is helpful if your working directory changes between strategy runs.  Finally, `resetCounter` helps ensure that cached files don't collide between strategy iterations when the working directory changes.



Each function you want to cache gets its own isolated cache instance, meaning different functions won't interfere with each other's caching.

## Class BrokerBase

This class serves as a foundation for creating adapters that connect your trading strategy to external exchanges. Think of it as a customizable bridge between your code and the real trading world.

It provides default behaviors for common actions like placing orders, canceling them, and managing stop-loss and take-profit levels.  You'll extend this class to implement the specific logic required by a particular exchange.

The class also handles sending notifications – for example, to Telegram, Discord, or via email – and recording trades for analysis.

Here's what you can expect:

*   **Easy Setup:**  The class handles much of the boilerplate code, so you don't have to implement everything from scratch.  Default "no-op" methods are provided so you only need to override the parts you need.
*   **Automatic Logging:** Every action is automatically logged for debugging and monitoring.
*   **Full IBroker Interface:** It fully implements the `IBroker` interface, ensuring consistency and compatibility.
*   **Lifecycle:** It has a clear lifecycle – initialization, event handling during trading, and optional cleanup.
*   **Event Handling:** Several event handlers (`onOrderOpenCommit`, `onOrderCloseCommit`, etc.) let you respond to specific trading events. These are useful for order placement, price adjustments, and notifications. Default implementations are provided for each to simply log the events.
*   **Error Handling:** Specific error types give you the ability to react to different error conditions while trading.

To get started, you'll need to extend this class, implementing the methods relevant to the exchange you want to connect to.  The `waitForInit()` method is important for initial setup, like logging into your exchange account.  The event handlers provide a structured way to react to key trading events.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper between your trading strategies and the actual broker. It's like a safety net, ensuring that actions like opening or closing orders are properly handled and that errors don’t corrupt your trading environment.

Think of it this way:

*   **Controlled Execution:** It intercepts order-related commands (like `commitOrderOpen`, `commitOrderClose`) to make sure everything is in order before sending them to the broker.  If something goes wrong during this process, it prevents the strategy from making changes to its state.
*   **Backtesting Safety:** During backtesting, it silently ignores these commit commands, preventing any real-world broker interactions.
*   **Real-World Connection:**  When live trading, it forwards those commands to the actual broker.
*   **Automated Signals:** It automatically handles some common events related to signals (like opening and closing positions) using subscriptions that you manage with `enable()` and `disable()`.
*   **Ping Signals:** It also handles informational "ping" signals to the broker related to active, scheduled, and idle status.
*   **Scheduled Order Management:** It manages scheduled orders by forwarding signals related to creation, cancellation, and other actions, making sure the framework and adapter are in sync - especially important since cancellations can race with order fills.

You register a broker adapter with `useBrokerAdapter()`, then activate it with `enable()`. Remember to `disable()` it when you're done to stop listening for signals.  `clear()` is a special function for refreshing the broker connection, useful when the environment changes. Each `commit*` method represents a specific action related to trade execution and position management.

## Class BreakevenUtils

This class helps you understand and analyze breakeven events that occur during trading. It’s designed to provide both statistical summaries and detailed reports about these events.

You can use it to retrieve aggregated statistics like the total number of breakeven events.

It can also generate markdown reports, which present a table of individual breakeven events, including details such as the symbol traded, strategy used, entry price, and time of the event.

Finally, it allows you to save these reports to files, creating neatly formatted markdown documents that you can easily share or review later. These files are organized by symbol and strategy, making them easy to find.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven points. It listens for these "breakeven" events and records them, along with all the details about the signal, in a database. This allows you to analyze and monitor your trading performance over time.

You can easily set it up to receive these breakeven notifications and then stop it when you no longer need it. It's designed to prevent accidentally subscribing multiple times, ensuring accurate logging.

Here’s how it works:

*   It uses a logger to provide debugging information.
*   The `tickBreakeven` component handles the actual processing and logging of these events.
*   The `subscribe` method lets you start receiving breakeven notifications, and it gives you a way to stop those notifications too.
*   The `unsubscribe` method stops the service from receiving any more notifications. It effectively reverses the `subscribe` action.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically generate and save reports about breakeven events – those points where a trade becomes profitable – for your trading strategies. It listens for these events, keeps track of them for each symbol and strategy you're using, and then turns that data into easy-to-read markdown tables.

You can easily subscribe to receive these events and unsubscribe when you're done. The service handles saving these reports to disk, organizing them by symbol and strategy, so you have a record of your trading performance. 

It also allows you to retrieve statistics like the total number of breakeven events, and clear out old data when you want to start fresh. The system is designed to keep each symbol, strategy, exchange, frame, and backtest combination completely separate in its data storage.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for tracking breakeven points within the trading system. Think of it as a middleman; it receives requests related to breakeven calculations and passes them on to a specialized connection service. It also keeps a detailed log of all breakeven activity, making it easier to monitor and troubleshoot.

This service is designed to be injected into the core trading strategies, simplifying how they interact with the breakeven functionality.  It's a key part of how the system is built, following a dependency injection pattern to keep things organized.

Several validation services are also integrated to ensure that the trading strategies, risks, exchanges, frames, and actions being used are all valid and properly configured.  A caching mechanism helps prevent unnecessary validations.

The `check` function decides if a breakeven trigger should occur and then passes that request along. Similarly, the `clear` function handles clearing breakeven states when a trade closes, always logging these actions for auditing purposes.

## Class BreakevenConnectionService

The BreakevenConnectionService is a central component for managing breakeven tracking within the system. Think of it as a smart helper that keeps track of breakeven points for different signals, preventing the need to create redundant tracking objects.

It creates a dedicated breakeven tracking object for each signal, storing these objects in a way that avoids repeated creation – a process called memoization. The service is responsible for setting up these tracking objects with the necessary tools and then directing specific checks or clear actions to the appropriate object.

When a signal is opened or closed, the BreakevenConnectionService handles the associated actions, retrieving the relevant tracking object, performing the necessary operation (checking if a breakeven has been met or clearing the tracking), and then removing the object when it's no longer needed. This process ensures efficient memory usage and reliable breakeven tracking throughout the trading process. The service works closely with other parts of the system, receiving configuration and reporting events as it operates.

## Class BacktestUtils

The `BacktestUtils` class provides helpful tools for running and analyzing backtests within the trading framework. It's designed to simplify common backtesting tasks and offers a convenient, centralized way to interact with the backtest system.

You can use `run` to execute a backtest for a specific symbol and context, or `background` to run a backtest without real-time output, useful for automated tasks.

Need to check for signals or position details? Functions like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionPnlCost` provide easy access to these critical pieces of information.

The class also has methods for managing and manipulating active positions, such as `commitPartialProfit` to execute partial closes and `commitAverageBuy` to add DCA entries.

Finally, `getReport` and `dump` are available for generating and saving detailed backtest reports. This singleton instance helps keep backtest operations consistent and easy to access across your application.

## Class BacktestReportService

This service helps you keep a detailed record of what's happening during your backtests. It listens for signals from your trading strategy, tracking key moments like when a signal is idle, opened, active, or closed.

Think of it as a meticulous observer, capturing all the important events related to your signals. These events, along with all the signal details, are then stored persistently, allowing you to analyze and debug your strategy later on.

You can easily sign up to receive these events, and the system ensures you won’t be subscribed multiple times. When you’re done, there's a simple way to stop the service from collecting data. The service uses a logger for debugging output and handles all tick events.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your trading strategies during backtesting. It works by listening to the market data (tick events) and keeping track of when trades are closed. 

The service stores information about closed trades for each strategy, making sure the data is organized and accessible. It then uses this information to generate well-formatted markdown reports that are saved as files. These reports include details like signal information, allowing you to analyze the performance of your strategies.

You can request data or reports for specific symbols, strategies, exchanges, and timeframes. The service also allows you to clear out accumulated data when you’re finished with a backtest or want to start fresh. Finally, there’s a way to subscribe to receive these tick events and unsubscribe when you no longer need them.

## Class BacktestLogicPublicService

The `BacktestLogicPublicService` helps manage and run backtests in a straightforward way. It builds upon the `BacktestLogicPrivateService` and cleverly handles context – like the strategy, exchange, and frame – so you don't have to pass it around repeatedly. 

Think of it as a way to simplify your backtesting code.

Here's a breakdown of its core components:

*   It uses a logger service to track what’s happening.
*   It relies on the `BacktestLogicPrivateService` to do the heavy lifting of the backtest.
*   It also utilizes services for time management, frame schemas, and exchange connections.

The main thing you’ll use is the `run` method.  This method allows you to kick off a backtest for a specific symbol, and it automatically takes care of injecting the required context. The results are streamed back to you, allowing for efficient processing of signals and order statuses as the backtest progresses.

## Class BacktestLogicPrivateService

This service manages the overall process of backtesting a trading strategy. It works by first gathering timeframes from a frame service, then stepping through each timeframe.

When a trading signal appears (a buy or sell opportunity), it fetches the necessary historical price data (candles) and runs the core backtesting logic. 

The service then intelligently skips ahead in time until the signal is resolved (either a buy is filled or a sell is executed). This makes the process very efficient.

Crucially, the results are delivered in a continuous stream, rather than accumulating them in a large array, saving memory. You can also stop the backtest early if needed.

The service relies on several other core services like the strategy core, exchange core, frame core, action core, time meta, and price meta services to function. It also utilizes a logger to track what’s happening during the backtest. 

The `run` method is the primary way to interact with this service; it starts the backtest process and provides a stream of results.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the system. It provides a simplified way to access the core backtesting logic, making it easier to integrate into different parts of the application. 

Think of it as a go-between for your requests and the actual backtesting engine.

Several supporting services like risk and action validation, along with schema and exchange validation, are used internally to ensure everything runs smoothly and correctly. 

The `validate` function checks your trading strategy and associated risk settings, and it remembers previous checks to speed things up.

Finally, the `run` function is how you actually kick off a backtest for a particular trading symbol, providing details about the strategy, exchange, and frame being used. It returns a stream of results as the backtest progresses.

## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your action handlers – those pieces of code that respond to specific events. Think of it as a central librarian for your actions, ensuring they're all present and accounted for before anything goes wrong.

It lets you register new action handlers, so the service knows what's available.  You can then use it to double-check that a particular action handler actually exists before trying to use it. To speed things up, the service remembers the results of its checks, so it doesn't have to repeatedly validate the same actions. Finally, you can get a complete list of all the registered action handlers if you need to.

The service also has a `loggerService` property to help track what's happening and an internal `_actionMap` to manage the handlers.


## Class ActionSchemaService

This service acts as a central hub for managing how actions work within your system. It keeps track of different action types and ensures they're set up correctly. 

Think of it as a librarian for action blueprints. It stores these blueprints in a way that prevents errors and makes sure everything is consistent. 

It makes sure that actions only use the methods they’re supposed to, and it allows you to update existing action blueprints without having to create them from scratch.

Here’s a breakdown of what it does:

*   **Registers actions:**  It adds new action types to its collection, carefully checking them to make sure they’re valid.  It won't let you register the same action type twice.
*   **Validates actions:** Before registering, it performs a quick check to make sure the action's structure is sound and that it's using permitted methods.
*   **Allows overrides:** You can modify existing action blueprints – like changing a callback function – without having to re-register the whole thing.
*   **Retrieves actions:** It provides a way to get the full details of a registered action type when you need it.

## Class ActionProxy

The `ActionProxy` acts as a safety net when you're using custom code (called actions) within the backtesting framework. It ensures that any errors happening within your custom code don't crash the entire backtesting process.

Think of it as a wrapper around your action handlers, automatically catching any errors that might occur. These errors are logged and reported, but the backtesting continues, preventing unexpected interruptions.

Here’s a breakdown of how it works:

*   **Error Handling:** It wraps every possible action method (like `init`, `signal`, `dispose`, etc.) in a `try...catch` block. If something goes wrong in your custom code, the error is caught, logged, and the backtest continues.
*   **Partial Implementations:** It handles cases where you might not have implemented all the required action methods. If a method is missing, it gracefully returns `null` instead of causing a crash.
*   **Factory Pattern:** You create `ActionProxy` instances using the `fromInstance` method, ensuring consistent error handling.
*   **Specific Events:** It manages various events during a backtest, including signal events (in different modes), breakeven/profit/loss levels, scheduled events, and more. Each event has a corresponding error-handling method.
*   **Important Exceptions:** There are two methods (`orderSync` and `orderCheck`) that *don't* have the `try...catch` wrapper. Errors in these methods are intentionally allowed to propagate, as they're critical for order synchronization and pending orders.

Essentially, `ActionProxy` makes it much safer and easier to integrate your own custom code into backtests while ensuring the stability of the overall process.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It's responsible for coordinating the execution of these actions, making sure they happen in the correct order and according to the strategy's defined rules.

Think of it as a traffic controller for actions. It fetches the list of actions from the strategy's blueprint, validates everything to make sure it's set up correctly, and then triggers each action in sequence.

Here's a breakdown of what it does:

*   **Initialization:** It prepares each action for use by loading any necessary data.
*   **Signal Handling:** It distributes incoming data (like price updates) to the relevant actions based on the strategy. It handles different signal types: standard signals, live signals, and signals from backtesting.
*   **Event Routing:** It delivers specialized events, such as breakeven calculations, partial profit targets, and order synchronization requests, to the appropriate actions.
*   **Validation:**  It checks that everything – the strategy itself, the exchanges it uses, the frames (time periods), and the actions – are valid before anything happens. This validation is smart and efficient, remembering previous checks to avoid unnecessary repeats.
*   **Cleanup:**  When a strategy is finished, it gracefully shuts down all associated actions.
*   **Data Clearing**: Provides functionality to clear the action data, either for specific actions or across all strategies.

Essentially, the ActionCoreService makes sure your trading strategy's actions are executed correctly and reliably.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions within your trading strategies. It takes an action name and intelligently routes that action to the correct implementation, ensuring the right logic is executed for each situation. To optimize performance, it remembers which actions have already been created, reusing them whenever possible instead of constantly rebuilding them.

This service relies on several other components – a logger for tracking events, a schema service for action definitions, and a core service for overall strategy management.

Several functions are provided to handle specific events like signal updates, breakeven calculations, scheduled tasks, and order synchronization. Each of these routes the event to the appropriate ClientAction for processing.

Finally, you can clear the cached actions to force a refresh, which can be useful for testing or managing state. The cache keys are based on the action name, strategy name, exchange name and frame name, ensuring the correct action is used within a specific strategy context.

## Class ActionBase

This class, `ActionBase`, is a foundation for creating custom actions within your trading framework. Think of it as a template to extend when you want to add your own logic for handling signals, managing state, or connecting to external services like Discord or email. It handles a lot of the boilerplate work for you, like logging events, and giving you access to details about the strategy and what's happening.

Here’s how it works:

1.  **Construction:** When you create your custom action, it's given information about the strategy, frame, and action it's associated with.
2.  **Initialization:** An `init()` method allows you to set up anything your action needs when it's first created, such as connecting to a database or setting up API connections.
3.  **Event Handling:** The class provides methods like `signal()`, `signalLive()`, and `signalBacktest()` that are called at various points during strategy execution.  `signal()` is used in both live and backtest modes, while `signalLive()` is used only for live trading, and `signalBacktest()` is used specifically for backtesting. Other methods handle events related to breakeven points, partial profit/loss levels, and monitoring signals.
4.  **Cleanup:**  Finally, the `dispose()` method runs when the action is no longer needed, allowing you to release resources and unsubscribe from any listeners.

The framework automatically logs all events, providing a record of what's happening.  You don't need to implement every method, the base class provides defaults for those you don't need.  Just focus on implementing the parts that are specific to your custom logic. Note: the `orderSync` and `orderCheck` methods are deliberately not implemented to prevent certain issues and encourage using `Broker.useBrokerAdapter`.
