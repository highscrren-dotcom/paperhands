import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the notify_user tool.
 *
 * Attaches a description to the active position of a symbol through the
 * configured MCP. The engine resolves the active position by symbol and
 * stores the description as a signal notification, surfaced back through the
 * get_status composition while the position stays open. It attaches only to
 * an already-open position — a queued entry order carries no signal to hold
 * it, so the tool description tells the agent to confirm the active position
 * via get_status at least 5 minutes after opening. Markdown is rendered, so
 * detailed multi-line descriptions are encouraged.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerNotifyUserTool(server: McpServer) {
  server.tool(
    "notify_user",
    str.newline(
      "Attach a human-readable description to the active live position of a symbol.",
      "The description is stored with the position's signal and surfaces back in get_status while the position is open — record your thesis, observations and exit criteria so a later stateless call can pick up the reasoning.",
      "A detailed multi-line description is strongly preferred over a single sentence: the full markdown syntax is rendered — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links. Lay out what you observe now, how it changes the thesis and which levels decide the exit.",
      "A description attaches only to a position that is already in active state: an entry order waiting to open in the queue carries no signal to hold it. Call this no earlier than 5 minutes after open_position, once get_status shows an active position for the symbol.",
      "The description is queued like any other command and lands on a live tick: expect it to surface in get_status only after roughly 5 minutes. The delay is not a failure — do not resubmit it.",
      "Fails if the symbol is not enabled for trading or has no active position.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      description: z
        .string()
        .describe(
          "Description to attach to the active position. Detailed multi-line markdown is strongly preferred: headings, lists, emphasis, code blocks and quotes all render",
        ),
    },
    async ({ symbol, description }) => {
      try {
        await ioc.mcpCommandService.commitSignalNotify({
          symbol,
          note: description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Notify command accepted: the description is attached to the active position for ${symbol}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to notify position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
