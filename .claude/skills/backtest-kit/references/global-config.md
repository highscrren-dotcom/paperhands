# Global Config and Logger

## setConfig

```typescript
import { setConfig, getConfig, getDefaultConfig } from 'backtest-kit';

setConfig({
  CC_PERCENT_SLIPPAGE: 0.05,        // % slippage per fill (default: 0.1)
  CC_PERCENT_FEE: 0.1,              // % fee per fill (default: 0.1)
  CC_POSITION_ENTRY_COST: 250,      // default position cost USD (default: 100)
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 2880, // max position duration (default: 1440)
  CC_SCHEDULE_AWAIT_MINUTES: 120,   // scheduled signal timeout (default: 120)
});
```

Call once at startup before registering schemas. Partial updates OK.

## Key Config Options

### Execution costs
- `CC_PERCENT_SLIPPAGE` (0.1) — applied on entry AND exit → ~0.2% total
- `CC_PERCENT_FEE` (0.1) — applied on entry AND exit → ~0.2% total
- `CC_POSITION_ENTRY_COST` (100) — default USD cost per entry / DCA

### Signal price guards
- `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` (0.5) — TP must be at least this % from entry
- `CC_MIN_STOPLOSS_DISTANCE_PERCENT` (0.5) — SL must be at least this % from entry
- `CC_MAX_STOPLOSS_DISTANCE_PERCENT` (20) — SL cannot be more than this % from entry

### Signal lifetime
- `CC_MAX_SIGNAL_LIFETIME_MINUTES` (1440) — auto-expire after this many minutes
- `CC_MAX_SIGNAL_GENERATION_SECONDS` (180) — timeout for getSignal (important for LLM calls!)

### Candle fetching
- `CC_GET_CANDLES_RETRY_COUNT` (3) — retries on failed getCandles
- `CC_GET_CANDLES_RETRY_DELAY_MS` (5000) — delay between retries
- `CC_MAX_CANDLES_PER_REQUEST` (1000) — auto-paginated if more needed
- `CC_ENABLE_CANDLE_FETCH_MUTEX` (true) — serializes concurrent fetches for same symbol/interval

### Behavior flags
- `CC_ENABLE_DCA_EVERYWHERE` (false) — when true, DCA accepts any price below priceOpen
- `CC_ENABLE_PPPL_EVERYWHERE` (false) — allow mixed profit/loss partial exits
- `CC_ENABLE_TRAILING_EVERYWHERE` (false) — trailing activates immediately regardless of absorption
- `CC_BREAKEVEN_THRESHOLD` (0.2) — min profit % before breakeven move is valid

### AVG price
- `CC_AVG_PRICE_CANDLES_COUNT` (5) — number of 1m candles for VWAP calculation

### Report row limits (all default 250)
`CC_MAX_BACKTEST_MARKDOWN_ROWS`, `CC_MAX_LIVE_MARKDOWN_ROWS`, `CC_MAX_RISK_MARKDOWN_ROWS`,
`CC_MAX_SCHEDULE_MARKDOWN_ROWS`, `CC_MAX_PARTIAL_MARKDOWN_ROWS`, etc.

## setLogger

```typescript
import { setLogger } from 'backtest-kit';

setLogger({
  log: (topic, ...args) => console.log('[LOG]', topic, ...args),
  debug: (topic, ...args) => console.debug('[DEBUG]', topic, ...args),
  info: (topic, ...args) => console.info('[INFO]', topic, ...args),
  warn: (topic, ...args) => console.warn('[WARN]', topic, ...args),
});
```

Default: no-op logger (silent). The framework injects context (strategyName, exchangeName, symbol, backtest) as trailing args automatically.
