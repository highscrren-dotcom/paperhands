# @backtest-kit/graph — DAG Indicator Pipelines

## Installation

```bash
npm install @backtest-kit/graph backtest-kit
```

## Concept

Define source nodes (fetch raw data) and output nodes (derive values). Call `resolve()` — the graph runs all sources in parallel via `Promise.all`, then passes typed results to output nodes in topological order.

## Building a Graph

```typescript
import { sourceNode, outputNode, resolve } from '@backtest-kit/graph';
import { getCandles, addStrategySchema } from 'backtest-kit';

// Source nodes — fetch raw data
const closePrice = sourceNode(async (symbol, when, currentPrice, exchangeName) => {
  const candles = await getCandles(symbol, '1h', 1, exchangeName);
  return candles[0].close;
});

const volume = sourceNode(async (symbol, when, currentPrice, exchangeName) => {
  const candles = await getCandles(symbol, '1h', 1, exchangeName);
  return candles[0].volume;
});

// Output node — TypeScript infers types from upstream nodes
const vwap = outputNode(
  ([price, vol]) => price * vol,  // price: number, vol: number — inferred
  closePrice,
  volume,
);

// Use in strategy
addStrategySchema({
  strategyName: 'vwap-strategy',
  interval: '1h',
  getSignal: async (symbol) => {
    const vwapValue = await resolve(vwap);  // Promise<number>
    if (vwapValue > 50000) return { position: 'long', /* ... */ };
    return null;
  },
});
```

## Multi-Timeframe Example with Pine Script

```typescript
import { extract, run, toSignalDto, File } from '@backtest-kit/pinets';
import { addStrategySchema, Cache } from 'backtest-kit';
import { randomString } from 'functools-kit';
import { sourceNode, outputNode, resolve } from '@backtest-kit/graph';

// Cache.fn prevents duplicate API calls when multiple nodes share data
const higherTimeframe = sourceNode(
  Cache.fn(
    async (symbol) => {
      const plots = await run(File.fromPath('timeframe_4h.pine'), { symbol, timeframe: '4h', limit: 100 });
      return extract(plots, { allowLong: 'AllowLong', allowShort: 'AllowShort', noTrades: 'NoTrades' });
    },
    { interval: '4h', key: ([symbol]) => symbol },
  ),
);

const lowerTimeframe = sourceNode(
  Cache.fn(
    async (symbol) => {
      const plots = await run(File.fromPath('timeframe_15m.pine'), { symbol, timeframe: '15m', limit: 100 });
      return extract(plots, {
        position: 'Signal', priceOpen: 'Close',
        priceTakeProfit: 'TakeProfit', priceStopLoss: 'StopLoss',
        minuteEstimatedTime: 'EstimatedTime',
      });
    },
    { interval: '15m', key: ([symbol]) => symbol },
  ),
);

// MTF filter: only take signals that match higher timeframe regime
const mtfSignal = outputNode(
  async ([higher, lower]) => {
    if (higher.noTrades) return null;
    if (lower.position === 0) return null;
    if (higher.allowShort && lower.position === 1) return null;   // 4h bearish, skip long
    if (higher.allowLong && lower.position === -1) return null;   // 4h bullish, skip short
    return toSignalDto(randomString(), lower, null);
  },
  higherTimeframe,
  lowerTimeframe,
);

addStrategySchema({
  strategyName: 'mtf_graph_strategy',
  interval: '5m',
  getSignal: (symbol) => resolve(mtfSignal),
  actions: ['partial_profit_action', 'breakeven_action'],
});
```

## API Reference

| Export | Description |
|---|---|
| `sourceNode(fetch)` | Creates a typed source node. `T` inferred from return type. |
| `outputNode(compute, ...nodes)` | Creates output node. `values` in compute is typed tuple. |
| `resolve(node)` | Evaluates graph within backtest-kit context. Returns `Promise<V>`. |
| `serialize(roots)` | Flattens graph to `IFlatNode[]` for DB storage. |
| `deserialize(flat)` | Reconstructs from flat array. |
| `deepFlat(nodes)` | Returns all nodes in topological order, deduplicated. |

### Inline anonymous graph

```typescript
import { NodeType, TypedNode, resolve } from '@backtest-kit/graph';

const signal: TypedNode = {
  type: NodeType.OutputNode,
  nodes: [
    { type: NodeType.SourceNode, fetch: async (symbol) => ({ allowLong: true }) },
    { type: NodeType.SourceNode, fetch: async (symbol) => ({ position: 1, priceOpen: 50000 }) },
  ],
  compute: ([higher, lower]) => higher.allowLong && lower.position === 1 ? lower : null,
};

const result = await resolve(signal);
```
