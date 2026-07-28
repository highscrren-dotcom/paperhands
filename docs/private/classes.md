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

The WalkerValidationService helps you organize and check your parameter sweep setups, which are used for things like optimizing trading strategies or tuning hyperparameters. It keeps track of all the parameter sweep configurations you've defined, making sure they exist before you try to use them. 

Think of it as a central registry for your parameter sweeps.

Here's what you can do with it:

*   **Register walkers:** You use `addWalker()` to tell the service about your parameter sweep configurations.
*   **Validate walkers:** The `validate()` function checks if a parameter sweep exists and also verifies the trading strategies associated with it, ensuring they're properly set up and have valid risk profiles and actions.
*   **List walkers:** `list()` gives you a complete view of all the parameter sweep configurations you've registered.

The service also uses caching to make the validation process faster. It relies on several other services like `loggerService`, `walkerSchemaService`, and others for its core functionalities.

## Class WalkerUtils

WalkerUtils provides a handy way to manage and interact with walkers, which are essentially sets of strategies used for backtesting and analysis. Think of it as a central tool for running and controlling these strategy groups.

It simplifies the process of running walkers by automatically handling details like identifying the correct strategies and keeping track of their progress. You can easily start a walker comparison, run it in the background for tasks like logging, or halt its operation.

To get detailed results, you can request data and generate reports summarizing the performance of each strategy within the walker. WalkerUtils also lets you see the current status of all active walkers. 

This class is designed to be used consistently throughout your application, with a single, shared instance managing all walker interactions. Each unique combination of a symbol and walker gets its own dedicated instance to keep things organized.

## Class WalkerSchemaService

The WalkerSchemaService helps manage a collection of walker schemas, ensuring they're stored and accessed safely. It uses a specialized registry to keep track of these schemas and their types.

You add new walker schemas using the `addWalker` function (which is exposed as `register`). To find a schema, you can retrieve it by name using the `get` function.

Before a new walker schema is added, it goes through a quick check (`validateShallow`) to make sure it has the necessary structure and properties.

If a walker schema already exists, you can update parts of it using the `override` function, which merges the new information into the existing schema. 

The service also has internal components, including a logger, which assists in diagnosing and understanding the service's behavior.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies perform during optimization. It essentially listens for updates on your optimization process and records the results in a database.

You can think of it as a data logger, capturing details like metrics and statistics for each strategy test. 

It helps you monitor your best strategy and the overall optimization progress.

To start using it, you'll subscribe to the walker events to receive these updates.  When you're finished, you can unsubscribe to stop the data logging. The service ensures you don't accidentally subscribe multiple times.

The service also provides a logger for debugging purposes and uses a special mechanism to handle subscriptions safely.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically generate and save detailed reports about your trading strategies. It listens for updates from your trading simulations (walkers) and keeps track of how each strategy is performing.

Think of it as a reporting engine that organizes the data from your backtests. 

Here’s a breakdown of what it does:

*   It receives progress updates from the trading simulation.
*   It stores the results for each strategy, keeping things separate for each walker.
*   It creates readable markdown tables to compare the performance of different strategies.
*   It saves these reports as files, making it easy to review and analyze your backtest results.

You can subscribe to receive updates, unsubscribe when you're done, and clear out the accumulated data when needed. The service also provides methods to retrieve specific data points and generate reports for particular strategies or timeframes. You can also specify which columns to include in the reports. Finally, it can dump reports to a specified path.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of "walkers," which are essentially automated trading strategies. It builds on a private service, but automatically passes along important information like the strategy name, exchange, frame, and walker name with each request.

Think of it as a layer that simplifies how you run and track your trading strategies.

The `run` method is the main way to interact with this service. You give it a symbol (like "AAPL") and a context (walker name, exchange, frame), and it returns a sequence of results from running the walkers. This essentially kicks off the backtesting process for all your strategies against that specific symbol.

## Class WalkerLogicPrivateService

This service manages the process of running and comparing different trading strategies. Think of it as an orchestrator that handles the behind-the-scenes work of evaluating how well each strategy performs.

It systematically executes each strategy, one after the other. 

As each strategy finishes, you'll receive updates on its progress. The service also keeps track of the best-performing metric throughout the process.

Finally, you'll get a comprehensive report with all strategies ranked based on their results, allowing for a clear comparison. 

The `run` method is the core function – it’s what you use to kick off the strategy comparison for a specific trading symbol, specifying the strategies to test, the metric to optimize for, and the relevant context.  It uses other services like `BacktestLogicPublicService` to perform the actual backtesting.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with walker functionality within the backtest-kit trading framework. It’s designed to be easily integrated into your applications using dependency injection.

This service manages several key components including validation services for strategies, exchanges, frames, walkers, risks, and actions, as well as services for accessing walker schemas and strategy schemas. 

The `validate` function performs comprehensive checks on walker and strategy configurations, including multiple layers of validation to ensure data integrity.

The core function `run` allows you to execute a walker comparison for a specific trading symbol, providing context like the walker, exchange, and frame names during the process.  Essentially, it kicks off the process of running a backtest or analysis with the specified components.

## Class TimeMetaService

The TimeMetaService helps you reliably access the current candle timestamp, even when you're not actively running a strategy tick. It keeps track of the most recent timestamp for each combination of symbol, strategy, exchange, frame, and whether you’re in a backtest.

Think of it as a central record that's updated automatically whenever a strategy executes.

If you need to know the timestamp outside of the regular tick cycle – for example, when triggering a command – this service provides a way to get it.

It uses a special mechanism where it keeps a running record (like a little notebook) for each key combination. If the notebook is empty, it will wait a short time to see if a timestamp arrives before giving up. 

It's designed to be cleaned up regularly – at the beginning of each strategy run – to ensure you're always using the latest information. You can clear the entire notebook or just specific entries. The service is managed automatically, so you usually don’t have to worry about it directly. It has a helper function to check if a timestamp has already been registered, and another to retrieve it, waiting if needed.


## Class SystemUtils

The SystemUtils class helps keep your backtesting sessions clean and independent. It prevents one test from accidentally messing with another's data.

Think of it as creating temporary "sandboxes" for each backtest.

The `createSnapshot` property lets you make a copy of the current event listener state before a backtest starts.  This essentially clears the existing listeners, so the new backtest doesn't inherit any prior subscriptions.  After the backtest is finished, you can use the snapshot to restore everything back to how it was before.

## Class SyncUtils

The SyncUtils class helps you understand what’s happening with your trading signals by providing insights into signal lifecycle events. It gathers information related to when signals are opened and closed, allowing you to analyze their performance.

You can use it to get statistical summaries of your signals, like the total number of opens and closes, using the `getData` method.

Need a more detailed look?  The `getReport` method creates a markdown report listing all signal events for a specific trading strategy and symbol. This report includes key details like signal ID, action taken (open or close), position information, profit/loss, and timestamps.

Finally, the `dump` method takes that report and saves it as a file, organizing the files by symbol, strategy, and whether it's a backtest or live run.

## Class SyncReportService

The SyncReportService is designed to keep a detailed record of signal activity, specifically when a signal starts (like when a limit order is filled) and when it ends (when a position is closed). It acts as a listener, catching these "sync" events and neatly storing them in a report file, which is perfect for keeping track of trading and auditing purposes.

This service logs significant information, such as the full details of a newly started signal and the profit/loss (PNL) along with the reason for closing a signal.

To ensure everything runs smoothly, the service uses a system that prevents accidental duplicate subscriptions to the sync events. It provides a straightforward way to start monitoring these events using `subscribe`, and an equally easy way to stop monitoring them with `unsubscribe`. If you aren’t currently monitoring, unsubscribing simply does nothing.

## Class SyncMarkdownService

This service is designed to automatically create and save reports detailing signal synchronization events. It keeps track of signal openings and closings for different trading setups.

It listens for signal events and organizes them by symbol, strategy, exchange, frame, and whether it's a backtest or live run.  You can subscribe to these events to start receiving data.  To prevent duplicate subscriptions, the first subscription call returns a function to unsubscribe, and subsequent calls simply return the same function.  Unsubscribing clears all collected data.

The `tick` method processes each incoming signal event, adding a timestamp and handling close reasons. It then stores these events in specific buckets based on the trading setup.

You can retrieve statistics and a formatted markdown report for a specific trading setup using `getData` and `getReport`. The `getReport` function creates a table showing the signal lifecycle and includes summary statistics.  The `dump` method saves these reports as markdown files to disk, using a consistent naming scheme.

Finally, `clear` allows you to wipe the collected data for specific trading setups or clear everything entirely, giving you a fresh start.

## Class SweepValidationService

The SweepValidationService keeps track of all the trading strategies (sweeps) you’ve defined and makes sure they're set up correctly before they're used. Think of it as a quality control system for your strategies.

It ensures each strategy exists and that it's compatible with the exchanges it's designed to trade on. Unlike some other parts of the system, if you try to register the same strategy name twice, it won't allow it, protecting against accidental duplicates.

Here’s what you can do with this service:

*   **Add a Sweep:** When you define a new trading strategy, you register it with this service.
*   **Validate a Sweep:** Before running a strategy, you can make sure it's valid and properly configured. This prevents errors later on.
*   **List Sweeps:** You can get a list of all the strategies currently being tracked.

It uses a logger to report issues and a validation service to check exchange dependencies. The service is designed to avoid redundant checks, improving performance by caching validation results.

## Class SweepUtils

SweepUtils helps you systematically test and compare many trading strategies, or "ideas," against each other. It’s designed to profile each idea with a single simulated candle, then evaluate the performance of the entire group using a predefined set of rules. Think of it as a way to quickly screen a large number of strategies to find the most promising ones.

The framework systematically adjusts various parameters—like exit strategies and hold times—for each trading idea.  Each parameter has a specific function:

*   `hardStopPercent`: Sets a maximum loss limit.
*   `trailingTakePercent`: Adjusts the target price based on market movements.
*   `profitLockPercent`:  Sets a price floor; the trade exits when the price reverts to it.
*   `holdMinutes`:  Limits how long a trade can be held.

Importantly, every trading idea automatically triggers an entry, with no restrictions.  Each author's ideas are assessed independently – there's no consensus-based scoring.  Performance is graded based on whether the trade makes a profit before hitting the stop-loss.

The sweep configuration dictates how the results are displayed and ordered. This doesn’t affect the actual calculations.

The `run` function executes the full process, from profiling trading ideas to evaluating performance and producing a report. It handles data efficiently, filtering out irrelevant or duplicate ideas. Ideas located near the data's edge may have incomplete profiles.  The framework combines your specified grid axes with default settings to systematically test various combinations of parameters. It includes a safety floor to avoid fluke winners and ensures reliable results. Final validation of the chosen parameters requires a full backtest using a live engine.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage sweep schemas, essentially blueprints for how sweeps are executed. It holds these schemas, identified by a unique name, and performs a quick check to ensure they have the essential information.

When building sweep clients, the system looks to this service to find the necessary schema details.

Here's a breakdown of what you can do with it:

*   **Registering Schemas:** You can register a new sweep schema, associating it with a specific name. If you try to register a schema with the same name twice, the existing schema will be replaced.
*   **Overriding Schemas:**  You can partially update a registered schema, making small adjustments without replacing the entire schema. This is helpful for making minor changes.
*   **Retrieving Schemas:**  You can look up and retrieve a specific sweep schema by its name when you need its definition.

The service also includes an internal registry and validation function, but these are primarily used for internal operations.

## Class SweepGlobalService

SweepGlobalService acts as the main access point for all sweep-related operations. It's the first place your code interacts with the sweep functionality.

Think of it as a gatekeeper that first checks if the sweep you're requesting is valid and works with the exchanges involved.  Then, it passes the request along to the connection layer.

Here’s what you can do with it:

*   **`run()`**: This is the core function to kick off a full sweep simulation. You provide the symbol, sweep name, and a list of ideas (like different strategies to test). It handles the entire process from defining profiles and filtering strategies to evaluating performance and ranking results.
*   It has internal dependencies like `sweepConnectionService` and `sweepValidationService` that manage connections and validations respectively.


## Class SweepCoreService

The SweepCoreService is a central component responsible for orchestrating the sweep process. It acts as a gatekeeper, making sure the sweep details are valid and then handing off the actual work to other services. 

Think of it as the conductor of an orchestra - it ensures everything is in place before letting the performance (the sweep) begin. 

It relies on several supporting services: a logger for recording events, a connection service to manage sweep instances, and a validation service to check the sweep's integrity. 

The most important function is `run`, which takes a set of ideas and initiates a comprehensive simulation, including filtering, grid evaluation, and ranking, based on the provided symbol and sweep name.

## Class SweepConnectionService

The SweepConnectionService manages how your trading strategies interact with specific sweep configurations. Think of it as a central hub that connects your strategy to the underlying data and rules for a particular sweep.

It keeps track of these configurations, creating and reusing them to avoid unnecessary overhead. When you request a sweep, it gets or creates a specialized client for it, always using default grid settings if the configuration is missing.

You can run full simulations using the `run` method, providing a symbol, sweep name, and ideas; this method orchestrates various steps like profiling, filtering, grid evaluation, and ranking.

If you need to refresh the configurations, the `clear` method allows you to discard cached clients and force the system to reload the sweep definitions. This can be useful when you’ve made changes to the sweep schema.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central hub, allowing you to register new strategies and quickly check if they exist before you use them.

It ensures that any risk profiles and actions linked to a strategy are also valid, preventing potential issues down the line. To speed things up, it remembers the results of validations, so you don’t have to repeat them unnecessarily.

You can use it to:

*   Register new strategies using `addStrategy()`.
*   Validate a strategy’s setup using `validate()`.
*   Get a complete list of all registered strategies with `list()`.

The service relies on other validation services – `riskValidationService` and `actionValidationService` – for checking related configurations. It also uses a logger to help with troubleshooting.

## Class StrategyUtils

StrategyUtils helps you understand and analyze how your trading strategies are performing. It's a handy tool for gathering statistics and creating reports about your strategies' actions, like when they canceled orders, took profits, or set stop losses.

Think of it as a central place to view a summary of what's been happening with your strategies.

Here's what you can do with it:

*   **Get Statistics:** Easily retrieve data about events, like the number of times a strategy took a partial profit.
*   **Generate Reports:** Create detailed reports in markdown format showing all the actions taken by a strategy, including things like the price at which actions were taken and the percentages involved. You can customize which details are included in the report.
*   **Save Reports to Files:** Save those markdown reports directly to a file on your computer, making it easy to share or keep a record of your strategy's activity.  The file names include information about the symbol, strategy, exchange, and timeframe.



It pulls information from a system that keeps track of strategy events and calculates the aggregated metrics.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different strategy schemas in a safe and organized way. It uses a registry to store these schemas, ensuring type safety. 

You can add new strategy schemas using the `addStrategy()` method (represented by `register`). 

If you need to check if a schema is set up correctly before adding it, `validateShallow` does a quick check of the important properties.

To update an existing schema, the `override` method allows you to provide only the parts that need changing.

Finally, `get` is how you find a specific strategy schema by its name when you need to use it. 

The service also includes internal components to handle logging and manage the underlying schema storage.


## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions by writing each event directly to JSON files. Think of it as a permanent record of what your strategy is doing.

To start using it, you need to "subscribe" – this tells the service to begin logging events. Then, you use specific methods like `cancelScheduled`, `closePending`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, and `breakeven` to record various trading actions.  Each of these methods captures details like the symbol traded, profit/loss information, and context surrounding the action.

Importantly, unlike some other reporting methods that accumulate events in memory, this service writes each event immediately to disk, making it ideal for maintaining a reliable record. When you're finished, remember to "unsubscribe" to stop the logging.


## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing and create detailed reports about them. It's designed to be more efficient than constantly writing data to disk, instead accumulating events in memory before generating reports.

Think of it as a central hub for logging and analyzing your strategy’s actions. It collects events like signal cancellations, pending order closures, and partial profit/loss executions.

To get started, you need to "subscribe" to the service to start collecting events. You can then use methods like `getData()` to get statistics and `getReport()` to generate formatted markdown reports. You can even save those reports as files.  When you're done, "unsubscribe" to stop collecting data and clear everything out.

