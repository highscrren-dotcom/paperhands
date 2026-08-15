import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the average_position tool.
 *
 * Adds a DCA entry to the active position of a symbol through the configured
 * MCP. The engine resolves the active position by symbol and owns the money:
 * the entry executes at the current market price with the configured entry
 * cost — the agent only chooses the symbol. Averaging applies only to an
 * already-active position: a queued entry order carries no signal to average
 * into. The DCA event inherits the ENTRY description, since the command takes
 * no description of its own — record the reason for averaging separately with
 * notify_user.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerAveragePositionTool(server: McpServer) {
  server.tool(
    "average_position",
    str.newline(
      "Add a DCA (dollar-cost averaging) entry to the active PAPER position of a symbol at market price.",

      "PAPER TRADING ONLY: virtual capital, real market prices. No exchange account, no real order.",

      "WHAT IT DOES: invests the configured entry cost again into the same position, same direction. The effective entry becomes the cost-weighted average of all entries, so the position needs a smaller move to recover — while the money at risk grows by the same amount. get_status then lists every entry separately alongside the new average and raised balance.",

      "YOU CONTROL: only the symbol. The engine picks the position, price and amount — no size to choose, no limit price.",

      "WHEN IT IS RIGHT: price moved against a thesis you still believe in, and the reason for believing it still holds. Averaging a broken thesis does not rescue the trade, it doubles the loss — and with no working take-profit, a bigger position just means more capital stuck awaiting an exit you must still call yourself. If the reason is gone, close_position is the correct tool.",

      "THIS COMMAND CARRIES NO DESCRIPTION, so the DCA event inherits the description the position was OPENED with, explaining nothing about why you averaged. Call notify_user right after: where price sits relative to the original entry, why the thesis survives, and what would stop you averaging again.",

      "REQUIRES AN ALREADY-ACTIVE POSITION. An entry order still in the queue cannot be averaged into. Confirm via get_status first.",

      "TIMING: queued, drains on the engine's once-per-minute pass, so the new average appears on the following pass. An unchanged average right after the call is expected — do NOT resubmit, or the position takes two extra entries instead of one.",

      "Fails if the symbol is not enabled for trading or has no active position. May also be refused when the schema does not grant the averaging permission — that refusal is final; retrying cannot change it.",
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
