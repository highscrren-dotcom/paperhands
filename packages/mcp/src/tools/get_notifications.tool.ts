import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the get_notifications tool.
 *
 * Renders the notes previously attached to the active pending signals of the
 * configured MCP into agent messages: only notifications whose signalId
 * belongs to a position that is open right now; notes of closed positions
 * drop out automatically. IMCPMessage items map 1:1 onto MCP content blocks
 * (text and image).
 *
 * @param server - MCP server to register the tool on
 */
export default function registerGetNotificationsTool(server: McpServer) {
  server.tool(
    "get_notifications",
    str.newline(
      "Fetch the notes previously attached to the active live positions (pending signals).",
      "Returns the latest notifications recorded via notify_position for the positions that are open right now, newest first — your own prior reasoning about the trades you are holding: the thesis, observations and exit criteria. Notes of already-closed positions are not shown.",
      "Use it together with get_status: the status shows what is open, this tool recalls why it was opened and what has been noticed since.",
    ),
    {},
    async () => {
      try {
        const messages = await ioc.mcpCommandService.getNotificationMessages();

        return {
          content: messages.map((message) =>
            message.type === "text"
              ? { type: "text" as const, text: message.text }
              : {
                  type: "image" as const,
                  data: message.data,
                  mimeType: message.mimeType,
                },
          ),
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to fetch notifications: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
