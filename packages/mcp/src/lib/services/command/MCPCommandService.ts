import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getConfig } from "../../../config/params";
import { fetchApi, randomString } from "functools-kit";

const CLIENT_ID = randomString();
const SERVICE_NAME = "backtest-kit-mcp";
const USER_ID = "unknown";

export class MCPCommandService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getStatus = async () => {
        this.loggerService.log("mcpCommandService getStatus");
        const GLOBAL_CONFIG = getConfig();
        const requestId = randomString();
        const url = new URL(GLOBAL_CONFIG.CC_MCP_HOST, "file:");
        {
            url.protocol = "http:";
            url.port = String(GLOBAL_CONFIG.CC_MCP_PORT);
        }
        const { data, error } = await fetchApi("/api/v1/commit_position_close", {
            method: "POST",
            body: JSON.stringify({
                clientId: CLIENT_ID,
                serviceName: SERVICE_NAME,
                userId: USER_ID,
                requestId,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };

    public commitPositionOpen = async (dto: { symbol: string; position: "long" | "short"; note: string }) => {
        this.loggerService.log("mcpCommandService commitPositionOpen", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const requestId = randomString();
        const url = new URL(GLOBAL_CONFIG.CC_MCP_HOST, "file:");
        {
            url.protocol = "http:";
            url.port = String(GLOBAL_CONFIG.CC_MCP_PORT);
        }
        const { data, error } = await fetchApi("/api/v1/commit_position_open", {
            method: "POST",
            body: JSON.stringify({
                clientId: CLIENT_ID,
                serviceName: SERVICE_NAME,
                userId: USER_ID,
                data: dto,
                requestId,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };

    public commitPositionClose = async (dto: { symbol: string; note: string; }) => {
        this.loggerService.log("mcpCommandService commitPositionClose", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const requestId = randomString();
        const url = new URL(GLOBAL_CONFIG.CC_MCP_HOST, "file:");
        {
            url.protocol = "http:";
            url.port = String(GLOBAL_CONFIG.CC_MCP_PORT);
        }
        const { data, error } = await fetchApi("/api/v1/commit_position_close", {
            method: "POST",
            body: JSON.stringify({
                clientId: CLIENT_ID,
                serviceName: SERVICE_NAME,
                userId: USER_ID,
                data: dto,
                requestId,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };
}

export default MCPCommandService;