The service intelligently manages storage for these events, creating specialized "ReportStorage" instances for each unique combination of symbol, strategy, exchange, and timeframe to optimize performance. You can also selectively clear out event data if you need to.

## Class StrategyCoreService

This class, `StrategyCoreService`, manages operations related to strategies within the backtesting or live trading framework. It acts as a central hub, injecting relevant context (like the trading symbol, time, and backtest parameters) into various services.

It handles validations, retrieves signals and position details, and provides methods for managing strategies, like pausing, stopping, or closing positions. It relies on other services for tasks like connection management, schema validation, and risk/exchange/frame validations.

Here’s a breakdown of what it offers:

*   **Signal Management:** It can fetch pending and scheduled signals, as well as details about those signals such as open price, cost, and P&L. It also enables creating signals.
*   **Position Details:** Provides information about the current position, including total closed percentage, cost basis, entry prices (including DCA entries), and partial close history.
*   **Strategy Control:** Offers ways to pause, stop, and cancel signals, and to adjust trailing stops or take profit levels.
*   **Validation and Safety Checks:** Includes functions to validate strategies, check break-even, and assess if partial operations (profit or loss) are feasible.
*   **Backtest and Tick Operations:**  It's the core for running backtests and processing individual ticks, ensuring the right context is passed around.
*   **Performance Metrics:** Provides methods to calculate PnL, position duration, maximum drawdowns and other key performance indicators.
*   **Cache Management**: Includes the ability to clear cached strategy instances.



Essentially, it's a mediator, standardizing how strategies are handled and ensuring they operate with the correct context.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for strategy operations within the backtest-kit trading framework. It automatically directs calls to the correct trading strategy based on the symbol and strategy name used. It also efficiently caches frequently used strategy instances to improve performance.

Here's a breakdown of what it does:

*   **Routing:** Connects strategy calls (like placing orders or getting data) to the specific strategy that's configured for a particular symbol.
*   **Caching:**  Keeps a memory of previously used strategies to avoid unnecessary creation and loading, speeding up the whole process.
*   **Initialization:** Ensures all strategies are properly set up before they are used.
*   **Supports both live trading (tick) and historical analysis (backtest) modes.**

The service provides various methods for retrieving information about strategies and positions, including:

*   **Retrieving signals:** Getting information about pending and scheduled signals.
*   **Checking positions:**  Getting details such as open positions, costs, percentages, and entry prices.
*   **Managing states:**  Checking and modifying the paused or stopped status of strategies.
*   **Monitoring and controlling positions:** Methods exist to manually trigger actions like partial closes, trailing stops, or average buy orders.

The `StrategyConnectionService` is designed to simplify complex interactions with multiple strategies, making it easier to manage and test trading systems. It also provides a clear interface for monitoring a strategy’s state and intervening when needed.

## Class StorageLiveAdapter

This component provides a flexible way to manage how your trading signals are stored. It acts as a bridge, letting you easily swap out different storage methods without changing the core logic of your backtesting framework.

The default storage method saves signals persistently to disk, but you can also choose to store signals in memory (useful for quick tests) or use a dummy adapter that doesn't store anything at all.

The `getInstance` property cleverly caches the storage utility the first time it's used, so subsequent operations are faster.  You can force it to rebuild the utility by calling `clear()`, which is essential if your working directory changes during backtesting.

The framework offers specific functions like `handleOpened`, `handleClosed`, `findById`, and `list` that pass through to your chosen storage method, allowing you to interact with signals regardless of how they are stored.  `handleActivePing` and `handleSchedulePing` keep the "updated" timestamp of signals in sync with active ping events.

You can quickly switch between storage options using methods like `useDummy`, `usePersist`, `useMemory`, or customize the storage by providing your own adapter with `useStorageAdapter`.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how backtest data is stored. It acts as a bridge between the backtest kit and different storage solutions, allowing you to easily switch between them. By default, data is stored in memory, but you can switch to persistent storage (saving to disk) or a dummy adapter for testing purposes. 

The system uses a factory pattern to create the storage utilities, ensuring that the correct implementation is used. The `getInstance` property is a shortcut to getting the currently active storage utilities, and the `clear` method is important to call when the working directory changes. Several methods, like `findById` and `list`, provide access to the stored signals, which are then handled by corresponding `handle...` methods like `handleOpened` and `handleClosed`. The `useStorageAdapter`, `useDummy`, `usePersist`, and `useMemory` functions allow you to quickly change the storage mechanism being used.

## Class StorageAdapter

The StorageAdapter is the central component for handling and organizing your trading signals, whether they're from backtesting or live trading. It automatically keeps track of signals as they come in, and it offers a consistent way to access them all.

You can easily turn signal storage on to start collecting data, and it's designed to only subscribe to signal sources once to avoid unnecessary activity. If you need to stop tracking signals, you can disable the adapter, and it's completely safe to do this multiple times.

Need to retrieve a specific signal? The `findSignalById` method lets you locate signals by their unique ID. 

You can also generate lists of backtest signals and live signals separately to analyze them.

## Class StateLiveAdapter

The StateLiveAdapter helps manage and store the state of your trading strategies, particularly useful for advanced techniques like those driven by Large Language Models (LLMs). Think of it as a way to keep track of important details like how much a trade has gained or lost, and how long it's been open – information crucial for making decisions.

It’s designed to be flexible, allowing you to easily swap out different storage methods.  The default is to store data on your computer's file system, ensuring that your progress isn’t lost even if the program restarts. You can also choose to use an in-memory store (lost on restart) or a dummy store (doesn't save anything).

This adapter is key for things like "capitulation rules," which automatically exit trades that aren't performing as expected, even if they’ve been profitable for a while.  The adapter remembers key metrics for each trade, like its peak gain and how long it’s been open, so these rules can be applied consistently.

The `disposeSignal` method cleans up old data when a trading signal is finished, freeing up resources. `getState` and `setState` are how you read and update the trade's data, respectively. 

The `useLocal`, `usePersist`, `useDummy`, and `useStateAdapter` methods let you change the storage method quickly. Finally, `clear` helps ensure that your data stays fresh if the base directory of your project changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` is a flexible component that manages the state of your backtesting simulations. It allows you to easily swap out different storage methods – like using memory, files on disk, or even a dummy adapter that simply ignores changes – without altering the core logic of your backtest.

Think of it as a central hub for tracking data related to each trading signal, like its highest peak and how long it’s been open. This is particularly useful for implementing advanced rules, such as automatically closing positions if they haven’t performed as expected.

Several convenient functions make it simple to change the storage backend: `useLocal` for in-memory storage, `usePersist` to save data to files, and `useDummy` for testing. You can also use `useStateAdapter` to plug in your own custom state management solutions.

The `disposeSignal` function clears out old data when a signal is finished, and `clear` is helpful when the base path changes, ensuring fresh instances are created. These methods offer a robust and adaptable way to handle state within your backtesting framework.

## Class StateAdapter

The StateAdapter is like a central manager for storing and accessing data during a backtest or a live trading session. It keeps track of different data states and makes sure things are cleaned up properly when signals are finished.

You use it to turn on ("enable") the data storage, which connects it to the signal lifecycle, ensuring that old data doesn't hang around. It’s designed so you only subscribe to those lifecycle events once to avoid problems.

Turning off ("disable") the data storage disconnects it from the signal lifecycle, which is perfectly safe to do repeatedly.

To get the current state of a signal, you call `getState`, providing details like the signal ID, bucket name, initial value, and whether it's a backtest or live data. This will fetch the relevant data from either the backtest or live storage.

Updating the state of a signal is done with `setState`, also requiring the signal details, and routes the update to the correct storage based on the backtest status.

## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies. It's designed to make sure you're using valid sizing methods before you trade. 

You can register new sizing strategies using `addSizing`, providing a name and configuration details. 

`validate` is your tool for double-checking that a sizing strategy exists and, optionally, that its method is correct. 

To see a complete list of your registered sizing strategies, use `list`. The service also uses caching to make these checks faster.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies for your trading system. It uses a safe and organized way to store these strategies, ensuring they're consistent and reliable. 

Think of it as a central place to define and manage how much of an asset you’ll trade in each situation.

You can add new sizing strategies using `addSizing`, and retrieve them later by their name using `get`. If a sizing strategy already exists, you can update parts of it using `override`. 

Before a sizing strategy is added, the service performs a quick check to make sure its structure is correct, using a process called `validateShallow`. This helps prevent errors down the line. The service also has a logger for keeping track of what’s happening.

## Class SizingGlobalService

This service helps determine how much of an asset to trade, based on your risk tolerance and trading strategy. 

It acts as a central point for calculating position sizes, using a connection service to retrieve the necessary data and a validation service to ensure everything is correct. Think of it as the engine that figures out the right amount to buy or sell. 

It's used both behind the scenes by the trading system and also available for use when building your own custom strategies.

Here's a breakdown of its components:

*   It relies on a logger to record activity.
*   It uses a sizing connection to access data needed for calculations.
*   It incorporates validation to confirm calculated sizes are reasonable.

The core function, `calculate`, takes parameters representing your sizing rules and a context object.  It then returns a number, which is the recommended position size.

## Class SizingConnectionService

This service manages how position sizes are determined within the backtesting framework. It acts as a central point for sizing calculations, directing requests to the correct sizing implementation based on a provided name. 

To improve performance, it remembers previously used sizing implementations, so they don't need to be recreated repeatedly.

When configuring strategies without sizing, an empty string is used for the sizing name.

The `getSizing` method is how you retrieve the appropriate sizing implementation; it creates one if it doesn't already exist.

The `calculate` method is used to actually perform the size calculation, using risk parameters and a specified sizing method. It routes the request to the appropriate sizing implementation.

## Class SessionLiveAdapter

This component provides a flexible way to manage and store session data for live trading. It acts as a bridge, allowing you to easily swap out different storage mechanisms without changing the core trading logic. By default, it uses a file-system based storage that keeps data safe even if the system restarts.

You have several options for storing data: you can use in-memory storage for quick, temporary data, a dummy storage that discards all data, or you can even provide your own custom storage implementation. It automatically keeps track of different combinations of symbols, strategies, exchanges, and frames to ensure you're always accessing the correct data.

It also gives you methods to quickly change the storage adapter: `useLocal`, `usePersist`, `useDummy`, and `useSessionAdapter`. If the working directory changes during a strategy run, be sure to clear the cached instances with `clear` to ensure new storage instances are created with the correct path.  It lets you retrieve data using `getData` and update it using `setData` for the current trading session.

## Class SessionBacktestAdapter

The SessionBacktestAdapter helps manage session data during backtesting, offering flexibility with how that data is stored. It acts as an intermediary, allowing you to easily swap out different storage solutions without altering the core backtesting logic.

By default, data is kept in memory (SessionLocalInstance), which is the simplest option. However, you can switch to a file-based adapter (SessionPersistInstance) to save data to disk or a dummy adapter (SessionDummyInstance) that discards data for testing purposes.

You can also create your own custom storage solutions and plug them in.

The adapter remembers recent session data for specific symbols, strategies, exchanges, and frames to speed things up.

Convenience functions are provided to quickly switch between storage methods: `useLocal`, `usePersist`, and `useDummy`. There's also `useSessionAdapter` for custom implementations.

If you change the working directory during your backtesting process (e.g., when running different strategies), you should call `clear` to refresh the cached adapters.

To get data from a session, use `getData`, and to update data, use `setData`.

## Class SessionAdapter

The SessionAdapter acts as a central point for storing and retrieving data during both backtesting and live trading. It intelligently directs data operations to either the backtest storage (SessionBacktest) or the live trading storage (SessionLive) depending on whether you're running a backtest or not. 

You can use `getData` to fetch existing data, specifying the symbol, context (strategy, exchange, frame), whether it's a backtest, and the timestamp. Similarly, `setData` allows you to update session values, directing the update to the appropriate storage based on the backtest flag. It handles the logic of deciding where your data goes, simplifying data management across different operational modes.


## Class ScheduleUtils

The ScheduleUtils class helps you monitor and understand the performance of your scheduled signals. It's like a central hub for tracking signals that are waiting to be executed. 

It keeps tabs on signals in a queue, signals that were canceled, and calculates things like how often cancellations happen and how long signals typically wait. 

You can easily retrieve data about a specific signal's history or generate reports in markdown format, which is great for visualizing performance trends. It's designed to be readily accessible, offering a simple way to understand what's happening with your scheduled trading signals and their execution. You can also save reports directly to a file.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing by recording their lifecycle events. It listens for signals and records when they are scheduled, when they transition to an "open" state, and when they are cancelled. This service calculates how long it takes between when a signal is initially scheduled and when it’s actually executed or cancelled, providing insight into potential delays. 

You can think of it as a data recorder for your signals, storing information in a database so you can analyze the timing of your trading decisions.

To get it working, you need to subscribe it to your signal emitter. The subscribe function ensures you only listen once and gives you a way to stop listening when you no longer need to track the signals. Similarly, the unsubscribe function cleanly stops the tracking process. 


## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your automated trading signals and create easy-to-read reports. It listens for signals – when they're scheduled, and when they're cancelled – and organizes them by your trading strategy.

It automatically generates markdown tables summarizing these events, including helpful statistics like cancellation rates and average wait times. These reports are saved as files, making it simple to review your strategy's performance and identify any potential issues.

You can subscribe to receive these signal events, unsubscribe when you no longer need them, and clear out the accumulated data when you want a fresh start. There are methods to retrieve statistics, reports, and even dump the reports directly to files. The service uses isolated storage for each combination of symbol, strategy, exchange, frame, and backtest, ensuring data isn’t mixed up.

## Class RiskValidationService

This service helps you keep track of and ensure the accuracy of your risk management settings. It acts like a central organizer for your risk profiles, making sure they're properly registered before they’re used.

Think of it as a system that remembers all your risk profiles and checks to see if they're still valid.  It's also designed to be efficient, remembering previous validation results so it doesn’t have to repeat checks unnecessarily.

Here's what you can do with it:

*   **Register New Profiles:** You can add new risk profiles to the system, so it knows about them.
*   **Verify Profiles:** It lets you check if a specific risk profile is registered and valid.
*   **See a List:** You can get a complete list of all registered risk profiles. 
*   **Configuration:** It uses a service to manage logging. 


## Class RiskUtils

RiskUtils helps you understand and analyze risk rejection events, providing insights into potential issues in your trading strategies. It acts as a central point to access data and generate reports about these rejections.

This utility collects information about rejected trades—like when they happened, what symbol was involved, the strategy used, and why they were rejected.  It gathers this data from a system that listens for rejection events and stores them for later analysis.

You can use RiskUtils to:

*   Get statistics summarizing the rejections, including counts and breakdowns by symbol or strategy.
*   Create detailed markdown reports displaying each rejection event in a table format, including the timestamp, symbol, strategy, position, exchange, price, the number of active positions, and the reason for the rejection.
*   Save those reports directly to files for easy sharing and review.

The data is organized by symbol, strategy name, exchange name, and frame name, enabling you to pinpoint areas needing attention. Events are stored temporarily—a maximum of 250 rejections are kept for each combination of symbol and strategy.

## Class RiskSchemaService

This service helps you keep track of and manage your risk schemas, acting as a central place to store and retrieve them. It leverages a special storage system for type safety.

You add risk profiles using `addRisk()`, and later you can find them again by their names.

The service performs a quick check (`validateShallow`) to make sure the schemas you're adding have the necessary elements and are structured correctly before they're saved.

You can also update existing risk schemas with `override()`, providing only the parts you want to change.

Finally, `get()` lets you easily retrieve a specific risk schema based on its name.


## Class RiskReportService

The RiskReportService helps you keep track of when trading signals are rejected by your risk management system. It acts like a record-keeper, capturing details like why a signal was rejected and what it looked like.

You'll use it to listen for these "risk rejection" events and store them, allowing you to later analyze the patterns and audit your risk decisions.

To get started, you subscribe to the risk rejection events, and it provides a way to stop listening later. 
The service also has a built-in mechanism to prevent accidentally subscribing multiple times. 

It relies on a logger for debugging and stores rejected signals with reasons and pending signal details.


## Class RiskMarkdownService

The RiskMarkdownService helps you automatically generate reports about rejected trades, providing valuable insights into potential issues with your trading strategies. It listens for events indicating rejected trades, keeping track of these rejections for each symbol and strategy you're using. 

The service then takes this information and builds nicely formatted markdown tables – perfect for reviewing and sharing – and provides summary statistics like the total number of rejections. These reports are saved to disk, making it easy to keep a record of your risk rejections over time.

You can subscribe to the service to receive these rejection events, and unsubscribe when you no longer need them. There are functions available to retrieve the accumulated data, generate the markdown reports, save them to disk, and clear the stored data when it’s no longer needed. The service ensures that each symbol-strategy combination has its own isolated storage for organized reporting.

## Class RiskGlobalService

RiskGlobalService manages and enforces risk limits during trading. It acts as a central hub for risk-related operations, working alongside other services like RiskConnectionService to ensure trades stay within defined boundaries.

This service keeps track of signals and validates configurations, avoiding repetitive checks by remembering previous validations. 

Here's a breakdown of its key features:

*   **Signal Validation:**  `checkSignal` determines if a trade is permitted based on pre-set risk limits. `checkSignalAndReserve` is a special, safer version that prevents conflicts when multiple trades are attempted simultaneously.
*   **Signal Management:** `addSignal` records when a trade is initiated, and `removeSignal` cleans up records when a trade closes.
*   **Data Clearing:** `clear` allows for resetting risk data, either for a specific instance or a complete reset of all risk information.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It intelligently directs risk-related operations to the correct specialized risk handling component. 

Think of it as a router – you tell it which "type" of risk you're dealing with (using the `riskName`), and it sends the request to the appropriate handler. To speed things up, it remembers which risk handlers it’s already used, so it doesn’t have to recreate them every time.

The `getRisk` function is how it finds the correct risk handler. It builds a key from the risk name, exchange, frame, and backtest settings to ensure risk is managed appropriately for each specific context.

The `checkSignal` function is used to determine if a trade should be allowed based on predefined risk limits like portfolio drawdown or position size. It employs different checks based on the risk profile configured. A similar `checkSignalAndReserve` method does this and ensures concurrency safety when dealing with multiple simultaneous trades.

When a trade is allowed, `addSignal` registers it within the risk management system.  Conversely, `removeSignal` removes a trade when it's closed.  Finally, `clear` can be used to invalidate and recreate a cached risk handler if needed. 

The service also has built-in dependencies for logging, schema management, timekeeping, and core actions, all handled through an injection system.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage how your backtest data and events are stored, giving you flexibility and efficiency. Think of it as a central hub for directing data to different storage locations, like files. It automatically creates storage instances for different types of reports (like backtest results, live trading data, or walker data), ensuring only one storage instance exists for each type throughout your application. 

You can easily swap out the storage method – for example, switching from storing data in JSONL files to a different format – by using `useReportAdapter`. The adapter also remembers which storage instances it's created, so it doesn’t create new ones unnecessarily.

When you need to write data, just pass it to `writeData` along with the report type, and the adapter takes care of the rest. If it's the first time writing for that report type, it’ll automatically set up the storage. If you need to discard all data (perhaps for testing or debugging), `useDummy` provides a convenient way to do that.  And if you want to revert to the standard JSONL format, `useJsonl` gets you back to the default behavior. If your base directory changes, `clear` can be used to clear the stored storage instances.

## Class ReportUtils

ReportUtils helps manage how different parts of the backtest-kit framework – like backtests, live trading, and performance analysis – record data. 

It lets you turn on or off logging for specific areas, writing event details to JSONL files for later analysis. This is useful for tracking what's happening in your trading experiments.

The `enable` function lets you subscribe to report services to start real-time logging, and it's crucial to remember to unsubscribe later to avoid problems. 

The `disable` function stops logging for specific areas without needing a separate unsubscribe step.


## Class ReportBase

The `ReportBase` class helps you easily log and analyze trading data by writing events to JSONL files. Think of it as a structured way to record what's happening during your backtests, designed for later examination. It automatically organizes these files into directories, handles potential writing errors, and allows you to filter your data later based on criteria like the trading symbol, strategy used, exchange, time frame, or signal ID.

The class uses a special JSONL format, meaning each line in the file represents a single event. It’s built to handle large amounts of data efficiently, with safeguards to prevent slow writing or timeouts. The `waitForInit` method ensures the file setup happens only once, while the `write` method provides a simple way to add new event data to the log, automatically including relevant metadata. You can rely on this adapter to manage the details of writing your reports and metadata, letting you focus on the trading logic.

## Class ReportAdapter

This component provides a flexible way to manage and store your backtest results and analytics data. It uses an adapter pattern, allowing you to easily swap out different storage methods without changing your core backtest logic. 

Think of it like this: you can switch between storing data in a simple JSONL file, sending it to a database, or even just discarding it for testing purposes.

The system remembers which storage method you’ve chosen and creates optimized instances for each report type, ensuring efficiency. This storage is initialized only when you first write data.

You can easily change the default storage adapter, clear the existing storage, or switch to a dummy adapter for testing. If your working directory shifts between backtest runs, clearing the cache ensures fresh storage instances are created. This framework is designed for efficient, structured logging and data analysis within your backtesting environment.


## Class ReflectUtils

This class provides tools for observing a trading position's performance in real-time, whether it's a live trade or a backtest. Think of it as a dashboard for key metrics like profit and loss, peak profit levels, and drawdowns.

It's designed to simplify how you access and track these metrics, handling the underlying complexities of calculating things like partial closes and slippage.  It’s a singleton, meaning you always use the same instance for access.

Here's a breakdown of what it offers:

*   **Profit & Loss (PNL):** You can get the current unrealized PNL as a percentage or in dollar terms.
*   **Peak Performance:** It tracks the highest profit price achieved and the time it happened, along with the PNL at that point.
*   **Drawdown Analysis:** It measures how far a position has fallen from its peak, providing metrics like the time elapsed since the highest profit or worst loss.
*   **Position Duration:** It calculates how long a position has been active and how long a signal has been waiting to be triggered.
*   **Distance from Peaks/Troughs:**  You can determine the current distance from the highest profit or deepest drawdown in both percentage and cost terms.

Each of these functions takes a symbol (the trading pair), a context (including strategy, exchange and frame names), and an optional `backtest` flag to indicate if the data is from a backtest. They return `null` if there’s no active position or signal to analyze.

## Class RecentLiveAdapter

RecentLiveAdapter helps manage and access recent trading signals, offering flexibility in how those signals are stored. It acts as a middleman, allowing you to easily switch between different storage methods without changing your core logic.

You can choose to store signals persistently on disk, or keep them only in memory for faster access. This is done through simple commands like `usePersist()` and `useMemory()`.

The adapter intelligently caches the storage utilities to avoid unnecessary rebuilding, but you can clear this cache with `clear()` when needed, particularly when your working directory changes. Methods like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` pass requests to the currently selected storage mechanism.

