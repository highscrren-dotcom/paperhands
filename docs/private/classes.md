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

The WalkerValidationService helps you keep track of and confirm the settings for your parameter sweeps, which are used to optimize strategies and hyperparameters. It acts as a central place to register these sweeps, ensuring they exist before you try to use them. 

This service is designed to be efficient – once a sweep is checked, the result is saved to avoid repetitive validations.

Here's what you can do with it:

*   **Register Sweeps:** Add new sweep configurations using `addWalker()`.
*   **Verify Sweeps:** Make sure a sweep exists and its related strategies are also valid with `validate()`. This process also checks the strategies' risks and actions.
*   **View Registered Sweeps:** Get a list of all the sweeps that have been registered using `list()`.

The service relies on other components, like the logger and schema services, to handle specific tasks related to logging, schema definitions, and validating strategies. It internally uses a map to store the registered sweeps.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, providing a central place to manage and interact with them. It acts like a helper, handling the details of running walkers and giving you easy access to their results.

Think of it as a single point of contact – you don’t need to worry about the underlying complexities of running walkers; just ask WalkerUtils to do it for you.

You can use it to start walker comparisons, run them in the background for things like logging, or stop them when needed.

It can also gather all the results from your walker's strategies and create reports, either as text you can view or files you can save.

Finally, it provides a way to see all the walkers currently running and their status. WalkerUtils manages its own internal instances for each walker and symbol combination, ensuring they operate independently.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your walker schemas in a safe and organized way. 

It’s like a central place to store and manage different schema definitions. 

You can register new schemas using `addWalker()`, and then easily find them later by their names. 

Before adding a new schema, the system checks to make sure it has the essential parts and types, preventing potential errors down the line. 

If you need to make small changes to an existing schema, the `override()` method lets you update just the parts you need, leaving the rest untouched. 

Finally, the `get()` method provides a simple way to retrieve a schema by its name when you need to use it.

## Class WalkerReportService

The WalkerReportService helps you keep a detailed record of your trading strategy optimization process. It essentially listens for updates as your strategies are tested and automatically saves the results—including important metrics and statistics—to a SQLite database. 

This allows you to track how your strategies are improving over time and easily compare their performance.

You can easily sign up to receive these updates, and there's a way to stop listening when you're finished. The service also helps prevent you from accidentally subscribing multiple times, which could cause issues. It uses a logger to provide helpful debug information during the process.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save reports about your trading strategies. It listens for updates from your trading simulations (walkers) and carefully collects the results for each strategy. 

It uses a clever system to remember and organize this data, ensuring each walker has its own dedicated storage. 

The service then turns these results into easy-to-read markdown tables, allowing for clear comparisons between strategies. Finally, it saves these reports as files, making it simple to review your performance.

You can subscribe to receive these updates, and unsubscribe when you no longer need them.

Here's a breakdown of what you can do with it:

*   **Get Data:** Retrieve specific results for a given strategy, symbol, and metric.
*   **Generate Reports:** Create complete markdown reports showcasing all strategy performance.
*   **Save Reports:** Automatically save these reports to disk, organized by walker name.
*   **Clear Data:**  Clear all accumulated results or just the data for a specific walker.

## Class WalkerLogicPublicService

This service helps manage and run trading strategies, also known as walkers, by automatically handling essential details like the strategy's name, the exchange being used, and the timeframe of the data. It builds on a private service to simplify how you execute these strategies. 

Think of it as a coordinator—you tell it which trading symbol you want to analyze, and it figures out the rest.

The `run` function is the core of this service; it's what initiates the backtesting process, allowing you to compare how different strategies would have performed. It provides a series of results from the execution. 

It has properties to access logging, the underlying private logic, and schema information.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies, essentially orchestrating a series of backtests. It keeps you informed about the progress of each strategy as it runs, showing you updates in real-time.

As each strategy finishes, you'll receive a snapshot of its performance. The service also keeps track of the best-performing metric throughout the process.

Finally, you'll get a complete report, ranking all the strategies you tested against each other.  It leverages other services like BacktestLogicPublicService to actually perform the backtests.

The `run` method is the main entry point, taking the symbol to backtest, an array of strategies, a metric to optimize for, and some context information. You’ll receive a sequence of `WalkerContract` objects representing the result of each strategy’s execution.

## Class WalkerCommandService

WalkerCommandService acts as a central point for accessing and managing walker functionality within the system. It's essentially a bridge, providing a simplified way to interact with the core walker logic and its related services, making it easier to integrate into your applications.

This service manages several underlying components, including services for handling walker logic, schemas, validations for strategies, exchanges, frames, walkers, strategies, risks, actions, and even a comprehensive validation process.

The `validate` function ensures your walker and strategy configurations are correct and prevents unnecessary repeat checks through memoization.

The `run` function lets you initiate a comparison of walker data for a specific symbol, providing important context information like the walker, exchange, and frame names to guide the process.

## Class TimeMetaService

The TimeMetaService helps you keep track of the most recent candle timestamp for each trading setup you're using, considering the symbol, strategy, exchange, and frame. It acts like a central record, ensuring you always have the current candle time available, even when you're not actively executing trades.

Think of it as a way to reliably get the current time for commands or actions that happen *between* trading ticks.

It essentially maintains a stored record for each unique combination of symbol, strategy, exchange, and frame. If the timestamp is already known, you get it immediately. If not, it will wait briefly – up to a defined timeout – for the first timestamp to arrive.

To manage its memory, the service can be cleared, which removes all stored timestamps or only the ones for specific setups, ensuring you’re always working with fresh data. This clearing should happen when a strategy begins, to prevent any outdated information. The service is automatically updated by the system as ticks are processed.

## Class SystemUtils

The `SystemUtils` class helps keep your backtest simulations separate and clean. It’s like having a way to temporarily pause the communication network between different test runs, preventing one test from accidentally affecting another.

It offers a handy tool, `createSnapshot`, that essentially takes a picture of the current state of how different parts of your system are listening for events. This allows you to run a backtest in isolation, and then later, restore everything to how it was before. Think of it as a quick way to temporarily disconnect and reconnect event listeners to maintain a controlled testing environment.


## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals by providing data and reports about their lifecycle. It gathers information about when signals are opened and closed, keeping track of things like the total number of signals, how many were opened, and how many were closed.

You can use it to get a summary of the statistical data for a specific symbol and trading strategy. 

It also allows you to generate nicely formatted markdown reports that show a detailed history of your signal events, including things like signal IDs, actions taken (opening or closing signals), entry and exit prices, profit/loss percentages, and more.

Finally, you can easily save these reports to files so you can review them later. The reports are named with details like the symbol, strategy, and whether it was a backtest or live trade.

## Class SyncReportService

The SyncReportService is designed to keep a record of what's happening with your trading signals. It listens for events related to signals being opened (like when a limit order is filled) and signals being closed (when a position is exited).

Think of it as an auditor, noting down key moments in the signal lifecycle. 

It captures details like the complete signal information when a signal is opened and profit/loss (PNL) and the reason for closing when a signal is closed.

The service then saves these details to a report, making it easy to trace decisions and audit trading activity. It prevents accidental double-logging as well.

You can tell the service to start watching for these events with `subscribe` and stop with `unsubscribe`.

## Class SyncMarkdownService

This service is responsible for creating and saving reports detailing signal synchronization events – essentially, the lifecycle of orders within a trading system. It listens for signal open and close events, keeps track of all the details for each event (like the symbol, strategy, exchange, and timeframe), and then organizes this information into easy-to-read markdown tables.

You can subscribe to receive these synchronization events, but it's designed to prevent accidental duplicate subscriptions. If you try to subscribe multiple times, you’ll get the same unsubscribe function each time.

To stop receiving events and clear all collected data, you need to use the unsubscribe function that’s returned when you subscribe.

Every time a signal open or close event happens, the `tick` function processes it, adding a timestamp and recording whether it was an opening or closing signal. This information gets stored in a specific "bucket" based on the symbol, strategy, exchange, and timeframe.

You can request statistics or the full report for a specific combination of symbol, strategy, exchange, and timeframe. The reports will show all the synchronization events in a table format, along with summary statistics like the total number of events, opens, and closes.

The `dump` function lets you save these reports directly to disk, creating files named in a specific format that includes the symbol, strategy, exchange, timeframe, and a timestamp.

Finally, the `clear` function allows you to wipe out all the collected data, either for a specific combination of parameters (symbol, strategy, etc.) or for everything at once.

## Class SweepValidationService

This service keeps tabs on all your registered sweeps, ensuring they're valid whenever they're used. Think of it as a safety net for your trading strategies.

It verifies that a sweep exists and that the exchange it relies on is also set up correctly. 

Importantly, you can’t register the same sweep name twice – it prevents accidental overwrites.

Here's what you can do with it:

*   **Register Sweeps:** Add new sweeps so the service knows about them and can validate them later.
*   **Validate Sweeps:** Check if a sweep is properly registered and its exchange is valid; this only happens once per sweep name.
*   **List Sweeps:** Get a complete list of all the sweeps currently being tracked.

The service also relies on other components like a logger and exchange validation service to function correctly.

## Class SweepUtils

The SweepUtils framework helps you systematically test and evaluate many trading ideas simultaneously. Think of it as a way to run a large number of "what if" scenarios on your trading strategies.

It profiles each trading idea using a single candle’s worth of data and then mathematically evaluates them based on several key performance indicators like Sharpe Ratio, Sortino Ratio, profit, and recovery rate. For each of these indicators, it identifies the top four performing ideas, each with its own specific rule set. Detailed reports are generated, breaking down the performance of each trade.

Several parameters control how these tests are conducted. These include settings for exit strategies like hard stops, trailing stops, and profit locks, as well as a time limit for how long a trade can be held. Crucially, every idea gets a chance to be tested – there’s no automatic filtering of ideas based on perceived quality.

The framework assesses the performance of each author’s idea based on whether it achieved a profit before a stop-loss, using the chronological order of trades. It produces detailed performance tracks for each rule, but doesn't provide a way to weigh the trustworthiness of the authors. The order of how results are presented is controlled by a setting, but does not impact the ultimate results.

The core functionality lies in the `run` method. This method takes a set of trading ideas and runs the entire simulation process, which includes profiling, filtering, grid evaluation, and ranking. Before the calculations begin, some data cleanup occurs—ideas for other symbols are ignored, as are neutral or duplicate ideas.  Ideas located at the edge of the data may be truncated or entirely ignored. The framework merges specified parameters with default values when determining a grid of possible trading setups. The final results are validated using a walk-forward test and a real-world backtest.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage definitions for sweeps, which are essentially configurations for how data is processed. 

It keeps track of these sweep definitions, associating each with a unique name. When a new sweep definition is added or an existing one is updated, a quick check ensures it has the basic required information. 

The system uses this registry to create and use sweep instances.

The service has a logger for debugging, a registry to hold the sweep schemas, and a validation function for initial checks. 

You can register new sweep schemas with names, override existing ones with partial updates, and retrieve registered schemas by their names.

## Class SweepGlobalService

SweepGlobalService acts as the central access point for working with sweep data. It checks to ensure the sweep exists and is compatible with the exchange before passing requests along. Think of it as the first line of defense, ensuring everything is set up correctly before the actual work begins.

It manages connections and keeps track of data to make things efficient.

The core functionality is the `run` method. This function takes information about a symbol, a sweep name, and a list of ideas and then carries out a complete simulation process including profiling, filtering, grid evaluation, and rankings. This is how you initiate a full sweep analysis.


## Class SweepCoreService

The SweepCoreService acts as the central engine for running sweep simulations. It ensures everything is set up correctly before actually executing the simulation.

It checks that the sweep configuration is valid and then passes the work along to the connection layer which handles the specific details of the sweep process.

Think of it as a quality control checkpoint and coordinator between the initial request and the actual execution of the simulation.

**Here's a breakdown of its key parts:**

*   It relies on other services like `sweepConnectionService` and `sweepValidationService` to do its job.
*   The `run` method is how you kick off a sweep simulation. You provide the symbol, sweep name, and a set of ideas to be tested, and it returns the simulation results.
*   This method performs a series of checks and evaluations: it considers pre-defined profiles, filters ideas based on author, assesses grid evaluations, and finally generates rankings.

## Class SweepConnectionService

This service manages the connections and lifecycle of sweep operations within the system. It handles creating and caching client instances for each sweep, making it efficient to run multiple sweeps with different configurations.

When you need to execute a sweep, it fetches the appropriate client, ensuring defaults are applied if necessary. This client is memoized, meaning it's only created once per sweep name, improving performance.

The `run` method allows you to perform a complete sweep simulation, covering profiling, filtering, grid evaluation, and ranking, using a single, pre-configured client.

If you need to refresh your sweep configurations, you can clear the memoized clients, forcing the system to reload schemas and rebuild them. This is helpful for applying schema changes or debugging.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central hub, allowing you to register new strategies and then quickly check if they exist and if their related elements – like risk profiles and actions – are also valid. To speed things up, it remembers the results of past validations, so you don't have to repeat checks unnecessarily.

You can add strategies to the service using `addStrategy`, which takes the strategy's name and a description of its structure.  `validate` lets you confirm a strategy's existence and its associated elements.  If you need to see all the strategies you've registered, `list` provides a handy list of all strategy schemas. The service also relies on other services like `loggerService`, `riskValidationService`, and `actionValidationService` for its core functionalities.

## Class StrategyUtils

This class helps you analyze and understand how your trading strategies are performing. It acts as a central place to gather and present data about strategy events, like when a strategy cancels a scheduled order or takes a profit. 

You can request detailed statistics summarizing event counts for each strategy and symbol. It can also create easy-to-read markdown reports, essentially tables, that show all the events that occurred for a particular strategy, including details like the action taken, price, percentages, and timestamps. 

Finally, it allows you to save those reports directly to a file on your computer for later review and sharing, organizing them by symbol, strategy name, exchange, and timeframe. It handles creating the necessary file directories and ensures the file is saved in a readable format.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategies and their configurations in a structured and reliable way. It acts as a central place to store and manage the blueprints for your strategies. 

You can add new strategies using the `addStrategy` method, effectively registering their design. When you need to use a specific strategy, you can easily retrieve it by its name using the `get` method.

Before a strategy is officially registered, it's checked to make sure it has all the necessary components and that they are of the expected types using `validateShallow`. If a strategy already exists, you can update it with new information using `override`, which lets you modify only the parts you want to change.

The service relies on a type-safe storage system, and it also provides logging capabilities to help you understand what’s happening behind the scenes.


## Class StrategyReportService

This service helps you keep a detailed audit trail of your strategy's actions by writing each event to a separate JSON file. Think of it as a persistent logbook for your trading strategy.

To start using it, you need to "subscribe" to begin logging, and then "unsubscribe" when you're done.  It's different from creating a markdown report, because it saves events immediately rather than accumulating them in memory.

The service provides several methods for recording specific events:

*   `cancelScheduled`: Records when a scheduled signal is canceled.
*   `closePending`: Records when a pending signal is closed.
*   `partialProfit`: Records when a portion of your position is closed for profit.
*   `partialLoss`: Records when a portion of your position is closed at a loss.
*   `trailingStop`: Records adjustments to the trailing stop-loss.
*   `trailingTake`: Records adjustments to the trailing take-profit.
*   `breakeven`: Records when the stop-loss is moved to the entry price (breakeven).
*   `activateScheduled`: Records when a scheduled signal is activated before its intended time.
*   `averageBuy`: Records instances where you're adding more entries to an open position (often used in a Dollar-Cost Averaging strategy).

Each of these methods receives detailed information about the event, like the symbol traded, the context (strategy and exchange names), the timestamp, and profit/loss data.  This data is then written to a JSON file for later analysis and review. The `loggerService` property allows you to customize the logging environment.

## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's actions during backtesting or live trading. It's like a detailed logbook for your strategy, capturing events like cancellations, closures, and adjustments to profit and loss targets.

Instead of writing each event to a file immediately, it temporarily stores them in memory – up to 250 events per symbol and strategy. This allows for creating more efficient, batch reports.

Here's how you use it:

1.  **Start Collecting:**  Use `subscribe()` to enable event tracking.
2.  **Automatic Recording:**  As your strategy executes (buying, selling, modifying orders), the service automatically records these actions. It handles events like canceling orders, closing positions, taking partial profits or losses, and adjusting stop-loss or take-profit levels.
3.  **Get Information:** You can then retrieve this information by calling `getData()` to get raw statistics or `getReport()` to generate a nicely formatted markdown report.  `dump()` saves that report as a file.
4.  **Stop Collecting:**  When you're finished, `unsubscribe()` stops the event collection and clears the stored data.

The `getStorage` property controls how those event storage locations are created, ensuring each unique combination of symbol, strategy, exchange, frame, and backtest setting gets its own dedicated storage.

The service also offers methods like `averageBuy` to record actions related to dollar-cost averaging. `activateScheduled` helps log situations where a scheduled order is triggered earlier than planned.


## Class StrategyCoreService

This service acts as a central hub for strategy operations, handling everything from validation to retrieving position details. It's designed to be used internally by other key services, ensuring consistent execution across backtesting and live trading environments.

The service manages aspects like signal retrieval, position accounting (cost, PnL, entry points), and validation processes, all injected with relevant context for accurate calculations. It provides methods for querying various position metrics, including profit, loss, breakeven points, and time elapsed, offering a comprehensive view of the strategy’s performance.

Several methods exist for managing signals, including creating, cancelling, and activating them.  The service supports partial profit/loss adjustments and trailing stop/take functionality, allowing fine-grained control over the active position.  Importantly, there are also methods to validate these actions before execution and to dispose of strategy resources when no longer needed.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for routing strategy-related operations. It intelligently connects requests for strategies to the correct implementation based on symbols and strategy names. To ensure performance, it caches these implementations, avoiding repetitive setup.

Here's a breakdown of what it does:

*   **Centralized Routing:** Directs strategy calls (like `tick()` or `backtest()`) to the appropriate code based on the symbol and strategy used.
*   **Performance Optimization:**  Keeps a memory of previously used strategies to avoid repeatedly creating them.
*   **Synchronization:** Makes sure strategies are fully initialized before they're used.
*   **Handles Live and Historical Data:**  Works for both real-time trading (`tick()`) and testing strategies against historical data (`backtest()`).

**Key Components and How to Use Them:**

*   **`getStrategy()`:**  Retrieves a cached strategy implementation.
*   **`tick()`:** Executes a trading strategy on live data.
*   **`backtest()`:** Runs a strategy on historical data to evaluate its performance.
*   **Various `get...` methods:** (e.g., `getPendingSignal`, `getTotalCostClosed`) provide information about the current state of a strategy’s position, like P&L, entry prices, and partial close data.
*   **`partialProfit()`/`partialLoss()`:** Allows for executing partial positions.
*   **`cancelScheduled()`:** Cancels pending signals.
*   **`createSignal()`:**  Manually queues a signal.

Essentially, this service simplifies how you manage and interact with different trading strategies within your framework. It streamlines the process and ensures efficient resource utilization.

## Class StorageLiveAdapter

The StorageLiveAdapter acts as a flexible middleman for managing how your trading signals are stored. It allows you to easily switch between different storage methods – like keeping data on disk, using memory only, or even using a dummy adapter for testing.

Think of it as a pluggable system; you can swap out the underlying storage implementation without changing much of your core code. The default behavior is to use persistent storage, saving your signals to disk, but you can switch to in-memory storage or a dummy adapter as needed.

The adapter provides methods for handling events like signals opening, closing, or being scheduled, and also allows you to find, list, and update signals. 

Importantly, it caches the storage utils instance to improve performance, but has a `clear()` method which is crucial for scenarios where your working directory changes between strategy runs – ensuring you get a fresh storage instance each time. You can also dynamically change the active storage adapter using `useStorageAdapter`, `useDummy`, `usePersist`, or `useMemory` methods.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how backtest data is stored. It acts as a middleman, allowing you to easily switch between different storage methods without changing the core backtest logic. By default, it stores data in memory, but you can also opt to persist your data to disk or use a "dummy" adapter which effectively ignores all storage operations – great for testing or troubleshooting.

The system intelligently creates and reuses the storage utilities, ensuring efficiency, but has a `clear()` method to force it to rebuild them, which is important when your working directory changes. Several event handlers (`handleOpened`, `handleClosed`, etc.) pass signal-related information to the active storage adapter to keep everything synchronized.

You can also find signals by ID or list all stored signals, and specific ping events (`handleActivePing`, `handleSchedulePing`) are processed to update signal timestamps. The `useStorageAdapter` method allows you to specify a custom storage adapter, while `useDummy`, `usePersist`, and `useMemory` provide shortcuts to the most common storage options.

## Class StorageAdapter

The StorageAdapter is the central hub for managing the signals used in your backtesting and live trading environments. It automatically keeps track of incoming signals by listening for updates.

This adapter provides a single, easy way to access both the signals from your historical backtest data and the signals coming in from your live trading.

To avoid unexpected behavior, it uses a clever mechanism to ensure you only subscribe to signal updates once.

You can enable or disable this automatic signal storage as needed. Disabling it is perfectly safe to do repeatedly.

Need to find a specific signal? You can search by its unique ID, pulling it from either your backtest or live data. 

Want to see all the signals collected during a backtest? Or perhaps all the live signals? Convenient functions let you list them all.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and store the state of your trading strategies, allowing you to swap out different storage methods easily. It's designed to work with strategies that need to react to market conditions, such as those using LLMs to analyze trade behavior.

You can choose where your state is stored – in memory for quick testing, persistently on your file system for long-term survival across restarts, or even a dummy adapter for completely discarding changes. The adapter remembers important information about each signal, like how long a position has been open and its peak percentage gain, so that your strategies can make decisions based on historical performance.

To keep things clean and efficient, it uses memoization to only create one copy of state data for each signal and bucket combination. When a signal is finished, the adapter automatically cleans up those memoized instances.  There are helper functions to switch between the different storage options: `useLocal`, `usePersist`, `useDummy` and `useStateAdapter` to configure the state adapter with your custom class. `clear` is needed when your working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store data during backtesting, allowing you to easily switch between different storage methods. It provides a flexible way to handle state information, letting you choose between keeping data in memory, saving it to a file, or using a dummy adapter that simply ignores all changes.

You can quickly change the storage backend using methods like `useLocal`, `usePersist`, and `useDummy`, making it simple to experiment with different persistence strategies.  The adapter is designed to efficiently store and retrieve state data related to a specific signal and bucket, and it automatically cleans up old data when a signal is closed.

Specifically, it's useful for implementing advanced trading rules, such as those driven by LLMs, that require monitoring trade performance over time (like tracking peak profit and duration). The `disposeSignal` function ensures that outdated state information is cleared when a signal is no longer active.  Finally, `clear` is essential if your working directory changes during a backtest run, ensuring fresh state instances are created.

## Class StateAdapter

The StateAdapter is the central piece for managing data during backtesting and live trading. It's designed to keep things tidy and prevent errors by automatically cleaning up when signals are finished or cancelled. 

Think of it as a smart gatekeeper that directs operations either to the backtesting storage or the live trading storage, depending on what you're doing.

You can turn the state storage on and off with `enable` and `disable`. The `enable` function is special – it only runs once to avoid creating too many subscriptions.

To get the current state of a signal, use `getState`, and to update the state, you use `setState`. Both functions will automatically send the request to the correct storage based on your settings.

## Class SizingValidationService

This service helps you keep track of and confirm your position sizing strategies. It acts as a central place to register different sizing methods and make sure they're available before you use them in your trading tests. 

Think of it as a safety net – it ensures the sizing methods you're planning to use actually exist.

You can register new sizing strategies using `addSizing`, and verify their existence with `validate`. It also keeps a record of all your registered strategies with the `list` function, which returns them as a list. 

To improve speed, it remembers the results of validations so it doesn't have to repeat checks unnecessarily.

## Class SizingSchemaService

The SizingSchemaService helps you organize and manage your sizing schemas, which define how much of an asset to trade. It's like a central place to store and find these sizing rules. 

It utilizes a secure and type-safe storage system. You can add new sizing schemas using `register` and update existing ones with `override`. 

To find a specific sizing schema, use the `get` method and provide its name. Before a sizing schema can be added, it's quickly checked to make sure it has all the necessary information. This service also has some internal components for logging and validation, but you likely won't interact with those directly.

## Class SizingGlobalService

The SizingGlobalService helps determine how much to trade in each operation. It acts as a central point for calculating position sizes, relying on other services for its work.

Think of it as the engine that figures out the right amount of assets to buy or sell, considering your risk tolerance and other factors. 

It uses a `sizingConnectionService` and a `sizingValidationService` to do this.

The `calculate` method is the key function - you provide parameters like risk amounts, and it returns the suggested position size. It also logs details about the sizing calculation.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine the size of positions to take. It acts as a central hub, directing sizing requests to the correct sizing logic based on a name you provide.

Think of it as a smart router – when your strategy needs to figure out how much to trade, this service figures out *which* sizing method to use.

It also keeps things efficient by remembering previously used sizing methods, so it doesn't have to recreate them every time.

The service uses configuration to determine the sizing methods available, and the `sizingName` parameter identifies the specific method to apply. Strategies without custom sizing configurations can still use this service with an empty `sizingName`.

The `calculate` method is the core of this service, taking parameters and context to determine the position size, handling various sizing techniques like fixed percentage or ATR-based sizing.

## Class SessionLiveAdapter

The SessionLiveAdapter provides a flexible way to manage and store data during live trading sessions. It acts as a central point, allowing you to easily swap out different storage methods without changing your core trading logic.

Think of it like having interchangeable storage options: you can use a file-based system to save data between restarts, keep everything in memory for faster access during a single run, or even use a dummy adapter for testing where no data is saved.

It intelligently remembers which storage method you're using based on the trading symbol, strategy name, exchange, and the timeframe you're working with.

You can quickly switch between these storage options with convenience methods like `useLocal`, `usePersist`, and `useDummy`. If you need even more customization, there's a way to plug in your own custom storage adapter.

If your working directory changes, like when a strategy restarts, use the `clear` function to ensure fresh adapters are created.

## Class SessionBacktestAdapter

This component, called SessionBacktestAdapter, helps manage and store data during backtesting. Think of it as a flexible container for keeping track of information related to your trades. It allows you to easily switch between different storage methods, like keeping everything in memory (fast but temporary), saving to files (persistent but slower), or even discarding the data entirely for testing purposes.

It provides a simple way to choose how your backtest data is stored and accessed. By default, data is stored in memory.

You can easily change this to save your results to disk or use a "dummy" adapter that doesn't actually store anything. You can also plug in your own custom storage solutions.

The `getData` method retrieves a specific piece of data based on a symbol, context, and timestamp. The `setData` method updates this information.

The `useLocal`, `usePersist`, and `useDummy` methods offer quick shortcuts for switching between the default, persistent, and dummy adapters. The `useSessionAdapter` allows for implementing your own custom adapters. Finally, `clear` can be used to refresh the cached storage instances when the working directory changes.

## Class SessionAdapter

The `SessionAdapter` is the central hub for handling data storage during both backtesting and live trading. It intelligently directs data operations to either the `SessionBacktest` or `SessionLive` component, depending on whether you're running a historical test or a live trade.

You can use `getData` to retrieve a specific data point, like a signal, for a particular symbol and timeframe.  It will automatically choose the right storage based on whether you're looking at backtest data or live data.

Similarly, `setData` lets you update data in the session, again routing the update to the correct location depending on the backtest setting. Essentially, it simplifies working with session data regardless of the trading environment.


## Class ScheduleUtils

The ScheduleUtils class helps you easily monitor and understand how your scheduled trading signals are performing. Think of it as a central place to check on the health of your signal delivery system. 

It gives you tools to track signals waiting to be processed, signals that were cancelled, and key metrics like cancellation rates and average wait times. 

You can also generate clear, readable reports in markdown format, making it simple to identify any bottlenecks or issues. This functionality is available as a singleton, meaning there's only one instance to make accessing these features quick and simple. 

The `getData` method provides specific statistics for a symbol and strategy combination. `getReport` generates a markdown report while `dump` saves that report directly to a file.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of when signals are scheduled, opened, and cancelled, particularly useful for understanding delays in order execution. It essentially acts as a listener, observing these signal events and recording them in a database.

It uses a logger for debugging and a 'tick' to process and record each event, calculating how long signals take from scheduling to either being opened or cancelled.

To start monitoring, you'll use the `subscribe` function, which gives you a way to stop listening with the unsubscribe function it returns. If you've already subscribed, calling `unsubscribe` again simply ensures you aren't receiving unnecessary updates.


## Class ScheduleMarkdownService

This service helps you keep track of scheduled trading signals and creates easy-to-read reports. It monitors when signals are scheduled and cancelled, gathering information about each event.

It automatically generates markdown tables showing details of these signals, including important statistics like the cancellation rate and how long signals typically wait before execution. 

The service organizes this information by strategy and saves the reports as markdown files, making it simple to analyze and review your signal scheduling. You can also request specific data or reports, or clear out the collected information when it's no longer needed. It makes sure each strategy has its own separate set of reports.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management settings. Think of it as a central place to register different risk profiles and make sure they're all properly set up before you use them in your trading strategies.

It's designed to be efficient, remembering previous validation checks to speed things up.

You can add new risk profiles using `addRisk`, verify a profile exists before using it with `validate`, and see a complete list of all registered profiles with `list`. 

Essentially, it's a way to keep your risk management configurations organized and reliable.

## Class RiskUtils

This class helps you analyze and understand risk rejection events within your trading system. It acts as a central point to collect and summarize data about why trades were rejected, providing insights into potential problems or areas for improvement.

It gathers information from risk rejection events, tracking details like the symbol, strategy used, position, and the reason for rejection.  You can request aggregated statistics on rejections, letting you see patterns in the types of rejections occurring.

You can also generate comprehensive reports that present this rejection data in a clear, readable format (Markdown). These reports include tables detailing each rejection, along with overall statistics.  Finally, these reports can easily be saved as files for later review or sharing. It essentially gives you tools to investigate and learn from your system's risk rejections.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a structured and type-safe way. It uses a registry to store these schemas, making it easy to organize and manage them.

You can add new risk profiles using the `addRisk()` method (which internally uses `register`), and retrieve them later by their names with `get()`. 

Before adding a risk schema, `validateShallow()` checks it to ensure it has the necessary information and follows the expected format, preventing errors down the line. 

If a schema with a particular name already exists, you can update it using `override()` to make targeted changes. 

The service relies on a logger to track its operations, and internally uses a registry from another library to make sure everything is properly typed.


## Class RiskReportService

The RiskReportService is designed to keep a record of when trading signals are rejected by the risk management system. It essentially acts as a watchdog, noting down each rejection, including why it happened and the details of the signal that was blocked.

It connects to the risk rejection system to listen for these events, then carefully logs them to a database for later analysis and auditing purposes. To prevent accidentally logging the same event multiple times, it uses a mechanism to ensure only one subscription is active at a time.

You can tell it to start listening for rejection events using the `subscribe` function, which will also give you a way to stop listening later. Conversely, the `unsubscribe` function provides a clean way to stop the service from recording risk rejection events.

## Class RiskMarkdownService

This service helps you automatically create reports about rejected trades, specifically focusing on why those rejections happened. It listens for events signaling a rejected trade and carefully organizes that information based on the symbol, strategy, exchange, timeframe, and whether it's a backtest.

