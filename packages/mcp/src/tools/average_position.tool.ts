import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the average_position tool.
 *
 * Adds a DCA entry to the active position of a symbol through the configured
 * MCP. The engine resolves the active position by symbol and owns the money:
 * the entry executes at the current market price with the configured entry
 * cost — the agent only chooses the symbol.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerAveragePositionTool(server: McpServer) {
  server.tool(
    "average_position",
    str.newline(
      "Add a DCA (dollar-cost averaging) entry to the active live position of a symbol at the current market price.",
      "The trading engine resolves the active position by symbol and invests the configured entry cost; the effective entry price becomes the average of all entries. You only choose the symbol.",
      "Use it to improve the average entry when the price moved against a thesis you still believe in — averaging a dying thesis only deepens the loss.",
      "Fails if the symbol is not enabled for trading or has no active position — call get_status first.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
    },
    async ({ symbol }) => {
      try {
        await ioc.mcpCommandService.commitAverageBuy({
          symbol,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Average command accepted: a DCA entry for ${symbol} will be added at the current market price`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to average position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
