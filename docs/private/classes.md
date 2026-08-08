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

The WalkerValidationService helps you keep track of and check the settings for your parameter sweeps, which are used to optimize strategies and find the best hyperparameter combinations.

It acts like a central registry for these sweeps, allowing you to register new ones and ensuring they exist before you try to use them. 

For efficiency, it remembers the results of previous checks, so validation is faster the second time around.

Here's what it lets you do:

*   Add new parameter sweep configurations using `addWalker`.
*   Verify that a sweep exists and its associated strategy is valid using `validate`.  This also checks the strategy's risks and actions.
*   Get a list of all registered parameter sweeps using `list`.

## Class WalkerUtils

WalkerUtils provides helpful tools to manage and run walker comparisons, which are essentially tests of trading strategies. Think of it as a convenient helper for automating and analyzing your trading systems. It simplifies the process of running these comparisons by handling logging and automatically identifying important information from the walker's setup.

You can use `run` to execute a walker and get results, or `background` to run it in the background if you just need it for things like logging or callbacks.  `stop` lets you pause a walker’s signal generation, ensuring no new signals are produced – useful for controlled experiments or stopping a runaway process.

The `getData` function retrieves the detailed results from the strategies within a walker.  `getReport` and `dump` help you generate and save a formatted report summarizing the walker's performance. Finally, `list` gives you a quick overview of all currently running walkers and their statuses. It’s designed to be easy to use, offering a single instance for simple access and ensuring each symbol and walker pairing gets its own dedicated processing space.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your walker schemas, ensuring they're well-defined and consistent. It uses a special system to store these schemas in a way that catches errors early on.

You can add new walker schemas using the `addWalker` function. To get a schema back, simply ask for it by name.

Before a new schema is added, it's checked to make sure it has all the necessary parts. 

If you need to update an existing schema, you can override specific parts of it without having to redefine the whole thing. 

The service also has a logger to help you track what's happening.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for updates as your strategies are tested and saves the results to a database, letting you compare different approaches. 

It's designed to log the key metrics and statistics from each test run, and it also keeps tabs on the best-performing strategies and the progress of the optimization process itself. 

To get started, you’ll subscribe to the walker emitter to receive these updates.  The subscribe function ensures you don't accidentally overload the system by subscribing multiple times, and provides a way to stop listening. If you no longer need to monitor the optimization, use the unsubscribe function to stop receiving updates.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they run. It listens for updates from the trading process, carefully collecting results for each strategy.

Think of it as a record-keeper for your backtesting or live trading. It builds up data for each strategy, and then transforms that data into easy-to-read markdown tables.  These tables are then saved to files, making it simple to review and compare performance.

Here's a breakdown of how it works:

*   It connects to the trading process to receive updates.
*   It keeps track of results for each strategy individually, so you can compare them side-by-side.
*   It takes all that collected data and turns it into well-formatted markdown reports.
*   Finally, it saves those reports to files, typically in a `logs/walker/{walkerName}.md` structure.

You can clear the accumulated data at any time, either for a specific trading strategy or all of them. This helps keep the reports manageable and focused on the most recent performance.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are the core components of your trading strategies. Think of it as a conductor orchestrating different parts of the trading process. 

It automatically passes important information like the strategy name, exchange, and frame to the walkers, so you don't have to manually handle it.

The `run` method is key - it lets you specify a symbol (like a stock ticker) and context, and then it executes all the strategies associated with that symbol. It delivers results as a series of steps, allowing you to process them sequentially.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies against each other. It orchestrates the process, making it easier to see which strategies perform best.

It works by running each strategy one after another and providing updates as they finish. During the comparison, it keeps track of the best performing strategy based on a chosen metric.

Finally, you'll receive a complete report, ranking all the strategies you tested. It relies on other services like BacktestLogicPublicService to handle the actual backtesting process.


## Class WalkerCommandService

WalkerCommandService acts as a central point to interact with the walker functionality within the backtest-kit framework. It's designed to be easily integrated into your applications through dependency injection.

This service manages several key components, including validation services for strategies, exchanges, frames, walkers, and risks. It also includes a `validate` method that performs comprehensive checks on walker and strategy configurations, with an extra layer of validation to ensure accuracy.

The primary function of WalkerCommandService is to execute walker comparisons.  You can trigger this comparison for a specific symbol, while also providing context information like the walker, exchange, and frame names being used. The result is an asynchronous generator, allowing you to process the comparison data incrementally.

## Class TimeMetaService

The TimeMetaService helps you reliably get the current candle timestamp, even when you’re not directly within a trading tick. It acts like a central record, remembering the latest timestamp for each symbol, strategy, exchange, and frame combination.

Essentially, it keeps a running log of these timestamps, updating it with each tick from your strategies. If you need to know the current candle time outside of a normal trading cycle—like when triggering an action—this service provides that information.

If a timestamp hasn't been received yet, it’ll wait briefly (up to a defined timeout) for the first one to arrive. You can also clear the memory it's using to ensure you have fresh data when needed, especially at the start of a new strategy execution. It’s designed to be easily managed, automatically updated, and works seamlessly within the broader backtest-kit framework.



The `hasTimestamp` function lets you quickly check if a timestamp exists before trying to retrieve it.

The `next` function is internally used to update the timestamp.

The `clear` function is crucial for resetting the service's state, particularly at the start of a new trading session.

## Class SystemUtils

SystemUtils helps keep your backtest sessions clean and separate. It prevents one backtest from accidentally messing with the data of another.

Think of it as a way to temporarily pause and reset how your system reacts to events. 

The `createSnapshot` function is a key tool for this. It takes a picture of how your system is currently responding to events (essentially, its listeners).  This lets you start a new backtest without any lingering influence from previous ones. Later, you can restore that snapshot to get everything back to how it was.

## Class SyncUtils

SyncUtils helps you understand what's happening during your trading signals. It gathers and organizes information about signals being opened and closed, letting you analyze their lifecycle.

Think of it as a detective for your trading, collecting clues about when signals start and end.

You can ask it for overall statistics like total signals, how many were opened, and how many were closed. It can also create detailed reports in a readable markdown format, showing you the specifics of each signal: what symbol it involved, the strategy used, the direction of the trade, entry and exit prices, and profit/loss information.

The reports are structured as tables with customizable columns. Finally, you can easily save these reports to files for later review and analysis. It organizes data from events tracked by a separate service, keeping a record of up to 250 events for each combination of symbol, strategy, exchange and frame.

## Class SyncReportService

The SyncReportService helps you keep a detailed record of what's happening with your trading signals, particularly when orders are placed and exited. It's designed to track signal lifecycle events, like when a signal is initially triggered and when a position is closed.

It listens for these events and saves them, along with important information like profit and loss and why the position was closed, into report files.

You can think of it as an auditor for your trading system, providing a trail of what happened and why.

To use it, you'll subscribe to the signal events; this ensures you only register once. When you no longer need the reporting, you can unsubscribe.

## Class SyncMarkdownService

This service is designed to automatically create and save reports about your trading signals. It keeps track of signal openings and closings for each symbol, strategy, exchange, and timeframe you're using, whether it’s a backtest or live trading.

To start using it, you need to subscribe to a stream of signal events. Once subscribed, the service listens for those events and organizes them into a storage system. You can then request statistics, generate a formatted markdown report, or even save the report directly to a file.

It’s designed to be efficient, so it prevents multiple subscriptions to the signal event stream. You can also clear the collected data – either for a specific combination of symbol, strategy, and timeframe, or clear everything. The reports generated contain detailed information about the signal lifecycle and include overall statistics to give you a quick overview of what’s happening.


## Class SweepValidationService

This service keeps track of all the sweeps (essentially, sets of data and rules for trading) that are being used. It makes sure that each sweep actually exists and that its associated exchange is valid before anything tries to use it. 

Think of it as a quality control check for your sweeps – it prevents errors by ensuring everything is set up correctly.

You register a sweep with this service when you create it, and it won’t let you register the same sweep name twice.

It also provides methods to check if a sweep is valid and to see a list of all the sweeps that have been registered. This helps ensure consistency and avoids issues when running backtests or live trades.


## Class SweepUtils

SweepUtils provides a way to systematically test and evaluate numerous trading strategies, or "ideas," across a range of parameters. Think of it as a way to run a massive, automated experiment on different trading approaches.

It profiles each idea by simulating just one candle per trade, then calculates a grid of potential outcomes, ranking the best performers based on criteria like Sharpe ratio, Sortino ratio, profit and loss, and recovery. Each strategy's performance is tracked individually, with its own set of rules.

You can adjust several parameters that control how these strategies are tested, including:

*   **Exit strategies:** You can set limits for how quickly trades should be exited (hardStopPercent, trailingTakePercent, profitLockPercent, holdMinutes).
*   **Entry rules:** Every trading idea gets a chance to enter a trade - there are no initial restrictions.
*   **Author grading:** Strategies are assessed based on their historical success – how often they were profitable before a stop-loss was triggered.

The framework doesn't consider interactions between strategies; it focuses on evaluating each one in isolation. The ultimate test of any chosen parameters is a more realistic, full backtest using a dedicated engine.

The `run` function is the core of the process. It takes a list of trading ideas and executes the simulation, handling data filtering and profile generation behind the scenes. It then uses a pre-defined schema to evaluate the performance of each strategy across a grid of parameter combinations. The final result is a comprehensive report detailing the best-performing strategies, along with detailed performance data for each one.

## Class SweepSchemaService

The SweepSchemaService acts like a central address book for sweep schemas, which are essentially blueprints for how to execute trading strategies. It keeps track of these schemas, associating each one with a unique name. 

When a new schema is added, it undergoes a quick check to make sure it has the necessary basic information. 

This service is crucial because other parts of the system use it to create and manage the actual trading processes.

Here's a breakdown of what it can do:

*   **Registration:** You can register a new schema, giving it a name and storing the schema details. If a schema with that name already exists, it will be replaced.
*   **Overriding:** You can modify existing schemas, only changing specific parts of them. The service then combines the original schema with your changes.
*   **Retrieval:** You can look up a schema by its name to get the full set of details.

The service also has internal components for logging and schema validation, ensuring that the schemas are consistent and accurate.

## Class SweepGlobalService

SweepGlobalService acts as the central access point for performing sweeps, the core process of backtest-kit. It ensures the sweep you're requesting actually exists and is compatible with the exchanges you’re using before passing the work along to specialized components. 

Think of it as the gatekeeper and coordinator for the entire sweep execution process. 

It relies on other services – a connection service for managing sweep data and a validation service for checking everything is correct.

The `run` method is the key function to use; it takes a description of the sweep (symbol, name, and ideas) and handles the entire simulation workflow, which includes filtering author ideas, evaluating the grid, and generating rankings. This method gives you the final simulation results.


## Class SweepCoreService

The SweepCoreService acts as the central engine for running sweep simulations. It verifies that everything needed for a sweep—like the data sources and settings—is available before proceeding. 

It works in conjunction with other services, receiving requests and then passing them on to manage the actual connections and cached data.

The `run` function is the key method here. When you call it with a symbol, sweep name, and a list of ideas, it orchestrates the entire simulation process: first checking the validity of the sweep, then analyzing profiles, applying filters, evaluating the grid, and ultimately ranking the results. This process delivers a comprehensive `ISweepResult` containing the simulation outcome.

## Class SweepConnectionService

The SweepConnectionService manages the connections and lifecycle of your sweep operations. It's responsible for retrieving and reusing client sweep instances, ensuring you don’t create unnecessary overhead.

It uses a clever memoization technique, so it only creates one client for each sweep name you use. If the sweep schema doesn't define grid axes, it uses default settings.

You can use `getSweep` to obtain a ClientSweep for a specific name—it handles the creation and caching for you. 

The `run` method is your main entry point for executing a complete simulation, taking a data transfer object (DTO) with symbol, sweep name, and ideas as input. This method orchestrates the process from profiling to ranking.

Finally, `clear` allows you to discard all memoized clients, forcing a refresh from the original schema—useful for testing or when you need to ensure you're working with the latest definitions.

## Class StrategyValidationService

The StrategyValidationService helps keep your trading strategies organized and makes sure they're set up correctly. It acts like a central manager for all your strategy definitions.

You can add new strategies using `addStrategy()`, which registers them for later use. 

When you need to use a strategy, `validate()` checks to ensure it exists and that all related settings—like risk profiles and actions—are also valid. This helps prevent errors down the line.

To see a complete overview of all your registered strategies, use `list()`. The service also remembers validation results to speed things up, so repeated checks don't slow you down.

## Class StrategyUtils

StrategyUtils provides tools for examining and reporting on how your trading strategies are performing. It essentially acts as a central place to gather and present information about strategy events, like when a strategy cancels a scheduled order or takes a profit.

You can use it to get statistical summaries of your strategy’s activity, showing how often different actions occur.

It can also generate nicely formatted reports in Markdown, displaying individual events with details like the price, percentage values, and timestamps.

Finally, it simplifies saving these reports directly to files, naming them clearly with information about the symbol, strategy, and environment. This makes it easy to track your strategy's behavior and share results. The system keeps track of up to 250 events for each strategy on a given symbol.

## Class StrategySchemaService

This service acts as a central place to store and manage the definitions of your trading strategies, ensuring they are well-structured and consistent. It uses a special system for type-safe storage, meaning it helps prevent errors by verifying data types.

You can add new strategy definitions using the `addStrategy()` function (represented here as `register`). To get a specific strategy's definition, simply ask for it by name using `get()`.

The `validateShallow()` function quickly checks that a new strategy definition has all the necessary elements before it's formally registered.

If you need to make small adjustments to an existing strategy definition, `override()` allows you to update parts of it without replacing the entire definition. It’s like editing a recipe instead of starting from scratch.

## Class StrategyReportService

This service is designed to keep a detailed record of what your trading strategy is doing, writing each action as a separate JSON file. Think of it as an audit trail for your strategy.

To start using it, you need to "subscribe" to the service. This turns on the logging. When events happen—like a signal being cancelled, a position being closed, or a trailing stop being adjusted—the service records them. Each of these events (cancel-scheduled, close-pending, partial-profit, partial-loss, trailing-stop, trailing-take, breakeven, activateScheduled, averageBuy) has a specific function to handle its logging.

It’s important to note that this service immediately writes these events to disk, unlike other reporting methods that might hold events in memory temporarily.

When you're finished, you should “unsubscribe” to turn off the logging and free up resources. You can call unsubscribe more than once; it won't cause issues.



The `loggerService` property gives access to some internal context services.

The `subscribe` method sets up the service to start logging events, and `unsubscribe` stops that logging.

## Class StrategyMarkdownService

This service helps you track and report on what your trading strategies are doing. It collects details about actions like canceling orders, closing positions, and adjusting stop-loss levels.

Think of it as a memory bank for your strategy's activities, allowing you to generate reports later. It's different from immediately writing every event to a file – this way, you gather information first and then create a consolidated report.

Here's how you use it:

1.  **Start tracking:** You need to "subscribe" to start recording events.
2.  **It records automatically:** Actions like canceling a scheduled order are logged automatically.
3.  **Get your reports:** Use methods to retrieve the data, generate reports in Markdown format, or save the reports to files.  You can choose which details to include in your reports.
4.  **Stop tracking:**  "Unsubscribe" to stop recording and clear all the stored events.

