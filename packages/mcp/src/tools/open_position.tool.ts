import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

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
    str.newline(
      "Open a live trading position at the current market price.",
      "You choose the symbol, the direction (long or short) and a note explaining the reason. The trading engine sets the entry cost and a distant emergency stop-loss that only caps a catastrophic loss.",
      "There is no working take-profit: the position never closes itself on profit. The exit is yours — monitor get_status and close the position with close_position when the thesis plays out or fails; an unattended position dies by the emergency stop or the hold timeout.",
      "After opening, record the thesis and exit criteria with notify_position so a later stateless call can pick up the reasoning.",
      "Fails if the symbol is not enabled for trading or already has a position or a queued order — call get_status first.",
    ),
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
