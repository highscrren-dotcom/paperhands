import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { IMCPSchema, MCPName } from "../../../interfaces/MCP.interface";

/**
 * Registry of MCP (Model Context Protocol) schemas.
 *
 * Stores IMCPSchema records by MCP name with shallow validation on
 * registration. MCPUtils reads schemas from here when resolving the
 * target strategy and rendering agent messages.
 */
export class MCPSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<MCPName, IMCPSchema>>(
    "mcpRegistry"
  );

  /**
   * Registers an MCP (Model Context Protocol) schema under its name after shallow
   * validation. Registering the same key twice replaces the record.
   *
   * @param key - MCP (Model Context Protocol) name to register under
   * @param value - Schema to store
   */
  public register(key: MCPName, value: IMCPSchema) {
    this.loggerService.log(`mcpSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Shallow structural validation of a schema: required string
   * fields only, no deep checks — getMessages and callbacks are
   * validated by their consumers. strategyName is optional (the
   * single registered strategy is resolved at use time) but must
   * be a string when present.
   *
   * @param mcpSchema - Schema to check
   * @throws Error when mcpName is missing or strategyName is not a string
   */
  private validateShallow = (mcpSchema: IMCPSchema) => {
    this.loggerService.log(`mcpSchemaService validateShallow`, {
      mcpSchema,
    });

    if (typeof mcpSchema.mcpName !== "string") {
      throw new Error(
        `mcp schema validation failed: missing mcpName`
      );
    }

    if (mcpSchema.strategyName && typeof mcpSchema.strategyName !== "string") {
      throw new Error(
        `mcp schema validation failed: missing strategyName`
      );
    }
  };

  /**
   * Partially overrides a registered schema and returns the merged
   * record. Used by overrideMCPSchema-style public APIs.
   *
   * @param key - MCP (Model Context Protocol) name to override
   * @param value - Partial schema patch
   * @returns The merged schema after override
   */
  public override(key: MCPName, value: Partial<IMCPSchema>) {
    this.loggerService.log(`mcpSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Returns the registered schema by MCP (Model Context Protocol) name.
   *
   * @param key - MCP (Model Context Protocol) name to look up
   * @returns The stored schema
   * @throws Error when no schema is registered under the name
   */
  public get(key: MCPName): IMCPSchema {
    this.loggerService.log(`mcpSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default MCPSchemaService;