The service keeps track of events for each strategy and symbol combination. It creates a "storage" area for each of these, limiting the number of events stored to around 250 per strategy/symbol combination to avoid excessive memory usage.

It also handles things like generating filenames for reports that include a timestamp to help keep them organized. You can clean up accumulated data when you no longer need it.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for managing trading strategies within the backtest-kit framework. It handles validations, retrieves pending signals, and provides essential position-related data. It leverages other services like `StrategyConnectionService` and `ExecutionContextService` to maintain context and manage connections.

Here's a breakdown of its key functionalities:

**Core Operations:**

*   **Validation:**  It performs validations of strategy and risk configurations, using caching to avoid repeated checks.
*   **Signal Retrieval:**  It fetches pending signals for a symbol, returning `null` if none exist.  This is important for monitoring take-profit/stop-loss levels and expiry times.
*   **Position Data:** The service offers methods to get position-related information:
    *   Percentage of the position held (open vs. closed).
    *   Total cost basis of the position.
    *   Effective entry price (DCA-averaged).
    *   Number of DCA entries.
    *   Total invested cost.
    *   Unrealized profit/loss (both percentage and dollar amount), factoring in partial closes and DCA.
    *   List of DCA entry prices and costs.
    *   Partial close history (type, percent, price, cost, entry count).
*   **Scheduled Signals:** Retrieves and manages scheduled signals for a given symbol.
*   **Breakeven Checks:** Determines if a position has reached breakeven.
*   **State Management:**  Provides methods to check and set paused and stopped statuses for strategies.
*   **Backtesting and Ticking:**  Wraps strategy backtesting and ticking logic, injecting necessary context (symbol, timestamp, backtest mode).
*   **Position Metrics:**  Offers various metrics about the position's performance, including peak profit/loss distances, drawdown periods, and durations, along with timestamps.

**Actions and Control:**

*   **Strategy Control:** Allows stopping and canceling scheduled signals for a strategy.
*   **Position Management:** Facilitates closing pending signals and executing partial profit/loss actions.
*   **Signal Injection:** Enables manual signal injection for testing or specific scenarios.
*   **Disposal:** Clears strategy-related resources and data from the system.


## Class StrategyConnectionService

This framework provides a way to route trading strategy calls to the right implementation, essentially acting as a central hub for your trading logic. It smartly caches these implementations to avoid unnecessary overhead and ensures everything is properly initialized before anything happens.

Here's a breakdown of what it does and how it helps:

*   **Smart Routing:** It automatically directs calls to the correct strategy based on the symbol and strategy name.
*   **Performance Boost:** It remembers which strategies it's already loaded, so it doesn't have to reload them every time.
*   **Safe Operations:** It makes sure everything is ready to go before any trading actions are taken.
*   **Handles Both Live and Backtesting:** It’s designed to work both when you’re actively trading and when you’re reviewing historical data.
*   **Detailed Position Management:** A host of methods provide detailed insights into pending signals, including pending signals, partials, entry costs, PnL, countdowns, and more.
*   **Control Signals:** Offers functions to pause, stop, activate scheduled signals, and handle partial profits/losses.
*   **Validation and Early Actions:** Provides methods for validating actions and activating scheduled signals early.



Essentially, it's a central service that manages and streamlines the execution of your trading strategies.

## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a central hub for managing how your trading signals are stored, allowing you to easily switch between different storage methods without changing your core strategy logic. It uses a flexible design, allowing you to plug in various storage implementations, such as persistent storage (saving to disk), in-memory storage (for testing or faster operation), or a dummy adapter that simply ignores all storage requests.

Think of it like having a universal translator for your signals – it handles events like signals opening, closing, scheduling, and cancellation, forwarding these actions to the currently selected storage method.

You can easily change which storage method is used through functions like `usePersist`, `useMemory`, and `useDummy`.  The `clear` function is important to call if your working directory changes between strategy runs, ensuring a fresh start for your storage. The adapter intelligently caches the storage utils to avoid unnecessary rebuilding, but this cache can be manually cleared when needed. The `getInstance` property provides a cached instance and can be cleared for a rebuild.

## Class StorageBacktestAdapter

This component acts as a central hub for managing how backtest data is stored, offering flexibility to choose different storage methods. It provides a way to swap out the underlying storage backend – you can use in-memory storage for quick tests, persistent storage to save data to disk, or even a dummy storage for simulating scenarios. 

It intelligently caches the storage utilities to improve performance, rebuilding them only when necessary, like when the working directory changes. You can easily switch between storage types using convenient functions like `useDummy`, `usePersist`, and `useMemory`.  

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods are how the backtest kit communicates storage updates, simply passing these events on to the currently selected storage adapter. There are methods for finding signals by ID (`findById`) and listing all signals (`list`). It also handles special "ping" events related to active and scheduled signals, updating their timestamps. Finally, `clear` provides a way to force a refresh of the storage utilities.

## Class StorageAdapter

The StorageAdapter is the central hub for managing how your trading signals are stored, whether they're from backtesting or live trading. It automatically keeps track of new signals as they're generated.

You can easily access all your signals—both backtest and live—through this one adapter. To prevent accidental duplicate storage, it uses a clever system to subscribe to signal updates only once.

To start storing signals, you'll enable the adapter.  If you need to stop storing them, you can disable it; it’s safe to disable it even if it's already disabled.

Need to find a specific signal? The `findSignalById` method searches through both backtest and live data.

You can also retrieve lists of just your backtest signals or your live signals using the `listSignalBacktest` and `listSignalLive` methods respectively.

## Class StateLiveAdapter

The StateLiveAdapter helps manage and store the state of your trading strategies, allowing for flexibility in how that data is handled. It uses a pattern that lets you easily switch between different storage methods, like keeping data only in memory, saving it to a file on your computer, or using a "dummy" adapter that doesn't save anything at all.

The adapter defaults to saving data to a file, so your progress isn’t lost when your program restarts. You can also swap in custom storage solutions if needed. 

A key feature is that it remembers things like how long a trade has been open and its peak profit – useful for evaluating trading rules, especially those driven by LLMs (Large Language Models). These values are saved persistently so the system "remembers" even across restarts.

Here's a breakdown of the available methods:

*   `disposeSignal` clears out old state related to a specific trading signal.
*   `getState` retrieves the current state for a particular signal.
*   `setState` updates the state for a signal.
*   `useLocal`, `usePersist`, and `useDummy` change the storage method being used.
*   `useStateAdapter` lets you use your own custom state management implementation.
*   `clear` wipes out the cached storage, useful if your program's working directory changes.



Essentially, it's a robust way to handle and persist the information needed to make informed trading decisions and evaluate the effectiveness of strategies.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage and store state information during backtesting. It allows you to easily swap out different storage mechanisms—like in-memory storage, persistent file storage, or even a dummy adapter that ignores changes—without modifying the core backtesting logic. This adapter is particularly useful for implementing sophisticated trading rules, such as those based on large language model (LLM) analysis, which might involve monitoring factors like drawdown and profit to determine when to exit a trade.

It keeps track of metrics like peak percentage and how long a position has been open for each trading signal, enabling advanced decision-making. The `disposeSignal` function cleans up old data when signals are completed, and `getState` and `setState` let you read and modify the state.

You can quickly switch between storage options with functions like `useLocal`, `usePersist`, `useDummy`, and `useStateAdapter`. The `clear` function is important for situations where the base directory for your backtesting changes.

## Class StateAdapter

The StateAdapter is the central piece for managing data during backtesting and live trading. It keeps track of all the state information, making sure that outdated data doesn't stick around.

Think of it as a smart manager that automatically cleans up after itself, ensuring resources are released when signals are no longer needed.

It provides ways to both read and write state data; the `getState` and `setState` methods handle directing those operations to either backtest or live data storage depending on your needs.

The `enable` property allows you to start the state storage process, while `disable` lets you stop it—it’s perfectly safe to call `disable` even if you’ve already called it. The `enable` property uses a special "single shot" feature to prevent unwanted duplicate subscriptions.


## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're set up correctly before you start trading. It essentially acts as a central hub for managing your sizing rules.

You can register new sizing strategies using `addSizing`, and `validate` ensures the strategy you’re trying to use actually exists.

To improve speed, the service remembers its validation results. 

Finally, `list` provides a way to see all the sizing strategies you've currently registered.

## Class SizingSchemaService

This service helps manage and organize different sizing strategies for your trading tests. It uses a special registry to keep track of these sizing strategies, ensuring they are stored in a way that avoids errors.

You can add new sizing strategies using the `register` method, and retrieve them later by their assigned name using `get`. If a sizing strategy already exists, you can update parts of it with the `override` method. 

Before a sizing strategy is added, `validateShallow` quickly checks that it has the necessary components and that the data types are correct. This helps to prevent issues later on during backtesting. The service also provides access to logging and context information for debugging and monitoring.

## Class SizingGlobalService

The SizingGlobalService is a central component responsible for determining how much to trade, essentially calculating your position size. It leverages other services, including a sizing validation service and a connection service, to ensure calculations are accurate and compliant. Think of it as the engine that converts your risk tolerance and strategy into concrete trading amounts. 

The service’s core function is the `calculate` method, which takes parameters defining the risk and strategy involved, and returns the calculated size. This service is used both internally within the backtest-kit and also by the public-facing API, making it a key element for consistent sizing behavior.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine the size of positions to take. It acts as a central hub, directing sizing calculations to the right specialized component based on a name you provide.

Think of it like a dispatcher – when you need to figure out how many shares or contracts to buy, you tell it *which* sizing method you want to use, and it handles the rest.

To improve speed, it remembers the sizing methods it's already set up, so it doesn’t have to recreate them every time you need them.

You can configure it with a logger and sizing schema service to handle logging and sizing schema-related tasks.

The `getSizing` property allows you to retrieve these specialized sizing methods.

The `calculate` method is where the actual sizing calculation happens, taking into account things like your risk tolerance and the chosen sizing method. It handles different sizing approaches like fixed percentages or Kelly Criterion. If your strategy doesn't need sizing configuration, you use an empty string for sizingName.

## Class SessionLiveAdapter

This component helps manage live trading sessions, offering flexibility in how session data is stored and accessed. It uses an adapter pattern, so you can easily swap out different storage methods without changing your core trading logic.

By default, session data is saved to a file on your computer, ensuring it's preserved even if your application restarts. However, you can also switch to a temporary, in-memory storage for testing or use a dummy adapter that simply ignores all data.

It keeps track of session data based on the trading symbol, strategy name, exchange, and frame, creating specific storage instances for each combination. You can clear this internal cache when your working directory changes to ensure fresh instances are used. The `useLocal`, `usePersist`, `useDummy`, and `useSessionAdapter` functions allow you to quickly switch between these storage options. You can read and update the session value using the `getData` and `setData` methods.

## Class SessionBacktestAdapter

The SessionBacktestAdapter helps manage and store data during backtesting, offering flexibility in how that data is handled. It acts as a bridge between your backtest logic and the underlying storage mechanism.

You can easily swap between different storage methods: a simple in-memory option (the default), a file-based persistence solution, or even a dummy adapter that effectively ignores any data written.

To retrieve or update data for a specific trading symbol, strategy, exchange, and timeframe, use the `getData` and `setData` methods.

If your working directory changes during backtesting (which can sometimes happen), you'll need to clear the cached instances using the `clear` method to ensure everything works correctly. The `useLocal`, `usePersist`, `useDummy`, and `useSessionAdapter` methods provide convenient ways to switch between these different storage configurations.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both backtesting and live trading sessions. Think of it as a traffic controller, directing data requests to the appropriate storage system – either the backtest storage or the live trading data store – depending on whether you're running a simulation or a real-time trade.

It provides two key methods: `getData` and `setData`.  `getData` allows you to retrieve existing data for a specific signal, and it automatically figures out whether to pull from the backtest data or live data based on the 'backtest' flag.  Similarly, `setData` lets you update data, again intelligently routing the update to the correct storage location.  These methods are designed to be flexible, allowing you to work with different data types and structures.


## Class ScheduleUtils

This class helps you understand how your scheduled signals are performing. It acts as a central point to gather and report on signal scheduling activity.

It keeps track of signals waiting to be executed, and signals that were cancelled.

You can use it to figure out cancellation rates and how long signals are waiting.

It can also create easy-to-read reports in Markdown format, summarizing the signal scheduling history for a specific trading strategy and asset.

Finally, this reports can be saved directly to a file on your system. The class is designed to be simple to use, offering a single, readily available instance for accessing these reporting capabilities.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of when signals are scheduled, opened, and cancelled, especially useful for understanding delays in order execution. It acts like a diligent observer, listening for these signal events and recording them in a database.

Think of it as a way to monitor the timeline of your signals – from the moment they're planned to when they actually get acted upon or are abandoned.

You can tell it to start watching these events by using the `subscribe` method, which gives you a way to stop listening later with an unsubscribe function.  The `unsubscribe` method itself handles stopping the service from listening. The service also uses a logger to help with debugging.

## Class ScheduleMarkdownService

This service automatically creates reports about scheduled trading signals, helping you understand how your strategies are performing. It keeps track of when signals are scheduled, and when they’re cancelled, specifically for each strategy you’re using.

The service generates markdown tables summarizing these events, and it also provides helpful statistics like the cancellation rate and how long signals typically wait before execution. These reports are saved as files in the logs/schedule directory, making it easy to review your trading activity.

You can subscribe to receive these signal updates, and the service ensures that you don’t get bombarded with duplicate information.  You can also request specific data, generate reports for particular strategies, or clear all the accumulated data if needed. It's designed to manage data independently for each strategy and combination of exchange, frame, and backtest configuration.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management settings. It acts like a central record of all your risk profiles, ensuring they're available before you try to use them in your trading strategies. 

It's designed to be efficient, remembering the results of previous checks so it doesn't have to repeat work unnecessarily.

You can add new risk profiles using `addRisk`, confirm a profile exists with `validate`, or see a complete list of what you've registered with `list`. Think of it as a way to keep your risk settings organized and reliable.

## Class RiskUtils

This class helps you understand and analyze risk rejection events within your trading system. Think of it as a tool for digging into why trades were rejected and getting a clear picture of the patterns.

It gathers information about rejections—like when they happened, which symbol was involved, the strategy used, and the reason behind the rejection.

You can use it to:

*   Get overall statistics, such as the total number of rejections and how they're distributed across different symbols and strategies.
*   Generate detailed reports in Markdown format that include a table of all rejection events, showing details like the position, exchange, price, and the reason for the rejection.
*   Save these reports directly to files so you can easily share them or keep a record of your risk management performance.

Essentially, it pulls together data from the system's risk monitoring and presents it in a structured and easily digestible way.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas, ensuring consistency and type safety. It uses a registry to store these schemas.

You add new risk profiles to the registry using `addRisk()`, and you can retrieve them later by their names.

Before adding a schema, `validateShallow` quickly checks if it has all the necessary parts and if they're the right types.

If a risk schema already exists, `override` lets you update just some of its details.

Finally, `get` is your go-to method for fetching a specific risk schema by its name.


## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system blocks trades. 

