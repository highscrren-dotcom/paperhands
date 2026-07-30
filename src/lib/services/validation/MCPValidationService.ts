import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { MCPName, IMCPSchema } from "../../../interfaces/MCP.interface";
import { memoize } from "functools-kit";
import StrategyValidationService from "./StrategyValidationService";

/**
 * Existence and dependency validation of MCP instances.
 *
 * Tracks every registered MCP and verifies at use time that a
 * referenced MCP exists and its strategy dependency is valid.
 * Registration here is uniqueness-guarded, unlike the schema
 * registry where re-registering replaces the record.
 */
export class MCPValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly strategyValidationService = inject<StrategyValidationService>(TYPES.strategyValidationService);

  private _mcpMap = new Map<MCPName, IMCPSchema>();

  /**
   * Tracks an MCP for validation. Called on schema
   * registration; duplicate names are rejected.
   *
   * @param mcpName - MCP name to track
   * @param mcpSchema - Schema stored for dependency checks
   * @throws Error when the name is already tracked
   */
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

  /**
   * Validates that an MCP is registered and its strategy
   * dependency passes validation. Memoized by MCP name — the
   * check runs once per name, later calls are no-ops.
   *
   * @param mcpName - MCP name to validate
   * @param source - Caller tag included in error messages
   * @throws Error when the MCP or its strategy is unknown
   */
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

      if (mcp.strategyName) {
        this.strategyValidationService.validate(mcp.strategyName, source);
      }

      return true as never;
    }
  ) as (mcpName: MCPName, source: string) => void;

  /**
   * Lists every tracked MCP schema.
   *
   * @returns All schemas registered for validation
   */
  public list = async (): Promise<IMCPSchema[]> => {
    this.loggerService.log("mcpValidationService list");
    return Array.from(this._mcpMap.values());
  };
}

export default MCPValidationService;
