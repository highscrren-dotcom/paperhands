# Persistence Adapters

Live mode only — backtest is stateless (nothing written to disk).

## How it works

State is written atomically (write-then-rename) after every mutation to `./dump/data/<category>/`. On restart, framework reads last persisted state and resumes monitoring.

## Available Adapters

| Singleton | Method | Category |
|---|---|---|
| `PersistSignalAdapter` | `usePersistSignalAdapter(Ctor)` | Open signal state per symbol/strategy |
| `PersistRiskAdapter` | `usePersistRiskAdapter(Ctor)` | Active positions per risk profile |
| `PersistScheduleAdapter` | `usePersistScheduleAdapter(Ctor)` | Pending scheduled signals |
| `PersistPartialAdapter` | `usePersistPartialAdapter(Ctor)` | Partial profit/loss levels |
| `PersistBreakevenAdapter` | `usePersistBreakevenAdapter(Ctor)` | Breakeven flags |
| `PersistCandleAdapter` | `usePersistCandleAdapter(Ctor)` | Candle cache |
| `PersistStorageAdapter` | `usePersistStorageAdapter(Ctor)` | General key-value |
| `PersistNotificationAdapter` | `usePersistNotificationAdapter(Ctor)` | Notification history |
| `PersistLogAdapter` | `usePersistLogAdapter(Ctor)` | Log entries |
| `PersistMeasureAdapter` | `usePersistMeasureAdapter(Ctor)` | Performance metrics |
| `PersistIntervalAdapter` | `usePersistIntervalAdapter(Ctor)` | Interval-scoped state |
| `PersistMemoryAdapter` | `usePersistMemoryAdapter(Ctor)` | In-memory keyed storage |
| `PersistRecentAdapter` | `usePersistRecentAdapter(Ctor)` | Recent signal summaries |

## IPersistBase interface

```typescript
interface IPersistBase<Entity> {
  waitForInit(initial: boolean): Promise<void>;
  readValue(entityId: string | number): Promise<Entity>;
  hasValue(entityId: string | number): Promise<boolean>;
  writeValue(entityId: string | number, entity: Entity): Promise<void>;
  keys(): AsyncGenerator<string | number>;
}
```

## Custom Adapter (Redis example)

```typescript
import { PersistBase, PersistSignalAdapter } from 'backtest-kit';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

class RedisPersist extends PersistBase {
  async readValue(entityId: string | number) {
    const raw = await redis.get(String(entityId));
    if (!raw) throw new Error(`Entity ${entityId} not found`);
    return JSON.parse(raw);
  }

  async writeValue(entityId: string | number, entity: unknown) {
    await redis.set(String(entityId), JSON.stringify(entity));
  }

  async hasValue(entityId: string | number) {
    return (await redis.exists(String(entityId))) === 1;
  }

  async *keys() {
    const all = await redis.keys('*');
    for (const key of all) yield key;
  }
}

// Register BEFORE calling Live.background()
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
```

## Disable Persistence (staging/paper trading)

```typescript
import { PersistSignalAdapter, PersistRiskAdapter, PersistScheduleAdapter } from 'backtest-kit';

PersistSignalAdapter.useDummy();     // no-op — disables crash recovery
PersistRiskAdapter.useDummy();
PersistScheduleAdapter.useDummy();
```

## Reset to Default File Adapter

```typescript
PersistSignalAdapter.useJson();
```

## Clear Instance Cache

```typescript
PersistSignalAdapter.clear();  // needed if working directory changes between runs
```

## Default File Layout

```
./dump/data/
├── signal/          # symbol_strategy_exchange combinations
├── risk/            # active position maps per risk profile
├── schedule/        # pending scheduled signals
├── partial/         # partial profit/loss levels per signal
├── breakeven/       # breakeven state per signal
├── candle/          # cached candle data
├── storage/         # general key-value storage
├── notification/    # notification history
├── log/             # structured log entries
├── measure/         # performance cache
├── interval/        # interval-scoped state
├── memory/          # in-memory keyed storage (BM25 indexes)
└── recent/          # recent signal summaries
```
