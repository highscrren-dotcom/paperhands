import { IMCPPositionCloseCommand, IMCPPositionOpenCommand, MCP } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class MCPPrivateService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getStatus = async (mcpName: string) => {
        this.loggerService.log("mcpPrivateService getStatus", {
            mcpName,
        });
        return await MCP.getStatus(mcpName);
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
