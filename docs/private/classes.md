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

The WalkerValidationService helps you keep track of and verify your walker configurations, which are used for testing different parameter combinations in your trading strategies. Think of it as a central place to register your walkers and make sure they're set up correctly before you start running tests.

It allows you to add new walker configurations using `addWalker()`, and then quickly check if a walker exists before using it with `validate()`. This validation process also extends to the strategies the walker uses, ensuring everything is consistent. To speed things up, the validation service remembers previous validation results, so you don’t have to repeat the checks unnecessarily. You can see all registered walkers with the `list()` function.

The service relies on other services like `WalkerSchemaService`, `StrategyValidationService`, and others to handle specific validation tasks. 

Key components include:

*   A registry to store your walker configurations.
*   Checks to ensure walkers exist before use.
*   Caching to improve performance.
*   A way to view the registered walkers.

## Class WalkerUtils

WalkerUtils simplifies running and managing your walkers, which are automated trading strategies. It provides a central place to execute walkers and access their results.

Think of it as a helper tool that handles the technical details of running a walker, automatically identifying the correct settings and logging progress.

You can easily run a walker comparison for a specific trading symbol, or execute it in the background for tasks like logging or callbacks without needing to process the detailed output.  It also offers a way to stop walkers entirely, gracefully ending ongoing trades.

Need to see the results? WalkerUtils can fetch all walker data and generate a clear, formatted markdown report, or even save that report directly to a file. Finally, it allows you to list all the currently active walkers and see their status. WalkerUtils ensures each walker operates with its own independent instance for a given symbol.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema types used within the system. It's like a central place to store and manage these schemas, making sure they are consistent and well-defined.

It uses a registry to safely store the schemas, and you can add new ones using the `addWalker()` (or `register()`) method. When you need a specific schema, you can easily retrieve it by its name using `get()`. 

Before adding a new schema, the service will quickly check it to make sure it has the necessary parts and types, using `validateShallow()`. If a schema already exists, you can update parts of it with the `override()` method.

The service also uses logging to track what’s happening, providing context information through the `loggerService` property.


## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It acts like a data logger, capturing the results of each test run and storing them in a database.

Think of it as a tool to monitor your strategy's progress – it records the metrics and statistics from each test. You can use this information to see which parameters are working best and compare the performance of different strategies.

To start using it, you'll subscribe to receive updates about your strategy's optimization. This subscription is designed to prevent you from accidentally subscribing multiple times. When you're done, you can unsubscribe to stop receiving these updates. The service handles the details of writing this data to the database, allowing you to focus on analyzing the results and improving your strategies.

## Class WalkerMarkdownService

This service helps you create reports about your trading strategies as they're being tested. It listens for updates from the testing process, keeping track of how each strategy performs. The service builds nicely formatted markdown tables to compare your strategies side-by-side, making it easy to analyze the results.

It uses a special storage system to keep data separate for each trading strategy you're testing. You can subscribe to receive these updates, and unsubscribe when you no longer need them.

There are functions to retrieve specific data points, generate full reports, and save those reports as markdown files—typically in a logs directory. Finally, you can clear out all the collected data if needed, either for a specific strategy or all of them at once.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading strategies. It builds on a private service to automatically handle important information like the strategy name, exchange, frame, and walker identity—you don’t need to pass these in manually each time.

The main job of this service is the `run` method. This method lets you specify a symbol (like a stock ticker) and a context object. It then runs the walkers, effectively executing your backtesting strategies for that symbol, while automatically tracking all the relevant details for each run.

The service also has internal components for logging and schema management. These handle the technical details of recording events and validating data structures.


## Class WalkerLogicPrivateService

This service manages the process of comparing different trading strategies, often referred to as a "walker." It handles the complexities of running each strategy and keeping track of their performance.

The service works by first executing each strategy one after another. As each strategy finishes, it provides updates on the progress – you'll get information about the results as they become available. It also monitors the strategies and identifies the one performing best based on a chosen metric. Finally, it delivers a comprehensive report at the end, ranking all the strategies based on their results.

To make things easier, it uses other services like `BacktestLogicPublicService` to handle the actual backtesting process. It also leverages a logging service to track what's happening and a service for generating markdown reports.

You can start the process by calling the `run` method. This method takes the trading symbol, a list of strategies you want to compare, and a metric to measure their success. It then orchestrates the entire comparison, giving you progress updates along the way.

## Class WalkerCommandService

WalkerCommandService acts as a central point to interact with walker functionality, providing a simple interface for dependency injection. It bundles together several services related to walker logic, schema validation, and strategy validation.

This service has several components responsible for various checks: validating walkers, strategies, exchanges, frames, risks, and actions. It's particularly important for validating the walker and associated strategy configurations, and these validations are intentionally redundant for added safety.

The `run` function is key; it executes a walker comparison for a specific symbol while also passing along important contextual information like the walker, exchange, and frame names. This enables the execution of walker logic within a defined environment.


## Class TimeMetaService

TimeMetaService helps you get the most recent candle timestamp for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. Think of it as a central place to look up when the current candle started.

It keeps track of these timestamps using a special system that automatically updates as your strategies run.  If you need to know the current candle time while something's happening *outside* of the normal trading process, this service is designed to give you that information.

It's designed to be reliable, automatically checking if a timestamp is available. If it's not, it’ll wait briefly before letting you know, preventing errors.

Essentially, it's a way to ensure that everyone involved in your trading system has access to the same, up-to-date timestamp information. It's automatically managed, ensuring that stale data doesn’t cause problems. You can clear the stored timestamps if needed, especially when starting a new trading simulation or live trading session.

## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions clean and separate. It prevents one backtest from accidentally affecting another by managing how events are handled globally.

Think of it as a way to create a fresh, isolated environment for each test.

The `createSnapshot` function is key to this process. It essentially takes a picture of how your global event listeners are currently set up. This lets you temporarily clear them out, run a backtest, and then easily put them back exactly as they were afterward. This ensures that each backtest runs independently and reliably.


## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals by providing detailed reports and statistics. It collects information about signal openings and closings, storing up to 250 events for each combination of symbol and strategy.

You can use it to get aggregated statistics about your signals, like the total number of opens and closes.

It can also generate a comprehensive markdown report, which is like a nicely formatted table, showing you a lot of detail for each signal event: things like the signal ID, direction, prices, profit/loss, and when it happened. 

Finally, the `dump` method lets you save these reports as files, making it easy to review your trading activity and share it with others. The files are named to easily identify the symbol, strategy, exchange, frame, and whether it was a backtest or live trade.

## Class SyncReportService

The SyncReportService is designed to keep track of what's happening with your trading signals, specifically when they're created and closed. It listens for events related to signals – when they start (like a limit order being filled) and when they end (like a position being closed).

This service meticulously records details about these events, including information about the signal itself and, when a signal closes, important data like profit and loss and the reason for its closure.

The service uses a logger to help with debugging and stores the recorded events so you can analyze them later, which is useful for auditing and understanding your trading activity.

To make sure you don’t accidentally overload the system, it prevents multiple subscriptions to the signal events. You can tell it to start listening for signals using the `subscribe` function, which gives you a way to stop listening later. Similarly, the `unsubscribe` function allows you to completely stop the service from receiving and logging signal events.

## Class SyncMarkdownService

This service is designed to automatically create and save reports about your trading signals, specifically focusing on when signals are opened and closed. It keeps track of all these signal events and organizes them neatly.

You tell it to start listening for signal events by subscribing. Once subscribed, it automatically gathers data about each signal event, noting important details like when it happened and why a signal was closed (if applicable). To stop tracking, you can unsubscribe, which clears all the collected data.

