import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import SweepConnectionService from "../connection/SweepConnectionService";
import { ISweep, ISweepIdea, SweepName } from "../../../interfaces/Sweep.interface";
import SweepValidationService from "../validation/SweepValidationService";

const METHOD_NAME_RUN = "sweepGlobalService run";

/**
 * Structural mirror of ISweep: the global service exposes the
 * same public surface as the client it fronts, with DI-level DTOs.
 */
type TSweep = {
  [key in keyof ISweep]: any;
};

/**
 * Global entry point of the Sweep entity.
 *
 * The outermost service layer the public API talks to: validates the
 * referenced sweep (existence + exchange dependency) and
 * delegates to the connection layer, which owns the memoized
 * ClientSweep instances.
 */
export class SweepGlobalService implements TSweep {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly sweepConnectionService = inject<SweepConnectionService>(
    TYPES.sweepConnectionService
  );
  private readonly sweepValidationService = inject<SweepValidationService>(TYPES.sweepValidationService);

  /**
   * Runs the full simulation for a symbol after validating the
   * sweep reference: profiles -> author filter -> grid
   * evaluation -> rankings.
   *
   * @param dto.symbol - Trading pair symbol to simulate
   * @param dto.sweepName - Registered sweep name
   * @param dto.ideas - Ideas feed (other symbols are filtered out by the client)
   * @returns Final simulation result (reports, rankings; the author artifact lives per-winner in best[])
   * @throws Error when the sweep or its exchange is not registered
   */
  public run = async (dto: {
    symbol: string;
    sweepName: SweepName;
    ideas: ISweepIdea[];
  }) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      sweepName: dto.sweepName,
      ideasLen: dto.ideas.length,
      symbol: dto.symbol,
    });
    this.sweepValidationService.validate(dto.sweepName, METHOD_NAME_RUN);
    return await this.sweepConnectionService.run(dto);
  };
}

export default SweepGlobalService;