## Class RecentBacktestAdapter

This component manages how recent trading signals are stored and retrieved. It uses a flexible design, allowing you to easily switch between storing signals in memory or on disk. By default, signals are stored in memory, but you can switch to persistent storage for long-term data retention.

The system uses a factory to create the actual storage mechanism, and it cleverly caches the result to avoid repeated creation. This cached instance can be cleared when needed, such as when the working directory changes, to ensure the system uses the correct storage path.

It provides convenient methods to easily change the storage backend – `usePersist` for disk storage and `useMemory` for in-memory storage – and a way to define your own custom storage adapters. You can get the most recent signal, find out how long ago a signal was created, and react to active ping events through a consistent interface.

## Class RecentAdapter

The RecentAdapter manages how recent trading signals are stored and accessed, working for both backtesting and live trading environments. It automatically updates the signal storage by listening for incoming data.

You can enable or disable this storage functionality; enabling it sets up the signal updates, while disabling it cleanly removes those updates.  It’s designed to ensure the subscription only happens once.

The `getLatestSignal` function allows you to retrieve the most recent signal for a particular asset and trading setup, first checking your backtest data and then live data.  It prevents looking into the future by only returning signals that occurred before a specified time.

Finally, `getMinutesSinceLatestSignalCreated` tells you how long ago the latest signal was generated, also considering the time specified and applying a look-ahead safety measure.

## Class PriceMetaService

PriceMetaService helps track the most recent market prices for specific trading setups. It essentially remembers prices for each combination of symbol, strategy, exchange, frame, and whether it's a backtest. This service keeps a running record of these prices, updating them whenever a new tick comes in from the strategy.

You can use this to get the current price even when you're not actively executing trades—like when running a process or handling a command.

If a price hasn’t been received yet, it will wait a short time (up to LISTEN_TIMEOUT milliseconds) for the information to arrive. 

It's designed to be a central place to find the right price, and it’s automatically cleared at the start of a trading session to ensure the data is fresh. You can clear individual price records or clear them all at once to release memory and avoid using old data. The system falls back to a live average price from another service when running during an active trade execution.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade, based on different strategies. 

It provides pre-built calculations for common position sizing methods like:
*   **Fixed Percentage:** Calculates position size based on a fixed percentage of your account balance at risk.
*   **Kelly Criterion:** Determines position size based on win rate and win/loss ratio to maximize long-term growth.
*   **ATR-based:** Uses the Average True Range (ATR) to calculate position size, incorporating volatility.

Each calculation method validates that the input data is compatible with the sizing method selected. These are all static methods, meaning you don't need to create an instance of the class to use them.

## Class Position

The `Position` class provides helpful tools for figuring out where to set your take profit and stop loss prices when trading. It simplifies things by automatically adjusting the levels depending on whether you're going long (buying) or short (selling).

It offers two main functions:

*   **moonbag:** This calculates your stop loss and take profit using a simple strategy - setting take profit at 50% above your entry price and your stop loss based on a percentage you define.
*   **bracket:**  This method lets you define your own take profit and stop loss percentages, providing more control over your risk management.

Essentially, these functions take information about your position (long or short), the current price, and your desired stop loss percentage, and then calculate the actual take profit and stop loss price levels for you.

## Class PersistStrategyUtils

This class helps manage how strategy data is saved and loaded, ensuring that information like order queues and user actions are handled reliably. It creates a unique storage space for each strategy based on its symbol, name, and exchange. 

The class uses a clever system to only create these storage spaces when needed, and allows you to plug in different ways of storing the data, like using files, JSON, or even a dummy system for testing.

You can control how this data persistence happens by swapping out the way strategy instances are created, or by completely clearing the stored data. If your working directory changes, you'll want to clear the data to avoid potential issues. There's also a handy option to switch to a simple “dummy” mode where nothing is actually saved, great for testing purposes.

## Class PersistStrategyInstance

This class, `PersistStrategyInstance`, is designed to reliably save and load the state of your trading strategy. It acts as a safe keeper for your strategy's data, ensuring it's protected even if something unexpected happens during operation.

It handles the persistence automatically, using a specific file and a consistent name ("strategy") to identify the strategy data. The class is built on top of another component, `PersistBase`, to guarantee that writes are completed safely, preventing data corruption.

Here's a breakdown of how it works:

*   **Initialization:** The `waitForInit` method sets up the necessary storage space.
*   **Saving:**  The `writeStrategyData` method is used to save your strategy's current state. If you want to clear the saved data, you pass it `null`.
*   **Loading:**  The `readStrategyData` method retrieves the saved strategy state, returning the data or `null` if nothing is stored.

The class also stores essential details like the trading symbol, strategy name, and exchange name to keep everything organized. It uses a pre-defined key (`STORAGE_KEY`) for saving data ensuring a predictable location for data persistence.


## Class PersistStorageUtils

This class provides tools for saving and loading signal data, especially useful when running backtests or live trading strategies. It cleverly manages storage instances, so you don't have to worry about creating them yourself.

You can even customize how the data is stored by providing your own storage adapter. This adapter is responsible for actually saving the signal data to disk or wherever you want.

The system keeps track of signals as individual files, each identified by a unique ID, ensuring data integrity. 

It's designed to be resilient to unexpected crashes, helping prevent data loss.

Here's a breakdown of what you can do:

*   **`getStorage`**: Provides a way to get a storage instance for either backtesting or live trading mode. It handles creating these instances automatically.
*   **`readStorageData`**:  Allows you to load all the saved signals for a specific mode. This only happens when you first need the data.
*   **`writeStorageData`**: Enables saving signals for a specific mode, again initializing the storage instance if it's the first time.
*   **`usePersistStorageAdapter`**: Lets you plug in your own custom way to store the data.
*   **`clear`**:  Resets the storage system when things change, for example, if your working directory changes.
*   **`useJson`**: Uses a standard file-based storage system.
*   **`useDummy`**:  Uses a storage system that doesn’t actually save anything (useful for testing).

## Class PersistStorageInstance

This class handles storing and retrieving your trading signals persistently, primarily by using files. It's designed to be a straightforward way to keep your signals safe, even if there are unexpected interruptions.

Each signal is saved as its own JSON file, making it easy to manage and access individual signals. When you need to read all signals, it scans through all the files. 

The `backtest` property indicates whether this is being used in a backtesting scenario. 

The `waitForInit` method prepares the storage to be ready for use.  `readStorageData` fetches all the saved signals, and `writeStorageData` saves a set of signals to persistent storage. It uses a technique called atomic writes to help protect against data loss if things go wrong during the saving process.


## Class PersistStateUtils

This class helps manage how your trading state is saved and loaded, ensuring that your backtests can recover from unexpected interruptions. It keeps track of state information, like the parameters of your trading strategy, and stores it in files.

It uses a clever system to create these storage instances, ensuring that each unique combination of signal ID and bucket name has its own dedicated storage.

You can customize how the state is persisted—either using the default file-based storage or plugging in your own custom adapters. This allows flexibility in choosing how your data is stored.

The class provides functions to read and write this state data, and it automatically creates storage if it doesn't already exist.  A handy `clear` function helps tidy up when you change working directories during testing.  The `dispose` method is useful for cleaning up resources after a signal is no longer needed.

You have control over the type of instance being used for persistence, being able to switch between a dummy version (for testing without actually saving data) and a regular one or define a custom one.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a straightforward way to save and load trading state information to files. It's designed to be a reliable, default method for persisting data, essentially acting as a wrapper around a file-based storage system. 

Think of it as a container that holds your data and ensures that changes are written safely. The `signalId` and `bucketName` identify specifically *what* data you’re saving and where.

The `waitForInit` method gets things set up initially, while `readStateData` retrieves previously saved information and `writeStateData` saves the current state.  When you’re done, the `dispose` method is intentionally simple, handling cleanup through other mechanisms to keep things organized. It ensures that any cached data is cleared properly.

## Class PersistSignalUtils

This class helps manage how signal data is saved and loaded for your trading strategies. It ensures each strategy has its own dedicated storage area, preventing conflicts. You can customize how this storage works by providing your own "signal instance" creator, or use built-in options like file-based storage or a dummy option for testing.

The system automatically handles reading and writing signal data, making sure it's done safely and reliably, even if there are unexpected interruptions. 

Think of it as a helper to keep your strategies' signal states consistent and secure over time.

Here's a bit more detail about what it offers:

*   **Customizable Storage:** You can tell it how to actually save and load data using different constructors.
*   **Automatic Management:** It takes care of creating the storage needed and handles the reading and writing of data.
*   **Safe Operations:** It ensures data is saved and retrieved in a reliable way.
*   **Cache Clearing:** You can manually clear the storage cache when needed, like when your working directory changes.
*   **Testing Convenience:** A dummy implementation lets you test your strategies without actually persisting anything.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, provides a way to reliably store and retrieve signal data for a specific trading strategy on a particular exchange. It acts as a safety net, using file-based storage to ensure that your signal data isn't lost, even if something goes wrong.

Think of it as a dedicated container for signal information, identified by the symbol being traded, the name of the strategy, and the exchange it’s operating on. It handles the messy details of saving data to a file and making sure that process happens completely, so you don't have to worry about corrupted data. 

