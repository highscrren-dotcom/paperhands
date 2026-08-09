import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the close_position tool.
 *
 * Queues a close of the active position of a symbol through the configured
 * MCP. The close executes at the current market price on the next engine tick;
 * the engine resolves which active position is consumed. The description is
 * stored as the exit reason, separate from the entry reason the position was
 * opened with — both surface in the event log.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerClosePositionTool(server: McpServer) {
  server.tool(
    "close_position",
    str.newline(
      "Close the active PAPER position of a symbol at market price.",

      "PAPER TRADING ONLY: virtual capital, real market prices. No exchange account, no real order; the realized result is recorded, not paid out.",

      "THIS IS THE ONLY REAL EXIT. Nothing else takes profit or cuts a loss on purpose — the position has no working take-profit, and the only automatic ends are the distant emergency stop and the hold timeout, both meaning the trade got away from you. Deciding when to call this IS the job.",

      "YOU CONTROL: the symbol and the description. The engine resolves which position closes and executes at market price. No partial close, no exit price to name.",

      "THE DESCRIPTION IS THE EXIT REASON, STORED SEPARATELY FROM THE ENTRY REASON. The event log shows this trade twice: once as opened, carrying the entry description, and once as this close request, carrying what you write here. Write nothing meaningful and the log shows a trade opened for a stated reason and closed for none — which reads later as an idea still worth trying. That is exactly how the same losing trade gets re-entered. State what happened to the thesis, how price actually behaved, and what made you exit NOW rather than earlier or later. Markdown renders.",

      "TIMING: the close is queued, not immediate. The engine drains the queue once a minute, so the position stays visible in get_status until the next pass, showing a 'Close queue' slot with both descriptions. Do NOT resubmit during that window.",

      "AFTER IT EXECUTES the trade moves to the history with its realized result, close reason and holding time, and the symbol becomes free again.",

      "Fails if the symbol is not enabled for trading, or has no active position — including when its entry order is still queued. Symbols are independent; several can be closed in the same minute.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      description: z
        .string()
        .describe(
          "Reason for closing the position. Detailed multi-line markdown is strongly preferred: headings, lists, emphasis, code blocks and quotes all render",
        ),
    },
    async ({ symbol, description }) => {
      try {
        await ioc.mcpCommandService.commitPositionClose({
          symbol,
          note: description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Close command accepted: the active position for ${symbol} will be closed at market price`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to close position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
