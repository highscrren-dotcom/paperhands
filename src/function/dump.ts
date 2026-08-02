import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { IPublicSignalRow, IScheduledSignalRow } from "../interfaces/Strategy.interface";
import { IMCPMessage } from "../interfaces/MCP.interface";
import { Dump } from "../classes/Dump";
import MessageModel from "../model/Message.model";

const DUMP_MCP_STATUS_METHOD_NAME = "dump.dumpMCPStatus";
const DUMP_AGENT_ANSWER_METHOD_NAME = "dump.dumpAgentAnswer";
const DUMP_RECORD_METHOD_NAME = "dump.dumpRecord";
const DUMP_TABLE_METHOD_NAME = "dump.dumpTable";
const DUMP_TEXT_METHOD_NAME = "dump.dumpText";
const DUMP_ERROR_METHOD_NAME = "dump.dumpError";
const DUMP_JSON_METHOD_NAME = "dump.dumpJson";

/**
 * Dumps an MCP (Model Context Protocol) status snapshot scoped to the
 * registered MCP.
 *
 * Resolves the MCP name automatically from the schema registry — it takes
 * the signalId slot of the dump scope, exactly as the signal-scoped dump
 * functions resolve their signal from execution context. One registered
 * schema is required: zero or several make the scope ambiguous and throw.
 * MCP status is live-only, the snapshot is recorded with backtest=false.
 *
 * With the default markdown backend, image messages are decoded from base64
 * and written to ./dump/image/{message.id}.png; the whole message list is
 * rendered into a single ./dump/mcp/{dumpId}.md - text messages inlined
 * in order, images embedded via ![{id}](../image/{id}.png) relative links.
 * The snapshot follows the swappable Dump backend: useDummy() silences it,
 * useMemory() keeps a searchable text-only projection under the mcpName.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.messages - Status messages as returned by MCP.getStatus
 * @param dto.description - Human-readable label describing the snapshot; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no MCP schema or more than one MCP schema is registered
 *
 * @example
 * ```typescript
 * import { MCP, dumpMCPStatus } from "backtest-kit";
 *
 * const messages = await MCP.getStatus("my-mcp");
 * await dumpMCPStatus({ bucketName: "my-agent", dumpId: String(Date.now()), messages, description: "Portfolio snapshot before rebalance" });
 * ```
 */
export async function dumpMCPStatus(dto: {
  bucketName: string;
  dumpId: string;
  messages: IMCPMessage[];
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, messages, description } = dto;
  backtest.loggerService.info(DUMP_MCP_STATUS_METHOD_NAME, {
    bucketName,
    dumpId,
    messagesLen: messages.length,
  });
  const mcpList = await backtest.mcpValidationService.list();
  if (!mcpList.length) {
    throw new Error(`dumpMCPStatus requires a registered MCP schema dumpId=${dumpId}`);
  }
  if (mcpList.length > 1) {
    throw new Error(
      `dumpMCPStatus requires exactly one registered MCP schema, got ${mcpList.length} dumpId=${dumpId}`,
    );
  }
  const [{ mcpName }] = mcpList;
  await Dump.dumpMCPStatus(messages, {
    dumpId,
    bucketName,
    signalId: mcpName,
    description,
    backtest: false,
  });
}

/**
 * Dumps the full agent message history scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this agent invocation
 * @param dto.messages - Full chat history (system, user, assistant, tool)
 * @param dto.description - Human-readable label describing the agent invocation context; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @example
 * ```typescript
 * import { dumpAgentAnswer } from "backtest-kit";
 *
 * await dumpAgentAnswer({ bucketName: "my-strategy", dumpId: "reasoning-1", messages, description: "BTC long signal reasoning" });
 * ```
 */
