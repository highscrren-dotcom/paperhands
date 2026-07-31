import { memoize, trycatch, errorData, getErrorMessage } from "functools-kit";
import backtest from "../lib";
import { Exchange } from "./Exchange";
import { Live } from "./Live";
import { StorageLive } from "./Storage";
import {
  IMCPContext,
  IMCPMessage,
  IMCPPositionCloseCommand,
  IMCPPositionOpenCommand,
  MCPName,
  MCPPermission,
} from "../interfaces/MCP.interface";
import { ISignalDto, StrategyName } from "../interfaces/Strategy.interface";
import { errorEmitter } from "../config/emitters";
import alignToInterval from "../utils/alignToInterval";
import { getConfig } from "../function/setup";
import { Position } from "./Position";
import { GLOBAL_CONFIG } from "../config/params";

const METHOD_NAME_GET_STATUS = "MCPUtils.getStatus";
const METHOD_NAME_GET_DEFAULT_MESSAGES = "MCPUtils.getDefaultMessages";
const METHOD_NAME_GET_HISTORY_MESSAGES = "MCPUtils.getHistoryMessages";
const METHOD_NAME_COMMIT_POSITION_OPEN = "MCPUtils.commitPositionOpen";
const METHOD_NAME_COMMIT_POSITION_CLOSE = "MCPUtils.commitPositionClose";

/** Grid step (percent) the hard stop-loss distance snaps to. */
const HARD_STOP_STEP_PERCENT = 2.5;

/** Maximum closed positions included in the trade history messages. */
const MAX_HISTORY_ROWS = 10;

/**
 * Computes the hard stop-loss distance percent for an opened position.
 *
 * Snaps the configured max stop-loss distance to a {@link HARD_STOP_STEP_PERCENT} grid
 * (rounded to the nearest step), then steps one notch down so the result stays strictly
 * below CC_MAX_STOPLOSS_DISTANCE_PERCENT — which the signal validator rejects at the
 * boundary (e.g. 20% config yields 20.008% after price rounding).
 *
 * @param maxDistance - CC_MAX_STOPLOSS_DISTANCE_PERCENT
 * @returns Hard stop-loss distance in percent (e.g. 11 -> 7.5, 10 -> 7.5, 20 -> 17.5)
 */
const COMPUTE_HARD_STOP_FN = (maxDistance: number): number =>
  Math.round(maxDistance / HARD_STOP_STEP_PERCENT) * HARD_STOP_STEP_PERCENT -
  HARD_STOP_STEP_PERCENT;

/**
 * Formats a signed value for agent messages: explicit "+" on non-negative,
 * two decimals (e.g. 1.5 -> "+1.50", -2.3 -> "-2.30").
 *
 * @param value - Number to format
 * @returns Signed fixed-point string
 */
