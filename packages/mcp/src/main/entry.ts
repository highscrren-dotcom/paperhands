import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getEntry } from "../helpers/getEntry";
import { getToolList } from "../helpers/getArgs";
import { serveSse } from "./sse";

import registerGetStatusTool from "../tools/get_status.tool";
import registerOpenPositionTool from "../tools/open_position.tool";
import registerClosePositionTool from "../tools/close_position.tool";
import registerAveragePositionTool from "../tools/average_position.tool";
import registerNotifyUserTool from "../tools/notify_user.tool";

/** Every tool name the stdio server can expose, as the agent sees them. */
const TOOL_LIST = [
    "get_status",
    "open_position",
    "close_position",
    "average_position",
    "notify_user",
];

export const main = async () => {
    if (!getEntry(import.meta.url)) {
      return;
    }

    {
        const toolList = getToolList();
        const unknownList = toolList.filter((tool) => !TOOL_LIST.includes(tool));
        if (unknownList.length) {
            console.error(`MCP Error: unknown tools requested via --tools: ${unknownList.join(", ")}. Available tools: ${TOOL_LIST.join(", ")}`);
            process.exit(-1);
        }
    }

    // A factory, not a single instance: SSE serves one server per session, since
    // a server holds exactly one transport (see serveSse).
    const createMcpServer = () => {
        const server = new McpServer({
            name: "trading-signals-mcp",
            version: "1.0.0"
        });
        const toolList = getToolList();
        // An empty --tools means the argument was not passed: expose everything
        const hasTool = (tool: string) => !toolList.length || toolList.includes(tool);
        if (hasTool("get_status")) {
            registerGetStatusTool(server);
        }
        if (hasTool("open_position")) {
            registerOpenPositionTool(server);
        }
        if (hasTool("close_position")) {
            registerClosePositionTool(server);
        }
        if (hasTool("average_position")) {
            registerAveragePositionTool(server);
        }
        if (hasTool("notify_user")) {
            registerNotifyUserTool(server);
        }
        return server;
    };

    // Serves over the network when --sse was passed, otherwise does nothing and
    // leaves the default stdio transport below to take over.
    if (await serveSse(createMcpServer)) {
        return;
    }

    const transport = new StdioServerTransport();
    await createMcpServer().connect(transport);
}

main();