The service generates reports in a markdown format.  You can request these reports for specific trading setups (symbol, strategy, exchange, timeframe, and whether it's a backtest or live trade). These reports include a table of the signal's lifecycle and statistics summarizing the number of events, opens, and closes.

You can also have the service directly save these reports to your hard drive. The filenames are structured to clearly identify the specific trade and time the report was generated. 

Finally, you can clear out the collected data, either for a specific trading setup or all of them, effectively resetting the service's memory. This is helpful for freeing up space or starting fresh with new data.

## Class SweepValidationService

This service is responsible for keeping track of all the different trading strategies ("sweeps") that are used in the system. It makes sure each sweep exists and is compatible with the exchanges it relies on.

Think of it as a gatekeeper for sweeps – it prevents duplicate registrations and ensures everything is set up correctly.

Here’s what it does:

*   It registers sweeps, ensuring each has a unique name.
*   It validates sweeps before they're used, checking for existence and exchange compatibility. This validation is efficient; once a sweep is checked, subsequent checks for the same sweep are skipped.
*   It provides a way to see a list of all registered sweeps.

The service uses other components – a logger and an exchange validation service – to do its job. Essentially, it prevents problems by verifying that the trading strategies being used are properly configured and compatible.

## Class SweepUtils

SweepUtils helps you evaluate many different trading ideas at once, almost like running a competition between them. It takes a set of ideas and runs them through a series of tests, profiling each one and then evaluating them based on various performance metrics.

The system explores a wide range of parameters to see how they impact trading results. These parameters include things like how to exit a trade (hard stop percentages, trailing stops, profit locks, and time limits) and how aggressively to trade.  Importantly, every idea gets a chance to enter a trade – there's no initial filtering based on author reputation.

The system grades each author's ideas based on whether the trade was profitable before hitting a stop-loss, and it tracks metrics like hit rate and recovery time. It then presents a report that ranks the best performing ideas and authors, along with detailed trade-level information.

The core function, `run`, performs the entire simulation process. It takes a symbol, a sweep name, and a list of trading ideas as input. The sweep intelligently manages data: ideas from other symbols are ignored, only one idea per author/direction is used within a certain time window, and ideas with incomplete data are excluded. The sweep uses a predefined schema (which you need to register beforehand) to control the testing process and combine parameters. The results are a comprehensive report including rankings, detailed data on each author's performance, and the raw tracks. Ultimately, the sweep is a way to test and compare trading ideas before deploying them in a real backtest.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage sweep schemas, which define how data is processed in a trading system. Think of it as a lookup table where each sweep (a specific task or process) has its own schema describing how it works.

It ensures that new schemas are initially checked for basic correctness before they’re used.

The service keeps track of these schemas, allowing other parts of the system to easily access them when they need to create and run sweeps.

Here’s what you can do with it:

*   **Register a schema:** You can register a new schema with a unique name. If you try to register a schema with a name that already exists, the existing schema will be replaced.
*   **Update a schema:** You can partially update an existing schema, merging in changes without replacing the whole thing.
*   **Retrieve a schema:** You can look up a schema by its name to get the complete definition.

This service works closely with logging and execution context to ensure things run smoothly and provide useful information.

## Class SweepGlobalService

SweepGlobalService acts as the main entry point for everything related to sweep operations. It’s the first place your code interacts with the sweep functionality.

Essentially, it checks to make sure the sweep you're referencing actually exists and is compatible with the exchange you're using. Then, it passes the work along to another service that handles the actual processing.

This service uses other specialized services for things like logging and validating sweeps.

The `run` method is how you kick off a complete simulation. You provide it with information about the symbol, sweep name, and the ideas you want to test, and it will handle the entire process of evaluating those ideas, from initial filtering to final ranking.


## Class SweepCoreService

The SweepCoreService acts as the central hub for running sweep simulations. It checks to ensure everything needed for a sweep is valid, like the asset and exchange involved. 

It then passes the details on to the connection layer, working alongside the SweepConnectionService to manage simulation data. 

Think of it as the brain coordinating the entire sweep process, from initial setup to final results.

Here’s what it uses internally:

*   A logger to record events and errors.
*   The SweepConnectionService for managing the sweep connections.
*   The SweepValidationService to confirm all necessary elements are in place before starting.

The `run` function is the key here - it takes a data package with the symbol, sweep name, and ideas, then performs a complete simulation involving profile analysis, filtering, grid evaluation, and ranking to produce a sweep result.

## Class SweepConnectionService

The SweepConnectionService manages how your trading strategies interact with sweep data. It acts as a central hub, handling the creation and reuse of client connections for different sweep configurations.

It essentially retrieves and sets up the right tools (ClientSweep) for each sweep you want to analyze, remembering these setups to avoid repeated work. Each sweep gets its own dedicated client, making sure it's configured properly, including using default grid axes if the sweep definition doesn't provide them.

You can use it to execute entire simulations, providing input data and receiving back results.

If you need to refresh the sweep configurations, you can clear the stored setups. This forces the service to reload the underlying sweep definitions and create new client connections.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central hub for all your strategy configurations. 

You can use it to register new strategies using `addStrategy()`, allowing it to manage and monitor them.  It checks not only that the strategy exists, but also validates any linked risk profiles and actions to prevent errors.

To improve speed, it uses a technique called memoization, which means it remembers the results of previous validations so it doesn’t have to repeat them. 

If you need to see what strategies are registered, the `list()` function will give you a list of all the strategy schemas it's managing.

## Class StrategyUtils

StrategyUtils helps you understand and analyze how your trading strategies are performing. It's like a reporting tool that collects information about strategy actions, such as when a trade is canceled or a profit is taken. 

You can use it to get statistical summaries, showing how often different actions occur. It can also create detailed reports in Markdown format, displaying a table of events with information like the symbol, strategy name, price, and timestamps. Finally, it can save these reports as files for later review and sharing. 

The system gathers data from strategy events and stores up to 250 events for each combination of symbol, strategy, and timeframe. You can customize the reports by selecting which columns to include. The file names generated are designed to clearly indicate the symbol, strategy, exchange, timeframe, and whether it's a backtest or live run.


## Class StrategySchemaService

The StrategySchemaService helps keep track of different strategy blueprints, ensuring they're all set up correctly. It uses a special system to store these blueprints in a way that's safe and avoids errors.

You can add new strategy blueprints using `addStrategy()`, and then get them back later by their name using `get()`.

Before a new strategy blueprint is officially stored, it's checked with `validateShallow` to make sure it has all the necessary parts in the right format.

If you need to update an existing blueprint, `override` lets you make changes to specific parts of it without having to redefine the whole thing. Essentially, it's a central place to manage and organize your strategy blueprints, guaranteeing consistency and preventing common mistakes.

## Class StrategyReportService

This service is designed to keep a detailed, permanent record of important events happening within your trading strategies. Think of it as an audit trail for your backtesting or live trading.

To start using it, you need to "subscribe" – this tells the service to begin listening for and recording strategy actions. Once subscribed, events like canceling orders, closing positions for profit or loss, adjusting stop-loss levels, and other crucial steps are automatically written to individual JSON files.

Unlike other reporting methods that hold data in memory, this service writes each event to disk immediately.

Here's a breakdown of the key events it logs:

*   **cancelScheduled:** Records when a pre-planned signal is canceled.
*   **closePending:** Captures the details of a pending position closure.
*   **partialProfit/partialLoss:** Documents partial exits from a position, noting the profit or loss.
*   **trailingStop/trailingTake:** Tracks adjustments to trailing stop-loss and take-profit levels.
*   **breakeven:** Logs when the stop-loss is moved to the entry price.
*   **activateScheduled:** Records early activation of a scheduled signal.
*   **averageBuy:** Tracks instances of averaging entries (DCA).

The `subscribe` function initializes the service, and `unsubscribe` stops the logging process and cleans up. It’s good practice to unsubscribe when you're finished to avoid unnecessary disk writes. The service also includes properties for accessing logging and context information.

## Class StrategyMarkdownService

This service helps you track and report on what your trading strategies are doing during backtesting or live trading. Instead of writing every action to a file right away, it holds them in memory – like a temporary notepad – to create more detailed and organized reports later.

Think of it as a way to gather all your strategy's activities, like when it cancels orders or closes positions, and then present them in a neat and understandable format.

**Here’s how it works:**

1.  **Start Collecting:** You need to "subscribe" to tell the service to start watching for events.
2.  **Events Happen:** As your strategy executes, actions like closing a position or adjusting a stop-loss are automatically recorded.
3.  **Get Reports:** You can request data, generate a markdown report, or save the report as a file.  You can even choose which details to include in the report.
4.  **Stop Recording:** When you're done, "unsubscribe" to stop recording and clean up the accumulated data.

**Key Features:**

*   **Temporary Storage:**  It gathers events in memory before creating reports, improving efficiency.
*   **Statistics:**  It can calculate statistics like how many times a strategy partially closed a position.
*   **Markdown Reports:** Generates easy-to-read reports formatted in Markdown.
*   **File Saving:**  Saves reports as files with descriptive names.
*   **Cleanup:**  Provides ways to clear out the collected data.



**Important Methods:**

*   `subscribe()`: Starts the tracking of events.
*   `unsubscribe()`: Stops tracking and clears data.
*   `getReport()`:  Creates a formatted report.
*   `dump()`: Generates and saves a report file.
*   `getData()`: Provides access to the accumulated data and statistics.
*   `clear()`: Clears out collected data.

## Class StrategyCoreService

The `StrategyCoreService` is a central hub for strategy operations within the backtest framework. It handles tasks like validating strategies, retrieving signal data, and calculating position metrics. Think of it as a mediator that injects crucial information – the symbol, timestamp, and backtest parameters – into the execution process.

It relies on several other services: `StrategyConnectionService` for managing strategies, and other services for validation.

Here's a breakdown of what it does and the key things it provides:

*   **Validation:** Ensures strategies and their associated configurations are valid.
*   **Signal Data:** Offers methods to retrieve the current pending or scheduled signal for a given symbol.
*   **Position Metrics:** Calculates and provides details about a position, including cost basis, entry prices, P&L, and partial close information.
*   **State Management:** Provides ways to pause, stop, or cancel strategies, and allows for scheduled signal activation.
*   **Lifecycle Methods:** Contains methods for disposing and clearing strategy instances.

Essentially, it's a collection of utility functions for interacting with and monitoring active strategies during a backtest. It allows access to many metrics like P&L, entry prices, and time elapsed, to analyze strategy performance.

## Class StrategyConnectionService

This service manages strategy instances, routing calls to the correct implementation based on symbol and strategy name. It keeps track of strategy instances to avoid recreating them unnecessarily, improving performance.

Here's a breakdown of what it does:

*   **Strategy Routing:** It intelligently directs calls to specific trading strategies based on symbols.
*   **Caching:** It stores and reuses strategy instances to speed up operations.
*   **Initialization:** It ensures strategies are properly initialized before any operations are performed.
*   **Handles both live and backtesting scenarios.**

It provides methods to:

*   Retrieve strategy data like pending signals, total positions, cost basis, and P&L.
*   Control strategy behavior, including pausing, stopping, and canceling signals.
*   Execute actions like partial profit/loss adjustments, trailing stops, and average buy orders.
*   Manage the state of strategies, including validating actions before they are executed.



Key components it relies on:

*   `loggerService` is used for logging events.
*   `executionContextService` and `methodContextService` manage context information.
*   `strategySchemaService` provides strategy schema information.
*   Various connection services (`riskConnectionService`, `exchangeConnectionService`, etc.) are used for specific tasks.


## Class StorageLiveAdapter

This component provides a flexible way to manage how your trading signals are stored. It acts as a bridge, allowing you to easily switch between different storage methods like persistent disk storage, in-memory storage, or even a dummy storage for testing. 

Think of it as a central point for all signal-related data, whether it's about when a signal opened, closed, or scheduled. It handles events like signals being opened, closed, scheduled, or canceled, and passes those actions on to the currently selected storage method. 

You can choose the storage method that best suits your needs: the default persistent storage saves data to disk, memory storage keeps data in RAM, or the dummy storage does nothing at all.  It intelligently caches the storage tools to avoid unnecessary creation, but has a `clear()` method to force a refresh when needed, for example, if your working directory changes. The `useStorageAdapter` method lets you plug in your own custom storage solutions too.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how trading signals are stored during backtesting. It acts as a bridge between your backtesting logic and different storage methods, allowing you to easily switch between them. By default, it uses in-memory storage, which is fast but data isn’t saved between runs.

You can swap this default with persistent storage (saving data to disk) or a dummy storage adapter (for testing where no data is actually saved). The `useDummy`, `usePersist`, and `useMemory` methods offer simple ways to change the storage method.

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` functions deal with specific events related to signals, passing these along to the currently selected storage adapter. Methods like `findById` and `list` let you retrieve stored signal information. 

The `clear` function is important to call if your working directory changes between backtesting iterations to ensure a fresh storage instance is used.

## Class StorageAdapter

The StorageAdapter is the central component for managing how your trading signals are saved and accessed, handling both historical (backtest) and real-time (live) data. It automatically keeps track of new signals as they are generated, ensuring everything is stored correctly.

To start using it, you enable the adapter which registers it to receive these signals.  You can then disable it when you no longer need it, and it’s safe to disable multiple times.

Need to find a specific signal? You can search by its unique ID.

It also provides ways to easily retrieve lists of all backtest signals or all live signals that have been recorded. This makes it easy to review your past performance or monitor current activity.

## Class StateLiveAdapter

The `StateLiveAdapter` provides a flexible way to manage trading state, allowing you to choose different storage methods depending on your needs. It's designed to be swapped out easily, using adapters like in-memory storage (`useLocal`), file-system persistence (`usePersist` – the default), or even a dummy adapter for testing (`useDummy`).  You can also use a custom adapter with `useStateAdapter`.

This adapter is built to handle situations where you want to automatically exit trades if they aren't performing as expected, like a strategy where trades need to show profit quickly, and an LLM is helping to evaluate trade performance. The adapter stores data like the peak percentage gain and how long a position has been open.  This persistent state is saved even if the program restarts.

The adapter efficiently manages state instances using memoization, associating them with a unique combination of signal ID and bucket name. You can manually clear these memoized instances when needed using `disposeSignal` or `clear`. 

The `getState` method retrieves the current state, while `setState` updates it.  It’s useful for tracking trade performance and enforcing your trading rules.

## Class StateBacktestAdapter

This component, the StateBacktestAdapter, is designed to manage and store the state of your backtesting experiments. It offers flexibility by allowing you to choose different storage methods – in-memory (fast but temporary), file-based (persistent), or even a dummy adapter that simply ignores any changes.

Think of it as a central hub for tracking crucial information during your backtests, like the peak percentage gains and how long a position has been open. This is particularly useful for things like automatically exiting trades that aren't behaving as expected, based on rules involving performance and duration.

It’s structured to be easily swapped out with different storage solutions, and provides shortcut methods to quickly switch between those options: `useLocal`, `usePersist`, and `useDummy`.  You can even plug in your own custom state management logic.

The `disposeSignal` method cleans up old data associated with specific signals, ensuring efficient memory usage. If you need to reset everything, there's a `clear` function to wipe the cache, useful when your working directory changes.  Retrieving and updating state happens through `getState` and `setState`, allowing you to read and modify the tracked values.

## Class StateAdapter

The StateAdapter is like the central control panel for managing your trading data, whether you're running a backtest or a live trading session. 

It keeps track of your data, automatically cleaning up old information when a trading signal is finished.

Think of the `enable` property as turning on the data tracking – it makes sure everything's running smoothly and only happens once. You can safely call `disable` multiple times to turn off the tracking.

You can use `getState` to read the current value of a trading signal’s data, and `setState` to update that data. The adapter handles the details of where that data is stored, whether it’s for a backtest or a live session.

## Class SizingValidationService

The SizingValidationService helps you keep track of and make sure your position sizing configurations are set up correctly. It acts like a central organizer for your sizing strategies, allowing you to register new ones and quickly check if they exist before you use them. To help things run smoothly, it remembers the results of past validations so it doesn't have to repeat checks unnecessarily. 

You can add sizing strategies using `addSizing`, and then use `validate` to confirm a sizing strategy is available for use. Finally, `list` lets you see a complete inventory of all the sizing strategies you’ve registered. It's designed to be reliable and efficient in managing your sizing setups.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of and manage sizing schemas, which define how much of an asset to trade. It uses a special system to ensure everything is typed correctly and consistently.

Think of it as a central place to store and retrieve these sizing rules.

You can add new sizing schemas using `register` or update existing ones using `override`.  To get a sizing schema you need, use the `get` method, providing the name you assigned when you registered it. 

Before a sizing schema is actually stored, it goes through a quick check (`validateShallow`) to make sure it has all the necessary parts and they are the right types. This helps prevent errors later on.

## Class SizingGlobalService

The SizingGlobalService is a central component that handles determining how much of an asset to trade. It's a global service, meaning it's accessible throughout the backtest-kit framework.

It works by using a `SizingConnectionService` to actually perform the position size calculations. Think of it as a manager coordinating the process.

Inside, there are also tools for logging, and for verifying that sizing requests are valid.

The main function, `calculate`, takes information about the trade (like risk tolerance) and calculates the appropriate position size.  It returns a number representing that size.



Essentially, it's a crucial part of ensuring trades are sized correctly within the backtesting environment.

## Class SizingConnectionService

This service helps manage how position sizes are calculated within your trading strategies. It acts as a central point, directing sizing operations to the correct implementation based on a name you provide.

Think of it as a smart router for sizing calculations. It remembers which sizing method you're using and caches it for faster performance.

You can specify a sizing method by name, and this service will handle finding and using the right sizing logic. It’s designed to calculate how much of an asset to trade, incorporating risk management principles. If your strategy doesn’t have specific sizing rules, you can leave the sizing name blank.

The service relies on other components like a logger and a sizing schema service to function properly.

Here's a breakdown of its main parts:

*   **`getSizing`:**  This is how you get the specific sizing implementation you need. It creates the implementation the first time you ask for it and then reuses it for efficiency.
*   **`calculate`:** This is the workhorse function – it takes your sizing parameters and calculates the position size using the method you've selected. It figures out which sizing method to use and performs the calculation.

## Class SessionLiveAdapter

This component provides a flexible way to manage and store data during live trading sessions. It acts as a bridge, allowing you to easily swap out how session data is handled – whether it's kept in memory, saved to disk, or simply discarded.

You can choose between a few different storage options: a default file-system based storage, a temporary in-memory storage, or even a dummy option for testing.  The system automatically manages these adapters, ensuring data is available for a specific trading symbol, strategy, exchange, and timeframe.

Think of it as a central hub for keeping track of what's happening during a live trade.  The system efficiently caches these session data instances, and includes a helpful `clear` method to refresh the cache if the base directory changes, like when running strategies multiple times.  You can also build your own custom data storage solution and plug it in using `useSessionAdapter`.

## Class SessionBacktestAdapter

This component provides a flexible way to manage session data during backtesting. It acts as a bridge, allowing you to easily switch between different ways of storing and retrieving session information. By default, it uses an in-memory storage, which is quick and easy for testing.

You can also opt to save your data to disk for persistence or use a dummy adapter to simply discard any data written.  The system remembers the adapter you choose based on the specific trading symbol, strategy name, exchange, and frame being used.

Here are a few helpful functions:

*   `useLocal()` sets it to the in-memory adapter.
*   `usePersist()` uses a file-based adapter.
*   `useDummy()` discards data writes.
*   `useSessionAdapter()` lets you bring in your own custom session data handling.
*   `clear()` is important to call if the working directory changes, ensuring fresh session instances are created.

The `getData` and `setData` methods let you read and update the session data for a particular point in time during the backtest.

## Class SessionAdapter

The SessionAdapter acts as a central hub for managing data during both simulated (backtesting) and live trading sessions. It intelligently directs data requests and updates to the appropriate storage mechanism – either a backtest-specific storage or a live data storage – depending on whether you're running a backtest or a live trade.

You can use `getData` to retrieve existing data for a particular symbol, providing details like the strategy name, exchange, frame, a backtest flag, and a timestamp. Similarly, `setData` allows you to update session values, again routing the update appropriately. These functions abstract away the complexity of knowing where the data is actually stored, simplifying your workflow.

## Class ScheduleUtils

This class provides helpful tools for understanding and reporting on your scheduled trading signals. Think of it as a central place to monitor how well your signals are being processed and delivered.

It helps you keep track of signals that are waiting to be executed, those that have been cancelled, and can even calculate metrics like the cancellation rate and average wait time.

You can request data about a specific symbol and strategy to get a snapshot of its signal history. The real power comes from its ability to generate easy-to-read markdown reports.

These reports summarize all the scheduled signal events for a given symbol and strategy, making it simple to diagnose issues or analyze performance. You can even save these reports directly to a file for later review. Essentially, this class helps you gain insights into the reliability and efficiency of your scheduled signal processing.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your signals are being handled over time. It listens for events related to signals—when they’re scheduled, when they're activated, and when they are cancelled—and carefully records them in a database. 

This service calculates how long it takes for a signal to move from being scheduled to actually being executed or cancelled. By logging these events, you can analyze and identify any delays in your trading process. 

You can tell it to start listening for signal events using the `subscribe` method, which also gives you a way to stop listening later. The `unsubscribe` method is the standard way to stop listening, ensuring you don't keep consuming resources unnecessarily. Because of how it’s designed, you won't accidentally subscribe multiple times.


## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals and generates reports about them. It listens for scheduled and canceled signals, keeping a record of each one for every strategy you're using.

This service then creates nicely formatted markdown tables that detail these events, including important statistics like cancellation rates and average wait times. These reports are automatically saved as files on your system, making it easy to review your trading activity.

You can also retrieve data and reports for specific symbols, strategies, exchanges, frames, and backtests. It’s designed to keep everything organized and provide insights into your automated trading process. Finally, you have the option to clear out the stored data when it’s no longer needed.

## Class RiskValidationService

This service helps keep track of your risk management setups and makes sure they're all valid before you use them. Think of it as a central manager for your risk profiles.

You can register new risk profiles using the `addRisk` method, essentially telling the service about a new type of risk you're managing and its associated rules.  

The `validate` method is your safety net—it checks if a particular risk profile exists before you try to work with it. To speed things up, it remembers the results of these validations, so it doesn’t have to re-check profiles unnecessarily.

Finally, if you need a complete overview, the `list` method lets you see all the risk profiles currently registered. 

The service also has a `loggerService` for logging and a private `_riskMap` to store the risk profiles.

## Class RiskUtils

This class helps you understand and share information about risk rejections in your trading system. It's like a central place to pull together all the data about when and why trades were rejected.

You can use it to get statistical summaries of rejections, showing you how many rejections occurred, and broken down by trading symbol and strategy.

It also lets you create readable reports – think nicely formatted tables – that show each individual rejection event, including the time, symbol, strategy, position, exchange, price, number of active positions, and the reason for the rejection. 

Finally, you can easily save these reports to files, helping you to share them with others or keep a record of your risk management performance.  The reports are named according to the trading symbol and strategy used.

## Class RiskSchemaService

This service helps you manage and organize your risk schemas, acting as a central place to store and retrieve them. It uses a special type-safe storage system to keep everything neat and well-defined.

You add new risk profiles using `addRisk()`, and find them again by name using `get()`.

Before a risk profile is fully registered, it's checked to make sure it has all the necessary information with `validateShallow()`.  If a risk profile already exists, you can update specific parts of it with `override()`. The service also has internal logging for tracking what's happening behind the scenes.

## Class RiskReportService

This service helps keep track of when trading signals are rejected by the risk management system. It acts like a logbook, recording details about each rejected signal, including why it was rejected and what the signal was.

The service listens for these rejection events and stores them in a database. It’s designed to prevent accidental duplicate subscriptions to the rejection events.

You can start the service by subscribing to the rejection events; this gives you access to the data as it happens. To stop the service, you'll use an unsubscribe function that's provided when you subscribe. If the service isn't subscribed, the unsubscribe function simply does nothing.

The service also uses a logger to provide debug output, and has a built-in system to handle and record risk rejection events.

## Class RiskMarkdownService

The RiskMarkdownService helps you create and store reports detailing risk rejections, which are instances where trading actions are blocked due to risk management rules. It keeps track of these rejections for each symbol, strategy, exchange, frame, and backtest combination.

The service listens for risk rejection events and gathers them, then automatically generates formatted markdown reports that you can save to disk. These reports include detailed information about each rejection and provide summary statistics, like the total number of rejections, broken down by symbol and strategy.

You can subscribe to receive these rejection events, and the service ensures you won’t be subscribed multiple times.  You can also programmatically retrieve the stored data or clear the data if needed.  The reports are saved to a specific directory structure, making it easy to organize and find them. Each symbol and strategy pairing gets its own isolated storage to keep everything neatly separated.

## Class RiskGlobalService

RiskGlobalService is a central service for managing risk within the trading framework. It’s responsible for validating risk configurations and ensuring trades adhere to predefined limits. It works closely with other services like RiskConnectionService to perform these checks.

Several key properties help manage and validate risk: a logger for tracking activity, services for risk and exchange validation, and a memoized validation function to optimize performance.

The `checkSignal` function is used to determine if a trading signal can proceed based on risk constraints. `checkSignalAndReserve` provides a safer, concurrent way to check signals and temporarily lock resources – crucial for preventing issues when multiple trading strategies are running simultaneously.

When a signal is approved, `addSignal` registers it with the system. Conversely, `removeSignal` cleans up after a trade is closed.  Finally, `clear` provides a way to reset the entire risk data set or selectively clear data for specific risk configurations.

## Class RiskConnectionService

This service acts as a central hub for handling risk-related operations within the trading framework. It intelligently routes requests to the correct risk management component based on a provided identifier, ensuring that each trading strategy or scenario utilizes the appropriate risk controls. To speed things up, it remembers previously used risk management components, avoiding redundant setup.

Here's a breakdown of what it does:

*   **Risk Routing:** It directs risk checks to specific risk implementations based on a name.
*   **Caching:** It stores those risk management components for faster access later on.
*   **Signal Validation:** It makes sure trading signals adhere to predefined risk limits, including portfolio drawdown and exposure.
*   **Concurrency Safety:** It provides a special method to validate signals and reserve space for them in a safe, thread-friendly way, crucial for preventing conflicts when multiple signals are processed simultaneously.
*   **Signal Management:** It keeps track of opened and closed signals within the risk management system.
*   **Cache Clearing:** It provides a way to manually clear the cached risk management components.

Essentially, this service simplifies the process of applying and managing risk controls within the backtesting framework, promoting consistency and efficiency. It relies on other services for logging, risk schema handling, time management, and action execution, all working together to maintain a robust risk management system.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage and store your trading data, like backtest results or live trading events, in a flexible and organized way. It acts as a bridge between your trading logic and where your data is ultimately saved.

You can easily swap out different ways to store your data—like switching from one file format to another—without changing your core trading code. The adapter handles the details of writing the data.

It intelligently keeps only one storage instance for each type of report (e.g., backtest results, live trading data), which helps with efficiency. Storage is automatically created the first time you write data for a given report type.

If you want to change how your reports are stored, you can set a different storage adapter. To test without actually writing data, there's even a dummy adapter that just throws everything away. If you need to revert, you can use the default JSONL adapter.  If you change your working directory, you’ll need to clear the cache.

## Class ReportUtils

ReportUtils helps manage how different parts of the system, like backtesting, live trading, or performance analysis, send data for reporting.

It lets you turn on or off logging for specific services, like only logging backtest events or just live trading events.

When you enable logging, the system starts capturing events and writing them to JSONL files as they happen, including useful information for later analysis.  Make sure to always clean up those listeners when you’re done to avoid memory problems!

Conversely, you can disable logging for some services while keeping it on for others, allowing you to control the amount of data being generated. Disabling stops the logging immediately without needing a separate cleanup step.

This class is designed to be extended, usually by ReportAdapter, to add even more reporting capabilities.

## Class ReportBase

The `ReportBase` adapter is designed for efficiently logging events to JSONL files, providing a simple way to track and analyze trading activity. It creates a single JSONL file for each report type, ensuring a clean and organized data storage.

It writes data in a stream format and handles potential backlogs to prevent slowdowns. There's a built-in safeguard that ensures writes don't take longer than 15 seconds, preventing stalls.

The adapter automatically creates necessary directories and offers error handling by emitting to an exit emitter.  You can easily search through the data by filtering on metadata like the trading symbol, strategy name, exchange, timeframe, signal ID, or walker name.

The adapter's constructor takes a report name and a base directory for file storage. It manages the file path and a write stream internally, initializing them with a one-time setup process. You can explicitly trigger this initialization with the `waitForInit` method. The `write` method is used to append event data, including metadata and a timestamp, to the JSONL file.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a structured way, like reports and event logs. Think of it as a flexible system for saving your trading information.

It's designed to be adaptable, allowing you to easily swap out different storage methods.  It remembers which storage method to use for each type of report, so you don't have to set it up repeatedly. By default, it stores data in JSONL files, appending new events as they happen.

You can change the underlying storage mechanism whenever you need to, and it only starts writing data when you first need it, which is helpful for efficiency.  If your working directory changes, like when you restart a trading strategy, you should clear the cache to ensure fresh storage.

It also has a 'dummy' mode where it pretends to save data but actually throws it away, which is great for testing. Finally, you can easily switch back to the standard JSONL storage if you need it.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a way to monitor key performance metrics for your trading positions – like profit and loss (PNL), highest profit levels, and maximum drawdown – in real-time. It simplifies access to these metrics, consolidating them from the core trading system and performing important validations to ensure data accuracy.  The class is designed to work whether you're running a live trading strategy or backtesting its performance.  It's a single, readily available instance you can use throughout your code.

Here's a breakdown of what you can retrieve:

*   **PNL Information:** Get unrealized PNL in percentage and dollar amounts for the current open position.
*   **Performance Peaks:** Find the highest price achieved and the time it was reached, along with the PNL percentage and dollar value at that peak.
*   **Time-Based Metrics:** Determine how long a position has been active, how long a signal has been waiting, and how long it's been since the highest profit or deepest drawdown.
*   **Drawdown Analysis:**  Identify the lowest price reached and the associated timestamp and PNL values.  Also get the distances between current price and peak profit or trough.
*   **Breakeven Analysis**: Determine if breakeven point was achievable at the highest profit.

All these metrics can be accessed for both live and backtesting environments. A `null` value is returned when the corresponding signal doesn't exist.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, offering flexibility in how those signals are stored. It uses a pattern that allows you to easily switch between different storage methods – you can choose to store signals persistently on disk or keep them only in memory.

It's designed to be adaptable; you can specify which storage method you prefer, and it will remember that choice until you change it.

The adapter automatically creates and caches a storage utility instance the first time you need it, and it clears that cache when you need to refresh it, ensuring you're using the correct configuration.

You can get the latest signal for a specific trading context, calculate how long ago a signal was created, and even change the storage backend used. The `clear()` function is particularly useful when you're running multiple strategies that might require different configurations.

## Class RecentBacktestAdapter

This component manages how recent trading signals are stored and accessed. It’s designed to be flexible, letting you choose between keeping signals in memory or saving them to disk.

Think of it as a central hub that connects your backtesting process to a specific storage mechanism. By default, signals are kept in memory for speed, but you can easily switch to persistent storage if you need to save your data.

You can change which storage method is used to ensure compatibility with different environments or to facilitate data persistence. The system caches the storage utility to avoid redundant operations but provides a `clear` method to ensure a fresh instance when needed, for example, when switching working directories during backtest iterations.

The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods simply pass requests to the currently selected storage adapter.

## Class RecentAdapter

This component, the RecentAdapter, handles storing and retrieving recent trading signals, whether you're testing a strategy historically (backtest) or running it live. It automatically keeps the signal storage updated and provides a simple way to get the most recent signal for a specific trading symbol and situation. To prevent accidental duplicate subscriptions, it uses a system that only subscribes once.

You can control the adapter's activity with `enable` and `disable` functions. The `enable` function starts the automatic updates; the `disable` function stops them and it’s safe to call this repeatedly.

Need the latest signal?  `getLatestSignal` helps you find it, checking both your historical data and live data to make sure you have the most current information. It also prevents looking into the future by only returning signals that occurred *before* a specified time.  Want to know how long ago the latest signal was generated? `getMinutesSinceLatestSignalCreated` calculates the number of minutes passed since then, again ensuring you’re not looking at future signals.

## Class PriceMetaService

The PriceMetaService helps you reliably get the latest market price for a specific trading setup, even when you're not directly in the middle of a trade execution. It keeps track of prices for each combination of symbol, strategy, exchange, and frame, updating them with each tick.

Think of it as a memory of the most recent price data, always ready when you need it. It’s particularly useful for actions you take *between* regular trade executions, like responding to external events.

If a price hasn't been received yet, it'll wait briefly – up to a set timeout – to make sure it gets a value.  It's designed to be efficient, avoiding unnecessary waiting and managing cached data effectively.

You can clear the price data entirely, or just for specific trading scenarios. This is important to do at the beginning of a new trading run to ensure you’re not working with outdated information.  It's automatically updated by the system after each strategy tick.

## Class PositionSizeUtils

This class offers a collection of tools to help determine the right size for your trades. It focuses on calculating position sizes using different strategies, ensuring each method is used correctly. 

You'll find methods for:

*   **Fixed Percentage:** This calculates a position size based on a predetermined percentage of your account balance.
*   **Kelly Criterion:** This more complex method calculates position size based on win rate and win/loss ratio, aiming for optimal growth.
*   **ATR-based:** This method uses the Average True Range (ATR) to determine size based on volatility.

Each of these methods takes into account important factors like account balance, entry price, and stop-loss level, along with information about how the sizing method is being used. The class validates your inputs to make sure the sizing method you're using is appropriate for the calculation.

## Class Position

The Position class helps you figure out where to set your take profit and stop loss prices when you're trading. It’s designed to automatically adjust these levels based on whether you're going long (buying) or short (selling).

There are two main functions available:

*   **moonbag:** This method calculates take profit and stop loss levels using a simple "moonbag" strategy where your take profit is set to a fixed percentage above the current price.

*   **bracket:**  This function allows for more customization, letting you define your own percentages for both the take profit and stop loss. It calculates these prices for you based on your current position and price.


## Class PersistStrategyUtils

This class helps manage how your trading strategy's state is saved and loaded, especially when dealing with things like pending orders or actions that haven't been fully processed yet. It automatically handles creating and managing these storage instances based on the symbol, strategy, and exchange you're using.

Think of it as a central hub that makes sure your strategy's important information isn't lost, even if there are interruptions or crashes.

You can customize how this storage works, using different "adapters" to choose how the data is saved (like to a file, or not at all). The class keeps track of these adapters and automatically loads the right one for each strategy.

To keep things running smoothly, you can clear the storage cache if your working directory changes. It also provides convenience methods to switch back to the default file-based storage or a dummy storage that does nothing. This is helpful for testing or when you don't need to actually persist data.


## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. It's designed to be reliable, even if your program crashes unexpectedly. 

It stores your strategy's data using a specific filename related to the symbol, strategy name, and exchange. This keeps things organized and prevents conflicts.

The class handles writing the data in a safe way to avoid corrupted files. It gives you methods to read the saved strategy data and to save new data, effectively allowing you to resume your backtesting or trading from where you left off. 

You can think of it as a persistent memory for your strategy, ensuring its state is preserved between sessions. It uses a fixed key (`STORAGE_KEY`) for storing the strategy's snapshot.


## Class PersistStorageUtils

This class provides tools for safely saving and loading signal data, especially when running backtests or live trading. It manages storage instances, making sure each mode (like backtest or live) has its own dedicated storage.

The class utilizes a system of memoization, which means it only creates storage instances when needed and reuses them, improving efficiency. You can customize how data is stored by providing your own storage constructors.

It handles saving and reading all signals in a way that minimizes the risk of data loss, even if something unexpected happens during the process – each signal is stored as a separate file. 

If you’re using custom storage solutions, you can easily register them and switch between different storage methods like a standard file-based system, a JSON-based system, or a dummy instance for testing. It also provides a way to clear the stored storage instances, crucial when the working directory changes.


## Class PersistStorageInstance

This class provides a way to store and retrieve signal data persistently, primarily by saving each signal as its own file. It's designed to be the default method for keeping your data safe, even if things go wrong unexpectedly.

The `backtest` property indicates whether this is being used in a backtesting environment. 

Internally, it uses a file system to manage these individual signal files.

The `waitForInit` method ensures the storage is ready before you try to use it, setting up the underlying file system.

`readStorageData` retrieves all the stored signals, reading each one from its corresponding file.

`writeStorageData` saves a batch of signals, ensuring each is written as a distinct file identified by its unique ID. This approach helps ensure data integrity and resilience in case of interruptions.

## Class PersistStateUtils

This class helps manage how state is saved and loaded, ensuring it's reliable even if the application crashes. It keeps track of different storage instances, using a special memoization technique to optimize performance and reduce redundant operations.

You can customize how state is persisted by providing your own storage adapters. This allows you to use different methods like files, databases, or even simulate storage for testing purposes (using the 'useDummy' function).

The `waitForInit` method sets up the initial state storage, while `readStateData` retrieves existing state and `writeStateData` saves new or modified state. `useJson` switches back to the default file-based storage, and `useDummy` allows for testing without actual persistence.

The `clear` method is important to call if your working directory changes to avoid issues. Finally, `dispose` cleans up resources associated with specific signals when they are no longer needed. You can even register custom storage constructors using `usePersistStateAdapter` to tailor persistence to your needs.

## Class PersistStateInstance

This class, `PersistStateInstance`, helps manage and save trading state information to files. It's designed to work with a specific signal and bucket name to identify where to store that data. 

Think of it as a wrapper around a file-based storage system that ensures changes are written reliably. 

Here's a breakdown of what it does:

*   It initializes the storage needed to hold the data.
*   It allows you to read existing saved state data based on the bucket name.
*   It handles writing new or updated state data back to the file system.
*   The `dispose` function doesn't do anything on its own; instead, it relies on a separate utility to handle cleanup tasks.

## Class PersistSignalUtils

This class helps manage how your trading signals are saved and loaded, ensuring their state is reliably persisted. It acts like a helper, keeping track of signal data for each strategy and exchange combination. 

Think of it as a central place where your signals are stored, and it’s designed to work well even if things go wrong—like if the program crashes.

You can customize how these signals are stored using different constructors, like using files, a dummy storage for testing, or bringing your own custom storage solution. The `readSignalData` function retrieves a saved signal, creating it if it doesn't exist, while `writeSignalData` saves a signal or removes it.

If you need to change the way signals are stored or want to start fresh, you can clear the storage or switch between different storage options. This is especially useful if your program's working directory changes.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, provides a way to reliably save and retrieve signal data to a file. It's designed to work with the backtest-kit trading framework. Think of it as a system for keeping track of your trading signals so they aren't lost even if something unexpected happens.

It essentially wraps another component, `PersistBase`, to ensure your data is written safely. Each signal is identified by a unique combination of the trading symbol, the name of your strategy, and the exchange it’s associated with.

Here's what it does:

*   It lets you initialize its internal storage.
*   It reads saved signal data, identifying it by the trading symbol.
*   It allows you to write new signal data, or clear out existing data, again using the trading symbol to pinpoint exactly which signal to update.
*   It’s designed to be resilient to crashes by using atomic writes, making sure your data is always in a consistent state.

## Class PersistSessionUtils

The `PersistSessionUtils` class helps manage how your trading sessions are saved and loaded, ensuring a more stable and reliable backtesting process. It's designed to keep track of session data like settings and state, preventing data loss in case of interruptions.

It cleverly uses a memoization system to efficiently handle storage for different strategies, exchanges, and frames, creating a dedicated storage space for each. This system uses a specific file structure: `dump/session/<strategyName>/<exchangeName>/<frameName>.json`.

You can customize how sessions are persisted—choosing between file-based storage, a dummy (no-op) mode for testing, or providing your own persistence adapter.

The class provides a way to ensure proper initialization, read existing data, and save updated data.  It also has methods to clear cached data when needed, or to clean up individual session storage. This is particularly useful when you're running multiple strategies and the program’s working directory changes. The `usePersistSessionAdapter` method allows you to inject a custom implementation for session persistence.

## Class PersistSessionInstance

This class helps you save and load the state of your trading sessions, especially useful when backtesting or dealing with interruptions. It's designed to be a simple, file-based way to persist information related to a specific trading strategy, exchange, frame (time period), and symbol.

Think of it as a container for your session data, automatically giving each session a unique identifier based on the strategy, exchange, frame, and symbol being used.  Because of this unique identifier, it ensures different trading setups don't overwrite each other's data.

The `waitForInit` method sets up the underlying storage, while `readSessionData` retrieves the saved data and `writeSessionData` saves the current state.  Importantly, `dispose` doesn't do anything itself – it relies on a separate utility function to handle cleaning up cached data. It's a way to keep your trading sessions persistent and recoverable.


## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and retrieved, ensuring they are reliable even if there are interruptions. It creates a separate storage system for each trading strategy, allowing for custom ways of persisting the data. The system is designed to be safe, so if something unexpected happens, your scheduled signals won't be lost.

It automatically creates these storage instances as needed.

Here's a breakdown of what it offers:

*   **Custom Storage:** You can provide your own way of saving scheduled signals by using a custom constructor.
*   **Lazy Loading:** The storage system only loads when it’s actually needed.
*   **Reading and Writing:** Functions to retrieve existing signal data or save new ones.
*   **Easy Switching:** Quickly switch between different storage methods, like using a file-based system or a dummy system for testing.
*   **Cache Clearing:** There’s a way to refresh the storage system if your environment changes.

It is used by ClientStrategy to maintain the scheduled signal data.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, helps you reliably save and load information about scheduled trading signals. It's designed to work with file-based storage, ensuring data isn't lost even if things go wrong.

Think of it as a dedicated place to store details for a specific trading strategy, exchange, and instrument. It uses the symbol (like "AAPL") as a unique identifier for your data.

The class handles the technical details of writing data to a file safely, including making sure the process happens completely or not at all to prevent corruption. 

Here's a quick rundown of what you can do with it:

*   **Initialization:**  You can make sure the storage is ready to go using `waitForInit`.
*   **Loading Data:** `readScheduleData` lets you retrieve the saved signal information for a particular symbol. If nothing is saved, it returns null.
*   **Saving Data:** `writeScheduleData` lets you save your signal data. Setting the data to null will effectively clear the saved information. 

Essentially, this class gives you a simple and reliable way to persist scheduled trading signals for your backtesting or live trading scenarios.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and loaded, particularly for risk management. It's designed to efficiently handle persistent data related to active positions, making sure things are reliable even if there are unexpected issues.

It uses a clever system to ensure only one specific storage method is used for each risk profile. You can even customize how positions are stored by providing your own storage methods.

Here's a breakdown of what you can do:

*   **Custom Storage:** You can specify the type of storage system used for managing active positions.
*   **Lazy Loading:** The storage is only created when it's first needed, which helps with performance.
*   **Clear Cache:**  You can clear the storage cache when the working directory changes, ensuring fresh data is used.
*   **Testing:** A dummy storage option is available for testing where no data is actually saved.
*   **Switch Storage:** Easily switch between different storage methods like a default file-based approach or a dummy one for testing. 

Essentially, this class simplifies the process of saving and retrieving position information, making it more robust and adaptable to different scenarios.

## Class PersistRiskInstance

This class provides a way to reliably save and load position data, acting as a persistent layer for your trading strategies. It essentially handles the behind-the-scenes work of writing data to a file, ensuring that the data is saved correctly even if there are unexpected interruptions.

It's designed to wrap other storage mechanisms and focuses specifically on managing data related to positions, always using a designated identifier ("positions") to organize the information.

The `waitForInit` method sets up the initial storage. `readPositionData` retrieves saved data, while `writePositionData` saves new or updated data. Think of `readPositionData` as retrieving data you previously saved, and `writePositionData` as saving the current state of your positions.

## Class PersistRecentUtils

This class provides a way to reliably store and retrieve the most recent signal data, ensuring your backtesting and live trading systems have a consistent record. It's designed to be used by tools that handle recent signals, like backtest and live utilities.

The class manages storage instances separately for each unique combination of symbol, strategy, exchange, and timeframe, using a clever memoization technique to avoid creating unnecessary storage. You can customize how this storage happens by providing your own storage constructor.

If something goes wrong, like a crash, the data is safe. 

Here's a quick rundown of what you can do:

*   **Change the storage method:**  You can swap out how recent signals are stored, for example, to use a file, a database, or even a dummy implementation that does nothing.
*   **Clear the data:**  You can wipe out all the stored recent signal data if, for instance, your working directory changes.
*   **Read the latest signal:**  It easily fetches the last signal for a specific trading context.
*   **Save the latest signal:** It saves the latest signal for a specific trading context.



The key is that this class takes care of the low-level details of storing and retrieving that recent signal data, so you don't have to worry about it.

## Class PersistRecentInstance

This class helps you save and load the most recent trading signal data for a specific asset, strategy, and environment. Think of it as a way to remember what happened last during your backtesting or live trading. 

It creates a unique storage location based on the asset you're tracking (like "AAPL"), the name of your trading strategy, the exchange used, the timeframe (e.g., 1 minute, 1 hour), and whether you're in backtest or live mode. This helps keep data organized if you have multiple strategies running.

Here's a breakdown of what it does:

*   **Keeps track of the recent signal:** It's designed to store and retrieve just the *most recent* signal, not a whole history.
*   **Handles file storage:** The data is saved to a file, so it persists even if your program restarts.
*   **Ensures reliable saving:** It uses techniques to make sure the saving process is safe and complete, even if things go wrong.
*   **Provides initialization:**  You can tell it whether to initialize the storage. 
*   **Loads and saves signals:** It has methods to read the last saved signal and to write a new signal with a timestamp.

Essentially, it simplifies the process of keeping a record of your most recent trades for analysis or debugging.

## Class PersistPartialUtils

This class helps manage how trading strategies remember their progress, specifically focusing on partial profits and losses. It avoids re-creating these memory snapshots unnecessarily, saving resources. 

Think of it as a smart system for keeping track of where a trade stands - like how much profit or loss has been realized - and safely storing that information.

It’s designed to work with different storage methods, letting you choose how that data is saved, whether to a file or even a dummy instance for testing.

Here's a breakdown of its key features:

*   **Smart Storage:** It keeps track of storage instances for each trading symbol and strategy name, preventing unnecessary creations.
*   **Flexible Adapters:** You can customize how data is stored using different adapters.
*   **Safe Data Handling:** It ensures changes to the profit/loss levels happen reliably, even if things go wrong.
*   **Easy Switching:** You can easily switch between different storage options, like using files or a dummy instance for testing.
*   **Cache Management:** It has a way to clear its internal memory, important if your strategy's working directory changes.



Essentially, this class handles the behind-the-scenes work of persisting partial trading data, so you don’t have to.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and load parts of your trading strategy's state to a file, ensuring safety even if things go wrong. It’s designed to work with a specific trading symbol, strategy name, and exchange. 

Essentially, it’s a reliable way to keep track of what your strategy was doing at specific moments, acting like a backup or checkpointing system.

It stores data based on a unique identifier (signalId) for each piece of information, keeping things organized within a defined context. The `waitForInit` method ensures the storage is ready before you start saving anything, and the `readPartialData` and `writePartialData` methods handle the actual reading and writing of this data. The `_storage` property manages the underlying file system interactions. It uses atomic writes to prevent data loss in case of unexpected interruptions.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and loaded. It's a central piece used by other parts of the framework for both backtesting and live trading.

It cleverly caches notification storage instances, meaning it only creates one for each "mode" (like backtest or live) to keep things efficient. You can even swap out how notifications are stored – for example, using a custom adapter, relying on JSON files, or even using a dummy instance that does nothing at all for testing purposes.

The class handles reading and writing notification data, and makes sure these operations are done safely and reliably. Each notification is saved individually, linked to its unique ID, and the system is designed to protect against crashes and data loss. You can even clear the cached storage if the working directory changes, ensuring a fresh start.

## Class PersistNotificationInstance

This component handles persisting notification data, primarily for scenarios requiring reliable storage even in unexpected situations. It’s designed as a file-based solution, meaning notifications are saved as individual JSON files.

The `backtest` property indicates whether this is running in a backtesting environment, influencing how the system operates.

Initialization happens through `waitForInit`, ensuring the underlying storage is ready.

`readNotificationData` retrieves all saved notifications by systematically examining the storage keys – essentially reading them all.

When you need to save notifications, `writeNotificationData` takes care of writing each one individually, referencing them by their unique identifier. This design offers a degree of safety by making sure writes are completed reliably.

## Class PersistMemoryUtils

This class provides a way to persistently store and retrieve data related to your trading strategies. It's designed to be reliable, even if your application crashes.

It manages storage locations based on a combination of signal identifiers and bucket names, storing data as JSON files within a specific directory structure.

You can customize how memory instances are created, allowing for different storage implementations or testing scenarios. The `waitForInit` function helps manage the initial setup, preventing redundant initialization.

The class offers functions to read, write, and delete memory data, along with a handy `hasMemoryData` check to see if an entry exists. It also provides a `clear` function to flush the cache, useful when your working directory changes.  Finally, a `dispose` method cleans up storage when a signal is removed.

For index rebuilding or other maintenance tasks, you can iterate over all existing memory entries.  It offers pre-built options to switch between a standard file-based storage, or a dummy implementation for testing.

## Class PersistMemoryInstance

This class, `PersistMemoryInstance`, provides a way to store and retrieve memory data using files. Think of it as a persistent memory cache that lives on your disk. It's designed to be the standard way to manage this kind of data within the backtest-kit framework.

It uses a file-based system to keep things organized, and it allows you to "soft delete" entries – that is, mark them as removed without actually deleting them from the disk. This helps maintain data integrity.

Here’s a breakdown of what it does:

*   **Initialization:** The `waitForInit` method ensures the storage is ready to use.
*   **Reading & Existence:** You can read a specific memory entry using its ID with `readMemoryData`, or check if an entry exists with `hasMemoryData`.
*   **Writing & Deletion:**  New data is written using `writeMemoryData`, and entries are removed (soft deleted) with `removeMemoryData`.
*   **Listing:** `listMemoryData` provides a way to retrieve all available memory data, excluding any that have been marked for deletion.
*   **Cleanup:**  The `dispose` method does nothing directly because the underlying memo cache is managed elsewhere.

Essentially, it's a robust system for handling persistent memory data, simplifying how you manage and access your backtest information.

## Class PersistMeasureUtils

This class helps manage cached data from external APIs, making sure that data is reliably stored and retrieved. It uses a system where each cache is organized into "buckets," identified by a timestamp and symbol. 

You can customize how these caches are stored using different adapters, and the framework intelligently creates these adapters for each bucket as needed. The class also handles situations where data needs to be deleted (marked as removed, rather than physically deleted).

To make things flexible, you can switch between different storage methods like using a file-based cache, a dummy cache for testing, or providing your own custom adapter. The cache automatically cleans itself up if you move the project directory during testing.

Here are some key functions:

*   `readMeasureData`: Gets data from a specific cache bucket.
*   `writeMeasureData`: Stores data in a specific cache bucket.
*   `removeMeasureData`:  Marks data as deleted within a cache bucket.
*   `listMeasureData`: Allows you to see what data is currently stored in a cache bucket.
*   `clear`: Clears the cache, ensuring a fresh start.
*   `usePersistMeasureAdapter`: Allows you to use a different way of persisting data.
*   `useJson`: Uses the standard file-based approach.
*   `useDummy`: Uses a dummy adapter that does nothing (useful for testing).

## Class PersistMeasureInstance

This class provides a way to save and retrieve measure data to files, making sure the process is reliable and organized. It essentially handles the behind-the-scenes details of storing your data.

The data is stored within a named "bucket," acting like a folder for related measures. 

It manages the underlying file storage and offers features like soft-deleting entries – meaning they aren’t physically removed but marked as inactive, keeping your history intact. You can also filter the list of available data to exclude these inactive entries.

Here's a breakdown of what it does:

*   **Initialization:**  It can be initialized with a flag to ensure the storage is ready.
*   **Reading:** Retrieves a specific measure entry based on a key. If the data doesn’t exist or is marked as deleted, it returns nothing.
*   **Writing:**  Saves a measure entry with a unique key.
*   **Removing:**  "Soft-deletes" an entry by setting a flag; the file isn't erased.
*   **Listing:** Provides a way to iterate through all the valid (non-deleted) measure data keys.

## Class PersistLogUtils

This class provides tools for safely handling and storing log data. It manages a single, shared instance of the log storage, making sure it's created efficiently and only when needed.

You can swap out the default log storage mechanism with your own custom solution, which is useful for testing or for specific storage requirements. The system remembers the chosen storage, so it doesn't need to be re-specified every time.

Each log entry is saved as a separate file, and the process is designed to be resilient to crashes, helping protect your log data. If you need to reset the log storage, there’s a clear function to discard the current instance. You can also easily switch back to using the default file-based system or a dummy version that doesn't actually save anything.

## Class PersistLogInstance

This class helps you save and load trading logs to files, acting as a reliable record-keeper for your backtesting. It stores each log entry as a distinct JSON file, creating a detailed history of your trades. Think of it as an append-only journal – new entries are added, but existing ones are never changed or deleted.

The `waitForInit` method makes sure the storage is ready before you start working with it.  The `readLogData` function retrieves all the log entries that have been saved, pulling them back into your system.  And the `writeLogData` function is how you actually save new log entries, ensuring each new entry gets its own place in the file system. This design is built to be safe, even if something unexpected happens during the saving process.


## Class PersistIntervalUtils

This component handles keeping track of when specific intervals have already fired, helping to avoid redundant actions. It stores this information in files located within a `./dump/data/interval/` directory. Think of it as a record-keeper for when certain actions have been taken at specific times.

The system uses a constructor to create these records, and this can be customized if needed.  It also intelligently manages how these records are created, ensuring efficiency.

You can read existing records, write new ones, or even remove old ones (though removal is more of a soft delete). The system only sets up the record-keeping for a specific time window when it's needed, making it efficient.

There are different ways to configure how this record-keeping is done: you can use a default file-based method, a dummy method that does nothing, or provide your own custom record-keeping constructor. Clearing the system's memory of past intervals is also possible, useful when things change between different runs. Lastly, you can loop through all the existing records for a particular time window.

## Class PersistIntervalInstance

This class provides a way to store and manage interval data persistently, like keeping track of when certain actions should happen again. It uses files to store this data, making sure it sticks around even if your program restarts. 

The `bucket` property defines where this data is stored. The underlying file storage is handled by `_storage`.

To start, `waitForInit` prepares the storage for use. 

`readIntervalData` lets you retrieve a specific interval marker, returning nothing if it's not found or has been marked for deletion. `writeIntervalData` creates or updates an interval marker. When you no longer need a marker, `removeIntervalData` doesn't erase it; instead, it marks it as "removed" so it can be recreated later.

Finally, `listIntervalData` gives you a list of all the markers that are currently active and haven’t been marked for deletion, allowing you to see which intervals are still running.

## Class PersistCandleUtils

This class helps manage how candle data (like price history) is stored and retrieved for backtesting. It keeps each candle as a separate file, organized by exchange, symbol, time interval, and timestamp. 

The system checks if the cached data is still valid based on the expected number of files. It also handles situations where the data is incomplete, ensuring it refreshes when needed. This feature is critical for speeding up backtests by avoiding redundant data requests.

You can customize how the data is stored using different constructors, effectively letting you swap in alternative persistence methods.  The `usePersistCandleAdapter` function lets you plug in your own custom data storage, and the `clear` method is used to reset the data when the program's working directory changes.  The `useJson` method reverts to the standard file-based storage, while `useDummy` is useful for testing scenarios where you don't want any actual data saved.



The `readCandlesData` function retrieves cached candles within a specific time range, and `writeCandlesData` saves new candles to the cache. Both functions initialize the storage if it doesn't already exist.

## Class PersistCandleInstance

This component handles persistently storing and retrieving candle data, acting as a bridge between your trading logic and the file system. It's designed to keep candle data safe even if your application restarts.

Each candle is saved as its own individual JSON file, making it easy to track and manage individual data points. If a candle is missing when you try to retrieve it, it signals that you need to fetch the data again.

When saving data, it makes sure candles are complete (meaning their close time has passed) and avoids overwriting existing files. Any candles found to be corrupted during retrieval will trigger warnings and are treated as if they don’t exist, prompting a refresh from the original data source.

It initializes its file-based storage to ensure everything is ready. 

You can retrieve multiple candles at once by specifying a number and a starting timestamp. The `writeCandlesData` method allows you to save batches of candles ensuring data consistency. 


## Class PersistBreakevenUtils

This class helps manage and save breakeven data, which is important for keeping track of your trading progress. It's designed to make sure this data is reliably stored, even if things get interrupted.

It remembers the breakeven state for each symbol and trading strategy combination, saving this data to files. Think of it like a central place to store and retrieve this information.

You can customize how the data is stored, choosing between file-based storage or even a "dummy" mode where nothing is actually saved – useful for testing!  The class handles all the details of saving and loading, so you don't have to worry about the technical bits. 

If your working directory changes, you need to clear the cache to ensure fresh data is loaded. This helps prevent unexpected behavior.

It's designed so that it only loads data when it's needed, which is efficient.

## Class PersistBreakevenInstance

This class handles saving and retrieving breakeven data for your trading strategies, acting as a persistent layer. It's designed to be reliable, even if your application crashes unexpectedly.

It stores data based on a unique identifier for each trading signal. Think of it as keeping track of where a trade's breakeven point is, and making sure that information isn't lost.

Here’s a breakdown:

*   It automatically manages writing data to files in a safe way.
*   It uses the signal identifier to organize the data.
*   You provide the symbol, strategy name, and exchange name when creating an instance.
*   `waitForInit` prepares the storage area for data.
*   `readBreakevenData` fetches the breakeven data associated with a specific signal.
*   `writeBreakevenData` saves new or updated breakeven data for a given signal.


## Class PersistBase

`PersistBase` provides a way to save and load data to files on your computer reliably. It’s designed to handle situations where files might get corrupted or need to be cleaned up, and it ensures that your writes to files happen safely, even if something interrupts the process. 

It allows you to specify a name for the type of data you're storing and a main folder where these files will be located.  You can then use methods like `readValue` to retrieve data, `hasValue` to check if data exists, and `writeValue` to save it.  It also provides a generator called `keys` that lists all the data you’ve stored. The system also automatically takes care of setting up the storage directory and checking for any damaged files, streamlining your data management.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It essentially monitors the timing of various steps and records them in a database. 

Think of it as a performance detective, identifying potential bottlenecks in your code.

Here's how it works:

It listens for "performance events" emitted during the execution of your strategy.
These events contain timing information and details about what was happening.
The service then logs this data, making it possible to analyze where your strategy might be slow or inefficient.

You can subscribe to this service to start receiving these events, and you'll get a function to unsubscribe when you no longer need it. It makes sure only one subscription is active at a time. 
If you need to stop tracking performance, use the unsubscribe function.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you understand how your trading strategies are performing. It collects data on performance events, organizes them by strategy, and then calculates things like average results, minimums, maximums, and percentiles.

It can generate detailed reports, written in Markdown format, that highlight potential bottlenecks or areas for improvement. These reports are saved to your disk, making them easy to review and share.

To use it, you need to subscribe to the performance emitter to start receiving data. You can later unsubscribe when you no longer need these updates. 

You can retrieve performance statistics for specific strategies and symbols, or request a complete report. The service also provides a way to clear all stored performance data. A key component is its storage system, which keeps data isolated for each specific combination of symbol, strategy, exchange, frame, and backtest type.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to analyze and report on performance metrics.

You can use `getData` to get a detailed breakdown of performance statistics for a specific strategy and symbol, including things like average execution times, volatility, and outlier detection. This gives you a numerical view of performance across different operations.

`getReport` creates a readable markdown report summarizing the performance analysis. The report visually shows how time is spent in different operations and highlights potential bottlenecks.

Finally, `dump` lets you save these reports directly to your hard drive, organizing them by strategy name for easy access. You can specify a custom file path for the report.


## Class PartialUtils

This class helps you analyze and report on partial profit and loss data collected during trading. It acts as a central point for accessing and organizing information about small gains and losses that occur as your strategies are running.

You can use it to retrieve summary statistics, like the total number of profit and loss events, providing a quick overview of performance.

It also allows you to create detailed markdown reports, which are essentially tables showing individual profit and loss events, including when they happened, what symbol was involved, which strategy was used, and more.  These reports can be customized to display specific columns of data.

Finally, the class provides a simple way to save these reports to files, making it easier to share results or track progress over time. The files are named in a clear and descriptive format, like "BTCUSDT_my-strategy.md".

## Class PartialReportService

This service helps you keep track of partial trades by recording when you exit positions for profit or loss. It listens for notifications about these partial exits, specifically those related to profit and loss levels.

The service stores these events, including the price and level at which the exit occurred, in a database. You can think of it as a detailed log of how your positions are being closed out partially.

To get it working, you need to subscribe to the signals that announce these partial profit and loss events.  When you're done tracking, you can unsubscribe to stop receiving these signals. The subscription mechanism prevents you from accidentally subscribing multiple times. 

The service uses a logger to help with debugging and relies on another component to actually write the data to the database. It also uses a 'tickProfit' and 'tickLoss' to process the events.

## Class PartialMarkdownService

The PartialMarkdownService helps you create and save reports detailing your profits and losses during trading. It listens for events that mark profits or losses and keeps track of them separately for each trading symbol and strategy you use. 

This service generates nicely formatted markdown tables summarizing these events and also provides overall statistics about your performance. It automatically saves these reports to your disk, organizing them in a clear folder structure.

You can subscribe to receive these events in real-time, and you can unsubscribe when you no longer need them. The service lets you retrieve accumulated data or generate full reports for specific symbols and strategies. 

You can also choose to clear out all the recorded data or just the data for a particular symbol and strategy. It uses a logger to provide debugging output and a storage system to manage the data.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the trading system. It simplifies how strategies interact with the connection layer, providing a single injection point and a place for consistent logging.

Think of it as a middleman; when a strategy needs to record a profit, loss, or clear a partial position, it doesn't directly talk to the connection service. Instead, it goes through PartialGlobalService, which logs the action and then passes the request along.

It’s also equipped with several validation services—for strategies, risks, exchanges, frames, and actions—to make sure everything is set up correctly before any trading happens. The validation process is optimized so that it's not repeated unnecessarily.

The service relies on other components injected into it, like a logger and a connection service, to handle the actual work and reporting. It's designed to make the system more organized and easier to monitor.


## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It essentially acts as a central hub for handling these calculations.

It keeps track of ClientPartial objects, which hold the specific profit/loss data for each signal, using a clever caching system. This means it only creates one of these objects per signal, saving resources.

When a signal reaches a new profit or loss level, this service steps in to process it, creating the necessary ClientPartial object if one doesn't exist and then passing the information along. When a signal is closed, the service cleans up its associated data.

It’s integrated into the larger trading framework and uses other services, like logging and time management, to function effectively. This service ensures that profit and loss data is accurately tracked and efficiently managed for each trading signal.

## Class OrderTransientError

This class, `OrderTransientError`, is a way to clearly signal that an order attempt failed temporarily—think network hiccups or brief exchange issues—and should be retried. It's essentially a shortcut because the framework already treats any error that isn't specifically categorized as a business rejection or order-not-found as transient. You don't *need* to use it; a plain `throw new Error(...)` would work the same.  But using `OrderTransientError` makes your code easier to understand, explicitly stating that a retry is appropriate.

It's paired with `OrderRejectedError` (for permanent rejections) and `OrderDeletedError` (for orders that can't be found), forming a trio of error types.

How this "transient" verdict is handled depends on where the error occurs:

*   **Opening or Closing Orders:** The framework automatically retries the order, using the *exact* same details as before, up to a certain number of attempts. This is persistent—even crashes don’t reset the retry count, but the system reconciles with the exchange before retrying.  If retries fail repeatedly, the system signals a critical issue.
*   **Order Checks (Health Pings):** Failed checks are tolerated and retried. Multiple failures in a row lead to a more serious error if they continue.
*   **Important Note:** Exhausting the retry attempts for any of these transient errors is considered a fatal problem that will shut down the system.

Things to keep in mind:

*   The retry counters are based on *consecutive failures*, not just time.
*   The `__type__` property is a unique identifier for this specific error type, useful for logging and monitoring.
*   The backtest environment doesn't use this error directly; it’s intended for live trading.
*   If you need to create a new `OrderTransientError` from an existing error object, use the static `fromError` method.

## Class OrderRejectedError

The `OrderRejectedError` signifies a definitive, unrecoverable rejection of an order by the exchange – essentially, it's a permanent "no" and retrying won't help.

It's thrown specifically within the order handling pathways: broker adapters, action schemas, or listener functions.

When this error occurs, the backtest framework takes immediate and significant actions:

*   **Open Orders:** Any pending order opening is immediately dropped, preventing retries and effectively wiping out any attempt to execute that order.  A new order attempt will be required.
*   **Close Orders:**  Existing positions are forcefully closed with the original reason (like take-profit or stop-loss), bypassing normal retry mechanisms. While the standard close signal is still triggered, reconciling the position with the exchange is then the adapter's responsibility.

This isn’t a generic error – it's reserved for scenarios where the exchange *confirmed* an impossibility, such as a delisted symbol, account restrictions, or a lack of liquidity.  Network issues or temporary problems should trigger standard errors or `OrderTransientError` to allow for retries.

Throwing this error from the wrong place (the "check" channel) results in it being treated as a temporary issue, subject to retries.  The runtime brand `__type__` ensures it's recognized even across different module instances, and its usefulness is primarily in live environments or with customized testing setups.  The message provided is purely for informational logging and doesn’t affect how the framework processes the error.


## Class OrderDeletedError

This error, `OrderDeletedError`, signals that the exchange has definitively confirmed an order is no longer present – it's been canceled, liquidated, or removed in some way. It's specifically used when performing order checks, like during broker adapter pings or action handlers.

When this error is thrown, the framework immediately treats it as a confirmed deletion, bypassing any retry attempts. If it's an open position, the position is closed with a "closed" reason. For resting orders, the scheduled signal is canceled as if the user did it.

It's crucial to only throw this error when the exchange *explicitly* states the order is gone. A filled order isn't deleted; that's handled differently. Similarly, network problems shouldn't trigger this; use `OrderTransientError` instead.

Throwing this error in the wrong place – outside of the order checks – will degrade it to a regular transient error.  It has a specific runtime "brand" that identifies it, so use the `isOrderDeletedError` method to check it, instead of `instanceof`. Keep in mind that this error won't occur during backtesting because there's no live exchange involved. This error ignores any existing retry attempt counts.  The message on the error is optional, it's purely informational.


## Class NotificationLiveAdapter

The `NotificationLiveAdapter` helps you send notifications about your trading activity, like signals, profits, losses, and errors. It's designed to be flexible, allowing you to easily switch between different ways of sending those notifications – whether it's to memory, a file, or some other system.

Think of it as a central hub for all your notifications. It provides a consistent way to handle events like a new signal, a partial profit being realized, or an error occurring.

You can choose how the notifications are handled by swapping out the underlying “notification backend” using methods like `useMemory` (the default, storing notifications in memory only), `usePersist` (for saving notifications to disk), or `useDummy` (effectively silencing notifications).

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, etc.) are the entry points for different types of notifications, and they all forward the information to the currently active notification system.  The `getData` method lets you retrieve all stored notifications, while `dispose` clears them. The `clear` function is useful if your trading environment changes between sessions and needs to reset its notification settings.  Finally, `useNotificationAdapter` gives you direct control to register your own custom notification implementation.

## Class NotificationHelperService

This service helps manage and send out notifications about signals within the trading framework. It's primarily used internally but lets you trigger notifications through `commitSignalNotify` when you're setting up callbacks.

It's responsible for checking that your trading strategy, the exchanges you're using, the trading frames, and any actions are all set up correctly.  It's smart about this checking – it only performs the checks once for each unique combination of strategy, exchange, and frame.

The `commitSignalNotify` function is how you actually send out the notifications.  It makes sure everything is validated, grabs the details of the signal, and then sends a notification to anyone who's listening, also saving a record of it.

It relies on several other services to do its job, like services that handle logging, strategy schemas, risk, exchange and frame validations, core strategy logic, and time data.

## Class NotificationBacktestAdapter

This component acts as a central hub for sending notifications during backtesting. It's designed to be flexible, allowing you to easily change *where* those notifications are sent – whether it's to memory, a database, or nowhere at all (a dummy adapter).

It uses a pattern where you can plug in different "notification adapters," each responsible for handling notification delivery. The default behavior stores notifications in memory, but you can easily switch to persistent storage (saving them to a file) or completely disable notifications with the dummy adapter.

The adapter provides methods for handling various events like signal confirmations, profit/loss updates, strategy commits, and order status changes. Each of these methods simply forwards the event information to the currently active notification adapter.

You can control which adapter is used through the `useNotificationAdapter`, `useDummy`, `useMemory`, and `usePersist` methods.  The `clear` method is important if your backtesting environment changes during a session.

Finally, the `getData` method retrieves all accumulated notifications, and `dispose` clears them, providing a way to access and clean up notification data.

## Class NotificationAdapter

The NotificationAdapter is a central piece for handling notifications during backtesting and live trading. It automatically keeps track of notifications by listening for updates from various signals.

It makes sure you don't accidentally subscribe to the same signals multiple times, preventing duplicate notifications. 

You can easily retrieve all of the notifications that have been recorded, specifying whether you want to see backtest notifications or live ones. 

And when you're finished, you can clear out all of the stored notifications to clean things up. The adapter also provides ways to turn notification tracking on and off.

## Class MemoryLiveAdapter

The `MemoryLiveAdapter` helps you manage and store data during live trading, providing a flexible way to handle that data. It acts as a bridge between your trading strategy and different ways of storing information, letting you easily swap out storage methods.

By default, it uses a file-system based storage, meaning your data can survive restarts. However, you can switch to a purely in-memory storage for speed, or even a dummy storage that simply ignores all data for testing purposes.

You can also plug in your own custom storage solutions. The adapter keeps track of data using memoization, creating instances based on signal and bucket names. When a signal is finished, you can clear out those instances.

There are convenient functions to easily change the storage type, like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter`.  You can write, search, list, remove, and read data from memory using provided methods. It also offers a `clear` method to clean up the memoized cache when needed, particularly when the working directory changes.

## Class MemoryBacktestAdapter

This adapter helps you manage memory during backtesting, providing different ways to store and retrieve data. It's designed to be flexible, allowing you to easily swap out the underlying storage mechanism.

By default, it uses an in-memory storage system (MemoryLocalInstance), which is fast but doesn't save data between sessions.

You have options: you can switch to a file-system backed storage (MemoryPersistInstance) to save your data to disk, or use a dummy adapter (MemoryDummyInstance) for testing purposes. You can also use your own custom storage implementation.

The adapter handles creating and managing memory instances, and provides methods for writing, searching, listing, removing, and reading data.  It’s important to dispose of memoized instances when signals are cancelled to avoid memory leaks.

You can easily change the storage backend using convenience methods like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter`.  It’s good practice to clear the cache with `clear` when the working directory changes.

## Class MemoryAdapter

The MemoryAdapter manages how your backtest and live trading systems store and retrieve data. It automatically handles cleaning up old data when signals are finished, preventing issues with outdated information.

You can think of it as a central hub for interacting with memory storage – whether it's for a simulated backtest or a real-time trading environment.

Here's a breakdown of what you can do:

*   **Enable/Disable:** Turns memory storage on or off, automatically subscribing and unsubscribing to signal events.
*   **Write Memory:**  Adds new data entries to memory, specifying details like a unique ID, value, signal, bucket, and timestamp. The system directs this operation to the correct storage (backtest or live).
*   **Search Memory:**  Finds data entries matching a specific search query, using a scoring system to rank the results.  Again, it sends the request to the appropriate storage location.
*   **List Memory:** Retrieves all entries within a specific memory bucket, for browsing or inspection.
*   **Remove Memory:** Deletes individual data entries from memory.
*   **Read Memory:** Retrieves a single, specific data entry.

The adapter routes all of these actions to either a backtest memory store or a live memory store, based on the provided information. It uses a clever "singleshot" approach to ensure subscriptions only happen once and a cleanup mechanism to prevent stale data.

## Class MaxDrawdownUtils

This class helps you analyze and report on maximum drawdown events, which are crucial for understanding risk in your trading strategies. Think of it as a tool for digging into the worst performance periods your strategies have experienced.

You can use it to fetch detailed statistical data related to maximum drawdowns for specific trading symbols, strategies, and exchanges. The data includes information gathered from drawdown events.

It also allows you to generate clear, readable markdown reports summarizing these events, showing you exactly when and how much your strategies lost.  You can further customize the report to include specific data columns.

Finally, you can automatically save these markdown reports directly to a file, making it easy to share or archive your drawdown analysis.

## Class MaxDrawdownReportService

This service is responsible for tracking and recording maximum drawdown events during backtesting. It listens for updates on drawdown events and saves those records to a database for later analysis.

Essentially, it's a way to keep a log of how much your trading strategy lost from its peak value.

The service works by receiving data about each drawdown, including details like the symbol, strategy name, price levels, and the signal that triggered the event. This information is then stored in a structured format.

To use it, you need to subscribe to the drawdown events.  Importantly, subscribing only happens once; subsequent attempts will return the same "unsubscribe" function, avoiding redundant registrations.  You can then unsubscribe when you're finished, which stops the logging process. It uses a special mechanism to make sure you only subscribe once.


## Class MaxDrawdownMarkdownService

This service is designed to automatically create and save reports detailing maximum drawdowns for your trading strategies. It listens for drawdown data and organizes it based on the symbol, strategy, exchange, and timeframe being used.

You can subscribe to start receiving drawdown data and unsubscribe to stop and clear any accumulated information. The `tick` method handles processing each individual drawdown event.

To get the collected data, use `getData`. To generate a formatted markdown report, use `getReport`, and to save that report directly to a file, use `dump`.

The `clear` method is useful for removing all stored drawdown data, or, if you want, clearing data for a specific combination of symbol, strategy, exchange, and timeframe.

## Class MarkdownWriterAdapter

This component helps you manage how your backtest results are saved as Markdown files. It provides a flexible way to change where and how the Markdown is stored without altering the core testing logic.

You can easily switch between different storage methods: one option creates a separate Markdown file for each report, another option combines all reports into a single JSONL file, and a third option completely disables Markdown output.

The system remembers which storage method is being used so you don't have to reconfigure it repeatedly. If you need to refresh the storage location – for example, when the working directory changes – you can clear the memory to ensure a fresh start. 

To start using it, just call `useMd()`, `useJsonl()`, or `useDummy()`.  The adapter automatically creates the necessary storage when you first write data. You can also customize the adapter itself if you need a unique way to save your Markdown.

## Class MarkdownUtils

MarkdownUtils helps manage how reports are generated in different parts of the trading framework, like backtests, live trading, and strategy analysis. 

You can choose which report types to activate and deactivate – for example, you might want markdown reports for backtests but not for live trading.

When you enable a report type, it starts collecting data and preparing the report. Remember to unsubscribe from the enabled services when you're finished, to avoid memory problems.

You can also clear the data that's been collected for a report type without stopping the report generation entirely, allowing you to start fresh.

This utility is designed to be extended, often used with a MarkdownAdapter for more specialized report handling.

## Class MarkdownFolderBase

This adapter is designed for creating well-organized reports with each test result saved as a separate markdown file. Think of it as the standard way to generate reports when you want a clear, navigable directory of individual reports.

It works by directly writing the markdown content to a file, letting you easily browse and review each backtest result. The file's location is controlled by the `path` and `file` options you provide, creating a directory structure that makes sense for your reports. 

The adapter doesn’t require any setup or initialization; it's ready to use right away for simple report generation. The `dump` method is its core function, handling the creation of the file and writing the markdown content.


## Class MarkdownFileBase

This component helps you create and manage markdown reports as JSONL files, making it easy to centralize and process your trading data. It's designed to write reports in an append-only format, ensuring data integrity.

Each report type gets its own file in a designated directory. The system automatically creates this directory if it doesn't already exist.

The writing process is handled carefully. It includes measures to prevent data loss, like a timeout mechanism (15 seconds) and backpressure handling to ensure the write process doesn't overwhelm the system.

You can filter these reports later using metadata like the trading symbol, strategy name, exchange, frame, and signal ID.

To get started, you specify the report type when creating the adapter, and then use the `dump` method to write content. The `waitForInit` method ensures everything is set up correctly, although it only executes once. The adapter handles errors by sending them to an exit emitter.

## Class MarkdownAdapter

This component provides a flexible way to manage how markdown files are stored and handled. It uses a pattern that allows you to easily switch between different storage methods without changing your core code. 

Think of it as a central point for controlling where your markdown data lives. 

You can choose to store each markdown file as a separate .md file, or combine everything into a single JSONL file. There's even a "dummy" option to effectively ignore writes for testing or development purposes. 

The system remembers your choices, creating only one instance of each storage type, and it only initializes storage when you first need to write data. The `useMd()` and `useJsonl()` methods are shortcuts to quickly switch between the most common storage methods. You have full control over which adapter to use by providing a custom constructor.

## Class MCPValidationService

The MCPValidationService helps ensure that your Model Context Protocols (MCPs) are correctly set up and used consistently within your trading framework. It keeps track of all registered MCPs, making sure they exist and that the strategies they rely on are also valid. 

Think of it as a gatekeeper for your MCPs – it prevents you from registering the same MCP twice, unlike other parts of the system. 

Here’s what you can do with this service:

*   **Register MCPs:** You add MCPs, along with their schemas, to the service, so it knows about them.
*   **Validate MCPs:** Before using an MCP, you can ask the service to check if it's registered and the strategy it depends on is correct. It only checks once per MCP name to speed things up.
*   **List MCPs:** You can get a list of all the MCPs currently being tracked.

The service utilizes loggerService and strategyValidationService internally, and it stores MCP information in its internal map (_mcpMap).

## Class MCPUtils

MCPUtils provides a way for agents to interact with and observe live trading strategies. Think of it as a bridge between the agent and the trading system, allowing it to understand what's happening and even manually influence positions.

It acts as a central point to get information about the portfolio, like a snapshot of current holdings and past trades, rendered into easily understandable messages for the agent.

You can use it to:

*   See a detailed view of the current portfolio, including open positions, profits, and losses, presented as agent-friendly messages.
*   View a history of past trades, including results and reasons for closing, to learn from previous decisions.
*   Manually open new positions, specifying the amount and using pre-defined risk settings.
*   Manually close existing positions.

All actions are carefully checked to ensure they are valid within the defined strategy and risk parameters. MCPUtils ensures safety and consistency when interacting with the live trading environment. It's a singleton, meaning there's only one instance managing these interactions.

## Class MCPSchemaService

The MCPSchemaService acts like a central library for managing schema definitions used within the backtest-kit framework. Think of it as a place to store and organize blueprints for how different parts of the system communicate. 

It keeps track of these blueprints, called MCP schemas, using their unique names. When a new blueprint is added, it's checked quickly to ensure it has the basic required information.

This service is essential because other parts of the system use it to understand how to work with different strategies and build messages.

Here's a breakdown of what you can do with it:

*   **Register Schemas:** You can add new schema definitions to the library, associating them with a specific name. If you try to add a schema with the same name twice, the new one replaces the old one.
*   **Retrieve Schemas:** You can easily look up a schema definition by its name.
*   **Partially Update Schemas:**  You can modify an existing schema by providing only the parts you want to change, and it will combine those changes with the original. 

The service has internal components for logging and validation to ensure the integrity of the schema data.

## Class LookupUtils

The `LookupUtils` class acts like a central record of what's currently happening in your backtests and live trading sessions. Think of it as a constantly updated list of active processes.

Whenever a backtest starts, a live session begins, or a strategy's iteration kicks off, information about that process is registered here.  When that process finishes, that information is removed.

This system helps manage how tasks are handled, especially when dealing with potentially parallel operations, ensuring efficient resource usage.

You don't create instances of `LookupUtils` directly – it's a singleton accessed via the `Lookup` object.

Here's what you can do with it:

*   **`addActivity`**:  Adds a new activity to the running list.  If you try to add the same activity twice, it simply replaces the old information.
*   **`removeActivity`**: Removes an activity from the list. It's crucial to use this when an activity completes, even if there's an error, to prevent stale entries.
*   **`listActivity`**:  Gives you a current snapshot of all the activities that are currently running.



The `_lookupMap` property internally stores these activities, using a combination of keys to identify them.

## Class LoggerService

This component helps you keep your trading logs organized and informative. It acts as a central hub for logging messages, automatically adding details about where the log came from – like the trading strategy, exchange, or specific section of code. 

You can provide your own custom logger if you have a preferred setup, or the framework will use a default "no-op" logger that essentially does nothing. The logger then provides several methods for logging at different levels: general messages, debug information, informational notes, and warnings – all with consistent contextual information added. 

The `setLogger` method allows you to easily swap in your own logging mechanism. The service utilizes `methodContextService` and `executionContextService` to manage and inject the relevant details into your log messages, so you don’t have to add them manually.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage how your trading strategies log information. Think of it as a central hub for all your logging needs, letting you easily switch between different storage methods. By default, it keeps logs in memory, but you can change this to save logs to a file or even disable logging entirely.

It uses a pattern that allows swapping log implementations, giving you choices like keeping logs in memory, saving them to disk, or simply ignoring them. The `getInstance` method ensures that the logging system is only built once and reused, which helps with efficiency.

You can list all the logged entries or just add new ones, with different severity levels like debug, info, warning, etc.  Need to change where your logs are stored?  You can easily switch to persistent storage (saving to a file), use an in-memory log, or use a dummy adapter that discards all log messages.  There's even a JSONL option for structured logging.  Finally, `clear` ensures a fresh start when you need it, like when your program's working directory changes.

## Class LiveUtils

This utility class simplifies live trading operations by providing a centralized way to run strategies and manage their state. Think of it as a helper for your live trading, providing conveniences like crash recovery and real-time progress tracking.

It offers a few key functionalities: running live trading (both continuously and with results), retrieving signal information (pending and scheduled), calculating position metrics (cost, percentage closed, etc.), and providing control over the strategy's execution (pausing, canceling signals).

Here's a breakdown of what you can do with it:

*   **Running Live Trading:**  It provides a straightforward way to initiate live trading for a specific symbol and strategy.  You can run it continuously in the background, just for side effects like persistence.
*   **Signal Management:** Retrieve details about pending or scheduled signals, and check if those signals exist.
*   **Position Metrics:** Easily get important data about a position, such as its cost basis, percentage closed, and effective entry price.
*   **Control and Monitoring:**  Pause a strategy, cancel scheduled signals, and get detailed reports on its performance.
*   **Commit Actions:** Trigger actions like partial profit/loss closes, trailing stops/takes, and break even adjustments within your live trading process.
*   **Data and Reporting:** Access current statistics and generate detailed reports about live trading activities.

The `LiveUtils` class uses a singleton pattern, meaning there's only one instance, ensuring consistent access and state management across your application.


## Class LiveReportService

The LiveReportService helps you track what your trading strategy is doing in real-time. It listens for events like when a trade is opened, active, or closed, and saves all those details to a database.

Think of it as a live logbook for your trading.

It uses a logger to provide feedback while it’s working.

You can use the `subscribe` function to start receiving these live trading updates, and it ensures you don't accidentally subscribe multiple times. Remember to use the function returned by `subscribe` to stop receiving updates when you’re done. The `unsubscribe` function handles that for you, ensuring a clean exit.

## Class LiveMarkdownService

This service automatically generates and saves reports detailing your live trading activity. It keeps track of all significant events – idle periods, trades being opened, active trades, and when trades are closed – for each strategy you’re using.

It produces clear, readable markdown tables filled with event details, along with important trading statistics like win rate and average profit/loss. These reports are saved to your computer in a structured directory (logs/live/{strategyName}.md) so you can easily review your trading performance.

The service listens for trading signals, accumulating data as it goes.  You'll need to tell it to start listening for those signals, and you can also tell it to stop when you're done. The data is stored in a way that keeps each strategy and trading setup isolated.

You can request summaries of your data or generate complete reports, and you have the option to clear out old data if you need to start fresh. This allows you to examine your past strategies and improve them based on that history.

## Class LiveLogicPublicService

The LiveLogicPublicService is designed to make running live trading easier by handling a lot of the setup automatically. It builds on top of the LiveLogicPrivateService and adds context management, meaning you don't have to pass information about your strategy and exchange everywhere.

It operates as a continuous, never-ending stream of trading results – specifically, signals indicating trades opened, closed, or cancelled.

If something goes wrong and the process crashes, it can recover the trading state from saved data, ensuring no data loss. The service also keeps track of time using the system clock to precisely manage progression.

To get started, you'll call the `run` method, providing a symbol (like "BTC-USDT") and the strategy and exchange names. This will kick off the trading process, and it will automatically handle the context.


## Class LiveLogicPrivateService

This service handles live trading in a continuous, automated fashion. It’s designed to monitor a trading symbol and react to changes, producing a stream of trading results.

It functions as an infinite loop, constantly checking for new signals and events. Each iteration records the current time, evaluates the trading signals, and then reports any newly opened or closed positions.  It avoids reporting positions that are simply active or idle.

The service is built to be robust, meaning if something goes wrong, it can recover and continue trading from where it left off.  It efficiently streams trading data, minimizing memory usage, and doesn't have a defined end – it runs continuously until explicitly stopped.

You provide the symbol you want to trade, and it returns an async generator that you can use to process the results in real-time. 

It relies on services for logging, managing core trading strategy logic, and providing method context.

## Class LiveCommandService

LiveCommandService makes it easy to interact with the live trading parts of the backtest-kit framework. Think of it as a convenient middleman for accessing the core live trading functionality.

It bundles together several helper services, like those for validating your trading strategies, risks, and the exchanges you're using. It also has a validation mechanism that remembers previous checks so it doesn't waste time re-checking the same things.

The main feature is the `run` method, which you’ll use to actually start live trading for a specific trading pair (like BTC/USD). It’s designed to run continuously, and it has built-in mechanisms to handle any unexpected problems that might pop up during trading. It streams back results as it goes.

## Class IntervalUtils

IntervalUtils provides a way to control how often certain functions are executed, especially useful in trading strategies. It ensures a function runs at most once within a specified time interval.

There are two main ways to use it: in-memory, where the state is stored temporarily, or file-based, where the state is persistently saved to disk, allowing it to survive restarts.

The `fn` method wraps a regular function to make sure it only fires once per interval. It's like a gatekeeper that prevents a function from running too frequently. If the function returns `null`, it essentially pauses and tries again later.

The `file` method does the same thing but saves the "fired" state to a file, so your strategy remembers what's already happened even if the application is restarted.

You can manually clean up these cached functions using `dispose` to force them to recreate, or `clear` to wipe everything out. Also, `resetCounter` helps prevent issues when the working directory changes during strategy runs, ensuring data consistency. Think of it as housekeeping for your interval-based functions.

## Class HighestProfitUtils

This class helps you analyze and visualize the highest profit trades your strategies have made. Think of it as a reporting tool for understanding which strategies are performing well.

It gathers data about the most profitable trades, pulling information from events that have been recorded.

You can use methods to:

*   **Get statistical data:** Retrieve key statistics, such as the highest profit achieved, for a specific trading symbol and strategy configuration.
*   **Generate a report:** Create a formatted markdown report showing all of the highest profit events for a particular strategy.
*   **Save a report to a file:** Automatically generate and save that markdown report to a file on your computer. This allows you to easily share results or track performance over time. 

The reports and data are linked to the specific symbol, strategy, exchange, and timeframe being used. You can also specify if it is a backtest or not.

## Class HighestProfitReportService

This service keeps track of the highest profit achieved during a trading backtest and saves those moments for later analysis. It listens for events indicating a new highest profit has been reached.

Each time a highest profit is recorded, the service writes detailed information to a special database. This information includes the time, trading symbol, strategy used, exchange, time frame, and backtest settings, along with specifics about the trading signal itself like position size and price levels.

To start saving these records, you need to subscribe to the service. The subscription ensures that only one listener is active at a time to prevent unnecessary data. If you later want to stop saving records, you can unsubscribe. If you haven’t subscribed, unsubscribing won't do anything.


## Class HighestProfitMarkdownService

This service is designed to create and store reports detailing the highest profits achieved by a trading strategy. It listens for incoming data about contract performance, organizes it based on symbol, strategy, exchange, and time frame, and then allows you to generate and save nicely formatted reports.

You can subscribe to receive updates about these highest profit events, and the system makes sure you don’t accidentally subscribe multiple times. When you're done, an unsubscribe function will cleanly detach the service and clear all stored data.

The `tick` function handles individual data points, routing them to the appropriate storage location. You can request the accumulated data for a specific symbol, strategy, exchange, and timeframe using `getData`, or generate a full report with `getReport`.

To save the report directly to a file, use the `dump` function, which automatically creates a descriptive filename. Finally, the `clear` function lets you wipe out either a specific report's data or all of the accumulated data.


## Class HeatUtils

HeatUtils helps you visualize and analyze your portfolio's performance using heatmaps. It's designed to make working with portfolio statistics and generating reports easier, especially when dealing with multiple strategies.

This class automatically gathers performance data—like profit/loss, Sharpe ratio, and drawdown—for each symbol used by a strategy.

You can use `getData` to fetch the raw statistics, `getReport` to create a formatted markdown table displaying those stats, and `dump` to save the report to a file. The reports are organized by strategy and are sorted by performance. HeatUtils handles the aggregation and logging for you, making your analysis workflow more streamlined. It's a single, readily available tool for portfolio heatmap operations.

## Class HeatReportService

The HeatReportService helps you keep track of your trading signals by recording when they close and how they perform. It listens for signals that have finished and generates a heatmap for analysis across all your trading symbols. 

It only records signals that have actually closed, along with any profit or loss (PNL) data. The service then saves this information, ready for creating heatmap visualizations.

To get it working, you'll subscribe to the signal emitter to receive these events.  Make sure you unsubscribe when you’re done to prevent unnecessary activity. The `subscribe` method prevents you from accidentally subscribing more than once, and it provides an unsubscribe function that you should call when you no longer need the service. If you haven’t subscribed, unsubscribing won't do anything. 

The service uses a logger to output debugging information.

## Class HeatMarkdownService

This service helps you visualize and understand your trading performance across different strategies and symbols. It listens for trading signals, collects data about closed trades, and then organizes it to create helpful reports. 

Think of it as a real-time dashboard that summarizes how your trading is doing.

It keeps track of statistics for each symbol, like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), maximum drawdown (biggest loss), and the number of trades. You can also get an overview of performance across all symbols for a specific strategy. 

The service generates reports in Markdown format, which are easy to read and share. These reports include a summary and a table showing each symbol's performance. You can also save these reports to a file. 

It's designed to be resilient and avoids errors caused by unexpected data. It also ensures that data is stored efficiently and that it's cleared when no longer needed.  You can subscribe to receive updates, and easily unsubscribe when you want to stop. It has a way to clear historical data, either for a specific trading setup or everything at once.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframe configurations and makes sure they’re set up correctly. Think of it as a central place to register and check your timeframes, like "1m" or "1h". 

It lets you add new timeframe definitions, ensuring that each one has a clear structure. Before you start any trading simulations or backtests, you can use it to verify that a timeframe actually exists, preventing errors. 

To improve performance, it remembers the results of these checks, so it doesn't need to re-validate the same timeframe repeatedly. You can also get a complete list of all the timeframes you’ve registered. This service keeps your framework organized and avoids unexpected issues related to timeframe configurations.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your trading strategy setups – think of them as templates for your strategies. It uses a special system to store these templates in a way that’s very careful about data types, reducing errors.

You add new strategy setups using the `register` method, giving each one a unique name. If a setup already exists, you can update it partially with the `override` method. 

Need to use a specific setup? The `get` method allows you to retrieve it by name. 

Before a new setup is added, the service quickly checks that it has the basic structure it needs with `validateShallow`, making sure everything is in place. The service also has a logger service allowing to control logging behavior.

## Class FrameCoreService

FrameCoreService helps manage and generate timeframes for your backtesting process. 

It acts as a central point for working with timeframes, relying on other services to do the heavy lifting. Think of it as the engine that provides the sequences of dates you'll be using to simulate trades. 

It uses a FrameConnectionService to create these timeframe sequences and validates them to ensure everything is accurate. 

The `getTimeframe` method is key – it's what you'll use to get the actual date arrays needed to run your backtest, specifying which asset and timeframe you're interested in. This service provides the chronological data necessary to evaluate trading strategies.

## Class FrameConnectionService

The FrameConnectionService helps manage and route requests to the correct frame implementation within the backtest environment. It automatically figures out which frame to use based on the method context, essentially acting as a dispatcher. 

To improve performance, it keeps a record of the frames it’s using, so it doesn’t have to recreate them every time. This caching system is crucial because it prevents stale data from affecting backtest results.

The service provides a way to retrieve these cached frame instances using `getFrame`. 

Crucially, `clear` resets the cached frames. This prevents the backtest from using outdated data and ensures that it uses the latest available candles – a vital step when running long processes or re-running backtests.  It's the responsibility of the backtest or walker to call this method initially.

Finally, `getTimeframe` retrieves the start and end dates defined for a specific symbol and frame, allowing you to limit the backtest to a defined time period.


## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're properly set up. It acts like a central manager for exchange configurations, allowing you to register new exchanges and confirm they're ready to go before your strategies try to use them. 

It keeps a record of all the exchanges you've added and remembers validation results to avoid unnecessary checks, boosting efficiency. 

Here's what you can do with it:

*   You can register new exchanges using `addExchange()`.
*   `validate()` lets you quickly check if a specific exchange is registered and valid.
*   If you need to see all the exchanges you’re using, `list()` will give you a complete list of their configurations. 

The service also uses a logger service and an internal map to store exchange data.

## Class ExchangeUtils

This class provides helpful tools for interacting with different cryptocurrency exchanges. Think of it as a helper that simplifies common tasks like fetching data and formatting values to match each exchange's specific rules.

It's designed to be used easily, with only one instance of the class existing at a time.

Here's a breakdown of what it can do:

*   **Fetching Data:** It can get historical candlestick data (`getCandles`), calculate the average price using volume-weighted calculations (`getAveragePrice`), and retrieve the most recent closing price (`getClosePrice`). It also pulls order book information (`getOrderBook`) and aggregated trade data (`getAggregatedTrades`).
*   **Working with Dates:** When getting historical data, it automatically figures out the correct start date based on how much data you need and the time interval.
*   **Formatting:** It makes sure quantities and prices are formatted correctly to meet each exchange's precision requirements (`formatQuantity`, `formatPrice`).
*   **Raw Data:** If you need more control, `getRawCandles` allows fetching raw candlestick data with custom start and end dates.
*   **Time Awareness:** When running backtests, the system accounts for the execution time during data retrieval to prevent issues related to looking into the future.

## Class ExchangeSchemaService

This service helps manage and keep track of different exchange schemas, which define how our system interacts with various exchanges. It uses a special system to ensure the schemas are stored consistently and safely.

You can add new exchange schemas using `addExchange()`, and retrieve them later using their names.  Before a schema is added, `validateShallow()` checks to make sure it has all the necessary properties in the right format.  If a schema already exists, you can update parts of it using `override()`. Finally, `get()` lets you fetch a schema by its name. 

The service also has internal tools for logging and managing its data storage.

## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges, providing a consistent way to fetch data like candles, order books, and trades. It's designed to work closely with the backtesting and live trading systems, injecting relevant information about the trading context—like the symbol, trading time, and whether it's a backtest—into each request. 

Think of it as a wrapper around the core exchange connection, making sure each request is aware of the specific trading scenario. It includes built-in validation to ensure the exchange setup is correct, and this validation is cleverly optimized to avoid unnecessary repetition.

The service offers several methods for retrieving data: `getCandles` grabs historical price data, `getNextCandles` is used for backtesting to simulate future conditions, `getAveragePrice` calculates VWAP, `getClosePrice` fetches the closing price of a candle, and `getOrderBook` retrieves the order book. It also provides utility functions like `formatPrice` and `formatQuantity` to ensure prices and quantities are displayed correctly.  Finally, `getAggregatedTrades` gets aggregated trade information, and `getRawCandles` is available for more detailed data retrieval with advanced date filtering.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently directs requests to the correct exchange implementation based on the configured exchange name.

It uses a smart caching system to avoid repeatedly creating connections to exchanges, improving performance. This caching means that once an exchange is connected, subsequent requests for the same exchange are much faster.

The service provides a comprehensive set of functions for common exchange operations:

*   `getCandles` and `getNextCandles` retrieve historical and subsequent candle data.
*   `getAveragePrice` provides the average price, calculating it from historical data in backtest mode or fetching it live.
*   `getClosePrice` returns the closing price of the most recent candle.
*   `formatPrice` and `formatQuantity` ensure that prices and quantities are formatted correctly according to each exchange's specific rules, handling details like decimal places.
*   `getOrderBook` fetches order book data, and `getAggregatedTrades` retrieves aggregated trade data.
*   `getRawCandles` provides flexibility for fetching candles with custom date and limit parameters.

The service relies on other components like `loggerService`, `executionContextService`, `exchangeSchemaService` and `methodContextService` to manage logging, execution context, schema management, and routing. Essentially, it simplifies the process of interacting with various exchanges in a consistent and efficient way.

## Class DumpAdapter

The `DumpAdapter` helps you save information—like messages, data, or errors—during a trading backtest. Think of it as a flexible system for recording what happens. It has a default way of saving things as Markdown files, but you can easily change how it works.

Before you start recording, you need to “enable” the adapter.  It’s like registering it to listen for events during the backtest. When the backtest finishes or a signal is canceled, it cleans up old recordings to prevent memory buildup. You can “disable” it when you’re done recording.

You can save different types of data: full conversations (message histories), simple records, tables of data, raw text, JSON objects, or even just error messages. 

You have several options for where to store this data:
*   The default is to create Markdown files, one per recording.
*   You can store data in memory.
*   You can even discard everything (the "dummy" backend) for testing.
*   Or, you can provide your own custom storage method.

Finally, the `clear` function resets the adapter’s memory, which is useful when your backtest’s working directory changes.

## Class CronUtils

The `CronUtils` class, accessed via the singleton `Cron`, helps you schedule tasks that run at specific intervals within your backtesting framework. Think of it as a way to execute code at regular times during your simulations.

It’s particularly useful for coordinating tasks across multiple parallel backtest runs to ensure each task runs only once at a given time. This ensures synchronized behavior in complex simulations.

Here's a breakdown of how it works:

*   **Registration:** You register your tasks (called "entries") with names and intervals.
*   **Execution:** When the simulation reaches a time that matches a registered interval, the associated code is executed.
*   **Coordination:**  `CronUtils` manages these executions carefully, preventing duplicate runs even when multiple backtest processes are involved. It uses generation counters to track entries and prevent outdated tasks from interfering.
*   **Lifecycle Management:** You can enable and disable the scheduler to connect it to the backtesting engine's timing signals, or dispose of it to completely clear all schedules.

The `_lastBoundary` property is a key feature— it ensures that even if your backtesting jumps over a scheduled time, the task will still be executed at the next appropriate time, avoiding missed runs. The `_firedOnce` property makes sure the fire-once events don't fire multiple times.


## Class ConstantUtils

This class provides a set of constants that help define your take-profit and stop-loss levels, employing a method derived from the Kelly Criterion and incorporating risk decay. These constants are percentages representing how far the price needs to travel toward your ultimate profit or loss target before a partial exit is triggered.

For example, if your target profit is a 10% gain, these constants dictate when partial profits are locked in.

Here's a breakdown of what each constant represents:

*   **TP_LEVEL1 (30):**  An early take-profit level, triggering when the price reaches 30% of the way to your total profit target.
*   **TP_LEVEL2 (60):** A mid-level take-profit, activated at 60% of the way to your total profit target.
*   **TP_LEVEL3 (90):**  A final take-profit level, triggering when the price reaches 90% of the way to your total profit target.
*   **SL_LEVEL1 (40):** An initial stop-loss level, activated when the price moves 40% of the way toward your total loss target.
*   **SL_LEVEL2 (80):** A final stop-loss level, activated when the price moves 80% of the way toward your total loss target.

The class doesn't require any setup – you simply use these constants directly within your trading strategy.

## Class ConfigValidationService

The ConfigValidationService is designed to keep your backtest configurations mathematically sound and profitable. It acts as a safety net, preventing common errors that can lead to unrealistic or losing strategies.

The service checks several aspects of your configuration. It makes sure your slippage and fees aren't set so high that your trades can never be profitable, even when a TakeProfit order is filled.  It also verifies that percentage-based settings are non-negative, and that time and count values are positive integers. Think of it as ensuring your settings make logical sense from a trading perspective.

It validates the GLOBAL_CONFIG parameters to prevent unprofitable strategies. 

This service includes a `validate` function to perform the comprehensive checks.


## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It's designed to catch errors early by checking how your column definitions align with the expected structure.

It confirms that essential properties like 'key', 'label', 'format', and 'isVisible' are included in each column. 
The service also ensures that the 'key' and 'label' values are actually text strings and that 'format' and 'isVisible' are functions – not something else. 

Finally, it verifies that each 'key' is unique, preventing potential conflicts or issues further down the line. Think of it as a quality control step for your column definitions.


## Class ClientSweep

The ClientSweep helps you find the best settings (parameters) for your trading strategies without having to run a full backtest for every possible combination. It's designed to quickly test many trading "ideas" against a range of market conditions.

It works by simulating how these ideas would perform, looking at things like how much profit they might make, how risky they are, and how frequently they succeed. It carefully grades each idea individually, ignoring things like how well other people's strategies are doing. 

Here's how it breaks down:

*   **Idea Testing:** Each idea is quickly run forward through a limited time period, creating a "profile" of its performance.
*   **Author Blacklisting:**  It automatically identifies and excludes authors whose ideas consistently perform poorly.  You can use this list directly in your live trading.
*   **Realistic Simulations:**  The simulations follow strict rules, like entering trades at the beginning of the next minute and exiting based on how the price moves within a candle. Fees and slippage are also factored in.
*   **Ranking:** It ranks the best strategies based on metrics like Sharpe ratio (risk-adjusted return), Sortino ratio, and overall profit.

The ClientSweep provides updates as it works through each step of the process, and importantly, it *doesn’t* replace a full backtest. It helps you narrow down good candidates, which you should then fully test before using them to trade.

To use it, you give it a list of trading ideas, and it returns a result showing the top performing strategies and the author ban list. Remember, it operates independently each time you run it.

## Class ClientSizing

ClientSizing helps figure out how much of an asset to trade based on different strategies. It allows you to choose how you want to size your positions—whether it's a fixed percentage, using the Kelly Criterion, or considering the Average True Range (ATR). 

You can also set limits on the minimum or maximum position size, and a cap on the overall percentage of your capital that's used. 

The `calculate` method is the core—it takes information about the trade and returns the calculated position size. Essentially, it's the engine that drives your position sizing decisions.

## Class ClientRisk

This component handles risk management for your trading portfolio, ensuring signals don't exceed predefined limits. It's designed to work across multiple trading strategies, allowing for a holistic view of risk.

The core idea is to prevent signals that could violate limits like the maximum number of concurrent positions, or custom validation rules you define.

Here’s how it works:

*   **Shared Risk Management:** Multiple strategies use the same risk management instance, which is crucial for avoiding conflicts and maintaining overall portfolio health.
*   **Real-Time Validation:** Before a trading strategy can open a new position, this component checks if it's allowed based on the configured risk limits.
*   **Atomic Signal Handling (checkSignalAndReserve):** A special function reserves a placeholder in the active positions map to prevent other strategies from bypassing limits while a signal is being processed. This ensures that everyone sees the same, up-to-date view of active positions. *Important:* You **must** follow up with either `addSignal` (to finalize the position) or `removeSignal` (to cancel) after using `checkSignalAndReserve`.
*   **Persistence:** Active positions are saved and loaded, though this feature is skipped in backtesting environments.

The component offers the following methods:

*   `addSignal`:  Informs the system about a newly opened position.
*   `removeSignal`: Notifies the system when a position has been closed.
*   `checkSignal`: Validates if a signal adheres to all defined risk rules.

## Class ClientFrame

The ClientFrame helps create timelines for backtesting trading strategies. It essentially builds arrays of timestamps that represent the historical periods you want to test. To avoid unnecessary repetition, it caches the generated timelines.

You can customize how spaced out these timestamps are, from one-minute intervals to one-day intervals.  It also allows for callbacks so you can verify and log information as the timelines are built. 

The `getTimeframe` method is the key function here; it's how you request a timeframe array for a specific trading symbol and results are cached to optimize performance. This frame is used internally by the backtest engine to step through historical data.

## Class ClientExchange

This class, `ClientExchange`, is your go-to for getting data from an exchange within the backtest-kit framework. Think of it as a bridge connecting your trading logic to the historical market data.

It offers several useful functions: retrieving historical and future candles (essential for backtesting), calculating the VWAP (a volume-weighted average price which helps understand market trends), and formatting quantities and prices to match specific exchange requirements.  You can fetch candles moving backwards from a certain point in time or look ahead to get data needed for your signal generation.

The framework is designed to be efficient, using techniques to minimize memory usage.  It handles date alignment and validations carefully to prevent 'look-ahead bias', ensuring a fair test of your trading strategies.  You can also grab order book data and aggregated trades, helping you understand order flow and trading activity.  The system makes it easy to adjust the amount of data fetched, with options for specifying start and end dates and limits.

## Class ClientAction

The `ClientAction` component is a central piece for managing and executing custom logic within your trading strategies. Think of it as a conductor, orchestrating different parts of your strategy's behavior. It handles the lifecycle of your action handlers – the code that does things like managing your trading state, logging events, sending notifications, or collecting data. 

It initializes and manages your handler instance, ensuring it’s created and cleaned up properly.  It then routes specific events, such as signals from live or backtest modes, breakeven or profit/loss levels, and scheduled events, to the appropriate methods within your handler.

You can manually connect your own logic to these events via what's called "manual wiring," using the `addActionSchema` method.  This allows you to customize how your strategy responds to different situations. 

There are also methods for handling active and idle signal monitoring, risk rejections, order synchronization, and order checks.  Importantly, some of these methods don't include error handling, meaning any errors will be passed up to specific functions during the creation process. Finally, the `dispose` method ensures a clean shutdown, preventing lingering issues when your strategy is done.

## Class CacheUtils

CacheUtils helps you store the results of your functions, so you don't have to recalculate them every time, especially when dealing with data that changes based on time periods. It’s designed to make caching simpler and more efficient within the backtest-kit framework.

Think of it as a way to memoize functions—a technical term for remembering function results.

You'll primarily use the `fn` method to cache regular functions. You tell it the function to cache and the timeframe (like a candle interval) to use for invalidating the cache. This means if the data used by the function changes within that timeframe, the cache will refresh.

For functions that return a lot of data, or when dealing with persistent storage, `file` is the way to go. It caches the results in files on your hard drive, reading from the file if the data is available and writing to it if it’s not. This is especially useful for long-running calculations.

If you need to completely start over with the cached data, you can `clear` everything. There's also `dispose` to remove a specific function's cache, or `resetCounter` to restart file-based caching indices from zero, important when your working directory changes.

## Class BrokerBase

This class serves as a base for creating custom integrations with different exchanges or brokers within the backtest-kit framework. It provides pre-built functionality for managing trades, but you'll need to extend it to connect to a specific exchange.

Think of it as a template for interacting with a real exchange. It handles things like placing orders, canceling them, updating stop-loss and take-profit levels, and keeping track of positions. It also has built-in logging to help you monitor what's happening.

Here's a breakdown:

**Initialization:**

*   **`waitForInit()`:** This is your starting point for setting up your connection to the exchange (logging in, authenticating). You can run any setup code here, including dealing with potential errors or re-trying connections. It's a key place to handle initial reconciliation—ensuring your exchange state matches the backtest kit's understanding.

**Trade Lifecycle Events:**

The class provides several "commit" methods that get called during the trading process. These functions are like hooks that you can customize to perform actions on the actual exchange.

*   **`onOrderOpenCommit()`:**  Used for placing entry orders. This is where you tell the exchange to buy or sell.
*   **`onOrderCloseCommit()`:**  Handles closing positions, whether it's due to hitting a stop-loss or take-profit, or a manual closing action.
*   **`onPartialProfitCommit()` & `onPartialLossCommit()`:**  Handle partial closing of positions, usually to lock in some profit or cut losses.
*   **`onTrailingStopCommit()`, `onTrailingTakeCommit()`:** Update trailing stop-loss and take-profit orders.
*   **`onBreakevenCommit()`:** Moves the stop-loss to the entry price.
*   **`onAverageBuyCommit()`:**  Places a DCA (Dollar Cost Averaging) order.

**Other Important Methods:**

*   **`onOrderActiveCheck()`:** Checks if an order placed earlier is still active on the exchange. Important for ensuring orders haven't been filled or cancelled unexpectedly.
*   **`onOrderScheduleCheck()`:** Similar to `onOrderActiveCheck()`, but used for checking the status of resting orders.
*   **`onSignalActivePing()`:** Provides a way to get updates from the exchange about the status of an open position.
*   **`onSignalSchedulePing()`:**  Provides a way to monitor resting orders.
*   **`onSignalIdlePing()`:** Provides an informational call when the strategy is idle.



The base class aims to simplify the process of building exchange integrations by providing a standardized framework and handling common tasks. You only need to focus on the exchange-specific logic within the provided methods.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker. It's like a gatekeeper that intercepts order-related actions before they're sent to the broker, allowing for controlled execution and safety.

In testing mode, these actions are skipped entirely. However, in live trading, they are passed on to a registered broker adapter.

The adapter automatically handles signals like order openings and closures, as well as periodic pings to check order status. These signals are routed through subscriptions that you activate.

Specific functions like `commitPartialProfit` and `commitTrailingStop` let you intercept and validate certain actions *before* they modify the core strategy data. If these functions throw an error, the change is cancelled.

You register a broker adapter using `useBrokerAdapter` before enabling the adapter with `enable`. `enable` sets up the automatic signal routing, and `disable` cleans up. The `clear` function resets the cached broker, useful when you need to re-initialize it, for example, when your working directory changes. It's designed to keep things safe and manageable when interacting with live trading environments.

## Class BreakevenUtils

This class provides tools for examining breakeven protection events, giving you insights into how your strategies are performing. It acts as a central point for accessing and displaying breakeven data collected by another service.

You can use it to get aggregated statistical data about your breakeven events, like the total number of times they’ve occurred. 

It also allows you to generate detailed markdown reports that present your breakeven events in a structured table, including information like the symbol, strategy used, entry price, and breakeven price.  These reports include a summary of key statistics.

Finally, you can easily save these reports to files, automatically creating the necessary directories and naming the files based on the symbol and strategy. It handles the file creation and saving for you, making it easy to keep track of your breakeven performance over time.


## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. 

It listens for these "breakeven" events and records them, along with all the details of the signal that triggered them. This allows you to analyze and monitor your trading performance.

The service uses a database to store these events persistently, ensuring you don't lose valuable information. To use it, you subscribe to a signal emitter, and when the service detects a breakeven, it logs it. 

You can stop listening at any time by using the unsubscribe function. To prevent issues, it makes sure you only subscribe once.

## Class BreakevenMarkdownService

This service is designed to automatically create and save reports detailing breakeven events—times when a trade reached a point of no loss. It listens for these events, organizes them by the symbol and strategy used, and compiles them into easy-to-read markdown tables. 

The service keeps track of statistics like the total number of breakeven events. Reports are saved as markdown files, making them simple to view and share.

You can subscribe to receive these breakeven signals, and you can also unsubscribe when you no longer need them.  The service provides methods to retrieve summarized data, generate the markdown reports, and save them to disk.  If you want to clear out the accumulated data, there's a clear function for that, allowing you to clear either specific or all recorded events. A specialized storage system ensures that data for each symbol, strategy, exchange, frame and backtest combination is kept separate and organized.

## Class BreakevenGlobalService

This service, called BreakevenGlobalService, acts as a central point for managing breakeven calculations within your trading system. It's designed to be injected into your trading strategies, providing a single place to handle these calculations and ensure everything is logged properly.

Think of it as a middleman: it receives requests related to breakeven calculations and passes them on to a more specialized service (BreakevenConnectionService) while keeping a record of everything happening. This makes it easier to monitor and troubleshoot breakeven-related issues.

The service relies on several other components, like validation services and a logger, which are provided by your system's dependency injection container. These components help ensure that the data it's working with is valid and that all operations are tracked. 

Specifically, it offers functions to:

*   Validate a strategy's configuration.
*   Determine if a breakeven event should occur.
*   Clear a breakeven calculation when a trade is closed.

Each of these actions is logged, providing a comprehensive audit trail of all breakeven operations.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and provides breakeven calculations for trading signals. It's like a central hub that creates and keeps track of specialized calculators (ClientBreakeven instances) for each unique signal.

These calculators are created only once and shared, saving resources – that's thanks to memoization. They are pre-configured with logging and notification settings.

The service handles requests to check if a breakeven condition is met or to clear a breakeven calculation when a signal is closed. It delegates these tasks to the specific calculator responsible for that signal.

Think of it as a smart factory for breakeven calculations, ensuring they are created efficiently, managed properly, and cleaned up when no longer needed. The service operates behind the scenes, integrated with other key components through dependency injection and emits events to signal changes.

## Class BacktestUtils

The `BacktestUtils` class provides tools to run and analyze backtests within the trading framework. It acts as a central point for managing and simplifying backtest operations.

It offers several methods for running backtests: `run` executes a full backtest, yielding results; `background` runs a backtest in the background without interrupting the main process; and it handles context propagation to ensure backtests are executed within the correct environment.

You can retrieve information about pending and scheduled signals with methods like `getPendingSignal`, `getScheduledSignal`, `hasNoPendingSignal`, and `hasNoScheduledSignal`.  These are useful for checking the status of signals and controlling signal generation logic.

Several utility functions give you access to position-specific data, such as `getTotalPercentClosed`, `getTotalCostClosed`, `getEffectivePrice`, `getPositionInvestedCount`, and `getPositionPnlPercent`.

The class also contains functions for managing and adjusting active positions, including `commitCancelScheduled` and `commitClosePending`. There are methods for modifying positions like `commitPartialProfit`, `commitPartialLoss`, and `commitTrailingStop`.

The `getReport` and `dump` methods simplify generating and saving backtest reports. Functions like `getPositionHighestProfitDistancePnlPercentage` and `getBreakeven` allow more detailed analysis of past trades.

## Class BacktestReportService

The BacktestReportService is designed to meticulously record what’s happening during your backtesting. It acts like a detailed observer, catching every significant event of your trading signals—when they're idle, when they open, when they're active, and when they close.

Think of it as a way to keep a very precise log of your backtest, complete with all the signal details. It does this by listening for signal events and storing them in a database. 

You can easily start and stop this logging process; subscribing connects it to the backtest, and unsubscribing cuts off the connection. It’s also built to prevent accidental duplicate subscriptions, ensuring accurate and clean data capture. The service uses a logger to provide debugging output too.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create detailed reports about your trading strategies' performance during backtesting. It works by listening to market data (tick events) and keeping track of when trades are closed.

This service automatically organizes closed trade information and uses a clever storage system that isolates data for each symbol, strategy, exchange, and timeframe. It then uses this data to generate formatted markdown reports, which are saved as files for review.

You can retrieve statistics, generate reports, and save them directly to disk. There's also a way to clear out the accumulated data if needed, either for everything or just specific combinations of symbol, strategy, and timeframe.

To get started with reports, you'll subscribe to market data events, and when you're done, you can unsubscribe. This ensures that the service is only actively processing data when it needs to.

## Class BacktestLogicPublicService

This service manages the overall backtesting process, making it easier to work with. It combines a private backtest logic service with context management, so you don’t have to constantly pass around information like strategy names and exchange details.

The service leverages a logger for logging and handles the underlying backtest logic, time management, frame schema, and connection to the exchange.

The core functionality is the `run` method, which executes the backtest for a given symbol. During the test, it provides a stream of results (like signals and trades) automatically incorporating the necessary context. Think of it as a simplified way to launch and observe a backtest.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is designed to efficiently run backtests using an asynchronous generator approach. It works by first retrieving the necessary timeframes, then processing each one. When a trading signal appears, it fetches the required candle data and executes the backtest logic. The process intelligently skips timeframes until a trade closes, then delivers the results as they become available.

This approach is memory-friendly because it streams the results instead of building up a large array, which can be particularly helpful for long backtests. You can even stop the backtest early if needed using a `break` statement.

The service relies on several core services, including those for managing strategy execution, exchange interactions, timeframe data, actions, time metadata, and price data.  The `run` method is the main entry point, taking a symbol as input and producing a stream of results, including closed, opened, cancelled, and scheduled ticks.

## Class BacktestCommandService

The BacktestCommandService acts as a central point for running backtests within the system. It simplifies accessing backtesting capabilities by wrapping the more complex BacktestLogicPublicService.

It handles validation of your trading strategies and related risk settings, remembering previous validations to speed things up if you’re testing the same strategy repeatedly.

You can use it to actually execute a backtest for a specific trading symbol, providing information about the strategy, exchange, and frame being used during the test. This will generate a series of results detailing how the strategy would have performed, including potential buy, sell, and cancel events.


## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers, ensuring they're available when needed and preventing errors. Think of it as a central manager for your action handler configurations. 

You can add new action handlers using the `addAction` method, effectively registering them with the service. Before attempting to use an action handler, the `validate` method confirms it exists, providing an extra layer of safety. To improve performance, the validation results are cached, so repeated checks for the same handler are much faster. 

If you need to see all the action handlers you've registered, the `list` method provides a convenient way to get a comprehensive overview. It's designed to simplify action handler management and improve the reliability of your application.

## Class ActionSchemaService

The ActionSchemaService is like a librarian for your trading actions – it keeps track of them, makes sure they're set up correctly, and provides them when needed. It uses a special system to safely store these action blueprints and ensures that any code associated with those actions only uses approved methods.

You can register new actions with the service, and it will check that everything is in order before adding them to its collection. If you try to register an action with a name that already exists, it will let you know.

The service also allows you to make small changes to existing action blueprints without having to recreate them entirely – think of it as updating a record in the library instead of replacing the whole book.

You can retrieve a specific action's blueprint by name, and the service also handles some internal validation to make sure everything aligns with your defined rules. The underlying registration is type-safe and allows for private methods within your action handlers, which helps with code organization.

## Class ActionProxy

The `ActionProxy` acts like a safety net around your custom action handlers. Think of it as a way to make sure your trading logic doesn't crash the entire system if something goes wrong within that logic. It handles events like signal generation, profit/loss taking, and scheduled tasks.

Essentially, whenever a method related to your custom logic is called (like `signal()` or `dispose()`), `ActionProxy` wraps it in a protective layer. If an error occurs – for example, a typo in your code – the error gets logged, and a notification gets sent out, but the system keeps running. This prevents unexpected shutdowns and makes debugging much easier.

It’s important to note that not all methods are wrapped; some critical functions like `orderSync` and `orderCheck` intentionally throw errors directly to ensure immediate failure when those key operations fail.

`ActionProxy` is created using a factory method `fromInstance`, which allows you to provide your custom action handler to be wrapped and protected. This makes sure that all the important lifecycle events related to trading strategy are safely handled and the overall process remains stable.

## Class ActionCoreService

The `ActionCoreService` is a central component responsible for managing how actions are handled within a trading strategy. It's like a dispatcher, taking actions defined in your strategy's setup and making sure they get executed in the right order.

Here's a breakdown of what it does:

*   **Centralized Action Management:** It fetches a list of actions from the strategy's definition and then sequentially executes handlers for each one.
*   **Validation:** Before anything happens, it validates the strategy context – checking things like whether the strategy name, exchange, and frame are valid. It also validates risks and actions defined within the strategy.
*   **Initialization:** It sets up each action instance, potentially loading any saved state.
*   **Signal Routing:**  It directs signal events (like market data updates) to the appropriate actions, distinguishing between backtesting, live trading, and specific event types like breakeven, partial profit, scheduled pings, and more.
*   **Lifecycle Event Handling:** It manages lifecycle events of signals, such as creation, cancellation, opening, and closing, triggering actions accordingly.
*   **Order Synchronization & Checks:** Handles synchronization and checks related to order management, ensuring proper coordination across actions.
*   **Resource Cleanup:**  Provides a mechanism to clean up resources and data when a strategy is finished.

Essentially, this service ensures that your strategy’s actions are performed correctly and in a consistent manner, managing the flow of information between different parts of the system.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions within your trading system. It ensures that requests for specific actions are routed to the correct implementation.

Think of it like a post office – you give it a "actionName," and it makes sure it gets delivered to the right place.

To optimize performance, it uses memoization, which means it remembers previously created action instances and reuses them whenever possible. This avoids unnecessary re-creation of actions for each request.

It also handles various lifecycle events for actions, like initialization, signaling, and disposal, making sure everything gets handled correctly for different scenarios (like backtesting or live trading).  The `getAction` method is key as it's how the service locates and provides the appropriate `ClientAction` instance, using caching to be efficient. Other methods handle specific events like breakeven alerts, scheduled pings, and order synchronization, each routing these events to the correct action handler. Finally, the `clear` method allows you to manually clear out cached action instances when needed.

## Class ActionBase

This base class, `ActionBase`, is designed to simplify creating custom handlers for your trading strategy. Think of it as a starting point for actions like sending notifications, logging events, or interacting with external systems. It provides default logging functionality and automatically tracks information about the strategy, frame, and action.

To use it, simply extend `ActionBase` and override the specific methods you need, like `signal` (for handling market ticks), `breakevenAvailable` (when a stop-loss reaches the entry price), or `dispose` (for cleaning up resources).  You don't need to implement the methods you don't need because they already have sensible default behavior.

Here's a breakdown of what the lifecycle looks like:

1. When created, the class receives information about the strategy, frame, and action name.
2. The `init` method allows you to perform any necessary setup, like connecting to databases.
3. Then, various event methods (signal, breakeven, etc.) are triggered as the strategy runs.  `signal` handles general ticks, `signalLive` focuses on live trading, and `signalBacktest` is specific to backtesting.
4. Finally, the `dispose` method ensures a clean exit and allows you to release any resources.

The framework provides methods to handle a range of events including profit milestones (`partialProfitAvailable`), loss milestones (`partialLossAvailable`),  monitoring signals awaiting activation (`pingScheduled`), and risk rejection (`riskRejection`). You can also subscribe to events related to an idle strategy (`pingIdle`).  If you need to implement custom logic that depends on a real-time connection, you would override the `signalLive` method.
