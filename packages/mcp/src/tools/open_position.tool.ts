import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the open_position tool.
 *
 * Opens a paper position for a symbol through the configured MCP. The engine
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
      "Open a PAPER trading position at market price. One position per symbol.",

      "PAPER TRADING ONLY: virtual capital, real market prices. No exchange account, no real order, nothing here loses real money. Trade it as seriously as the real thing anyway — the deliverable is an honest record, and a sloppy paper trade produces a worthless one.",

      "YOU CONTROL: symbol, direction (long or short), and the description explaining why. Nothing else. The engine computes the entry cost and sets a distant emergency stop that only caps a catastrophic loss. You cannot size the position, pick an entry price or set your own stop — reasoning about those levels is wasted effort.",

      "NO WORKING TAKE-PROFIT EXISTS. The position never closes itself on profit. Left alone it dies at the emergency stop or the hold timeout — both bad outcomes. Every real exit is a deliberate close_position call.",

      "THE DESCRIPTION IS THE MEMORY OF THE TRADE, not a label. It is the only record of why this position exists, and it returns to you later — in get_status while open, and in the event log after it closes. A future call with no memory of this moment reads it to decide whether to hold, average or exit. Write for that reader: the setup, the evidence, the levels watched, and what would prove the idea wrong. Markdown renders. A one-liner leaves nothing to reason from; an undescribed trade is invisible in the event log entirely.",

      "TIMING: the order is queued, not filled instantly. The engine drains the queue once a minute, so the position appears in get_status on the next pass. Until then it sits under 'Entry queue' and both notify_user and average_position will refuse it. Do NOT resubmit — you risk a duplicate once the queue drains.",

      "AFTER IT OPENS: confirm via get_status, note the signal id, and use notify_user for anything the entry description could not yet know.",

      "Fails if the symbol is not enabled for trading, or already holds a position or a queued order. Symbols are independent — several can be opened in the same minute.",
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
