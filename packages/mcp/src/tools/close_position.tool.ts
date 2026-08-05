import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the close_position tool.
 *
 * Queues a close of the active position of a symbol through the configured
 * MCP. The close executes at the current market price on the next live tick;
 * the engine resolves which active position is consumed.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerClosePositionTool(server: McpServer) {
  server.tool(
    "close_position",
    str.newline(
      "Close the active live position of a symbol at the current market price.",
      "This is the only way to realize profit or cut a loss: positions are exited manually by this call, nothing else closes them except the distant emergency stop-loss or the hold timeout.",
      "You choose the symbol and a description explaining the reason; the trading engine resolves which position is closed.",
      "A detailed multi-line description is strongly preferred over a single sentence: the full markdown syntax is rendered — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links. Lay out what happened to the thesis, how the price behaved and what made you exit now.",
      "The close is queued and executes on a live tick: expect the position to stay visible in get_status for roughly 5 minutes after this call. The delay is not a failure — do not resubmit the close.",
      "Fails if the symbol is not enabled for trading or has no active position — call get_status first to see active positions and their unrealized PnL.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      description: z
        .string()
        .describe(
          "Reason for closing the position. Detailed multi-line markdown is strongly preferred: headings, lists, emphasis, code blocks and quotes all render",
        ),
    },
    async ({ symbol, description }) => {
      try {
        await ioc.mcpCommandService.commitPositionClose({
          symbol,
          note: description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Close command accepted: the active position for ${symbol} will be closed at market price`,
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
