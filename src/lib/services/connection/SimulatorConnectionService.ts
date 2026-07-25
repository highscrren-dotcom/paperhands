import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { SimulatorName, ISimulator, ISimulatorIdea, ISimulatorGridAxes, SimulatorRankingCriterion } from "../../../interfaces/Simulator.interface";
import { memoize } from "functools-kit";
import SimulatorSchemaService from "../schema/SimulatorSchemaService";
import { ClientSimulator } from "../../../client/ClientSimulator";

/**
 * Report order applied when the schema omits reportOrder: the
 * result.reports.reports list is sorted by Sharpe descending — the
 * canonical order.
 */
const DEFAULT_REPORT_ORDER: SimulatorRankingCriterion = "sharpe";

/**
 * Grid axes applied per-axis when the schema omits them (schema
 * gridAxes are merged over these defaults, so a schema may override
 * only the axes it cares about). Values are trading parameters, not
 * sentinels, and every rule dimension is actually SWEPT by default —
 * no axis is a degenerate single value that silently disables its
 * mechanism.
 *
 * Chosen from the empirical evidence of the reference runs:
 * - stops below ~2% sit inside the median whale shakeout (p25 of
 *   MAE-before-peak ≈ -2.7%) and kill future winners at entry;
 * - 0.5% trailing is 1m-noise level and never won a ranking;
 * - 72h/120h holds won nearly every ranking on real data, 24h was
 *   systematically too short for peaks that ripen for days;
 * - authors are graded strictly in ISOLATION and WITHOUT a ban
 *   threshold: the engine reports the raw per-author track
 *   (ideas/hits/hitRate) and userspace decides who to trust — the
 *   minAuthorTrack/minAuthorHitRate step was removed because it
 *   collapsed continuous trust into a 0/1 flag. Interaction metrics
 *   (consensus counting, vote weighting, Wilson bounds) were removed
 *   by design too — swarm ranking over long histories is userspace;
 * - profit lock: covers the bleed zone below the trailing arm level
 *   (trailing arms only from peak >= entry/(1-r), so a +1.5..2.5%
 *   run that dumps gives everything back without a lock); above the
 *   lock the trailing floor is higher and fills first. lock = 0 is
 *   valid (fixation is then the trailing arm alone) but the default
 *   list sweeps real locks;
 * - grading is ONE binary outcome — profit-before-stop: an author's
 *   idea is a HIT when the lock (if lock > 0) or the trailing arm
 *   level fires BEFORE the hard stop inside THE POINT'S OWN hold
 *   window, a MISS when the hard stop fires first or nothing fixes by
 *   the window end (timeout is a bad outcome). One report bucket, one
 *   set of winners, one tracks[] — nothing is split by metric.
 */
const DEFAULT_GRID_AXES: ISimulatorGridAxes = {
  hardStopPercent: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7],
  trailingTakePercent: [0.5, 1, 1.5, 2, 2.5, 3],
  holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60, 4 * 24 * 60, 5 * 24 * 60],
  profitLockPercent: [1.5, 2.5, 3.5, 5],
};

/**
 * Structural mirror of ISimulator: the connection service exposes the
 * same public surface as the client it manages, with DI-level DTOs.
 */
type TSimulator = {
    [key in keyof ISimulator]: any;
}

/**
 * Connection layer of the Simulator entity.
 *
 * Owns the ClientSimulator lifecycle: resolves the registered schema
 * by simulatorName, applies grid axes defaults, injects the logger
 * and memoizes one client instance per simulator name. Public
 * methods accept flat DTOs and delegate to the memoized client.
 */
export class SimulatorConnectionService implements TSimulator {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly simulatorSchemaService = inject<SimulatorSchemaService>(
    TYPES.simulatorSchemaService
  );

  /**
   * Returns the ClientSimulator for a simulator name, creating it on
   * first access. Memoized by simulator name — one client instance
   * per registered simulator; gridAxes fall back to
   * DEFAULT_GRID_AXES when the schema omits them.
   *
   * @param simulatorName - Registered simulator name
   * @returns Memoized ClientSimulator instance
   */
  public getSimulator = memoize(
    ([simulatorName]) => `${simulatorName}`,
    (simulatorName: SimulatorName) => {
      const { exchangeName, gridAxes, reportOrder, callbacks } =
        this.simulatorSchemaService.get(simulatorName);
      return new ClientSimulator({
        simulatorName,
        logger: this.loggerService,
        exchangeName,
        gridAxes: { ...DEFAULT_GRID_AXES, ...gridAxes },
        reportOrder: reportOrder ?? DEFAULT_REPORT_ORDER,
        callbacks,
      });
    }
  );

  /**
   * Runs the full simulation for a symbol through the memoized
   * client: profiles -> author filter -> grid evaluation -> rankings.
   *
   * @param dto.symbol - Trading pair symbol to simulate
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Ideas feed (other symbols are filtered out by the client)
   * @returns Final simulation result (reports, rankings; the author artifact lives per-winner in best[])
   */
  public run = async (dto: {
    symbol: string;
    simulatorName: SimulatorName;
    ideas: ISimulatorIdea[];
  }) => {
    this.loggerService.log("simulatorConnectionService run", {
        symbol: dto.symbol,
        simulatorName: dto.simulatorName,
        ideasLen: dto.ideas.length,
    });
    const instance = await this.getSimulator(dto.simulatorName);
    return await instance.run(dto.symbol, dto.ideas);
  }

  /**
   * Drops memoized client instances: a specific one by name or all
   * of them when called without arguments. The next getSimulator
   * call re-reads the schema and builds a fresh client.
   *
   * @param simulatorName - Simulator to drop; omit to drop all
   */
  public clear = (simulatorName?: SimulatorName) => {
    this.loggerService.log("simulatorConnectionService clear", {
      simulatorName,
    });
    if (simulatorName === undefined) {
      this.getSimulator.clear();
      return;
    }
    this.getSimulator.clear(`${simulatorName}`);
  };
}

export default SimulatorConnectionService;
