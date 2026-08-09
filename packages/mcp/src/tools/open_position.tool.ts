import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
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
      "Open a PAPER trading position at the current market price. One position per symbol.",

      "PAPER TRADING ONLY. This opens a simulated position with virtual capital, priced against the real live market. No exchange account is touched and no real order is placed — nothing here can lose real money. Trade it as seriously as the real thing anyway: the whole point is to produce an honest record, and a sloppy paper trade produces a worthless one.",

      "WHAT YOU CONTROL: the symbol, the direction (long or short), and the description explaining why. Nothing else. The trading engine computes the entry cost, and sets a distant emergency stop-loss that only caps a catastrophic loss. You cannot size the position, pick an entry price, or set your own stop — attempting to reason about those levels is wasted effort.",

      "THERE IS NO WORKING TAKE-PROFIT. The position will never close itself on profit. Left alone it dies either at the emergency stop or at the hold timeout, whichever comes first — both are bad outcomes. Every real exit is a deliberate close_position call from you.",

      "DESCRIPTION IS NOT A LABEL, IT IS THE MEMORY OF THE TRADE. It is the only record of why the position exists, and it comes back to you later — in get_status while the position is open, and in the event log after it closes. A future call with no memory of this moment reads it to decide whether to hold, average or exit. Write it for that reader: the setup, the evidence behind it, the levels being watched, and what would prove the idea wrong. Full markdown renders — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links. A one-line description leaves a future call with nothing to reason from, and an undescribed trade is invisible in the event log entirely.",

      "TIMING. The order is queued, not filled instantly. The engine drains the queue once per minute, so the position appears in get_status on the next pass — usually within a minute, allow up to five. Until then get_status shows it under 'Entry queue', not as an active position, and notify_user and average_position will both refuse it. That delay is normal: do NOT resubmit the open, or you risk a duplicate once the queue drains.",

      "AFTER IT OPENS. Confirm via get_status that the symbol shows an active position, note its signal id, and use notify_user to record anything the entry description could not yet know — how price reacted, what changed, what now decides the exit.",

      "Fails if the symbol is not enabled for trading, or already holds a position or a queued order. Symbols are independent: opening one never affects another, and several can be opened in the same minute. Call get_status first to see which symbols are free.",
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
