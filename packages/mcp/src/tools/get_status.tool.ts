import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the get_status tool.
 *
 * The agent's only read path: renders the paper portfolio of the configured
 * MCP plus whatever feeds the schema's getMessages composes into it — the
 * annotated event log, the trade history, directives the strategy raised.
 * IMCPMessage items map 1:1 onto MCP content blocks (text and image), so a
 * schema rendering charts returns them inline.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerGetStatusTool(server: McpServer) {
  server.tool(
    "get_status",
    str.newline(
      "Read the trading portfolio. The only read path: every other tool writes.",

      "PAPER TRADING ONLY: virtual capital, real market prices. No exchange account, no real order, no real money at risk. Fees and slippage are real, so results are meaningful — the balance is not.",

      "DO NOT CALL MORE OFTEN THAN ONCE PER 90 SECONDS. The engine applies queued commands once a minute; calling sooner returns the same snapshot, because the tick that would change it has not run. After issuing a command wait 90s before checking — one tick plus margin. Tight polling wastes context and invites the false conclusion that a command failed, followed by a resubmission that duplicates it.",

      "RETURNS: a header summarising open position count, total invested and total unrealized PnL in USD (dollars lead — entry prices differ, so percents are not comparable across positions); then one message per traded symbol.",

      "A symbol holding a position reports effective entry price (averaged over DCA entries, each listed separately), current price, unrealized PnL in USD and percent, peak profit and max drawdown with minutes since each, open time and its age, remaining hold time, invested balance, signal id, and the description it was opened with. A flat symbol states plainly that no capital is invested.",

      "Each symbol also shows two queue slots: the entry order waiting to open and the close order waiting to execute. Empty slots are stated explicitly, so nothing has to be guessed. A queued close carries BOTH the entry and the exit description.",

      "SIGNAL ID ties a trade together across the active position, every event about it and its history row — follow that, not the symbol, which repeats over time.",

      "NO TAKE-PROFIT EXISTS: positions never close themselves on profit, which is why no TP/SL levels appear. The engine holds only a distant emergency stop and a hold timeout. Every real exit is yours via close_position.",

      "Call before every decision: before opening (is the symbol free), before closing (PnL and behaviour), and after any command (did it land).",
    ),
    {},
    async () => {
      try {
        const messages = await ioc.mcpCommandService.getStatus();

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
