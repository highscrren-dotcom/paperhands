import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { SweepName, ISweepSchema } from "../../../interfaces/Sweep.interface";
import { memoize } from "functools-kit";
import ExchangeValidationService from "./ExchangeValidationService";

/**
 * Existence and dependency validation of sweeps.
 *
 * Tracks every registered sweep and verifies at use time that a
 * referenced sweep exists and its exchange dependency is valid.
 * Registration here is uniqueness-guarded, unlike the schema
 * registry where re-registering replaces the record.
 */
export class SweepValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly exchangeValidationService = inject<ExchangeValidationService>(TYPES.exchangeValidationService);

  private _sweepMap = new Map<SweepName, ISweepSchema>();

  /**
   * Tracks a sweep for validation. Called on schema
   * registration; duplicate names are rejected.
   *
   * @param sweepName - Sweep name to track
   * @param sweepSchema - Schema stored for dependency checks
   * @throws Error when the name is already tracked
   */
  public addSweep = (sweepName: SweepName, sweepSchema: ISweepSchema): void => {
    this.loggerService.log("sweepValidationService addSweep", {
      sweepName,
      sweepSchema,
    });
    if (this._sweepMap.has(sweepName)) {
      throw new Error(`sweep ${sweepName} already exist`);
    }
    this._sweepMap.set(sweepName, sweepSchema);
  };

  /**
   * Validates that a sweep is registered and its exchange
   * dependency passes validation. Memoized by sweep name — the
   * check runs once per name, later calls are no-ops.
   *
   * @param sweepName - Sweep name to validate
   * @param source - Caller tag included in error messages
   * @throws Error when the sweep or its exchange is unknown
   */
  public validate = memoize(
    ([sweepName]) => sweepName,
    (sweepName: SweepName, source: string): void => {
      this.loggerService.log("sweepValidationService validate", {
        sweepName,
        source,
      });
      const sweep = this._sweepMap.get(sweepName);
      if (!sweep) {
        throw new Error(
          `sweep ${sweepName} not found source=${source}`
        );
      }

      this.exchangeValidationService.validate(sweep.exchangeName, source);

      return true as never;
    }
  ) as (sweepName: SweepName, source: string) => void;

  /**
   * Lists every tracked sweep schema.
   *
   * @returns All schemas registered for validation
   */
  public list = async (): Promise<ISweepSchema[]> => {
    this.loggerService.log("sweepValidationService list");
    return Array.from(this._sweepMap.values());
  };
}

export default SweepValidationService;
