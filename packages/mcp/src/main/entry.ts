import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import getEntry from "../helpers/getEntry";
import { getArgs } from "../helpers/getArgs";
import { setConfig } from "../config/params";

import registerGetStatusTool from "../tools/get_status.tool";
import registerOpenPositionTool from "../tools/open_position.tool";
import registerClosePositionTool from "../tools/close_position.tool";

const applyArgs = () => {
    const { values } = getArgs();
    if (typeof values.host === "string" && values.host) {
        setConfig({ CC_MCP_HOST: values.host });
    }
    if (typeof values.port === "string" && values.port) {
        const port = parseInt(values.port, 10);
        if (!Number.isNaN(port)) {
            setConfig({ CC_MCP_PORT: port });
        }
    }
};

export const main = async () => {
    if (!getEntry(import.meta.url)) {
      return;
    }

    applyArgs();

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