The service then compiles this data into readable markdown tables, providing a clear overview of rejections and useful statistics like the total number of rejections, broken down by symbol and strategy. These reports are saved as files on your computer, making it easy to review and analyze rejection patterns.

You can subscribe to receive these rejection events, and there's an easy way to unsubscribe when you no longer need them. The `getData`, `getReport`, and `dump` functions allow you to retrieve statistics, generate reports, and save them to disk, respectively.  There's also a function to clear out all accumulated data or selectively clear data for a specific symbol and strategy. It uses a storage system that keeps data separate for each symbol-strategy combination, so you don't have to worry about mixing up information.

## Class RiskGlobalService

This service acts as a central hub for managing risk within the backtest-kit trading framework. It ensures that trading signals adhere to predefined risk limits, providing a layer of safety and control.

It handles validation of risk configurations, remembering previous validations to improve performance.

The core functionality involves checking if a signal is permissible based on risk rules and, in a more robust version, reserving resources to prevent conflicting validations in concurrent scenarios. 

You can register open signals with this service, which essentially informs the system about active trades, and remove signals when trades are closed.

Finally, it provides a way to clear the existing risk data, either completely or targeting specific risk configurations.


## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct specialized risk management component.

Think of it as a traffic controller for risk, ensuring each check goes to the right place. It keeps a record of frequently used risk management components to speed things up, avoiding redundant setup.

Here’s a breakdown of what it does:

*   **Routes Risk Checks:** It determines which risk management component should handle a particular check based on a provided identifier (riskName).
*   **Optimizes Performance:**  It remembers which risk management components are needed, so it doesn’t have to recreate them every time.
*   **Provides Key Methods:**
    *   `checkSignal`:  Decides if a trading signal is permissible based on defined risk limits (like portfolio size or exposure).  This is the core validation step.
    *   `checkSignalAndReserve`: A special version of `checkSignal` designed for concurrent systems. It checks the signal *and* temporarily locks a position, preventing conflicts when multiple signals are processed at once.
    *   `addSignal`: Records when a trade is opened.
    *   `removeSignal`:  Records when a trade is closed.
    *   `clear`: Forces the system to recreate a risk management component, useful for resetting.

Essentially, this service simplifies risk management by organizing and efficiently executing risk-related actions throughout your trading system.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you consistently log and analyze trading events. Think of it as a flexible system for saving your trading data.

It allows you to easily swap out where your data is stored—like switching between different types of files or databases—without changing your core trading logic.

The system keeps track of each type of report (like backtest results, live trading data, or walker data) and makes sure you're only using one storage instance for each, preventing conflicts.  By default, it stores data in JSONL format, which is good for appending data and easily processing.

It automatically creates the necessary storage when you first save data.

If you need to change where data is saved, you can provide a new adapter.  If you want to temporarily disable logging, you can switch to a dummy adapter that does nothing. You can also revert to the default JSONL adapter. If your working directory changes during a strategy run, you can clear the cache to ensure new storage is used.

## Class ReportUtils

ReportUtils helps you control which parts of the system generate reports and log data. Think of it as a way to turn on or off data collection for backtests, live trading, or other analyses.

The `enable` method lets you choose exactly which services should start logging data in JSONL format. When you enable a service, it begins collecting and recording relevant events, including helpful metadata to make analysis easier.  You'll get a function back when you call `enable` – be sure to run that function later to stop the logging! Forgetting to do so can lead to memory problems.

The `disable` method allows you to stop logging data for specific services without affecting others. It instantly halts the logging process and releases the resources used for event handling, offering fine-grained control over data collection.  This method doesn't return a cleanup function; the logging is stopped immediately.

## Class ReportBase

This component helps you write event data to files in a specific JSONL format, making it perfect for logging and analyzing trading activity. It handles writing data in a way that prevents data loss, ensuring that events are appended to a file rather than overwritten. The system automatically creates the necessary directories for your reports and includes built-in error handling to prevent unexpected issues.

You can easily search through the collected data by filtering based on criteria like the trading symbol, strategy name, exchange, timeframe, signal ID, or walker name.

The process includes a built-in safety feature – if writing takes longer than 15 seconds, it's automatically flagged to avoid data corruption.  This report adapter is designed to be efficient, with a streaming mechanism that manages data flow and prevents overwhelming the system. Initialization is handled automatically once, and then subsequent calls are safely ignored. Finally, when you write data, it gets organized into a structured JSON object including a timestamp, report type, and other relevant metadata.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a flexible way. Think of it as a middleman that allows you to easily switch between different storage methods without changing your core trading logic. 

It remembers which storage method you're using for each type of report, making things efficient. 

By default, it saves data to JSONL files, appending new information to them. 

You can customize the storage method, clear the existing storage, or even temporarily disable storage altogether with a dummy adapter. 

If your working directory changes, clearing the cache ensures you're using the correct storage location. This feature is especially useful when running multiple strategy iterations.

## Class ReflectUtils

This utility class provides a way to track key performance metrics for your trading positions, like unrealized profit/loss, peak profit, and drawdown. It acts as a central point for accessing this information, ensuring consistency and validation across your backtesting and live trading environments. Think of it as a reporting tool for your active trades.

It offers methods to retrieve a variety of data points:

*   **Profit & Loss:** You can get the unrealized PnL as a percentage or in dollars, the highest profit price reached, and the corresponding timestamp and PnL values.
*   **Time-Based Metrics:** It also provides insights into how long a position has been active, how long a signal has been waiting, and the duration since the highest profit or worst drawdown occurred.
*   **Drawdown:** You can retrieve the worst loss price, its timestamp, and associated PnL metrics.
*   **Distance from Peaks:**  There are methods to calculate how far current price is from the highest profit or deepest drawdown points in terms of percentage or cost.

The class is designed for easy access, being a singleton instance, and offers the flexibility to run in either backtest or live trading modes. Importantly, all requests are validated, meaning the class ensures that the data it's providing is related to a valid strategy, exchange, and timeframe.  All methods return promises, indicating asynchronous operations.

## Class RecentLiveAdapter

RecentLiveAdapter helps you manage and retrieve recent trading signals, offering flexibility in how and where those signals are stored. It acts as a central point, allowing you to easily switch between different storage methods like persistent storage on disk or a temporary, in-memory solution.

You can choose between a default persistent storage adapter or use an in-memory adapter for quicker testing or scenarios where data persistence isn't needed.  Think of it as a way to adapt how recent signal data is handled depending on your specific needs.

