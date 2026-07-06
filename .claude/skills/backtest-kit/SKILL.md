---
name: backtest-kit
description: |
  Expert assistant for the `backtest-kit` TypeScript trading framework. Use this skill whenever the user:
  - Asks how to write, debug, or improve a backtest-kit strategy
  - Asks about any backtest-kit API: schemas (addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema, addSizingSchema, addWalkerSchema), Backtest/Live/Walker classes, commit functions (commitPartialProfit, commitBreakeven, commitTrailingStop, etc.), event listeners (listenSignal*, listenDone*, listenPartialProfitAvailable, etc.), strategy context functions (getCandles, getPendingSignal, getAveragePrice, etc.)
  - Asks about LLM integration via `json-inference` package or `@backtest-kit/ollama`
  - Asks about @backtest-kit/graph (DAG indicator pipelines), @backtest-kit/cli (runner), @backtest-kit/pinets (Pine Script)
  - Asks about broker adapter (Broker, IBroker, BrokerBase), persistence adapters (PersistSignalAdapter, etc.)
  - Has errors in backtest-kit code and needs help fixing them
  - Wants to scaffold a project or understand project structure
  - Asks "how do I..." questions about algorithmic trading with backtest-kit
  Trigger even if the user just shows a `.strategy.ts` or `.strategy.mjs` file and asks a question about it.
---

# Backtest Kit Expert

You are an expert on the `backtest-kit` TypeScript framework for building, backtesting, and live-trading algorithmic strategies. Your job is to write correct, idiomatic TypeScript code and explain how the framework works.

## Core Mental Model

Backtest Kit is a **time execution engine**: it steps through candles one tick at a time, calls `getSignal` on your strategy, and manages the full position lifecycle (entry → monitoring → exit) with accurate PnL. The same strategy code runs in both backtest and live mode — only the runner changes (`Backtest.background` vs `Live.background`).

Everything is registered by name before running:

```
addExchangeSchema → addRiskSchema → addStrategySchema → addFrameSchema
                                                              ↓
                  Backtest.background(symbol, { strategyName, exchangeName, frameName })
```

## Schema Registration (the four essentials)

### Exchange schema
```typescript
import ccxt from 'ccxt';
import { addExchangeSchema } from 'backtest-kit';

addExchangeSchema({
  exchangeName: 'binance',
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: (symbol, price) => price.toFixed(2),
  formatQuantity: (symbol, quantity) => quantity.toFixed(8),
});
```

### Strategy schema
```typescript
import { addStrategySchema, getCandles } from 'backtest-kit';

addStrategySchema({
  strategyName: 'my-strategy',
  interval: '5m',       // throttle between getSignal calls: '1m'|'3m'|'5m'|'15m'|'30m'|'1h'
  riskName: 'demo',     // optional: attach a risk schema
  getSignal: async (symbol, when, currentPrice) => {
    const candles = await getCandles(symbol, '15m', 48);
    const latest = candles[candles.length - 1];
    if (latest.close > latest.open) {
      return {
        position: 'long',
        priceTakeProfit: currentPrice * 1.03,
        priceStopLoss: currentPrice * 0.985,
        minuteEstimatedTime: 240,  // optional, defaults to 1440
        cost: 100,                 // optional, defaults to CC_POSITION_ENTRY_COST
      };
    }
    return null;  // no signal this tick
  },
});
```

**ISignalDto required fields:** `position`, `priceTakeProfit`, `priceStopLoss`
**ISignalDto optional fields:** `priceOpen` (scheduled entry), `minuteEstimatedTime`, `cost`, `note`, `id`

### Frame schema (backtest only)
```typescript
addFrameSchema({
  frameName: '1d-test',
  interval: '1m',   // tick granularity: finer = slower but more accurate TP/SL
  startDate: new Date('2025-12-01'),
  endDate: new Date('2025-12-02'),
});
```

### Risk schema
```typescript
addRiskSchema({
  riskName: 'demo',
  maxConcurrentPositions: 3,   // optional portfolio limit
  validations: [
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
      const tpDist = position === 'long'
        ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
        : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
      if (tpDist < 1) throw new Error(`TP too close: ${tpDist.toFixed(2)}%`);
    },
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
      const reward = position === 'long' ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
      const risk   = position === 'long' ? priceOpen - priceStopLoss : priceStopLoss - priceOpen;
      if (reward / risk < 2) throw new Error('Poor R/R ratio');
    },
  ],
});
```

## Running a Backtest

```typescript
import { Backtest, listenSignalBacktest, listenDoneBacktest } from 'backtest-kit';

Backtest.background('BTCUSDT', {
  strategyName: 'my-strategy',
  exchangeName: 'binance',
  frameName: '1d-test',
});

listenSignalBacktest((event) => {
  if (event.action === 'closed') {
    console.log(event.closeReason, event.pnl.pnlPercentage.toFixed(2) + '%');
  }
});

listenDoneBacktest(async (event) => {
  await Backtest.dump(event.symbol, {
    strategyName: event.strategyName,
    exchangeName: event.exchangeName,
    frameName: event.frameName,
  });
});
```

## Running Live

Replace `Backtest.background` with `Live.background`. No frameName needed. Live mode persists state atomically — crash recovery is automatic.

```typescript
import { Live, listenSignalLive } from 'backtest-kit';

Live.background('BTCUSDT', {
  strategyName: 'my-strategy',
  exchangeName: 'binance',
});

listenSignalLive(async (event) => {
  if (event.action === 'closed') {
    await Live.dump(event.symbol, { strategyName: event.strategyName, exchangeName: event.exchangeName });
  }
});
```

## Signal Lifecycle

```
idle → [getSignal returns non-null] → opened → active (monitoring) → closed
                                    ↘ scheduled (if priceOpen set) → opened → active → closed
```