const FORMAT_SIGNED_FN = (value: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

/**
 * Default portfolio-to-text renderer for the MCP agent.
 *
 * Emits one header message — snapshot time plus a portfolio summary: open
 * position count, total invested, total unrealized PnL in USD (percent of
 * invested alongside) and a per-position dollar PnL list. Dollars lead
 * everywhere: entry prices differ across positions, so percents are not
 * comparable between them — USD is the common denominator the tactical exit
 * decision reads. Then one text message per traded symbol:
 * capital balance, the queued entry order (createdSignal), the active
 * position (pendingSignal) and the queued close order (closedSignal).
 * A symbol holding a position is rendered PnL-first: entry and current price,
 * unrealized PnL percent (net of entry/exit fees and slippage — the pnl
 * contract adjusts both legs), peak profit and max drawdown percents with the
 * minutes elapsed since each extreme (_peak/_fall timestamps), the open time
 * and the minutes left until time_expired (or an explicit "perpetual hold"
 * when minuteEstimatedTime is Infinity). A symbol with no position shows the
 * current price alone — no PnL exists there. Slots without data are stated
 * explicitly so the agent never has to guess whether a field was omitted or
 * empty.
 */
const DEFAULT_GET_MESSAGES = (
  context: IMCPContext,
  when: Date,
): IMCPMessage[] => {
  const symbols = Object.keys(context);
  if (!symbols.length) {
    return [
      {
        type: "text",
        text: `Portfolio status at ${when.toISOString()}: no symbols are enabled for live trading.`,
      },
    ];
  }
  const openPositions = symbols.flatMap((symbol) => {
    const { pendingSignal } = context[symbol];
    return pendingSignal ? [{ symbol, pendingSignal }] : [];
  });
  const summaryLines: string[] = [
    `Portfolio status at ${when.toISOString()} (${symbols.length} traded symbol${symbols.length === 1 ? "" : "s"}):`,
  ];
  if (openPositions.length) {
    const totalInvested = openPositions.reduce(
      (acm, { pendingSignal }) => acm + pendingSignal.pnl.pnlEntries,
      0,
    );
    const totalPnlCost = openPositions.reduce(
      (acm, { pendingSignal }) => acm + pendingSignal.pnl.pnlCost,
      0,
    );
    const totalPnlPercent = totalInvested
      ? (totalPnlCost / totalInvested) * 100
      : 0;
    summaryLines.push(
      `Open positions: ${openPositions.length} of ${symbols.length} symbols`,
    );
    summaryLines.push(`Total invested: ${totalInvested.toFixed(2)} USD`);
    summaryLines.push(
      `Total unrealized PnL: ${FORMAT_SIGNED_FN(totalPnlCost)} USD (${FORMAT_SIGNED_FN(totalPnlPercent)}% of invested), net of entry and assumed exit fees and slippage`,
    );
    for (const { symbol, pendingSignal } of openPositions) {
      summaryLines.push(
        `- ${symbol}: ${FORMAT_SIGNED_FN(pendingSignal.pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(pendingSignal.pnl.pnlPercentage)}%)`,
      );
    }
  } else {
    summaryLines.push("Open positions: none");
  }
  const messages: IMCPMessage[] = [
    {
      type: "text",
      text: summaryLines.join("\n"),
    },
  ];
  for (const symbol of symbols) {
    const { createdSignal, pendingSignal, closedSignal, currentPrice } =
      context[symbol];
    const lines: string[] = [];
    lines.push(`Symbol: ${symbol}`);
    if (pendingSignal) {
      const {
        pnl,
        peakProfit,
        maxDrawdown,
        pendingAt,
        minuteEstimatedTime,
        priceOpen,
        totalEntries,
        _entry,
        _peak,
        _fall,
      } = pendingSignal;
      const peakMinutesAgo = Math.max(
        0,
        Math.round((when.getTime() - _peak.timestamp) / 60_000),
      );
      const fallMinutesAgo = Math.max(
        0,
        Math.round((when.getTime() - _fall.timestamp) / 60_000),
      );
      lines.push(
        `Entry price: ${priceOpen}${totalEntries > 1 ? " (effective average across all DCA entries)" : ""}`,
      );
      if (_entry && _entry.length > 1) {
        for (const [index, entry] of _entry.entries()) {
          lines.push(
            `- entry ${index + 1}: price ${entry.price}, cost ${entry.cost.toFixed(2)} USD, at ${new Date(entry.timestamp).toISOString()}`,
          );
        }
      }
      lines.push(`Current price: ${currentPrice}`);
      lines.push(
        `Unrealized PnL: ${FORMAT_SIGNED_FN(pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(pnl.pnlPercentage)}%), net of entry and assumed exit fees and slippage`,
      );
      lines.push(
        `Peak profit: ${FORMAT_SIGNED_FN(peakProfit.pnlPercentage)}% (${peakMinutesAgo} minute${peakMinutesAgo === 1 ? "" : "s"} ago)`,
      );
      lines.push(
        `Max drawdown: ${FORMAT_SIGNED_FN(maxDrawdown.pnlPercentage)}% (${fallMinutesAgo} minute${fallMinutesAgo === 1 ? "" : "s"} ago)`,
      );
      lines.push(`Opened at: ${new Date(pendingAt).toISOString()}`);
      if (Number.isFinite(minuteEstimatedTime)) {
        const elapsedMinutes = (when.getTime() - pendingAt) / 60_000;
        const remainingMinutes = Math.max(
          0,
          Math.round(minuteEstimatedTime - elapsedMinutes),
        );
        lines.push(
          `Expires in: ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`,
        );
      } else {
        lines.push("Expires in: never, the position is a perpetual hold");
      }
      lines.push(
        `Balance: ${pnl.pnlEntries.toFixed(2)} USD invested across ${totalEntries} ${totalEntries === 1 ? "entry" : "entries (DCA averaged)"}`,
      );
    } else {
      lines.push(`Current price: ${currentPrice}`);
      lines.push(`Balance: no capital invested in ${symbol}`);
    }
    if (createdSignal) {
      const entry =
        createdSignal.priceOpen !== undefined
          ? `at price ${createdSignal.priceOpen}`
          : "at market price";
      const details = [
        createdSignal.cost !== undefined
          ? `cost ${createdSignal.cost} USD`
          : "",
        createdSignal.note ? `note: ${createdSignal.note}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `Entry queue: ${createdSignal.position} order waiting to open ${entry}${details ? ` (${details})` : ""}`,
      );
    } else {
      lines.push("Entry queue: empty, no order waiting to open a position");
    }
    if (pendingSignal) {
      const note = pendingSignal.note ? ` (note: ${pendingSignal.note})` : "";
      lines.push(`Active position: ${pendingSignal.position}${note}`);
    } else {
      lines.push("Active position: none");
    }
    if (closedSignal) {
      const details = [
        closedSignal.note ? `note: ${closedSignal.note}` : "",
        closedSignal.closeNote ? `close note: ${closedSignal.closeNote}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `Close queue: close order waiting for the ${closedSignal.position} position${details ? ` (${details})` : ""}`,
      );
    } else {
      lines.push("Close queue: empty, no order waiting to close a position");
    }
    messages.push({ type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Builds the trade history for an MCP from the live signal storage
 * (StorageLive): recently CLOSED positions of the bound strategy, newest
 * first — one header message plus one text message per closed trade with
 * the dollar/percent result, direction, close reason, open/close times and
 * the note the position was opened with.
 *
 * The anti-churn half of the agent's picture: a stateless news agent that
 * only sees open positions re-trades the same news right after closing;
 * with the history it sees "this was already traded, result -2.10 USD".
 *
 * Depth: at most {@link MAX_HISTORY_ROWS} newest closed rows are rendered.
 * The underlying live bucket additionally keeps only the last CC_MAX_SIGNALS
 * rows across ALL strategies (global feed by contract), and rows accumulate
 * only while the Storage adapter is enabled.
 *
 * @param mcpName - MCP name resolved to its bound strategy
 * @param when - Snapshot time stamped into the header and "minutes ago" math
 * @returns Promise resolving to history messages for the MCP agent
 */
const HISTORY_GET_MESSAGES = async (
  mcpName: MCPName,
  when: Date,
): Promise<IMCPMessage[]> => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_HISTORY_MESSAGES,
  );
  const rowList = await StorageLive.list();
  const closedList = rowList
    .flatMap((row) =>
      row.strategyName === strategyName && row.status === "closed" ? [row] : [],
    )
    .sort((a, b) => b.closeTimestamp - a.closeTimestamp)
    .slice(0, MAX_HISTORY_ROWS);
  if (!closedList.length) {
    return [
      {
        type: "text",
        text: `Trade history at ${when.toISOString()}: no closed positions recorded yet.`,
      },
    ];
  }
  const messages: IMCPMessage[] = [
    {
      type: "text",
      text: `Trade history at ${when.toISOString()} (last ${closedList.length} closed position${closedList.length === 1 ? "" : "s"}, newest first):`,
    },
  ];
  for (const row of closedList) {
    const closedMinutesAgo = Math.max(
      0,
      Math.round((when.getTime() - row.closeTimestamp) / 60_000),
    );
    const lines: string[] = [];
    lines.push(`Symbol: ${row.symbol}`);
    lines.push(`Position: ${row.position}`);
    lines.push(
      `Result: ${FORMAT_SIGNED_FN(row.pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(row.pnl.pnlPercentage)}%), net of entry and exit fees and slippage`,
    );
    lines.push(`Close reason: ${row.closeReason}`);
    lines.push(
      `Closed at: ${new Date(row.closeTimestamp).toISOString()} (${closedMinutesAgo} minute${closedMinutesAgo === 1 ? "" : "s"} ago)`,
    );
    lines.push(`Opened at: ${new Date(row.pendingAt).toISOString()}`);
    if (row.note) {
      lines.push(`Note: ${row.note}`);
    }
    messages.push({ type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Wrapper to call onStatus callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback —
 * a broken callback never fails getStatus itself.
 *
 * @param mcpName - MCP name whose schema supplies the callbacks
 * @param context - Portfolio snapshot the renderer received
 * @param messages - Messages the renderer produced
 */
const CALL_STATUS_CALLBACKS_FN = trycatch(
  async (
    mcpName: MCPName,
    context: IMCPContext,
    messages: IMCPMessage[],
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(mcpName);
    if (callbacks?.onStatus) {
      await callbacks.onStatus(mcpName, context, messages);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_STATUS_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onPositionOpen callback with error handling.
 * Fires AFTER the create-signal commit is accepted, with the exact signal
 * DTO submitted to the live strategy. Catches and logs any errors thrown
 * by the user-provided callback — a broken callback never fails the open.
 *
 * @param symbol - Trading pair symbol the position was opened for
 * @param signal - Signal DTO submitted to Live.commitCreateSignal
 * @param dto - Original open command from the agent
 */
const CALL_POSITION_OPEN_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signal: ISignalDto,
    dto: IMCPPositionOpenCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onPositionOpen) {
      await callbacks.onPositionOpen(symbol, signal, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_POSITION_OPEN_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onPositionClose callback with error handling.
 * Fires AFTER the close-pending commit is accepted, with the id of the
 * pending signal the close was queued for. Catches and logs any errors
 * thrown by the user-provided callback — a broken callback never fails
 * the close.
 *
 * @param symbol - Trading pair symbol the position was closed for
 * @param signalId - Id of the pending signal consumed by the close
 * @param dto - Original close command from the agent
 */
const CALL_POSITION_CLOSE_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signalId: string,
    dto: IMCPPositionCloseCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onPositionClose) {
      await callbacks.onPositionClose(symbol, signalId, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_POSITION_CLOSE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Validates a strategy's full dependency chain — the strategy itself plus
 * its risk(s) and actions — memoized by strategy name. Shared by the
 * explicit-schema path and the single-registered-strategy resolution of
 * {@link GET_STRATEGY_NAME_FN}.
 *
 * @param strategyName - Strategy name to validate
 * @param source - Caller tag included in error messages
 * @throws Error when the strategy, its risks or actions are unknown
 */
const VALIDATE_STRATEGY_CHAIN_FN = memoize(
  ([strategyName]) => `${strategyName}`,
  (strategyName: StrategyName, source: string) => {
    backtest.strategyValidationService.validate(strategyName, source);
    const { riskName, riskList, actions } =
      backtest.strategySchemaService.get(strategyName);
    riskName && backtest.riskValidationService.validate(riskName, source);
    riskList &&
      riskList.forEach((riskName) =>
        backtest.riskValidationService.validate(riskName, source),
      );
    actions &&
      actions.forEach((actionName) =>
        backtest.actionValidationService.validate(actionName, source),
      );
  },
);

/**
 * Validates an MCP schema, memoized by mcpName.
 *
 * Checks that the MCP is registered; when the schema names a strategy
 * explicitly, cascades into its risk(s) and actions — the same chain public
 * strategy APIs validate. A schema without strategyName defers the strategy
 * chain to {@link GET_STRATEGY_NAME_FN}, which validates the resolved
 * strategy at use time. Runs once per MCP name; later calls are no-ops.
 *
 * @param mcpName - MCP name to validate
 * @param source - Caller tag included in error messages
 * @throws Error when the MCP, its strategy, risks or actions are unknown
 */
const VALIDATE_SCHEMA_FN = memoize(
  ([mcpName]) => `${mcpName}`,
  (mcpName: string, source: string) => {
    {
      backtest.mcpValidationService.validate(mcpName, source);
    }

    const { strategyName } = backtest.mcpSchemaService.get(mcpName);

    if (strategyName) {
      VALIDATE_STRATEGY_CHAIN_FN(strategyName, source);
    }
  },
);

/**
 * Checks that the MCP schema grants a permission for the requested
 * operation: "read" gates status/history rendering, "write" gates
 * opening and closing positions. A schema without the permissions field
 * grants BOTH by default.
 *
 * Deliberately NOT memoized: overrideMCPSchema may narrow or widen the
 * grants at runtime, and the check must see the current schema on every
 * call. Pure renderer helpers (getDefaultMessages) are not gated — they
 * transform data the caller already holds.
 *
 * @param mcpName - MCP name whose schema carries the permissions
 * @param permission - Permission required by the calling operation
 * @param source - Caller tag included in error messages
 * @throws Error when the permission is not granted
 */
const CHECK_PERMISSION_FN = (
  mcpName: MCPName,
  permission: MCPPermission,
  source: string,
): void => {
  const { permissions = ["read", "write"] } =
    backtest.mcpSchemaService.get(mcpName);
  if (!permissions.includes(permission)) {
    throw new Error(
      `MCP Error: mcp ${mcpName} is missing the "${permission}" permission source=${source}`,
    );
  }
};

/**
 * Resolves the effective strategy of an MCP.
 *
 * The schema's explicit strategyName wins. Without it, the SINGLE registered
 * strategy is used implicitly — the resolved name goes through the same
 * dependency-chain validation as an explicit one. Zero registered strategies
 * or two and more make the implicit choice impossible: with several
 * strategies the schema MUST name one, ambiguity is an error, not a guess.
 *
 * Deliberately NOT memoized: strategies register over time, so the
 * resolution must see the current registry on every call.
 *
 * @param mcpName - MCP name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective strategy name
 * @throws Error when no strategies are registered or the choice is ambiguous
 */
const GET_STRATEGY_NAME_FN = async (
  mcpName: MCPName,
  source: string,
): Promise<StrategyName> => {
  const { strategyName } = backtest.mcpSchemaService.get(mcpName);
  if (strategyName) {
    return strategyName;
  }
  const strategyList = await backtest.strategyValidationService.list();
  if (!strategyList.length) {
    throw new Error(
      `MCP Error: mcp ${mcpName} has no strategyName and no strategies are registered source=${source}`,
    );
  }
  if (strategyList.length > 1) {
    throw new Error(
      `MCP Error: mcp ${mcpName} must specify strategyName explicitly, ${strategyList.length} strategies are registered source=${source}`,
    );
  }
  const [{ strategyName: resolvedName }] = strategyList;
  VALIDATE_STRATEGY_CHAIN_FN(resolvedName, source);
  return resolvedName;
};

/**
 * Builds the portfolio snapshot for an MCP: one entry per live instance of
 * the schema's strategy, keyed by symbol.
 *
 * For every symbol fetches the current VWAP price, the pending signal with
 * unrealized PnL computed at that price, and the deferred created/closed
 * signal slots from the strategy status.
 *
 * @param mcpName - MCP name resolved to its bound strategy
 * @returns Promise resolving to the per-symbol IMCPContext snapshot
 */
const GET_TARGET_CONTEXT_FN = async (mcpName: string) => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_STATUS,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.filter(
    (live) => live.strategyName === strategyName,
  );
  const targetList = await Promise.all(
    liveTarget.map(async ({ symbol, exchangeName }) => {
      const currentPrice = await Exchange.getAveragePrice(symbol, {
        exchangeName,
      });
      const pendingSignal = await Live.getPendingSignal(symbol, currentPrice, {
        strategyName,
        exchangeName,
      });
      const { createdSignal, closedSignal } = await Live.getStrategyStatus(
        symbol,
        {
          strategyName,
          exchangeName,
        },
      );
      return {
        symbol,
        pendingSignal,
        createdSignal,
        closedSignal,
        currentPrice,
      };
    }),
  );
  return targetList.reduce(
    (
      acm,
      { symbol, currentPrice, pendingSignal, closedSignal, createdSignal },
    ) => ({
      ...acm,
      [symbol]: { currentPrice, pendingSignal, closedSignal, createdSignal },
    }),
    <IMCPContext>{},
  );
};

/**
 * Renders the portfolio snapshot into agent messages via the schema's
 * getMessages (falling back to {@link DEFAULT_GET_MESSAGES}), with the
 * snapshot time aligned down to the 1m interval.
 *
 * @param mcpName - MCP name whose schema supplies getMessages
 * @param context - Portfolio snapshot built by GET_TARGET_CONTEXT_FN
 * @returns Promise resolving to the rendered message list
 */
const GET_TARGET_MESSAGES_FN = async (
  mcpName: string,
  context: IMCPContext,
) => {
  const { getMessages = DEFAULT_GET_MESSAGES } =
    backtest.mcpSchemaService.get(mcpName);
  const when = alignToInterval(new Date(), "1m");
  return await getMessages(context, when, mcpName);
};

/**
 * Opens a moonbag position for the command's symbol through the live
 * strategy: fixed 50% take profit, hard stop-loss snapped by
 * {@link COMPUTE_HARD_STOP_FN}, entry cost from the schema's positionCost.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and no pending signal to exist. Fires the schema's
 * onPositionOpen callback after the commit is accepted.
 *
 * @param dto - Open command with symbol, direction, mcpName and note
 * @returns Promise resolving when the create-signal commit is accepted
 * @throws Error when the symbol is not live-enabled or a pending signal exists
 */
const COMMIT_POSITION_OPEN_FN = async (dto: IMCPPositionOpenCommand) => {
  const { positionCost = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, minuteEstimatedTime = GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES } =
    backtest.mcpSchemaService.get(dto.mcpName);
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_POSITION_OPEN,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    const config = getConfig();
    if (pending) {
      throw new Error(
        `MCP Error: already have pending signal for ${dto.symbol}`,
      );
    }
    const percentStopLoss = COMPUTE_HARD_STOP_FN(
      config.CC_MAX_STOPLOSS_DISTANCE_PERCENT,
    );
    const signal: ISignalDto = {
      ...Position.moonbag({
        position: dto.position,
        currentPrice,
        percentStopLoss,
      }),
      minuteEstimatedTime,
      cost: positionCost,
      note: dto.note,
    };
    const result = await Live.commitCreateSignal(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      signal,
    );
    await CALL_POSITION_OPEN_CALLBACKS_FN(dto.symbol, signal, dto);
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Closes the pending position of the command's symbol through the live
 * strategy by queueing a user-initiated close for the pending signal's id.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and a pending signal to exist. Fires the schema's
 * onPositionClose callback after the commit is accepted.
 *
 * @param dto - Close command with symbol, mcpName and note
 * @returns Promise resolving when the close-pending commit is accepted
 * @throws Error when the symbol is not live-enabled or no pending signal exists
 */
const COMMIT_POSITION_CLOSE_FN = async (dto: IMCPPositionCloseCommand) => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_POSITION_CLOSE,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    if (!pending) {
      throw new Error(`MCP Error: missed pending signal for ${dto.symbol}`);
    }
    const result = await Live.commitClosePending(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      {
        id: pending.id,
        note: dto.note,
      },
    );
    await CALL_POSITION_CLOSE_CALLBACKS_FN(dto.symbol, pending.id, dto);
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Utility class exposing live trading to an MCP agent.
 *
 * Provides static-like methods (via singleton instance) to observe every
 * live instance of the schema's strategy and to open/close positions on
 * the agent's command.
 *
 * Features:
 * - Portfolio status rendered as human-readable agent messages
 * - Manual position open (moonbag levels, grid-snapped hard stop)
 * - Manual close of the pending position
 *
 * Every method validates the full MCP -> strategy -> risk/action chain
 * before touching the live state.
 *
 * @example
 * ```typescript
 * import { MCP } from "backtest-kit";
 *
 * // Render the portfolio for the agent
 * const messages = await MCP.getStatus("my-mcp");
 *
 * // Open a long position on the agent's command
 * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "agent decision" });
 *
 * // Close it later
 * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "take profit manually" });
 * ```
 */
export class MCPUtils {

  /**
   * Renders a portfolio snapshot with the DEFAULT text renderer, regardless
   * of the schema's getMessages.
   *
   * Emits one header message — snapshot time plus the portfolio summary
   * (open position count, total invested, total and per-position dollar
   * PnL) — plus one text message per traded symbol: prices, PnL/peak/
   * drawdown percents with timing, DCA entries, capital balance and the
   * entry/position/close slots.
   *
   * The signature matches IMCPSchema.getMessages (async variant), so a
   * custom renderer can await this method and extend the default output
   * instead of rebuilding it.
   *
   * @param context - Portfolio snapshot keyed by traded symbol
   * @param when - Snapshot time stamped into the header message
   * @param mcpName - Name of the registered MCP schema (validated before rendering)
   * @returns Promise resolving to messages for the MCP agent
   *
   * @example
   * ```typescript
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const messages = await MCP.getDefaultMessages(context, when, mcpName);
   *     messages.push({ type: "text", text: "Custom trailer for the agent" });
   *     return messages;
   *   },
   * });
   * ```
   */
  public getDefaultMessages = async (
    context: IMCPContext,
    when: Date,
    mcpName: MCPName
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_DEFAULT_MESSAGES, {
      mcpName,
      when,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_DEFAULT_MESSAGES);
    }

    return DEFAULT_GET_MESSAGES(context, when);
  }

  /**
   * Renders the trade history of the MCP's strategy into agent messages:
   * the last {@link MAX_HISTORY_ROWS} CLOSED positions from the live signal
   * storage, newest first — dollar/percent result, direction, close reason,
   * open/close times and the opening note per trade.
   *
   * Complements getStatus for stateless agents: the status shows what is
   * open, the history shows what was already traded and how it ended, so
   * the agent does not re-enter the same idea right after closing it.
   *
   * @param mcpName - Name of the registered MCP schema (validated before rendering)
   * @returns Promise resolving to history messages for the MCP agent
   *
   * @example
   * ```typescript
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const messages = await MCP.getDefaultMessages(context, when, mcpName);
   *     const history = await MCP.getHistoryMessages(mcpName);
   *     messages.push(...history);
   *     return messages;
   *   },
   * });
   * ```
   */
  public getHistoryMessages = async (
    mcpName: MCPName,
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_HISTORY_MESSAGES, {
      mcpName,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_HISTORY_MESSAGES);
    }

    const when = alignToInterval(new Date(), "1m");
    return await HISTORY_GET_MESSAGES(mcpName, when);
  };

  /**
   * Renders the current portfolio of the MCP's strategy into agent messages.
   *
   * Builds a per-symbol snapshot (current price, queued entry, active
   * position with PnL, queued close) over every live instance of the bound
   * strategy and passes it to the schema's getMessages (or the default
   * text renderer). Fires the schema's onStatus callback with the snapshot
   * and the rendered messages.
   *
   * Requires the "read" permission on the schema.
   *
   * @param mcpName - Name of the registered MCP schema
   * @returns Promise resolving to messages for the MCP agent
   * @throws Error when the schema lacks the "read" permission
   *
   * @example
   * ```typescript
   * const messages = await MCP.getStatus("my-mcp");
   * for (const message of messages) {
   *   if (message.type === "text") console.log(message.text);
   * }
   * ```
   */
  public getStatus = async (mcpName: string): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_STATUS, {
      mcpName,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_STATUS);
      CHECK_PERMISSION_FN(mcpName, "read", METHOD_NAME_GET_STATUS);
    }

    const context = await GET_TARGET_CONTEXT_FN(mcpName);
    const messages = await GET_TARGET_MESSAGES_FN(mcpName, context);

    await CALL_STATUS_CALLBACKS_FN(mcpName, context, messages);

    return messages;
  };

  /**
   * Opens a position for a symbol on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have no pending signal. Levels are moonbag: fixed 50% take profit,
   * hard stop-loss snapped one notch below CC_MAX_STOPLOSS_DISTANCE_PERCENT;
   * entry cost comes from the schema's positionCost.
   *
   * @param dto - Open command with symbol, direction, mcpName and note
   * @returns Promise resolving when the create-signal commit is accepted
   * @throws Error when the symbol is not live-enabled or a pending signal exists
   * @throws Error when the schema lacks the "write" permission
   *
   * @example
   * ```typescript
   * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "breakout entry" });
   * ```
   */
  public commitPositionOpen = async (dto: IMCPPositionOpenCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_OPEN, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_OPEN);
      CHECK_PERMISSION_FN(dto.mcpName, "write", METHOD_NAME_COMMIT_POSITION_OPEN);
    }

    return await COMMIT_POSITION_OPEN_FN(dto);
  };

  /**
   * Closes the pending position of a symbol on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have a pending signal; its id is consumed by the close commit.
   *
   * @param dto - Close command with symbol, mcpName and note
   * @returns Promise resolving when the close-pending commit is accepted
   * @throws Error when the symbol is not live-enabled or no pending signal exists
   * @throws Error when the schema lacks the "write" permission
   *
   * @example
   * ```typescript
   * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "manual exit" });
   * ```
   */
  public commitPositionClose = async (dto: IMCPPositionCloseCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_CLOSE, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_CLOSE);
      CHECK_PERMISSION_FN(dto.mcpName, "write", METHOD_NAME_COMMIT_POSITION_CLOSE);
    }

    return await COMMIT_POSITION_CLOSE_FN(dto);
  };
}

/**
 * Global singleton instance of MCPUtils.
 * Provides static-like access to MCP agent trading methods.
 *
 * @example
 * ```typescript
 * import { MCP } from "backtest-kit";
 *
 * const messages = await MCP.getStatus("my-mcp");
 * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "agent decision" });
 * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "agent decision" });
 * ```
 */
export const MCP = new MCPUtils();
