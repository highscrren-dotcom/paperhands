# LLM Integration with json-inference

## Installation

```bash
npm install json-inference openai ollama groq-sdk backtest-kit
```

## Supported Providers

| Provider | `InferenceName` | SDK needed |
|---|---|---|
| OpenAI | `GPT5Inference` | `openai` |
| Claude | `ClaudeInference` | `openai` (OpenAI-compatible) |
| DeepSeek | `DeepseekInference` | `openai` |
| Grok (xAI) | `GrokInference` | `openai` |
| Mistral | `MistralInference` | `openai` |
| Perplexity | `PerplexityInference` | `openai` |
| Cohere | `CohereInference` | `openai` |
| Alibaba | `AlibabaInference` | `openai` |
| Hugging Face | `HfInference` | `openai` |
| Ollama | `OllamaInference` | `ollama` (no key) |
| GLM-4 | `GLM4Inference` | `openai` |
| Groq | `GroqInference` | `groq-sdk` |

## The generateObject function

```typescript
import { generateObject, InferenceName } from 'json-inference';

const result = await generateObject(
  InferenceName.DeepseekInference,
  { format: signalFormat, messages },
  'deepseek-chat',
  process.env.DEEPSEEK_API_KEY,
);
// apiKey is optional for Ollama
```

## Signal JSON Schema

```typescript
const signalFormat = {
  type: 'object',
  properties: {
    position: {
      type: 'string',
      description: 'Trade direction: "long" (buy) or "short" (sell)',
      enum: ['long', 'short'],
    },
    note: { type: 'string', description: 'Human-readable signal reason' },
    price_open: { type: 'number', description: 'Entry price. Omit for market entry' },
    take_profit_price: { type: 'number', description: 'TP price. Above entry for long, below for short' },
    stop_loss_price: { type: 'number', description: 'SL price. Below entry for long, above for short' },
    minute_estimated_time: { type: 'number', description: 'Expected duration in minutes' },
    cost: { type: 'number', description: 'Entry cost in USD' },
    description: { type: 'string', description: 'Risk explanation, min 10 sentences' },
    reasoning: { type: 'string', description: 'Technical analysis, min 15 sentences' },
  },
  required: ['position', 'note', 'take_profit_price', 'stop_loss_price',
             'minute_estimated_time', 'cost', 'description', 'reasoning'],
} as const;
```

## Mapping to ISignalDto

```typescript
import type { ISignalDto } from 'backtest-kit';

function toSignalDto(raw: any): ISignalDto {
  return {
    position: raw.position as 'long' | 'short',
    note: raw.note,
    priceOpen: raw.price_open,
    priceTakeProfit: raw.take_profit_price,
    priceStopLoss: raw.stop_loss_price,
    minuteEstimatedTime: raw.minute_estimated_time,
    cost: raw.cost,
  };
}
```

## Multi-Timeframe LLM Strategy (Full Example)

```typescript
import { v4 as uuid } from 'uuid';
import { addStrategySchema, getCandles, Dump } from 'backtest-kit';
import { generateObject, InferenceName } from 'json-inference';
import type { ISignalDto } from 'backtest-kit';

async function myGetSignal(
  symbol: string,
  currentPrice: number,
  provider: InferenceName,
  model: string,
  apiKey?: string,
): Promise<ISignalDto | null> {
  const [candles1h, candles15m, candles5m, candles1m] = await Promise.all([
    getCandles(symbol, '1h', 24),
    getCandles(symbol, '15m', 48),
    getCandles(symbol, '5m', 60),
    getCandles(symbol, '1m', 60),
  ]);

  const messages = [
    {
      role: 'system' as const,
      content: `You are a professional trading analyst for ${symbol}. Current price: ${currentPrice} USD.`,
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        symbol, currentPrice,
        candles1h:  candles1h.slice(-5),
        candles15m: candles15m.slice(-5),
        candles5m:  candles5m.slice(-5),
        candles1m:  candles1m.slice(-5),
      }),
    },
  ];

  const raw = await generateObject(provider, { format: signalFormat, messages }, model, apiKey);

  if (raw.position !== 'long' && raw.position !== 'short') return null;

  const resultId = uuid();

  // Persist conversation for RAG retrieval
  Dump.dumpAgentAnswer(messages, {
    dumpId: 'position-context',
    bucketName: 'llm-strategy',
    signalId: resultId,
    description: raw.description,
  });

  Dump.dumpRecord(raw, {
    dumpId: 'position-entry',
    bucketName: 'llm-strategy',
    signalId: resultId,
    description: raw.reasoning,
  });

  return toSignalDto(raw);
}

addStrategySchema({
  strategyName: 'deepseek-strategy',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol, when, currentPrice) =>
    myGetSignal(symbol, currentPrice, InferenceName.DeepseekInference, 'deepseek-chat', process.env.DEEPSEEK_API_KEY),
});
```

## Switching Providers (one argument change)

```typescript
// OpenAI
await generateObject(InferenceName.GPT5Inference, params, 'gpt-4o', OPENAI_KEY);
// Claude
await generateObject(InferenceName.ClaudeInference, params, 'claude-opus-4-5', ANTHROPIC_KEY);
// DeepSeek
await generateObject(InferenceName.DeepseekInference, params, 'deepseek-chat', DEEPSEEK_KEY);
// Ollama (local, no key needed)
await generateObject(InferenceName.OllamaInference, params, 'llama3.3:70b');
// Groq
await generateObject(InferenceName.GroqInference, params, 'llama-3.3-70b-versatile', GROQ_KEY);
```

## Memory / RAG

```typescript
import { Memory } from 'backtest-kit';

Memory.enable();           // call once at startup
// Memory.useLocal();      // in-memory only (no disk I/O)

// Write
await Memory.writeMemory({
  memoryId: resultId,
  value: { symbol, raw, timestamp: Date.now() },
  signalId: currentSignalId,
  bucketName: 'trade-history',
  description: 'BTC long entry with R/R 3:1',
});

// Search (BM25)
const similar = await Memory.searchMemory({
  query: 'BTC long entry bullish engulfing',
  signalId: currentSignalId,
  bucketName: 'trade-history',
});

// Read specific
const record = await Memory.readMemory({
  memoryId: previousSignalId,
  signalId: currentSignalId,
  bucketName: 'trade-history',
});
```