Internally, it uses a mechanism to make sure the initial storage is ready and handles reading and writing signal data, essentially managing the persistence of your signals. The class's properties hold the identifying information for the signals being managed, and the internal storage is taken care of automatically.


## Class PersistSessionUtils

This class provides a way to safely store and retrieve session data, ensuring that your trading strategies can reliably pick up where they left off even if something goes wrong. It cleverly caches these storage instances, meaning it doesn’t have to re-create them unnecessarily.

The system organizes data in files within a specific directory structure, making it easy to find and manage. It also allows you to customize how the data is stored, letting you choose between different adapters like a simple JSON file system, or a dummy adapter for testing.

You can trigger initialization of the storage to prevent setup during early stages and the class handles reading and writing this data to ensure data integrity. There are also methods to clear the cached instances or clean up specific sessions when they’re no longer needed, which is useful if you change working directories. Finally, you can easily switch between different storage adapters to suit your testing or production needs.

## Class PersistSessionInstance

This class provides a way to save and load session data for your trading strategies, particularly useful when you want your progress to be remembered across restarts. It handles the technical details of file storage, ensuring that data related to a specific strategy, exchange, and timeframe is kept separate and organized.

Think of it as a persistent memory for your trading system – it remembers things like your strategy's state even if the program closes.

Here's a breakdown:

*   **What it does:** It saves information about your strategy’s settings, progress, and state to a file.
*   **How it organizes things:**  It uses a combination of the strategy name, exchange, timeframe, and the trading symbol to create unique identifiers for your data. This prevents different strategies from interfering with each other's saved information.
*   **Important Note:**  The `dispose` function doesn't actually *do* anything itself; instead, you need to rely on a separate utility function (`PersistSessionUtils.dispose()`) to clean up related caches.
*   **Initialization:** The `waitForInit` method ensures that the storage is ready before you start saving or loading data.
*   **Reading and Writing:** The `readSessionData` method retrieves saved data, and the `writeSessionData` method saves new or updated data.



The `_storage` property holds the underlying file storage mechanism. The `_entityId` combines the symbol and backtest flag, ensuring data isolation between strategies and backtests.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how scheduled trading signals are saved and loaded, especially for strategies running in live mode. It ensures that each strategy has its own way of storing these signals, allowing for flexibility and customization.

The system is designed to be reliable, handling situations where the process might unexpectedly stop and start. It creates these storage instances on-demand, only initializing them when they’re needed for the first time.

You can easily swap out the default storage mechanism for something custom, like using a different file format or a database. If you need to change this default, functions are provided to switch between different storage types, including a file-based option and a dummy option that doesn't actually save anything.

Sometimes, it's necessary to flush the system’s memory and force it to re-initialize the storage, and a `clear` function handles this.

## Class PersistScheduleInstance

This class helps manage and save scheduled trading signals to a file, ensuring data isn't lost even if something goes wrong. It's designed to work with a specific trading symbol, strategy name, and exchange. 

Essentially, it keeps track of your planned trading actions, written to a file in a safe way.

Here's a breakdown of what it does:

*   It stores information like the trading symbol, strategy, and exchange.
*   `waitForInit` gets the underlying storage ready to use.
*   `readScheduleData` retrieves a previously saved scheduled signal, identifying it using the symbol.
*   `writeScheduleData` saves a scheduled signal (or removes it if you provide null) to the file, again using the symbol to identify the signal. 


## Class PersistRiskUtils

This class helps manage how your trading positions are saved and loaded, particularly when dealing with risk management. It's designed to keep track of your active positions in a reliable way. 

It uses a clever system to create and reuse storage instances based on your risk profile, meaning it avoids creating unnecessary ones. You can even customize how these positions are stored – for example, you might use a file, a database, or even just a dummy version for testing.

The `readPositionData` method lets you retrieve previously saved position data, while `writePositionData` stores the current positions.  The first time you call either of these, it sets up the necessary storage. 

If you want to change how positions are persisted, you can register a custom storage constructor with `usePersistRiskAdapter`. The `clear` method allows you to flush the stored data when needed, for example when your working directory changes. You can easily switch to the default file-based storage using `useJson` or disable persistence entirely with `useDummy`.

## Class PersistRiskInstance

This class provides a way to reliably save and load trading positions to a file. It’s designed to be crash-safe, ensuring your data isn't lost even if something unexpected happens. 

It essentially wraps a more basic file storage system to make sure updates are written safely. It uses a specific name, "positions", to identify where the data is stored.

The constructor lets you set the name of the risk and exchange being tracked. 

The `waitForInit` method makes sure the storage is ready before you try to read or write data. 

`readPositionData` retrieves the saved positions data, looking at a specific time.  `writePositionData` saves a new set of positions data.

## Class PersistRecentUtils

This class helps manage how recent signals are stored, ensuring that information about the last signals received is preserved. It’s primarily used internally by other tools for backtesting and live trading.

The class intelligently creates storage instances based on the specific symbol, trading strategy, exchange, and timeframe you're using. This prevents conflicts when multiple strategies are running.

You can customize how these recent signals are stored by providing your own storage adapter. The system automatically handles reading and writing data, and includes safety measures to prevent data loss even if things go wrong.

The class maintains a cache of storage instances to avoid unnecessary creation, and it provides convenient methods to switch between different storage options like file-based storage or a dummy, non-saving mode for testing.  If your working directory changes, you'll need to clear the cache to ensure things work correctly.

## Class PersistRecentInstance

This class helps you save and load the most recent data for a trading strategy. It's designed to work with the backtest-kit framework and automatically manages file storage for this data.

It remembers details like the trading symbol, strategy name, exchange, the timeframe you're using (like 1-minute or daily), and whether it’s a backtest or live trading scenario.

The class makes sure that saving changes is done safely and reliably. 

It provides methods to:
- Ensure the storage is ready.
- Retrieve the latest saved data.
- Save new data.

Essentially, it handles the messy details of storing the recent state of your trading strategy so you don't have to.

## Class PersistPartialUtils

This class, `PersistPartialUtils`, helps keep track of partial profit and loss information for your trading strategies, especially when dealing with live data. It’s designed to safely store this information, even if your program crashes unexpectedly.

Think of it as a way to remember where your trades stand – how much profit or loss you’ve made – so you can pick up where you left off.

It uses a clever system to create unique storage spaces for each trading symbol and strategy, ensuring everything is organized. You can even customize how this storage works if you need something more specialized.

Here's a breakdown of what you can do:

*   **Custom Storage:** You can tell it how to store the data using your own code, or use pre-built options like storing it in files or ignoring it entirely (for testing purposes).
*   **Lazy Loading:** It only creates the storage space when it’s needed, making things efficient.
*   **Read and Write Data:** You can easily retrieve or update the partial profit/loss data for a specific trade.
*   **Clear the Cache:** If your development environment changes, like when you run your strategy from a different directory, you can clear the memory to ensure consistent behavior.
*   **Switch Storage Types:** Convenient functions allow you to switch between different storage methods without modifying your core logic.

## Class PersistPartialInstance

The `PersistPartialInstance` class provides a way to reliably save and retrieve partial data, like intermediate calculations or state, during backtesting. It's designed to work with file storage and ensures data integrity even if the process crashes unexpectedly. 

Each instance is tied to a specific trading symbol, strategy name, and exchange name, creating a distinct storage area. 

The `waitForInit` method gets the storage ready, and then `readPartialData` and `writePartialData` let you access and update that partial data using a unique signal ID as the identifier. This class handles the low-level file writing in a safe, atomic way, preventing data corruption. The `_storage` property gives access to the underlying storage mechanism.


## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved, particularly for backtesting and live trading environments. It's a behind-the-scenes helper used by other tools to ensure notifications are reliably stored.

It automatically handles creating storage instances, and it lets you swap in different ways of storing notifications if needed – whether that's using the standard file-based system or a dummy system for testing. Each notification is saved as its own individual file, making sure they’re handled separately.

The class makes sure operations related to notification data are done safely and consistently. If you need to switch the location where your application is running (like when the base directory changes), you can clear the cache to make sure new storage instances are created. You can also choose to temporarily disable saving by using the dummy implementation. 

The `usePersistNotificationAdapter` method lets you provide your own way of saving notification data.

## Class PersistNotificationInstance

This class provides a way to reliably store and retrieve notification data, making sure your backtesting or live trading system can remember important events even if things go wrong. It uses individual JSON files to hold each notification, organizing them by a unique ID. 

The class handles situations where your system might crash unexpectedly by ensuring writes are done safely. 

You can control whether the storage is being used for backtesting or not. It also has an initialization method you can call to prepare the storage. It reads notification data by looking at all the available IDs and lets you write new notifications, each saved with its own identifying key.

## Class PersistMemoryUtils

This utility class helps manage how trading data is saved and loaded persistently, making sure information isn't lost even if the system crashes. It intelligently caches storage instances, so it doesn't have to repeatedly create them.

You can customize how the data is stored by providing your own storage constructors, or use the built-in default JSON-based storage or even a dummy version for testing. 

The class provides methods for reading, writing, deleting, and checking for the existence of memory entries – all handled in a safe way. You can also clear the cached storage instances, which is useful when the working directory of the process changes. It offers a way to list all saved data entries for index rebuilding. 

Finally, you can choose to switch between different storage implementations like using the default JSON file-based system, or a "dummy" system that doesn't actually store anything.

## Class PersistMemoryInstance

This class provides a way to store and retrieve memory data persistently, typically using files. It acts as a layer on top of the core storage mechanism, offering features like soft deletion (marking data as removed instead of deleting it entirely) and easy access to data by its unique identifier. 

Here’s what you can do with it:

*   It initializes a storage area based on a signal ID and a bucket name.
*   You can read a specific memory entry by its ID, or check if an entry exists.
*   Data is written under an ID, and entries can be "soft-deleted" by marking them as removed.
*   The `listMemoryData` method allows you to retrieve all valid (non-deleted) memory entries.
*   Disposing of this instance doesn’t involve any cleanup; the underlying memo cache is managed separately.

## Class PersistMeasureUtils

This class provides a way to store and retrieve cached data from external APIs, ensuring that the data persists even if the application crashes. It uses a system of "buckets" based on timestamps and symbols to organize the cached information, and it can adapt to different storage methods. 

You can customize how this caching works by providing your own storage solutions, or by using pre-built options like a file-based system or a dummy implementation for testing. The class automatically handles creating storage instances for each bucket and ensures that reading and writing data happens reliably.

Here’s a breakdown of key functions:

*   **Reading data:** The `readMeasureData` method retrieves cached data using a bucket and a key.
*   **Writing data:** The `writeMeasureData` method saves data to the cache, also using a bucket and a key.
*   **Deleting data:** The `removeMeasureData` method allows for soft-deleting entries, marking them for removal later.
*   **Listing data:** The `listMeasureData` method lets you see all the non-deleted data within a specific bucket.
*   **Clearing cache:**  `clear` resets the cache, useful when the application’s working directory changes.
*   **Adapting storage:** You can easily switch between storage implementations (like file-based or dummy) using `useJson` and `useDummy`.

## Class PersistMeasureInstance

This class provides a way to save and retrieve trading measure data to files, making your backtesting results persistent. It handles the details of writing data to disk safely and efficiently. 

The `bucket` property defines where your data will be stored within the file system.  It uses a simple flag (`removed: true`) to mark entries as deleted instead of actually removing the files, allowing you to easily recover them if needed.

To get started, you'll use `readMeasureData` to load existing data, `writeMeasureData` to save new data, and `removeMeasureData` to effectively delete data.  `listMeasureData` helps you find all the valid (non-deleted) entries.  The `waitForInit` method makes sure the storage is ready before you start writing or reading.

## Class PersistLogUtils

This class helps manage how log data is stored persistently, ensuring a reliable record of your backtesting activity. It acts like a central hub, keeping track of a single, global log instance. 

You can customize how these logs are stored by providing your own log instance creators. This is useful for different storage needs or testing.

The system automatically handles reading and writing log entries; when reading, it fetches all existing log entries, and when writing, it safely appends new ones while preventing duplicates.

The class provides a way to clear out the existing cached log instance; a useful action when you need to reset or when the working directory changes.  You can switch between a default file-based log, a JSON-based log, or even a dummy log for testing purposes. Essentially, it gives you control over how logs are handled without directly interacting with the underlying storage.

## Class PersistLogInstance

This class provides a way to persistently store your backtesting logs to files. Think of it as a safe and reliable place to keep records of what happened during your simulations. Each log entry is saved as its own JSON file, making it easy to manage and access individual pieces of information. 

The system is designed to be append-only, meaning that it only adds new data and never overwrites existing records. This helps prevent accidental data loss. It also includes crash-safe writes, ensuring that your data remains consistent even if something unexpected happens during the writing process.

You can use `waitForInit` to make sure the storage is ready before you start writing.  `readLogData` retrieves all the log entries stored, and `writeLogData` safely adds new entries to the persistent storage.


## Class PersistIntervalUtils

This component handles keeping track of when specific intervals have fired, helping to avoid redundant actions. It stores this information in a persistent layer, essentially creating markers in a directory structure under `./dump/data/interval/`. 

Each marker signifies that an interval has already been processed for a particular bucket and key combination. The absence of a marker indicates that the interval either hasn't fired yet or returned null the last time.

You can configure how these markers are stored and managed.  There's a way to use a custom constructor for creating these markers, a fallback to a standard file-based system, or even a "dummy" version that doesn't actually store anything. 

It provides methods for reading, writing, and deleting these markers, as well as clearing the internal cache.  This cache is important to refresh when the working directory changes during a strategy's execution. Finally, it has a function to list all markers within a given bucket.

## Class PersistIntervalInstance

This class provides a way to store and retrieve data related to trading intervals, using files for persistence. It acts as a manager for interval markers, keeping track of their state and allowing for soft deletions.

The `bucket` property defines where the interval data is stored. 

The `readIntervalData` method fetches a specific interval marker; if it doesn't exist or has been "soft-deleted," it returns nothing.  `writeIntervalData` saves a new interval marker.

To remove a marker, `removeIntervalData` doesn't delete the file itself, but instead flags it as removed, so subsequent calls to `readIntervalData` won't find it.

`listIntervalData` gives you a list of all available interval markers that haven't been marked for removal. 

The `waitForInit` function makes sure the storage is ready before you start interacting with it. 


## Class PersistCandleUtils

This class helps manage how candle data (like OHLCV information for trading) is stored and retrieved from files on your system. It’s designed to keep things efficient by using a cache – saving data to files and reusing it when possible.

Each candle's data is stored as a separate file, organized by exchange, symbol, time interval, and the candle's timestamp. 

The system checks if the number of cached files matches your request; if it does, it serves the cached data directly. It also automatically updates the cache when data is missing or incomplete.

You can customize how these candle caches are created and managed using the `usePersistCandleAdapter` method, allowing you to plug in different caching mechanisms.  There are also shortcuts to use the default file-based caching, or a dummy version that ignores writes. Clearing the cache is easy with the `clear` method, helpful if your working directory changes. Finally, the `readCandlesData` and `writeCandlesData` methods handle reading and writing the actual candle data.


## Class PersistCandleInstance

This class provides a way to store and retrieve candle data persistently, typically using files. It’s designed to work with the `IPersistCandleInstance` interface, offering a straightforward file-based solution.

Each candle is saved as a separate JSON file, identified by its timestamp. When you try to read data, it will return nothing if a timestamp is missing, which means it's essentially telling you to fetch that data again.

When writing data, the system is careful: it will skip candles that are not yet complete (meaning their `closeTime` is in the future) and also avoids overwriting existing files. This ensures that the cache only holds fully finalized candles. 

The system uses a storage mechanism to hold these files, organized by the trading symbol, interval (like 1 minute or 1 hour), and the name of the exchange. You can use the `waitForInit` function to make sure the underlying storage is ready. Reading pulls a batch of candles within a specific timeframe, and writing adds new, complete candles to the stored data.

## Class PersistBreakevenUtils

This utility manages the persistent storage of breakeven data for your trading strategies. It's designed to read and save information about breakeven points to disk, ensuring your strategies remember their state even across restarts.

