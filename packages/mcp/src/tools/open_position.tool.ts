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
      "You choose the symbol, the direction (long or short) and a description explaining the reason. The trading engine sets the entry cost and a distant emergency stop-loss that only caps a catastrophic loss.",
      "A detailed multi-line description is strongly preferred over a single sentence: the full markdown syntax is rendered — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links. Lay out the setup, the evidence behind it, the levels you are watching and the invalidation criteria.",
      "There is no working take-profit: the position never closes itself on profit. The exit is yours — monitor get_status and close the position with close_position when the thesis plays out or fails; an unattended position dies by the emergency stop or the hold timeout.",
      "The order is queued and becomes a position on a live tick: expect it to appear in get_status as an active position only after roughly 5 minutes. The delay is not a failure — do not resubmit the open. Once the position shows up, record the thesis and exit criteria with notify_user so a later stateless call can pick up the reasoning.",
      "Fails if the symbol is not enabled for trading or already has a position or a queued order — call get_status first.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      position: z
        .enum(["long", "short"])
        .describe('Trade direction: "long" (buy) or "short" (sell)'),
      description: z
        .string()
        .describe(
          "Reason for opening the position. Detailed multi-line markdown is strongly preferred: headings, lists, emphasis, code blocks and quotes all render",
        ),
    },
    async ({ symbol, position, description }) => {
      try {
        await ioc.mcpCommandService.commitPositionOpen({
          symbol,
          position,
          note: description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Open command accepted: ${position} position for ${symbol} will be submitted at market price`,
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
