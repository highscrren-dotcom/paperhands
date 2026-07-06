# Schema Registration API

All schema types follow the same pattern: `add*`, `override*`, `list*`, `get*`.

## Exchange Schema

```typescript
addExchangeSchema({
  exchangeName: 'binance',                              // required, unique key
  getCandles: async (symbol, interval, since, limit, backtest) => IPublicCandleData[],  // required
  formatPrice: async (symbol, price, backtest) => string,     // optional, default: 2 decimals
  formatQuantity: async (symbol, quantity, backtest) => string, // optional, default: 8 decimals
  getOrderBook: async (symbol, depth, from, to, backtest) => IOrderBookData,  // optional
  getAggregatedTrades: async (symbol, from, to, backtest) => IAggregatedTradeData[], // optional
  callbacks: { onCandleData: (symbol, interval, since, limit, data) => void },
  note: 'optional dev note',
});

await overrideExchangeSchema({ exchangeName: 'binance', formatPrice: ... }); // partial update
const exchanges = await listExchangeSchema();   // IExchangeSchema[]
const schema = getExchangeSchema('binance');    // IExchangeSchema
```

## Strategy Schema

```typescript
addStrategySchema({
  strategyName: 'my-strategy',     // required, unique key
  getSignal: async (symbol, when, currentPrice) => ISignalDto | null,  // required
  interval: '5m',                  // throttle: '1m'|'3m'|'5m'|'15m'|'30m'|'1h'
  riskName: 'demo',                // optional: single risk schema
  riskList: ['risk1', 'risk2'],    // optional: multiple risk schemas (all must pass)
  actions: ['action1'],            // optional: action schema names
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => void,
    onClose: (symbol, signal, priceClose, backtest) => void,
    onActive: (symbol, signal, currentPrice, backtest) => void,
    onIdle: (symbol, currentPrice, backtest) => void,
    onSchedule: (symbol, signal, currentPrice, backtest) => void,
    onCancel: (symbol, signal, reason, backtest) => void,
    onTick: (...) => void,
    onPartialProfit: (...) => void,
    onPartialLoss: (...) => void,
    onBreakeven: (...) => void,
    // ... more lifecycle hooks
  },
  note: 'optional',
});
```

### ISignalDto fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `position` | Yes | `'long' \| 'short'` | Trade direction |
| `priceTakeProfit` | Yes | `number` | Above entry for long, below for short |
| `priceStopLoss` | Yes | `number` | Below entry for long, above for short |
| `priceOpen` | No | `number` | Omit = open at VWAP. Set = scheduled entry |
| `minuteEstimatedTime` | No | `number` | Default: CC_MAX_SIGNAL_LIFETIME_MINUTES (1440) |
| `cost` | No | `number` | Default: CC_POSITION_ENTRY_COST (100) |
| `note` | No | `string` | Human-readable description |
| `id` | No | `string` | Auto-generated UUID if omitted |

## Frame Schema

```typescript
addFrameSchema({
  frameName: '1d-test',              // required, unique key
  interval: '1m',                    // tick granularity: '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'2h'|'4h'|'6h'|'8h'|'12h'|'1d'
  startDate: new Date('2024-01-01'), // required, inclusive
  endDate: new Date('2024-01-02'),   // required, inclusive
  callbacks: { onTimeframe: (timeframe, startDate, endDate, interval) => void },
});
```

Tip: match frame `interval` to strategy `interval`. Finer frame interval = more TP/SL monitoring accuracy.

## Risk Schema

```typescript
addRiskSchema({
  riskName: 'demo',                 // required, unique key
  maxConcurrentPositions: 5,        // optional, cross-strategy limit
  validations: [
    // Plain function form:
    ({ pendingSignal, currentPrice, activePositionCount, activePositions, symbol, strategyName, timestamp }) => {
      if (something) throw new Error('Rejection reason');
    },
    // Object form with documentation:
    {
      validate: ({ pendingSignal }) => { /* ... */ },
      docDescription: 'Enforce min R/R ratio of 2:1',
    },
  ],
  callbacks: {
    onRejected: (symbol, reason, limit, params) => void,
    onAllowed: (symbol, params) => void,
  },
});
```

### Validation payload fields

| Field | Type | Notes |
|---|---|---|
| `symbol` | `string` | Trading pair |
| `currentSignal` | `IRiskSignalRow` | Signal with resolved `priceOpen` |
| `strategyName` | `string` | |
| `currentPrice` | `number` | |
| `timestamp` | `number` | Unix ms |
| `activePositionCount` | `number` | Total open across all strategies |
| `activePositions` | `IRiskActivePosition[]` | Details of each open position |

### Validation return values

| Return | Meaning |
|---|---|
| `void` / `null` | Signal allowed |
| Throws `Error` | Rejected — error.message is the reason |
| Returns `{ id, note }` | Rejected with structured ID |

## Sizing Schema

```typescript
// Fixed percentage
addSizingSchema({
  sizingName: 'conservative',
  method: 'fixed-percentage',
  riskPercentage: 1,           // % of account to risk
  maxPositionPercentage: 10,   // max % of account
  minPositionSize: 10,         // USD floor
  maxPositionSize: 500,        // USD ceiling
});

// Kelly Criterion
addSizingSchema({
  sizingName: 'kelly',
  method: 'kelly-criterion',
  kellyMultiplier: 0.25,       // fraction of Kelly (0.25 = quarter Kelly)
  maxPositionPercentage: 20,
});

// ATR-based
addSizingSchema({
  sizingName: 'atr-dynamic',
  method: 'atr-based',
  riskPercentage: 2,
  atrMultiplier: 2,            // stop distance = ATR × 2
  maxPositionSize: 800,
});
```

Use `PositionSize` helper inside `getSignal`:

```typescript
import { PositionSize } from 'backtest-kit';

const cost = await PositionSize.fixedPercentage(symbol, accountBalance, priceOpen, priceStopLoss, { sizingName: 'conservative' });
const cost = await PositionSize.kellyCriterion(symbol, accountBalance, priceOpen, winRate, winLossRatio, { sizingName: 'kelly' });
const cost = await PositionSize.atrBased(symbol, accountBalance, priceOpen, atr, { sizingName: 'atr-dynamic' });
```

## Walker Schema

```typescript
addWalkerSchema({
  walkerName: 'rsi-optimizer',     // required, unique key
  exchangeName: 'binance',         // required
  frameName: '30d-backtest',       // required
  strategies: ['rsi-9', 'rsi-14', 'rsi-21'],  // required
  metric: 'sharpeRatio',           // optional, default: 'sharpeRatio'
  callbacks: {
    onStrategyStart: (strategyName, symbol) => void,
    onStrategyComplete: (strategyName, symbol, stats, metric) => void,
    onStrategyError: (strategyName, symbol, error) => void,
    onComplete: (results: IWalkerResults) => void,
  },
});
```

### WalkerMetric values
`"sharpeRatio"` | `"annualizedSharpeRatio"` | `"winRate"` | `"totalPnl"` | `"certaintyRatio"` | `"avgPnl"` | `"expectedYearlyReturns"`