It uses a smart caching system, so each combination of symbol, strategy name, and exchange only has one storage instance. This helps keep things efficient.

You can customize how the data is stored; you have the option to use a standard file-based approach, a dummy adapter for testing (which doesn’t actually save anything), or provide your own custom storage solution.

If your working directory changes (like when running different strategies), you’ll want to clear the cache to make sure everything is up to date. The data is stored in a structured folder system under `./dump/data/breakeven/`, with separate folders for each strategy and symbol.


## Class PersistBreakevenInstance

This class provides a way to persistently store breakeven data for your trading strategies. It's designed to be reliable, even if your application crashes unexpectedly. 

The class handles the complexities of saving data to a file, using a combination of the signal ID and context to uniquely identify each set of data. 

Here's a breakdown:

*   You create an instance of this class, specifying the symbol, strategy name, and exchange name for the data you’re working with.
*   It automatically manages the file storage behind the scenes, so you don't have to worry about the low-level details.
*   `waitForInit` is used to ensure the storage is properly initialized.
*   `readBreakevenData` retrieves the previously saved breakeven data for a specific signal.
*   `writeBreakevenData` is how you save new or updated breakeven data, associating it with a unique signal ID. 


## Class PersistBase

PersistBase provides a foundation for saving and loading data to files, ensuring that writes are reliable and preventing data corruption. It's designed to manage persistent storage for your trading entities.

This class handles the complexities of file management, including making sure files are written correctly and dealing with potential issues like corrupted files. It automatically validates and cleans up any problematic files during initialization. You can also easily loop through all your saved entities.

The class keeps track of where your data is stored and handles the creation of necessary directories.  It utilizes a unique method to ensure that changes are written completely before considering them successful. 

Initialization is handled once and will validate existing files. 

You can use it to read, write, and check for the existence of entities while retrieving all available entity IDs in a sorted order.

## Class PerformanceReportService

The PerformanceReportService helps you understand how your trading strategies are performing by tracking their execution time. It listens for timing events emitted during strategy execution and records them in a database. This allows you to pinpoint slow areas in your code and optimize for better performance.

You can set it up to start tracking by subscribing to the performance emitter – it ensures only one subscription at a time. When you're done, use the unsubscribe function to stop the tracking and clean up. The service uses a logger to provide debugging information and stores all tracked data for later analysis.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It keeps track of performance metrics, organizing them by strategy and the specific market conditions. 

It automatically creates reports, including detailed analysis and identifying potential bottlenecks. These reports are saved as markdown files, making them easy to read and share.

You can subscribe to receive performance updates and unsubscribe when you no longer need them. The service also lets you retrieve specific performance data and clear previously recorded information to start fresh. It uses a system of storage to isolate performance data for different combinations of symbols, strategies, exchanges, frames, and backtest settings.

## Class Performance

The Performance class offers tools to analyze how well your trading strategies are performing. It helps you understand where time is being spent and identify potential bottlenecks.

You can retrieve detailed performance statistics for a specific trading strategy and symbol, giving you insights into metrics like average duration, volatility, and outlier detection. 

The class can also generate well-formatted markdown reports, which visually display performance data, including time breakdowns by operation and percentile analysis to highlight potential issues. 

Finally, you have the option to save these reports directly to your hard drive for later review, with a default directory structure to keep things organized.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data generated during backtesting or live trading. It acts as a central point to access and organize information about smaller, incremental gains and losses.

You can use it to get statistical summaries of your trading activity, providing key metrics like total profit/loss event counts.

It also provides a handy way to create detailed markdown reports that present individual profit and loss events in a clear table format, including details like the symbol traded, strategy used, signal ID, position size, level, price, and timestamp. This report includes a summary of statistics at the bottom.

Finally, you can easily save these reports directly to files on your system, making it simple to review your performance over time. The filenames are automatically generated based on the symbol and strategy name. The class relies on the PartialMarkdownService to manage the underlying data and generate the reports.

## Class PartialReportService

The PartialReportService helps you keep track of your trading activity by recording partial profit and loss events. It listens for signals indicating when a position is partially exited, whether it's a profit or a loss. 

This service saves details like the level and price at which these partial exits occurred, storing them in a database. It uses a logger to help with debugging.

You can tell the service to start listening for these events with the `subscribe` function, which will return a way to stop listening later.  The `unsubscribe` function provides a straightforward method to stop receiving those signals, ensuring you don’t accidentally overload the system with unnecessary data. If you haven’t subscribed, calling `unsubscribe` won’t do anything.

## Class PartialMarkdownService

This service helps you create and save reports detailing your partial profits and losses during trading. It listens for profit and loss events, keeps track of them for each symbol and strategy you're using, and then organizes this data into easy-to-read markdown tables. 

You can request statistics like total profit/loss event counts or generate a full report for a specific symbol and strategy.  Reports are saved to disk so you can review them later.

To start, you need to subscribe to the profit and loss signals.  This service automatically creates storage for each unique combination of symbol, strategy, exchange, frame, and backtest, ensuring data is kept separate and organized.  It's easy to stop receiving updates – just unsubscribe using the function it provides. You can also clear out the accumulated data whenever needed, either for a specific combination or everything at once.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing and tracking partial profit and loss events within the backtest kit. It's designed to be injected into the core trading strategy, providing a controlled way to interact with the underlying partial connection service.

Think of it as a middleman: it receives requests related to profit, loss, and clearing partial states, logs those actions for monitoring purposes, and then passes the requests on to the connection service to actually handle them.

Several validation services are also available through this service to ensure that strategies, risks, exchanges, frames, and actions exist. 

The `validate` method helps avoid repeated checks of strategy configurations.

The `profit`, `loss`, and `clear` methods handle the actual processing of profit, loss, and clearing of signals, respectively, providing a consistent approach for managing partial states.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for individual trading signals. It acts like a central hub, making sure each signal has its own dedicated record of its performance.

This service keeps a list of these records, ensuring that each signal ID has only one active record (a ClientPartial instance). It sets up each record with important tools like logging and event notifications.

When a signal makes a profit or a loss, the service handles it by either finding the existing record or creating a new one, and then passing the details to that record for processing. When a signal is closed, the service cleans up its record, preventing it from taking up unnecessary space.

The PartialConnectionService works closely with other parts of the system, like the action core and time management components, and it's designed to be reliable and efficient. It uses a technique called memoization to store records and reuse them as needed, speeding up the process and preventing redundant work.

## Class OrderTransientError

This `OrderTransientError` class is a way to explicitly mark errors as temporary issues – think network hiccups or brief exchange problems – rather than permanent rejections or order-not-found situations. It doesn’t change how the framework handles things, as any untyped error already defaults to this "transient" status.  It's mainly for clarity in the code, so developers know an error is meant to be retried.

Here's how it works in different scenarios:

**Opening an order:** If the opening fails, the system will automatically retry it with the same order details.  Before retrying, it checks if a previous order with the same ID exists and confirms it.  Too many retries, and the system stops, signaling a critical error.

**Closing a position:** Similar to opening, failed close attempts are retried. If retries are exhausted, the system forcefully closes the position and signals a critical error.

**Order Checks (health pings):** If a check fails, it's tolerated and monitoring continues for a certain number of attempts. Persistent failures lead to a terminal error.

**Important points to remember:**

*   The number of retries is tracked separately for opening, closing, and checks.
*   Exhausting the retry count for any of these operations results in a fatal error, halting the process.
*   The retry counters are saved, so a crash doesn't erase progress—though they're reset on restart.
*   There’s a way to reliably identify this error type using a static method.
*   This class is not used within the framework's core logic – only in live environments.

## Class OrderRejectedError

This error represents a definitive rejection of an order by the exchange – it's not something that can be retried. It’s thrown specifically within the parts of the system that handle order submission (like when communicating with a broker), not during checks or validations. When this error occurs, the system immediately cancels any pending order openings and forcefully closes any existing positions, effectively stopping further attempts for that trade. It's considered a normal, albeit undesirable, outcome, unlike a network issue that would trigger retries. 

Importantly, don’t use this error for temporary problems like timeouts – those should be handled with standard error mechanisms.  This error is very specific to confirmed business rejections from the exchange and carries a special runtime "brand" that allows the system to identify it, even if it’s created in a different part of your code. The error message itself is optional and is primarily for logging information.


## Class OrderDeletedError

This error, `OrderDeletedError`, signals a definitive confirmation from the exchange that an order simply doesn't exist anymore – maybe it was canceled by the user or automatically liquidated. It’s a strong indication something's gone from the exchange's perspective.

You should only throw this error within the order check processes, like when verifying active or scheduled orders. The framework handles this error in a special way: it immediately registers the order as gone, bypassing any usual retry attempts. If it's an open position, the position is closed; if it's a scheduled order, the signal is canceled.

Critically, this isn’t for network issues or filled orders. A filled order requires a different confirmation process; a network hiccup warrants a different error type. 

Throwing this error in the wrong place—outside the designated checks—will cause it to be treated as a temporary problem and retried, which isn’t what you want.  It's identified by a specific runtime brand, making it reliable even when modules are duplicated. This error only occurs during live trading and never in backtesting.



The constructor takes an optional informational message. It includes a static method, `isOrderDeletedError`, to reliably identify instances of this error even across duplicated module copies. There's also a `fromError` method to create new instances from existing errors.

## Class NotificationLiveAdapter

The `NotificationLiveAdapter` provides a flexible way to send notifications during backtesting or live trading. It acts as a central hub for delivering events like signal updates, profit/loss changes, order status, and errors, allowing you to easily switch between different notification methods without modifying the core trading logic. 

Think of it as a middleman – it receives all the event data and then passes it on to a specific notification system. By default, it uses an in-memory storage, but you can easily change it to store notifications persistently or even disable them entirely with a dummy adapter. 

The adapter offers convenient helper functions like `useMemory`, `usePersist`, and `useDummy` for quick configuration.  It also has methods like `handleSignal`, `handlePartialProfit`, and others to deal with specific events, all of which relay the information to the active notification backend.  The `clear` method is important when your environment changes, forcing a refresh of the notification system. This ensures the adapter is always using the correct configuration and data paths.

## Class NotificationHelperService

The NotificationHelperService helps manage and send out important information about trading signals. It’s primarily used behind the scenes to ensure everything is working correctly and to let other parts of the system know when a signal is ready. 

Think of it as a quality control and messenger combined. Before a signal is sent, this service checks if all the related configurations (like the trading strategy, exchange details, and rules) are set up properly. This validation process is optimized; it only runs once for each unique combination of strategy, exchange, and frame.

If everything checks out, the service then broadcasts the signal information, making it available to anyone who's listening for updates. It's connected to the action pipeline and triggered by `onActivePing` callbacks, so you typically won’t interact with it directly, but rather through those callbacks.

Here's a breakdown of its components:

*   It relies on several other services like `loggerService`, `strategySchemaService`, and various validation services to do its job.
*   The `validate` function performs the configuration checks and is designed to be efficient through memoization (remembering past checks).
*   The `commitSignalNotify` function is the key method for actually sending out the signal information.

## Class NotificationBacktestAdapter

This component manages notifications within your backtesting framework, allowing you to control where those notifications are stored and how they're handled. It uses a flexible design, letting you easily switch between different notification backends like in-memory storage, persistent storage, or even a dummy backend that does nothing.

You can choose which backend to use with helper functions like `useMemory`, `usePersist`, and `useDummy`.  The default is in-memory storage.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, etc.) are the key functions used to send notifications. They simply pass the data to the currently configured backend. The `getData` method allows you to retrieve all stored notifications. The `dispose` method clears out all notifications.

If you need to change the notification backend dynamically or if your working directory changes during backtesting, use the `clear` method to reset the cached notification instance. `useNotificationAdapter` allows direct control over the notification adapter class.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for managing notifications during both backtesting and live trading. It automatically receives updates by listening to different signal sources. 

You can enable notification storage by subscribing to these signals, and it ensures that you only subscribe once to avoid duplicate updates. Conversely, you can disable notification storage to stop receiving updates, and it's safe to do this repeatedly.

This adapter provides a way to retrieve all notifications, specifying whether you want backtest or live notifications.  Finally, it offers a cleanup function to completely remove all stored notifications.

## Class MemoryLiveAdapter

The `MemoryLiveAdapter` provides a way to manage and store data during live trading, offering flexibility in how that data is handled. It uses an adapter pattern, meaning you can easily swap out the underlying storage mechanism. By default, it saves data to files, ensuring that your data persists even if your application restarts.

However, you can also choose to store data entirely in memory for faster access or use a "dummy" adapter that simply discards any data written – useful for testing. This adapter keeps track of data using a combination of signal IDs and buckets, and it organizes instances in a way that it can quickly retrieve them.

You have methods for writing, searching, listing, removing, and reading data from memory. When you no longer need specific data, you can dispose of it to free up resources. It also offers convenient methods (`useLocal`, `usePersist`, `useDummy`, `useMemoryAdapter`) to quickly switch between different storage options. Finally, a `clear` function allows you to wipe the adapter’s cache, important when your application's working directory changes.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for backtesting scenarios. It allows you to choose different storage methods, like keeping data entirely in memory, persisting it to files, or using a dummy adapter for testing purposes. The default storage is in-memory using BM25 for efficient searching.

You can easily switch between these storage options using convenient methods: `useLocal` for the default in-memory approach, `usePersist` to save data to files, `useDummy` to discard data, and `useMemoryAdapter` to use a completely custom storage implementation. When a signal is cancelled or closed, `disposeSignal` will clean up related memory instances. 

The `writeMemory`, `searchMemory`, `listMemory`, `removeMemory`, and `readMemory` methods allow you to interact with the storage, while `clear` helps to refresh the storage when needed, such as when the working directory changes.  The adapter uses memoization to efficiently handle multiple signals and buckets.

## Class MemoryAdapter

The MemoryAdapter acts as the central hub for managing your backtest and live trading memory. It automatically cleans up old memory instances when signals are finished, preventing problems with outdated data. 

You can control memory usage with `enable` and `disable` to turn storage on or off.

To interact with the memory, you use functions like `writeMemory` to store new data, `searchMemory` to find data using text search, `listMemory` to view all stored entries, `removeMemory` to delete entries, and `readMemory` to retrieve specific pieces of data.  These functions intelligently handle whether you’re operating within a backtest environment or in live trading. Each operation lets you specify the signal and bucket it relates to, and includes a timestamp.


## Class MaxDrawdownUtils

This class helps you understand and visualize the biggest losses (maximum drawdowns) experienced during trading. It acts as a central place to access and summarize data collected about these drawdowns. 

Think of it as a tool to generate reports and pull data about the worst periods for a specific trading strategy on a particular asset. 

You can retrieve summarized statistics, or create detailed markdown reports that show all the drawdown events. It's also possible to automatically save these reports to a file. The reports can be customized to include specific pieces of information.


## Class MaxDrawdownReportService

The MaxDrawdownReportService is responsible for recording instances of maximum drawdown events, which are critical moments of loss in a trading strategy. It monitors events related to drawdowns and saves them to a database for later analysis.

The service uses a logger to track events and a report writer to persistently store the drawdown records. When a new drawdown is detected, it captures a snapshot of all relevant information, including the time, symbol, strategy name, exchange, frame, and signal details like position and price levels. 

The `subscribe` method allows you to begin this monitoring process, and it ensures that you only subscribe once to prevent duplicate data.  The `unsubscribe` method stops the service from recording any further drawdowns.

## Class MaxDrawdownMarkdownService

This service is designed to create and store reports detailing maximum drawdown, a key metric for assessing risk in trading. It listens for drawdown events and organizes them based on the trading symbol, strategy, exchange, and timeframe. 

You can subscribe to receive these drawdown events; make sure to unsubscribe when you’re finished to free up resources. The service also offers methods to retrieve the collected data, generate a markdown report, or write the report directly to a file. 

To clear the accumulated data, you can either specify a particular combination of symbol, strategy, exchange, and timeframe, or clear everything at once. This helps in managing storage and ensuring data freshness.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved. It lets you easily switch between different ways of storing them, like writing each report to its own file, appending to a single log file, or even disabling the report generation altogether. This system keeps track of your storage settings so you don't have to worry about creating them manually.