The adapter uses a factory to create its storage utilities, ensuring that the same instance is used consistently unless you explicitly clear it.  Functions like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` are passed through to the active storage adapter, keeping the interaction clean.  You can dynamically change the adapter used by providing a constructor for a custom storage implementation. The `clear` method is vital for situations where the base directory changes, guaranteeing a fresh start for signal retrieval.

## Class RecentBacktestAdapter

This component lets you manage and access recent trading signals, offering flexibility in how those signals are stored. It uses an adapter pattern, allowing you to easily switch between different storage methods – either keeping data in memory or saving it to persistent storage like a disk file.

By default, it stores signals in memory, but you can quickly change it to use persistent storage if you need to. 

The `getInstance` property is a clever way to ensure you're always using the correct storage utilities, making sure things work efficiently. 

There are also helpful methods to get the latest signal information and to determine how long ago a signal was created. 

Finally, the `useRecentAdapter` method gives you granular control by letting you specify exactly which storage adapter to use, and `clear` ensures everything starts fresh when needed, like when your project's working directory changes.

## Class RecentAdapter

RecentAdapter acts as a central hub for managing and accessing recent trading signals, both from backtesting and live environments. It automatically updates its data by monitoring incoming signals and provides a simple way to retrieve the most recent signal for a specific trading context. 

You can easily turn on or off this signal storage, and it's designed to prevent accidental duplicate subscriptions. To get the latest signal, you specify the symbol, strategy, exchange, frame, and a time point – it prioritizes backtest data but will fall back to live data if needed, while also guarding against using signals from the future. 

You can also check if any signal exists for a given context or determine how long ago the latest signal was created. This component includes a useful method to verify if there’s no recent signal at all before performing other operations that might cause errors, preventing unexpected behavior in situations where a history is still building up.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup – think of it as a central place to find the current price for a symbol, strategy, exchange, and timeframe combination. It's especially useful when you need to know the price outside of the normal trading tick process, like when you're executing a command between trades.

The service keeps track of these prices in a special way, creating a record for each unique setup and updating it as new price information comes in. If a price hasn't been received yet, it will wait a short time to see if one arrives.

It's designed to work with the rest of the system, automatically updating prices as trades happen and allowing you to clean up the stored price data when needed. You can clear individual price records or clear them all at once, and it's a good practice to do so when a new strategy starts running. It uses a centralized system for price data so that it's easy to access and keep synchronized.


## Class PositionSizeUtils

The PositionSizeUtils class offers tools to help you determine how much of an asset to trade based on different strategies. It provides pre-built calculations for several common position sizing methods, ensuring the method you choose is appropriate for the calculation being performed. 

You'll find methods like fixed percentage, which determines size based on a set percentage of your account balance; the Kelly Criterion, which takes into account win rates and win/loss ratios; and an ATR-based method that uses Average True Range to gauge volatility. Each of these methods takes relevant information like account balance, entry price, and stop-loss levels as input to generate a recommended position size. 


## Class Position

The Position class helps you figure out where to place your take profit and stop loss orders when trading. It handles some of the details for you, like adjusting the levels depending on whether you're going long (buying) or short (selling).

It provides two main ways to calculate these levels:

*   **moonbag:** This strategy uses a simple approach, setting your take profit at a fixed percentage above or below your entry price.
*   **bracket:** This method lets you define both your take profit and stop loss percentages, giving you more control over your risk and reward.

Essentially, this class takes your position type, current price, and your desired stop loss and take profit percentages to compute the specific prices for those orders.

## Class PersistStrategyUtils

This class helps manage how strategy data is saved and loaded, ensuring a consistent state even across sessions. It's particularly useful for strategies that need to remember things like pending orders or user actions.

It intelligently creates storage for each strategy, based on its symbol, name, and the exchange it's used on. This ensures that each strategy has its own dedicated storage.

You can customize how this storage works by using different "adapters" – essentially, different ways of saving the data. There are built-in options for using JSON files or even a dummy adapter that does nothing (useful for testing).

If you need to change how the data is saved, you can easily swap out the adapter.  The `clear()` method allows you to refresh this storage when needed, like if the working directory changes. Think of it as periodically clearing out old storage.


## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. It’s designed to be reliable and handle situations where things might go wrong during the saving process.

It uses a specific file name ("strategy") to store the data, ensuring everything is saved correctly. The class automatically manages the file storage for you.

Here’s a breakdown of how it works:

*   **Initialization:** The `waitForInit` method sets up the file storage area when needed.
*   **Saving Strategy Data:**  The `writeStrategyData` method lets you save the current state of your strategy, or clear it if you pass `null`.  It uses the fixed "strategy" identifier.
*   **Loading Strategy Data:**  The `readStrategyData` method retrieves the saved strategy state. It will return `null` if no strategy data is found.

The class takes the trading symbol, strategy name, and exchange name as inputs during its setup. It internally uses a specific key (`STORAGE_KEY`) to identify the strategy data within the file.

## Class PersistStorageUtils

This class, PersistStorageUtils, helps manage how your trading signals are saved and loaded, especially for persistent storage. It ensures that signal data is reliably stored and retrieved across sessions.

It offers a way to customize how storage is handled, allowing you to plug in different storage solutions. The class creates a storage instance for each mode (backtest or live), ensuring signals are isolated and managed appropriately. 

Signals are stored as individual files, making it easier to manage and debug individual signals. The system is designed to be resilient, safeguarding your signal data even if unexpected interruptions occur.

You can swap out the default storage mechanism with custom adapters, or switch to a dummy storage for testing and development purposes. Clearing the cache is crucial when the working directory changes.

## Class PersistStorageInstance

This class provides a way to store and retrieve your trading signals persistently, using files on your computer. It’s designed to be reliable, even if something unexpected happens during the writing process. 

Essentially, it manages your signals – the data that drives your trading strategies – and keeps them safe. Each signal is saved in its own file, making it easy to manage them individually.

The `backtest` property determines whether the storage is used for backtesting scenarios. The underlying storage is handled internally and you don't usually need to interact with it directly.

You can use `waitForInit` to ensure that the storage is ready before you start working with it.  `readStorageData` retrieves all of your saved signals at once, and `writeStorageData` saves the current state of your signals back to the storage files.


## Class PersistStateUtils

This utility class helps manage how trading state is saved and loaded, ensuring it's reliable even if the system crashes. It keeps track of state instances for different trading signals and buckets, making sure each combination has its own dedicated storage. 

You can easily swap out how the state is persisted – whether it's saved to a file, a dummy adapter for testing, or a custom solution you create. The system automatically handles initializing the storage when needed, and writing updates.

It also provides tools to clear the cache of stored instances when things change, like when the current working directory is altered. Furthermore, it helps clean up after trading signals are no longer needed, freeing up resources. You can even use it to simulate state persistence by using a dummy adapter, which effectively disables actual saving.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a straightforward way to save and load state information related to your trading signals, using files. 

It essentially acts as a wrapper around a file-based storage system. Each signal has its own storage area, identified by a bucket name.

You don't have to worry about cleaning up resources used by the storage; that's handled automatically.

Here's what you can do with it:

*   **Initialization:**  `waitForInit` prepares the underlying storage for the signal, making sure everything is ready to go.
*   **Loading Data:** `readStateData` retrieves the saved state, identifying the data based on the bucket name.  It can return `null` if no data is found.
*   **Saving Data:** `writeStateData` saves the current state, again using the bucket name to keep things organized.  The `_when` parameter provides a timestamp for when the data was saved.
*   **Cleanup:** The `dispose` function does nothing directly, because the cleanup is managed externally by `PersistStateUtils`.

## Class PersistSignalUtils

This class provides a way to safely store and retrieve signal data for your trading strategies, ensuring that changes are saved reliably even if things go wrong. It's designed to be flexible, allowing you to choose how your signal data is persisted, whether it's using a standard file-based approach, a custom solution, or even a dummy implementation for testing.

The class manages storage automatically, creating a dedicated storage area for each strategy, symbol, and exchange.  It uses a clever system to only create the storage areas when they're needed.

You can easily swap out the storage mechanism—for example, to use a different type of database—by providing your own signal instance constructor. 

If your working directory changes between strategy runs, you'll need to clear the cached storage to ensure things work correctly.  The `clear()` function handles that.

## Class PersistSignalInstance

This class helps you save and load signal data to files, ensuring it's done reliably even if things go wrong. It's designed to work with a specific trading strategy and exchange. 

Think of it as a way to keep track of your signals—like buy or sell recommendations—and make sure that information is preserved even if your program unexpectedly stops.

It uses the symbol (like 'AAPL') to identify each signal, and it stores them separately for each strategy and exchange you're using.

The `waitForInit` method gets things started, ensuring the storage is ready.  `readSignalData` retrieves a saved signal, while `writeSignalData` saves a new one or clears the existing signal.


## Class PersistSessionUtils

This class helps manage how your trading session data is saved and loaded, ensuring a reliable experience even if things go wrong. Think of it as a central place to keep track of your progress.

It uses a clever system to create and manage storage for your session data, ensuring that each part of your trading setup – strategy, exchange, and frame – has its own dedicated space. You can even plug in your own ways of storing this data, like using a database instead of just files.

The class automatically handles creating these storage spaces as needed, and makes sure that reads and writes happen safely. It also provides a way to clear out old data or clean up specific sessions when they’re no longer needed. There’s even a “dummy” mode which is helpful for testing where nothing actually gets saved. It’s designed to work closely with another tool called `SessionPersistInstance`, providing a safety net for your session information.

## Class PersistSessionInstance

This class provides a way to save and load session data, like settings or state, for your trading strategies. It's designed to work with file storage, making sure that each strategy and exchange has its own dedicated place to store information.

Think of it as a way to remember what your strategy was doing, even after the program restarts.

The class keeps track of the strategy name, exchange, a unique identifier for each "frame" (a specific point in time), the trading symbol, and whether it’s a backtest.

When you need to save data, it writes it to a file based on these identifiers. When you need to load data, it retrieves it from the same file.

The `waitForInit` method prepares the storage space. `readSessionData` loads the saved information, and `writeSessionData` saves new data.  The `dispose` method is simply a placeholder; cleanup is handled elsewhere.


## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and loaded, making sure they're reliable even if there are unexpected interruptions. It keeps track of which storage method to use for each trading strategy, and allows you to customize that storage method if needed.

It remembers which storage instance is used for each combination of symbol, strategy, and exchange, avoiding unnecessary creations.

You can switch between different storage options like using a file, a custom adapter, or even a dummy option that doesn't save anything at all, useful for testing.

To keep things organized and safe, the class handles reading and writing signals to storage, and ensures these operations are done reliably. If the application restarts, it can recover the saved signals. It also provides a way to clear the storage cache, which is especially helpful when changing the working directory.

## Class PersistScheduleInstance

This class provides a way to save and load scheduled trading signals to a file, making sure the process is reliable even if things go wrong. It’s designed to work with a specific trading symbol, strategy, and exchange. Think of it as a way to remember what trading signals were planned, so you can pick up where you left off. 

It stores data using a file and uses unique identifiers to keep things organized. If your system crashes, the data is protected and will be safely written when it restarts.

The constructor requires you to specify the trading symbol, the name of your strategy, and the exchange you're using. It includes properties for those identifiers and internal storage.

Methods include `waitForInit` which sets up the file storage, `readScheduleData` to retrieve existing data for a symbol, and `writeScheduleData` to save new data or clear existing data for a symbol.

## Class PersistRiskUtils

This class helps manage how trading positions are saved and loaded, particularly for risk management. It's designed to handle storing information about active positions in a reliable way.

It efficiently creates storage instances for different risk profiles, ensuring each one is handled separately. You can even customize how this storage works by providing your own methods for persistence.

The framework automatically keeps track of these positions and makes sure writing and reading data is done safely. It also ensures that even if something unexpected happens, your position state is protected.

You can influence which persistence method is used—like using files, a dummy for testing, or a custom solution—and the system will remember your choice. If the environment changes (like when the working directory updates), clearing the cache ensures the system re-initializes properly.

## Class PersistRiskInstance

This class provides a reliable way to save and load position data for your backtesting framework. Think of it as a safe keeper for your trading history, ensuring it's preserved even if things go wrong.

It uses a specific file to store this data, and it's designed to handle crashes gracefully by making sure writes are completed safely. 

You define the name of the risk and the exchange when you create this object. 

It has methods to initialize the storage, read in existing data, and write new data. The data is always stored under a consistent identifier, ensuring everything stays organized.

## Class PersistRecentUtils

This class helps manage how recently generated trading signals are stored, especially useful for backtesting and live trading scenarios. It intelligently caches these storage instances, creating a new one only when needed based on factors like the trading symbol, strategy name, exchange, and timeframe.

You can customize how these signals are stored by providing your own storage solution. The system handles reading and writing recent signals safely, even if there are unexpected interruptions.

Here’s a breakdown of what it offers:

*   **Customizable Storage:** Easily swap in your preferred way to persist signals, whether it's a file-based system, a database, or even a dummy solution for testing.
*   **Smart Caching:**  It avoids creating unnecessary storage instances by keeping track of what’s already been created.
*   **Safe Operations:** Reads and writes are handled carefully to prevent data loss.
*   **Easy Resetting:** You can clear the storage cache whenever needed, like when changing your project directory.
*   **Key Generation:** It creates a unique key to identify the specific context for which the data needs to be stored.



It's primarily used internally by other utility classes, but its configuration options allow for flexible and robust management of recent signals.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent data for a trading strategy. Think of it as a way to remember the last signal your strategy generated. 

It stores this data in a file, ensuring the saving process is reliable. The file name includes details like the trading symbol, strategy name, exchange, and a frame name, as well as whether it’s a backtest or live strategy. 

You can use it to easily access the most recent data your strategy produced, and it handles the behind-the-scenes file management. The `waitForInit` method ensures the storage is ready before you try to read or write anything, and the `readRecentData` and `writeRecentData` methods let you get and save the recent signal respectively.

## Class PersistPartialUtils

This class helps manage and store information about partial profits and losses, ensuring data isn't lost even if there are interruptions. It intelligently handles storage for each trading symbol and strategy combination, creating a unique storage area for each. This avoids conflicts and keeps data organized.

The system uses a flexible approach, allowing you to customize how the data is stored, whether it's in a file, a database, or even a dummy system for testing. This customization is controlled by setting the `PersistPartialInstanceCtor` property.

You can retrieve existing partial data using `readPartialData`, and update it with `writePartialData`, and these actions are designed to be safe and reliable.  If the storage hasn't been created yet for a particular symbol and strategy, it will be initialized automatically when you first try to access it. 

The `clear` method is useful when your environment changes, like when you switch directories. `useJson` and `useDummy` provide easy ways to switch between different storage methods for development or testing.

## Class PersistPartialInstance

This class helps you save and load partial data, like intermediate calculations or temporary states, for your trading strategies. It's designed to be reliable, even if your program crashes unexpectedly.

It's tied to a specific trading symbol, strategy name, and exchange – think of it as a container for data related to a particular trading setup.

Internally, it uses a file to store this data safely, ensuring updates happen completely or not at all.  The data is identified by a unique signal ID.

The `waitForInit` method makes sure the storage is ready before you try to use it. `readPartialData` retrieves data associated with a specific signal, while `writePartialData` saves data for a signal. Essentially, it's a simple way to checkpoint your work as you go.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and loaded, making sure it's handled reliably. It uses a clever system to only create one storage instance for each trading mode, like backtesting or live trading. 

You can customize how notifications are persisted by providing your own storage creation functions, or you can easily switch back to the default file-based storage or even a dummy storage for testing purposes where no actual saving happens. 

The notifications themselves are each stored as separate files, making it resilient to crashes and ensuring a clean and organized storage system. The read and write operations are also handled carefully to avoid data corruption. You’ll find this class working behind the scenes in other parts of the notification persistence system. 

It’s useful to clear the cache if you change the working directory during strategy iterations.

## Class PersistNotificationInstance

This component handles saving and retrieving notification data, particularly useful for persisting information across sessions. It acts as a bridge between your application and a file system, allowing you to reliably store notification details. Each notification is saved as its own JSON file, making it easy to manage and access individual entries. 

The system is designed to be resilient; even if unexpected interruptions occur during saving, it aims to keep your data intact. It allows initializing the underlying storage and offers methods to read all stored notifications or to write a batch of notifications at once. You can specify whether this storage is used in a backtesting environment during initialization.

## Class PersistMemoryUtils

This class provides tools for safely storing and retrieving data related to your trading strategies. It focuses on managing persistent memory, ensuring that information isn't lost even if the application crashes.

The core function is to create and manage storage instances based on a signal ID and a bucket name, ensuring each combination gets its own dedicated storage. It allows you to customize how this storage works by providing a way to register your own storage constructors.

You can use this to initialize storage, read, write, and delete data entries. It also provides a way to check if a specific data entry exists. 

The `listMemoryData` method is handy for rebuilding indexes or syncing data. You have options to switch between different storage methods, including a default file-based system or even a dummy one for testing purposes. Finally, functions exist to clean up caches and individual storage areas when they are no longer needed.

## Class PersistMemoryInstance

This component, `PersistMemoryInstance`, provides a way to store and retrieve data persistently, like saving information to a file. It's designed to work with a specific signal and a named bucket for organization.

It manages this data by wrapping a lower-level storage mechanism to ensure that writes are handled reliably. To handle data cleanup, it uses a soft delete system – instead of permanently removing items, it flags them as deleted.  When you need to see all the valid data, it filters out these soft-deleted entries.

Here's what you can do with it:

*   **Initialization:** `waitForInit` makes sure the underlying storage is ready before you start using it.
*   **Reading Data:** `readMemoryData` lets you fetch a specific data entry by its unique ID. If the entry is missing or marked as deleted, it will return nothing. `hasMemoryData` lets you quickly check if an entry exists.
*   **Writing and Updating Data:** `writeMemoryData` saves a new data entry or updates an existing one.
*   **Deleting Data:** `removeMemoryData` essentially hides a data entry by marking it as deleted. This is a safe operation, even if the entry doesn’t exist.
*   **Listing Data:** `listMemoryData` gives you a way to go through all the data entries in the bucket, but only showing the ones that haven't been marked for deletion.
*   **Cleanup:** `dispose` doesn’t do anything on its own. It relies on a separate utility for cleaning up any cached data related to this component.

## Class PersistMeasureUtils

This class helps manage cached data from external APIs, making sure that data is saved and retrieved reliably. It essentially acts as a persistent storage system, organizing data based on timestamps and symbols. The system uses a clever approach, creating storage instances only when needed, and using the same instance for data related to the same timestamp and symbol.

You can customize how this caching works by providing your own storage "builders," allowing for different storage methods. The class ensures data is written and read safely, even if the application crashes unexpectedly. 

Here's a breakdown of key features:

*   **Customizable Storage:** You can swap out the default storage method with your own implementation.
*   **Lazy Loading:** Storage is created only when you need it, improving performance.
*   **Safe Operations:** Writes and reads are designed to be reliable.
*   **Clean Up:** You can clear the cache when needed, such as when the working directory changes.
*   **Testing:** A dummy implementation is available for testing purposes, where all operations are ignored.



The `readMeasureData` and `writeMeasureData` functions handle reading and writing data, respectively, while `removeMeasureData` allows for "soft deleting" entries. `listMeasureData` lets you see all the cached entries for a specific data set, and `clear` ensures a fresh start for the cache.

## Class PersistMeasureInstance

This class provides a way to store and manage your trading data persistently, like saving results to a file. It essentially acts as a bridge between your trading logic and a file-based storage system. 

You can think of it as a container, identified by a "bucket" name, for holding individual "measure data" entries.

It handles the details of writing data to files safely and allows you to mark entries as deleted (but not actually remove them from the file) using a "removed" flag. When listing all entries, it automatically filters out any that have been marked for deletion.

The `waitForInit` method ensures the storage system is ready before you start writing data. You can retrieve entries using their keys with `readMeasureData`, add new entries with `writeMeasureData`, and "soft delete" existing entries with `removeMeasureData`. The `listMeasureData` function helps you iterate through all the active, non-deleted data entries.


## Class PersistLogUtils

This class helps manage how your trading logs are stored and retrieved. It acts as a central point for persistence, allowing you to easily swap out the underlying storage mechanism if needed. 

Think of it as a smart helper that keeps a record of your trading activity.

It automatically handles reading and writing log entries, ensuring a consistent approach. The logs are organized as individual files, identified by a unique ID.

You can even customize how the logs are stored, using different adapters or opting for a dummy version that doesn't actually save anything – useful for testing.  The internal log instance is cached for efficiency and can be refreshed when you need to change the storage method or clear existing logs, especially when switching between trading strategy runs.


## Class PersistLogInstance

This component handles saving and retrieving your trading strategy's logs to disk. Think of it as a safe and reliable way to keep a record of what your backtest is doing.

It stores each log entry as a separate JSON file, ensuring that nothing gets lost. The system adds new log entries, but never modifies or deletes existing ones, providing a secure and tamper-proof record. 

To start, it needs to initialize its storage.  You can then retrieve all the log data or add new entries.  When adding new entries, it checks to see if the entry already exists to ensure that nothing is overwritten. This design helps protect against data loss in case of unexpected interruptions.


## Class PersistIntervalUtils

This component manages how your backtest kit remembers when certain time intervals have already been processed. It keeps track of this information in files within a specific directory (`./dump/data/interval/`).

Essentially, a file's existence indicates that the interval has fired; its absence means it hasn't yet.

You can customize how this persistence layer works by providing your own constructors for creating the persistence instances. There are also handy shortcuts to switch between a standard file-based persistence, a JSON-based persistence, or a dummy instance for testing where data isn't actually saved.

The `listIntervalData` method helps you iterate over the intervals that have already fired within a specific time bucket. You can also clear the internal cache if your working directory changes.

## Class PersistIntervalInstance

This component manages persistent data related to trading intervals, essentially acting as a file-based storage system. It’s designed to hold information about when trading intervals should be triggered, allowing the framework to remember and reactivate them.

The `bucket` property defines where this data is stored on your system. The storage uses file system so it can be easily persisted.

You can use `readIntervalData` to retrieve an interval’s details by its unique key. If the data doesn't exist, or it’s been marked for deletion, it will return nothing. 

`writeIntervalData` lets you create and save new intervals.  `removeIntervalData` provides a "soft delete" – it doesn’t actually erase the data, but instead marks it as removed. This lets intervals re-trigger later if needed.

Finally, `listIntervalData` gives you a way to view all of the active interval markers that are currently configured, ignoring any that have been marked for removal. `waitForInit` helps ensure the underlying storage is set up correctly before you start working with it.

## Class PersistCandleUtils

This class helps manage how your trading strategy's candle data (like open, high, low, close prices) is stored and retrieved. It’s designed to keep things organized and efficient, especially when dealing with lots of historical data.

Each candle is saved as a separate file, making it easy to find and manage individual data points. The system checks if the cached data is still valid before using it, and automatically updates the cache if needed. 

You can customize how the data is stored, like switching between a standard file-based system, a dummy system for testing, or creating your own custom storage solution. The `clear` function is useful to make sure the cache is refreshed if your working directory changes. The data reading and writing functions work together to load and save candles.


## Class PersistCandleInstance

This class helps you reliably store and retrieve historical candle data for trading. Think of it as a persistent memory for your backtesting system, keeping track of past price action.

It's designed to save each candle as a separate file, so it's organized and easy to manage.  If it can't find a candle when it’s asked for it, it treats that as a request to get fresh data.

When writing data, it makes sure that only complete candles – those with a closing time that isn't in the future – are saved. It also avoids overwriting existing data, ensuring that your historical record remains accurate.  Any problems encountered with stored data result in a warning.

The constructor takes the symbol (like 'BTCUSDT'), the candle interval (like 1 minute or 1 hour), and the exchange name as input, setting up the storage context for that specific asset and timeframe. You can use `waitForInit` to confirm everything is ready to go.

`readCandlesData` is used to retrieve a specific range of candles, making sure to handle missing data gracefully. `writeCandlesData` handles the process of saving new candles, avoiding data corruption and ensuring data integrity.


## Class PersistBreakevenUtils

This class helps manage and save breakeven data, acting as a central hub for persistence. It ensures that information about breakeven points for different trading strategies and symbols is reliably stored and retrieved.

It handles the details of reading and writing this data to files on your computer, automatically creating the necessary file structure.  You don't need to worry about the specifics of where the data is stored.

The system intelligently creates and reuses storage containers for each symbol and strategy combination, making sure that data isn't overwritten unintentionally.  It uses a clever system to only create these containers when needed, so it’s efficient.

If you need more control, you can customize how the data is stored, for example, using a different type of storage or even using a "dummy" version that doesn’t save anything at all – useful for testing.

You can also force the system to forget everything it knows (clear its cache) if your working directory changes, ensuring that things stay synchronized.

## Class PersistBreakevenInstance

This class offers a reliable way to save and retrieve breakeven data, crucial for keeping track of your trading strategy's performance. It acts as a persistent storage, automatically handling file operations to ensure your data isn't lost. Think of it as a safety net for your trading insights.

The class keeps track of the symbol, strategy name, and exchange used, which helps organize the data.

Internally, it uses a file to store the data, associating each piece of information with a unique identifier based on the signal ID.  

The `waitForInit` method ensures the storage is properly set up before any data is written.

You'll use `readBreakevenData` to get existing data for a specific signal and `writeBreakevenData` to update or add new data, always using a signal ID to pinpoint the exact information you want. This combination allows for both retrieving and updating data for individual signals.


## Class PersistBase

This class provides a foundational structure for saving and retrieving data to files, ensuring that those operations are reliable and consistent. It's designed to handle situations where data might become corrupted, automatically checking and fixing issues.

The `entityName` and `baseDir` properties define the name of the data being stored and where those files are located. The class cleverly calculates the exact file paths for each data item.

You can use methods like `readValue` and `writeValue` to read and write data.  `hasValue` allows you to check if a specific data item already exists.

The `keys` method gives you a way to iterate through all the stored data IDs, one at a time, which is helpful for tasks like cleanup or validation.  `waitForInit` sets up the storage directory and verifies that everything is in good shape when the system starts.


## Class PerformanceReportService

The PerformanceReportService helps you understand how fast your trading strategies are running and where potential slowdowns might be. It acts like a detective, quietly observing the timing of different parts of your strategy execution.

It connects to a central "performance emitter" to listen for these timing events.

When it sees an event, it records the duration and any relevant details. These records are then stored in a database, allowing you to later analyze your strategy and identify bottlenecks for optimization.

To use it, you'll subscribe to the performance emitter. This subscription has built-in protection against accidental multiple registrations.  Remember to unsubscribe when you're done to avoid unnecessary database activity. You can use `subscribe()` to get an unsubscribe function that you’ll need to call to properly disconnect.


## Class PerformanceMarkdownService

This service is designed to monitor and analyze how your trading strategies are performing. It listens for performance events and keeps track of key metrics for each strategy you're running. You can then request overall statistics like average, minimum, maximum values, and percentiles.

It automatically creates reports in markdown format, which includes an analysis of potential bottlenecks in your strategies. These reports are saved to your logs directory.

Here's a breakdown of what you can do:

*   **Subscribe and Unsubscribe:**  Connect to receive performance data, and easily disconnect when you no longer need it.
*   **Track Performance:**  Feed performance events to the service to build up the data it uses for analysis.
*   **Retrieve Data:**  Get a summarized view of performance statistics for a specific strategy and symbol combination.
*   **Generate Reports:** Create detailed performance reports for analysis and sharing.
*   **Save Reports:** Automatically save those reports to disk.
*   **Clear Data:** Completely wipe the accumulated performance data when needed, allowing for fresh starts.

The service also manages storage internally, ensuring that each strategy's data is kept separate and organized. You'll be using a logger service and a way to access the storage as part of its operation.

## Class Performance

The Performance class is your go-to tool for understanding how well your trading strategies are performing. It allows you to gather and analyze key performance statistics for specific symbols and strategies, giving you insights into their efficiency. 

You can retrieve detailed performance data, broken down by operation type, to identify bottlenecks and understand where time is being spent. 

Generating readable markdown reports is easy, providing visualizations of time distribution and detailed performance statistics, perfect for sharing or documenting your findings. 

Finally, you can conveniently save these reports directly to disk, defaulting to a directory structure like `./dump/performance/{strategyName}.md`, making it simple to track performance over time.

## Class PartialUtils

This class helps you understand and visualize the partial profit and loss data your system generates. Think of it as a tool to summarize and export insights from those smaller, incremental gains and losses.

It collects data about partial profits and losses—things like when a trade was profitable or a loss occurred, what symbol was involved, and other details like the signal ID and position size.

You can use it to get statistical summaries of your partial profit/loss performance, showing aggregated metrics over time.

It also allows you to create nicely formatted markdown reports that present this data in a clear, tabular format—showing individual events with details like timestamp, price, and level.

Finally, this class can generate those reports and save them as files, making it easy to share or archive your performance analysis. The report filenames automatically include the symbol and strategy name.

## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether it's due to a profit or a loss. 

It listens for these "partial exit" events – those moments when a portion of your position is closed – and records them in a database.

Think of it as a detailed log of how your trades are being managed, specifically focusing on those smaller, incremental closures.

To use it, you'll subscribe to specific signals indicating profit or loss events.  Once subscribed, it will automatically log these partial exits.  You can also manually unsubscribe when you don't need the logging anymore. The service is designed to prevent you from accidentally subscribing multiple times. A logger service is available for debugging purposes.

## Class PartialMarkdownService

This service helps you create and save reports detailing small profits and losses ("partial" profits and losses) during your trading backtests. It listens for these events, keeps track of them for each trading symbol and strategy, and then organizes them into readable markdown tables. 

You can subscribe to receive these events, and the service provides functions to gather statistics, generate reports, and save those reports as files. Each combination of symbol, strategy, exchange, timeframe, and backtest run gets its own separate storage area, ensuring your data is well-organized. You can also clear out this accumulated data when needed, either for a specific combination or everything at once. The `dump` function automatically creates directories if they don't exist, making report saving easy.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within your trading strategies. Think of it as a middleman that keeps things organized and provides a clear log of what’s happening.

It’s injected into your trading strategy, making it easy to manage how partial profits and losses are handled. The service relies on other components for tasks like validating your strategy and managing connections. 

It offers methods to record profits, losses, and clear these records when a trade concludes. Every time one of these actions occurs, it's logged, providing valuable insight into your strategy's performance. Essentially, it simplifies partial profit/loss tracking and makes it easier to monitor.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for individual trading signals. It acts like a central hub, ensuring that each signal has its own dedicated record for these details.

Essentially, it creates and remembers these signal-specific records, preventing multiple instances for the same signal. You provide information like logging and event handling, and the service takes care of the rest.

When a signal experiences a profit or loss, the service updates the corresponding record and sends out notifications. When a signal is closed out, the service cleans up the record to free up resources.

The service is designed to work seamlessly with the broader trading strategy, and it uses a clever caching system to efficiently manage all these individual signal records. It's a critical component for keeping track of performance and ensuring the system operates smoothly.

## Class OrderTransientError

This `OrderTransientError` class is a way to clearly mark when an order attempt fails temporarily – think network hiccups or exchange issues. It's not a special case for the backtest framework itself; any unexpected error is treated as transient by default. Instead, it helps developers communicate intent: when you throw this error, you're saying, "Hey, this isn't a permanent problem, please try again later."

Here's how it affects what happens next, depending on the type of order action:

*   **Opening an Order:** The system will automatically try again, using the exact same order details. It keeps track of attempts, and if it tries too many times, it will stop and signal a critical issue.
*   **Closing an Order:** Similar to opening, the system retries closing the position, with a limit on how many times. Failing repeatedly signals a serious problem that needs intervention.
*   **Checking Order Status:** If a check fails (verifying the order is still open or scheduled), it’s tolerated and retried without immediate consequences. However, too many consecutive failures will eventually lead to an error.

Important notes:

*   The counters for opening and closing orders persist even if the system crashes, ensuring attempts aren't lost.
*   Exhausting these transient errors is considered a fatal error, unlike other types of order failures.
*   This class is mainly for clarity in code and logging; the framework doesn't actually use it for specific logic.

## Class OrderRejectedError

This error signifies a definitive rejection of an order by the exchange, meaning retrying won't help. It's thrown specifically within order processing components – things like broker adapters or action handlers – and indicates a permanent problem, not a temporary glitch.

When this error is thrown, the backtest-kit immediately stops trying to fulfill the order. Open orders are dropped, and close orders are forcefully shut down, impacting the strategy’s current state. The framework logs the rejection but doesn’t halt the entire process, unlike errors indicating a more critical problem.

It’s crucial to only use this error for situations where the exchange clearly states the order *cannot* be fulfilled due to issues like a delisted symbol or account restrictions.  Network problems should trigger standard errors or `OrderTransientError` so retry mechanisms can take over.

The framework identifies this error by a unique runtime symbol, ensuring it's recognized even if the code is duplicated across different modules. This error is most relevant in live trading environments and won’t have a significant effect during backtesting, unless directly mocked. Providing a message is optional; the error's type is what matters.


## Class OrderDeletedError

The `OrderDeletedError` signals a definitive confirmation from the exchange that an order no longer exists – essentially, the exchange says the order is gone. This isn't about temporary problems like network hiccups or timeouts; it means something like the user canceled the order manually or it was liquidated.

You should only throw this error within order checks, like when verifying an active order or a scheduled order. When thrown, the framework immediately treats it as the order being deleted: open positions are closed, scheduled orders are cancelled, and the process bypasses normal re-attempt procedures.

Importantly, don't use this for filled orders or network problems. A filled order needs to be handled differently to ensure proper closure reasons, and network issues should trigger temporary error handling, not a declaration of deletion. Throwing this error from other parts of the framework's flow (like order creation or closure) will result in it being treated as a minor, retryable issue, not a terminal one.

This error is identifiable by a specific runtime brand, ensuring it's recognized even if your code uses multiple copies of the framework’s code. It’s also exclusive to live trading environments, as checks don’t run during backtests. The error's message is purely for information and doesn’t affect how the framework handles it. There's a static method to reliably check if an error is an `OrderDeletedError`, which is the correct way to identify its type.


## Class NotificationLiveAdapter

This component manages how your backtest kit sends notifications about trading events. Think of it as a central hub for delivering information about signals, profits, losses, and more.

It’s designed to be flexible, allowing you to easily switch between different notification methods – like storing notifications in memory, saving them to a file, or simply discarding them (useful for testing).

The `_notificationLiveFactory` holds the currently active notification method. `getInstance` makes sure you get the right notification method, caching it for efficiency.

It provides methods (`handleSignal`, `handlePartialProfit`, etc.) to deal with various events during the backtest. These methods simply pass the event information to the currently selected notification method.

You can easily choose your notification method using shortcuts like `useDummy()`, `useMemory()`, `usePersist()`. The `useNotificationAdapter` method lets you plug in your own custom notification methods. `clear()` forces the system to recreate the notification method, useful when your environment changes during the backtest.

## Class NotificationHelperService

This service helps manage and send out notifications related to signals, particularly information about active signals. It’s a behind-the-scenes tool primarily used by the backtest-kit framework itself.

It checks if everything is set up correctly – like the strategy, exchange, frame, and action details – and importantly, it does this efficiently by remembering previous checks. If it's already confirmed a particular combination of strategy, exchange, and frame is valid, it won't re-validate it again.

The `commitSignalNotify` function is how notifications are actually sent. It handles the validation step (using the memoized checks), finds the signal details, and then sends out a notification that others can listen for. This notification includes data like the symbol, current price, and the context (strategy, exchange, frame) to help understand the signal.

## Class NotificationBacktestAdapter

This component, `NotificationBacktestAdapter`, helps manage and send notifications during a backtest. Think of it as a flexible system for keeping track of important events like signals, profits, losses, and errors. It's designed to be adaptable – you can easily swap out different notification methods (like storing data in memory, saving to a file, or simply discarding notifications) without changing the core backtest logic.

It's built around a default in-memory storage system, but you can swap that out for persistent storage or even a dummy adapter that does nothing. The adapter provides various methods – `handleSignal`, `handlePartialProfit`, `handleError`, and others – to deal with different types of events occurring during the backtest.

You can use convenient shortcut methods like `useMemory`, `useDummy`, and `usePersist` to switch between different notification implementations quickly.  There's also a `clear` method to force the system to recreate the notification handler, which is important when the base directory for the backtest changes during testing. Essentially, this adapter provides a centralized and configurable way to manage notifications within your backtesting framework.

## Class NotificationAdapter

The NotificationAdapter is the central component for handling notifications, whether you're running a backtest or a live trading strategy. It keeps track of all notifications, automatically updating them as new signals come in.

To prevent unwanted duplicates, it uses a clever "singleshot" system to ensure each signal source is only subscribed to once.

You can easily retrieve all notifications, specifying whether you want the backtest notifications or the live ones.

If you need to clean up, the `dispose` function removes all stored notifications.  It's also safe to disable and re-enable notification storage multiple times.

## Class MemoryLiveAdapter

This component provides a way to manage memory for live trading, offering different storage options like in-memory, file-based persistence, or even a dummy adapter that ignores data. It's designed to be flexible, letting you swap out the underlying storage mechanism easily.

You can choose to store data in memory only (lost on process restart), persist it to files for later recovery, or use a dummy adapter for testing purposes.  The adapter keeps track of data using memoization, improving performance by reusing instances.

The `disposeSignal` function clears out memoized data associated with a specific signal when it’s no longer needed, ensuring efficient memory usage.  You can search, list, read, remove, and write data to this memory store, with the ability to perform full-text searches using BM25.  The `clear` function is important to call when the working directory changes to avoid issues with cached instances.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage during backtesting. It allows you to choose different storage methods – a simple in-memory solution, persistence to disk, or even a dummy adapter for testing purposes. You can easily switch between these options using methods like `useLocal`, `usePersist`, and `useDummy`.

The adapter keeps track of data for each signal and bucket, and it automatically clears this data when a signal is finished. You can also manually clear the entire cache with `clear`, which is useful when the base directory changes.

You can write data to memory using `writeMemory`, search for specific content with `searchMemory`, list all entries with `listMemory`, remove individual entries with `removeMemory`, and read existing entries with `readMemory`.  The `disposeSignal` function is important for cleaning up resources when a signal is no longer needed. If you need even more control, you can use `useMemoryAdapter` to plug in your own custom memory storage implementation.

## Class MemoryAdapter

The MemoryAdapter is the central hub for managing memory storage, whether you're conducting a backtest or running a live simulation. It automatically cleans up old data when signals are closed, preventing issues caused by outdated information.

Think of it as a smart manager that handles writing, searching, listing, removing, and reading memory entries. It intelligently directs these actions to either the backtest environment or the live environment, depending on your needs.

You can control the memory storage with `enable` and `disable` methods, and a clever system ensures subscriptions only happen once.  The `enable` method sets things up so that memory storage is active and will be automatically cleaned up as needed, and `disable` safely stops the storage. All of the key functions – writing, searching, listing, removing, and reading – operate on data within memory, and the adapter seamlessly directs these actions to the appropriate environment.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced during trading simulations or live trading. It’s a handy tool for getting insights into potential risks and performance.

You can think of it as a way to pull together data that's already been collected about maximum drawdowns.

Here's what it lets you do:

*   **Get Statistics:** You can request a summary of the drawdown statistics for a particular trading symbol and configuration (like strategy name, exchange, and timeframe). This gives you a quick view of key metrics.
*   **Generate Reports:** It can create detailed markdown reports listing all drawdown events for a specific symbol and strategy combination. These reports are useful for identifying patterns and understanding the factors contributing to drawdowns.
*   **Save Reports to File:**  You can easily export these markdown reports to a file, allowing you to share them or keep a record of your analysis.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is designed to track and record significant losses (maximum drawdowns) during a trading simulation. It keeps an eye on events related to these drawdowns and saves detailed information about them to a database.

This service automatically starts saving drawdown records when you activate it. It avoids accidentally writing data multiple times by only subscribing once.

When a new drawdown occurs, it captures key details like the time, the asset traded, the trading strategy used, the exchange, the timeframe, the signal ID, position size, current price, and the prices for opening, take profit, and stop loss. All of this data is stored in a consistent format for later analysis.

If you want to stop the service from recording drawdowns, you can unsubscribe it to prevent further data being written to the database. The service uses a logging mechanism to provide feedback on its actions.

## Class MaxDrawdownMarkdownService

This service helps you create and save reports detailing maximum drawdown, a crucial metric for assessing risk in trading strategies. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe.

You can think of it as a collector and reporter of drawdown information.

It has methods to retrieve the raw data, generate a formatted markdown report, and even write that report directly to a file.

To use it effectively, you'll need to subscribe to receive drawdown events, and you can unsubscribe to stop the process and clear the accumulated data. There's also a `clear` function to completely wipe out all stored data or target specific storage areas.

## Class MarkdownWriterAdapter

This component provides a flexible way to manage how your trading reports and data are stored. It uses a design pattern that allows you to easily switch between different storage methods without changing your core code.

You can choose to store reports as individual markdown files in a folder, combine all reports into a single, continuously updated JSONL file, or completely disable markdown output for testing or performance reasons. The system intelligently manages these storage instances, ensuring only one is created per report type, and it only initializes them when you actually start writing data.

You can customize the type of storage used by setting the adapter constructor. If you want the standard folder-based storage, it’s already set up as the default. If you need to refresh your storage when the working directory changes, a 'clear' function helps reset the system.

## Class MarkdownUtils

MarkdownUtils helps you control when and how markdown reports are generated for different parts of the trading framework, like backtests, live trading, or performance analysis.

You can selectively turn on markdown reporting for specific areas; remember to unsubscribe when you're done to avoid memory issues.

Alternatively, you can disable reporting entirely for certain services without affecting others, or clear the existing report data without stopping the reporting process. This gives you fine-grained control over report generation and memory management.

## Class MarkdownFolderBase

This adapter lets you generate each report as its own individual markdown file, making it perfect for organized report directories that you want to easily browse. It essentially writes each report directly to a file, so there's no need to worry about managing streams. 

The file's location is determined by a combination of a designated path and a file name you provide. The adapter will also create the necessary directories to hold these files. 

It doesn't require any special setup or initialization – it's ready to go right away. You just provide the content and the options, and it takes care of writing the report to the specified file. 

The adapter uses the `IMarkdownTarget` key to identify the kind of report.


## Class MarkdownFileBase

This class helps you create and manage files that store markdown reports in a specific, organized format. It’s designed to write reports as JSON lines (JSONL), which is great for later processing and analysis.

Think of it as a way to funnel your markdown output into a single, manageable file for each report type.

Here's a breakdown of how it works:

*   **Centralized Reporting:** Each type of report (like trade summaries, performance analysis, etc.) gets its own JSONL file.
*   **Easy Processing:** JSONL format makes it simple to process reports using standard JSON tools.
*   **Automatic Setup:** It handles creating the necessary directories and setting up the write stream.
*   **Safe Writing:** Includes safeguards to prevent data loss and handles delays.
*   **Metadata:**  Each line of the JSONL file includes key information like the symbol, strategy, exchange, frame, and signal ID, making it easy to filter and search the reports later.

The `dump` method is your main tool - it takes markdown content and adds the metadata before writing it to the file. The `waitForInit` method sets everything up initially, but you don't usually need to call it directly.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility to switch between different storage methods. It's designed to be easily adaptable, allowing you to choose how your markdown files are organized – whether that's individual files or a single JSONL file. The adapter also cleverly remembers which storage method you’re using, so you don’t have to specify it every time. 

You can quickly switch back to the standard folder-based file storage by using the `useMd` method.  Alternatively, `useJsonl` simplifies switching to the JSONL format. For testing or temporary situations, `useDummy` provides a way to discard any writes without actually saving anything.


## Class MCPValidationService

The MCPValidationService helps ensure that the models used in your trading strategies are correctly set up and available when needed. It acts as a central registry for Model Context Protocols (MCPs), keeping track of each one and verifying that it exists and is compatible with the strategy using it.

Think of it as a safeguard: it prevents you from accidentally using a model that doesn't exist or is configured incorrectly, which could lead to unexpected behavior in your backtests.

You add MCPs to this service as you define them, and the service prevents you from registering the same MCP multiple times. 

You can also ask it to check if a specific MCP is valid, but it only does this once per MCP name to avoid unnecessary checks. Finally, it provides a way to see a list of all the MCPs currently being tracked.

## Class MCPUtils

This class provides a way for an agent to interact with a live trading strategy, acting as a bridge between the strategy and the agent's messaging system. It offers several methods to view and control the strategy's activity.

You can get a snapshot of the current portfolio, view a history of past trades and their outcomes, or see messages generated directly by the strategy itself. These messages often provide insights into the strategy’s reasoning and current status.

The class also allows for manual control, letting you open or close positions and add new entries to a position using a DCA strategy.  These actions are carefully validated to ensure they align with the strategy’s rules and risk management settings.

Essentially, it’s a tool to help an agent understand what’s happening with the trading strategy and, when appropriate, influence its actions. You can request information like recent notifications, closed trades and get a current status, and interact with positions using commands.

## Class MCPSchemaService

The MCPSchemaService acts as a central place to store and manage descriptions of Model Context Protocols, or MCPs. Think of it as a library of blueprints for how different parts of your trading system communicate. 

It keeps track of these MCP blueprints, ensuring they have a basic structure when they're added. Other parts of the system, like the agent that generates messages for trading strategies, will refer to this registry to understand how things work.

You can add new MCP blueprints using the `register` method, which will replace any existing blueprint with the same name.  If you need to update a blueprint, the `override` method allows you to make small changes to a blueprint without replacing the entire definition. Finally, `get` lets you retrieve a specific blueprint by its name.

## Class LookupUtils

The `LookupUtils` acts like a central registry that keeps track of all ongoing backtests and live trading sessions. Whenever a backtest run starts, or a live session begins, or a strategy's iteration completes, an entry is recorded in this registry. 

It's important to clean up these entries when a run finishes, even if errors occur, to prevent stale data.

The `addActivity` method registers a new activity, and `removeActivity` cleans up when it's done.  If you register the same activity multiple times, the latest registration takes precedence.

You can get a quick overview of all current activities using the `listActivity` method, which provides a snapshot of the registry’s contents.

The system uses this registry to optimize performance by deciding whether to hand off tasks to the event loop when multiple operations are happening.

## Class LoggerService

The LoggerService helps you keep your trading framework's logs organized and informative. It's designed to automatically add extra details to your log messages, so you don’t have to manually add them each time.

Think of it as a central point for logging, and it relies on a logger you provide. 

It automatically includes things like the strategy name, exchange name, and the current frame being processed, along with details about the symbol, timestamp, and whether it's a backtest.

If you don't provide a logger, it will just silently do nothing.

You can customize the logging behavior by providing your own `ILogger` implementation through the `setLogger` method. 

The LoggerService holds services that manage the method and execution context, which are used to enrich log messages.


## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting environment. Think of it as a central point for all your logging needs, allowing you to easily switch between different storage methods. By default, logs are kept in memory, but you can easily change this to save them to disk or even disable logging altogether with a dummy adapter.

It uses a pattern that lets you plug in various logging implementations, making it adaptable to different needs. The `getInstance` property helps ensure that the logging instance is created efficiently, only rebuilding it when necessary, such as when the working directory changes.

You can access all your logs with `getList`, and standard logging levels like `log`, `debug`, `info`, `warn`, and `agent` are available.  If you need to change how logs are handled, the `useLogger` method allows you to define a new logging adapter.  Convenience methods like `usePersist`, `useMemory`, `useDummy`, and `useJsonl` provide shortcuts for switching to different storage configurations, including writing logs to JSONL files. Finally, `clear` ensures a fresh logging instance when needed.

## Class LiveUtils

The LiveUtils class offers tools for managing live trading operations, acting as a central point for simplified access and safety. It essentially handles the complex parts of running live strategies, like crash recovery and state persistence, so you don't have to.

It provides several core functions:

*   **`run()`**: This is the main function to start live trading for a specific symbol and strategy. It's an infinite generator, meaning it keeps running until stopped, and automatically recovers from crashes by restoring state.
*   **`background()`**: Similar to `run()`, but designed for tasks like data persistence or triggering side effects without returning trading results.
*   **Information Retrieval**:  Functions like `getPendingSignal`, `getTotalPercentClosed`, `getBreakeven`, and others give you real-time insights into the current state of a position. You can check pending signals, calculate costs, and verify breakeven conditions.
*   **Position Management**: Functions like `commitCancelScheduled`, `commitClosePending`, and `commitAverageBuy` allow for programmatic adjustments to the trading process. You can cancel scheduled trades, close positions, or add new DCA entries.
*   **Safety and Control**: Methods like `stop`, `setPaused`, and `commitCreateSignal` help control the trading process, pause trading, queue signals, or signal the strategy to stop accepting new orders.



LiveUtils utilizes a singleton pattern, meaning there's only one instance, making it readily accessible throughout your application. It also focuses on data persistence and careful state management, ensuring a robust and reliable live trading environment.

## Class LiveReportService

The LiveReportService helps you keep a detailed record of what's happening with your live trading strategies. It captures every significant event—when the strategy is waiting, when a trade is initiated, when it's active, and when it's closed—and stores that information in a database. 

It listens for these events and writes them to the database, allowing you to monitor your strategy’s performance in real-time and analyze its behavior later. The service prevents accidental duplicate subscriptions to ensure data integrity.

You can subscribe to receive these live events and unsubscribe when you no longer need them, which is particularly helpful for temporary monitoring or debugging. The `tick` property handles the event processing and logging of all tick types. It uses a logger service for debugging output.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate and save reports on your live trading activity. It keeps track of everything that happens during your trades – from when a strategy is idle to when a trade is opened, active, and finally closed.

It uses a system to organize data for each trading strategy, symbol, exchange, timeframe, and whether it’s a backtest or live trade, ensuring each combination has its own isolated storage.

You can subscribe to receive updates as trades occur, and the service builds detailed markdown tables summarizing the events. It also calculates key statistics like win rate and average profit/loss. These reports are then saved as files on your computer, making it easy to review and analyze your trading performance.

You can also clear out the accumulated data if you want to start fresh or specifically remove information for a particular trading setup. Getting the data and report is easy too, allowing you to view those statistics in a simple way.


## Class LiveLogicPublicService

This service helps orchestrate live trading, managing the behind-the-scenes details so you don't have to. It builds on another service, `LiveLogicPrivateService`, and adds automatic handling of context, like the strategy and exchange being used.

Think of it as a pipeline for your trading strategies. It continuously generates trading results – opened, closed, or cancelled – in a stream that never stops.

If something goes wrong, the system can recover, remembering its state so you can pick up right where you left off.  It keeps everything running smoothly and in real-time using the current date and time.

You provide the symbol you want to trade, and the service handles the rest, automatically managing the necessary context for your strategy's functions. 

The service relies on a logger, a private live logic service, and an exchange connection service to function.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, acting as the central coordinator. It continuously monitors market conditions in a never-ending loop, checking for new trading signals.

The service efficiently streams only the important results—when a trade is opened or closed—avoiding unnecessary data.  It uses an asynchronous generator to deliver these results in a memory-friendly way. 

If the process encounters an issue and crashes, it automatically recovers, ensuring trading continues from where it left off.  The `run` method is how you initiate this live trading process for a specific asset, and it's designed to run indefinitely.

## Class LiveCommandService

This service, LiveCommandService, acts as a central point for accessing live trading capabilities within the backtest-kit framework. Think of it as a friendly interface built on top of more complex internal components.

It handles validations, ensuring your trading strategy and risk settings are sound before things get underway.  It remembers previous validation results to avoid unnecessary checks.

The core functionality is the `run` method. This method initiates and manages the live trading process for a specific trading symbol, automatically handling potential crashes and continuing the trading loop.  You provide the strategy and exchange names, and it takes care of the rest, delivering a continuous stream of trading results.  It uses a special type of function, an async generator, to provide results as they happen.


## Class IntervalUtils

The `IntervalUtils` class helps you control how often your functions are executed within a specific time interval, which is crucial for strategies that need to avoid redundant operations. It provides two ways to do this: in-memory, where the state is held in the program's memory, or persistently, where the state is saved to a file to survive restarts. 

Think of it as a gatekeeper for your functions. You give it a function, and it makes sure that function only runs once per interval, unless it's explicitly allowed to run again. 

Each function you want to manage gets its own dedicated tracking system to prevent conflicts. 

You can also clean up these tracking systems if needed – for example, if the base directory your strategy operates in changes, which forces a refresh of these tracking systems. This class is readily available as a singleton, meaning there's only one instance of it to use across your entire application, making it easy to incorporate into your trading strategies. There’s also a method to completely reset the persistent state when necessary, ensuring a clean slate.


## Class HighestProfitUtils

This utility class helps you access and analyze reports about the highest profits achieved during trading. It's a central place to get information about top performing trades, gathered from recorded events.

You can use it to pull specific statistical data, like the highest profit achieved for a particular trading strategy and symbol.

It can also generate complete reports in markdown format, detailing all the highest profit events for a given setup. These reports can be saved directly to a file, making them easy to share and review. 

Think of it as a tool for digging into the best performances of your strategies and understanding what made them successful.

## Class HighestProfitReportService

This service is designed to keep track of your highest profit trades and save that data for later review. It specifically focuses on recording moments when a trade reaches a new peak in profitability.

It listens for events indicating a new highest profit has been achieved.  When it receives one, it writes a detailed record to a special database.

The record includes important information like the timestamp, the traded symbol, the strategy and exchange used, the timeframe, and the specifics of the trade itself, such as the signal ID, position size, current price, and stop-loss/take-profit levels.  Notably, the strategy and signal details come directly from the trade signal.

To start tracking highest profits, you need to subscribe to this service.  It's designed to prevent accidental double-subscriptions.  When you’re finished tracking, you can unsubscribe to stop saving records.

## Class HighestProfitMarkdownService

This service is designed to create and store reports detailing the highest profit achieved for your trading strategies. It listens for incoming data about trading performance and organizes it by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these performance updates, and the system ensures you won't be subscribed multiple times. Unsubscribing completely detaches the service and clears all accumulated data.

The `tick` function handles each individual performance event, routing it to the correct storage location. You can retrieve accumulated data using `getData`, generate a formatted report with `getReport`, or save the report directly to a file using `dump`. Finally, `clear` allows you to wipe the stored data, either for a specific combination of symbol, strategy, exchange and timeframe, or for everything at once.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading strategy's performance across different assets. 

It acts as a central tool for creating portfolio heatmaps, automatically gathering and summarizing statistics like profit/loss, Sharpe ratio, and drawdown for each symbol used in your strategy.

You can easily retrieve the data needed to generate a heatmap, build a formatted report, or save the report directly to a file.

The `getData` method provides the raw data, `getReport` creates a readable markdown table of your portfolio's performance, and `dump` lets you export that report as a file. It aggregates information across all your strategy's closed signals, making it simple to understand overall performance and identify top-performing assets.

## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording closed trades. It listens for signals indicating a trade has ended and saves that data, along with its profit or loss, to a database. This allows you to generate heatmap visualizations to understand your portfolio's trading patterns.

The service connects to a signal emitter to receive these closed trade notifications, and it only logs the trades that have actually finished with a profit or loss. It prevents multiple subscriptions to avoid overloading the system.

You can start listening for these events with the `subscribe` method, which returns a function you'll need to call later to stop listening. The `unsubscribe` method provides a convenient way to stop listening, even if the service hasn't been subscribed.

## Class HeatMarkdownService

This service helps you visualize and analyze the performance of your trading strategies, creating a heatmap-like view of your portfolio. It listens for trading events (specifically closed positions) and aggregates key statistics like profit/loss, Sharpe ratio, and maximum drawdown for each symbol and your overall portfolio.

It organizes data based on the exchange, timeframe, and whether you're in backtest or live mode, ensuring that each combination has its own dedicated storage. You can subscribe to receive these events in real-time, and unsubscribe when you no longer need them.

The service generates reports in Markdown format, making it easy to share and interpret your results.  You can specify which columns to include in the report and even save the report to a file. A "dump" function creates and writes the report to disk, while the "clear" function lets you reset the accumulated data for specific exchanges or clear everything completely. It handles potential errors like division by zero when calculating metrics, ensuring reliable results.

## Class FrameValidationService

This service helps you keep track of your trading timeframes (like 1-minute, 5-minute charts, etc.) and makes sure they're set up correctly before you start any trading tests or analyses. It’s like a central control panel for your timeframes.

You can use it to register new timeframes with their specific configurations.

Before you try to work with a timeframe, you can use the service to confirm it exists, preventing errors later on.

To speed things up, the service remembers which timeframes have already been validated.

Finally, you can easily get a list of all the timeframes you've registered.

## Class FrameSchemaService

This service helps keep track of different frame schemas, acting like a central library for these configurations. It uses a specialized registry to ensure everything is typed correctly and consistently. 

You can add new schemas using `register()`, update existing ones with `override()`, and retrieve them later using `get()`. 

Before a schema is added, `validateShallow` quietly checks to make sure it has the necessary properties and is structured correctly. Think of it as a quick sanity check to prevent errors down the line.

## Class FrameCoreService

The FrameCoreService is a central piece of the backtesting system, handling the creation of timeframes used for analysis. It works closely with other services like the FrameConnectionService to fetch and manage this data. Think of it as the engine that prepares the historical data—the specific time periods—that your trading strategy will be tested against.

It's designed to be used internally, so you typically won't interact with it directly in your own code.

The `getTimeframe` method is the key function, responsible for generating an array of dates representing the timeframe for a particular trading symbol and timeframe name. This array will drive the backtest iterations. 


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It intelligently directs requests to the correct frame implementation based on the current context. 

To optimize performance, it remembers (caches) the frame instances it creates, so it doesn't need to recreate them every time.

It automatically handles the routing of operations to the right frame, making it simpler to work with multiple timeframes.

You can clear the cached frames to ensure that backtests always use the most up-to-date timeframe data – crucial for avoiding stale results and ensuring the backtest reflects the most recent available information.  Without clearing the cache, it may unintentionally use outdated dates.

The service also provides a way to fetch the timeframe boundaries (start and end dates) for a given symbol, allowing you to restrict the backtest to a specific period. This is helpful for analyzing performance within defined date ranges.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your exchanges and makes sure they're set up correctly before you start trading. Think of it as a central hub for managing your exchange configurations.

It lets you register new exchanges, so the service knows about them.  You can then use it to verify that an exchange actually exists before trying to use it – this prevents errors and makes your backtesting more reliable. 

For efficiency, the service remembers the results of its validations, so it doesn't have to check the same thing repeatedly.  If you need to see all the exchanges you've registered, a simple listing function provides that information. Essentially, it’s a way to organize and double-check your exchanges.


## Class ExchangeUtils

This class, `ExchangeUtils`, offers convenient shortcuts for interacting with different cryptocurrency exchanges. Think of it as a helper tool to simplify common tasks like retrieving historical price data or order book information. It's designed to be easily accessible throughout your trading strategies.

It handles the complexities of different exchange APIs, validating data and ensuring consistency. To avoid repeating this setup for each exchange, it uses a unique, isolated instance for each one.

Here's a breakdown of what it can do:

*   **Fetch candles (price bars):** `getCandles` retrieves historical price data, automatically figuring out the right timeframe.
*   **Calculate average price:** `getAveragePrice` helps you find the VWAP (volume-weighted average price).
*   **Get latest price:** `getClosePrice` gives you the most recent closing price for a trading pair.
*   **Format numbers:** `formatQuantity` and `formatPrice` adjust quantities and prices to match the specific rules of each exchange.
*   **Retrieve order books:** `getOrderBook` fetches the current order book.
*   **Gather trade data:** `getAggregatedTrades` collects aggregated trade information.
*   **Get raw candle data:** `getRawCandles` allows you to fetch raw candle data with more control over time ranges and limits. This also has safeguards to prevent bias when working with backtesting data.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of different exchange configurations in a safe and organized way. It uses a special storage system that helps prevent errors by ensuring everything is the right type. 

You can add new exchange configurations using `addExchange()`, and easily find them again by their name using `get()`.

Before adding a new configuration, `validateShallow()` quickly checks to make sure it has all the necessary information.

If a configuration already exists, you can update parts of it with `override()`. 

The service keeps a record of all configurations and is managed by a logger for tracking purposes.

## Class ExchangeCoreService

This service acts as a central point for interacting with an exchange, providing a consistent way to retrieve data like candles, order books, and trades. It's designed to work alongside the backtesting and live trading logic, ensuring the right context – like the trading time and whether it's a backtest – is included in every request. 

It handles validation of exchange configurations to prevent errors and improve efficiency.  You can use it to fetch historical candle data, get future candles specifically for backtesting purposes, calculate average prices, and format prices and quantities in a way that considers the current trading environment. It also offers methods for retrieving order book data and aggregated trades. The raw candle retrieval allows for more granular control over data fetching, offering flexibility with date ranges and limits.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central point for interacting with different cryptocurrency exchanges. It intelligently routes requests – like fetching candles or order books – to the correct exchange based on your configured settings. Think of it as a traffic controller ensuring your requests go to the right place.

It’s designed to be efficient, caching commonly used connections to exchanges so it doesn't have to create a new one every time. This speeds up your backtesting and live trading processes.

Here's a breakdown of its functionality:

*   **Automatic Exchange Handling:** It automatically figures out which exchange to use based on the current context.
*   **Cached Connections:** It stores and reuses connections to exchanges, preventing unnecessary overhead.
*   **Comprehensive Interface:** It provides a full set of methods for common exchange interactions.
*   **Candle Data Retrieval:** You can request historical, next, or raw candle data for various symbols and time intervals.
*   **Price and Quantity Formatting:** It handles price and quantity formatting to adhere to the specific requirements of each exchange, ensuring accuracy and compliance.
*   **Order Book and Trades:** It retrieves order book data and aggregated trade data.
*   **Average Price Calculation:** Calculates the average price using real-time data in live mode or VWAP from historical candles in backtest mode.
*   **Logging:** Logs all operations for debugging and auditing.



The `getExchange` method is the key to this caching, creating and returning a connection to the appropriate exchange.  The other methods (`getCandles`, `getNextCandles`, `getAveragePrice`, etc.) all ultimately use `getExchange` internally.

## Class DumpAdapter

The DumpAdapter helps you save different kinds of data – like messages, records, tables, errors, or JSON – during a backtest run. It's like a flexible tool that can write information to different places, like files, memory, or even just discard it completely. 

Think of it as a messenger that takes data and delivers it to a chosen destination. By default, it creates a markdown file for each piece of data, organized by signal ID and bucket name.

You can easily change where the data goes; for instance, you could have it store data in memory instead of files, or simply ignore it altogether for testing purposes. It's easy to swap out the “backend” to control where the data ultimately ends up.

Before you start dumping data, you need to "enable" the adapter to listen for events. When you're finished, you can "disable" it. You can also clear its memory if the base directory changes.

## Class CronUtils

This utility class, `Cron`, helps schedule tasks that run at specific times related to the backtesting process. It's designed to coordinate these tasks efficiently, even when multiple tests run in parallel.

Think of it as a way to ensure things happen in sync across different tests – like updating data or performing calculations – exactly when they should.

Here's a breakdown of how it works:

*   **Shared Coordination:** It prevents multiple tasks from running simultaneously at the same time point across parallel backtests. Each task gets a chance to run without conflicts.
*   **Entry Management:** It keeps track of registered tasks and their generation numbers, preventing old tasks from interfering with new ones.
*   **Memory Management:** It provides ways to clean up old tasks and data to keep things efficient.
*   **Lifecycle Integration:** It can automatically subscribe to events within a backtest to trigger these scheduled tasks.
*   **Resetting:** It has a `dispose` function to completely clear all scheduled tasks if needed.



Essentially, `Cron` is your tool for precisely timing and coordinating actions within a backtesting framework.

## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages used to calculate take-profit and stop-loss levels, designed around a Kelly Criterion approach with risk decay. These constants help manage risk and lock in profits at various stages of a trade.

Specifically, TP_LEVEL1, TP_LEVEL2, and TP_LEVEL3 represent different take-profit targets, triggering at 30%, 60%, and 90% of the distance to the overall take-profit goal, allowing for early profit capture and gradual exits. Similarly, SL_LEVEL1 and SL_LEVEL2 act as stop-loss triggers, at 40% and 80% of the distance to the overall stop-loss goal, designed to minimize potential losses and protect capital. These levels are intended to be used in conjunction with other backtest-kit features to create robust trading strategies.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading configurations are mathematically sound and have a chance to be profitable. It acts as a safety net, checking your settings before they’re used.

It looks at things like slippage, fees, and profit margins, ensuring they’re set up correctly to avoid negative values. The service also performs a key check – guaranteeing your take-profit distance is large enough to cover all trading costs like slippage and fees. 

Beyond that, it verifies relationships between settings, like making sure minimum values are less than maximum ones, and checks that time-related parameters and candle data settings are valid positive integers. Essentially, it helps prevent common errors that could lead to unprofitable trades.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It's designed to catch potential errors before they cause problems in your application.

Essentially, it checks your column definitions against a set of rules to verify they’re consistent and valid. 

Here’s what it does:

*   It confirms that each column has all the necessary information: a unique identifier (key), a display name (label), a formatting instruction (format), and a visibility setting (isVisible).
*   It verifies that the identifier and display name are actually text strings and aren't empty.
*   It makes sure the formatting and visibility instructions are functions that can be executed.
*   Finally, it guarantees that each column uses a unique identifier within its group.

The `validate` method performs all these checks at once on your column configurations. The `loggerService` is used for reporting any validation issues.

## Class ClientSweep

ClientSweep provides a way to efficiently search for the best parameter combinations for your trading strategies, often called a "sweep." It helps you evaluate many strategy ideas simultaneously without performing a full backtest for each one. Think of it as a first pass to narrow down promising ideas before doing more rigorous testing.

It focuses on grading individual authors and their ideas in isolation, without considering interactions between strategies. This allows for a fast and independent ranking.

The process involves several steps:

1.  It starts by cleaning up your list of ideas, removing duplicates and focusing on directional trades.
2.  It gathers data (candle profiles) for each idea.
3.  It learns which authors to exclude from consideration based on their performance history.
4.  It then systematically evaluates each strategy idea across a range of parameter settings (grid points).
5.  Finally, it ranks the results based on metrics like Sharpe Ratio, Sortino Ratio, and total Profit and Loss.

The ClientSweep is designed to be fast and stateless – each run is independent, and it’s meant to *suggest* parameters, not replace full backtests. You'll need to validate the best parameters found with a complete backtest (Backtest.run) to ensure their reliability. The whole process is broken down into phases, each offering an opportunity for you to track its progress and get information about what's happening.

## Class ClientSizing

This component, ClientSizing, figures out how much of an asset to trade based on a set of rules. It offers several ways to calculate position sizes, including fixed percentages, the Kelly criterion, and using Average True Range (ATR). You can also set limits on the minimum and maximum positions, and a ceiling on the percentage of capital at risk. It’s designed to work with strategies to determine the best amount to invest in each trade and includes options for custom validation and logging.

The `calculate` method is the core function that performs the size calculation, using the provided parameters to determine the optimal position size while respecting the defined constraints.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, preventing them from exceeding configured limits. Think of it as a safety net for your portfolio.

It controls things like the maximum number of positions a strategy can hold at once, and allows for custom checks on signals before trades are made. Multiple strategies can share the same ClientRisk instance, enabling a broader view of risk across all strategies.

The ClientRisk object tracks active positions in a map, using unique identifiers combining strategy, exchange, and symbol names. This map is updated and persisted (unless you're in backtest mode).

Before a signal is acted upon, `checkSignal` validates it against the defined limits. `checkSignalAndReserve` goes a step further, atomically checking the signal and temporarily marking a slot in the position map to prevent concurrency issues. Crucially, after using `checkSignalAndReserve`, you must either confirm the trade with `addSignal` or cancel it with `removeSignal` to avoid leaving "phantom" positions.

When a trade is opened, `addSignal` registers the new position, and when a trade is closed, `removeSignal` removes it. These methods are called by the system to maintain an accurate picture of active trades.

## Class ClientFrame

The ClientFrame helps generate the timelines your backtests need. It's responsible for creating arrays of timestamps that represent the historical periods you're testing against. To avoid unnecessary work, it remembers previously calculated timelines and reuses them.

You can control how closely spaced those timestamps are, choosing intervals from one minute to one day. 

It also lets you add custom checks or logging during the timeline creation process. This component works closely with the core backtesting logic to manage these timelines efficiently.

The `getTimeframe` property is key - it's the function you'll use to get the timeline data for a specific trading symbol, and it's designed to be fast and avoids recalculating if the data already exists.

## Class ClientExchange

The `ClientExchange` class provides a way to interact with exchange data, specifically tailored for backtesting and trading. It handles fetching historical and future candle data, calculating VWAP, and formatting price and quantity information according to exchange rules.

To get historical candle data, you can use `getCandles` to fetch backwards from a specific time, or `getNextCandles` to get future candles, which is useful for simulating signal durations during backtesting.  `getAveragePrice` calculates a volume-weighted average price using the last few 1-minute candles, and `getClosePrice` retrieves the closing price of the most recent completed candle for a given interval.

For formatting, `formatQuantity` and `formatPrice` adjust values to match the exchange’s required precision and rounding.  You can fetch raw candle data with `getRawCandles`, offering flexible date and limit parameters.  `getOrderBook` gets order book data, and `getAggregatedTrades` retrieves aggregated trade information, both respecting the current time to avoid data look-ahead.  This class aims for efficiency using prototype functions and includes safeguards to prevent look-ahead bias and ensure accurate data retrieval.


## Class ClientAction

The `ClientAction` component is a key part of the backtest-kit, acting as a central hub for managing and executing custom action handlers. It's designed to give you a structured way to connect your trading logic (like state management, logging, notifications, and analytics) to the core strategy execution.

Think of it as a conductor orchestrating different parts of your trading system.  It handles the lifecycle of your action handlers, ensuring they're initialized correctly and cleaned up when no longer needed. It also routes different types of events—signals from live or backtest modes, breakeven and profit/loss events, and various lifecycle events—to the appropriate handler methods.

`waitForInit` and `dispose` utilize a special pattern to guarantee initialization and cleanup happen just once.

Several methods handle specific event types (`signal`, `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled`, `scheduleEvent`, `pendingEvent`, `pingActive`, `riskRejection`, `orderSync`, and `orderCheck`), each acting as a gateway for different signals and data. Some of these events use manual wiring to connect to specific callbacks, allowing for highly customized responses.  Error handling is deliberately different for `orderSync` and `orderCheck`, ensuring certain exceptions are handled upstream.


## Class CacheUtils

CacheUtils provides a way to automatically cache the results of your functions, which can significantly speed up your backtesting process. Think of it as a helper to avoid recalculating things you've already figured out.

You can wrap regular functions to cache their results based on time intervals – for example, caching price data for a specific timeframe.

For asynchronous functions that might benefit from persistent storage, there’s also a way to wrap them with file-based caching. This means the results are read from and written to disk, like a more durable cache. File-cached functions store data under a specific directory structure.

If you need to manually clean up the cached results for a particular function, you can use the `dispose` method.

The `clear` and `resetCounter` methods are useful for managing the cache when your working environment changes, ensuring a clean slate for new backtesting iterations. `clear` wipes out all caching, while `resetCounter` makes sure file indexes are fresh.

Essentially, CacheUtils helps optimize your backtesting by managing and clearing function caches automatically.

## Class BrokerBase

This class provides a base for creating adapters that connect your trading strategies to exchanges. Think of it as a starting point for "speaking" the language of a specific broker like Binance or Coinbase.

It handles the core plumbing, like logging events and ensuring consistent behavior, so you don't have to write all that from scratch.

Here's a breakdown of what it does:

*   **Provides a Foundation:** It implements all the necessary functions defined by `IBroker`, so your custom adapter is fully compliant.
*   **Default Behavior:**  It provides "no-op" implementations for common actions, so you only need to override what’s specific to the exchange you're connecting to.
*   **Event Logging:**  It automatically logs important events, making debugging and monitoring easier.

**How to Use It:**

1.  **Extend it:** Create a new class that inherits from `BrokerBase`.
2.  **Implement Exchange Logic:** Override the relevant methods (`onOrderOpenCommit` for placing orders, `onOrderCloseCommit` for closing them, etc.) to interact with the exchange's API.
3.  **Initialization:**  Use the `waitForInit` method to establish connections and authenticate with the exchange. This happens before your strategy starts running.
4.  **Lifecycle Events:** Implement the other methods (like `onSignalActivePing`, `onSignalScheduleOpen`) to handle specific events and mirror them into your own systems.

The framework calls these methods when certain actions are needed – placing orders, updating stop-loss levels, handling notifications, etc. These events only happen when in live mode, not in backtesting scenarios.  Essentially, it’s about translating the actions your strategy wants to take into the specific commands the exchange understands.

## Class BrokerAdapter

The `BrokerAdapter` acts as a safety net and intermediary when your trading strategy interacts with a broker. It’s like a checkpoint before any changes are made to the core trading logic, ensuring everything goes smoothly.

During testing (`backtest` mode), it essentially does nothing, allowing the backtest to proceed without actual broker communication.  When running live, it forwards signals to the registered broker adapter.

Think of it as having multiple points of control:

*   **Signals:** It handles signals related to opening and closing positions (`commitOrderOpen`, `commitOrderClose`, etc.), automatically sending them to the broker if enabled.
*   **Pings:** It sends periodic "ping" messages to the broker to keep the connection alive.
*   **Modifications:**  It intercepts important actions like setting profit targets, stop-loss orders, or averaging buy positions (`commitPartialProfit`, `commitTrailingStop`, etc.) before they're finalized, offering a chance to cancel the operation if something goes wrong.  If one of these "commit" methods encounters an error, it stops the process and prevents any changes to your trading data.
*   **Scheduling:** It handles scheduled signals and cancellations, with important considerations for potential race conditions with the broker's order management.

You register a broker adapter using `useBrokerAdapter` and activate the adapter using `enable`. `disable` deactivates the adapter, and `clear` resets internal caches to ensure a fresh connection when needed. It’s designed to prevent errors and help ensure consistent and reliable trading.

## Class BreakevenUtils

This class offers tools for understanding and reporting on breakeven events within your trading framework. Think of it as a way to easily access and visualize data related to when your strategies reached breakeven points.

It provides methods to pull out statistical summaries of breakeven events, like how many times they occurred. You can also generate detailed reports in Markdown format, presenting individual events in a clear, table-like structure including factors like entry price, signal ID, and position.

Finally, it simplifies the process of exporting these reports to files, automatically creating the necessary directories and giving the files a standardized naming convention. This class helps make sense of breakeven data and share insights with others.


## Class BreakevenReportService

The BreakevenReportService helps you track when your trading signals become profitable. 

It acts like a dedicated recorder, listening for moments when a signal reaches its breakeven point – that crucial stage where it starts making money. 

It diligently captures all of these "breakeven" events, including details about the signal itself, and stores them for later review. This information is then saved to a database.

To use it, you’ll subscribe to its signal, and when you're finished, you can unsubscribe. It ensures you don’t accidentally subscribe multiple times, which could lead to unwanted logging. The service uses a logger to help you debug any issues.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them by symbol and strategy, then generates readable markdown tables summarizing the data. 

You can subscribe to receive these events, and the service keeps track of them for each unique combination of symbol, strategy, exchange, frame, and backtest.  It provides functions to retrieve overall statistics, generate the markdown report itself, and save the report directly to your disk. 

To keep your reports organized, each symbol and strategy combination gets its own isolated storage area.  You can also clear the accumulated data if you want to start fresh or remove specific entries.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central point for managing breakeven tracking within the system. It's designed to be injected into the ClientStrategy, providing a consistent way to handle breakeven operations.

It essentially sits between the strategy and the underlying connection layer, logging all breakeven-related actions before passing them on. This allows for centralized monitoring and debugging of these operations.

Several services are injected to support its functions, including services for logging, handling connections, validating strategies, risks, exchanges, frames, and actions. 

The `validate` function checks if a strategy and its associated risk configuration are valid, and it remembers the results to avoid unnecessary checks.

The `check` function determines if a breakeven should be triggered and, if so, initiates the process. The `clear` function is used to reset the breakeven state when a signal closes.


## Class BreakevenConnectionService

The BreakevenConnectionService manages tracking breakeven points for trading signals. It's designed to avoid creating unnecessary duplicate tracking objects, instead using a caching system to create and reuse them for each unique signal. 

Think of it as a factory that creates specialized "ClientBreakeven" objects for each signal, and it keeps track of them efficiently. It works closely with other services like the logging and action management systems.

The service provides functions to check if a breakeven event should occur and to clear the breakeven state when a signal is closed. It’s automatically set up and used by the broader trading strategy framework. The caching system ensures that resources are cleaned up properly when signals are no longer needed.

## Class BacktestUtils

This class provides tools for running and analyzing backtests within the trading framework. It acts as a central point for interacting with the backtest engine.

You can use `run` to execute a backtest for a specific symbol and strategy, receiving results as they become available. The `background` function performs backtests in the background without directly providing results, ideal for tasks like logging or triggering callbacks.

Several functions allow you to query the state of a running backtest, such as `getPendingSignal` to retrieve the current pending signal or `getTotalPercentClosed` to determine the percentage of the position that has already been closed. You can also retrieve data related to DCA entries, costs, and profit/loss calculations using functions like `getPositionInvestedCost` and `getPositionPnlCost`.

The `hasNoPendingSignal` and `hasNoScheduledSignal` functions are useful for controlling when signals are generated, allowing you to prevent unwanted actions.

There are also functions to manage the backtest process, like `stop` to halt a backtest and `commitCreateSignal` to inject custom signals. The `commitClosePending` and `commitCancelScheduled` functions allow for the early closing of pending or scheduled signals.

Finally, `getData` and `getReport` are useful for collecting and summarizing backtest results, and `dump` saves these results to a file.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It's designed to capture every significant event related to your trading signals – when they're idle, when they're opened, actively trading, and when they're closed. 

Think of it as a meticulous observer, constantly logging all the details of each tick event. This information is then stored persistently so you can review it later for analysis and debugging.

You subscribe to receive these events, and the service makes sure you aren't accidentally subscribed multiple times.  When you're finished, you can unsubscribe to stop the logging. It handles the details of stopping the recording process cleanly.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports summarizing your backtesting results. It listens for incoming data (ticks) during a backtest and keeps track of the trading signals generated by your strategies. 

It organizes this information for each symbol and strategy you're testing and stores it in a way that allows for efficient retrieval. You can then request reports, which are formatted as easy-to-read markdown tables detailing the signals.

The service automatically saves these reports to your logs directory, making it simple to review and analyze your backtest performance. You have the option to clear the stored data when it's no longer needed, or just clear data for a specific strategy and symbol combination.

To use it, you'll need to subscribe to the backtest signal emitter, and the service will handle the rest, processing ticks and creating reports. When you're done, you can unsubscribe to stop receiving events.

## Class BacktestLogicPublicService

This service helps you run backtests and manage the details of the process. It acts as a layer on top of the private backtest logic, making it easier to use by automatically handling things like strategy and exchange names. 

Essentially, it simplifies running backtests by automatically passing along necessary information to the underlying functions.

Here's a breakdown of its components:

*   **loggerService:** Provides access to logging and execution context.
*   **backtestLogicPrivateService:** The core logic for conducting the backtest.
*   **timeMetaService:** Manages time-related data for the backtest.
*   **frameSchemaService:** Handles the structure and format of data frames used in the backtest.
*   **exchangeConnectionService:** Manages connections to the exchange data.

The key method is `run`.  This method takes a symbol (the asset you're backtesting) and context information (strategy, exchange, and frame names). It then runs the backtest and returns a stream of results representing the outcome of each tick (a unit of time) – signals to open, close, or cancel trades. Because of the context management, you don't have to keep passing these details around in every function call.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the overall process of running a backtest. It works by first retrieving the available timeframes from a frame service.

Then, it steps through these timeframes, processing each one. When a trading signal appears (like an order to buy or sell), it fetches the relevant historical price data (candles) and executes the backtesting logic.

The system intelligently skips over timeframes that don't involve active trading signals, focusing only on periods with open positions.  As positions close, the backtest provides you with the results, streaming them one by one instead of building up a large list.

You can also stop the backtest early if you need to. This service relies on several other core services like strategy core, exchange core, frame core, action core, and time/price meta services to function. The `run` method is the main entry point, taking a symbol as input and returning a stream of results.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. Think of it as the main entry point for initiating and managing backtest processes. 

It bundles together several other services like validation and logic handling, making it easy to integrate backtesting into your application. 

You can use it to validate your trading strategies and their associated risk configurations, and it's designed to remember previous validations to speed things up.

The core function, `run`, is how you actually start a backtest – you provide it with a symbol and context information to specify the environment in which the backtest will execute. It then returns a series of results detailing what would have happened during the backtest period.

## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your action handlers, which are crucial components of your trading strategies. Think of it as a central manager for ensuring your actions are properly set up and available. It lets you register new action handlers, so the system knows about them.

Before any trading actions happen, you can use this service to double-check that the expected handler actually exists. To make things faster, it remembers the results of previous validation checks, so it doesn’t have to repeat the same checks over and over. Finally, you can get a complete listing of all the action handlers that have been registered with the service. 

The `addAction` method lets you register action schemas.
The `validate` method confirms an action handler is present.
The `list` method shows you all registered action handlers.


## Class ActionSchemaService

This service acts as a central manager for action schemas, ensuring they're set up correctly and consistently. It uses a type-safe system to store these schemas, making sure everything is in order.

It checks action handlers to confirm they only use the approved public methods.

Here’s a breakdown of what it does:

*   It lets you register new action schemas, verifying they're structurally sound and use valid methods. You'll get an error if you try to register a schema with a name that’s already taken.
*   Before registration, it performs a quick check to ensure basic properties are present and of the correct type, and that the handler’s public methods are allowed.
*   You can update existing action schemas by providing a partial update, which is convenient for small changes without needing to re-register the whole thing.
*   It provides a way to retrieve an action schema by its name, allowing access to the full configuration including the handler and callbacks.



The `loggerService` property allows it to log information. The `_registry` property holds the actual action schema storage.

## Class ActionProxy

ActionProxy acts as a safety net around your custom trading logic, ensuring that any errors in your code won't crash the entire trading system. Think of it as a proxy that intercepts calls to your trading functions and adds extra protection.

It handles key events during trading, like signal generation, breakeven calculations, profit/loss adjustments, scheduled events, and risk rejections. For each of these, it wraps your code in a special error-catching block.  If an error occurs within your custom logic, it's logged and reported, but the trading process continues—preventing the unexpected halt of trading.

The system utilizes a factory pattern, which means you don’t directly create an ActionProxy. Instead, you use the `fromInstance` method to create it, passing in your own action logic and some parameters. This ensures that all error-handling mechanisms are in place from the start.

It’s important to note that a few methods, like `orderSync` and `orderCheck`, are deliberately *not* wrapped in error-handling. These are critical gates for order management, and any errors here need to be surfaced immediately.

Essentially, ActionProxy allows you to develop and test custom trading strategies with confidence, knowing that errors will be handled gracefully and won’t derail your trading operations.


## Class ActionCoreService

The ActionCoreService is a central component responsible for managing how actions are handled within your trading strategies. It essentially acts as a dispatcher, taking action lists defined in your strategy's schema and triggering the appropriate handlers for each action. 

Here's a breakdown of what it does:

*   **Orchestrates Actions:** It takes action lists from your strategy's schema and calls the necessary functions to handle them.
*   **Validates Configurations:** It checks that your strategy and the actions it uses are configured correctly, including validating strategy names, exchanges, and risks. This validation is cached to avoid repetitive checks.
*   **Lifecycle Management:** It has functions to initialize, signal, and dispose of actions, ensuring everything is set up and cleaned up properly.
*   **Signal Routing:** It provides several functions (`signal`, `signalLive`, `signalBacktest`) to route trading signals to the appropriate actions based on whether it's a backtest, live trading, or other scenarios.
*   **Event Handling:**  It handles various events like breakeven availability, partial profit/loss, scheduled pings, and risk rejections, routing them to the relevant actions.
*   **Synchronization:** The `orderSync` and `orderCheck` methods ensure that certain actions are coordinated across all registered actions, with failures propagating.
*   **Cleanup:** It provides a `dispose` method to clean up resources when a strategy is finished, and a `clear` method to remove action data.

## Class ActionConnectionService

This service acts as a central hub for directing different types of events (like signals, breakeven notifications, or scheduled tasks) to the correct action handlers within your trading strategies. It intelligently routes these events based on the action name, the strategy being used, and the specific frame of time. To improve efficiency, it remembers previously used action handlers, so it doesn't have to recreate them repeatedly.

Think of it as a traffic controller that makes sure each event gets to the right place.

Here’s a breakdown of what it does:

*   **Action Routing:** It takes an action name and figures out which part of your code should handle that event.
*   **Caching:** It stores frequently used action handlers to avoid unnecessary creation, which speeds up the process. This caching considers strategy, exchange, and time frame so that action handlers are unique to the context.
*   **Event Handling:** It provides specific methods (`signal`, `breakevenAvailable`, `orderSync`, etc.) for various event types, each directing the event to the appropriate action handler.
*   **Lifecycle Management:**  It handles setup (`initFn`), cleanup (`dispose`), and clearing cached handlers (`clear`).
*   **Special Considerations:** Some events like `orderSync` and `orderCheck` bypass error handling to ensure immediate propagation of issues.

## Class ActionBase

This class, `ActionBase`, is your starting point for creating custom actions within the backtest-kit trading framework. Think of it as a template—you extend it to add your own logic for things like sending notifications, managing data, or triggering custom events.

It handles a lot of the groundwork for you, like logging events and giving you access to important information about the strategy and the current situation (strategy name, timeframe, action name).

Here's a breakdown of what you can do:

*   **Initialization:** The `init()` method lets you set up anything you need when the action starts, like connecting to a database or an API.
*   **Event Handling:** Several methods (`signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, etc.) are called at different points during the strategy's lifecycle. `signal` handles events in all modes, while `signalLive` and `signalBacktest` are specific to live and backtesting environments, respectively.
*   **Lifecycle Management:** The `dispose()` method is called when the action is finished, allowing you to clean up resources like closing connections or saving data.

The framework will automatically log all the events for you if you don't override the default behavior.  It's designed so that you only implement the things you *need* – unused methods have no default implementations to avoid unnecessary code.  The `ping` methods (`pingScheduled`, `pingActive`, `pingIdle`) offer insights into different states the strategy might be in. Finally, `riskRejection` tells you when a signal was blocked by risk management.

The deprecated `orderSync` and `orderCheck` methods—related to order placement—are intentionally left unimplemented by default to avoid potential issues and encourage using the recommended `Broker.useBrokerAdapter` approach.
