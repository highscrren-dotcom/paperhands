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
      "Add a DCA (dollar-cost averaging) entry to the active live position of a symbol at the current market price.",

      "WHAT IT DOES: invests the configured entry cost again into the same position, in the same direction. The effective entry price becomes the cost-weighted average of all entries, so the position needs a smaller move to recover — while the money at risk grows by the same amount each time. get_status then lists every entry separately (price, cost, timestamp) alongside the new average and the raised balance.",

      "WHAT YOU CONTROL: only the symbol. The engine picks the position, the price and the amount — there is no size to choose and no limit price to set.",

      "WHEN IT IS RIGHT: the price moved against a thesis you still believe in, and the reason for believing it is still true. Averaging a thesis that has actually broken does not rescue the trade, it doubles the loss — and because there is no working take-profit, a bigger position simply means more capital stuck waiting for an exit you still have to call yourself. If the reason for the trade is gone, close_position is the correct tool, not this one.",

      "THIS COMMAND CARRIES NO DESCRIPTION, so the DCA event inherits the description the position was OPENED with. That means the event log will not explain why you averaged unless you say so: call notify_user right after, stating what made averaging correct here — where price is relative to the original entry, why the thesis survives, and what would stop you from averaging again.",

      "REQUIRES AN ALREADY-ACTIVE POSITION. An entry order still sitting in the queue is not a position and cannot be averaged into. Confirm via get_status that the symbol shows an active position first — typically about a minute after open_position, allow up to five.",

      "TIMING. The command is queued and drains on the engine's once-per-minute pass, so the new average and balance appear in get_status on the following pass. An unchanged average immediately after the call is expected — do NOT resubmit, or the position takes two extra entries instead of one.",

      "Fails if the symbol is not enabled for trading, or has no active position. May also be refused if the MCP schema does not grant the averaging permission — that refusal is final and states so; retrying cannot change it.",
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
