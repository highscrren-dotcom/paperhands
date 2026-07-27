import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage } from "functools-kit";

/**
 * Registers the open_position tool.
 *
 * Opens a live position for a symbol through the configured MCP. The engine
 * owns the levels: fixed 50% take profit (moonbag), hard stop-loss snapped
 * below the configured maximum, entry cost from the MCP schema — the agent
 * only chooses the symbol, the direction and the reason.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerOpenPositionTool(server: McpServer) {
  server.tool(
    "open_position",
    "Open a live trading position at the current market price. You choose only the symbol, the direction (long or short) and a note explaining the reason; entry cost, take profit and hard stop-loss levels are set by the trading engine. Fails if the symbol is not enabled for trading or a position/order for it already exists — call get_status first to check. The position stays open until its stop-loss, timeout, or an explicit close_position call.",
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      position: z
        .enum(["long", "short"])
        .describe('Trade direction: "long" (buy) or "short" (sell)'),
      note: z
        .string()
        .describe("Human-readable reason for opening the position"),
    },
    async ({ symbol, position, note }) => {
      try {
        await ioc.mcpCommandService.commitPositionOpen({
          symbol,
          position,
          note,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Open command accepted: ${position} position for ${symbol} will be submitted at market price (note: ${note})`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to open position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
