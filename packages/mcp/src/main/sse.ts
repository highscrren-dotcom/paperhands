import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { getSsePort } from "../helpers/getArgs";

/** Path clients open to establish the long-lived event stream. */
const SSE_PATH = "/sse";

/** Path clients POST their JSON-RPC messages to, correlated by sessionId. */
const MESSAGE_PATH = "/messages";

/**
 * Serves the MCP server over SSE when `--sse [PORT]` was passed.
 *
 * Without the flag this is a no-op, leaving the caller to fall back to stdio.
 * That keeps the choice of transport in one place: the entry point asks to serve
 * over the network and gets told whether it happened.
 *
 * SSE is a two-channel transport. The client opens a GET stream that stays open
 * for the life of the session and receives every server-to-client message on it,
 * then POSTs its own messages to a separate endpoint. The two are correlated by
 * the `sessionId` the transport advertises on connect.
 *
 * Takes a FACTORY, not a server instance, because `Server.connect` assigns a
 * single `_transport` field: connecting a second transport to the same server
 * silently detaches the first, and closing that first session then hangs. Each
 * session therefore gets its own McpServer with its own tool registrations.
 *
 * @param createMcpServer - Builds a fully configured server for one session
 * @returns True if an SSE listener was started, false when `--sse` was absent
 */
export const serveSse = async (
  createMcpServer: () => McpServer,
): Promise<boolean> => {
  const port = getSsePort();

  if (port === null) {
    return false;
  }

  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === SSE_PATH) {
      const transport = new SSEServerTransport(MESSAGE_PATH, res);
      transports.set(transport.sessionId, transport);
      // The stream outlives this handler, so the session is dropped on close.
      // Without this a reconnecting client leaks one transport per attempt.
      res.on("close", () => {
        transports.delete(transport.sessionId);
      });
      await createMcpServer().connect(transport);
      return;
    }

    if (req.method === "POST" && url.pathname === MESSAGE_PATH) {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Unknown sessionId: ${sessionId}`);
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  httpServer.listen(port, () => {
    // stderr, not stdout: stdout stays reserved for the stdio protocol so the
    // same binary can be piped either way without corrupting a JSON-RPC stream.
    console.error(`MCP SSE server listening on http://localhost:${port}${SSE_PATH}`);
  });

  return true;
};

export default serveSse;
