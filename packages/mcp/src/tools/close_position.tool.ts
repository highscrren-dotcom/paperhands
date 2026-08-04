import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the close_position tool.
 *
 * Queues a close of the active position of a symbol through the configured
 * MCP. The close executes at the current market price on the next live tick;
 * the engine resolves which pending signal is consumed.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerClosePositionTool(server: McpServer) {
  server.tool(
    "close_position",
    str.newline(
      "Close the active live position of a symbol at the current market price.",
      "This is the only way to realize profit or cut a loss: positions are exited manually by this call, nothing else closes them except the distant emergency stop-loss or the hold timeout.",
      "You choose the symbol and a note explaining the reason; the trading engine resolves which position is closed.",
      "Fails if the symbol is not enabled for trading or has no active position — call get_status first to see active positions and their unrealized PnL, and get_notifications to recall the thesis and exit criteria recorded for them.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      note: z
        .string()
        .describe("Human-readable reason for closing the position"),
    },
    async ({ symbol, note }) => {
      try {
        await ioc.mcpCommandService.commitPositionClose({
          symbol,
          note,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Close command accepted: the active position for ${symbol} will be closed at market price (note: ${note})`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to close position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