It listens for signals that are rejected due to risk controls and saves those events. This is really useful for later analyzing why trades were stopped and making sure your risk controls are working properly.

You can think of it as an auditor, quietly noting every time a potential trade is flagged as risky.

The service subscribes to signals to receive these rejection events, and it’s designed to prevent accidental double-subscriptions.  When you’re done, you can unsubscribe to stop it from listening. It’s safe to unsubscribe even if it wasn't initially subscribed.

## Class RiskMarkdownService

This service helps you automatically generate and save reports about rejected trades, which is useful for understanding why your trading strategies aren't executing as expected. It listens for rejection events and organizes them, creating detailed markdown tables that summarize the rejections for each symbol and strategy you're using.

The service keeps track of rejection data separately for each symbol, strategy, exchange, frame, and backtest combination, ensuring that your reports are well-organized. You can easily get statistics, generate reports, or save them to disk.

You can subscribe to receive these rejection events in real-time, and the service provides a way to unsubscribe when you no longer need to receive them. There's also a method to clear the accumulated rejection data, either for everything or just specific combinations. The reports are saved as markdown files for easy readability and sharing.

## Class RiskGlobalService

This service is responsible for managing and validating risk limits during trading. It acts as a central point for risk-related operations, working closely with other services to ensure trades adhere to predefined rules.

It keeps track of validations to avoid unnecessary checks, and provides detailed logging of these activities.

The `checkSignal` function verifies if a trade is permissible based on current risk limits.  A more robust version, `checkSignalAndReserve`, not only validates but also temporarily "reserves" a spot to prevent conflicting trades when multiple strategies are running concurrently.

When a trade is approved, `addSignal` registers the signal within the risk management system. Conversely, `removeSignal` cleans up the record when a trade is closed. Finally, `clear` allows you to wipe the risk data, either completely or for a specific risk configuration.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct specialized risk handler, ensuring that your risk assessments are accurate and consistent.

The service efficiently caches these risk handlers to speed up performance, preventing repetitive setup.

Key functions include validating signals against established risk limits—checking things like portfolio drawdown and position sizes—and registering/removing signals as trades are opened and closed. A special function ensures this process is safe even when many parts of your system are running concurrently. 

You can clear out the cached risk handlers when needed, which is useful for ensuring that your risk assessments are up-to-date or in specific testing scenarios. It’s designed to be flexible, working with different exchanges and allowing for strategies with and without specific risk configurations. The system keeps track of various services like logging and time management, which are essential for tracking and understanding risk behavior.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage how trading data and events are stored and analyzed. Think of it as a flexible system for saving information, allowing you to easily switch between different storage methods without changing the core of your trading framework.

It keeps track of storage instances, making sure there's only one for each type of report (like backtest results, live trading data, or walker events). This helps keep things organized and efficient.

By default, it stores data in JSONL files, which is a common format for time-series data. However, you can change this default to use a different storage solution.

The `writeData` method is the main way you’ll interact with the adapter. It handles writing data and automatically sets up the storage when you first use it for a specific report type.

You can also temporarily disable data writing with the `useDummy` function, which is useful for testing or situations where you don't need to store data.  If you need to start fresh with new storage instances, the `clear` method allows you to wipe the current storage cache. Lastly, you can revert to the default JSONL storage with `useJsonl`.

## Class ReportUtils

ReportUtils helps you control which parts of the system generate detailed logs, like those from backtesting, live trading, or performance analysis. Think of it as a way to selectively turn on and off logging for different areas.

You can use it to start logging for specific services – for example, you might want to log your backtest runs but not your live trading – and it will begin recording events as they happen.  These logs are stored in JSONL files, allowing for easy filtering and analysis.

Crucially, when you enable logging, you get a function that you *must* call later to stop the logging – this prevents memory leaks.

Conversely, you can disable logging for services, immediately stopping the recording of events without needing a separate unsubscribe function. This lets you fine-tune what data you’re capturing.

This utility class is designed to be extended by other classes that need more advanced reporting features.

## Class ReportBase

The ReportBase class is designed to help you log and analyze trading events in a structured way. It creates files that store your data in a simple, JSON-based format, one file per report type. Think of it as a system for automatically recording what’s happening during your backtests.

This system writes events as individual lines in a file, allowing for easy searching and filtering based on criteria like the trading symbol, strategy used, exchange, time frame, and more. It’s built to handle large amounts of data efficiently, pausing briefly when needed to make sure everything is written correctly and preventing write operations from taking too long.

The class ensures that the necessary directories are created automatically, and any errors are handled gracefully. The `waitForInit` method sets up the initial file and stream, and you can use the `write` method to add new events to the log.  It's designed to be reliable, making sure your trading data is safely recorded for later analysis.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a flexible way, acting as a central point for how reports are saved. It uses a design pattern that lets you easily switch between different storage methods without changing your core trading logic. 

Think of it as a pluggable system – you can swap out how your reports are stored (like switching from a simple file to a database) with minimal effort.

To prevent issues when running multiple iterations of your trading strategy, it's important to clear the cache if your working directory changes. The adapter also has a handy “dummy” mode, which lets you temporarily stop writing reports, useful for debugging or testing. Finally, it offers a default JSONL adapter for common file-based storage.

## Class ReflectUtils

This utility class provides a way to track key performance metrics for your trading strategies, such as profit and loss, peak profit, and drawdown. It acts as a central point for accessing this information, ensuring consistency and proper validation across your backtests and live trading. Think of it as a tool for monitoring how your trades are performing in real-time.

The class offers various methods to retrieve these metrics, including:

*   **Profit and Loss (PnL):** Calculates unrealized PnL in both percentage and dollar terms, considering factors like partial closes and slippage.
*   **Peak Performance:** Tracks the highest profit price achieved, along with the timestamp and PnL associated with it.
*   **Drawdown Analysis:**  Monitors the worst loss (drawdown) experienced, including the price, timestamp, and associated PnL.
*   **Time-Based Metrics:**  Provides information on how long a position has been active, waiting for activation, or pulling back from its peak profit.
*   **Distance Calculations:** Determines the distance between the current price and the highest profit or deepest drawdown points, expressed in PnL percentage or cost.

It's designed to work seamlessly with both backtesting and live trading environments, offering a unified view of position performance.  It is designed as a globally accessible singleton, making it easy to use throughout your trading system.

## Class RecentLiveAdapter

This component acts as a central hub for accessing recent trading signals, providing flexibility in where and how that data is stored. It's designed to work with different storage methods, allowing you to choose between persistent storage on disk or a faster, in-memory solution.

You can easily switch between these storage options using `usePersist()` for disk-based signals and `useMemory()` for temporary signals. The component keeps a cached version of the storage utilities to improve performance, but you can clear this cache with `clear()` whenever necessary, for example, when your working directory changes.

