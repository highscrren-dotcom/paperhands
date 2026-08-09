import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the close_position tool.
 *
 * Queues a close of the active position of a symbol through the configured
 * MCP. The close executes at the current market price on the next live tick;
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
      "Close the active live position of a symbol at the current market price.",

      "THIS IS THE ONLY REAL EXIT. Nothing else takes profit or cuts a loss on purpose: the position has no working take-profit, and the only automatic ends are the distant emergency stop-loss and the hold timeout — both mean the trade got away from you. Deciding when to call this IS the job.",

      "WHAT YOU CONTROL: the symbol and the description. The engine resolves which position is being closed and executes at market price. There is no partial close and no exit price to name.",

      "THE DESCRIPTION IS THE EXIT REASON, AND IT IS STORED SEPARATELY FROM THE ENTRY REASON. This matters more than it looks: the event log will show this trade twice — once as it was opened, carrying the entry description, and once as this close request, carrying what you write here. If you write nothing meaningful, the log ends up showing a trade that opened for a stated reason and closed for no stated reason, which reads later as an idea still worth trying. That is exactly how the same losing trade gets re-entered. Write what happened to the thesis, how price actually behaved, and what specifically made you exit NOW rather than earlier or later. Full markdown renders — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links.",

      "TIMING. The close is queued, not immediate. The engine drains the queue once per minute, so the position stays visible in get_status until the next pass — usually within a minute, allow up to five. While it waits, the symbol shows a 'Close queue' slot carrying both descriptions. Do NOT resubmit the close during that window.",

      "AFTER IT EXECUTES the trade moves to the history with its realized result, close reason and how long it was held, and the symbol becomes free to open again.",

      "Fails if the symbol is not enabled for trading, or has no active position — including when its entry order is still queued and has not become a position yet. Symbols are independent: closing one never touches another, and several can be closed in the same minute. Call get_status first to read the unrealized PnL, the peak and drawdown, and how long the position has been held.",
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
