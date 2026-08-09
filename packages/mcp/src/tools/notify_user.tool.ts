import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ioc from "../lib/index.js";
import { getErrorMessage, str } from "functools-kit";

/**
 * Registers the notify_user tool.
 *
 * Attaches a description to the active position of a symbol through the
 * configured MCP. The engine resolves the active position by symbol and
 * stores the description as a signal notification, surfaced back through the
 * get_status composition. It attaches only to an already-active position — a
 * queued entry order carries no signal to hold it. This is the only way to
 * record reasoning that is not tied to opening or closing: observations
 * mid-trade, and the reason behind an averaging, which carries no
 * description of its own.
 *
 * @param server - MCP server to register the tool on
 */
export default function registerNotifyUserTool(server: McpServer) {
  server.tool(
    "notify_user",
    str.newline(
      "Attach a note to the active PAPER position of a symbol. Changes nothing about the trade — it only records reasoning.",

      "WHY IT EXISTS. open_position records why a trade started, close_position records why it ended. Everything in between — the price behaved unexpectedly, the thesis shifted, a level was reached, an averaging was done and needs justifying — has no other place to live. Without notes, a later call sees an open position, a number, and no idea what it was supposed to be doing.",

      "WRITE FOR A READER WITH NO MEMORY. Later calls have no recollection of this moment; they read exactly what is stored and nothing more. State what is observed NOW, how it changes (or confirms) the original thesis, and which specific levels or conditions decide the exit from here. Full markdown renders — headings, bullet and numbered lists, bold and italic, inline code and fenced code blocks, blockquotes, links.",

      "USE IT AFTER AVERAGING. average_position takes no description of its own, so the DCA event inherits the description from the original entry and explains nothing about why the position was doubled. A note right after the averaging is the only record of that reasoning.",

      "REQUIRES AN ALREADY-ACTIVE POSITION. An entry order still sitting in the queue is not a position and cannot hold a note. Confirm via get_status that the symbol shows an active position first — typically about a minute after open_position, allow up to five.",

      "TIMING. The note is queued like every command and drains on the engine's once-per-minute pass, so it surfaces in get_status on the following pass. Do NOT resubmit while waiting — a duplicated note buries the rest of the history under repetition.",

      "Notes are kept per position: they follow the signal id, so several symbols can be annotated independently, and a note never leaks onto another trade.",

      "Fails if the symbol is not enabled for trading, or has no active position.",
    ),
    {
      symbol: z.string().describe("Trading pair symbol (e.g., BTCUSDT)"),
      description: z
        .string()
        .describe(
          "Description to attach to the active position. Detailed multi-line markdown is strongly preferred: headings, lists, emphasis, code blocks and quotes all render",
        ),
    },
    async ({ symbol, description }) => {
      try {
        await ioc.mcpCommandService.commitSignalNotify({
          symbol,
          note: description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Notify command accepted: the description is attached to the active position for ${symbol}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to notify position: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    }
  );
}
