import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the get_status tool.
 *
 * The agent's only read path: renders the live portfolio of the configured
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
      "Read the live trading portfolio. This is the only way to see state: every other tool writes, this one reads.",

      "PORTFOLIO. A header message summarises the account — how many symbols hold a position, total invested, total unrealized PnL in USD with the percent of invested, and a per-symbol dollar breakdown. Dollars lead because entry prices differ between positions, so percents are not comparable across them.",

      "PER SYMBOL. One message each, for every symbol enabled for trading. A symbol holding a position reports: effective entry price (averaged across DCA entries, with each entry listed separately when there is more than one), current price, unrealized PnL in USD and percent, peak profit and max drawdown with how many minutes ago each extreme happened, the open time with its age, the remaining hold time, the invested balance, the signal id, and the description the position was opened with. A flat symbol reports its price and states plainly that no capital is invested.",

      "QUEUES. Each symbol also shows two slots: the entry order waiting to open and the close order waiting to execute. Empty slots are stated explicitly ('Entry queue: empty'), so a missing field never has to be guessed at. A queued order carries its description, and a queued close carries BOTH the entry description and the exit description.",

      "SIGNAL ID ties everything together. The same id appears on the active position, on every event about it, and on its row in the history — use it to follow one trade across the whole output rather than matching by symbol, which repeats over time.",

      "TIMING. The engine applies queued commands once per minute, so a command issued now is reflected on the next pass. Two consecutive calls can therefore return different state under the same snapshot timestamp — the timestamp is the engine clock, not proof that nothing changed. Conversely, calling twice within seconds usually returns identical data; there is no value in polling faster than the minute.",

      "NO TAKE-PROFIT EXISTS. Positions never close themselves on profit — that is why no TP/SL levels are reported here. The engine holds only a distant emergency stop that caps a catastrophic loss, plus a hold timeout. Every real exit is yours, via close_position.",

      "Call this before every decision: before opening (to check the symbol is free), before closing (to read the PnL and how the position behaved), and after any command (to confirm it landed).",
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
