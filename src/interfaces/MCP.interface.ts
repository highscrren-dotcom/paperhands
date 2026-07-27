import { IPublicSignalRow, ISignalCloseRow, ISignalDto, StrategyName } from "./Strategy.interface";

/**
 * Base64-encoded binary payload of an MCP image message.
 */
export type MCPBase64 = string;

/**
 * Image message for the MCP agent (e.g. a rendered chart).
 * Payload is base64-encoded binary data with its mime type.
 */
export interface IMCPImageMessage {
    /** Discriminator for type-safe union */
    type: "image";
    /** Mime type of the encoded payload (e.g., "image/png") */
    mimeType: string;
    /** Base64-encoded binary data of the image */
    data: MCPBase64;
}

/**
 * Plain text message for the MCP agent.
 */
export interface IMCPTextMessage {
    /** Discriminator for type-safe union */
    type: "text";
    /** Human-readable message text */
    text: string;
}

/**
 * Message emitted to the MCP agent by getMessages.
 * Discriminated union of text and image messages.
 */
export type IMCPMessage = IMCPTextMessage | IMCPImageMessage;

/**
 * Portfolio snapshot passed to getMessages, keyed by traded symbol.
 * One entry per live instance of the schema's strategy.
 */
export interface IMCPContext {
    [symbol: string]: {
        /** Signal DTO queued to open a position on the next tick, or null if none queued */
        createdSignal: ISignalDto | null;
        /** Active position with unrealized PnL computed at currentPrice, or null if none open */
        pendingSignal: IPublicSignalRow | null;
        /** Deferred user-initiated close waiting to be drained, or null if none queued */
        closedSignal: ISignalCloseRow | null;
        /** Current VWAP price of the symbol */
        currentPrice: number;
    }
}

/**
 * Command payload for MCP.commitPositionOpen.
 * Opens a moonbag position (fixed 50% TP, grid-snapped hard SL) for a symbol
 * enabled in live trading for the schema's strategy.
 */
export interface IMCPPositionOpenCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Name of the registered MCP schema issuing the command */
  mcpName: MCPName;
  /** Human-readable reason attached to the created signal */
  note: string;
}

/**
 * Command payload for MCP.commitPositionClose.
 * Closes the pending position of a symbol enabled in live trading
 * for the schema's strategy.
 */
export interface IMCPPositionCloseCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered MCP schema issuing the command */
  mcpName: MCPName;
  /** Human-readable reason attached to the close commit */
  note: string;
}

/**
 * Lifecycle callbacks of an MCP instance (all optional).
 *
 * Fire AFTER the corresponding engine effect succeeds, with the raw data
 * the effect was built from — a test registers them to observe what the
 * MCP actually did (rendered snapshot, submitted signal, consumed pending
 * id) without mocking the live machinery. An omitted callback is simply
 * never fired; a callback that throws is logged and does not fail the
 * operation.
 */
export interface IMCPCallbacks {
    /**
     * Fired after getStatus renders the portfolio: the snapshot the
     * renderer received and the messages it produced.
     */
    onStatus(mcpName: MCPName, context: IMCPContext, messages: IMCPMessage[]): void;
    /**
     * Fired after a position open commit is accepted: the exact signal DTO
     * submitted to the live strategy (moonbag TP/SL levels, cost, note).
     */
    onPositionOpen(symbol: string, signal: ISignalDto, dto: IMCPPositionOpenCommand): void;
    /**
     * Fired after a close commit is accepted: the id of the pending signal
     * the close was queued for.
     */
    onPositionClose(symbol: string, signalId: string, dto: IMCPPositionCloseCommand): void;
}

/**
 * Registration schema of an MCP instance.
 *
 * Binds an MCP name to a strategy: status and position commands operate on
 * every live instance of that strategy.
 * - mcpName — registry key; duplicate registration is a validation error.
 * - strategyName — the strategy whose live instances the MCP observes and trades.
 * - positionCost — entry cost in USD for commitPositionOpen; defaults to
 *   GLOBAL_CONFIG.CC_POSITION_ENTRY_COST when omitted.
 * - getMessages — renders the portfolio snapshot into agent messages; when
 *   omitted the default renderer emits one text message per symbol.
 * - callbacks — all optional; an omitted callback is simply never fired.
 */
export interface IMCPSchema {
    /** Unique MCP identifier for the schema registry */
    mcpName: MCPName;
    /** Strategy whose live instances this MCP observes and trades */
    strategyName: StrategyName;
    /** Entry cost in USD for opened positions. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST */
    positionCost?: number;
    /** Renders the portfolio snapshot into messages for the MCP agent (default: text per symbol) */
    getMessages?: (context: IMCPContext, when: Date, mcpName: MCPName) => IMCPMessage[] | Promise<IMCPMessage[]>;
    /** Lifecycle callbacks (all optional) */
    callbacks?: Partial<IMCPCallbacks>;
}

/**
 * Unique MCP identifier.
 */
export type MCPName = string;
