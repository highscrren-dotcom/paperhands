import { IExecutionContext } from "../lib/services/context/ExecutionContextService";
import { IMethodContext } from "../lib/services/context/MethodContextService";

/**
 * Single log entry stored in the log history.
 */
export interface ILogEntry {
  /** Unique entry identifier generated via randomString */
  id: string;
  /** Log level */
  type: "log" | "debug" | "info" | "warn" | "agent";
  /** Current Unix timestamp in milliseconds for storage rotate */
  priority: number;
  /** Date taken from backtest context to improve user experience */
  createdAt: string;
  /** Unix timestamp in milliseconds taken from backtest context to improve user experience */
  timestamp: number;
  /** Optional method context associated with the log entry, providing additional details about the execution environment or state when the log was recorded */
  methodContext: IMethodContext | null;
  /** Optional execution context associated with the log entry, providing additional details about the execution environment or state when the log was recorded */
  executionContext: IExecutionContext | null;
  /** Log topic / method name */
  topic: string;
  /** Additional arguments passed to the log call */
  args: unknown[];
}

/**
 * Interface representing a logging mechanism for the swarm system.
 * Provides methods to record messages at different severity levels, used across components like agents, sessions, states, storage, swarms, history, embeddings, completions, and policies.
 * Logs are utilized to track lifecycle events (e.g., initialization, disposal), operational details (e.g., tool calls, message emissions), validation outcomes (e.g., policy checks), and errors (e.g., persistence failures), aiding in debugging, monitoring, and auditing.
*/
export interface ILogger {
  /**
   * Logs a general-purpose message.
   * Used throughout the swarm system to record significant events or state changes, such as agent execution, session connections, or storage updates.
   */
  log(topic: string, ...args: any[]): void;

  /**
   * Logs a debug-level message.
   * Employed for detailed diagnostic information, such as intermediate states during agent tool calls, swarm navigation changes, or embedding creation processes, typically enabled in development or troubleshooting scenarios.
   */
  debug(topic: string, ...args: any[]): void;

  /**
   * Logs an info-level message.
   * Used to record informational updates, such as successful completions, policy validations, or history commits, providing a high-level overview of system activity without excessive detail.
   */
  info(topic: string, ...args: any[]): void;

  /**
   * Logs a warning-level message.
   * Used to record potentially problematic situations that don't prevent execution but may require attention, such as missing data, unexpected conditions, or deprecated usage.
   */
  warn(topic: string, ...args: any[]): void;
}

/**
 * Interface representing the AI agent logging channel.
 * Kept separate from {@link ILogger} on purpose: `ILogger` is the framework's internal diagnostics sink wired through `setLogger`, whose four severity levels describe the health of the framework itself.
 * Agent output is a different concern — it records what a model did (reasoning steps, tool calls, completions), not how the framework is behaving, and it is addressed to the user reading the log history rather than to whoever is debugging the engine.
 * Splitting the interface also keeps `ILogger` implementations supplied by users source-compatible: adding agent logging to the log history never widens the contract they implement.
 */
export interface IAgentLogger {
  /**
   * Logs an AI agent message.
   * Used to record model-driven activity — reasoning, tool invocations, and completions — so it stays distinguishable from framework diagnostics when reviewing the log history.
   */
  agent(topic: string, ...args: any[]): void;
}
