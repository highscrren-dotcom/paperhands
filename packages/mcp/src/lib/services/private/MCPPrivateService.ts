import { IMCPPositionCloseCommand, IMCPPositionOpenCommand, MCPMessageId, MCP } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class MCPPrivateService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getStatus = async (mcpName: string) => {
        this.loggerService.log("mcpPrivateService getStatus", {
            mcpName,
        });
        const messages = await MCP.getStatus(mcpName);
        const seenIds = new Set<MCPMessageId>();
        return messages.filter(({ id }) => {
            if (seenIds.has(id)) {
                return false;
            }
            seenIds.add(id);
            return true;
        });
    };

    public commitPositionOpen = async (dto: IMCPPositionOpenCommand) => {
        this.loggerService.log("mcpPrivateService commitPositionOpen", {
            dto,
        });
        return await MCP.commitPositionOpen(dto);
    };

    public commitPositionClose = async (dto: IMCPPositionCloseCommand) => {
        this.loggerService.log("mcpPrivateService commitPositionClose", {
            dto,
        });
        return await MCP.commitPositionClose(dto);
    };
}

export default MCPPrivateService;
