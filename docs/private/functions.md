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

This function lets you store data in a persistent memory location, which is really helpful for remembering things between different steps of your trading strategy. You'll need to provide a name for the memory "bucket," a unique identifier for this specific memory slot, the actual data you want to store (which can be any object), and a brief description to help you understand what's in there later.  It automatically handles things like figuring out whether you're running a backtest or a live trade, so you don't have to worry about those details. Think of it like creating a labeled file where your trading logic can save and retrieve information.


## Function warmCandles

This function helps prepare your backtesting environment by proactively downloading and storing historical price data, also known as candles. Think of it as a way to load up the necessary information before you start running tests. It pulls candle data – which represents open, high, low, and close prices for a specific time interval – from a specified starting date (`from`) to an ending date (`to`). This caching process makes backtesting faster and more efficient because you don’t have to repeatedly download the same data each time you run a simulation. You provide the dates you want to cover, and the function takes care of fetching and storing those candles.


## Function waitForReady

This function helps ensure that all necessary components are fully loaded and ready before you start trading, whether you're doing a backtest or live trading. It waits patiently, checking the registries for exchanges, strategies, and historical data (frames if you're backtesting) until they are populated.

The waiting process takes about a second per check, and it won't go on forever – there's a timeout limit.

If everything is ready, the function completes its task silently. However, if the registries don't fill up within the timeout, it moves on, and you’ll likely encounter an error later when trying to actually trade.  This allows your application to handle those errors more gracefully, providing clearer messages to the user.

You can tell it whether you are performing a backtest or live trading; backtesting requires all three types of registries to be available.

## Function validate

This function, `validate`, helps ensure your trading setup is correctly configured before you start running tests. It checks that all the entities you're using – like exchanges, strategies, and sizing methods – are properly registered within the system. 

You can tell it which entities to check, or, if you leave it empty, it will verify *everything*. This is great for a thorough checkup. 

Think of it as a safety net; running `validate` before a backtest or optimization can prevent errors caused by missing or misconfigured entities. It’s a quick way to catch potential problems early on.


## Function stopStrategy

This function allows you to halt a trading strategy's signal generation for a specific trading pair.

Essentially, it pauses the strategy from creating new buy or sell signals. Any existing open signals will still finish their lifecycle. The framework will handle stopping the strategy gracefully, whether it's in a backtesting or live trading environment, waiting for a suitable moment to pause without interruption. You simply provide the symbol of the trading pair you want to stop the strategy for.

## Function shutdown

This function provides a way to safely end a backtest run. It triggers a signal that lets all parts of your backtest know it’s time to wrap up and clean up any resources they’re using. Think of it as a polite way to tell everything to finish what they're doing before the program closes. It’s especially useful when you need to respond to signals like pressing Ctrl+C to stop the testing.

## Function setStrategyPaused

You can temporarily stop a trading strategy from opening new positions using this function. Think of it as putting the strategy on hold. 

While it's paused, the system won’t process new trading signals, but any existing orders will still be managed and closed as usual. This paused state is saved, so it remains active even if the system restarts. 

To reactivate the strategy, simply call the function again with `false` for the paused state. The system will then resume processing signals and opening new positions. The function automatically adapts to whether you’re running a backtest or a live trading environment.

You provide the symbol of the trading pair (like BTC-USDT) and a boolean value indicating whether to pause (`true`) or resume (`false`).


## Function setSignalState

This function allows you to update and manage the state associated with a specific trading signal. It's designed to work within the backtest-kit framework, automatically adapting to whether you're in a backtesting or live trading environment.

It expects a trading symbol, a way to dispatch the update, and data describing the initial state value you want to store.