The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` functions simply pass requests to the currently active storage adapter, while `useRecentAdapter` lets you define your own custom storage mechanism entirely. It's a powerful tool for managing and retrieving recent signal data for your backtesting and trading strategies.

## Class RecentBacktestAdapter

This component helps you manage and retrieve recent trading signals, allowing you to choose between storing them in memory or on disk. It uses a flexible design where you can easily swap out different storage methods without changing the core logic. By default, it keeps signals in memory for quick access, but you can switch to persistent storage if you need to keep them across sessions.

The system builds the storage utility only when needed, remembering the result for later use, and provides ways to refresh that utility when necessary, especially when your working directory changes. It also handles incoming "ping" events and provides methods to get the latest signals and calculate how long ago they were created. 

You can easily change which storage method is used – memory or persistent – with just a few commands. This makes it adaptable to different needs and environments.

## Class RecentAdapter

The RecentAdapter helps manage and access recent trading signals, whether you're backtesting or running live. It automatically updates signal storage by listening for incoming data. 

You can easily grab the most recent signal for a specific trading pair and situation using the `getLatestSignal` function, ensuring you're not looking into the future. It prioritizes signals from backtesting data first, then checks live data if needed.

To prevent issues, the adapter only subscribes to updates once and allows you to safely disable and re-enable signal storage.  It also provides a way to quickly determine how long ago the most recent signal was generated, again checking backtest data before live data, with a way to control for look-ahead bias.


## Class PriceMetaService

PriceMetaService helps you get the current market price for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. Think of it as a central place to find the latest price information without being directly involved in the trading process itself. 

It keeps track of prices, updating them as new ticks come in from the strategy. If you need the price outside of a trading "tick," like when executing a command, this service is designed to provide it.

It intelligently handles situations where the price isn't immediately available, waiting briefly for the first price signal.  You can also clear out these stored price values to ensure you're working with fresh data, either for a specific trading setup or all of them. The service is automatically updated and managed within the trading framework.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, which is crucial for managing risk. 

It provides pre-built methods for different position sizing strategies, like fixing a percentage of your account balance at risk, using the Kelly Criterion (a more complex method aiming for optimal growth), or basing the size on the Average True Range (ATR) indicator.

Each method checks that the information you provide aligns with the sizing technique you've chosen to ensure accurate calculations. 

You can think of it as a set of ready-to-use calculators for making informed decisions about your trade sizes.

## Class Position

The Position class helps you figure out where to place your take profit and stop loss orders when you're trading. It understands whether you're going long (buying) or short (selling) and adjusts the calculations accordingly. 

Inside this class, you'll find two useful functions:

*   **moonbag:** This gives you a simple strategy: your take profit is set to 50% above (for longs) or below (for shorts) your entry price, while your stop loss is based on the percentage you specify.
*   **bracket:** This lets you define both a take profit and a stop loss percentage, providing more control over your risk and reward.

Essentially, this class is a tool to easily determine your target prices and safety nets for your trades.

## Class PersistStrategyUtils

This class helps manage how strategy information is saved and loaded, especially for things like pending orders or signals that haven't been fully processed yet. Think of it as a way to make sure your strategy’s state is saved reliably, even if there are interruptions.

It intelligently creates a unique storage area for each strategy, symbol, and exchange combination. This helps keep things organized and efficient.

You can even customize how this storage works, allowing you to plug in different ways of saving the data – whether it’s to a file, a database, or even just to discard it (for testing purposes).

If you're using the `ClientStrategy`, this utility handles the persistence of important data like the commit queue and signals that are waiting to be executed.

There are handy functions to clear the stored data when necessary, like when the working directory changes. It also provides shortcuts for using default or dummy persistence methods.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file. It's designed to be reliable, even if your application crashes unexpectedly.

It essentially acts as a persistent storage solution specifically for your strategy’s data, associating it with a particular trading symbol, strategy name, and exchange.

The class uses a consistent file name ("strategy") for saving, and guarantees that writes happen safely to prevent data corruption.

You can initialize its storage, retrieve the saved strategy data, or save updated strategy data using this component. If you want to delete the saved data, you can pass null to the write function.

## Class PersistStorageUtils

This class provides tools for reliably saving and retrieving signal data, especially when running backtests or in live trading scenarios. It makes sure your signal data persists between sessions and handles potential issues like crashes.

The class intelligently manages storage instances, allowing you to easily switch between different storage methods. You can even provide your own custom storage solution.

It reads and writes all signals as individual files, identified by their unique IDs, and guarantees that updates happen completely – no partial saves!

To keep things organized, it uses a memoization system, creating only one storage instance per mode (backtest or live).  If you've changed your working directory or need to switch storage implementations, you can clear this cache to force a refresh.

You can quickly switch to using the default file-based storage or a dummy storage (for testing purposes) with a simple function call.

## Class PersistStorageInstance

This class provides a way to reliably store and retrieve your trading signals using files. It's designed to be a default option for persisting data, meaning it keeps each signal as its own file, making it easy to manage. 

The system handles situations where the program might crash while writing, ensuring data integrity.

The constructor takes a boolean value to configure its behavior depending on whether it’s used for backtesting or live trading. 

It has a `waitForInit` method to make sure the storage is ready before you start using it. The `readStorageData` method pulls all your saved signals into memory. Finally, `writeStorageData` saves a batch of signals, associating each with a unique identifier.

## Class PersistStateUtils

This class helps you reliably save and load the state of your trading strategies. It's designed to ensure that your strategies can recover from crashes without losing important information.

The class manages how your state is stored, using a specific file structure. It remembers which storage methods it's using, allowing for custom solutions.

You can control how state is handled by swapping out default behaviors like file storage for dummy instances (which don't actually save anything) or providing your own custom storage methods. The `waitForInit` function helps set up the storage only when needed.

Reading and writing state are managed carefully, making sure the process is smooth and consistent. The class also provides tools to clear out old storage information or to completely remove individual state entries when they're no longer needed. When things change in your environment, like the working directory, the `clear` function helps keep things tidy.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a way to store and retrieve data related to a specific trading signal, using files. It's designed to be a simple and reliable way to persist state information.

Think of it as a container for keeping track of data for a particular signal. 

It uses a `signalId` and a `bucketName` to identify where to store that data. The `bucketName` acts like a unique identifier within the storage.

You can use `waitForInit` to make sure the storage is ready before you start reading or writing.

`readStateData` fetches the previously stored information using the `bucketName`, and `writeStateData` saves new information.

Finally, `dispose` does nothing directly; any cleanup of cached information is managed separately to ensure consistency.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, ensuring data isn't lost even if things go wrong. It's designed to work specifically with strategies, keeping track of signal data for each trading symbol, strategy, and exchange.

It uses a clever system to create and manage signal storage instances – each strategy gets its own, personalized storage.

You can customize how these signals are persisted by providing your own signal instance creator, effectively swapping out the default behavior.

There are built-in options for using a file-based system, a dummy (no-op) system for testing, or a custom adapter you define.

The `readSignalData` and `writeSignalData` methods handle loading and saving the signal data, automatically creating the necessary storage the first time they're used.

You'll want to clear the cache if your working directory changes, like when running different strategy iterations.

## Class PersistSignalInstance

This class provides a way to save and load signal data to a file, ensuring your trading strategies can remember their state even if there's an unexpected interruption. 

It's designed to work with a specific trading strategy and exchange, using the symbol as a unique identifier for the data. The data is written to a file in a safe, atomic way, meaning it's less likely to become corrupted if something goes wrong during the save process. 

The class handles initializing the underlying file storage and offers methods to read and write the signal data, making it easy to persist your signal rows. Essentially, it allows you to make your strategies more robust by giving them a memory they can rely on.


## Class PersistSessionUtils

This class, `PersistSessionUtils`, is designed to help manage how your trading session data is saved and loaded. It ensures that each trading strategy, exchange, and timeframe has its own dedicated storage area.

Think of it as a smart helper that remembers your session details. It uses a special memoization technique, which means it only creates the storage areas when they’re actually needed, and it reuses them if you’re working with the same setup later.

You can easily customize how the data is stored. It defaults to saving files on your computer, but you can plug in your own storage solutions.

The class provides tools to initialize storage, read data that's already been saved, and write new data. There are also options to clear out old storage or use a "dummy" mode for testing purposes where no data is actually saved.  If you need to switch between different storage methods or clean up old data, this utility class makes it easy to do so. It's particularly useful when you want to make sure your session data is saved safely, even if your program crashes unexpectedly.

## Class PersistSessionInstance

This class, PersistSessionInstance, handles saving and retrieving session data for your trading strategies. It's designed to work with files to store this information persistently.

It essentially wraps another component to make sure these file saves happen reliably. Each strategy and exchange uses its own separate storage area, and within that, each frame (a specific point in time during testing) gets its own unique identifier. 

The class keeps track of details like the strategy name, exchange, frame name, and the trading symbol involved, along with whether it’s a backtest or live run.  This ensures data isn't mixed up between different strategies or symbols.

Initialization happens with `waitForInit`, and data is saved with `writeSessionData` and read with `readSessionData`. Notably, the `dispose` function doesn’t actually do anything itself - session cleanup is managed elsewhere.


## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and retrieved, ensuring they are reliable even if the system crashes. It creates separate storage for each trading strategy, allowing for flexibility and customization. You can plug in different ways to store this data, like using files or a custom database. 

It's designed to work with the ClientStrategy, specifically to keep track of those "scheduled signals" that tell the system when to execute trades. 

Here's a breakdown of what it offers:

*   **Customization:** Easily switch between different ways of storing scheduled signals, including using a default file-based system, a dummy system for testing (where nothing is actually saved), or a custom solution you build yourself.
*   **Smart Storage:** It remembers which storage system is used for each strategy, symbol, and exchange, so it doesn't have to recreate them unnecessarily.
*   **Safe Keeping:** The signals are saved and loaded in a way that minimizes the risk of data loss.
*   **Clean-up:** You can clear the storage system if needed, for example when the working directory changes.
*   **Easy Access:**  It provides functions to read the saved signals and write new ones.

## Class PersistScheduleInstance

This class provides a way to save and retrieve scheduled signals to a file. Think of it as a little data keeper specifically for your trading strategies. It’s designed to be reliable, even if your program crashes unexpectedly.

The class is keyed by the trading symbol, the strategy name, and the exchange name, ensuring data is stored and retrieved correctly for each specific setup.

You can use it to load an existing schedule or save a new one; it handles the underlying file storage for you. It makes sure that saving data is done safely, even if something goes wrong in the process. The `waitForInit` method is used to set up the initial file storage.

## Class PersistRiskUtils

This class helps manage and safely store information about your active trading positions, particularly for risk management. It remembers which storage methods to use for different risk profiles, preventing redundant setups.

You can customize how this storage works, choosing between different adapters like file-based storage or even a dummy option for testing.  The system handles reading and writing position data and ensures operations are reliable, even if there are unexpected interruptions.

If your working directory changes during strategy execution, it's important to clear the cached storage to ensure consistency.  You can also easily switch between different persistence strategies, allowing for testing or adapting to varying environments.

## Class PersistRiskInstance

This class helps you reliably save and retrieve trading positions to a file. It's designed to be crash-safe, ensuring your data doesn't get corrupted even if something goes wrong.

The class stores position data associated with a specific risk name and exchange name. It uses a predefined key, "positions", to organize the data within a file.

To get started, you’ll provide the risk name and exchange name when you create an instance.  The `waitForInit` method prepares the storage area, and `readPositionData` retrieves the saved positions. `writePositionData` is used to update the positions with new information.  This provides a consistent and secure way to manage your trading data.

## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, ensuring they're handled reliably. It's a behind-the-scenes helper used by other parts of the system for keeping track of recent signals.

It intelligently caches these signal instances based on factors like the trading symbol, strategy name, exchange, and timeframe. This prevents unnecessary re-initialization and improves performance.

You can customize how these signals are persisted by providing your own "adapter" – essentially, a different way of storing the data (like using a specific file format or database).

The class automatically handles writing and reading the most recent signal for a given context, and it's designed to be crash-safe, so your data isn’t lost unexpectedly. If you want to clear all stored signals, there's a `clear` method. Finally, you can easily switch between a default file-based storage, or a dummy adapter for testing.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal for a specific trading setup. It's designed to be reliable, ensuring that updates are written correctly even if something interrupts the process.

It remembers key details about your setup like the trading symbol, the strategy name, the exchange it's running on, the timeframe, and whether it’s a backtest or live environment. The storage location is cleverly organized using these details, ensuring data for different setups stays separate.

You can use `waitForInit` to make sure the storage is ready before trying to read or write data. `readRecentData` retrieves the latest signal that was saved, and `writeRecentData` stores a new signal, along with the time it was generated. This ensures you always have a record of the most current signal for your trading setup.

## Class PersistPartialUtils

This class helps manage how your trading strategy remembers partial profit and loss information, ensuring it's stored reliably even if something unexpected happens. It creates specialized storage areas for each combination of trading symbol, strategy name, and exchange, preventing data from getting mixed up.

You can customize how this storage works by providing your own methods for creating and handling the data. The system automatically loads and saves this data as needed, and it even creates storage areas on-demand the first time they're accessed.

If you need to switch between different storage methods, such as using a file-based system or a dummy system for testing, this class provides simple commands to do so. It also includes a way to clear out existing storage if your environment changes.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and load pieces of trading data to a file, ensuring that your data isn't lost even if something unexpected happens. It’s designed to work with a specific trading symbol, strategy, and exchange.

Think of it as a safe keeper for your intermediate results, using a unique ID for each piece of data.

It uses a special system to write data in a way that prevents corruption, making it more reliable.

Here's a quick look at what it does:

*   **Initialization:** `waitForInit` sets up the file-based storage it uses.
*   **Reading Data:** `readPartialData` retrieves a partial set of data associated with a specific signal.
*   **Writing Data:** `writePartialData` saves partial data, again linked to a particular signal.

The class properties store the symbol, strategy name, and exchange name for context.  The `_storage` property handles the actual file-based data storage behind the scenes.

## Class PersistNotificationUtils

This class provides helpful tools for managing how notifications are saved and retrieved. It ensures that notification data is reliably stored, even in situations where the application might crash. It uses a clever system to only create storage instances once for each mode (like backtesting versus live trading), preventing unnecessary overhead.

You can customize how notifications are stored by providing your own way of creating those storage instances.

If the working directory changes, you'll want to clear the stored instances to make sure everything is using the correct base path.

For testing or troubleshooting, a "dummy" mode is available that pretends to save notifications without actually writing anything to disk. There's also an option to easily switch back to the default file-based storage.

## Class PersistNotificationInstance

This component handles saving and retrieving notification data persistently, primarily using files. It’s designed to be reliable, even in situations where the system might crash unexpectedly.

Each notification is stored as its own JSON file, making it easy to manage individual pieces of information. To find all notifications, it scans through a list of available keys.

The `backtest` property is a simple flag indicating whether this is running in a backtesting environment.  The `_storage` property provides access to the underlying file storage mechanism.

You can use `waitForInit` to ensure the storage is properly initialized, especially when first starting up.  `readNotificationData` retrieves all the saved notifications from the storage. Finally, `writeNotificationData` is responsible for saving a batch of notifications, ensuring each one is saved securely with its own unique identifier.

## Class PersistMemoryUtils

This class helps manage how your trading strategy's data is saved and loaded, particularly when dealing with large amounts of historical information. It makes sure that each piece of data is stored in a consistent and reliable way.

It keeps track of different storage locations, using a clever system to avoid creating the same storage area multiple times. You can even customize how these storage areas are created.

The class provides functions for reading, writing, and deleting data, and it handles initialization automatically when needed. It includes methods to clear the storage cache and to properly clean up when a signal is removed.

You can also swap out the default storage method with your own custom solution or even use a "dummy" storage that doesn't actually save anything – useful for testing. Finally, it can list all the saved data entries to rebuild indexes when necessary.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data, acting as a default file-based solution. It wraps a lower-level storage mechanism to ensure data writes happen reliably. Data can be marked as deleted without actually removing the file, allowing for easy recovery if needed. The `listMemoryData` method only returns data that hasn't been flagged for deletion. Setting up the underlying storage is handled by `waitForInit`. You can read, write, and remove individual memory entries by their unique identifiers.  Importantly, the `dispose` method doesn't do anything directly as it relies on a separate utility for managing the underlying memo cache cleanup.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, ensuring that the data is saved and retrieved reliably. It works by creating specialized storage instances for each unique combination of timestamp and symbol, acting as a persistent layer for your caching needs.

You can customize how this data is stored using different adapters, or easily switch back to the default file-based storage. The framework handles reading, writing, and even "soft-deleting" (marking data for removal) data, all in a way that’s designed to be safe even if the application crashes.

The system cleverly delays creating these specialized storage instances until they're actually needed, making it efficient.

If you need to completely refresh the storage configuration, you can clear the memoization cache. This is helpful when the working directory of your application changes. Finally, for testing or debugging, there's a "dummy" adapter that effectively does nothing, allowing you to simulate cached data without any actual storage.

## Class PersistMeasureInstance

This class provides a way to store and retrieve trading measure data persistently, typically to a file. It acts as a bridge, handling the complexities of file storage and ensuring your data is saved reliably.

The class uses a "bucket" – think of it as a folder – to organize your data. It allows you to "soft delete" entries, meaning they’re not actually removed from storage but flagged as deleted, allowing for potential recovery.

You can retrieve a measure by its unique key, and the system will return null if that measure is missing or has been soft-deleted. It also provides functionality to write new measure data and remove existing ones. 

Finally, when you need to list all measures, it filters out any that have been soft-deleted, giving you a clean view of your active data.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how your trading strategy's log data is saved and loaded. It keeps a single, ready-to-use log instance for your entire backtesting process, making things more efficient.

You can easily swap out the default log storage mechanism with your own custom solution using `usePersistLogAdapter`. This gives you a lot of flexibility to tailor persistence to your needs.  It also includes pre-built options like `useJson` for standard file storage and `useDummy` for testing or scenarios where you don't need actual logging.

The log data itself is handled carefully, with each log entry saved as a distinct file.  `readLogData` loads all the saved entries, and `writeLogData` adds new entries, making sure duplicates aren't created.  To ensure reliability, the process handles potential crashes gracefully, keeping your log state safe.

If your working directory changes during a backtest (like when running multiple strategies), you'll need to call `clear()` to refresh the log instance.

## Class PersistLogInstance

This class provides a way to store your backtesting results persistently, using files on your computer. Think of it as a digital notebook for your trading strategies. 

Each trading event (or log entry) is saved as its own individual file, making sure nothing gets accidentally erased. 

The system only adds new entries; it doesn't modify or delete existing ones, ensuring a safe and reliable record of your testing process. It also handles potential interruptions gracefully to prevent data loss.

You can initialize the storage, read all previously saved log entries, or add new entries to the persistent record. The system uses keys to efficiently find and manage these individual log files.


## Class PersistIntervalUtils

This utility manages how the backtest-kit framework keeps track of when certain time intervals have fired during a backtest. It acts as a persistence layer, storing markers in a directory structure under `./dump/data/interval/`. The existence of a marker file signifies that the interval has already fired for a specific time period and key.

The system uses a constructor to create these markers, and you can customize this constructor to use different storage mechanisms. It also provides functions to read, write, and delete these interval markers.

You can switch between different persistence adapters, like using a file-based storage, a JSON-based storage, or even a dummy adapter for testing purposes where persistence is not needed. It also offers a way to clear the cached data, essential when the working directory changes during the backtest process. Listing existing markers for a bucket is also supported.

## Class PersistIntervalInstance

This component manages persistent data related to trading intervals, specifically designed to be stored on files. It acts as a layer on top of a basic storage mechanism, ensuring that changes are saved reliably.

It allows you to read, write, and delete interval data – essentially, markers that define when specific actions should happen. When a marker is deleted, it's not physically removed from storage but marked as removed; this lets the system know it can be re-used.

The `waitForInit` method is used to set up the underlying storage when first needed. The `listIntervalData` method provides a way to see all the active interval markers currently present.


## Class PersistCandleUtils

This utility class helps manage and store your candle data (like open, high, low, close prices) in a persistent way, ensuring it’s available even when your application restarts. It saves each candle as a separate JSON file, organized by exchange, symbol, interval, and timestamp. 

The system checks if the number of cached files is what you expect, and it automatically updates the cache if there are any issues or missing data. This helps keep your data consistent and reliable.

You can customize how these candles are stored and retrieved by providing your own constructors.  There's also a handy way to clear the cache if you need to, particularly when your working directory changes. Finally, you can easily switch between different storage methods, including a "dummy" mode that's useful for testing.

## Class PersistCandleInstance

This component handles saving and retrieving historical candle data, primarily using files. Think of it as a way to persist your trading data so it’s not lost.

Each candle's data is stored in a separate file, identified by its timestamp. When you request data, it checks if the information is already stored – if not, it triggers a refresh.

When writing data, it's designed to be careful. It will skip any candle data that isn't complete (meaning the closing time hasn't yet passed) or if a file with that timestamp already exists. This ensures that your data remains consistent and append-only, only containing fully finalized candles. Any issues found within the cached files will trigger a warning, effectively treating them as missing.

The component keeps track of what symbol, interval, and exchange the data relates to. Internally, it uses a file-based storage system.

It has a method to make sure the underlying storage system is ready to go, and this can be initialized again. 

The read function can fetch multiple candles within a specific time range. It uses the provided window to find all possible data, and if even one candle is missing, the entire request will return null to trigger a refresh.

Finally, the write function takes a list of candles and saves them to the storage.

## Class PersistBreakevenUtils

This utility class manages the persistent storage of breakeven data for your trading strategies. It handles the reading and writing of this data to files on your disk, ensuring that your breakeven calculations are saved and loaded correctly.

Think of it as a central place to keep track of breakeven information for each symbol, strategy, and exchange combination you're using. 

It's designed to be efficient, creating these storage locations only when needed and reusing them as much as possible. You can even customize how the data is stored using custom adapters.

The data is organized in a specific folder structure under `./dump/data/breakeven/`, with each folder representing a unique combination of symbol, strategy, and exchange. If the working directory changes between strategy iterations, you'll need to clear the cache. 

It also offers quick switches to use a default file-based storage or a dummy storage for testing purposes.

## Class PersistBreakevenInstance

This class helps you reliably save and retrieve breakeven data, which is crucial information for understanding your trading strategies. It's designed to be crash-safe, meaning your data won't be lost even if something goes wrong unexpectedly.

Think of it as a file-based manager for your breakeven information, organized by the trading symbol, the name of your strategy, and the exchange you're using.

The constructor sets up the basic information for this data management – the symbol, strategy name, and exchange. 

It provides methods to safely write breakeven data associated with a specific signal ID and to read that data back when you need it. The `waitForInit` method ensures the storage is properly set up before you start writing or reading data. The internal storage is handled automatically, providing a consistent and dependable way to keep track of your breakeven points.


## Class PersistBase

PersistBase provides a foundation for saving and retrieving data to files, ensuring that your operations are reliable and complete even if things go wrong. It's designed to handle file management safely, using techniques like atomic writes so that data isn’t corrupted during saves.

This class automatically checks and cleans up any damaged files, and it makes it easy to loop through all your saved data using an async generator. If the persistence directory hasn't been set up yet, `waitForInit` handles that for you, making sure everything's ready before you start working with the data.

You can use `readValue` to get data back from storage, `hasValue` to quickly see if something exists, and `writeValue` to save data in a way that's protected against interruptions. The `keys` method gives you a way to access all the IDs of the data you've stored, in alphabetical order. Essentially, it's a robust tool for managing persistent data in your applications.


## Class PerformanceReportService

The PerformanceReportService helps you understand where your trading strategies are spending their time. It acts like a detective, observing and recording performance details during the strategy's execution. 

Think of it as a listener that picks up timing signals, carefully noting how long each part takes and what's happening at the same time.

It then stores this information so you can analyze potential bottlenecks and figure out how to make your strategies run even faster.

You can easily tell it to start paying attention using `subscribe`, and it prevents you from accidentally setting it up multiple times.  When you're done, `unsubscribe` quietly stops the monitoring process. The `loggerService` helps with debugging, giving you extra insights if something isn't quite right.  The `track` property manages the actual recording and database storage of these timing events.


## Class PerformanceMarkdownService

This service helps you monitor and understand how your trading strategies are performing. It gathers performance data as your strategies run and organizes it for analysis. 

The service listens for performance events, keeps track of metrics for each strategy individually, and calculates things like average performance, minimums, maximums, and percentiles to give you a complete picture. 

It can then automatically generate clear, readable reports in markdown format, highlighting potential bottlenecks or areas for improvement. These reports are saved to your logs directory, making it easy to review and share your findings.

You can subscribe to receive performance events, and unsubscribe when you no longer need them.  It also provides methods to retrieve specific performance data, clear the stored data and dump the report directly to disk. Each unique combination of symbol, strategy, exchange, frame, and backtest gets its own set of data for isolated analysis.

## Class Performance

The Performance class helps you understand how well your trading strategies are doing. It offers tools to analyze performance metrics, pinpoint slowdowns, and create easy-to-read reports.

You can use it to gather detailed performance statistics for specific strategies and symbols, seeing things like average execution times, volatility, and outliers.

The class can also generate formatted reports in markdown, visualizing performance data with time distribution charts and comprehensive metrics tables, making it easier to identify bottlenecks.

Finally, it allows you to save these performance reports directly to your file system for later review, with customizable paths and column selection.

## Class PartialUtils

This utility class helps you analyze and report on partial profit and loss data gathered during trading. It's designed to work with the PartialMarkdownService, which collects information about events like profits and losses.

You can use it to get summarized statistics about your trading results, like total profit/loss counts. It also creates nicely formatted markdown reports that display your partial profit and loss events in a table, including details like action, symbol, strategy name, signal ID, position, level, price, and timestamp.

Finally, this class can automatically save those reports to files, creating a directory structure to organize them, using a filename based on the symbol and strategy name. Think of it as a tool to easily track and document your trading performance.

## Class PartialReportService

The PartialReportService helps you keep track of every time a trading position is partially closed, whether it's for a profit or a loss. It acts like a recorder, capturing the details of these partial exits – like the price and the amount of the position closed.

It listens for signals indicating partial profit or loss events, ensuring no detail is missed. 

You can tell it to start watching these events using the `subscribe` method, and it will send you back a way to stop it.  If you decide you no longer need to track partial exits, use the `unsubscribe` method to shut it down.  It’s designed to prevent accidentally subscribing more than once.

Behind the scenes, the service uses a logger to help with debugging and a separate component called `ReportWriter` to actually store all the information in a database.

## Class PartialMarkdownService

This service helps you create and save detailed reports about your trading profits and losses. It listens for signals indicating when you've made money (profit) or lost money (loss) during trading. It then keeps track of all these events, grouped by the asset being traded (symbol) and the specific trading strategy used.

The service generates easy-to-read markdown tables that summarize each profit and loss event, including important details. You can also get overall statistics showing the total profits and losses. Finally, it automatically saves these reports as files on your computer, making it easy to review your trading performance over time.

You can subscribe to receive these events, unsubscribe when you no longer need them, and even clear the accumulated data when necessary. There are functions to retrieve accumulated data, generate reports, and save them to disk. The reports are organized by symbol, strategy, exchange, frame, and backtest status, ensuring clear separation of data. You have the option of specifying a custom path for saving the reports, and you can also customize the columns included in the report.

## Class PartialGlobalService

This service acts as a central hub for managing and logging partial profit and loss calculations. It's designed to be injected into your trading strategies, simplifying how they interact with the underlying connection layer. 

Essentially, it sits between your strategy and the components that handle the actual partial profit/loss tracking.

The service keeps track of operations through logging, and delegates tasks like creating and managing `ClientPartial` instances to a connection service. 

It includes several validation services for ensuring the stability and accuracy of your strategies, including checks for strategy, risk, exchange, frame, and action existence.

You'll find methods for recording profits, losses, and clearing the partial state, each of which is logged for monitoring purposes before being passed on to the connection service.

## Class PartialConnectionService

This service manages the tracking of partial profits and losses for your trading signals. Think of it as a central hub for handling these calculations and keeping everything organized. 

It intelligently creates and reuses objects to represent the partial state of each signal—it does this through a clever caching system, so you're not creating new objects unnecessarily. This service is designed to be connected to the bigger picture of your trading strategy and is responsible for making sure these partial profit/loss calculations are accurate and persistent.

When a signal hits a new profit or loss level, or when a signal is closed out, this service takes action. It either finds an existing record or creates one, performs the necessary calculations, and then handles the events triggered by those changes. Crucially, it ensures that these objects are cleaned up when they're no longer needed to avoid memory issues.

## Class OrderTransientError

This `OrderTransientError` class is a way to signal that an order-related operation failed temporarily, like due to a network issue or exchange problem. It's not about the specific reason for the failure, but rather indicating that the system should retry the operation. Think of it as a polite "Please try again later" for the trading engine.

The framework handles any unexpected errors as "transient" by default, so using this specific class isn't strictly necessary for functionality. It's more for clarity—it explicitly tells developers that a failure is considered temporary and needs to be retried.

Here's how it affects different parts of the trading process:

*   **Opening an order:** The system automatically retries sending the order, using the same order details, up to a certain number of attempts. It's crucial to check if the order already exists on the exchange before resending. If retries fail repeatedly, it's a serious problem.
*   **Closing an order:** Similar to opening, the system retries closing an order. Repeated failures mean the position might need manual reconciliation.
*   **Checking order status:**  If a check fails (like confirming an order is still open), the system continues monitoring without immediately stopping. However, too many consecutive failures lead to a terminal error.

Important points to remember:

*   Transient errors are critical—many failures mean a fatal system problem.
*   Retry counters persist even if the system crashes, meaning reconciliation is necessary after a crash.
*   This error isn’t used for branching logic within the framework itself, but is a standard way to indicate temporary failure for external code.

## Class OrderRejectedError

This error signifies a definitive rejection of an order by the exchange – it's a situation where retrying won't work. It's thrown specifically within order processing channels like when dealing with a broker adapter or handling order synchronization. When this error occurs, open orders are immediately dropped, and any retry attempts are canceled, preventing future attempts with the same order ID. Similarly, closing orders are forcefully closed, and the system moves on to generate new signals.

Importantly, this error should only be used for situations where the rejection is due to a fundamental business reason – for example, a delisted symbol or account restrictions. Transient issues like network problems or rate limits should trigger a standard error, allowing for retries.  Throwing it in the wrong place (like order check channels) results in the error being treated as a temporary problem. It's identified by a specific runtime brand, ensuring it's recognized even when code is split across multiple files or modules. This error is primarily relevant in live trading environments; it's largely irrelevant during backtesting. The error message is purely for informational purposes, not the core routing.


## Class OrderDeletedError

The `OrderDeletedError` signals a definitive confirmation from the exchange that an order no longer exists – essentially, it's been removed. This isn't just about a temporary issue; it's a solid fact that the order is gone, likely because it was canceled by the user or liquidated.

You should only throw this error within the order check processes, such as when brokers are actively verifying order status.  The framework handles this error specially: it immediately resolves to a "deleted" verdict, skipping any retry attempts.

It's crucial to understand *when* to use this error. It’s not for filled orders, nor for temporary network problems.  A filled order requires a separate confirmation process.  Likewise, timeouts or network errors should result in a different error type.

Throwing this error in the wrong place – outside the order checks – will lead to it being treated as a temporary issue, not a permanent deletion.  It's important to use the static methods `isOrderDeletedError` and `fromError` for accurate type checking, especially in environments where your code might be split across multiple bundles.  This error won't happen during backtesting since there's no live exchange interaction.

## Class NotificationLiveAdapter

This component handles sending notifications about your trading strategy's activity, providing flexibility in how and where those notifications are delivered. It acts as a central hub that can connect to different notification systems, like storing notifications in memory, saving them to a database, or simply discarding them (for testing).

You can easily switch between different notification methods using convenient shortcuts like `useMemory`, `useDummy`, `usePersist`. The `handleSignal`, `handlePartialProfit`, and similar functions take data related to specific events and pass them on to the currently selected notification system.

The `getInstance` property is a clever way to ensure that your notification system is only created once and reused, preventing unnecessary overhead. It also allows you to clear the existing instance if you need to rebuild it, for example, when the working directory changes. This adapter provides a simple and extensible way to keep track of what your trading strategy is doing.

## Class NotificationHelperService

The NotificationHelperService assists in sending out notifications related to signals, particularly regarding information about them. It’s designed to work behind the scenes within the trading framework.

It does a crucial job of validating different aspects like strategy, exchange, frame, risk, and action schemas. Importantly, this validation is efficient—it only happens once for each unique combination of strategy, exchange, and frame, saving on unnecessary checks.

When a signal needs to be communicated, the `commitSignalNotify` function handles the process. It first validates all relevant components, then retrieves the signal information and finally sends out a notification that can be received and stored by other parts of the system. Think of it as a reliable messenger ensuring that signal information is delivered and verified before it's shared.

## Class NotificationBacktestAdapter

This component provides a flexible way to handle notifications during backtesting. It acts as a central hub, allowing you to easily switch between different notification methods like storing data in memory, persisting it to a file, or simply discarding it.  You can choose how notifications are handled by swapping out the underlying notification implementation without changing much of your core backtest code.

The `_notificationBacktestFactory` manages which notification method is currently active. The `getInstance` method ensures the correct notification handler is used and caches it for performance.

There are specific methods (`handleSignal`, `handlePartialProfit`, etc.) for different types of events that need to be reported. Each of these methods forwards the event data to the currently selected notification adapter.

You can control the adapter using methods like `useDummy`, `useMemory`, and `usePersist` to quickly change the notification behavior. `useNotificationAdapter` gives you full control by letting you specify a custom adapter. `getData` lets you retrieve stored notifications, and `dispose` clears those notifications. Finally, `clear` ensures the adapter is refreshed when things like your working directory change.

## Class NotificationAdapter

The NotificationAdapter is the central hub for handling notifications during both backtesting and live trading. It automatically receives updates by listening for signals and keeps track of both backtest and live notifications in a single place. To prevent unnecessary subscriptions, it uses a system that ensures each signal is only subscribed to once.

You can control whether the adapter is active using `enable` and `disable` functions. `enable` sets up the notification subscriptions, while `disable` safely removes them, even if called repeatedly.

Need to access the notifications? The `getData` function retrieves all notifications, specifying whether you want the backtest or live set.  Finally, `dispose` completely clears out the notification storage, preparing the system for a fresh start.

## Class MemoryLiveAdapter

This component provides a way to manage and store trading memory data, offering flexibility in how that data is handled. It acts as a central hub, allowing you to easily switch between different storage methods like keeping data entirely in memory, persisting it to files, or even discarding it for testing purposes.

The adapter uses a system of "memoized instances," which means it efficiently stores and reuses data based on signal IDs and bucket names, automatically clearing them when a signal is closed. You can use pre-built storage options, or even create your own custom storage solutions.

Key functionalities include writing data, searching, listing, removing, and reading entries. There are also convenient shortcuts to switch between storage methods, and a `clear` function to ensure fresh data handling when the working directory changes. Think of it as a modular and adaptable memory storage system specifically designed for trading applications.


## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for backtesting, allowing you to choose different storage methods depending on your needs. By default, it uses an in-memory storage system (MemoryLocalInstance) which is fast but doesn't save your data.

You have options to switch to a file-system backed adapter for persistent storage, a dummy adapter for testing, or even plug in your own custom adapter. The adapter efficiently caches memory instances based on signal and bucket, freeing up resources.

You can clear the cache manually, which is important when your working directory changes during backtest runs.

Methods are available to write, search, list, remove, and read data from memory, all powered by a BM25 full-text scoring search.  Disposing of signal instances ensures proper memory management when signals are cancelled or closed.

## Class MemoryAdapter

The MemoryAdapter acts as a central manager for memory storage, handling both backtesting and live data environments. It automatically cleans up old data when signals are stopped, ensuring that you don’t have lingering, inaccurate information.

To start using memory storage, you need to enable it, which sets up the necessary subscriptions. Conversely, you can disable it at any time, even multiple times, without causing problems.

You can write data to memory using `writeMemory`, search for data with a text query using `searchMemory`, list all the entries available with `listMemory`, remove specific entries with `removeMemory`, or retrieve a single entry with `readMemory`. The adapter intelligently directs these operations to the correct storage location, whether it's for backtesting or live execution, based on parameters you provide.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced during your trading simulations or backtests. Think of it as a tool to access and summarize information about how much your strategy lost from its peak before recovering.

It doesn’t require you to create an instance; it’s designed to be accessed directly for its useful functions.

You can request statistical data like the biggest drawdown, using a symbol, strategy name, exchange, and timeframe. 

The `getReport` function allows you to create a detailed markdown report showing all the drawdown events for a specific strategy and trading symbol. This helps you visualize the losses over time.

Finally, `dump` lets you generate and save that markdown report directly to a file, creating a convenient record of your analysis.

## Class MaxDrawdownReportService

This service is designed to keep track of maximum drawdown events and save them for later analysis. It listens for updates on drawdown events and writes those details to a database.

The service uses a logger and tick to process drawdown information.

To start recording drawdown events, you need to subscribe to the data feed.  This process is designed to be safe, ensuring you don't accidentally subscribe multiple times.  Once you’re done collecting data, you can unsubscribe to stop the recording.

The data saved includes details like the time, the asset being traded, the strategy used, the exchange, the timeframe, signal information, position size, and the prices associated with the trade. All this ensures a complete picture of the drawdown event is preserved.

## Class MaxDrawdownMarkdownService

This service helps you create and save reports about maximum drawdown, a key risk metric in trading. It listens for drawdown events and organizes them based on the symbol, strategy, exchange, and timeframe you're interested in.

You can subscribe to receive these drawdown events, and unsubscribe when you no longer need them.

The `getData` method retrieves the accumulated drawdown statistics for a specific combination of symbol, strategy, exchange, frame, and whether it's a backtest.  `getReport` generates a user-friendly markdown report based on this data.  Finally, `dump` creates the report and saves it to a file.

To completely reset the recorded data, use `clear`.  You can clear all recorded data or just the data for a specific symbol, strategy, exchange, frame, and backtest combination.

## Class MarkdownWriterAdapter

This component provides a flexible way to manage and write markdown reports within your backtesting framework. It lets you easily switch between different storage methods, like writing each report to its own file, combining all reports into a single JSONL file, or even silencing all markdown output altogether. It remembers which storage method it's using, preventing multiple instances of the same storage type from being created.

You can change the default storage method to suit your needs. 

The `writeData` function handles the actual writing of markdown content, and initializes storage the first time it's used. 

To clear the existing storage, you can use `clear`, which is particularly useful if the base directory changes during a testing process.  Finally, `useDummy` provides a convenient way to completely disable markdown output if needed.

## Class MarkdownUtils

This class helps you control how markdown reports are generated for various parts of your trading system, like backtests, live trading, and strategy performance analysis. 

You can selectively turn on markdown reporting for specific areas of the system using the `enable` method. When you do, it starts collecting data and generating reports. It's really important to remember to unsubscribe from these services when you're done, otherwise you risk memory problems.

Alternatively, you can disable markdown reporting for some areas while leaving others on using the `disable` method. This allows you to customize what’s reported.

Finally, the `clear` method allows you to wipe the data that's been collected for markdown reports in certain areas without stopping the reporting process altogether. This is useful for resetting data and starting fresh.

## Class MarkdownFolderBase

This adapter helps you create organized reports by saving each markdown report into its own file within a folder. Think of it as generating a directory filled with individual markdown documents, making it easy to browse and review your results.

It automatically creates the necessary folder structure based on your configuration, and it handles writing the actual markdown content directly to files – no need to manage streams or complex setups. 

The file names and locations are determined by options you provide, making it flexible for different reporting needs. This is the default adapter and is ideal when you want clearly separated, human-readable reports.

The `waitForInit` method doesn't actually do anything as it's not needed for this adapter's file writing approach.

The `dump` method is the core functionality: it takes your markdown content and writes it into a new file, automatically structuring the directory path.


## Class MarkdownFileBase

The MarkdownFileBase class provides a way to write your markdown reports as JSONL data to files, making it easy to manage and process them later. It's designed to write to a single file for each type of markdown report, like trade summaries or order books.

This adapter uses a stream-based approach to write data efficiently, handling situations where the writing process might slow down. It includes built-in safeguards, like a 15-second timeout, to prevent write operations from getting stuck. It will automatically create the necessary directories to store your reports.

You can easily search and filter these reports based on criteria like the trading symbol, strategy name, exchange, frame, or signal ID. The file format is structured, with each line containing the markdown type, the actual markdown content, and relevant metadata for filtering.

Initialization happens automatically with `waitForInit`, though it’s safe to call it multiple times. The `dump` method handles writing the data – you give it the markdown content and any optional metadata, and it takes care of writing it to the JSONL file in the correct format.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown files are stored, offering flexibility with different storage methods. You can easily switch between storing each markdown file as a separate document, or appending them all to a single JSONL file. It also allows you to plug in your own custom storage solutions if you need something different. 

The adapter keeps track of these settings and only creates the storage instances once, improving efficiency. It provides shortcuts (`useMd` and `useJsonl`) to quickly change between the most common storage options. There's even a 'dummy' adapter for testing, which simply ignores all write attempts.

## Class MCPValidationService

This service helps ensure that your Model Context Protocols (MCPs) are properly set up and that the strategies they rely on actually exist. Think of it as a quality control system for your MCPs.

It keeps a record of all registered MCPs and checks to see if they're still valid whenever they're used.  If you try to register an MCP with a name that's already in use, it will prevent that, unlike some other parts of the system.

Here's a breakdown of what you can do:

*   **Register an MCP:**  You tell the service about a new MCP using `addMCP`. This helps the service keep track of it.
*   **Validate an MCP:**  The `validate` function checks if an MCP exists and its strategy dependency is valid. This check only happens once for each MCP name.
*   **List all MCPs:** The `list` function provides you with a list of all registered MCP schemas.



Essentially, it makes sure everything is consistent and working correctly related to your MCPs and their associated strategies.

## Class MCPUtils

This class provides tools for interacting with a trading strategy's live state, essentially bridging the gap between a trading system and an external agent. It acts as a utility, offering methods to retrieve information and execute commands on the strategy, all while ensuring everything is validated.

You can get a snapshot of the current portfolio status formatted into readable messages for the agent, similar to a quick report card.

It can also pull historical trade data - a log of closed positions - to prevent repeating past mistakes.

Want to know what the strategy is "saying" directly? This class provides a way to view the strategy's internal log messages sent to the agent, offering insights into its decision-making process.

The class also enables retrieving notifications related to open positions, helping understand the reasoning behind the current strategy setup.

Finally, it allows manual control - you can trigger a new position opening, close an existing one, add more buy orders (DCA), and even add notes (notifications) to positions, all under your command. This allows for direct control of the live trading process.

## Class MCPSchemaService

The MCPSchemaService acts as a central location for managing schemas that define the structure of data used in your trading strategies. Think of it as a directory where you store blueprints for how different components of your system communicate. 

It keeps track of these blueprints (schemas) using their unique names, and performs a basic check when you add a new one to make sure it has the essential information. 

The service is used by other parts of the backtest-kit framework to understand and process messages related to your trading strategy.

You can add new schemas using the `register` method, which replaces any existing schema with the same name.  The `override` method lets you modify existing schemas in a targeted way. Finally, the `get` method allows you to retrieve a schema by its name when it’s needed.

## Class LookupUtils

The LookupUtils class acts as a central record of what's currently happening in your backtests and live trading sessions. It keeps track of each backtest run, live activity, or iteration of a strategy.

Whenever a backtest starts or a live session begins, an entry is added to this record, and it's removed when finished. 

This record helps manage how the system handles certain operations, like deciding whether to delay some tasks to avoid overloading the system.

You don't need to create an instance of this class directly; it's accessed as a singleton called `Lookup`. 

Essentially, it's a behind-the-scenes tool that helps the framework coordinate different activities efficiently.

It provides methods to add, remove, and view these activity records. Make sure you remove activities after they're done, even if something goes wrong, to keep the records clean.


## Class LoggerService

The LoggerService helps ensure consistent and informative logging across your trading strategies and backtests. It automatically adds crucial details to your log messages, such as the name of the strategy, the exchange being used, and the specific frame being processed.  This service also includes information about the symbol being traded, the time of the trade, and whether it's a backtest.

You can customize the underlying logger by providing your own implementation through the `setLogger` function. If you don’t provide a custom logger, it defaults to a "do nothing" logger to avoid disrupting your application.

The `log`, `debug`, `info`, and `warn` methods all provide ways to record messages with this contextual information automatically included. The `methodContextService` and `executionContextService` manage the contextual information being injected into logs.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage how your trading framework logs information. It allows you to easily switch between different logging methods, such as storing logs in memory, writing them to a file, or effectively silencing them altogether. By default, it uses an in-memory storage, but you can readily change this to persistent storage on disk or use a dummy adapter that discards all logs.

The adapter uses a factory to generate the actual logging utility and caches this instance to avoid repeated creation. This is particularly helpful if the base path for your logs changes during a strategy's execution. The `clear()` method lets you refresh this cached instance.

You can log messages at different levels – general, debug, info, warning, and agent – and these are all passed on to the currently active logging method.  It also allows you to customize the logging method entirely by providing your own constructor for the log adapter.

## Class LiveUtils

This class provides tools for live trading, handling tasks like running strategies, managing signals, and recovering from crashes. It acts as a central point for live trading operations, simplifying access to core functionality.

It offers several key features:

*   **Live Trading Execution:**  You can start live trading for a specific symbol and strategy, with automatic crash recovery by saving and restoring state.
*   **Background Operation:**  Run live trading processes in the background without directly receiving results, useful for tasks like logging and persistence.
*   **Signal Management:** Retrieve pending or scheduled signals and check for their existence.
*   **Position Insights:** Get detailed information about the current position, including percentage closed, cost basis, entry prices, and estimated time until expiration.  This includes calculating effective price and PnL.
*   **Control and Monitoring:**  Pause or stop live trading, cancel scheduled signals, manually activate signals, and adjust stop-loss and take-profit levels.
*   **Reporting and Analysis:** Generate reports detailing trading activity and access statistical data.



The `LiveUtils` class is a singleton, meaning there's only one instance, making it convenient to use throughout your application. It manages the lifecycle of a live trading session, ensuring that it can be resumed after interruptions and providing the tools necessary to monitor and control it.

## Class LiveReportService

LiveReportService helps you track your trading strategy's activity in real-time by recording every event as it happens. It listens for signals like when a trade is idle, opened, active, or closed, and meticulously saves these details. 

Think of it as a digital record keeper for your trading.

You can use the `subscribe` method to start receiving these live events.  It ensures that you don't accidentally subscribe multiple times.  When you're done, use `unsubscribe` to stop the service from collecting data.  The `tick` property is the heart of the operation, handling all incoming trading events.  A logger service provides helpful debug messages to understand what's going on behind the scenes.


## Class LiveMarkdownService

This service helps you keep track of your live trading activity and automatically generate reports. It listens for updates from your trading strategies and gathers information about each trade, including when it starts, is active, and closes.

The service creates organized reports in markdown format, summarizing the events for each strategy you're running. You'll find performance statistics like win rate and average profit in these reports, making it easier to analyze your trading performance.

To use it, you subscribe to receive updates from your trading system, and the service handles the rest, saving reports directly to your logs directory. You can also clear the accumulated data when needed, either for a specific strategy or all of them.


## Class LiveLogicPublicService

LiveLogicPublicService helps manage live trading by automatically passing along important information like the strategy and exchange being used. It builds upon a more internal service to simplify things.

Think of it as a continuous stream of data – it keeps running indefinitely, providing information about trades as they open, close, or are cancelled.

If something goes wrong, the system is designed to recover – it saves its progress so you can pick up where you left off.

It uses the current time to keep everything synchronized and up-to-date.

**To use it:**

You provide the symbol you're trading, and it handles the rest, giving you a steady flow of trading results.


## Class LiveLogicPrivateService

This service manages live trading operations, continuously monitoring and responding to signals. It operates as an ongoing process, essentially an infinite loop, checking for new signals at regular intervals.

The core function of this service is to stream trading results – specifically, when positions are opened or closed – rather than just active or pending states. This efficient streaming approach helps manage memory usage.

It's designed to be resilient; if the system crashes, it will automatically recover its state from stored data.

To initiate live trading, you call the `run` method, providing the trading symbol you want to monitor. This method returns an async generator, delivering a stream of `IStrategyTickResultOpened` or `IStrategyTickResultClosed` objects, representing the trading actions taken. The service also depends on other services, like a logger and a strategy core, to perform its functions.

## Class LiveCommandService

The LiveCommandService makes it easy to access and control live trading features within the backtest-kit framework. Think of it as a convenient central point for managing live trading operations.

It handles validations, ensuring your trading strategies and risk settings are configured correctly before things go live. This service also keeps track of previous validations to avoid unnecessary repeated checks.

The core function, `run`, is where the magic happens – it kicks off live trading for a specific symbol and provides a continuous stream of results (like open, close, or cancelled trades). It's designed to be resilient, automatically recovering from crashes to keep your trading going. This service uses internal components like a logger, and validation services to manage the complexities of live trading.

## Class IntervalUtils

The `IntervalUtils` class helps you control how often functions are executed within a specific time interval, preventing them from running too frequently. It offers two approaches: in-memory, where state is held in the application's memory, and file-based, where the state is saved to disk for persistence across restarts. You'll find a single, readily available instance called `Interval` to use these features.

The `fn` function lets you wrap regular functions, ensuring they only run once per interval. If a function returns `null`, it will automatically retry later.  Each function you wrap gets its own dedicated instance, keeping things organized.

Similarly, the `file` function is designed for asynchronous functions and persists their execution state to a file. This means the function’s "fired" state remains even if the application restarts.  Like `fn`, each asynchronous function gets its own isolated instance.

You can clean up memoized instances with `dispose` to force the creation of new ones, or clear everything with `clear` when things like your working directory change.  `resetCounter` is handy for maintaining unique identifiers when your project's base directory changes.

## Class HighestProfitUtils

This class is designed to help you analyze and understand your trading performance, specifically focusing on identifying the highest profit-generating moments. It works with data collected about events related to those peak profit points. 

Think of it as a tool to pull together reports and statistics about when your strategies performed exceptionally well.

Here’s what you can do with it:

*   **getData:** You can ask it for detailed statistics about the highest profits achieved for a specific trading symbol, strategy, exchange, and timeframe. It can also distinguish between backtesting and live trading data.
*   **getReport:**  It can create a formatted markdown report summarizing all the highest profit events for a chosen symbol and strategy. You have control over which details are included in the report.
*   **dump:**  This feature lets you automatically generate and save that same markdown report directly to a file, making it easy to share or archive. You can also specify which columns of data to include.



Essentially, this utility provides easy access to the best performing moments of your trading strategies.

## Class HighestProfitReportService

The HighestProfitReportService is designed to keep track of when a trading strategy hits a new peak profit. It listens for notifications about these highest profit events and diligently records them in a special database format (JSONL) for later analysis.

Think of it as a dedicated observer that captures crucial moments when a trading strategy performs exceptionally well.

To get started, you need to "subscribe" to the service; this begins the process of tracking and saving those profit records.  It's designed so you don't accidentally subscribe multiple times – the initial subscription call will provide a way to unsubscribe later.

When you’re finished, you can “unsubscribe” to stop the recording.  This ensures the service doesn’t continue to log data unnecessarily.

The service captures a snapshot of the signal details at the time of the highest profit - including the timestamp, symbol, strategy name, exchange, frame, backtest information, signal ID, position, current price, and take profit/stop-loss levels – providing a complete picture of what led to that peak.  This rich data helps you understand and potentially replicate successful strategies.


## Class HighestProfitMarkdownService

This service is responsible for collecting and reporting on the highest profit events generated by your trading strategies. It listens for these events and organizes them based on the symbol, strategy, exchange, and timeframe used.

You can subscribe to receive these events, and once you do, subsequent subscriptions won't re-subscribe, preventing duplicate data collection.  An unsubscribe function is provided to cleanly stop the process and clear any accumulated data.

The `tick` method handles each incoming event, routing it to the correct storage location.  You can retrieve the raw data, generate formatted markdown reports, or dump the reports directly to files, with file names incorporating the symbol, strategy, exchange, and timeframe.

The `clear` function lets you selectively clear accumulated data, either for a specific combination of symbol, strategy, exchange, and timeframe, or for everything. This is useful for resetting data or freeing up memory.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading strategy's performance with heatmaps. Think of it as a convenient tool to quickly see how different symbols contribute to your strategy's overall results.

It gathers data from closed trades for a specific strategy and automatically calculates key statistics like total profit, Sharpe ratio, and maximum drawdown for each symbol.

You can generate a nicely formatted markdown report displaying this information in a table, sorted by profit, which is great for presentations or detailed analysis.

Finally, it lets you save this report directly to a file, so you can easily share or archive your findings. It takes care of creating any necessary directories to store the report.


## Class HeatReportService

This service helps you track and analyze your trading performance by recording closed trading signals. It listens for signals and specifically logs the information about signals that have closed, including the profit and loss (PNL).

The service stores this data in a format suitable for creating heatmap visualizations, giving you a portfolio-wide view of your trading activity.

You can easily start and stop the service’s signal event tracking using the `subscribe` method, which returns a function you use to stop listening. If you try to subscribe multiple times, the system prevents that. The `unsubscribe` method is a convenient way to stop receiving signal events too, and it will do nothing if you haven't subscribed initially.

The service uses a logger for any debugging messages and relies on a `tick` to process the signal events and write the data to the database.


## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance by creating a portfolio-wide heatmap. It listens for trading signals and aggregates key data points like profit/loss, Sharpe Ratio, and maximum drawdown for each strategy and symbol.

It lets you generate reports in Markdown format, making it easy to share and review your results. The service keeps track of these statistics in a way that's optimized for speed, remembering data for each exchange, frame, and backtest mode.

You can subscribe to receive real-time updates on closed trades, and the service includes a mechanism to safely handle calculations, preventing errors caused by unusual data.  If you want to clear the accumulated data, you can either selectively wipe data for a specific combination of exchange, frame, and backtest mode, or clear all data entirely. Unsubscribing stops the service from listening for new signals.

## Class FrameValidationService

This service helps you keep track of and ensure the validity of your trading timeframes, often called "frames." Think of it as a central place to register your different timeframe configurations and double-check they exist before your strategies try to use them. 

It’s designed to be efficient; once a timeframe is validated, the result is remembered so you don't have to re-validate it repeatedly.

Here's what it lets you do:

*   Register new timeframes using `addFrame()`.
*   Confirm that a specific timeframe exists and is properly defined with `validate()`.
*   Get a complete list of all registered timeframes using `list()`. 
*   It uses a logger service for debugging and an internal map to store frame configurations.

## Class FrameSchemaService

This service keeps track of your frame schemas, acting like a central repository for them. 

It uses a specialized registry to safely store these schemas, ensuring type correctness. You can add new schemas using the `register` method, and then retrieve them later using their name with `get`. 

If a schema already exists, you can update it partially using the `override` function. Before adding a new schema, the service performs a quick check to make sure it has the essential properties, which is done by `validateShallow`. This helps prevent errors down the line by making sure your schemas are structurally sound from the beginning.

## Class FrameCoreService

FrameCoreService is the central place for handling timeframes within the backtesting system. It works closely with the connection service to fetch and manage the data needed for each backtest. Think of it as the engine that provides the sequence of dates you'll be analyzing.

The `getTimeframe` function is key – it's what actually creates the list of dates (the "frame") based on a specific trading symbol and the timeframe you've chosen (like daily, hourly, etc.). This function is used internally to power the backtesting process. It also has access to logging and validation services.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing different backtest frames. It intelligently directs requests to the correct ClientFrame based on the active context. To make things efficient, it remembers (caches) these ClientFrame instances, so it doesn't have to recreate them every time. 

It follows the IFrame interface and handles backtest timeframe details like the start date, end date, and interval.

When running in live mode, there's no frame restriction, so the frameName will be an empty string.

The `getFrame` function is your go-to for retrieving a ClientFrame, and it uses a caching technique to improve performance.

The `clear` function is essential for keeping things fresh.  It clears out those cached ClientFrame instances, ensuring that the backtest always uses the most up-to-date timeframe data.  This prevents issues where a long-running backtest might get stuck using stale data.

Finally, `getTimeframe` helps define the specific date range for your backtest, limiting the execution to a defined period.

## Class ExchangeValidationService

This service helps you keep track of your exchanges and make sure they're set up correctly before you start trading. It acts like a central manager for your exchange configurations. 

You can register new exchanges using the `addExchange()` method, telling the service about them.  Before performing any actions related to an exchange, use `validate()` to confirm it's registered – this helps prevent errors. 

To quickly see what exchanges you've registered, the `list()` method will give you a complete rundown. The service also cleverly remembers validation results to speed things up. This helps you manage your exchange setup in a reliable and efficient way.

## Class ExchangeUtils

This class provides helpful tools for working with different cryptocurrency exchanges within the backtest-kit framework. Think of it as a central hub for common exchange-related tasks.

It’s designed to simplify retrieving data like historical candles, calculating average prices, and formatting quantities and prices to match each exchange's specific rules. To keep things organized and prevent conflicts, it uses a special system to create a unique, isolated instance for each exchange you're working with.

You can easily fetch order books and aggregated trades, and if you need raw candle data, it allows for a lot of control over the date range and number of candles retrieved. A particularly useful feature is how it handles time – ensuring that calculations are correct whether you're running a live trade or simulating past performance.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring consistency and accuracy. It uses a special system to store this data safely and reliably.

You can add new exchange details using the `addExchange` function, and find existing exchanges by their names using `get`.

Before an exchange is added, it's checked to make sure all the necessary information is present and in the right format with `validateShallow`.

If an exchange already exists, you can update parts of its information with the `override` function.

The service relies on internal tools for logging and managing the data storage itself.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for handling exchange-related operations within the backtesting framework. It combines connection management with the ability to inject specific conditions, like the trading symbol, date, and backtest settings, into those operations. This service internally manages several components, including logging, connection handling, and data validation.

It provides several helpful functions for retrieving data, such as historical and future candles, average prices, order books, and aggregated trades. These functions all take into account the current execution context, ensuring data is relevant to the simulation. The service also offers utilities to format prices and quantities according to the trading environment. A key feature is its capability to validate exchange configurations, optimizing performance by caching results.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests—like fetching historical data, getting order books, or retrieving prices—to the correct exchange based on your configuration. 

This service is designed to be efficient; it remembers previously used exchanges to avoid redundant connections. 

Here's a breakdown of what it offers:

*   **Exchange Routing:** It figures out which exchange to use based on the active context.
*   **Caching:** It keeps track of exchanges so it doesn’t have to constantly create new connections.
*   **Comprehensive Functionality:** It provides methods for common exchange operations.
*   **Real-time and Historical Data:** It can retrieve current data or historical candles, tailoring the response based on whether you are in a backtesting or live trading environment.
*   **Price and Quantity Formatting:** It helps ensure that the prices and quantities you’re working with conform to the specific rules of each exchange.
*   **Order Book & Trades:** It retrieves order book and aggregated trade data from the connected exchange.
*   **Flexible Data Retrieval:** It fetches raw candles, allowing for custom date ranges and limits.

## Class DumpAdapter

The DumpAdapter acts as a central point for saving different kinds of data during a backtest, allowing you to choose where that data is stored. It handles the details of creating and managing these storage connections, so you don’t have to.

Think of it as a flexible tool for capturing snapshots of your backtest’s activity. By default, it saves data as individual markdown files, neatly organized by signal and bucket.

You can easily change where the data goes—store it in memory, discard it entirely for testing, or provide your own custom storage solution. 

Before you start saving data, you need to activate the adapter using `enable()`, which sets up the necessary subscriptions.  When you’re done, `disable()` cleans up those subscriptions.

There are methods for saving everything from full message histories and key-value records to tables, raw text, errors, and JSON data.  The `use...()` methods provide shortcuts for selecting different storage backends. `clear()` ensures a clean slate when needed, particularly when switching between different working directories.

## Class CronUtils

This utility class, `Cron`, helps manage periodic tasks related to backtesting, especially when dealing with parallel tests. It's designed to ensure that a specific task runs only once even if multiple tests are triggered concurrently. Think of it as a way to synchronize events across different, simultaneous backtest runs.

Here's a breakdown of how it works:

*   **Synchronization**: When multiple backtests hit the same time boundary, `Cron` ensures that a particular task only executes once, avoiding duplicated work.
*   **Registration**:  You register tasks with specific names and intervals.
*   **Memory Management**: It automatically cleans up old entries, freeing up resources and preventing issues with older data.
*   **Lifecycle Control**: `enable` and `disable` functions let you connect `Cron` to the backtesting engine's events, automating task execution.
*   **Resetting State**: `dispose` allows you to completely clear all registered tasks and internal data.

The framework uses a clever system with generation counters and in-flight promises to guarantee this single execution, even as the backtests run in parallel.  Watermarks are used to avoid dropping ticks.



This component is a singleton (the `Cron` instance), making it easy to access and use across your backtesting setup.

## Class ConstantUtils

The ConstantUtils class provides a set of pre-defined values used for managing take-profit and stop-loss levels in your trading strategies. These levels are calculated using a modified Kelly Criterion, designed to incorporate an element of risk decay. Think of them as incremental steps towards your final profit or loss targets – they allow you to secure profits or reduce risk in stages.

For instance, TP_LEVEL1 triggers when the price moves 30% towards your overall profit target, letting you capture a portion of the gains early on.  Similarly, SL_LEVEL1 acts as an initial warning sign, reducing exposure when the trade isn't performing as expected.  There are levels 2 and 3 for both TP and SL, offering even finer control over how your positions are managed and ultimately exited.

## Class ConfigValidationService

The ConfigValidationService helps ensure your trading configurations are mathematically sound and capable of making a profit. It meticulously checks your settings to prevent issues that could lead to losses.

It verifies that percentage-based parameters like slippage and fees are non-negative. 

Crucially, it makes sure your take-profit distance is large enough to account for all trading costs, guaranteeing a profit when the take-profit target is reached.

The service also enforces proper relationships between settings, like ensuring minimum and maximum values are correctly ordered. 

Finally, it validates time-related and candle-related settings, ensuring they are configured with positive integer values for timeouts, retry counts, and anomaly detection thresholds.


## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly, preventing errors down the line. It checks your column definitions against a set of rules to ensure they're consistent and valid.

Specifically, it verifies that each column has all the essential properties: a unique key, a descriptive label, a formatting function, and a visibility function.

It also ensures that the keys are unique and that the label and key are actually strings, not empty or of the wrong type.  The `validate` method performs this entire check across all your column configurations.

## Class ClientSweep

The `ClientSweep` is a powerful tool designed to help you quickly identify promising trading strategies and parameters without running full backtests repeatedly. It efficiently evaluates a large number of trading ideas by simulating their performance across a grid of parameters.

Think of it as a way to narrow down your options before committing to a full-scale backtest. It assesses authors in isolation, focusing solely on their individual idea performance.

The process involves several key steps:

1. It starts by cleaning up your trading ideas, filtering out irrelevant ones and removing duplicates.
2. Then, it generates performance profiles for each idea based on historical candle data.
3. Next, it creates a list of authors to exclude based on their historical performance.
4.  It then evaluates each idea against a range of parameters, calculating metrics like Sharpe and Sortino ratios.
5. Finally, it ranks the best performing combinations and produces a result that you can use to refine your strategies.

The `run` method initiates this entire process for a specific trading symbol, providing you with a result that includes ranked ideas, a curated author ban list, and overall performance statistics.  Remember that the sweep provides initial candidates— it's essential to validate these findings with a standard backtest using the `Backtest.run` method. The entire sweep is stateless, meaning each run is independent of previous ones.


## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on various strategies. It's a flexible system allowing you to use methods like fixed percentage, Kelly criterion, or Average True Range (ATR) to decide position sizes.

You can also set limits on the minimum and maximum position sizes, as well as a cap on the percentage of your capital used for any single trade.  The system is designed to be adaptable, allowing you to add custom validation steps and logging to refine the sizing process. Essentially, it's the engine that figures out how much to buy or sell in a trade.

The `calculate` method is the core function, taking input parameters and returning the calculated position size.

## Class ClientRisk

ClientRisk manages risk at the portfolio level to prevent signals that exceed defined limits. It tracks things like the maximum number of concurrent positions and allows for custom validation rules using all current positions. This shared risk assessment benefits multiple strategies, ensuring cross-strategy risk analysis. The system validates signals before positions are opened, and works internally within the strategy execution process.

It has several important components:

*   **Configuration:** The `params` property holds the initial risk configuration settings.
*   **Active Positions:** A map (`_activePositions`) tracks all currently open positions across strategies.
*   **Reservations:**  `_reservedKeys` handles temporary placeholders in the position map to prevent over-allocation during concurrent signal processing. This ensures that a signal isn't validated and then rejected due to exceeding concurrency limits by another strategy.
*   **Persistence:** Initialization and saving of positions. This functionality is skipped in backtest mode.

Key methods to understand:

*   `checkSignal`:  Validates a signal based on risk rules.
*   `checkSignalAndReserve`:  Atomically validates and reserves a position slot. This is crucial for concurrency safety.
*   `addSignal`: Registers a newly opened position.
*   `removeSignal`:  Removes a closed position.



The risk map keys are constructed using strategy name, exchange name, and symbol, allowing for organized tracking. Properly using `addSignal` and `removeSignal` is vital to avoid stale reservation issues within the risk map.

## Class ClientFrame

The ClientFrame handles the creation of timeframes – essentially, lists of dates and times – needed for backtesting trades. It’s designed to be efficient, avoiding the repeated generation of the same timeframe data.

You can control how frequently these timeframes are generated, choosing intervals ranging from one minute to one day.

It also includes a mechanism for custom validation and logging of the generated timeframes. 

The `getTimeframe` property lets you retrieve the timeframe array for a specific trading symbol, and it remembers previous results to speed up subsequent requests. This component is a core part of the backtesting engine.

## Class ClientExchange

The `ClientExchange` class is designed to provide a way to access exchange data, like historical and future candle data, in your backtesting environment. It’s built for efficiency, using techniques that minimize memory usage.

Need historical price data? You can use `getCandles` to fetch it, going backward from a specific point in time.  To look ahead and get future data during backtesting, use `getNextCandles`.  It also has a handy method, `getAveragePrice`, that calculates the Volume Weighted Average Price (VWAP) using recent 1-minute candles. 

For simple price checks, `getClosePrice` retrieves the closing price of the most recent candle for a given interval.  You can also use `formatQuantity` and `formatPrice` to present prices and quantities in a way that’s appropriate for your exchange.

If you need more raw data, `getRawCandles` offers a lot of flexibility to fetch candles based on specific start and end dates or limits. It’s designed to prevent looking into the future, which is crucial for accurate backtesting.  `getOrderBook` gives you a snapshot of the order book, and `getAggregatedTrades` retrieves a list of aggregated trades from the past.

## Class ClientAction

The `ClientAction` component is like a central hub for managing and executing custom actions within your trading strategy. It's designed to handle various events and route them to your action handlers, which can be used for things like managing your trading state, logging events, sending notifications, or collecting data.

Think of it as a system that sets up and cleans up your action handlers, ensuring they're only initialized and disposed of once. This component manages the lifecycle of these handlers, initializing them only when needed and cleaning them up when they're no longer required.

It provides several methods for different types of events, like `signal` for general events, and more specific ones like `breakevenAvailable`, `partialProfitAvailable`, and `riskRejection`. There are also methods for handling scheduled events and order-related actions.

For more advanced users, you can manually wire these events to specific callbacks, giving you fine-grained control over how your strategy responds to various market conditions. Essentially, it's a flexible framework for integrating custom logic into your trading backtests and live strategies.

## Class CacheUtils

CacheUtils provides tools to automatically cache the results of your functions, which can significantly speed up backtesting. It's designed to be easy to use and helps manage caching for functions that are used repeatedly with different parameters or across different strategies.

The `fn` function lets you wrap regular functions to cache their results based on time intervals (like hourly or daily data), so you don't have to recalculate them every time.

The `file` function is similar, but it uses persistent file storage instead of memory. This is great for larger datasets or when you need to save cached results between backtest runs. The files are stored in a specific directory structure to keep things organized.

If you need to manually remove the cached data for a specific function, you can use `dispose`.  If you need to completely wipe the cache, including file-based caches, `clear` will do that. `resetCounter` ensures that the file-based caches are numbered correctly when the working directory changes. 

Essentially, CacheUtils handles the details of caching so you can focus on your trading logic.


## Class BrokerBase

This class provides a foundation for building custom broker adapters within the backtest-kit trading framework. Think of it as a starting point for connecting your strategies to real exchanges. It handles the basic plumbing – order placement, tracking positions, and sending notifications – with default implementations that log everything. 

You'll extend this class to actually interact with specific exchanges, like Binance or Coinbase.

Here’s a breakdown of what you’ll find:

*   **Initialization:** The `waitForInit()` method is your chance to set up the connection to the exchange, authenticate your API keys, and do any other necessary initialization tasks.  A crucial thing to do here is cleaning up any old, potentially unfinished orders that might have been left over from previous runs – this ensures your backtests start from a clean state.

*   **Order Handling:**  Methods like `onOrderOpenCommit`, `onOrderCloseCommit`, and their partial counterparts deal with opening, closing, and managing positions.  You'll implement the logic here to actually send orders to the exchange. Throwing errors in these methods allows you to retry failed operations, ensuring robustness.

*   **Live Monitoring:** `onSignalActivePing`, `onSignalSchedulePing` are used to monitor your open and pending orders in real-time and mirror the state. `onSignalIdlePing` allows you to track the system's activity.

*   **Event-Driven Architecture:** Many methods are designed to be event-driven. They're called at specific points in the trading lifecycle and allow you to react to events like price movements, order status changes, and so on.

*   **Comprehensive Structure:** The class provides all necessary methods; you only need to override the ones that are required for the exchange you are working with. It automatically logs all the interactions it makes via the system's logger.

## Class BrokerAdapter

The `BrokerAdapter` acts as a crucial intermediary between your trading strategy and the actual broker. Think of it as a gatekeeper that ensures all order-related actions are handled correctly and safely. It's especially important for managing transactions—if anything goes wrong while placing or closing an order, the adapter prevents those changes from being applied to your trading environment.

During backtesting, it simplifies things by skipping actual broker interactions, allowing for faster simulations. In live trading, it forwards orders to the real broker.

Here's a breakdown of what it does:

*   **Order Events:** It automatically handles signals for opening and closing orders.
*   **Order Checks:**  It continuously checks on the status of orders, providing important feedback to the system.  This includes active pings, scheduled pings, and idle pings.
*   **Specific Order Actions:** It intercepts and validates actions like setting profit targets, stop-loss levels, and breakeven prices.  These are checked before they’re applied to ensure everything is correct.
*   **Registration and Activation:** You need to register a broker adapter (`useBrokerAdapter`) and then activate it (`enable`).  Deactivating (`disable`) and clearing (`clear`) are available for resetting and rebuilding as needed.

In essence, the `BrokerAdapter` creates a safe and controlled interface for interacting with your broker, ensuring a smoother and more reliable trading experience.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events that have occurred. It's designed to provide useful information about how your trading strategies perform regarding breakeven points.

You can use it to get statistical summaries of breakeven events, like how many times breakeven was triggered.

It can also generate detailed markdown reports, creating tables that show individual breakeven events, including the symbol, strategy used, entry price, and more.

Finally, you can easily save these reports to files, creating a structured record of your breakeven performance with automatically generated filenames. The tool takes care of creating the necessary directories for storing these reports.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. 

It listens for these "breakeven" events and records them, including all the details of the signal that triggered it. This allows for detailed analysis and tracking of performance.

To use it, you subscribe to the service and it will begin capturing these events. Make sure to unsubscribe when you no longer need it, to stop the service from processing further events. The loggerService property enables debugging, while tickBreakeven manages the actual event logging and database interaction.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically generate and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them, creating clear markdown tables that summarize the information for each symbol and strategy you’re using. 

You can subscribe to receive these events, and the service keeps track of them, providing overall statistics like the total number of breakeven events.  It saves these reports as markdown files so you can easily review and analyze your trading performance.

The service uses a clever storage system, ensuring each symbol-strategy-exchange-frame-backtest combination has its own separate data storage.  You can get data, generate detailed reports, save them to disk, or even clear the accumulated data when it's no longer needed. It allows targeted clearing of data for specific symbol-strategy combinations, or complete clearing of all data.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing and tracking breakeven points in your trading strategies. It simplifies how your strategies interact with the breakeven functionality by providing a single place to inject dependencies and ensuring consistent logging.

Think of it as a middleman – it receives requests related to breakeven and passes them on to the BreakevenConnectionService while recording these actions for monitoring.

It's designed to be easily integrated into your ClientStrategy, providing a structured way to handle breakeven calculations and validations. The service relies on several validation services to confirm the existence of strategies, risks, exchanges, frames, and actions before proceeding.

Key functions include:

*   **`check`**: Determines whether a breakeven event should occur and initiates it if the criteria are met, with detailed logging.
*   **`clear`**: Resets the breakeven state when a signal closes, again with global logging and delegation.
*   The `validate` function offers a way to confirm strategy and risk configurations, optimizing performance by caching results.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It essentially keeps track of breakeven calculations for each signal, ensuring that we don't create unnecessary duplicates.

Think of it as a central place where we retrieve and manage these calculations, which are called ClientBreakeven instances. It remembers these instances so they can be reused later.

When a signal appears, this service creates a ClientBreakeven to manage its breakeven state. This ClientBreakeven is set up with logging and notification capabilities.

It handles the logic to check if a breakeven should be triggered and resets the state when a signal is finished.

The service uses a clever caching system to efficiently manage these ClientBreakeven instances, making sure resources are used wisely and keeping things organized. It works closely with other parts of the system, like the strategy and global services, to make the whole process smoother.

## Class BacktestUtils

This class provides tools to run and analyze backtests within the trading framework. It's designed to be a convenient, centralized way to interact with the backtesting process.

The `run` method executes a backtest for a specific symbol, providing detailed results as it progresses.  You can also run a backtest in the background with `background` if you only need side effects like logging.

Several methods allow you to retrieve information about the active backtest, such as pending signals (`getPendingSignal`), position details (`getTotalPercentClosed`, `getTotalCostClosed`), and various other metrics.  These methods are helpful for understanding the state of the backtest and diagnosing issues.

There are also methods to manipulate the backtest state, such as `stop` to halt the test, or `commit...` methods to simulate events like taking profits, stop losses, or adjustments to signals.  This is useful for exploring different scenarios and analyzing their impact.

The class is intended to be used as a singleton, providing a central access point for all backtest-related operations. It helps manage isolated backtest instances for each symbol-strategy combination, ensuring consistency and preventing interference.


## Class BacktestReportService

The BacktestReportService is designed to help you understand and debug your trading strategies by keeping a detailed record of what’s happening during backtests. It acts like a silent observer, listening for events triggered by your strategy, like when a signal is idle, opened, active, or closed. 

It meticulously logs every event, including all the important details of the signal, and stores this information in a database (SQLite) for later review. 

You can think of it as a way to create a time-stamped diary of your backtest.

To get it working, you'll use the `subscribe` function, which connects it to the backtest process; this returns a function you’ll need to call later to stop it. 

The `unsubscribe` function is a convenient way to do that – it ensures the service stops listening even if it was already unsubscribed. The `tick` property handles the actual processing of the events, and the `loggerService` provides a way to output debug information.

## Class BacktestMarkdownService

This service is designed to automatically generate reports detailing the performance of your trading strategies during backtesting. It keeps track of closed trades (signals) for each strategy, organizing them in a way that allows for easy analysis.

The service listens for incoming tick events, specifically focusing on signals that have already closed. It stores this information, creating separate, isolated storage for each combination of symbol, strategy, exchange, timeframe, and backtest run.

You can request statistical data, create detailed markdown reports (essentially tables) summarizing the signals, and even have those reports automatically saved to disk in a standardized format. The reports include signal details, making it straightforward to review the effectiveness of your strategies.

For cleanup purposes, you have the ability to clear all accumulated signal data or just the data for a specific strategy and symbol combination.

To use this service, you need to subscribe it to receive tick events, and later unsubscribe when you're finished.

## Class BacktestLogicPublicService

This service simplifies running backtests by automatically handling the necessary context information. It manages things like the strategy name, exchange, and frame name, so you don't have to pass them as arguments to every function. 

It's built around a private backtest logic service and incorporates several other services to manage time, frame schemas, and exchange connections.

The `run` method is the main entry point, allowing you to start a backtest for a specific symbol. It returns a stream of results – signals indicating when trades should be opened, closed, or cancelled – and takes care of passing the relevant context data to the underlying functions being called during the backtest.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService orchestrates the backtesting process, handling the flow of data and computations. It begins by retrieving the necessary timeframes and then iteratively processes each one, calling tick functions as needed. When a trading signal appears, it fetches the required candle data and executes the backtest. 

To account for open signals, the system intelligently skips timeframes until the signal is closed. The backtest results, including closed signals, are then streamed to the consumer, one at a time, which is particularly memory-efficient since the results aren't accumulated in a large array. You can even stop the backtest early by breaking the generator.

This service relies on several core services, including the StrategyCoreService, ExchangeCoreService, FrameCoreService, ActionCoreService, TimeMetaService, PriceMetaService and a logger service, to handle specific tasks. The `run` method initiates the backtest for a specified symbol, returning an asynchronous generator that yields the results.

## Class BacktestCommandService

This service acts as a central point for all backtesting operations. It provides a straightforward way to access and run backtests, designed to be easily integrated into different parts of your application.

It bundles together several other services, including those that handle logging, validating strategy configurations, and interacting with exchanges. 

You can use the `validate` property to check if your trading strategy and risk settings are correctly configured – a quick way to catch potential errors before the backtest even starts.  It remembers previous validations to save time.

The core functionality is the `run` method, which allows you to execute a backtest for a specific trading symbol, passing along information like the strategy and exchange names being used. This method returns a stream of results detailing the actions taken during the backtest.

## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your action handlers, which are pieces of code that react to specific events in your trading system. Think of it as a central place to register all your actions and double-check they’re available before anything tries to use them. 

It’s designed to be efficient because it remembers the results of previous validation checks – so it doesn't have to check the same thing repeatedly.

Here's what you can do with it:

*   You can register new action handlers using `addAction`, effectively adding them to the service's registry.
*   The `validate` function lets you confirm that an action handler actually exists before you try to use it, preventing errors.
*   If you need to see all the action handlers you've registered, `list` provides a handy way to get that information. 
*   It uses `loggerService` for logging, and internally keeps track of actions using `_actionMap`.

## Class ActionSchemaService

The ActionSchemaService helps manage and keep track of the blueprints for actions your system can take. It's like a central place where you define what actions are available, what they do, and how they work.

It uses a special system to ensure everything is type-safe, which means fewer errors and more predictable behavior.  When defining actions, it checks to make sure you’re only using the methods that are supposed to be used, preventing unexpected issues. It allows you to have helper methods that aren't directly part of the public action interface.

You can add new action schemas, and even update existing ones without having to completely redefine them, making modifications easier. Finally, when you need to use a specific action, this service provides the complete configuration so everything is set up correctly.


## Class ActionProxy

ActionProxy acts as a safety net around your custom trading logic, making sure errors don't crash the entire system. Think of it as a protective layer when you're defining how your strategy responds to different events.

It essentially wraps all your custom methods – like how you react to a signal, breakeven, or partial profit – in a `try...catch` block. This means that if something goes wrong in your code, the error is logged, and the system continues running. It's designed to handle situations where you might not have implemented all the available methods.

Here's how it works:

*   **Safe Execution:** It makes sure that even if you don't provide a method, the system doesn’t break – it just moves on.
*   **Error Handling:** Catches errors that may occur when executing your custom methods and keeps the backtest running.
*   **Factory Pattern:** You create instances of `ActionProxy` using a special `fromInstance` method to ensure everything is properly wrapped.
*   **Specific Events:** There are dedicated methods to handle various signals and events like `signal`, `breakevenAvailable`, `partialProfitAvailable`, and many more related to scheduling, pinging, and risk management.

Some key methods, like `orderSync` and `orderCheck`, are intentionally left unwrapped by `try...catch` to propagate errors directly—these are crucial for order management. `dispose` handles cleanup when the testing is done. Overall, ActionProxy promotes robustness in your backtesting framework by preventing individual errors from derailing the entire process.

## Class ActionCoreService

The `ActionCoreService` acts as a central hub for managing actions within your trading strategies. It's responsible for orchestrating the execution of actions defined in strategy schemas, ensuring they're validated and invoked in the correct order.

Here's a breakdown of its key functions:

*   **Action Dispatching:** It takes action lists from strategy definitions and executes them, handling necessary validations along the way.
*   **Validation:** It checks that the strategy, exchange, frame, and actions all exist and are valid. The validation process is optimized to avoid repeated checks.
*   **Lifecycle Events:** It provides methods (`signal`, `signalLive`, `signalBacktest`, etc.) to route various events (like signal updates, breakeven notifications, and scheduled pings) to the relevant actions, ensuring different strategies respond to specific circumstances.
*   **Initialization & Cleanup:** It initializes actions when a strategy starts (`initFn`) and cleans up resources when it ends (`dispose`).
*   **Order Management:** Specific functions (`orderSync`, `orderCheck`) help coordinate orders and pings across all actions.
*   **Data Clearing:** It includes a method (`clear`) to remove action data, either for individual actions or across all strategies.



Essentially, it provides a structured and reliable way to interact with actions within your backtesting framework, automating many of the common tasks involved in strategy execution.

## Class ActionConnectionService

This service acts as a central hub for directing various actions related to trading strategies. It receives signals and events—like new ticks, breakeven points, or scheduled tasks—and routes them to the correct action implementation based on details like the strategy name and the timeframe being used. To improve performance, it remembers recently used action implementations so it doesn't have to recreate them every time, keeping things efficient.

The service relies on other services like a logger, action schema service, and strategy core service to do its job effectively. You'll pass in information about the action you want to trigger—like its name and associated context—and it handles the rest, making sure the signal reaches the right place.  There are specific methods for handling various event types, including signals in live and backtest modes, partial profit and loss calculations, and more.  You can even clear the cached action implementations when they are no longer needed, freeing up resources.

## Class ActionBase

This `ActionBase` class is designed to help you extend the backtesting framework with your own custom logic. Think of it as a foundation for building specialized actions that handle everything from sending notifications to managing complex strategies.

It provides default logging for all key events, so you don't need to implement every method—only the ones you need. You’ll receive information about strategy name, frame name, and the specific action being executed.

The lifecycle is straightforward: initialization happens at the start (`init`), then event methods fire as the strategy runs (`signal`, `breakevenAvailable`, etc.), and finally, cleanup occurs at the end (`dispose`).

Different `signal` methods are available depending on your needs: `signal` for general events, `signalLive` for live trading only, and `signalBacktest` specifically for backtesting. Other specialized events include alerts about breakeven points, profit milestones (`partialProfitAvailable`), loss milestones (`partialLossAvailable`), and risk rejections (`riskRejection`). The `dispose` method allows you to clean up any resources you used during the process.
