import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ioc from "../lib/index.js";
import { getErrorMessage } from "functools-kit";

/**
 * Registers the get_status tool.
 *
 * Renders the current live portfolio of the configured MCP into agent
 * messages: per traded symbol the current price, capital balance, the queued
 * entry order, the active position with unrealized PnL and the queued close
 * order. IMCPMessage items map 1:1 onto MCP content blocks (text and image).
 *
 * @param server - MCP server to register the tool on
 */
export default function registerGetStatusTool(server: McpServer) {
  server.tool(
    "get_status",
    "Fetch the current live trading portfolio status. Returns one message per traded symbol with: current price, invested capital balance, the entry order waiting in the queue (direction, entry price, take profit, stop loss, cost, note), the active position with its unrealized PnL (percent and USD), and the close order waiting in the queue. Empty slots are stated explicitly. Call this before opening or closing a position to see what is already pending or active.",
    {},
    async () => {
      try {
        const messages = await ioc.mcpPublicService.getStatus();

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
            { type: "text" as const, text: `Failed to fetch status: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
