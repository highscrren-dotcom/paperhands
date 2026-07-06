# @backtest-kit/cli and Broker Adapter

## @backtest-kit/cli

### Installation & Scaffold

```bash
npm install @backtest-kit/cli backtest-kit

# Scaffold a new project
npx @backtest-kit/cli --init --output my-trading-bot
cd my-trading-bot && npm install
```

### CLI Flags

| Flag | Description |
|---|---|
| `--backtest` | Historical backtest |
| `--walker` | A/B strategy comparison |
| `--paper` | Paper trading (live prices, no orders) |
| `--live` | Live trading |
| `--ui` | Web dashboard at `http://localhost:60050` |
| `--telegram` | Trade notifications via Telegram |
| `--symbol` | Trading pair (default: `"BTCUSDT"`) |
| `--strategy` | Strategy name (default: first registered) |
| `--exchange` | Exchange name |
| `--frame` | Frame name |
| `--noCache` | Skip candle cache warming |
| `--noFlush` | Keep existing report folders |
| `--cacheInterval` | Intervals to pre-cache (default: `"1m, 15m, 30m, 4h"`) |
| `--verbose` | Log each candle fetch |

### npm scripts in generated project

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./content/my-strategy.ts",
    "paper":    "npx @backtest-kit/cli --paper    ./content/my-strategy.ts",
    "start":    "npx @backtest-kit/cli --live     ./content/my-strategy.ts"
  }
}
```

Run: `npm run backtest -- --symbol BTCUSDT --ui`

### Walker (A/B Comparison)

```bash
npx @backtest-kit/cli --walker \
  --symbol BTCUSDT --noCache --markdown \
  --output feb_comparison \
  ./content/v1.strategy.ts ./content/v2.strategy.ts
```

### Pine Script Mode

```bash
npx @backtest-kit/cli --pine ./math/my_indicator.pine \
  --symbol BTCUSDT --timeframe 15m --limit 180 --markdown
```

Output columns come from `plot(..., display=display.data_window)` calls.

### Programmatic API

```typescript
import { run } from '@backtest-kit/cli';

await run('backtest', {
  entryPoint: './content/my-strategy.ts',
  symbol: 'BTCUSDT',
  frame: 'feb-2024',
  cacheInterval: ['1m', '15m', '1h'],
});
```

### Module Hooks (broker adapter loading)

| Mode flag | Module file |
|---|---|
| `--live` | `./modules/live.module.mjs` |
| `--paper` | `./modules/paper.module.mjs` |
| `--backtest` | `./modules/backtest.module.mjs` |

### Environment Variables

```env
CC_TELEGRAM_TOKEN=your_bot_token
CC_TELEGRAM_CHANNEL=-100123456789
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
```

---

## Broker Adapter

Intercepts every trade mutation **before** internal state changes. If it throws, mutation rolls back — backtest-kit retries on next tick. Adapter is only called in live mode.

### Registration

```typescript
import { Broker } from 'backtest-kit';

Broker.useBrokerAdapter(MyBroker);  // register before enable()
const dispose = Broker.enable();    // subscribe to event bus
// Later: dispose() or Broker.disable()
```

### IBroker interface

```typescript
interface IBroker {
  waitForInit(): Promise<void>;
  onSignalOpenCommit(payload: BrokerSignalOpenPayload): Promise<void>;
  onSignalCloseCommit(payload: BrokerSignalClosePayload): Promise<void>;
  onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void>;
  onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void>;
  onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void>;
  onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void>;
  onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void>;
  onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void>;
}
```

Use `Partial<IBroker>` to implement only needed methods, or extend `BrokerBase` for no-op defaults.

### Minimal example (notification only)

```typescript
import { BrokerBase, Broker } from 'backtest-kit';

class NotifyBroker extends BrokerBase {
  async onSignalOpenCommit(payload) {
    await fetch('https://notify.example.com/open', {
      method: 'POST',
      body: JSON.stringify({ symbol: payload.symbol, position: payload.position }),
    });
  }

  async onSignalCloseCommit(payload) {
    await fetch('https://notify.example.com/close', {
      method: 'POST',
      body: JSON.stringify({ symbol: payload.symbol, pnl: payload.pnl }),
    });
  }
}

Broker.useBrokerAdapter(NotifyBroker);
Broker.enable();
```

### Transactional integrity rule

If the adapter throws → mutation is skipped → backtest-kit retries next tick.
Your adapter must ensure exchange state is consistent before throwing (cancel partial fills, etc.).

See full Spot and Futures CCXT implementations in `configuration/broker-adapter` docs.
