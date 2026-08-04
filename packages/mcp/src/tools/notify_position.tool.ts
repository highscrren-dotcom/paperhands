import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the notify_position tool.
 *
 * Attaches a note to the active position of a symbol through the configured
 * MCP. The engine resolves the pending signal by symbol and stores the note
 * as a signal notification, readable back via get_notifications while the
 * position stays open.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerNotifyPositionTool(server: McpServer) {
  server.tool(
    "notify_position",
    str.newline(
      "Attach a human-readable note to the active live position of a symbol.",
      "The note is stored with the position's signal and can be read back via get_notifications while the position is open — record your thesis, observations and exit criteria so a later stateless call can pick up the reasoning.",
      "Fails if the symbol is not enabled for trading or has no active position — call get_status first.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      note: z
        .string()
        .describe("Human-readable note to attach to the active position"),
    },
    async ({ symbol, note }) => {
      try {
        await ioc.mcpCommandService.commitSignalNotify({
          symbol,
          note,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Notify command accepted: the note is attached to the active position for ${symbol} (note: ${note})`,
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