You can choose to use the default, which creates individual markdown files for each report. If you want a single, append-only log file for all your reports, switch to the JSONL adapter. For testing or when you simply don’t need reports, you can use the dummy adapter, which silently ignores any attempts to write markdown. 

The `useMarkdownAdapter` function lets you customize how reports are stored.  The `writeData` function handles actually writing the content to the chosen storage. If you ever need to reset the storage settings, the `clear` function will clear the memoized storage cache.

## Class MarkdownUtils

This class helps you control when and how markdown reports are generated for different parts of your trading system. You can turn on or off report generation for backtests, live trading, strategy analysis, and other areas.

The `enable` method lets you selectively turn on markdown reporting for specific services, like backtests or live trades. When you enable these, they'll start collecting data and generating markdown reports. Importantly, you *must* use the cleanup function it returns to turn off those services later; otherwise, you risk memory issues.

Conversely, `disable` lets you turn off markdown reporting for particular services without affecting others. This is useful if you want to temporarily stop generating reports for a specific task.

Finally, `clear` allows you to reset the data collected for markdown reports in certain areas. This allows you to start fresh with data accumulation without disabling the reporting entirely.

## Class MarkdownFolderBase

This adapter helps you organize your backtest reports into separate files within a directory structure, making them easy to browse and review. It writes each report as its own .md file, so you can easily find specific results. The location of these files is controlled by the `options.path` and `options.file` parameters.

The adapter handles creating the necessary directories for your reports, so you don't have to worry about that. It’s designed for situations where you want a clear, organized set of reports for manual inspection.

The `waitForInit` method doesn't actually do anything, as folder-based adapters don't require any special setup. The core function is `dump`, which takes the markdown content and writes it to the designated file. 


## Class MarkdownFileBase

This class provides a way to write markdown reports in a structured, append-only JSONL format. It's designed for centralized logging and makes it easy to process your reports with standard JSONL tools.

Each report type (like 'trades' or 'orders') gets its own file within a designated directory. The files store data as JSON lines, with each line containing the markdown content, metadata for searching (like symbol, strategy, and exchange), and a timestamp.

The class handles file creation, write operations, and includes safeguards to prevent issues like timeouts during writing. You can think of it as a pipeline: you give it the markdown text and some optional settings, and it neatly adds it to the appropriate file. 

To get things running, you'll need to call `waitForInit` once to set up the file and stream. After that, you can repeatedly use `dump` to add your markdown content. The `dump` method ensures data is written safely, waiting for the write buffer to be available and protecting against lengthy delays.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how markdown files are stored, allowing for flexibility in your approach. It lets you choose different ways to handle the storage – whether that's creating individual markdown files, appending data to a single JSONL file, or even just discarding writes for testing purposes. You can easily switch between these storage methods using shortcuts like `useMd`, `useJsonl`, and `useDummy`, and you can customize the adapter entirely by providing your own storage constructor. The adapter ensures efficient storage by creating storage instances only when needed and reusing them.

## Class MCPValidationService

The MCPValidationService helps ensure the stability and correctness of your trading strategies. It keeps track of all registered Market Participant Connections (MCPs), verifying that they exist and their dependencies are valid whenever they're used. 

Think of it as a safety net – it prevents errors by making sure everything you're relying on is properly set up.

Here's a breakdown of what it does:

It registers MCPs, making sure you don't accidentally create duplicates.
It validates MCPs, confirming their existence and strategy dependencies are sound. This validation only happens once per MCP name to avoid unnecessary checks.
It provides a list of all registered MCP schemas, giving you a clear overview of your available connections.

The service relies on a logger service and a strategy validation service for its operations. It uses an internal map to store MCP information.


## Class MCPUtils

MCPUtils provides tools for interacting with and observing a live trading strategy. Think of it as a bridge between your agent and the strategy's actions.

It lets you peek into the strategy's current status, displaying a human-readable summary of the portfolio's health. 

You can also manually initiate trades – opening positions with pre-defined take profit and stop-loss levels, or closing existing pending orders.

These actions are carefully checked to ensure they align with the strategy's rules and risk management settings.

It offers a way to generate custom status reports, mimicking the standard message format but allowing for extended information.

The `getDefaultMessages` method provides a default report format covering balance, entry order, position details, and exit order for each traded symbol.

The `getStatus` method gathers a snapshot of the live strategy's state and delivers it as agent-friendly messages.

`commitPositionOpen` opens positions based on agent commands, using predefined profit targets and loss limits.

Finally, `commitPositionClose` closes existing pending positions according to agent instructions.

## Class MCPSchemaService

The MCPSchemaService acts as a central place to keep track of different MCP (Message Content Protocol) schema definitions. It’s essentially a registry that stores these schemas, associating each one with a specific MCP name. When a schema is added, it undergoes a basic check to ensure it has the essential components.

The service has a logger to track what’s happening and a storage area (`_registry`) to hold the schemas themselves. It also uses a `validateShallow` function for that initial, lightweight check.

You can add new schemas using the `register` method, which replaces any existing schema with the same name.  The `override` method lets you modify parts of an existing schema, creating a combined version.  Finally, `get` retrieves a schema by its name.  This service is crucial for making sure that the right strategy is used and that messages are properly understood.

## Class LookupUtils

The LookupUtils acts like a central record-keeper for what's currently happening in your backtests and live trading. Whenever a backtest run starts, or a live trading session begins, or a strategy's iteration kicks off, it registers its presence here.  When that activity finishes, it's removed from the record.

This record-keeping is crucial for things like managing how quickly candles are processed – it helps determine if we need to pause or not.

You don't need to create an instance of LookupUtils directly; it's available as a singleton called `Lookup`.

Here's what you can do with it:

*   **Add an Activity:** Register a new activity when it begins.  If you try to register the same activity twice, the second registration simply replaces the first.
*   **Remove an Activity:** Clean up the record when an activity is complete.  It's important to do this, even if errors occur, so you don't leave behind outdated information.  Think of using it within a `finally` block.
*   **List Activities:** Get a snapshot of everything that’s currently running.

## Class LoggerService

The LoggerService helps ensure consistent logging across your backtesting framework. It provides a central place for logging messages and automatically adds useful information to each log entry, like the strategy and exchange involved. 

You can customize the logging behavior by providing your own logger implementation; otherwise, it defaults to a no-op logger that does nothing. 

The service injects context, such as the strategy name, exchange, frame, symbol, and execution time, directly into your log messages. This simplifies debugging and provides more insights into what's happening during the backtest.

It offers several logging levels – log, debug, info, and warn – all with automatic context appending.  Finally, you can set a custom logger to control exactly where and how your log messages are handled.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting environment. It allows you to easily switch between different logging methods, such as keeping logs in memory, persisting them to a file, or effectively disabling logging altogether. 

You can change how logs are handled using methods like `usePersist`, `useMemory` (which is the default), and `useDummy`.  `useJsonl` lets you write logs to a JSONL file for detailed analysis. The `useLogger` method gives you even more control, letting you specify a custom logging class.  

The `clear` method is important for situations where your working directory changes during testing, ensuring a fresh log adapter is created.  The `log`, `debug`, `info`, `warn`, and `getList` methods provide a consistent interface for interacting with whichever logging method you've selected. The `getInstance` property handles creating and caching the log instance for efficiency.

## Class LiveUtils

This utility class, LiveUtils, simplifies live trading operations within the backtest-kit framework. It acts as a central point for running live trades, handling potential crashes through state persistence, and tracking progress in real-time.

Think of it as a central manager for your live trading. It provides a way to start and stop trades, retrieve key information about open positions, and even adjust strategies mid-trade.

Here's a breakdown of what it does:

*   **Running Live Trades:** You can initiate live trading for a specific symbol and strategy using the `run` method. This creates an ongoing process that automatically recovers from crashes.  A background option exists to run trades silently.
*   **Position Details:**  Several methods allow you to check on the status of a live trade, including retrieving pending or scheduled signals, calculating cost basis and percentage closed, and getting information like breakeven points and estimated time remaining.
*   **Control & Modification:**  You can influence the trade's progress, for instance, by canceling scheduled signals, closing positions early, adjusting stop-loss or take-profit levels, or adding new DCA entries.
*   **Real-time Data:** It provides access to detailed data about the active position including price levels, partial close history, and performance metrics.
*   **Singleton:**  LiveUtils is a singleton, meaning you'll interact with only one instance of it, simplifying management across your application.

## Class LiveReportService

LiveReportService helps you keep a close eye on your trading strategy as it runs live. It captures every important event – when the signal is idle, when a trade is opened, when it’s active, and when it’s closed – and records all the details. This service essentially acts as a detailed logbook for your live trading.

The service connects to a live signal emitter to receive these events, ensuring you get a comprehensive record of what's happening. Everything is written to a SQLite database for safe-keeping and analysis.

You can easily start and stop the service using the `subscribe` method, which ensures you don't accidentally subscribe multiple times. When you're finished, the `unsubscribe` method cleanly disconnects from the signal emitter. The `loggerService` property provides a way to output debugging information, and the `tick` property is responsible for the core event processing and database logging.

## Class LiveMarkdownService

This service helps you automatically create and save reports about your live trading activity. It listens for trading events like when a strategy starts, is active, or closes a position.

It organizes all of these events for each strategy and then neatly presents them in markdown tables, along with useful trading statistics like win rate and average profit. 

The reports are saved to your computer, making it easy to review your trading performance over time.

You can control what data is included in the reports and where they are saved.

Here’s a breakdown of what you can do:

*   **Subscribe and Unsubscribe:** Connect to the live trading data stream and disconnect when you’re done.
*   **Generate Reports:** Create detailed markdown reports for specific trading strategies.
*   **Save Reports:** Automatically save the reports to files on your computer.
*   **Clear Data:**  Remove accumulated trading data – you can clear everything or just data for a specific strategy.
*   **Access Statistics:** Get a summary of your trading data like win rate and average profit.

## Class LiveLogicPublicService

The LiveLogicPublicService helps orchestrate live trading by automatically managing context like strategy and exchange names. It builds upon the LiveLogicPrivateService and adds convenient context propagation, so you don’t have to pass context information to every function call. 

It works as a continuously running process, using an infinite generator to provide a constant stream of trading results (open, closed, or cancelled signals). The system is also designed for resilience: if it crashes, it can recover and continue trading from the last saved state. Real-time progression is tracked using the current date and time.

You can start the live trading process with the `run` method, specifying the trading symbol and the necessary context. The service handles the underlying framework details, allowing you to focus on the trading logic itself. 

The service also provides access to logging and exchange connection services, as well as the private live logic service.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading for a specific symbol. It works by continuously monitoring and processing data in a loop, designed to run indefinitely.

Each cycle involves creating a timestamp, evaluating the trading signals, and then reporting on any trades that were opened or closed – it skips over signals that are currently active or idle. 

To keep things efficient, the service streams its results using an asynchronous generator. Because the service runs continuously, it’s built to handle potential crashes and automatically recover the trading state. The underlying strategy core and method context are also handled by this service.

## Class LiveCommandService

This service provides a way to access live trading capabilities within the backtest-kit framework. It acts as a convenient layer on top of the underlying live logic service, making it easier to integrate into your applications.

It handles things like validating your trading strategies and making sure they're compatible with the exchanges you're using. 

The `validate` property simplifies the process of verifying your strategy and risk configurations, avoiding unnecessary checks when you're using the same strategy with the same exchange.

The core of the service is the `run` method. It essentially kicks off the live trading process for a specific trading pair (symbol), providing context like the strategy and exchange names.  It keeps running indefinitely, and includes built-in mechanisms to recover from crashes, ensuring your trading continues smoothly.

## Class IntervalUtils

IntervalUtils helps you manage how often your functions run, especially when dealing with time-based data like candles. It lets you control firing signals only once per specified interval, preventing redundant executions.

There are two primary ways to use it: in-memory, where data is kept only in the program’s memory, and file-based, where the state is persistently saved to a file. The file-based option is useful if you want to ensure your function fires only once per interval even after restarts.

The `fn` property wraps regular functions to ensure they only run once during each interval. If a function returns `null`, it will wait and try again later.  Each function gets its own unique tracking, making sure you don’t have unexpected behavior.

The `file` property works similarly for asynchronous functions, but it uses a file to remember whether the function has already run for a given interval, so the state persists across program restarts. Again, each function has its own dedicated record.

You can manually remove wrapped functions with `dispose`, or clear all tracked functions with `clear`.  `resetCounter` is helpful for ensuring clean operation when your working directory changes during a backtesting session, preventing conflicts between interval states.

## Class HighestProfitUtils

This class helps you access and understand the highest profit events that have occurred during your trading simulations or live trading. Think of it as a tool to analyze which strategies and symbols performed the best.

It provides a few key functions:

*   `getData`:  You can use this to get the raw statistics for a specific symbol and strategy, allowing you to see key metrics like the highest profit achieved.
*   `getReport`: This creates a formatted markdown report showing all the highest profit events for a particular symbol and strategy, great for reviewing performance trends.
*   `dump`: This function takes the data and saves the markdown report directly to a file, so you can easily share or archive your results.

It's designed to work with data collected by other parts of the backtest-kit framework, pulling in information about highest profit events to give you a clear picture of performance.

## Class HighestProfitReportService

The HighestProfitReportService is designed to track and record the moments when a trading strategy achieves its highest profit. It essentially listens for signals indicating a new highest profit has been reached and then saves that information.

This service uses a `loggerService` and `tick` object to manage its operations. When a new highest profit event occurs, it creates a record containing details like the timestamp, symbol, strategy name, exchange, frame, and backtest information, as well as signal details, position size, current price, and the take profit and stop loss levels.

To start recording these events, you'll need to use the `subscribe` method.  It ensures that you only subscribe once, preventing redundant data collection and returning a function that will stop the subscription. Conversely, `unsubscribe` will stop the recording process by detaching from the profit signals.

## Class HighestProfitMarkdownService

This service is designed to create and save reports detailing the highest profit achieved for different trading setups. It listens for incoming data about trading performance, organizing it by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these data events, and the system ensures you won't be subscribed multiple times. Unsubscribing will completely stop the process and clear all stored information.

The service provides methods to retrieve the accumulated data, generate formatted reports in Markdown, and save those reports to disk. You can specify the symbol, strategy, exchange, and timeframe for which you want to see the results, and you can also control which columns are included in the report.

Finally, there's a way to clear the stored data, either for a specific trading setup or for all setups entirely, effectively resetting the tracking for that combination.

## Class HeatUtils

HeatUtils is a helper class designed to make it easier to analyze and visualize your portfolio's performance using heatmaps. It's like a central hub for getting and creating these visual reports. 

It automatically gathers performance statistics for each symbol used within a strategy, compiling them into a comprehensive view. 

You can use `getData` to retrieve raw statistics; think of it as getting the underlying numbers for your heatmap. `getReport` transforms those numbers into a nicely formatted markdown table summarizing key performance indicators like total profit, Sharpe ratio, and maximum drawdown, sorted by profit. Finally, `dump` lets you save that markdown report directly to a file on your computer, making it easy to share or archive your results. This class acts as a single point of access, making your workflow simpler and more organized.

## Class HeatReportService

This service focuses on tracking and recording closed trading signals to create a heatmap analysis of your portfolio's performance. It listens for signals, but only cares about those that have already closed and have profit/loss (PNL) data associated with them. 

The service connects to a signal emitter to receive these closed signal events and writes the data to a database.

To get started, you subscribe to the signal emitter – and it's designed to prevent you from subscribing multiple times. When you're done, you need to unsubscribe to stop the service from receiving and processing signals. The `tick` property is the core of the processing, handling the events as they come in. A logger service helps with debugging.

## Class HeatMarkdownService

The Heatmap service helps you visualize and understand how your trading strategies are performing. It listens for trading signals and collects data about each trade, organizing it by strategy, exchange, and timeframe.

Think of it as a central hub for understanding your portfolio's health across all your active strategies.