A key feature is that it automatically finds the currently active trading signal (either one that's pending or scheduled).  If no active signal is found, the function will raise an error.

This function is particularly helpful for complex trading strategies – imagine systems using AI to track performance metrics on each trade, like how far the price moved from the entry point, and how long a trade has been open. The aim is to manage these metrics reliably across various trades and conditions. 

It's specifically built to handle situations where trades might have drawdowns (losses) of 0.5% to 2.5%, but aim for profits of 2% to 3% or more. Some strategies might focus on shorter trades with very limited price movement.


## Function setSessionData

This function lets you store data that sticks around during a backtest or live trading session. Think of it as a place to hold information that needs to be remembered between candles, like the results of a complex calculation or the state of an indicator. The data is specifically tied to the trading symbol, strategy, exchange, and the timeframe you're using. 

You can clear out this stored data by passing `null` as the value. The framework automatically knows whether it's running a backtest or a live session, so you don't have to worry about configuring that.

It's useful for caching things like LLM inference results or keeping track of intermediate calculation states. 

Parameters:

*   `symbol`: The trading pair you’re working with (e.g., "BTCUSDT").
*   `value`:  The data you want to store, or `null` to erase the existing data.

## Function setLogger

You can customize how backtest-kit reports its internal activity by providing your own logging mechanism. This lets you direct log messages to your preferred destination, like a file, a database, or a dedicated logging service. The framework automatically adds useful context to each log message, such as the strategy name, exchange, and symbol being traded, so you get detailed information about what's happening behind the scenes. Simply provide an object that conforms to the `ILogger` interface to this function, and the framework will handle the rest.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the engine before you start testing.

You can provide a configuration object with the settings you want to change; it doesn't need to be the entire configuration, just the parts you want to modify.

There's also an "unsafe" flag; use this carefully, mostly when you're running tests where you need to bypass some of the standard checks.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports, like those generated for markdown. You can adjust the settings of existing columns or even add new ones to tailor the report to your specific needs. It's designed to be flexible, allowing you to override the default column definitions.  For most cases, the function validates your changes to make sure they're structurally sound. However, if you're working in a testing environment where stricter validation isn't needed, you can bypass this validation process.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored as "memories" based on a text search. It's like searching a database but specifically designed for finding information linked to your trading signals. 

It takes a search query and a bucket name (which identifies where the memories are stored). 

The function uses a powerful search algorithm (BM25) to rank the memories by how well they match your query, returning a list of matching memories along with their relevance scores. 

Importantly, it knows whether you're in a backtesting or live trading environment, and it can automatically find the currently active signal without you needing to specify it.  The data it returns includes the memory's unique identifier, its score, and the actual data stored within the memory. You can customize the type of data stored within the memory by specifying a generic type when calling the function.


## Function runInMockContext

This function lets you execute code as if it were running within a trading strategy, but without actually needing a full backtest or live environment. Think of it as a sandbox for testing or experimenting with functions that rely on context like the current time or trading symbol. You can provide specific details like the exchange, strategy, or symbol you want to mimic, but if you don't, it will default to a simple, live-like setup.

Essentially, it allows you to isolate and test code dependent on the trading context, giving you flexibility when you don't need a complete backtest.

Here's what you can provide:

*   exchangeName: The name of the exchange.
*   strategyName: The name of the strategy.
*   frameName: The name of the timeframe.
*   symbol: The trading symbol.
*   backtest: Whether you're simulating a backtest or live trading.
*   when: The specific time you want to simulate.

If you don't provide these, it'll use placeholder values for a basic live environment.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data. 

It takes two pieces of information: the name of the "bucket" where the memory is stored and a unique identifier for the memory itself. 

The framework intelligently handles the process, figuring out whether you're running a test or live trading and taking care of resolving any pending signals that might be affected. Essentially, it simplifies the process of removing historical data and ensures a smooth workflow.

## Function readMemory

The `readMemory` function lets you retrieve data stored in a specific memory location within your trading system. Think of it like fetching a saved variable. 

It requires you to provide the name of the memory "bucket" and a unique identifier for the memory you want to access.

This function is designed to work seamlessly whether you're in backtesting mode or live trading, and it automatically handles the current signal context for you. 

It returns the data as a TypeScript object, with the type defined when you call the function.

## Function overrideWalkerSchema

This function lets you modify an existing strategy’s walker configuration – think of it as fine-tuning a pre-built setup. It's useful when you want to change specific aspects of how a strategy explores data for backtesting, without completely rebuilding the entire walker. You provide only the changes you want to make, and the function merges them with the original walker's settings, keeping everything else as it was. It’s a way to experiment with different configurations for comparison purposes. 

The function takes a partial walker configuration as input, representing the changes you want to apply. The updated walker configuration is then returned as a promise.


## Function overrideSweepSchema

This function lets you modify an existing sweep configuration within the backtest-kit framework. Think of it as a way to tweak a pre-defined trading setup without having to recreate it entirely.  You can selectively update certain parts of the sweep’s settings, leaving the rest untouched. Keep in mind that the framework caches sweep configurations, so changes might only affect new sweep instances unless you clear the cache. This function receives a partial sweep configuration as input and returns a promise resolving to the updated sweep schema.

## Function overrideStrategySchema

This function lets you modify existing trading strategies within the backtest-kit framework. Think of it as a way to adjust a strategy’s settings without having to recreate it from scratch.

You provide a partial configuration – just the settings you want to change – and it updates the original strategy, leaving everything else untouched. This is useful for making incremental changes or adjustments to strategies as you refine your testing process. It’s particularly helpful for dynamically altering strategy behavior during backtesting.


## Function overrideSizingSchema

This function lets you adjust how your trading positions are sized within the backtest-kit framework. Think of it as fine-tuning an existing sizing strategy.

It doesn't replace the whole sizing configuration, but rather allows you to modify specific parts of it.  Only the settings you provide will be changed; everything else stays as it was before.

You pass in an object containing just the settings you want to update, and the function returns the modified sizing schema. This is useful for making incremental adjustments to your sizing logic without rewriting the entire configuration.


## Function overrideRiskSchema

This function lets you modify a risk management setup that's already in place within the backtest-kit framework. Think of it as a targeted update – you specify only the parts of the risk configuration you want to change, and the rest stays as it was. It’s useful when you need to tweak certain aspects of your risk controls without completely redefining the entire setup. The function returns a promise resolving to the updated risk schema. You provide a partial configuration object to represent the changes you want to apply.

## Function overrideMCPSchema

This function lets you modify an existing MCP (Model Context Protocol) setup within the backtest-kit framework. Think of it as a way to tweak a configuration without completely rebuilding it. You provide a partial configuration – just the parts you want to change – and the function updates the existing MCP, leaving everything else untouched. This is useful when you need to adjust specific aspects of your model context protocol on the fly.

## Function overrideFrameSchema

This function lets you modify an existing timeframe configuration used in your backtests. Think of it as a way to tweak a timeframe's settings without rebuilding it from scratch. You provide a partial configuration – just the parts you want to change – and the function updates the existing timeframe, leaving everything else untouched. This is useful when you need to adjust a timeframe's settings based on specific conditions or optimizations.


## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. Think of it as a way to tweak a previously set-up exchange without completely rebuilding it. You can selectively update certain parts of the exchange's configuration – only the pieces you specify will change; everything else stays as it was. It takes a partial exchange configuration object as input.

## Function overrideActionSchema

This function lets you tweak how an action handler works without completely replacing it. Think of it as making small adjustments to existing event handling configurations. You can use it to change things like the functions that respond to events, adapt them for different testing environments, or even swap out entire handler implementations on the fly. It's a great way to modify behavior without needing to change your core strategy. Just provide a partial configuration – only the parts you want to update will be changed, while everything else stays the same.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It gives you updates after each strategy finishes running within the backtest.

You provide a function that gets called whenever an update is available. 

The updates are delivered one at a time, even if your provided function takes some time to process. This ensures things run in order and don't get out of sync.

Importantly, it uses a queuing system to handle these updates, so your callback function isn’t overwhelmed or runs at unexpected times. This function also returns an unsubscribe function, so you can easily stop listening to these updates when you no longer need them.


## Function listenWalkerOnce

This function lets you temporarily watch for specific changes happening within a data walker. You provide a rule – a filter – to define what kind of changes you’re interested in.  Then, you give it a function to run when that specific change happens.  Importantly, once the matching change occurs, the function automatically stops watching, so you don't have to worry about cleaning up. It’s great when you need to react to a single event and then move on.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes.

It's like setting up a listener that gets triggered when all your trading strategies have been tested.

Importantly, it handles events in the order they arrive, and makes sure your code doesn't run simultaneously to prevent unexpected issues. 

You provide a function that gets executed when the backtest is complete, and this function returns another function which can be called to unsubscribe from the event.


## Function listenWalker

The `listenWalker` function lets you track the progress of your trading strategies as they run within a backtest. It's designed to receive updates after each strategy has finished executing. 

Because it prioritizes order, events arrive in the sequence they were generated, even if your callback function takes some time to complete. To ensure smooth operation, it uses a queuing system to manage these events and prevent any potential conflicts. You provide a function that will be called with the event details to receive these updates. The function will return another function that you can use to unsubscribe from the listener.

## Function listenValidation

This function lets you keep an eye on any problems that pop up when the system is checking for risks. Whenever a validation error occurs during this process, it will call a function you provide.

It's particularly helpful for spotting and fixing issues related to risk validation.

Importantly, these error events are handled one at a time, in the order they happen, even if your function takes some time to complete. This ensures a controlled and predictable way of dealing with validation errors. You provide a function that gets called when an error is found.

## Function listenSync

This function lets you monitor and react to events when signals are being synchronized, like when an order is being opened or closed. It's a crucial tool for managing order processing, ensuring that actions are taken in the correct sequence.

Importantly, any errors you throw within the provided callback function have specific meanings:

*   Simple errors or temporary issues trigger automatic retries for opening or closing orders, maintaining a stable identity for each signal. There's a limit to how many times these retries will occur.
*   If an order is rejected, the operation is immediately halted and won't retry.
*   Errors related to order deletion are handled as temporary issues, not critical failures.

The callback you provide will receive an `OrderSyncContract` object detailing the event. If your callback returns a Promise, the signal processing will pause until the promise resolves. The function also returns a function that you can call to unsubscribe from these synchronization events.


## Function listenStrategyCommitPerSignal

This function lets you watch for events related to a trading strategy's actions. Specifically, it's triggered whenever a new signal is generated and a commitment is made. 

The function allows you to specify a filter to only receive notifications for certain events.  It avoids repeated notifications for the same signal, ensuring you only receive the initial commitment for each one. This is helpful if you want to track the first action taken for a particular trading signal. 

You provide a function to decide which events you’re interested in and a callback function that will be executed each time a relevant event occurs. The subscription can be stopped by returning the value from the returned function.


## Function listenStrategyCommitOnce

This function lets you react to specific changes made to a trading strategy, but only once. You tell it what kind of change you're interested in with a filter – like, "only notify me when the strategy's parameters are updated."  Then, you provide a function that will run when that specific change happens.  After that one execution, it automatically stops listening, so you don't have to worry about cleaning up the subscription yourself. This is helpful if you need to perform an action immediately after a certain strategy action occurs and don't want ongoing notifications.

For example, you might use it to update a display showing the latest strategy settings.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a listener that gets notified whenever changes are made, such as a scheduled signal being canceled, a signal being closed, or adjustments to stop-loss or take-profit levels. The events are handled one after another, even if your code takes some time to process them. This helps ensure that things happen in the right order and avoids any unexpected conflicts. You provide a function that will be executed each time one of these events occurs.

## Function listenSignalWaitingPerSignal

This function lets you react to specific events related to orders that are waiting to be filled, but only once per unique signal. Think of it as a way to track when a pending order finally gets a confirmation – but only the *first* confirmation for each order placed. It's particularly useful when you need to know when a waiting order is satisfied, and you don't want to be bombarded with repeated notifications for the same order.

You provide a filter function to decide which waiting order events should trigger your reaction, and a callback function that gets executed when a matching event occurs. The callback receives the details of the waiting order event. This allows you to monitor order confirmations and react accordingly, focusing on the initial fulfillment of each pending order.

## Function listenSignalWaiting

This function lets you monitor what's happening while your trading strategy is waiting for a signal to become active. You'll receive updates for every tick while a signal is pending. Be aware that you'll get a notification for *each* waiting signal on every tick, so it can generate a lot of events if you have many signals. This is useful when you need to react to market movements while waiting for a signal. The function returns a way to unsubscribe from these notifications later on. You provide a function that will be called with details about each waiting tick event.


## Function listenSignalScheduledPerSignal

This function lets you react to scheduled tick results, but only when a new signal is generated, whether it's live or a backtest. You provide a filter to decide which tick results you're interested in, and a function that will be called each time a new signal appears that matches your filter. The function returns an unsubscribe function, which you can use to stop listening when you no longer need it. It’s a way to focus on changes and fresh data related to signals rather than every single tick.


## Function listenSignalScheduled

This function lets you react to signals that are scheduled, meaning they're waiting for a specific price to be reached before they can be executed. It's useful for strategies that don't want to immediately act on a signal but want to wait for a better price.

You provide a function (`fn`) that will be called whenever a new scheduled signal is created. This function receives an object containing details about the signal.

The function you provide returns another function which you can use to unsubscribe from these scheduled signal events. This is important for cleaning up your listeners when they're no longer needed.


## Function listenSignalPerSignal

This function lets you set up a way to react to trading signals, but with a special twist. You can specify a rule (the `filterFn`) to decide which signals you actually want to see. 

Once a signal matches your rule, the function will call your provided function (`fn`) just once for each unique signal ID. It handles the details of skipping repeated signals with the same execution and signal ID, and also ignores idle signals to ensure you always receive events with a valid signal. This makes it a clean way to respond to specific trading opportunities.


## Function listenSignalOpenedPerSignal

This function lets you track when a trading signal is opened, but only for each unique signal. It’s helpful if you want to react to a new trade being initiated without getting spammed with notifications for every tick within that trade.

You provide a filter function to specify which signal openings you’re interested in, and a callback function that will be executed each time a new signal is opened that matches your filter. This allows you to build custom logic that responds to specific trading events. The function returns an unsubscribe function which you can use to stop listening to those signal openings.


## Function listenSignalOpened

This function allows you to be notified whenever a new trading position is opened, whether it's initiated directly or triggered by a scheduled signal. It's a way to react to the start of a trade in real-time or during a backtest. You provide a function that will be called whenever a new position opens, and that function will receive details about the event, like the strategy tick result. The function you provide will return a function that you can call to unsubscribe from these notifications later on.


## Function listenSignalOnce

This function lets you temporarily listen for specific signals coming from your trading strategy. You provide a filter – a rule that defines which signals you're interested in – and a callback function that will be executed only once when a matching signal arrives. After that one execution, the subscription automatically stops, so you don't need to worry about manually unsubscribing.

It's handy when you need to react to a particular event just one time, like waiting for a specific condition to be met before taking action. 

The `filterFn` determines what qualifies as a signal to trigger the callback.
The `fn` is the function that runs with the signal data when it's found.


## Function listenSignalNotifyPerSignal

This function lets you listen for new trading signals, but with a clever feature to avoid being overwhelmed by repeated notifications. You provide a filter to specify which signals you're interested in, and a function to execute when a new, unique signal arrives. Importantly, it automatically ignores duplicate signals based on their ID, so if a strategy repeatedly sends signals for the same position, you'll only receive the notification once. This helps keep your processes clean and efficient when dealing with potentially frequent signal updates.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals, but only once. 

You provide a filter – essentially, rules that define which signals you’re interested in – and a function to execute when a matching signal arrives. 

Once that signal is found and your function runs, the subscription automatically stops, preventing further callbacks for the same filter. It's perfect for situations where you need to respond to a signal just a single time.


## Function listenSignalNotify

This function lets you subscribe to notifications about signals, specifically user-defined notes related to open positions. Whenever a strategy uses the `commitSignalInfo()` function, this system will queue up and deliver that information to your provided callback function. 

The important thing to remember is that these notifications are processed one after another, even if your callback function takes some time to complete – this ensures things happen in the right order. It utilizes a queuing system to prevent multiple callbacks from running at the same time.

You provide a function (`fn`) that will be called each time a signal info event occurs. This function receives information about the signal, packaged as a `SignalInfoContract` object. The function you provide will return an unsubscribe function, so you can stop listening for signal info events when you no longer need it.

## Function listenSignalLiveWaitingPerSignal

This function lets you listen for specific updates during live trading executions, but in a smart way. It focuses on the "waiting" phase – that period when a trade order is resting and hasn't yet been filled.

The key is that it only triggers the callback *once* for each trading signal, even if the order continues to wait for a long time. This prevents being overwhelmed with repeated updates.

It’s designed to work exclusively with live, active trading sessions. Historical backtest data won't trigger anything.

To avoid conflicts when running multiple strategies simultaneously, the deduplication happens based on a unique identifier that combines the strategy, exchange, timeframe, mode and the symbol being traded. This way, different strategies won’t interfere with each other’s signals.

Finally, a filter function lets you specify exactly which events you're interested in, and this filter is checked *before* the deduplication happens, ensuring you don't miss anything.


## Function listenSignalLiveWaiting

This function lets you react to signals that are waiting to be triggered during live trading. It provides updates on the potential entry points before a trade actually begins. 

Think of it as getting previews of upcoming trades – you'll receive information about the signal, and a theoretical profit and loss calculation, while the trade is still pending.

It's a very frequent stream of data, with an event for each tick of each waiting signal.

Crucially, this callback only works with live trading sessions; it won't be triggered during backtests. This makes it a safe place for actions like sending notifications or mirroring orders in a separate system.

You just provide a function that will be called with each of these "waiting" events.


## Function listenSignalLiveScheduledPerSignal

This function lets you react to tick results generated during live trading, but only when those results are scheduled. It ensures you only get notified once for each signal, providing a safety measure against potential duplicates.

It specifically works with live executions, meaning backtests won't trigger this listener.

To prevent interference between different strategies, the filtering and deduplication happens independently for each combination of strategy, exchange, frame, mode, and symbol. The function remembers the last signal it processed and ignores subsequent events with the same identifier.

A predicate function allows you to define which events should be considered, and crucially, this predicate is evaluated *before* the deduplication process, so it can filter out unwanted events without blocking subsequent matches. You provide both the filter and the function to be executed when a matching event occurs. 

The listener returns a function that, when called, will unsubscribe from the scheduled tick results.


## Function listenSignalLiveScheduled

This function lets you set up a listener that gets notified when a strategy initiates a trade based on a scheduled signal – think of it as the very beginning of the process where the system is waiting for the market to hit a target price.

It's specifically designed for live trading scenarios and won't trigger during backtesting, so you can safely use it for actions that interact with the outside world, like sending notifications or mirroring orders.

The callback function you provide will receive a special event containing information about the scheduled signal, and you don’t need to check the event type because it’s already filtered to be that specific signal type. This marks the start of the strategy's wait for the signal to be triggered, not subsequent updates.


## Function listenSignalLivePerSignal

This function lets you tap into the flow of real-time trading signals generated by the backtest-kit framework. You provide a filter—essentially, a rule to decide which signals you're interested in—and a callback function that will be executed whenever a matching signal arrives. Importantly, it only works with signals actively being processed during a "Live.run()" execution, and it ignores signals that represent no activity. Think of it as a way to react to individual signals as they happen, allowing you to build custom logic around each one. The callback will be invoked once for each unique signal identifier.

## Function listenSignalLiveOpenedPerSignal

This function lets you listen for when a trading signal starts a new position during a live trading session. It focuses solely on live executions, so you won't get any notifications from historical backtests.

Essentially, it sends you a notification only the first time a specific trading signal opens a position. 

To prevent unwanted duplicate notifications, it keeps track of the last signal ID it processed for each combination of strategy, exchange, frame, mode, and symbol. This ensures that even if the same signal attempts to open a position again, you'll only get it once.

You can use a filter function to specify exactly which signal openings you want to be notified about. This filter is applied *before* the deduplication process, so any event it rejects will never be remembered, guaranteeing that no later events are blocked. 


## Function listenSignalLiveOpened

This function allows you to react to when a live trading strategy actually begins a position. 

Think of it as a notification that a trade is now actively running and incurring costs. 

It's specifically for live trading sessions—backtesting won’t trigger this—so you can safely use it for things like sending real-time alerts or placing mirroring orders. 

The information provided includes the signal details like entry price and stop-loss/take-profit levels. It streamlines the process by directly delivering opened events, removing the need for additional checks within your callback function.


## Function listenSignalLiveOnce

This function lets you quickly react to a single, specific signal event coming from a live trading simulation. Think of it as setting up a temporary listener that will only fire once when an event matching your criteria arrives. After that one execution, the listener automatically disappears, so you don’t need to worry about cleaning up.

You provide two pieces of information: a filter that tells the system which events you're interested in, and a function to be executed when that matching event occurs. It's a convenient way to grab a piece of information from a live simulation without ongoing subscription.


## Function listenSignalLiveIdle

This function lets you listen for moments when your live trading strategy isn't actively doing anything – meaning it doesn't hold any positions and has no scheduled actions. It’s a way to get notified when the strategy is essentially "idle."

You'll receive a notification on each tick during these periods, providing data like the current price, the trading symbol, and information about the strategy and the exchange it's using.

This is particularly useful for tasks like logging heartbeat signals or setting up notifications to know when the strategy has become inactive. Importantly, it only works with live, running strategies – backtest replays won't trigger these events.

Since the data is specifically focused on the idle state, you can directly access the relevant information without needing to filter based on the action type. Because of this, it’s suitable for actions that might affect the real world, such as sending alerts or mirroring orders.


## Function listenSignalLiveClosedPerSignal

This function lets you react to specific, finalized trading positions as they close during live trading. It ensures you only receive information about a closed position once, acting as a safeguard against accidental duplicates.

Think of it as a way to listen for completed trades, but only during active, live trading sessions – historical backtests won’t trigger this.

You can filter which closed positions you're interested in, and the callback function will be executed for each matching position just once. This allows you to focus on the critical events of closed trades and avoid being overwhelmed with repeated data. 

The filtering happens before the de-duplication process, so you’re guaranteed that no event is skipped because of a duplicate.

## Function listenSignalLiveClosed

This function allows you to be notified whenever a live trading position closes. It's specifically for positions managed by `Live.run()`, so you won't receive these notifications during backtesting.

You’ll get details about *why* the position closed—whether it was due to a take profit, stop loss, time expiry, or a manual close—along with the exact time and the realized profit and loss (including fees and slippage).

Think of it as a final signal; once you receive an event on this channel, that particular signal is done and won't send more events. This makes it safe for actions like sending notifications or mirroring orders. 

You just provide a function that will be called with the closed event data, and the function will return a way to unsubscribe from those events later.


## Function listenSignalLiveCancelledPerSignal

This function lets you monitor when live trading executions are cancelling orders – specifically, when a resting order isn't filled.

It ensures you only receive this information once per signal, preventing redundant notifications.

Importantly, this only works with live executions; it won't trigger during backtests.

The process prioritizes your filter function. Events that don't meet your criteria are immediately discarded and won’t impact future event delivery.

To prevent interference between strategies, it deduplicates events based on strategy, exchange, frame, mode and symbol. The listener tracks the last seen signal ID to avoid repeating events, and your provided function will only be called when a genuinely new signal arrives.


## Function listenSignalLiveCancelled

This function lets you be notified when a live trading signal is cancelled before it becomes a trade. 

Imagine a signal you scheduled, but the market moved too fast or you decided to change your mind – this function tells you about those situations. It's specifically for when trades are cancelled *before* any money is at risk.

You'll get a notification with details about why the signal was cancelled, like if it was a timeout or you manually stopped it. It also provides a cancellation ID if it was user-initiated. 

Important note: this only works with live trades executed by `Live.run()`. You won't see these cancellations during backtesting replays, so it’s safe to use for things like sending notifications or mirroring orders in a real-world system. The information you receive is structured, so you don't need to check the event type before accessing the data.


## Function listenSignalLiveActivePerSignal

This function lets you listen for specific events from live trading executions. It focuses on "active" events, which happen repeatedly while a position is open.

You provide a filter to decide which events you're interested in, and a function that will be called only once for each signal that passes the filter. Think of it as setting up a one-time alert, like “notify me when this trade reaches a 5% profit.”

It’s important to know this works *only* with live trading, not historical backtests. 

The system intelligently avoids repeated notifications for the same signal within a single trade, ensuring you only get the initial event. Each trading strategy is treated independently to prevent interference. Finally, the filter function is checked *before* any duplication checks, ensuring you won't miss any relevant events.

## Function listenSignalLiveActive

This function lets you react to live trading activity in real-time. It provides updates whenever a position is open, giving you access to the current profit and loss, as well as how close the price is to your take-profit and stop-loss levels. 

Think of it as a direct line to what's happening *right now* while your strategies are actively trading. 

It's specifically designed for things you want to do as trades happen – like sending notifications or placing mirroring orders – because it only receives data from live executions, not from backtests. This separation ensures any actions taken are truly happening in the live market. You can immediately use the provided data without needing to check which action triggered the event.


## Function listenSignalLive

This function allows you to set up a listener that receives real-time trading signals generated during a live strategy execution. Think of it as a way to get notified whenever your strategy makes a decision while it's running live.

The listener you provide – a function you pass in – will be called with the details of each trading signal, one at a time, in the order they are generated. 

It's important to note that you'll only receive signals from executions started by `Live.run()`. The function returns another function that you can call to unsubscribe from the listener when you no longer need it.


## Function listenSignalIdle

This function lets you monitor moments when your trading strategy isn't actively managing any positions. It's like getting a notification whenever the strategy is "idle," meaning it's not currently buying or selling anything. 

You provide a function (`fn`) that will be called with details about each idle tick – this includes the current price and information about the strategy and exchange.  The `signal` property within the event will always be null during these idle periods. This is particularly useful for observing behavior when the strategy isn't reacting to any signals.

You can unsubscribe from these idle events by returning the value from the `listenSignalIdle` function call.


## Function listenSignalEventPerSignal

This function lets you listen for events related to individual trading signals. Think of it as setting up a notification system – whenever a new signal appears or changes, a specific action happens.

You can use a filter function to decide which events trigger your notification. For example, you might only want to be notified when a signal is opened, not when it’s closed.

The callback function is then executed for each new signal ID.

It's designed to handle situations where a signal might have multiple events (like an opening and a closing) – preventing redundant notifications. You can filter by the "action" field in the event data to control which events trigger your callback.


## Function listenSignalEventOnce

This function lets you temporarily listen for specific events happening within the trading system. You provide a filter to define which events you're interested in, and a callback function that will be executed just once when a matching event occurs. Once that single event is processed, the listener automatically stops, preventing it from interfering with other operations. This is handy when you need to react to something like an order opening or closing just once and then move on.

The `filterFn` helps you pinpoint the exact events you want to respond to. 

The `fn` is the function that actually does something with the event once it's found. 

It returns a function that you can call to unsubscribe from the event listener manually, although it unsubscribes automatically.


## Function listenSignalEvent

This function lets you keep an eye on when trading signals are created and closed, whether you're running a live trade or testing a strategy in backtest mode. It provides a way to react to signals being opened – triggered by new signals, immediate actions, scheduled events, or even manual user input – and when they're closed due to profit targets, stop-loss orders, or time expirations. The events are handled one after another in the order they arrive, even if your response to them involves asynchronous operations. You provide a function that gets called each time a signal event happens, and this function will be executed for both opening and closing signals. 

Essentially, it's a way to be notified of signal lifecycle changes and react accordingly.


## Function listenSignalClosedPerSignal

This function lets you monitor when trading signals are closed, but it’s specifically designed to give you updates for each unique signal. You provide a filter function to specify which closed signals you’re interested in, and then a callback function that gets executed whenever a matching signal is closed. Think of it as a targeted way to track the final results of individual trading signals, whether you're testing strategies or live trading. This subscription can be cancelled at any time by returning the function.


## Function listenSignalClosed

This function lets you react whenever a trade closes, whether it's a live trade or part of a backtest. 

Essentially, it's a way to be notified when a position is finished and to get details about *why* it closed and when.

You provide a function that will be called each time a trade closes, and that function will receive information like the profit/loss, the reason for the closure, and the exact timestamp.

The function you provide returns another function you can use to unsubscribe from receiving these closed trade notifications later.

## Function listenSignalCancelledPerSignal

This function lets you react to specific cancelled trade signals. Think of it as a way to be notified when a trade is stopped before it even starts, and you can precisely define *which* cancellations you're interested in using a filter.  You provide a function that checks each cancelled signal, and a function that runs whenever a signal matching your criteria is cancelled.  The subscription this creates can be cancelled to stop listening. It's useful for handling scenarios where a signal is invalidated or no longer actionable.


## Function listenSignalCancelled

This function lets you monitor situations where a signal intended for trading doesn’t actually result in a trade being placed. 

Specifically, it alerts you when a signal is cancelled before a position is ever opened. This can happen for various reasons, and the `reason` property of the event provides details about why the cancellation occurred.

By subscribing to these cancelled signal events, you can gain insights into potential issues with your trading logic or signal generation process. It's a way to proactively identify and address problems that might otherwise slip through unnoticed. The subscription returns a function you can call to unsubscribe.

## Function listenSignalBacktestWaitingPerSignal

This function lets you listen for specific events during backtesting, focusing on situations where an order is waiting to be filled. It's designed to only receive information from backtest runs, not live trading.

Imagine you want to track when a particular entry condition is met but the order hasn't been executed yet. This function helps you focus on those "waiting" periods.

It ensures you only get notified once for each signal – the first time the waiting condition is met. It prevents repeated notifications for the same signal, even if the waiting continues.

The notifications are unique to each backtest run, combining strategy, exchange, frame, mode, and symbol, so different strategies won’t interfere with each other.

You provide a filter to decide which waiting events you're interested in; events that don’t pass this filter are ignored, preventing them from suppressing future events. The callback function is executed only when a waiting event matches your filter, and only the first time.

## Function listenSignalBacktestWaiting

This function lets you tap into a special stream of data during backtesting. It provides information about signals that are waiting to be triggered – essentially, signals that haven't activated yet.

You'll receive updates for each tick while a signal is in this waiting period. The information includes details about the signal and a theoretical profit and loss (pnl) calculation – remember, no position is actually open at this stage.

This channel is specifically for backtesting; it won't be active during live trading. It’s perfect for detailed analysis and reporting during backtest runs without getting mixed up with real-time data.

The events are already filtered based on action, so you can directly access the relevant fields without needing extra checks. You provide a function (`fn`) that will be called with each of these waiting events. The function you provide will return a function to unsubscribe.


## Function listenSignalBacktestScheduledPerSignal

This function lets you listen for specific signals generated during backtest runs, ensuring you only receive each signal once. It’s designed to prevent duplicate signal notifications, providing a reliable stream of data for analysis or further processing. 

The callback you provide will be triggered at the moment a signal is created during a backtest, but only for signals that match the filter you define. Importantly, this function only works with backtest data, so you won't get notifications from live trading environments. 

The system intelligently avoids conflicts when running multiple strategies simultaneously, each strategy’s signals are kept separate.  It also remembers which signals it has already processed, preventing repeats and guaranteeing that no signal gets lost or hidden. The filter you provide is evaluated *before* any deduplication happens, so it has the first chance to decide which signals are relevant.

## Function listenSignalBacktestScheduled

This function lets you tap into the backtest process to monitor when a strategy has requested a trade at a specific price. It’s like getting a notification when the system is preparing to potentially enter a position.

Think of it as a signal that the engine is now *waiting* for the market to reach a target price. It’s a one-time notification, marking the beginning of that wait, not the ongoing updates as the market moves closer.

Importantly, this function only works within backtests – you won't receive signals from live trading environments. This makes it ideal for in-depth analysis and generating reports without interference from real-time trading activity.

You provide a function as input, and it will be called whenever a scheduled tick result is available.  The information passed directly to your function is specific to the scheduled event, so you don't need to filter the event type before processing the data.


## Function listenSignalBacktestPerSignal

This function lets you tap into the stream of trading signals generated during a backtest. It's like setting up a listener that gets notified whenever a new signal is produced. 

You specify a filter to decide which signals you're interested in, and then provide a function to execute for each of those signals.

Importantly, it only works during an active backtest run initiated by `Backtest.run()`. Signals indicating no action (null signals) are ignored to keep things clean. The order in which you receive signals is carefully managed to avoid duplicates.


## Function listenSignalBacktestOpenedPerSignal

This function lets you track when a backtest starts a new trade based on a signal. 

It's like setting up a notification system that tells you when a strategy has actually begun to execute a trade during a backtest. 

You provide a filter to specify which signals you're interested in, and then a function to be executed when a matching signal opens a position. 

The notification only happens once for each unique combination of strategy, exchange, timeframe, mode, and symbol, guaranteeing you won't be overwhelmed with repeated alerts for the same trade. The filter you provide is checked *before* this deduplication, so it can always influence whether an event is processed. Because it only works during backtests, you don't need to worry about it triggering during live trading.




It returns a function that you can call to unsubscribe from these notifications.

## Function listenSignalBacktestOpened

This function lets you listen for when a trading position is actually opened during a backtest. 

It’s specifically for backtesting scenarios – you won't get these notifications when trading live. 

Think of it as a way to track when your strategy starts incurring costs, like when a trade is initiated.

The information provided includes details like the entry price and stop-loss/take-profit levels associated with the trade.

You'll receive this notification from `Backtest.run()`, and it’s a clean, focused channel for analyzing backtest results without any interference from real-time trading data.


## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific trading signals generated during a backtest. You provide a filter—essentially a rule—to determine which signals you're interested in. Then, you give it a function to execute when a signal matching your filter arrives. The beauty of this is that the function only runs once, and then automatically stops listening, keeping your code clean and simple. It's ideal for quickly checking a single signal without ongoing subscription.


## Function listenSignalBacktestIdle

This function lets you listen for moments during a backtest when your trading strategy isn't actively doing anything – it’s just waiting. 

Think of it as a way to get notified when your strategy is "idle."  You'll receive signals when there are no open positions and no scheduled actions.

These signals contain basic information like the current price, the trading symbol, and details about your strategy, exchange, and the data timeframe.

It's perfect for keeping track of how often your strategy is idle, for example, you could log this information to monitor performance.  Crucially, this only works during backtests, not during live trading, so it won't interfere with your real-time operations.

You provide a function that gets called each time this idle state occurs, and the function returns another function that you can use to unsubscribe from these signals.


## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest finishes for a specific trading signal. It ensures you only receive notifications once for each signal, even if the backtest runs multiple times. 

The notifications come only from backtest runs, not from live trading. 

To prevent interference between multiple strategies running simultaneously, the function identifies signals based on several factors like the strategy, exchange, and symbol. It remembers the last signal it processed within each unique set of these factors, avoiding duplicate notifications. 

You provide a filter function to specify which closed events you’re interested in. This filter is applied *before* the de-duplication process, guaranteeing that no valid events are missed. Finally, the function returns a cleanup function that you can call to stop listening.


## Function listenSignalBacktestClosed

You can set up a listener to be notified whenever a position closes during a backtest. This is a dedicated channel for backtest events – you won't receive these notifications during live trading. 

The notification includes details like the reason for the closure (e.g., take profit, stop loss, time expiration), the exact time of closure, and the realized profit and loss, already accounting for fees and slippage. 

Once a position closes and you’ve received this notification, that’s it—no more events related to that specific position will be sent. This makes it ideal for analyzing backtest results and generating reports without interference from live trading data. The information arrives directly without needing to filter by action type.


## Function listenSignalBacktestCancelledPerSignal

This function lets you be notified when a signal is cancelled during a backtest, but it makes sure you only get each cancellation once. Think of it as a way to react to cancelled trades, but only when you’re testing historical data.

It focuses solely on backtest executions—you won't receive notifications from live trading.

To prevent duplicate notifications, the system keeps track of previously processed signals within a specific backtest run (defined by strategy, exchange, timeframe, mode and symbol). This means if multiple signals get cancelled within the same test, you'll only hear about each one once.

You can use a filter function to specify which cancelled events you're interested in, and the filter is applied *before* the duplicate checking. This ensures that if an event doesn't meet your filter criteria initially, it won’t prevent a later matching event from being processed.


## Function listenSignalBacktestCancelled

This function lets you listen for situations where a trading signal was dropped before it ever turned into an actual trade during a backtest. Think of it as being notified when a potential trade was cancelled before any money was at risk.

You'll receive these notifications when a signal is cancelled because it timed out, the price moved in an unfavorable way, or a user manually cancelled it. Each cancellation event provides details, including the reason for the cancellation and a unique identifier if the cancellation was user-initiated.

This functionality is exclusively for backtesting scenarios – it won't be triggered in live trading environments. This makes it ideal for analyzing backtest results and generating reports without interference from live trading activity.

To use it, you simply provide a function that will be called whenever a signal is cancelled during a backtest. The function receives an event containing information about the cancellation.


## Function listenSignalBacktestActivePerSignal

This function lets you listen for specific events happening during a backtest, focusing on when a trade is active. It's designed to trigger a callback function only the first time a particular condition is met for a given trade. 

Think of it as a way to get notified about important milestones in a backtest, like when a trade reaches a certain profit level.

The function filters events before any deduplication happens, so no event can be hidden. It works exclusively with backtest data, ensuring it won’t fire during live trading. 

The subscription is unique to each combination of strategy, exchange, data frame, mode, and symbol, avoiding interference between multiple strategies. 

You provide a filter function to define the condition you're looking for, and a callback function to execute when that condition is met for the first time within a trade.


## Function listenSignalBacktestActive

This function lets you get notified whenever a backtest is running and a trading position is open. You'll receive updates for each tick while a position is active, including information about the current profit and loss, and how close the price is to your take-profit and stop-loss levels.

It’s specifically designed for analyzing backtest results—you won't receive these updates during live trading. 

Think of it as a way to monitor the performance of your strategies during replay and generate reports without interference from real-time market data. The information arrives directly, already categorized by action, so you don't need extra checks to process it. You simply provide a function that will be called with each update. The function you provide will return a function you can call to unsubscribe.

## Function listenSignalBacktest

The `listenSignalBacktest` function lets you be notified whenever your backtest produces a signal or result. Think of it as setting up a listener that gets updates during the backtesting process.  It's specifically designed to work with events coming from `Backtest.run()`. These events arrive one after another, ensuring you receive them in the order they occurred. You provide a function that will be called each time a new event is available, and this function receives details about the backtest signal.  When you’re finished listening, the function returns another function to unsubscribe.

## Function listenSignalActivePerSignal

This function allows you to monitor specific events related to active trades within your backtesting or live trading environment. It essentially sets up a listener that gets triggered whenever a new signal becomes active and meets your defined criteria. 

The listener will only "fire" once for each signal ID; it's not a continuous stream of updates for a single position. This is because active ticks represent the initial moment when a position satisfies certain conditions and then stop firing.

You define which events you’re interested in using a filtering function.  The provided callback function then executes for each event that passes your filter. This provides a way to react to, or log, certain actions tied to individual signals.

## Function listenSignalActive

This function lets you react to ongoing trades as they happen, whether it's a live trade or a backtest. It sends updates on every tick for each position you currently hold, providing information like your current profit and loss, and how close you are to your target profit and stop-loss levels. Because it sends an event for *every* tick for *each* open position, it can generate a lot of notifications – consider `listenSignalActivePerSignal` if you only want to be notified once per position.  You provide a function that will be called with these updates. The function you provide returns another function which you must call to unsubscribe from these updates.

## Function listenSignal

This function lets you listen for signals coming from your trading strategy – things like when a position is opened, active, or closed.  It's designed to handle these signals in a reliable way, ensuring they’re processed one at a time even if your callback function takes some time to run.  Essentially, it creates a subscription that calls your provided function whenever a signal event occurs, and it automatically queues these calls to prevent issues from multiple signals happening at once. You provide a function that will be called with the details of each signal event.  When you're done listening, the function returns another function that you can call to unsubscribe from these signals.

## Function listenSchedulePingPerSignal

This function lets you listen for updates related to trading signals that are waiting to be activated. It’s designed to handle a stream of notifications that happen every tick while a trade is on hold. 

Instead of getting spammed with updates, you’ll receive a single notification for each distinct signal.

You provide a way to filter which signals you're interested in and a function to execute when a relevant signal update comes through. The function returns a subscription that you can use to stop listening for these updates.


## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific ping events, but only once. Think of it as a temporary alarm – it triggers your code when a certain condition is met, and then it stops listening. You define what triggers the alarm using a filter, and the code that runs when it triggers is your callback. Once the callback has executed, the listener is automatically deactivated, so you don't need to worry about manually cleaning it up. This is handy when you need to respond to a particular event happening just one time.


## Function listenSchedulePing

This function lets you listen for regular "ping" signals emitted while a scheduled signal is being monitored, essentially while it's waiting to become active. Think of it as a heartbeat that tells you the signal is still being tracked. You provide a function that gets called whenever this ping occurs, letting you build custom monitoring or tracking logic around the signal's lifecycle. These pings happen approximately every minute.  The function returns another function that can unsubscribe you from these pings.

## Function listenRiskOnce

The `listenRiskOnce` function lets you react to specific risk rejection events just one time. It's like setting up a temporary listener that waits for a particular condition to occur, then executes your code and then quietly stops listening. You provide a filter function to define what kind of risk rejection events you're interested in, and a callback function that will be called once that event is detected.  After the callback runs, the listener is automatically removed, so you don’t have to worry about manually unsubscribing. This is particularly handy for situations where you need to perform an action only once when a certain risk condition is met.

## Function listenRisk

This function lets you be notified whenever a trading signal is blocked because it violates your risk rules. 

Think of it as a listener that only rings when something goes wrong with your risk management. 

It ensures that you receive these alerts in a controlled, sequential order, even if your handling logic takes some time. 

You provide a function that will be called with details about the rejected signal. 

Essentially, it's your way to keep a close eye on potential risk issues without being overwhelmed by irrelevant notifications.


## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how long different parts of your trading strategy are taking to run. It's a way to profile your code and find slow spots that might be hurting performance. 

You provide a function as input, and this function will be called whenever a performance event happens during the backtest. Importantly, the events are handled one after another, even if your function takes some time to complete – this prevents things from getting messy with multiple callbacks running at once. This makes it great for understanding the timing of operations within your strategy.


## Function listenPauseOnce

This function lets you temporarily listen for specific pause events and react to them just once. You provide a filter to define which events you're interested in, and a callback function that will execute when a matching event occurs. Once that single event has been processed, the listener automatically stops, preventing unnecessary ongoing checks. It's a convenient way to respond to a single occurrence of a particular pause state change.


## Function listenPause

This function lets you monitor when a trading strategy is paused or resumed. It's like setting up a listener that gets notified whenever the pause status changes.

The listener works in a special way: even if your callback function takes some time to complete, the next pause/resume event will be processed in order, preventing any overlaps or issues with your logic.

It's designed to help you inform users when a strategy is temporarily stopped or restarted, ensuring they're kept in the loop about these changes. The function returns a way to unsubscribe from these updates when you no longer need them.


## Function listenPartialProfitAvailablePerSignal

This function lets you keep an eye on when a partial profit level is reached for a trading signal. It sends you an update each time a new signal hits a profit level. 

Importantly, you'll only get the first profit level reached for each signal – it avoids sending duplicates based on the signal's ID. If you need to track *every* profit level for a specific signal, you can use the more general `listenPartialProfitAvailable` function and manage the tracking yourself or create a specific filter to only react to a particular level. 

You provide a function to decide which events you're interested in, and then another function that gets called whenever a matching event occurs, giving you details about the signal and its progress. The function returns another function that can be called to unsubscribe from the events.

## Function listenPartialProfitAvailableOnce

This function lets you react to a specific condition being met on a trading instrument, but only once. Think of it as setting a one-time alert. You provide a filter – a rule to determine when the condition you’re looking for occurs – and a function that will run *just* once when that rule is met. Once the condition is triggered and the function runs, it automatically stops listening. It's perfect for things like executing a specific action when a certain profit level is reached and you don’t need to know about further changes.

You tell it what kind of event you are interested in and a function to execute. The function will only run when the event you specified is triggered. After that, the subscription is automatically canceled.


## Function listenPartialProfitAvailable

This function lets you get notified whenever a trade hits a predefined profit milestone, like 10%, 20%, or 30% gain. It's designed to handle these notifications in a reliable way, ensuring that your code processes them one at a time, even if your notification handling takes some time.  You provide a function that gets called with the details of the partial profit event, and it returns a function that you can use to unsubscribe from these notifications later.  Essentially, it helps you track and respond to a trade's progress toward profitability without worrying about things getting out of order.


## Function listenPartialLossAvailablePerSignal

This function allows you to keep an eye on when partial losses become available for each trading signal. It essentially sets up a listener that will notify you whenever a new partial loss level is calculated for a signal.

It's designed to avoid overwhelming you – if a signal has multiple partial loss levels, you'll only receive the first one that matches your criteria.

You define what kind of events you’re interested in using the `filterFn` – this acts like a sieve, only letting through events that meet your specific conditions. The `fn` is the function that gets executed when an event passes through that filter.

This subscription will continue until you explicitly stop it, and the function returns a way to unsubscribe.


## Function listenPartialLossAvailableOnce

This function allows you to monitor for specific instances of partial loss levels and react to them once. Think of it as setting up a temporary alert – you define what conditions trigger the alert (using the filter function), specify what should happen when the alert fires (the callback function), and the monitoring stops automatically after that one event. It's perfect for situations where you need to react to a particular loss condition just once and then move on. 

You provide a filter that checks each potential event and a function to execute when a matching event is found. The function will automatically unsubscribe after its first execution, ensuring you don't continue to receive these events.


## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost along the way. You can register a function that will be called whenever the strategy hits specific loss milestones, like 10%, 20%, or 30% loss.

The events are delivered one at a time, in the order they happened, even if your callback function takes some time to run. This ensures that the events are handled in a controlled, sequential manner, preventing any unexpected conflicts that might arise from running multiple callbacks simultaneously. To stop listening for these events, the function returns another function that you can call to unsubscribe.

## Function listenOrderStop

This function lets you monitor order-stop events that happen after an order's status has been finalized. Think of it as a way to be notified when an order stops, either because it was removed or due to repeated errors.

It works alongside a related system, firing once for each signal when the stop reason is definitively known - either because the order was deleted or because too many attempts to process it failed. 

You'll receive this notification just before the order is fully shut down.

Importantly, this is purely for notifications; any errors you encounter within your callback function won't disrupt the overall process.

To use it, you provide a function that will be called whenever a stop event occurs. If your function returns a promise, the processing of those events will happen one after another.


## Function listenOrderSchedulePerSignal

This function allows you to keep an eye on when trading signals are scheduled or cancelled. It lets you react to these events as they happen, specifically focusing on a new signal being created. 

You provide a filter to narrow down the events you're interested in, like only wanting to know about newly scheduled signals.  Then, you provide a function that will run whenever an event matching your filter occurs.  Importantly, the system avoids sending duplicate events related to the same signal, and you can choose to listen for either scheduled or cancelled signals. The function returns another function that when called will unsubscribe the listener.

## Function listenOrderSchedule

This function allows you to monitor the lifecycle of scheduled orders, providing insights into when an order is planned and when it's cancelled. You'll receive notifications when a strategy requests an order at a specific price and when that order is no longer active, for example, if the price isn't reached or the user cancels it. 

It's important to note that this doesn’t tell you when an order actually executes; that's handled by a different signal event.

Think of it as a direct feed into the same system the framework and broker use for managing these orders. This stream provides all events, including cancellations, so you'll always know the status, even if the order never triggers.

If you are building an exchange integration, you should use the broker adapter hooks instead. This function is best for things like logging, notifications, or auditing.

The callback function you provide receives events that are processed one after another.


## Function listenOrderReject

This function lets you tap into order rejections that happen when the exchange definitively refuses an order and won't retry. It's a notification about a rejection that's already occurred, so it's safe to use for things like sending alerts or logging events.

Think of it as a mirror reflecting the rejection branch; it only fires when an order is truly rejected, not for temporary issues.

Each rejection event is delivered only once, and closing the subscription stops the notifications. It's designed for situations where you need to react to the final decision made by the exchange.

You provide a function that will be called whenever an order is rejected, and this function can be asynchronous. The processing of these rejections is handled in a queued, sequential way.


## Function listenOrderFill

This function lets you react to when your orders are definitively filled by the broker. Think of it as a notification confirming an order has actually happened – whether it's a new position opening, a scheduled entry, or an existing position closing.

It’s designed to be very reliable; it only triggers after the system is absolutely certain the broker has confirmed the order's execution.  Transient errors or rejected orders won't trigger this notification.

During backtesting, things are sped up because the confirmation process is bypassed – events are treated as immediately confirmed.

Importantly, this is a notification system. Any errors that occur within your callback function won't interrupt the main trading process; they'll be logged and handled separately.  This makes it ideal for sending alerts via Telegram, webhooks, or for auditing purposes.

You provide a function as input, which will be called each time a fill event occurs. If that function returns a Promise, the processing will happen one after another.

## Function listenOrderContinue

This function lets you track the ongoing status of orders after an initial check. Think of it as a way to be notified when an order's status needs further verification. 

It works alongside the order-stop channel, providing updates on whether an order remains valid or if temporary issues are being resolved. 

You'll receive notifications as long as the order remains monitored, whether it's actively trading or scheduled. Any errors within your callback function won't disrupt the system's overall monitoring process—they'll be logged for review. 

This feature is only used during live trading; backtests don’t perform these checks. To use it, you provide a function that gets called each time an order continues, and that function can return a promise for sequential processing.


## Function listenMaxDrawdownPerSignal

This function lets you monitor for maximum drawdown events, but it focuses on individual trading signals. 

You provide a filter to specify which events you're interested in, and a function to execute when a new signal's maximum drawdown is detected. 

Importantly, it avoids repeated notifications for the same signal – you'll only receive the initial drawdown event for each signal, even if the drawdown worsens later. This helps prevent noise and ensures you only react to significant changes.

## Function listenMaxDrawdownOnce

This function allows you to monitor for specific maximum drawdown events and react to them just once. It's like setting up a temporary alert – when a drawdown event occurs that meets your criteria, the provided function will run, and then the monitoring automatically stops. You define the criteria using a filter function, and the callback function determines what happens when the criteria are met. This is handy for things like triggering a specific action when a drawdown reaches a concerning level. The function returns a cleanup function, which can be used to manually unsubscribe from the event if needed.

## Function listenMaxDrawdown

This function lets you keep an eye on how much your trading strategy loses from its peak value. It will notify you whenever the strategy hits a new low point in terms of drawdown. 

Importantly, it handles these notifications one at a time, even if your response to the notification takes some time to complete. This ensures that actions triggered by drawdown events happen in the order they occur. 

Think of it as setting up an alert system that flags when your strategy experiences significant losses, allowing you to adjust your approach or manage risk dynamically. You provide a function that will be called each time a new maximum drawdown is detected.

## Function listenIdlePingOnce

This function lets you react to signals that indicate the system is idle, but only once for each matching event.  You provide a condition – a function – that determines which idle ping events you’re interested in.  When an idle ping event matches your condition, a function you specify will be run once. After that single execution, the subscription is automatically stopped. Essentially, it's a temporary listener that fires just once for relevant idle states.


## Function listenIdlePing

This function lets you listen for moments when your trading system is completely idle, meaning it's not actively waiting for any signals or orders. It's like a notification that everything's quiet.

You provide a function that will be called whenever this idle state is detected.

The callback function receives an `IdlePingContract` object, which likely contains information about the idle event.

Importantly, this subscription is designed for asynchronous processing, so the events are handled in a way that doesn't block the main flow of your trading logic.

To stop listening for these idle ping events, the function returns another function that you can call to unsubscribe.

## Function listenHighestProfitPerSignal

This function lets you track the highest profit achieved for each trading signal. It continuously monitors profit events and notifies you whenever a new signal reaches its peak profit. 

To avoid repeated notifications for the same signal, it only reports the initial highest profit and then stops sending updates for that specific signal. You can use a filter to only receive notifications for signals meeting certain criteria. The callback function receives information about the signal and its achieved highest profit.


## Function listenHighestProfitOnce

This function lets you react to a specific, highest-profit trading event just once and then stops listening. You provide a rule (a filter function) to identify the event you’re interested in, and a function to run when that event happens. Once the event is found and your function is executed, the subscription is automatically cancelled, ensuring you don't receive or process the same event again. It's perfect for situations where you need to act on a condition occurring only once.

For example, you might use it to trigger a specific action only when a new highest profit record is achieved and you want to ensure it happens only once.


## Function listenHighestProfit

This function lets you monitor a trading strategy's performance and get notified whenever it achieves a new peak profit level. It's designed to be reliable: even if your notification code takes some time to run, the notifications will be delivered in the order they happened, and you won't have multiple notifications firing at the same time. This is really handy for things like automatically adjusting your strategy or simply keeping a record of significant milestones. You provide a function that will be called with the details of each highest profit event. 

The subscription itself returns a function that you can call to unsubscribe from these notifications.


## Function listenExit

This function lets you be notified when a critical error occurs that will stop the background execution of things like Live, Backtest, or Walker processes. 

Think of it as an emergency alarm – it’s for situations that can't be recovered from and will halt what's running.

The callback you provide will be called with details about the error, and it's designed to handle events one at a time, even if your callback function needs to do some asynchronous work. 

It’s important to note that unlike the `listenError` function, this one signals a problem that prevents further processing.

To unsubscribe from these notifications, the function returns a function that you can call.

## Function listenError

This function allows you to monitor and react to errors that occur during your trading strategy's execution, particularly those that can be recovered from. Think of it as a safety net – if a part of your strategy encounters a problem like a failed API request, it won't immediately crash the entire process. Instead, you can use this function to receive notifications about these errors, handle them as needed, and keep your strategy running smoothly. The errors are reported in the order they happen, and your error handling code will run one step at a time to avoid any unexpected conflicts.

## Function listenDoneWalkerOnce

This function lets you react to when a background process finishes, but only once. It allows you to specify a condition – a filter – that determines which completions trigger your response. Once the condition is met and the callback is executed, the subscription is automatically removed, ensuring it doesn’t keep running. Think of it as a temporary listener that’s perfect for one-off tasks after a background operation completes. You provide a filter to decide which events you care about, and a function to execute when a matching event occurs.


## Function listenDoneWalker

This function allows you to monitor when a background task within the Walker framework finishes. It's useful for ensuring certain operations complete before proceeding with subsequent steps.

You provide a function that will be called when the background task is done.

The key here is that these completion events are handled one at a time, even if the function you provide is itself asynchronous, preventing unexpected behavior from multiple callbacks running simultaneously. Essentially, it guarantees orderly processing of these completion notifications.


## Function listenDoneLiveOnce

This function lets you react to when a background task started with `Live.background()` finishes, but only once. You provide a filter – a test to see if the event you’re interested in – and a callback function that will run when a matching completion event happens. Once the callback executes, the subscription is automatically removed, ensuring you only get notified the first time. This is handy for setting up one-off actions based on background task completion.


## Function listenDoneLive

This function allows you to monitor when background tasks initiated through the `Live.background()` method have finished running. It provides a way to be notified about the completion of these background processes as they occur. Importantly, these completion notifications are delivered in the order they happen, and any processing you do in response to the notification will be handled one at a time, ensuring things don’t get out of sync. You provide a function that will be called when a background task is done, and the function returns another function that you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest completes, but only once. 

You provide a filter to specify which backtest completions you're interested in. 

Then, you give a function that will be executed when a matching backtest finishes. 

The function automatically removes itself after running once, so you don't need to worry about cleaning up subscriptions. It's a simple way to perform a single action upon backtest completion.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s like setting up a listener that gets triggered once the backtest is complete. Importantly, any code you put inside your listener will run one step at a time, even if that code involves asynchronous operations, ensuring that things happen in the correct order. You provide a function that will be executed when the backtest is done, and this function returns another function that you can use to unsubscribe from these completion notifications later.

## Function listenCheck

This function lets you keep an eye on whether your orders are still valid on the exchange. It listens for "order-check" events, which are signals that confirm if an order is still open.

These events happen whenever there's a new tick while an order is being monitored, but *before* the backtest completes.  You'll receive two types of events: "active" for open positions and "schedule" for pending orders.

If there’s a problem during the check, like a temporary network issue, the system will usually tolerate it and keep monitoring the order. However, if the order is completely deleted from the exchange (meaning it’s truly gone), the process stops immediately.  Specific errors have different consequences, influencing how the backtest reacts – some are temporary, others are fatal.

You provide a function to handle these events, and the system will call this function whenever a check event is triggered. If your function returns a promise, the process will wait for that promise to resolve before continuing.

## Function listenBreakevenAvailablePerSignal

This function lets you keep an eye on when a breakeven level becomes available for a particular trading signal. Think of it as setting up a notification system—you tell it what kind of signals you're interested in (using the `filterFn`), and then it will call your provided function (`fn`) whenever that condition is met for a new signal. Essentially, you'll get updates as new breakeven opportunities arise, tailored to your specific signal preferences. The function returns another function that, when called, unsubscribes from these notifications, allowing you to stop listening whenever you need to.

## Function listenBreakevenAvailableOnce

This function allows you to react to specific breakeven protection events, but only once. You provide a condition – a filter – to define what kind of event you're interested in. Then, you specify a function to run when that particular event happens. Once the event is detected and the function executes, the subscription is automatically canceled, so you won't receive further notifications. It's perfect for situations where you need to take action just once based on a particular breakeven trigger.

You define the condition using `filterFn` and specify what you want to do when that condition is met using `fn`.


## Function listenBreakevenAvailable

This function lets you set up a listener that gets notified whenever a trade's stop-loss automatically adjusts to the entry price – essentially, the breakeven point. This typically happens when a trade has gained enough profit to cover the initial costs and fees. The listener works by receiving events one at a time, ensuring that the handling of each event happens in the order it was received, even if your handling logic takes some time. To stop listening, the function returns a cleanup function that you can call when you no longer need the notifications. You provide a callback function that gets executed whenever a breakeven event occurs, and this function receives an object containing details about the trade that reached breakeven.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts, but only once. You provide a filter to identify which events you're interested in, and then a function that will be executed when a matching event occurs. Importantly, after the callback runs once, the function automatically stops listening, preventing it from triggering again. It’s a convenient way to perform setup or adjustments just once at the beginning of a backtest. 


## Function listenBeforeStart

The `listenBeforeStart` function lets you register a piece of code that runs just before a trading strategy begins executing for a specific asset. It’s like getting a heads-up right before the action starts.

This function ensures your code is executed one at a time, even if it involves asynchronous operations, so you can be sure things happen in the right order.

To use it, you provide a function that will be called with information about the upcoming strategy execution. This allows you to prepare or perform checks before the trading actually begins. The function returns another function which can be used to unsubscribe from the listener.

## Function listenBacktestProgress

This function lets you monitor the progress of a backtest as it runs. It's useful for displaying a progress bar or updating a user interface. 

You provide a function that will be called whenever the backtest makes significant progress. This function receives information about the current state.

The key thing to know is that the updates are handled in a specific order and processed one at a time, even if your function takes some time to complete. This prevents any issues from multiple updates occurring simultaneously. To stop listening for updates, the function returns another function that you can call to unsubscribe.

## Function listenAfterEndOnce

This function lets you react to specific trading events that happen *after* a trade has finished, but only once.  You provide a way to identify which events you're interested in, and a function to execute when a matching event occurs. Once that event has been processed, the subscription automatically stops, so you don't need to manually unsubscribe. It's useful for things like recording a single piece of data after a trade completes or triggering a one-time action.


## Function listenAfterEnd

This function lets you register a piece of code to run *after* a trading strategy has finished executing for a specific symbol. It's really useful for things like cleanup or reporting that need to happen once the strategy is done.

The events are handled in the order they arrive, and the code you provide will run sequentially, even if your callback function contains asynchronous operations. 

To make sure things don't get messy, it uses a special queueing system, so your code runs one step at a time without interfering with other processes. The function returns an unsubscribe function that you can use to stop listening to these events when you no longer need them.


## Function listenActivePingPerSignal

This function lets you monitor active ping events, but it's designed to be efficient. It provides a way to react only when a new signal ID appears. Think of it as a way to get notified only when something *new* happens – after that, the function will stay quiet for the rest of the signal’s life. 

You provide a filter to decide which events you're interested in and a function that gets called for each of those interesting events. This is useful when you want to respond to a condition being met for a position just once.


## Function listenActivePingOnce

This function lets you monitor active ping events and react to them just once. You provide a way to identify the specific events you're interested in, and then a function to execute when that event occurs. After the function runs, it automatically stops listening, so you don’t have to manage the subscription yourself. It’s handy when you need to wait for a particular condition to be met with an active ping and then take action.

The `filterFn` defines which events should trigger the callback. The `fn` is what gets executed when a matching event is found.

## Function listenActivePing

This function allows you to keep track of active signals within the backtest-kit framework. It’s essentially a way to be notified whenever a signal's status changes.

You'll receive these notifications roughly every minute, and they'll be delivered in the order they occurred.

The function provides a way to implement logic that reacts to these changes while ensuring actions are performed one at a time, preventing potential conflicts if your callback function involves asynchronous operations. To stop listening, the returned function from the `listenActivePing` can be called. The callback function you provide will receive details about the active ping event.

## Function listWalkerSchema

This function helps you discover all the different ways your trading strategies can process data. It gathers a list of all the "walkers" – essentially, pre-defined data processing steps – that you've set up within your backtest environment. Think of it as a way to see what actions your data is going to undergo. This is really handy if you’re troubleshooting, documenting how your system works, or building a user interface to manage these processing steps. You’ll get an array containing information about each walker.


## Function listSweepSchema

This function provides a way to see all the different sweep schemas that are currently set up within your backtesting environment. Think of sweep schemas as pre-defined sets of parameters you want to test – this function lets you list them all. It’s handy if you’re trying to understand what’s been configured, create documentation, or build a user interface that dynamically displays available sweep options. It fetches the sweep schemas that have been previously registered using the addSweepSchema function.


## Function listStrategySchema

This function gives you a list of all the trading strategies that have been set up in your backtest-kit environment. Think of it as a way to see what strategies are available for testing or documentation purposes. It's handy for situations where you need to understand which strategies you’ve defined or want to build tools that dynamically display them. It returns an array of strategy schemas, each describing a different trading strategy.


## Function listSizingSchema

This function provides a way to see all the sizing strategies you've set up within your backtest kit. It gives you a list of all the configurations that define how your orders are sized. Think of it as a tool to inspect your order sizing logic – useful when you're troubleshooting or building a user interface that displays sizing options. It fetches these configurations, returning them as a readily accessible list.

## Function listRiskSchema

This function lets you see all the risk configurations that your backtest-kit environment is currently using. Think of it as a way to take a quick inventory of how your trading system is assessing and managing risk. It returns a list of these configurations, allowing you to inspect them, document them, or use them to build tools that adapt to your risk settings. It’s helpful for understanding the risk logic in place or for troubleshooting potential issues.


## Function listMemory

This function helps you see all the saved memory entries associated with your current signal. It's like looking at a list of previously stored data points. 

The `dto` parameter simply tells the function which "bucket" or storage area to search within. 

It figures out whether you're in a backtesting or live trading scenario on its own, and also knows which signal to work with based on the current environment. The function returns a list of memory entries, each containing a unique ID and its content.

## Function listMCPSchema

This function lets you see all the different data structures your trading system understands, specifically those defined using the Model Context Protocol. Think of it as a way to inventory all the "types" of information your system is working with. It returns a list of these data structures, which is handy for troubleshooting, creating documentation, or building user interfaces that need to interact with this data. Essentially, it's a peek under the hood at how your system organizes information.

## Function listFrameSchema

This function provides a way to discover all the different data structures, or "frames," that your backtest kit is using. Think of it as a directory listing for your data schemas. It returns a list of these frames, allowing you to inspect them for troubleshooting or to automatically generate documentation. Essentially, it helps you understand the layout and organization of the data within your backtest.


## Function listExchangeSchema

This function provides a way to see all the exchanges your backtest-kit setup is aware of. It returns a list containing information about each exchange. Think of it as a quick way to confirm which exchanges are registered and available for backtesting or analysis. This is handy if you’re troubleshooting, need to document your environment, or want to create a user interface that adapts to the available exchanges.

## Function hasTradeContext

This function lets you quickly see if the trading environment is fully ready for actions. It confirms that both the execution context and the method context are currently active. Think of it as a quick check to ensure everything's set up properly before you try to retrieve data like candle prices or format values for trading. It’s a simple way to avoid errors by making sure you're in a valid state to use certain trading functions.

## Function hasNoScheduledSignal

This function helps you determine if a trading signal is currently scheduled for a specific asset, like a particular cryptocurrency pair. It checks if there's an existing, planned signal waiting to be executed. If the function returns true, it means no signal is currently scheduled for that symbol, making it a useful check before attempting to generate a new one to prevent conflicts. The function intelligently figures out whether you're running a backtest or a live trading session based on the current environment. You provide the symbol of the asset you're interested in – for example, "BTCUSDT."

## Function hasNoPendingSignal

This function lets you check if there's currently no signal waiting to be executed for a specific trading pair. Think of it as the opposite of `hasPendingSignal`. It’s helpful when you’re writing code that generates signals – you can use this to ensure you’re not creating new signals when one is already in progress. The function knows whether it’s running in a backtest or a live trading environment without needing you to tell it. 

It takes the symbol of the trading pair as input (like 'BTCUSDT'). 

The function returns `true` if no pending signal exists and `false` otherwise.


## Function getWalkerSchema

This function helps you find the blueprint, or schema, for a specific trading strategy component called a "walker." Think of walkers as specialized pieces that perform tasks in your backtesting process.  You give it the name of the walker you're interested in, and it returns a detailed description of how that walker is structured and what it does. This is useful for understanding how different parts of your backtest are set up and interacting. The name you provide must match a registered walker within your trading framework.


## Function getTotalPercentHeld

This function tells you what percentage of a trading position you still hold. Think of it as showing how much of your initial buy remains open – 100% means you haven't closed any part of the position, while 0% means it's completely closed. It handles situations where you've made multiple purchases (DCA) and then partially closed the position, ensuring an accurate calculation. You provide the symbol of the trading pair, like 'BTCUSDT', to get the percentage. It's essentially the same as using `getTotalPercentClosed`.

## Function getTotalPercentClosed

This function helps you understand how much of your position in a specific trading pair is still open. It tells you the percentage of your original position that hasn't been closed out – whether it's 100%, meaning everything is still held, or 0%, meaning the entire position has been closed. 

It takes the symbol of the trading pair (like "BTC/USDT") as input. 

The framework automatically knows whether it's running a backtest or a live trading session, so you don't need to worry about specifying that. 

It also cleverly considers any dollar-cost averaging (DCA) entries when calculating this percentage, ensuring accuracy even with partial closures along the way.

## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much money you’ve spent on a particular trading pair, like BTC/USD. It looks at your current holdings, even if you've closed parts of the position before, and calculates the total cost basis. This function automatically adjusts based on whether you're running a backtest or a live trade. You simply tell it which trading pair you're interested in, and it will return the total cost in dollars.

## Function getTimestamp

This function, `getTimestamp`, provides a way to retrieve the current timestamp within your trading strategy. It’s handy for precisely tracking time-based events during your backtesting or live trading. When running a backtest, it gives you the timestamp associated with the specific historical timeframe the strategy is currently evaluating. Conversely, in a live trading environment, it returns the actual, current timestamp.

## Function getSymbol

This function simply retrieves the trading symbol currently being used within the backtest environment. Think of it as a way to know which asset you're analyzing or trading in your simulation. It returns a promise that resolves to a string representing the symbol, like "BTCUSDT" or "AAPL". It's a quick way to confirm your backtest is focused on the correct asset.

## Function getSweepSchema

This function allows you to fetch the configuration details for a specific trading strategy, or "sweep," within your backtesting environment. Think of it as looking up the blueprint for a particular trading approach. You provide the name of the sweep you’re interested in, and the function returns a structured object containing all the settings and parameters associated with that sweep. This is useful for understanding how a strategy is set up and what its key parameters are.


## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy as it's running. It gives you a snapshot of things like queued actions, pending signals, and flags related to user interactions. Think of it as a way to check what the strategy is *about* to do, before it actually does it. The function cleverly figures out whether you're in a backtesting simulation or a live trading environment without you needing to specify it. You just provide the symbol of the trading pair you're interested in, like 'BTC-USDT', and it delivers the status information.


## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy. It takes the strategy's unique name as input and returns a detailed description of that strategy, outlining its expected inputs, outputs, and overall structure. Think of it as looking up the recipe for a particular trading approach within the backtest-kit system. You use this to understand exactly what a strategy requires to run correctly.

## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. When a strategy is paused, it won't open any new trades – it won't call the signal generation function and any new signal requests will be held. However, any existing signals that are already open will still be managed and closed as normal. The framework automatically figures out if it's running in a backtesting environment or a live trading environment. You just need to provide the trading pair's symbol to get the paused status.

## Function getSizingSchema

This function lets you access pre-defined trading sizing strategies within the backtest-kit framework. Think of sizing as how much of your capital you allocate to each trade. 

You provide the name of the sizing strategy you want to use, and the function returns detailed information about that strategy – things like how it calculates position sizes and its associated parameters. 

Essentially, it's a way to look up the blueprint for a specific sizing method.


## Function getSignalState

This function helps you retrieve a specific value related to a trading signal. It's designed to work with LLM-driven trading strategies that track performance metrics on a per-trade basis, like how long a trade is open and its maximum profit.

The function automatically figures out whether you're in a backtesting or live trading environment.

It looks for an active signal that's either pending or scheduled. If no such signal is found, it will raise an error. 

You provide the symbol you’re trading and a small object that includes a bucket name and an initial value to be used for tracking. 

This is particularly useful for strategies that aim to manage risk and exit trades based on time and profitability thresholds, like exiting a trade if it's been open for a certain amount of time and hasn’t reached a desired profit level.


## Function getSessionData

This function lets you retrieve data that's been saved and associated with a specific trading setup – the symbol, strategy, exchange, and timeframe you’re using. Think of it as a shared memory space for your trading logic that persists even if the backtest or live session restarts. It’s great for things like storing results from complex calculations or keeping track of indicator values between candles without having to recalculate them each time. The function handles whether you’re in a backtest or live environment automatically. You just need to provide the symbol you’re looking for to get the associated data.


## Function getScheduledSignal

This function lets you check if a scheduled signal is currently running for a specific trading pair. 

It's really useful for strategies that rely on pre-defined signals to initiate trades. 

If a signal is active, it will return detailed information about it; otherwise, you'll get nothing back. 

Importantly, you don't need to worry about whether you're in a backtest or a live trading environment – it figures that out on its own.

You just need to tell it which trading pair (like 'BTCUSDT') you're interested in.


## Function getRuntimeInfo

This function gives you a snapshot of the current trading environment. It pulls together important details like which asset you're trading, the exchange being used, the timeframe for analysis, and the specific strategy employed. Essentially, it tells you whether you're running a historical backtest or a live trade. You can also customize the data it gathers by specifying a `RuntimeData` type.

## Function getRiskSchema

This function helps you access predefined structures for managing risk in your trading strategies. It essentially lets you look up a specific risk profile by its unique name. Think of it like finding a template or blueprint for a particular type of risk assessment. You provide the name of the risk you're interested in, and the function returns the associated schema, which outlines how that risk is measured and controlled.

## Function getRemainingCostBasis

This function helps you figure out how much money is still tied up in a specific investment, like a cryptocurrency pair. It essentially tells you the remaining cost basis – the portion of your initial investment that hasn't been sold off yet.

If you've been buying into an asset over time (Dollar-Cost Averaging or DCA), this function takes that into account and provides an accurate calculation, even if you’ve sold off some of your holdings in smaller amounts.

Think of it as a way to track your initial investment in relation to what you’ve sold.

It’s also a handy shortcut, as it’s equivalent to using the `getTotalCostClosed` function.

You simply provide the trading symbol – for example, BTC-USD – and the function will return the remaining cost basis as a number.

## Function getRawCandles

The `getRawCandles` function helps you retrieve historical candle data for a specific trading pair and timeframe. You can specify how many candles you want and a date range to narrow down the results.

It's designed to be used safely within the backtest framework, ensuring it doesn’t peek into the future when analyzing past performance. 

You have a lot of control over how the function operates, with different combinations of date and limit parameters allowed, letting you focus on particular periods or get a chunk of data from the current context. If you only specify a limit, the function will automatically determine the start date based on your execution context. Remember the end date you provide must always be in the past.

## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been waiting to be executed. It checks a specific trading pair, like 'BTCUSDT', and tells you the number of minutes it's been pending. 

If there isn't a signal waiting, the function will simply return null. You can use this information to monitor your trading strategies and potentially adjust signal timing. Just provide the trading pair's symbol, and it will give you the waiting time.

## Function getPositionPnlPercent

This function tells you how much profit or loss you're currently holding on a trade, expressed as a percentage. 

It considers factors like any partial closing of positions, the cost of your initial investments (DCA), potential slippage when executing trades, and associated fees.

If there isn’t an active trade to calculate, the function will let you know.

It figures out whether you're running a backtest or a live trade automatically, and it gets the latest market price for you too.

To use it, you simply provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionPnlCost

This function helps you understand the current unrealized profit or loss for a trade you're holding. It figures out this value in dollars, considering the current market price and how much you've invested. 

The calculation includes factors like partial trade closures, dollar-cost averaging, potential slippage, and trading fees to give you a realistic view.

If no trade is currently open, the function will let you know.

It automatically knows whether it's running in a backtesting simulation or a live trading environment, and it gets the current market price for you. You simply need to provide the symbol of the trading pair, like "BTCUSDT."


## Function getPositionPartials

This function helps you understand how your trading position has been partially closed. It provides a history of profit and loss closures, showing the percentage of the position closed, the price at which it was closed, and the accounting details at that time. You'll get this information for the currently active trading signal. 

If no trades are in progress, the function will tell you that with an error. If you haven’t taken any partial profits or losses yet, you’ll receive an empty list.

The information returned includes details like the execution price, the cost basis at the time of the partial close, and the number of entries in a dollar-cost averaging strategy. You specify the trading pair (like BTC/USD) to retrieve this data for.

## Function getPositionPartialOverlap

This function helps prevent accidentally closing partial positions twice at roughly the same price. It checks if the current market price falls within a defined range around previously executed partial close prices.

Essentially, it determines if a new partial close order would overlap with an existing one.

The function looks at each existing partial close and calculates a tolerance range based on percentage steps. If the current price falls within any of those ranges, it means there's a potential overlap. 

You provide the trading symbol and the current price you're evaluating, and optionally a configuration for the tolerance ranges (how much price fluctuation is allowed). If no partial closes have been made, or if the current price is outside all tolerance zones, it will return false.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a trading position experienced its biggest loss. It returns a timestamp, which is essentially a date and time in a numerical format.

Think of it as identifying the precise moment your position hit its lowest point in terms of value.

To use it, you just need to provide the symbol of the trading pair, like 'BTCUSDT'.

It will raise an error if there isn't a currently active trading signal for that position.


## Function getPositionMaxDrawdownPrice

This function helps you understand the most significant loss a trading position has experienced. It calculates the maximum drawdown price for a specific trading pair, essentially revealing the lowest price the position hit while it was open. 

Think of it as finding the point where your position experienced the biggest dip.

To use it, you simply provide the symbol of the trading pair you're interested in, like "BTCUSDT". It will then return a numerical value representing that maximum drawdown price.

Keep in mind, it requires a pending signal to be present for the position.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates and returns the percentage of profit or loss that occurred when the position hit its lowest point during its entire lifetime. Think of it as a snapshot of the PnL at the most challenging moment for that trade. You’ll need to provide the trading symbol (like BTC/USD) to get this information. If there are no signals currently being tracked, the function will let you know by throwing an error.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. Specifically, it calculates the total loss (expressed in the quote currency) that occurred at the point when the position experienced its biggest drawdown. 

Think of it as identifying how much money you would have lost at the worst possible moment for that particular trade.

To use it, you need to provide the trading symbol, like 'BTC-USDT'.

It will give you a numerical result representing that maximum drawdown loss. If no trading signals are active, the function will let you know that it can’t proceed.


## Function getPositionMaxDrawdownMinutes

This function helps you understand the timing of your trading positions’ biggest losses. Specifically, it tells you how many minutes have passed since the point where the position experienced its maximum drawdown. 

Think of it as a way to gauge how long ago things got really bad for a particular trade. 

The value will be zero the very moment the lowest price was hit.

If no trades are currently active for the specified symbol, the function will alert you with an error. You need at least one open position to get this information. 

The function requires the symbol of the trading pair (like 'BTCUSDT') to work.

## Function getPositionLevels

This function, `getPositionLevels`, helps you see the different prices at which you've entered a position for a specific trading pair. Think of it as looking at your DCA (Dollar Cost Averaging) history. 

It returns an array of prices, starting with the original price you bought in at, and then listing any subsequent prices you added to your position using `commitAverageBuy`.

If you haven't made any DCA entries, it will simply return an array containing only the initial entry price.

If you try to use it without a pending signal, it will let you know by throwing an error. You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionInvestedCount

This function helps you track how many times you've added to a position using a dollar-cost averaging (DCA) strategy. It tells you the number of individual purchases that make up the current position for a specific trading pair.

Essentially, a value of 1 means you initially bought the asset, while a higher number indicates that you’ve been adding to it over time through subsequent buys.

The function automatically figures out whether you're in a backtesting or live trading environment.  If there's no pending order to track, the function will let you know by throwing an error. You provide the trading symbol (like BTCUSDT) as input.

## Function getPositionInvestedCost

This function helps you find out how much money you've put into a particular trade. It calculates the total cost basis for any open position, considering all the buy orders that contributed to it. Think of it as adding up all the individual costs of entering the trade.

The function uses the `CC_POSITION_ENTRY_COST` value as the default entry cost if one wasn't previously specified when adding orders.

It will tell you the amount in dollars.

If there's no open position, it will let you know by throwing an error.

The function automatically determines whether it's running in a backtest or a live trading environment.

You just need to give it the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trade (identified by its symbol) made the most profit during its entire lifespan. 

It returns a timestamp, which is essentially a date and time, marking that peak profit moment.

If, for some reason, there’s no record of any trading signals for the given symbol, the function will let you know by throwing an error. 

You provide the trading pair's symbol (like "BTCUSDT") to tell the function which trade you're interested in.


## Function getPositionHighestProfitPrice

This function helps you understand the peak profitability of an open trade. 

It finds the highest price a long position reached, or the lowest price a short position reached, since it was opened. Think of it as tracking the best possible outcome so far.

The function gives you a number representing that best price. It’s updated as new price data comes in, constantly refining the record.

You'll need an active trade (long or short) for this function to work, and it will always provide a value – at least the original entry price. It tells you the symbol for the trading pair you’re looking at.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been performing since reaching its highest profit. It calculates the time, in minutes, that has passed since the price was at its most profitable point. Think of it as a way to see how far a position has fallen from its best moment.

Essentially, it’s a measure of how much the position has lost ground since its peak. If the position was just created and hit its highest profit immediately, the function will return zero.

To use this, you'll need to provide the trading symbol (like 'BTCUSDT'). 

It’s important to note that this function requires a signal to be active for the position.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best-ever profit point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, ensuring the result is never negative. Think of it as a measure of how much room your trade still has to potentially reach its peak profit. 

It requires a trading symbol to perform the calculation and will report an error if there’s no active trading signal for that symbol.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far and the profit you have now, but only considers the positive difference – meaning it only looks at potential gains lost. You provide the trading symbol, like "BTC-USD," and it returns a number representing that distance.  This metric can be helpful in assessing risk and potential recovery points for a trade.  Keep in mind, this function relies on having pending signals for the specified symbol.

## Function getPositionHighestProfitBreakeven

This function helps determine if a trade's breakeven point could have been reached at the highest price it achieved during a test. Essentially, it checks if achieving profitability was mathematically possible given the price data. 

It needs a trading pair symbol, like 'BTCUSDT', to perform this check.

If there's no existing trading signal to analyze, the function will report an error.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. It tells you the highest percentage profit that position ever reached during its lifespan. 

You need to provide the symbol of the trading pair, like "BTCUSDT". 

The function will return a number representing that peak profit percentage.

If there's an issue with the position, like it never had any signals, it will let you know by throwing an error.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a trading position. Specifically, it tells you the cost (expressed in the quote currency, like USD or EUR) that was incurred when the position reached its highest profit level. Think of it as identifying the most expensive point to hold the position before it started making profits.

To use it, you just need to provide the symbol of the trading pair you’re interested in, like "BTC/USDT".

It will tell you the cost associated with achieving that peak profit. 

If there's no signal available for the position, the function will let you know that it can't proceed.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its lowest point. It calculates the difference between your current profit percentage and the largest loss percentage experienced. Essentially, it shows you how far your position has bounced back from its worst drawdown.

The function requires you to specify the trading symbol (like "BTCUSDT") to get this drawdown information for a particular asset.

It’s important to know that this function will not work if there are no pending trading signals.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position has lost compared to its lowest point. It calculates the difference between your current profit and loss and the lowest profit and loss it reached during a drawdown. 

Essentially, it measures how far your position has fallen and recovered.

The function takes the trading symbol (like "BTC-USD") as input. It will return a number representing that PnL cost difference. 

If there’s no active trading signal, the function won’t work and will indicate an error.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It tells you the initial estimate for the duration of a pending signal, essentially the maximum number of minutes it's expected to be open before it automatically closes due to the `time_expired` setting. The value returned is the one originally set when the signal was created. If there isn't a pending signal for the given symbol, the function will let you know by throwing an error. You need to provide the trading pair symbol to use this function.

## Function getPositionEntryOverlap

This function helps you avoid accidentally placing multiple DCA (Dollar Cost Averaging) orders near the same price. It checks if the current market price is close to any of your existing DCA entry levels, considering a small tolerance range around each level.

Essentially, it’s a safety check to make sure you're not triggering multiple entries at nearly identical prices, which can dilute your position and make your strategy less effective.

The function determines if the current price falls within a defined band around your existing DCA levels, calculated based on a percentage tolerance. If a match is found, it indicates an overlap, preventing a new entry.

You can customize this tolerance with the `ladder` parameter, allowing you to adjust how close the current price needs to be to an existing level to trigger a flag.

## Function getPositionEntries

getPositionEntries lets you check the details of how a position was built up, specifically looking at the prices and costs involved in each step. It's useful for understanding the history of a trade, particularly if you've used DCA (Dollar Cost Averaging).

The function gives you an array of entries, where each entry shows the price and the amount of money spent at that specific time. If no DCA was used, you’ll get an array with only one entry, representing the initial trade.

If there's no active trade currently being built, this function won't work and will throw an error. You need to provide the symbol of the trading pair you’re interested in.

## Function getPositionEffectivePrice

This function calculates the effective entry price for your current trading position, considering any weighted average (DCA) strategy you might be using. It determines this price by taking into account the costs and prices involved in each trade.

If you've made partial closes on your position, the calculation will factor in the costs associated with those closures.

In cases where you haven't applied any DCA strategy, the function will simply return the original opening price.

It’s important to note that the function will signal an error if there's no pending trading signal to evaluate. The framework automatically figures out whether it’s running in a backtest or a live trading environment.

You need to provide the symbol of the trading pair you are interested in.

## Function getPositionDrawdownMinutes

This function, `getPositionDrawdownMinutes`, helps you understand how far a trading position has fallen from its best performance. It tells you the time in minutes since the price reached its highest point for that specific trading pair. Think of it as a measure of how much "drawdown" a position has experienced. The value starts at zero when the position hits its peak profit, and increases as the price moves down. If there isn't an active trade signal for the specified trading pair, the function will report an error. You’ll need to provide the symbol of the trading pair (like 'BTCUSDT') to use it.

## Function getPositionCountdownMinutes

This function tells you how much time is left until a position closes. It calculates this by looking at when a pending signal was created and comparing it to an estimated expiration time.

The result is always a positive number of minutes – if the estimated expiration has already passed, it will return zero.

If there's no pending signal for a particular trading pair, the function will let you know by throwing an error.

To use it, you just need to provide the symbol of the trading pair you’re interested in, like "BTC-USDT".


## Function getPositionActiveMinutes

This function tells you how long, in minutes, a particular trading position has been open. 

It calculates the time elapsed since the position was initially created.

If there's no active trading signal for the position, the function will let you know by throwing an error. 

You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT', and it will return the active minutes.

## Function getPendingSignal

This function helps you find out what pending trade signal, if any, your strategy currently has waiting to be triggered. 

It checks for a signal related to a specific trading pair, like 'BTCUSDT'.

If a signal is active, the function returns detailed information about it. Otherwise, it tells you there's nothing pending.

The function smartly figures out whether it's running in a backtest or a live trading environment based on where it's being used.


## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls this data from a registered exchange.

You can optionally specify how many levels of depth you want to see in the order book – if you don't specify, it uses a default value.

The function considers the timing of the request based on the current execution context, which is important for both backtesting and live trading scenarios. The exchange itself decides how to handle the time range provided.


## Function getNextCandles

This function helps you get a set of candles from an exchange, specifically those that come *after* the current time being used in your backtest. Think of it as looking forward in time to grab the next few candles for a specific trading pair and timeframe.

You provide the symbol of the trading pair (like BTCUSDT), the candle interval (like 1 minute, 5 minutes, or 1 hour), and how many candles you want to retrieve.  It uses the underlying exchange's method to get those candles.

This is useful for simulations where you need to know what will happen *next*.


## Function getMode

This function simply tells you whether the trading system is currently running in backtest mode (simulated historical data) or live mode (real-time trading). It returns a promise that resolves to either "backtest" or "live", allowing your code to adapt its behavior depending on the environment. You can use this to display different information to the user or adjust risk parameters, for example. It's a quick and easy way to check the context of your trading operations.

## Function getMinutesSinceLatestSignalCreated

This function helps you determine how long ago a trading signal was last generated for a specific trading pair. It calculates the time in minutes passed since that signal was created. 

Whether the signal is currently active or has been closed doesn’t matter; this function just measures the time since *any* signal was recorded. This is useful, for example, in implementing cooldown periods after a stop-loss event.

It looks for signal information first in the backtest data storage, and if it can’t find it there, it then checks the live data storage. If no signal is found at all, the function will report an error. The function automatically understands whether it's running in a backtest or live trading environment.

You provide the trading pair's symbol (like "BTCUSDT") as input.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy. It calculates the largest percentage difference between its highest profit and its lowest point during a backtest. Think of it as measuring how far a strategy falls from its best performance – a higher number indicates greater risk. The calculation focuses on the PnL (profit and loss) percentage, making it a relative measure of the drawdown. To use it, you simply provide the trading pair symbol you're interested in. If there’s no trading data available for the specified symbol, it will throw an error.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk associated with a trading strategy by calculating the maximum drawdown in terms of profit and loss. Specifically, it measures the difference between the highest profit achieved and the lowest loss experienced during a backtest, ensuring the result is never negative. 

To use it, you'll need to provide the trading symbol, like 'BTC-USDT'. The function then returns a number representing this maximum drawdown distance. 

If the backtest data doesn't contain any trading signals for the given symbol, the function will report an error.


## Function getMCPSchema

The `getMCPSchema` function lets you access the definition of a specific Model Context Protocol (MCP) that's been registered within the backtest-kit framework. Think of an MCP as a blueprint describing how data is structured for a particular model. You give it the name of the MCP you're interested in, and the function returns that MCP's schema – essentially, all the details about its data fields and how they're organized. This is useful when you need to understand or validate data that conforms to a specific MCP.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal – whether it's still active or has already been closed – for a specific trading pair. It's handy for things like implementing cooldowns after a trade; for instance, you could prevent a new trade from opening for a set time after a stop-loss event.

The function looks for signals first in the historical trading data and then in the live data. 

If no signal is found, it will report an error.

It intelligently adapts to whether you're running a backtest or a live trading session.

You just need to provide the trading pair's symbol to use it.

## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint for a specific frame within your backtest kit. Think of frames as the building blocks of your trading strategy – they define the data and structure you're working with.  You give it a name, like "candle" or "orderbook", and it returns the detailed information about that frame, telling you what data it contains and how it's organized.  This lets you understand and work with the data used in your backtesting process.


## Function getExchangeSchema

This function lets you get information about a specific cryptocurrency exchange that's been set up within the backtest-kit system. Think of it as looking up the details for how a particular exchange, like Binance or Coinbase, is represented and handled. You provide the name of the exchange you're interested in, and it returns a structured description of that exchange – basically, a blueprint of how it works within the backtest-kit framework. This schema contains things like how to access market data and place orders for that exchange.


## Function getDefaultConfig

This function gives you a set of default settings for the backtest-kit framework. Think of it as a starting point – it provides sensible values for various parameters that control how the framework behaves.  It's helpful if you're new to the framework and want to see all the options you can adjust and what their default values are. The returned configuration covers things like how often data is refreshed, limits on certain operations, and controls for notifications and signal generation. It's read-only, meaning you can inspect it but can’t directly modify it.

## Function getDefaultColumns

This function provides a set of pre-defined column configurations used for creating markdown reports within the backtest-kit framework. It essentially gives you a blueprint for structuring the data displayed in your reports.

The returned object contains columns specifically for closed trade results, heatmap rows, live data, partial fills, breakeven events, performance metrics, risk events, scheduled tasks, strategy events, synchronization events, highest profit events, maximum drawdown events, walker signals, and strategy results.

Think of it as a way to quickly understand the standard format for displaying different types of trading data in reports. You can examine these definitions to guide your own custom report layouts.

## Function getDate

This function, `getDate`, gives you the current date relevant to your trading scenario. If you're running a backtest, it provides the date associated with the timeframe you're analyzing. When you're trading live, it returns the actual, real-time date. It's a simple way to get the date within your trading logic.

## Function getContext

This function provides access to information about the current method's execution. Think of it as a way to peek inside what's happening during a trading strategy's process. It retrieves a context object that holds details related to the environment the method is running in, allowing for more sophisticated control or logging. You can use it to understand the current state of your trading logic.


## Function getConfig

This function allows you to access the framework's core configuration settings. It provides a snapshot of how the backtest kit is set up, including parameters like retry counts for fetching data, limits on the number of signals and notifications, and flags enabling various features like DCA or long/short signals. Think of it as a way to peek under the hood and understand how the backtest kit is behaving, without actually changing the underlying settings. The values control things from how aggressively the system tries to get candle data to how many different types of reports are generated.

## Function getColumns

This function lets you see the current layout of columns used for generating reports. It provides a snapshot of all the columns involved in backtesting, heatmaps, live data, partial events, breakeven points, performance metrics, risk assessments, scheduling, strategy events, synchronization, profit tracking, maximum drawdown, walker panel performance, and strategy results. Importantly, this copy is safe – any changes you make won't affect the original column configuration. This is handy if you need to understand how your data is structured for reporting purposes.


## Function getClosePrice

To get the most recent closing price for a trading pair, use this function. 

It requires you to specify the symbol, like "BTCUSDT" for Bitcoin against USDT, and the time interval for the candles, which can be options like 1 minute, 5 minutes, or 4 hours. 

The function will then return a promise that resolves to the closing price of the last completed candle for that specific symbol and interval.

## Function getCandles

This function allows you to retrieve historical price data, also known as candles, from an exchange. You can specify which trading pair you're interested in, like BTCUSDT, and how frequent the data should be, choosing from intervals like 1 minute, 30 minutes, or 4 hours.  You also control how many candles you want to retrieve by setting a limit. The data returned will be candles going backwards from the current time, using the exchange's specific methods for obtaining this information.

## Function getBreakeven

This function helps determine if a trade has reached a point where it's profitable enough to cover the costs associated with the transaction. It essentially checks if the price has moved sufficiently in a positive direction to offset fees and slippage.  The function automatically adjusts its behavior based on whether it's running in a backtesting or live trading environment.

You provide the trading symbol and the current price, and it will return `true` if the price has exceeded the calculated breakeven threshold, and `false` otherwise. This helps monitor trade performance and assess risk.


## Function getBacktestTimeframe

This function helps you understand the specific timeframe being used for a backtest of a particular trading pair. 

Essentially, it tells you the dates within which the backtest is running for a symbol like BTCUSDT.

You provide the trading pair symbol as input, and it returns an array of dates representing the backtest timeframe for that symbol. This is useful for verifying the scope of your backtesting analysis.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, specifically using a technique called Volume Weighted Average Price, or VWAP. It looks back at the five most recent one-minute candles to make this calculation, considering both the price and the trading volume.  The VWAP is determined by averaging the typical price of each candle, which is calculated from its high, low, and closing prices, weighted by the volume traded at that price. If there's no trading volume available, it defaults to a simple average of the closing prices. To use it, you just need to provide the symbol of the trading pair, like "BTCUSDT".

## Function getAggregatedTrades

This function retrieves a collection of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the connected exchange.

By default, it fetches trades within a time window, but you can specify a `limit` to get only a certain number of the most recent trades. If you don't provide a `limit`, it will pull trades covering a predefined time range. The function returns a promise that resolves to an array containing details about each aggregated trade.

## Function getActionSchema

This function lets you access the detailed structure of a specific action within your trading strategy. Think of it as looking up the blueprint for how a particular action should be executed. You provide the action's unique name, and it returns a description of what data the action expects and what it does. This is helpful for validating user inputs or for generating documentation about your strategy's actions.

## Function formatQuantity

This function helps you display the correct quantity of an asset when trading. It takes the trading pair, like "BTCUSDT", and the raw quantity as input. Then, it automatically formats the quantity to match the specific rules of the exchange you're using, ensuring the right number of decimal places are shown. Essentially, it takes care of the technical details so you can accurately represent trading amounts.

## Function formatPrice

This function helps you display prices accurately for different trading pairs. 

It takes a symbol like "BTCUSDT" and the raw price as input.

The function then formats the price according to the rules of the specific exchange you're using, ensuring the correct number of decimal places are shown. 

Essentially, it handles the complexities of formatting prices for various exchanges, so you don't have to.


## Function dumpText

The `dumpText` function lets you send raw text data – think log messages, status updates, or anything you want to record – associated with a specific signal. It handles the details of figuring out which signal you're working with and whether you're in a backtest or a live trading environment, simplifying the process of keeping a record of what’s happening. You provide the function with a description and the actual text you want to log, along with a bucket name and a unique dump ID to organize your data. Essentially, it's a clean way to leave a trail of textual information related to your trading activities.


## Function dumpTable

This function lets you display data in a structured table format, useful for examining results during a backtest or live trading. It takes an array of objects – each object representing a row in the table – and displays them in a user-friendly way. The function smartly figures out which signal to associate the table with, and whether you're running a backtest or in live mode.  The column headings are automatically generated by looking at all the properties present across all the rows of data. 

You provide the data to be displayed, along with a description for the table, and the function handles the rest.


## Function dumpRecord

The `dumpRecord` function lets you save structured data related to a specific trading event. Think of it as creating a snapshot of important information like trade details or system state. It organizes this data with a unique identifier and a description, associating it with the current trading signal. The function cleverly figures out whether you're running a backtest or a live trading session based on its surroundings, streamlining the process for both environments. You don't need to explicitly specify which signal to associate with the record; it handles that automatically. 

It accepts an object with the following properties:

*   `bucketName`: A name for the storage location.
*   `dumpId`: A unique identifier for the record.
*   `record`: The actual data to be saved, structured as a set of key-value pairs.
*   `description`: A brief explanation of what the record represents.

The function returns a promise, indicating that the dumping process might take some time.

## Function dumpMCPStatus

This function helps you create a snapshot of your Model Context Protocol (MCP) status, essentially providing a record of what's happening within your trading system. It's particularly useful when analyzing and understanding how your trading strategies are performing.

The function automatically figures out which signal it's related to and whether you're running a backtest or live trading.

By default, the function formats this snapshot into a human-readable markdown file. Text messages will be included directly, and any images will be saved as separate files with links embedded within the markdown. You can also choose different formatting options to tailor the output to your needs, such as creating a simple text-only version. 

The function takes a data transfer object (DTO) with details like the bucket name, a unique dump ID, the MCP messages themselves, and a description for the snapshot.


## Function dumpJson

The `dumpJson` function lets you easily save complex data structures as formatted JSON to your bucket. Think of it as a way to record detailed snapshots of your trading decisions or system state. It automatically handles the technicalities of connecting to the correct environment – whether you're in a backtesting simulation or running live – so you don't have to worry about those details. You provide the data you want to save, along with a description, and it takes care of the rest, associating it with the signal for easy tracking.


## Function dumpError

This function, `dumpError`, helps you record detailed error information within your trading strategies, specifically associating it with the current trading signal. It’s useful for debugging and understanding why a trade didn't perform as expected. 

Think of it as creating a labeled snapshot of an error - you provide the error description, and it links that description to the signal that was active at the time. 

It handles the technical details of knowing which signal to associate the error with, and whether you're in a backtest or live trading environment, so you can focus on the error itself. To use it, you provide an object containing the bucket name, dump ID, content, and a description of the error.


## Function dumpAgentAnswer

This function helps you save the complete conversation history of an agent. It's useful for debugging or reviewing how an agent interacted within a specific scenario. The function automatically figures out which signal the agent was working on and whether the test is a backtest or live trading session, making the process straightforward. You provide a set of messages, a description, and identifiers to pinpoint where the data should be stored.

## Function createSignalState

The `createSignalState` function helps you manage and track the state of your trading signals in a straightforward way. It generates a pair of functions – `getState` and `setState` – that are linked to a specific bucket and start with a defined initial value.

The clever part is that these functions automatically know whether you're in backtesting or live trading mode, so you don’t need to pass in extra information.

This is particularly useful for sophisticated strategies, like those using large language models (LLMs), that need to gather data about individual trades over time. For instance, you can track metrics like the maximum gain reached and how long a trade remains open. The function facilitates the accumulation of metrics across trading intervals.


## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It’s a handy shortcut to adjust your take-profit, figuring out the right percentage shift based on your original take-profit distance. The system will automatically determine if it's running a backtest or a live trade, and also get the current market price to calculate the adjustment. You provide the symbol of the trading pair and the desired take-profit price, and it handles the rest. It returns a boolean indicating success or failure of the operation.

## Function commitTrailingTake

This function lets you fine-tune your trailing take-profit levels for open trades. It’s designed to dynamically adjust the distance of your take-profit order, keeping it responsive to price movements.

A key thing to remember is it calculates the adjustment based on your *original* take-profit level, not the current, trailing one. This helps prevent small errors from adding up over time.

The function only makes adjustments that move your take-profit *closer* to your entry price – it won't make it more aggressive.  For long positions, it'll only lower the take-profit, and for short positions, it'll only raise it. 

It also smartly figures out whether you're running a backtest or a live trade based on the environment it's running in. You provide the trading pair, the percentage shift you want to apply, and the current market price.


## Function commitTrailingStopCost

This function lets you manually set a new, fixed stop-loss price for a trade. It's designed to be simple to use – you provide the symbol and the price you want the stop-loss to be.

Behind the scenes, it calculates the appropriate percentage shift from the original stop-loss distance to ensure the new price is applied correctly. It handles whether you’re in a backtest or live trading environment and automatically gets the current market price to make the calculation. This simplifies the process of managing your stop-loss orders.


## Function commitTrailingStop

This function helps you manage trailing stop-loss orders for your trading signals. It adjusts the distance of the stop-loss, which is crucial for protecting profits and limiting losses.

It’s important to remember that this adjustment always relates to the original stop-loss distance you initially set, not any changes already made by the trailing stop. This prevents errors from building up over time.

Think of `percentShift` as a percentage change: a negative value brings your stop-loss closer to the entry price, while a positive value moves it further away.  However, it only adjusts the stop-loss if the new setting is actually *better* – more protective of your profits.

For long positions, the stop-loss can only move further away, and for short positions, it can only move closer. 

Finally, this function intelligently determines if it's being run in a backtesting environment or in live trading. You provide the symbol, the percentage shift you want to apply, and the current price to evaluate.

## Function commitSignalNotify

This function lets you send out informational messages about your trading strategy's actions. Think of it as a way to keep a record of what’s happening, or to trigger external alerts without actually changing your positions. You can use it to log important events within a trade, like when a technical indicator reaches a specific level.

It's really convenient because it automatically grabs key details like the trading pair, the name of your strategy, and the exchange you’re using – you don't have to manually include those.  It also automatically gets the current price for the trading pair.

You can include extra information in the notification using the `payload` parameter, allowing you to customize the message further.

## Function commitPartialProfitCost

This function lets you partially close a trading position when you've reached a specific profit target measured in dollars. It's designed to simplify closing a portion of your position, as it automatically calculates the percentage of the position to close based on the dollar amount you specify. 

Think of it as a way to take profits incrementally.

The function handles the complexities of determining the percentage of the position to close and automatically adapts to whether you’re in backtest or live trading mode.  It also retrieves the current average price to ensure accurate calculations. You simply provide the symbol of the trading pair and the dollar amount you want to recover as profit.


## Function commitPartialProfit

This function lets you automatically close a portion of your open trading position when the price is moving in a profitable direction, essentially helping you secure some gains. It allows you to specify the percentage of the position you want to close – for instance, closing 25% or 50% of it.  The function handles whether you're running a backtest or a live trade without needing to specify it directly. 

You provide the symbol of the trading pair and the percentage to close, and it takes care of the rest.


## Function commitPartialLossCost

This function lets you close part of your trading position when the price is moving in a direction that would trigger your stop-loss order, but you only want to reduce your losses by a specific dollar amount. It simplifies the process by automatically calculating the percentage of your position needed to close based on the dollar amount you specify.  Essentially, you tell it how much money you want to recover, and it handles the rest. The function works whether you’re in a backtesting environment or a live trading situation and automatically gets the current price to make the calculation. To use it, you provide the symbol of the trading pair and the dollar amount you want to use to reduce losses.

## Function commitPartialLoss

This function allows you to partially close an open position when the price is moving in a losing direction, essentially stepping closer to your stop-loss level. You specify the symbol of the trading pair and the percentage of your position you want to close, ranging from 0 to 100.  The framework automatically handles whether it's running in a backtesting or live trading environment. It's a way to manage risk by reducing exposure when the market is trending against you.


## Function commitCreateTakeProfit

This function lets you tell the system that a take-profit order for a position has been filled by the exchange, even if it wasn't triggered by the VWAP-based logic. It's used to reconcile what the strategy thinks is happening with what's actually happening on the exchange. The system recognizes if it's running a backtest or live trading and handles the close accordingly.

Essentially, it confirms that a take-profit order executed and makes sure the position gets closed with the appropriate reason ("take_profit") on the next market update. It won't do anything if there isn't a pending position waiting for a close. You can also add an optional note to the commit.

## Function commitCreateStopLoss

This function lets the backtest framework know when a stop-loss order has actually been filled on the exchange. Sometimes, the exchange executes the stop-loss at a different price than the strategy initially calculated, especially when prices move quickly. 

It informs the system that a position has been closed due to the stop-loss order, and the reason for the closure will be noted as "stop_loss."  The framework will handle this, even in both backtesting and live trading environments, determining the appropriate mode automatically.

You provide the trading symbol and, optionally, a note to document the event; the framework takes care of the rest. If there isn't a pending signal, this function does nothing.

## Function commitCreateSignal

This function lets you send custom trading signals into the backtest or live trading process. Think of it as a way to inject your own logic directly into the trading engine, rather than relying solely on the framework's built-in signal handling.

You provide a symbol, like "BTCUSDT", and a data package (called a DTO) containing signal instructions.  The framework then uses this to create a signal.

The signal's behavior depends on whether you include a "priceOpen" value. If you don’t provide one, the signal will execute right away at the current price. If you *do* specify a "priceOpen," it will either execute immediately if the price has already reached that level, or it will be scheduled to run when the price hits that target.

The framework checks that you're not already trying to execute another signal, and it automatically adjusts based on whether the system is running a backtest or live trading.


## Function commitClosePending

This function lets you manually close a pending order that's already been set up by your trading strategy. Think of it as acknowledging that a pending order should be closed, but without completely stopping your strategy from continuing to generate new signals. It's useful if you want to clear a pending order based on external factors, like market conditions, without disrupting your overall trading plan. Importantly, this only affects pending orders; any signals already scheduled or the core operation of your strategy remain unaffected. The function automatically adjusts its behavior depending on whether it's being used in a backtesting environment or a live trading setting.

You can optionally provide extra information with the function, such as an ID to identify the specific pending order and a note to document why it was closed.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy's overall operation. Think of it as hitting the pause button on a specific signal that was set to trigger later. It's useful if you need to adjust your plans mid-backtest or during live trading. Importantly, it won’t interfere with any existing orders or prevent your strategy from creating new signals; it just removes the pending one. You can even add a note to the cancellation for record-keeping purposes. The system intelligently figures out whether it's running a backtest or live trading session.

It accepts the trading symbol as required, and an optional payload containing an identifier and a note for tracking the cancellation.


## Function commitBreakeven

The `commitBreakeven` function lets you automatically manage your stop-loss orders. It's designed to protect profits by moving your stop-loss to the original entry price once the price has moved favorably enough to cover fees and a small safety margin.

Essentially, it's a way to lock in gains and reduce risk.

The function handles the details of determining the price threshold—it accounts for slippage and trading fees—and it works whether you're running a backtest or a live trading strategy. The current price is fetched automatically, simplifying the process. You only need to provide the trading symbol to use the function.

## Function commitAverageBuy

The `commitAverageBuy` function allows you to add a new piece to your dollar-cost averaging (DCA) strategy. It essentially records a purchase at the current market price, building up your position over time. 

This function automatically keeps track of the average price you're paying for the asset and announces that a new buy has been executed. It handles whether the backtest is running a simulation or live trading and gets the current price for you. You just need to provide the symbol of the trading pair, and you can optionally specify a cost.

## Function commitActivateScheduled

This function lets you trigger a scheduled signal before the price actually hits the target you initially set. It’s useful when you want to manually adjust the timing of your signals.

Essentially, you’re setting a flag that tells the strategy to activate the signal immediately on the next price update.

The function handles whether you're in a backtest or live trading environment automatically.

You’ll need to provide the trading symbol, and you can optionally include information like an ID and a note with the signal commitment.

## Function checkCandles

The `checkCandles` function is designed to quickly verify if your historical candle data is already available and properly stored. It efficiently checks the cached data using the persistence adapter. This process involves a focused read to confirm the presence of expected timestamps; if even one candle is missing or misaligned, the function immediately recognizes this without needing to load the entire dataset. Essentially, it's a fast way to determine if you need to download more data.

It takes a set of validation parameters to guide the check.


## Function cacheCandles

The `cacheCandles` function is designed to make sure you have the historical candle data you need for backtesting. It works by first verifying if the candles already exist in your storage, and if not, it will fetch and download the missing data. This process includes a retry mechanism to ensure the data is validated correctly. You provide details like the symbol you're interested in, the timeframe (interval) of the candles, the start and end dates, the exchange where the data comes from, and optional functions to monitor the start of the check and warm-up phases. Essentially, it’s a reliable way to populate your data store with the historical price information required for effective backtesting.


## Function addWalkerSchema

The `addWalkerSchema` function lets you register a new walker, which is a crucial component for comparing different trading strategies. Think of a walker as a specialized tool that runs multiple strategy backtests simultaneously, using the same historical data. This allows for a direct comparison of how each strategy performs, judged by a particular metric you define.  You provide the walker's configuration details – essentially telling the system how to execute and analyze these strategy comparisons – through the `walkerSchema` parameter. This function expands the framework's capabilities, letting you tailor the backtesting process for more complex comparative analyses.


## Function addSweepSchema

This function lets you define and register a "sweep" – essentially a systematic way to test and optimize trading strategies. It runs each strategy through a single candle to quickly evaluate performance across a range of potential parameters.

The process trains the system on which assets to trade and which to avoid.

It calculates the results of different entry and exit point combinations, providing a way to find the best settings for your trading idea. You can specify the ranges for these parameters, or the system will use default settings if you don't.


## Function addStrategySchema

This function lets you register a new trading strategy with the backtest-kit framework. When you register a strategy, the system will automatically check it to make sure signals are valid, prevent excessive or rapid signals, and safely store the strategy's details even if something unexpected happens during live trading. You provide the strategy's configuration details as an object, and this function handles registering it within the framework.


## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as defining your risk management rules.

You provide a sizing schema, which is essentially a set of instructions that covers things like how much of your capital to risk on each trade, the method used to calculate the position size (like a fixed percentage, or a more complex formula), and limits on how big a position can be. By registering these rules, the framework will use them when executing trades during the backtest.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up guardrails to prevent overexposure and ensure stability. 

It allows you to specify limits on how many positions you can hold at once, across all your trading strategies.

You can also implement more sophisticated risk checks—like analyzing correlations between assets or monitoring portfolio-level metrics—to make sure your risk is well understood.

Finally, it provides a way to react to situations where a trading signal is initially rejected, giving you a chance to adjust or override the decision.

This risk configuration is shared by all your trading strategies, so you can easily analyze how different strategies interact and affect overall portfolio risk. It keeps track of all active positions, which provides valuable data for your custom validations.

## Function addMCPSchema

This function lets you connect your trading strategy to a Model Context Protocol (MCP) agent. Think of it as creating a bridge that allows an external agent to monitor and interact with your live trading strategy. It allows the agent to receive updates about your strategy's status and send commands related to positions. 

The MCP links a specific strategy, so all snapshots and position commands will affect that particular strategy instance. If you need more detailed information, you can customize how the portfolio is presented to the agent. Otherwise, the system will provide a basic text message for each traded symbol.

To use this, you provide an MCP configuration object that defines how the connection will be established.

## Function addFrameSchema

This function lets you tell the backtest-kit how to generate the timeframes it will use for your backtesting analysis. Think of it as defining the boundaries and granularity of your historical data – when the tests start, when they end, and how frequently data points are created. You provide a configuration object that specifies those details, like the start and end dates of your backtest and the time interval (e.g., daily, hourly). This ensures the backtest-kit knows exactly what timeframe data to use for simulating trades.

## Function addExchangeSchema

This function lets you tell the backtest-kit about a new data source for an exchange. Think of it as introducing a specific exchange, like Binance or Coinbase, to the system so it knows where to get historical price data.

By registering an exchange, the framework will be able to fetch candles (historical price bars), format prices and quantities appropriately for that exchange, and even calculate VWAP (a common trading indicator) based on recent trades. 

You provide the exchange's configuration details, which include how to access the data and other exchange-specific settings. This is a key step in setting up your backtesting environment to accurately reflect the conditions of the exchange you’re analyzing.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a special action you want it to perform during backtesting. Think of actions as triggers – they're events that happen during your strategy’s execution, and you can use them to do things like update a state management tool, send notifications, log events, or even kick off custom logic. 

Essentially, you're registering a way for the framework to react to important milestones in your trading strategy, like a new signal or reaching a certain profit level.

Each action is tied to a specific strategy and the timeframe it's running on.

You provide a configuration object, `actionSchema`, that defines how this action should behave and what it should do when triggered.