export async function dumpAgentAnswer(dto: {
  bucketName: string;
  dumpId: string;
  messages: MessageModel[];
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, messages, description } = dto;
  backtest.loggerService.info(DUMP_AGENT_ANSWER_METHOD_NAME, {
    bucketName,
    dumpId,
    messagesLen: messages.length,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpAgentAnswer requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpAgentAnswer requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpAgentAnswer(messages, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpAgentAnswer(messages, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpAgentAnswer requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}

/**
 * Dumps a flat key-value record scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.record - Arbitrary flat object to persist
 * @param dto.description - Human-readable label describing the record contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @example
 * ```typescript
 * import { dumpRecord } from "backtest-kit";
 *
 * await dumpRecord({ bucketName: "my-strategy", dumpId: "context", record: { price: 42000, signal: "long" }, description: "Signal context at entry" });
 * ```
 */
export async function dumpRecord(dto: {
  bucketName: string;
  dumpId: string;
  record: Record<string, unknown>;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, record, description } = dto;
  backtest.loggerService.info(DUMP_RECORD_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpRecord requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpRecord requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpRecord(record, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpRecord(record, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpRecord requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}

/**
 * Dumps an array of objects as a table scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * Column headers are derived from the union of all keys across all rows.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.rows - Array of arbitrary objects to render as a table
 * @param dto.description - Human-readable label describing the table contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @example
 * ```typescript
 * import { dumpTable } from "backtest-kit";
 *
 * await dumpTable({ bucketName: "my-strategy", dumpId: "candles", rows: [{ time: 1234, close: 42000 }], description: "Recent candle history" });
 * ```
 */
export async function dumpTable(dto: {
  bucketName: string;
  dumpId: string;
  rows: Record<string, unknown>[];
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, rows, description } = dto;
  backtest.loggerService.info(DUMP_TABLE_METHOD_NAME, {
    bucketName,
    dumpId,
    rowsLen: rows.length,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpTable requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpTable requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpTable(rows, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpTable(rows, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpTable requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}

/**
 * Dumps raw text content scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.content - Arbitrary text content to persist
 * @param dto.description - Human-readable label describing the content; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @example
 * ```typescript
 * import { dumpText } from "backtest-kit";
 *
 * await dumpText({ bucketName: "my-strategy", dumpId: "summary", content: "Agent concluded: bullish", description: "Agent final summary" });
 * ```
 */
export async function dumpText(dto: {
  bucketName: string;
  dumpId: string;
  content: string;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, content, description } = dto;
  backtest.loggerService.info(DUMP_TEXT_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpText requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpText requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpText(content, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpText(content, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpText requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}

/**
 * Dumps an error description scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.content - Error message or description to persist
 * @param dto.description - Human-readable label describing the error context; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @example
 * ```typescript
 * import { dumpError } from "backtest-kit";
 *
 * await dumpError({ bucketName: "my-strategy", dumpId: "error-1", content: "Tool call failed: timeout", description: "Tool execution error" });
 * ```
 */
export async function dumpError(dto: {
  bucketName: string;
  dumpId: string;
  content: string;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, content, description } = dto;
  backtest.loggerService.info(DUMP_ERROR_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpError requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpError requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpError(content, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpError(content, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpError requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}

/**
 * Dumps an arbitrary nested object as a fenced JSON block scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.json - Arbitrary nested object to serialize with JSON.stringify
 * @param dto.description - Human-readable label describing the object contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 * @throws Error if no pending or scheduled signal exists
 *
 * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
 *
 * @example
 * ```typescript
 * import { dumpJson } from "backtest-kit";
 *
 * await dumpJson({ bucketName: "my-strategy", dumpId: "signal-state", json: { entries: [], partials: [] }, description: "Signal state snapshot" });
 * ```
 */
export async function dumpJson(dto: {
  bucketName: string;
  dumpId: string;
  json: object;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, json, description } = dto;
  backtest.loggerService.info(DUMP_JSON_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpJson requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpJson requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpJson(json, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Dump.dumpJson(json, {
      dumpId,
      bucketName,
      signalId: signal.id,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`dumpJson requires a pending or scheduled signal for symbol=${symbol} dumpId=${dumpId}`);
}