**Close reasons:** `take_profit` | `stop_loss` | `time_expired` | `closed` (manual)

**Key rule:** `getSignal` is NOT called while a position is active. The strategy waits for the current position to close.

## Strategy Context Functions (call inside getSignal or callbacks)

| Function | Returns | Use for |
|---|---|---|
| `getCandles(symbol, interval, limit)` | `ICandleData[]` | Multi-timeframe data |
| `getAveragePrice(symbol)` | `number` | VWAP of last 5 1m candles |
| `getPendingSignal(symbol)` | `IPublicSignalRow \| null` | Check if position open |
| `hasNoPendingSignal(symbol)` | `boolean` | Guard before new signal |
| `getPositionPnlPercent(symbol)` | `number \| null` | Unrealized PnL % |
| `getDate()` | `Date` | Current simulated/real time |
| `getMode()` | `"backtest" \| "live"` | Branch on mode |
| `getLatestSignal(symbol)` | `IPublicSignalRow \| null` | Cooldown logic |

## Commit Functions (call from event listeners or getSignal)

```typescript
// Partial exits
await commitPartialProfit(symbol, 30);          // close 30% at profit
await commitPartialLoss(symbol, 20);            // close 20% at loss
await commitPartialProfitCost(symbol, 150);     // close $150 worth at profit

// Trailing
await commitTrailingStopCost(symbol, 48500);    // move SL to absolute price
await commitTrailingTakeCost(symbol, 52000);    // move TP to absolute price
await commitTrailingStop(symbol, -5, price);    // shift SL by % of original distance

// Breakeven
await commitBreakeven(symbol);                  // move SL to entry price

// Position management
await commitAverageBuy(symbol);                 // add DCA entry
await commitClosePending(symbol);               // force-close
await commitCancelScheduled(symbol);            // cancel scheduled entry
```

**Important:** Commit functions require an active execution context. Call them only inside event listeners or strategy callbacks — never at module top-level.

## Event Listeners

```typescript
// Position milestones
listenPartialProfitAvailable(async (event) => {
  if (event.level === 30) await commitPartialProfit(event.symbol, 30);
});

listenBreakevenAvailable(async (event) => {
  await commitBreakeven(event.symbol);
});

listenActivePing(async (event) => {
  // fires every minute while position is open
  await commitTrailingStopCost(event.symbol, event.data.priceOpen * 0.98);
});

// Lifecycle
listenDoneBacktest(async (event) => { /* backtest finished */ });
listenRisk((event) => { console.log('rejected:', event.comment); });
listenError((err) => { console.error(err); });
```

Every listener returns an unsubscribe function. All listeners have `Once` variants.

## Reference Files

For detailed API reference, read the appropriate file:

- **Schemas API** (add/override/list/get for all schema types): `references/schemas-api.md`
- **Backtest/Live/Walker classes**: `references/runners.md`
- **Commit functions** (full params): `references/commit-functions.md`
- **Event listeners** (full list): `references/event-listeners.md`
- **LLM integration** (json-inference, multi-timeframe AI strategies): `references/llm-integration.md`
- **@backtest-kit/graph** (DAG indicator pipelines): `references/graph.md`
- **@backtest-kit/cli** (runner flags, Pine Script mode, broker adapter): `references/cli-and-broker.md`
- **Global config** (setConfig, setLogger): `references/global-config.md`
- **Persistence adapters**: `references/persistence.md`

## When in doubt — study the local baseline (ФОРК-ПРАВКА)

If something isn't working, the structure is unclear, or a real working example is
needed — study `example/` **in this repo** (paperhands = форк backtest-kit; example
уже здесь, клонировать ничего не надо). Reference strategies there are *reference
implementations*, NOT proven profit generators: их месячные цифры — in-sample
одномесячные прогоны (Apr 2026 +67.85% при Sharpe 0.12 = дисперсия; oct_2021
проиграл buy&hold −21 п.п.).

**Доктрина этого репо (paperhands/CLAUDE.md — она главнее этого скилла):**
- К любой цифре бэктеста скептически до OOS/walk-forward
  (`agent/tools/oos-gate.mjs`) и paper-форварда; порядок backtest → paper → live.
- min TP 1%, R/R ≥ 2; фрикшн 0.1%+0.1% всегда на виду; funding/спред НЕ
  моделируются — помни при оценке EV.
- Прибыльность не обещаем; нет эджа — фиксируем честно.
- Look-ahead абсолютен: стратегия видит мир только через контекстные функции.

---

## Common Mistakes to Catch

1. **Missing `await`** on async context functions (`getCandles`, `getAveragePrice`, `getPendingSignal`, etc.)
2. **Wrong TP/SL direction** — for `long`: TP must be above entry, SL below. For `short`: opposite.
3. **Calling commit functions at top level** — they need an active execution context.
4. **Forgetting `frameName`** in `Backtest.background` context (not needed for `Live`).
5. **Using `getMode()` without `await`** — it's async.
6. **Returning signal when position is already open** — `getSignal` won't be called while active, but if using guards: check `hasNoPendingSignal`.
7. **Not registering schemas before calling background()** — registration must happen synchronously before the runner starts.
8. **TP/SL too close** — built-in validation rejects signals where TP or SL is less than `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` (default 0.5%) from entry.

## Code Generation Guidelines

When generating strategy code:
- Always use TypeScript with proper imports from `'backtest-kit'`
- Always `await` async functions inside `getSignal`
- Include error handling in broker adapters (they must throw to trigger rollback)
- For LLM strategies, use `json-inference` package with `generateObject` + `InferenceName`
- For multi-timeframe strategies, consider `@backtest-kit/graph` DAG pattern
- When the user needs a full working example, generate all four schemas + runner in one file
