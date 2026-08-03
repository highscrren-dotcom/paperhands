import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import getEntry from "../helpers/getEntry";

import registerGetStatusTool from "../tools/get_status.tool";
import registerOpenPositionTool from "../tools/open_position.tool";
import registerClosePositionTool from "../tools/close_position.tool";

export const main = async () => {
    if (!getEntry(import.meta.url)) {
      return;
    }

    const server = new McpServer({
        name: "trading-signals-mcp",
        version: "1.0.0"
    });

    {
        registerGetStatusTool(server);
        registerOpenPositionTool(server);
        registerClosePositionTool(server);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

}

main();
