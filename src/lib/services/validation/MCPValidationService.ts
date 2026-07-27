import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { MCPName, IMCPSchema } from "../../../interfaces/MCP.interface";
import { memoize } from "functools-kit";
import StrategyValidationService from "./StrategyValidationService";

export class MCPValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly strategyValidationService = inject<StrategyValidationService>(TYPES.strategyValidationService);

  private _mcpMap = new Map<MCPName, IMCPSchema>();

  public addMCP = (mcpName: MCPName, mcpSchema: IMCPSchema): void => {
    this.loggerService.log("mcpValidationService addMCP", {
      mcpName,
      mcpSchema,
    });
    if (this._mcpMap.has(mcpName)) {
      throw new Error(`mcp ${mcpName} already exist`);
    }
    this._mcpMap.set(mcpName, mcpSchema);
  };

  public validate = memoize(
    ([mcpName]) => mcpName,
    (mcpName: MCPName, source: string): void => {
      this.loggerService.log("mcpValidationService validate", {
        mcpName,
        source,
      });
      const mcp = this._mcpMap.get(mcpName);
      if (!mcp) {
        throw new Error(
          `mcp ${mcpName} not found source=${source}`
        );
      }

      this.strategyValidationService.validate(mcp.strategyName, source);

      return true as never;
    }
  ) as (mcpName: MCPName, source: string) => void;

  public list = async (): Promise<IMCPSchema[]> => {
    this.loggerService.log("mcpValidationService list");
    return Array.from(this._mcpMap.values());
  };
}

export default MCPValidationService;