It generates easy-to-read markdown reports summarizing key metrics like total profit/loss, Sharpe ratio, and maximum drawdown, both for individual assets and for your entire portfolio. The data is stored in a way that avoids redundant calculations, making the process efficient.

You can subscribe to receive updates as new trades happen, and unsubscribe when you no longer need the information. When you’re done, you can clear all the data to reset the system. You can also clear specific combinations of exchange, frame, and backtest mode if you only want to reset part of your data. The service is designed to handle potential errors in calculations, preventing crashes and ensuring the report is always valid. 

It can also write these reports directly to disk as markdown files.

## Class FrameValidationService

The FrameValidationService helps you keep track of your different trading timeframes and make sure they're set up correctly. Think of it as a central place to register and check if your timeframe configurations are valid before you start trading. It's designed to be efficient by remembering the results of its checks, so it doesn't have to repeat work unnecessarily.

You can add new timeframes using the `addFrame` function, and `validate` lets you confirm a timeframe exists before you attempt to use it. 

Need a quick overview of all your registered timeframes? The `list` function provides a simple way to get a list of them. It uses a logger service to handle internal messages, and maintains a map of frames internally.

## Class FrameSchemaService

The FrameSchemaService helps keep track of different frame schemas, acting as a central place to store and manage them. It uses a specialized registry to ensure the schemas are stored in a type-safe way.

You add new schemas using `register()` and retrieve them later using `get()`, identifying each schema by a unique name.

If a schema already exists, you can update it with `override()`, providing only the changes you want to make.

Before a new schema is added, `validateShallow` checks that the basic structure is correct, like ensuring all expected properties exist and are of the expected type. This helps catch errors early on. 

The service also includes internal components for logging and validation, which aren't directly used for managing frame schemas but contribute to the overall functionality.

## Class FrameCoreService

FrameCoreService helps manage and generate timeframes used in backtesting. It's a central service that relies on other services to work, including one for connecting to data sources to get the actual timeframe information. Think of it as the engine that provides the sequence of dates for your backtest to run against, ensuring those dates are accurate and consistent.  It has a built-in logger and uses validation to make sure timeframes are suitable for backtesting.  The `getTimeframe` function is its primary tool, taking a symbol (like "BTCUSD") and a timeframe name (like "1h") and returning an array of dates.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different "frames" of data used in backtesting. Think of it as a smart router that directs requests for frame-specific operations to the correct implementation. 

It automatically determines which frame to use based on the current context, and it cleverly caches those frame implementations to speed things up. This caching prevents the creation of redundant instances.

The service also handles the nuances of backtest timeframes, defining the start and end dates, and the interval between data points. 

The `clear` function is a crucial part of keeping backtests accurate. It resets the cached frames, ensuring that subsequent runs use fresh timeframe data, which is especially important for long-running backtests. 

Finally, `getTimeframe` allows you to specify the date range you want to use for your backtest, limiting the analysis to a specific period.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your exchanges and make sure they're set up correctly before you start trading. It acts like a central hub, storing details about each exchange you're using.

You can add new exchanges to the service using `addExchange()`, providing the exchange's name and configuration details. 

Before any trading actions, you can use `validate()` to confirm that the exchange you're trying to use actually exists and is properly configured. 

To see a complete list of all the exchanges you've registered, call `list()`. 

The service is designed to be efficient, remembering the results of previous validations to avoid unnecessary checks. 

It also incorporates a logger service and uses an internal map to manage exchange configurations.

## Class ExchangeUtils

This class offers helpful tools for working with different cryptocurrency exchanges. It's designed to make common tasks like retrieving data and formatting values simpler and more reliable.

The `_getInstance` property ensures that each exchange has its own dedicated, isolated instance, preventing conflicts.

You can use `getCandles` to get historical price data, with the tool automatically figuring out the start date based on how far back you need the data. `getAveragePrice` calculates the volume-weighted average price, useful for understanding price trends. `getClosePrice` quickly retrieves the last closing price for a specific interval.

`formatQuantity` and `formatPrice` take care of properly formatting amounts and prices to match the specific rules of each exchange.

Need to see the current order book? `getOrderBook` fetches that data for you. Similarly, `getAggregatedTrades` gets a list of trades, and `getRawCandles` allows you to retrieve candles with a wide range of options, including specifying a particular start and end time. It also intelligently handles time-based calculations to avoid potential bias.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different exchanges, ensuring consistency and correctness. It uses a special system to store this data in a way that prevents errors.

You can add new exchange details using `addExchange()` or retrieve existing ones by their name. 

The service checks new exchange details to make sure they have the essential information before adding them to the system. 

If you need to update an existing exchange’s information, you can use the `override` function, which allows you to change only specific parts of the details.

To get the details of an exchange, use the `get` function, providing the exchange's name.


## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that each operation considers the current trading context like the symbol, time, and whether it's a backtest or live trade. It essentially combines connection to the exchange with information about the simulation or live environment.

This service provides methods to retrieve historical and future candle data, calculate average prices, and obtain order book information. 

It also includes utilities for formatting prices and quantities, taking into account the specific context of the trade.

Validation is built-in and is cached to improve efficiency.

The service offers flexible options when fetching raw candle data, including specifying date ranges and limits. All operations are designed to inject information relevant to the execution context, allowing exchange implementations to adapt their behavior accordingly.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently directs requests to the correct exchange implementation based on the currently active exchange.

Think of it as a smart router that automatically handles the specifics of each exchange so you don’t have to. It remembers previously used exchanges to improve performance.

Here's what you can do with it:

*   **Fetch historical and future candle data:** Retrieve past price movements (`getCandles`, `getNextCandles`) or get the price based on current timeframe (`getAveragePrice`, `getClosePrice`).
*   **Format data for exchanges:** Ensure prices and quantities are correctly formatted according to the rules of the specific exchange you’re using (`formatPrice`, `formatQuantity`).
*   **Access order books and trades:** Retrieve order book data (`getOrderBook`) or aggregated trade history (`getAggregatedTrades`).
*   **Retrieve raw candle data:** Fetch candles with flexible date and limit parameters (`getRawCandles`).

The service handles the complexities of each exchange behind the scenes, ensuring your backtesting and trading operations work smoothly. It adapts its behavior based on whether you’re running a backtest or trading live.

## Class DumpAdapter

The DumpAdapter helps you save data generated during your backtesting process, like messages, records, and tables. It acts as a middleman, allowing you to easily switch where this data is stored—whether it’s in markdown files, memory, or even just discarded. 

Before you start dumping data, you need to activate the adapter using `enable()`, which sets up subscriptions to signal lifecycle events. Don't forget to deactivate it later with `disable()`.

You have several methods to persist different types of data: `dumpAgentAnswer` for full message histories, `dumpRecord` for simple key-value pairs, `dumpTable` for tabular data, `dumpText` for raw text, `dumpError` for error descriptions, and `dumpJson` for complex objects.

You can control where the data goes using functions like `useMarkdown` (default, writes to markdown files), `useMemory` (stores in memory), `useDummy` (discards the data), and `useDumpAdapter` (allows custom storage implementations).  `useMarkdownMemoryBoth` lets you write to both markdown and memory at the same time.

If your base path changes during testing, calling `clear()` will clear the cached instances and ensure the adapter uses the new path.

## Class CronUtils

This utility class, `CronUtils`, helps schedule tasks to run at specific times related to trading activity, especially within backtesting environments. It's designed to coordinate these tasks across multiple parallel backtests, ensuring each task runs only once per time boundary.

Think of it as a central coordinator for your scheduled tasks. It uses a system of "entry generations" to avoid conflicts when tasks are re-registered, and it keeps track of which tasks have already run.

Here's a breakdown of the key parts:

*   **Registration:** You register your tasks (called "entries") with names and intervals.  You can register a periodic task or a task that should run only once.
*   **Coordination:** When the backtest engine reaches a scheduled time, this class makes sure each task runs only once, even if multiple backtests hit that time simultaneously.  It uses promises to coordinate these executions.
*   **Watermarks:**  It keeps track of when tasks last ran to prevent "dropped boundary" issues, where time skips could cause tasks to be missed. It catches up when the engine jumps over boundaries.
*   **Cleanup:** There are methods to clear completed tasks or completely reset the entire scheduler.

The `Cron` instance is a single point of access for managing these tasks.  The `enable` function connects the scheduler to the backtesting engine's timing system, and `disable` disconnects it. The `dispose` function gives you a way to completely clear the scheduler and all its tasks.

## Class ConstantUtils

This class provides pre-calculated values to help manage take-profit and stop-loss levels, designed around a Kelly Criterion approach with a focus on managing risk. The values are percentages of the total distance between your initial entry point and your ultimate profit or loss targets.

Think of it as a tiered approach to profit taking and loss mitigation.

For example, if you’re aiming for a 10% profit, these levels help you progressively secure gains:

*   TP_LEVEL1 triggers at 3% profit, letting you lock in a small win.
*   TP_LEVEL2 triggers at 6% profit, securing a larger portion of potential gains.
*   TP_LEVEL3 triggers at 9% profit, exiting almost the entire position.

Similarly, for stop-loss management:

*   SL_LEVEL1 at 40% triggers a warning sign, reducing your exposure if the trade isn't working out.
*   SL_LEVEL2 at 80% ensures you exit most of the position before a major loss.

These constants offer a way to automate and refine your risk management strategy.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your backtest configurations are mathematically sound and have a chance of being profitable. It acts as a safeguard, preventing settings that would lead to losses.

It checks a wide range of parameters, including percentage-based values like slippage and fees – these need to be positive.  Crucially, it verifies that your minimum take-profit distance is large enough to cover all associated costs like slippage and fees, ensuring trades can actually be profitable when the take profit is reached.

The service also enforces rules on the relationships between parameters, like ensuring minimum and maximum values are set up correctly. Time-related settings and candle parameters also undergo checks to ensure they’re set with appropriate values. Think of it as a quality control system for your backtest setup, helping you avoid common configuration mistakes.


## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It's designed to catch potential problems before they cause issues later on.

Essentially, this service performs a thorough check on your column definitions, making sure they meet certain requirements. It verifies that each column has the necessary properties like a unique key, a descriptive label, a formatting function, and a visibility function. 

It also confirms that the keys used for each column are unique within their group and that the key and label are actually strings and not empty. By running this validation, you can proactively prevent errors caused by incorrect column definitions.

## Class ClientSweep

The `ClientSweep` is a powerful tool for quickly finding optimal parameters for your trading strategies without repeatedly running full backtests. Think of it as a way to screen a large number of ideas and parameter combinations efficiently.

It works by simulating trading ideas against a predefined grid of points, focusing on parameters like stop-loss levels, take-profit targets, and how long to hold positions. Importantly, it evaluates each idea in isolation, without considering interactions between strategies – swarm ranking is left for later.

Here's how it operates:

*   **Idea Evaluation:** Each trading idea gets a single look at a series of price data (candles), creating a profile showing potential performance characteristics.
*   **Author Ban List:**  A list of authors with consistently poor performance is automatically generated and applied – this helps to filter out unreliable strategies.
*   **Grid Evaluation:**  The system calculates results for each point on the grid based on those profiles, simulating actual trades with realistic constraints like fees and slippage.
*   **Ranking:**  The best performing grid points are identified based on various metrics like Sharpe Ratio and total profit.

The `run` method takes a list of trading ideas and executes this entire process for a given asset. It provides several callbacks at different stages, allowing you to monitor progress and gain insights. Remember that `ClientSweep` is designed to suggest promising parameters; you should always validate these findings with a full backtest using a dedicated backtesting engine.



The `ClientSweep` itself doesn't store any data between runs; each time you call `run`, it's a fresh start.

## Class ClientSizing

This ClientSizing component helps determine how much of an asset your trading strategy should buy or sell. It uses different methods to calculate position sizes, like a simple percentage, the Kelly Criterion, or using Average True Range (ATR) to account for volatility. You can also set limits on the minimum and maximum position size, and a percentage cap on the total position. The system allows you to incorporate custom checks and logging during the sizing process, providing flexibility and transparency. Ultimately, it's a crucial piece in executing your strategy by deciding how much to risk on each trade. 

The `calculate` method performs the actual position sizing calculations, taking into account your strategy's inputs and parameters.

## Class ClientRisk

This class manages risk across multiple trading strategies to prevent exceeding defined limits. It's like a safety net for your portfolio, ensuring no single trade causes a major issue.

It keeps track of active positions across all strategies, creating a shared view of what's happening in the portfolio. This allows for coordinated risk management that accounts for how strategies interact.

The constructor takes parameters to define these limits, like the maximum number of concurrent trades. It uses a map to store active positions, and the keys are constructed from strategy and exchange details.

It provides methods to validate new trading signals (`checkSignal` and `checkSignalAndReserve`).  `checkSignalAndReserve` is a safer way to validate signals, ensuring that a “placeholder” is reserved in the active positions map to prevent multiple strategies from exceeding limits simultaneously.  If a signal fails validation, it's not executed.

The `addSignal` method is called when a trade is opened, and `removeSignal` is called when it's closed, updating the tracked positions. It automatically avoids saving positions to disk during backtesting mode, which increases speed.


## Class ClientFrame

The ClientFrame is responsible for creating the sequences of timestamps that your backtesting process uses to step through historical data. It’s designed to avoid repeatedly generating these timestamps, making the process more efficient. You can customize how far apart these timestamps are, ranging from one minute to a full day. 

It works closely with the core backtesting engine and provides a way to check and record information as it generates these timeframes. 

The `getTimeframe` function is the key method here – it produces the timestamp array for a given trading symbol. This function remembers the results so it doesn’t have to recalculate them unnecessarily.


## Class ClientExchange

This `ClientExchange` acts as a bridge between your backtesting environment and the actual exchange data. It provides essential tools for retrieving historical and future market data, like candle data for different time intervals. You can use it to fetch candles from the past, or look ahead to get data needed for backtesting strategies.

It also offers convenient functions for calculating key metrics such as the Volume Weighted Average Price (VWAP), and formatting price and quantity data according to exchange-specific rules. This helps ensure your trading logic works correctly within the exchange's constraints.

The `ClientExchange` prioritizes preventing look-ahead bias, ensuring your backtests accurately reflect real-world trading conditions. The `getRawCandles` method provides extremely flexible retrieval options, allowing you to specify start and end dates or rely on the execution context for historical data. Finally, it allows retrieval of order book and aggregated trade data.

## Class ClientAction

The `ClientAction` component is designed to manage and execute custom logic within a trading strategy, acting as a bridge between the core framework and your specific needs. It handles the initialization, routing, and cleanup of action handlers, which are pieces of code that respond to different events related to trading signals and order management.

Think of it as a central hub where events like signal updates, profit/loss levels, and order confirmations are received and then passed on to your custom logic. 

Here's a breakdown of what it does:

*   **Initialization and Lifecycle:** It sets up and manages your action handler, ensuring it's initialized only once and properly cleaned up when no longer needed.
*   **Event Routing:** It directs specific events (like new signals, breakeven changes, or order confirmations) to the appropriate functions within your action handler.
*   **Customizable Logic:**  Your action handlers can integrate external services and manage state – things like updating a database, sending notifications via Telegram or Discord, collecting analytics, or managing risk.
*   **Manual Event Handling:** The `scheduleEvent`, `pendingEvent`, and `pingActive` methods provide explicit hooks for more advanced integration, allowing you to connect your custom logic directly to specific lifecycle events.
*   **Order Management:** There are methods specifically for managing orders related to limit orders (`orderSync`) and pending orders (`orderCheck`).

Essentially, `ClientAction` simplifies the process of adding your own custom behavior to a trading strategy by providing a structured and manageable way to handle events and execute logic.


## Class CacheUtils

CacheUtils provides tools for caching the results of your functions, making backtesting more efficient. Think of it as a way to avoid recalculating the same things over and over again.

It's designed to be easy to use, wrapping your functions so they remember previous results based on time intervals.  This is especially helpful for calculations that depend on things like candle data.

You can use `fn` to cache regular functions, and `file` to cache asynchronous functions by saving them to disk.  The file-based caching stores files in a specific directory structure, allowing for persistent storage.

If you need to completely clear the cache for a specific function, you can use `dispose`.

