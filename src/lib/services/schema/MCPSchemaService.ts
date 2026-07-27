import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { IMCPSchema, MCPName } from "../../../interfaces/MCP.interface";

export class MCPSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<MCPName, IMCPSchema>>(
    "mcpRegistry"
  );

  public register(key: MCPName, value: IMCPSchema) {
    this.loggerService.log(`mcpSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  private validateShallow = (mcpSchema: IMCPSchema) => {
    this.loggerService.log(`mcpSchemaService validateShallow`, {
      mcpSchema,
    });

    if (typeof mcpSchema.mcpName !== "string") {
      throw new Error(
        `mcp schema validation failed: missing mcpName`
      );
    }

    if (typeof mcpSchema.strategyName !== "string") {
      throw new Error(
        `mcp schema validation failed: missing strategyName`
      );
    }
  };

  public override(key: MCPName, value: Partial<IMCPSchema>) {
    this.loggerService.log(`mcpSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  public get(key: MCPName): IMCPSchema {
    this.loggerService.log(`mcpSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default MCPSchemaService;
