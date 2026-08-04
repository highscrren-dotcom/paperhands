import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import getEntry from "../helpers/getEntry";

import registerGetStatusTool from "../tools/get_status.tool";
import registerGetNotificationsTool from "../tools/get_notifications.tool";
import registerOpenPositionTool from "../tools/open_position.tool";
import registerClosePositionTool from "../tools/close_position.tool";
import registerAveragePositionTool from "../tools/average_position.tool";
import registerNotifyPositionTool from "../tools/notify_position.tool";

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
        registerGetNotificationsTool(server);
        registerOpenPositionTool(server);
        registerClosePositionTool(server);
        registerAveragePositionTool(server);
        registerNotifyPositionTool(server);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

}

main();