`clear` will erase *all* cached data.

`resetCounter` is there to manage the index when the working directory changes.

## Class BrokerBase

This class, `BrokerBase`, provides a foundation for creating custom integrations with different exchanges. Think of it as a template for connecting your trading strategies to live markets.

It handles a lot of the boilerplate work for you – logging events and implementing the full `IBroker` interface. You’ll mainly extend this class and override specific methods to tell it *how* to interact with a particular exchange.

**Initialization:**

*   `waitForInit()` is your entry point for setting up the connection (like logging in to the exchange) *before* the strategy starts running.  Be careful—this can be a tricky part involving cleanup of old orders.

**Event Handling (Live Trading Only):**

The class provides a series of methods that are triggered during live trading to manage orders and positions:

*   `onOrderOpenCommit`:  Used when you want to place an initial order (entry).
*   `onOrderActiveCheck`:  Used to confirm the order actually went through on the exchange and to check its status.
*   `onOrderScheduleCheck`: Similar to `onOrderActiveCheck` but for orders that are waiting to be triggered.
*   `onSignalActivePing`, `onSignalSchedulePing`, `onSignalIdlePing`: These are informational calls that let you monitor the state of your positions.
*   `onSignalScheduleOpen`: Used when creating a new scheduled order.
*   `onSignalScheduleCancelled`: Used to cancel a scheduled order.
*   `onSignalPendingOpen`: Informs you when a position has been opened.
*   `onSignalPendingClose`:  Informs you when a position has been closed.
*   `onOrderCloseCommit`: Used when closing a position (SL/TP hit or manual close).
*   `onPartialProfitCommit`: Used to perform partial profit closures.
*   `onPartialLossCommit`: Used to perform partial loss closures.
*   `onTrailingStopCommit`: Used for updating trailing stop-loss levels.
*   `onTrailingTakeCommit`: Used for updating trailing take-profit levels.
*   `onBreakevenCommit`: Used to move the stop-loss to breakeven.
*   `onAverageBuyCommit`: Used to add new DCA entries.

These methods all have default implementations, so you only need to override the ones that are relevant to your exchange integration. The class provides automatic logging of all events for debugging and monitoring.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, ensuring safe and controlled order execution. It's like a traffic controller for all the commands your strategy wants to send to the broker.

Think of it as a safety net: if anything goes wrong while trying to place an order, the system rolls back any changes it made.  During backtesting, these order actions are skipped entirely – it's only for simulation purposes.

Here’s a breakdown of how it works:

*   **Registration:** You need to tell the framework which broker adapter you're using via `useBrokerAdapter`.
*   **Activation:**  You then activate the adapter using `enable`. This sets up automatic routing of certain order signals (like opening or closing positions).
*   **Commit Methods:** A lot of functions (`commitOrderOpen`, `commitOrderClose`, `commitOrderCheck`, etc.) handle specific order actions and send them to the broker. These are usually handled automatically, but in some cases (like partial profit or loss adjustments) your strategy code calls them directly.
*   **Safety:** The `commit*` methods have built-in safeguards. If they fail, the system reverts to its previous state.
*   **Backtesting Mode:**  During backtests, these commit methods are ignored.
*   **Ping Signals:** The adapter also handles "ping" signals (commitActivePing, commitSchedulePing, commitIdlePing) which are informational updates to the broker.
*   **Scheduled Orders:**  Special care is taken with scheduled orders; the adapter needs to be sure the order hasn't already been filled before attempting to cancel it.
*   **Disabling:** `disable` stops the automatic signal routing, and `clear` resets the broker instance.



In essence, `BrokerAdapter` standardizes how your trading strategy interacts with different brokers, ensuring reliability and control.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events that have occurred during your trading strategies. It's designed to work with the BreakevenMarkdownService, pulling data from its collected reports.

You can use it to get statistical summaries of breakeven events, like the total number of times they've happened. It also lets you create nicely formatted markdown reports that show you details of each breakeven event, including the symbol, strategy, signal ID, position, entry and breakeven prices, and when it occurred. 

Finally, it provides a simple way to save these reports directly to files, making it easy to share or archive your analysis. The reports are organized into files named after the symbol and strategy, for easy identification.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven points. It's designed to listen for these "breakeven" events and record them, along with all the details of the signal that triggered them. Think of it as a digital record of when your trades start to become profitable.

This service stores this information in a database, making it easier to analyze your signal performance over time.

To start tracking, you'll use the `subscribe` function, which connects to the signal emitter. This function also gives you a way to stop that connection later using the returned unsubscribe function. If you've already subscribed, the `unsubscribe` function ensures you gracefully stop receiving and processing breakeven events.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you create and store reports detailing when your trading strategies hit breakeven points. It keeps track of these events as they happen, organizing them by the asset traded (symbol), the trading strategy used, and the specific trading conditions.

This service automatically generates nicely formatted markdown tables summarizing these breakeven events, and also provides overall statistics like the total number of times breakeven was reached. The reports are saved to files on your computer, making it easy to review and analyze your trading performance.

You can subscribe to receive updates when new breakeven events occur, and unsubscribe when you no longer need those updates. The service also allows you to retrieve detailed data, generate full reports, and clear out the accumulated data when it’s no longer needed, giving you flexibility in how you manage your breakeven information. It ensures that each trading setup (symbol, strategy, exchange, timeframe, and backtest status) has its own isolated data storage.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central point for managing breakeven calculations within the system. It's designed to be injected into the ClientStrategy, providing a single access point for breakeven-related operations.

Think of it as a middleman – it receives requests, logs them for monitoring purposes, and then passes them on to the BreakevenConnectionService to handle the actual calculations. 

It relies on several other services, like a logger and connection service, which are provided by the dependency injection container. It also validates strategy and risk configurations to ensure everything is set up correctly.

The `validate` function efficiently checks these configurations and avoids unnecessary repetition.  The `check` function determines if breakeven conditions are met, initiating the process and logging events. Finally, the `clear` function resets the breakeven state when a trade closes.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and provides breakeven tracking functionality. It's designed to create and handle ClientBreakeven instances, which are responsible for calculating and managing breakeven points for specific signals.

Essentially, it acts as a central place to get and manage these ClientBreakeven objects, ensuring you don't create unnecessary ones. This service keeps track of ClientBreakeven instances, using a system that remembers them to avoid repeated creation. It also cleans up these instances when signals are no longer active.

The `getBreakeven` function provides access to these memoized instances, and `check` and `clear` methods pass along actions to the individual ClientBreakeven objects while managing their lifecycle. This system is integrated with other services, receiving configuration and reporting events. It uses a key system like "signalId:backtest" to identify which ClientBreakeven instance it's dealing with.

## Class BacktestUtils

The BacktestUtils class provides helpful tools for running backtests within the trading framework. It simplifies the process of executing backtests and retrieving information about them.

You can use the `run` method to start a backtest for a specific symbol, automatically logging results. Alternatively, `background` lets you run a backtest silently in the background.

Several methods provide insights into a position's status during a backtest. These include methods like `getTotalPercentClosed`, `getTotalCostClosed`, and `getBreakeven` for understanding the position's financial state.

Other helpful functions allow you to retrieve pending or scheduled signals, check for their existence (`hasNoPendingSignal`, `hasNoScheduledSignal`), and get details like the effective entry price or the number of units held.

The utility offers functions for manipulating and examining signals, such as `commitAverageBuy` to simulate additional DCA entries.  You can also use methods like `commitClosePending` and `commitCancelScheduled` for more direct control over backtest actions.

Finally, functions like `getReport` and `dump` provide ways to summarize and save backtest results for further analysis.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It’s like a meticulous observer, tracking every signal event – when a signal is idle, opened, active, or closed. It does this by listening for events from the backtest and saving all the details to a SQLite database.

You can think of it as automatically creating a logbook for your backtesting experiments, making it easier to analyze your strategies and debug any issues.

To use it, you'll need to subscribe to the signal emitter to start recording. The `subscribe` function handles making sure you don’t accidentally subscribe multiple times. Don’t forget to unsubscribe when you’re done, which is done with the `unsubscribe` function. The service also uses a logger to help you keep an eye on what it's doing.

## Class BacktestMarkdownService

The BacktestMarkdownService is designed to help you automatically generate reports during backtesting. It keeps track of how your trading strategies perform by recording information about closed trades.

It works by listening for trading events—specifically, when a trade closes—and storing those details. This service then transforms this data into nicely formatted markdown tables, allowing for easy review and analysis of your backtest results.

You can customize the reports, specifying which data points to include.  The reports are saved as files on your computer, making it easy to share or archive them. 

The service also offers options to clear the accumulated data, either for a specific strategy or all strategies, and to subscribe or unsubscribe from the backtest events. The `getStorage` property manages how data is stored to keep things organized across different strategies and symbols.


## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests, making it easier to manage the environment your trading strategies operate in. It builds on top of the BacktestLogicPrivateService and automatically handles important information like the strategy name, exchange, and frame being used, so you don't have to pass those details repeatedly.

It’s equipped with services for logging, managing time, understanding data structures (schemas), and connecting to exchanges.

The core function is `run`, which lets you execute a backtest for a specific symbol. It efficiently streams results, like trade signals (opened, closed, cancelled), as an asynchronous generator, streamlining the process of analyzing your backtest results. This method automatically injects the necessary context information into the backtest process, simplifying the overall workflow.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the process of running backtests, particularly focusing on efficiency. It works by first retrieving timeframes, then stepping through them one by one. When a signal to trade appears, it fetches the necessary historical data and executes the backtest logic.  The service intelligently skips over timeframes until a trade is closed.

A key benefit is that it streams the results as they are calculated, rather than building up a large array in memory. This makes it much more efficient, especially for long backtests.  You can also stop the backtest early if needed.

To run a backtest, you provide the symbol you want to test, and the service will return a generator that yields results detailing strategy ticks – these can be signals to open, close, or cancel trades. This allows you to process results incrementally. The service relies on other core services, including those for strategy execution, exchange interaction, timeframe management, and time and price data.

## Class BacktestCommandService

The BacktestCommandService acts as a central point for accessing backtesting features within the system. It simplifies how these features are accessed, particularly when using dependency injection. 

Think of it as a helpful layer on top of the core backtesting logic, making it easier to integrate into different parts of the application.

Several services it relies on are logging, schema management, risk and action validation, and the core backtest logic itself. It also handles strategy and exchange validation.

A key feature is the ability to validate strategy configurations, remembering past validations to improve efficiency.

Finally, the `run` function is the main method for executing a backtest simulation, taking a symbol and context (like strategy, exchange, and frame names) as input and delivering results step-by-step.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers – those pieces of code that respond to specific actions in your system. It’s like a central manager that makes sure each action handler is properly registered and exists before it's used.

Think of it as a safety net – it prevents errors by verifying that an action handler is available when needed. It also remembers which handlers have been validated, so it doesn't have to check them again and again, making things faster.

Here's what you can do with it:

*   **Register handlers:** You can use `addAction` to add new action handlers to the service's registry.
*   **Verify existence:** The `validate` function confirms a handler exists.
*   **See the list:** `list` will show you all the action handlers currently registered.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of and manage the definitions for actions within your application. Think of it as a central place to ensure all your actions are structured correctly and behave as expected. It uses a system for type-safe storage, making it less prone to errors.

You can register new actions with the service, and it will automatically check that the action's structure and method names are valid. It also allows you to modify existing action definitions without having to completely recreate them.

The service provides a way to get the full configuration of an action when you need it, ensuring that actions are used consistently throughout your application. It helps guarantee that only approved methods are used, and allows for private methods to exist without exposing them publicly.

## Class ActionProxy

The `ActionProxy` acts as a safety net when you’re using custom code (like actions) within your trading strategy. It essentially wraps your user-provided functions so that if an error happens within that code, it doesn't bring down the entire trading system.

Think of it as a protective layer. It catches any errors that occur during initialization (`init`), signal generation (`signal`, `signalLive`, `signalBacktest`), and other lifecycle events like profit/loss adjustments, scheduled events, and risk rejections. Instead of crashing, it logs the error and keeps things running.

It’s important to note that there are some specific methods, `orderSync` and `orderCheck`, that intentionally *don’t* use this error-capturing wrapper because they need to directly communicate errors elsewhere in the system.

The `fromInstance` method is the only way to create an `ActionProxy`; it takes your action handler and wraps it in this protective layer. This ensures consistent error handling throughout your trading strategy. It’s like a factory that guarantees everything is handled safely. Basically, it shields your core trading logic from potential problems within your custom actions.

## Class ActionCoreService

The `ActionCoreService` is a central component responsible for managing and executing actions within a trading strategy. It acts as a dispatcher, taking action lists defined in strategy schemas and triggering corresponding handlers for each action.

Here’s a breakdown of its key functions:

*   **Initialization:** `initFn` prepares each action by retrieving its list from the strategy's schema and running a special initialization handler, often loading persisted data.
*   **Event Routing:** It has numerous methods (like `signal`, `signalLive`, `signalBacktest`, etc.) that route different types of events—tick results, breakeven notifications, ping events, lifecycle events, and order synchronization—to the appropriate actions within a strategy.
*   **Validation:** `validate` checks the strategy context (strategy name, exchange, frame) and associated configurations, caching the results to avoid repeated checks.
*   **Cleanup:** `dispose` cleans up actions when the strategy execution ends by invoking a disposal handler for each action.
*   **Data Clearing:**  `clear` provides a way to remove action data, either for a specific action instance or globally across all strategies.
*   **Order Handling:** `orderSync` and `orderCheck` control the sequencing of orders across all actions, ensuring coordinated behavior.



Essentially, it provides a consistent and organized way to handle actions across different strategies and contexts, managing initialization, event processing, validation, and cleanup.

## Class ActionConnectionService

The ActionConnectionService acts as a central router, directing different events to the correct action handlers within your trading strategy. It receives requests like signals, breakeven notifications, or order updates and makes sure they reach the intended action implementation. To improve performance, it remembers recently used action implementations (memoization), so it doesn't have to recreate them every time.

Think of it as a traffic controller for actions, ensuring the right event goes to the right place while being efficient with resources.

Here's a breakdown of what it does:

*   **Action Routing:** It determines which action should handle a specific event based on parameters like action name, strategy, and frame.
*   **Memoization:** It caches action instances to avoid repeatedly creating them, leading to speedier execution.
*   **Event Handling:** It provides methods for routing various events, including signals, order updates, and lifecycle events.
*   **Disposal:** It allows you to clear and release cached action instances when they are no longer needed.
*   **Initialization:**  It handles the initial setup of action instances, including loading any necessary persisted data.

The service relies on other services like a logger, schema service, and strategy core. It offers methods to handle different types of events, ensuring proper routing and efficiency. The `getAction` method is key as it provides the actual ClientAction instance needed for each event.

## Class ActionBase

This base class, `ActionBase`, provides a foundation for creating custom handlers that extend the core trading framework. Think of it as a starting point for adding your own logic for things like sending notifications, logging events, or managing data. It handles a lot of the groundwork for you, including automatic logging and providing access to strategy information.

You can extend this class to create custom behavior for your trading strategies - for example, sending alerts to a Discord server when a signal is triggered or logging detailed performance metrics.  It implements a standard interface (`IPublicAction`), ensuring compatibility with the rest of the framework.

Here's a breakdown of what happens:

1.  **Initialization:** When the strategy starts, the `init()` method is called to set up any resources your handler might need, like connecting to a database or API.
2.  **Event Handling:** Throughout the strategy’s execution, various event methods like `signal()`, `breakevenAvailable()`, and `partialProfitAvailable()` are called. These events represent significant moments in the trading process.  There are different versions for live and backtest modes (`signalLive()`, `signalBacktest()`).
3.  **Lifecycle:**  The `dispose()` method is called when the strategy finishes, giving you a chance to clean up anything you created in the `init()` method.

The framework provides default logging for all events, simplifying debugging and monitoring. You can override the default methods to customize how these events are handled, but be aware that explicitly defining `orderSync` or `orderCheck` will trigger a warning.  Focus on using `Broker.useBrokerAdapter` instead.
