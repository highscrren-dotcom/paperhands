import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { ISweepSchema, SweepName } from "../../../interfaces/Sweep.interface";

/**
 * Registry of sweep schemas.
 *
 * Stores ISweepSchema records by sweep name with shallow
 * validation on registration. The connection service reads schemas
 * from here when building ClientSweep instances.
 */
export class SweepSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<SweepName, ISweepSchema>>(
    "sweepRegistry"
  );

  /**
   * Registers a sweep schema under its name after shallow
   * validation. Registering the same key twice replaces the record.
   *
   * @param key - Sweep name to register under
   * @param value - Schema to store
   */
  public register(key: SweepName, value: ISweepSchema) {
    this.loggerService.log(`sweepSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Shallow structural validation of a schema: required string
   * fields only, no deep checks — grid axes and callbacks are
   * validated by their consumers.
   *
   * @param sweepSchema - Schema to check
   * @throws Error when sweepName or exchangeName is missing
   */
  private validateShallow = (sweepSchema: ISweepSchema) => {
    this.loggerService.log(`sweepSchemaService validateShallow`, {
      sweepSchema,
    });

    if (typeof sweepSchema.sweepName !== "string") {
      throw new Error(
        `sweep schema validation failed: missing sweepName`
      );
    }

    if (typeof sweepSchema.exchangeName !== "string") {
      throw new Error(
        `sweep schema validation failed: missing exchangeName`
      );
    }
  };

  /**
   * Partially overrides a registered schema and returns the merged
   * record. Used by overrideSweepSchema-style public APIs.
   *
   * @param key - Sweep name to override
   * @param value - Partial schema patch
   * @returns The merged schema after override
   */
  public override(key: SweepName, value: Partial<ISweepSchema>) {
    this.loggerService.log(`sweepSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Returns the registered schema by sweep name.
   *
   * @param key - Sweep name to look up
   * @returns The stored schema
   * @throws Error when no schema is registered under the name
   */
  public get(key: SweepName): ISweepSchema {
    this.loggerService.log(`sweepSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default SweepSchemaService;
