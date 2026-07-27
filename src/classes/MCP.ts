import { memoize } from "functools-kit";
import backtest from "../lib";
import { Exchange } from "./Exchange";
import { Live } from "./Live";
import {
  IMCPContext,
  IMCPMessage,
  IMCPPositionCloseCommand,
  IMCPPositionOpenCommand,
} from "../interfaces/MCP.interface";
import alignToInterval from "../utils/alignToInterval";
import { getConfig } from "../function/setup";
import { Position } from "./Position";
import { GLOBAL_CONFIG } from "../config/params";

const METHOD_NAME_GET_STATUS = "MCPUtils.getStatus";
const METHOD_NAME_COMMIT_POSITION_OPEN = "MCPUtils.commitPositionOpen";
const METHOD_NAME_COMMIT_POSITION_CLOSE = "MCPUtils.commitPositionClose";

/** Grid step (percent) the hard stop-loss distance snaps to. */
const HARD_STOP_STEP_PERCENT = 2.5;

/**
 * Computes the hard stop-loss distance percent for an opened position.
 *
 * Snaps the configured max stop-loss distance to a {@link HARD_STOP_STEP_PERCENT} grid
 * (rounded to the nearest step), then steps one notch down so the result stays strictly
 * below CC_MAX_STOPLOSS_DISTANCE_PERCENT — which the signal validator rejects at the
 * boundary (e.g. 20% config yields 20.008% after price rounding).
 *
 * @param maxDistance - CC_MAX_STOPLOSS_DISTANCE_PERCENT
 * @returns Hard stop-loss distance in percent (e.g. 11 -> 7.5, 10 -> 7.5, 20 -> 17.5)
 */
const COMPUTE_HARD_STOP_FN = (maxDistance: number): number =>
  Math.round(maxDistance / HARD_STOP_STEP_PERCENT) * HARD_STOP_STEP_PERCENT -
  HARD_STOP_STEP_PERCENT;

const DEFAULT_GET_MESSAGES = (
  context: IMCPContext,
  when: Date,
): IMCPMessage[] => {
  return [];
};

const VALIDATE_SCHEMA_FN = memoize(
  ([mcpName]) => `${mcpName}`,
  (mcpName: string, source: string) => {
    {
      backtest.mcpValidationService.validate(mcpName, source);
    }

    const { strategyName } = backtest.mcpSchemaService.get(mcpName);

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, source);
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(riskName, source),
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(actionName, source),
        );
    }
  },
);

const GET_TARGET_CONTEXT_FN = async (mcpName: string) => {
  const { strategyName } = backtest.mcpSchemaService.get(mcpName);
  const liveList = await Live.list();
  const liveTarget = liveList.filter(
    (live) => live.strategyName === strategyName,
  );
  const targetList = await Promise.all(
    liveTarget.map(async ({ symbol, exchangeName }) => {
      const currentPrice = await Exchange.getAveragePrice(symbol, {
        exchangeName,
      });
      const pendingSignal = await Live.getPendingSignal(symbol, currentPrice, {
        strategyName,
        exchangeName,
      });
      const { createdSignal, closedSignal } = await Live.getStrategyStatus(
        symbol,
        {
          strategyName,
          exchangeName,
        },
      );
      return {
        symbol,
        pendingSignal,
        createdSignal,
        closedSignal,
        currentPrice,
      };
    }),
  );
  return targetList.reduce(
    (
      acm,
      { symbol, currentPrice, pendingSignal, closedSignal, createdSignal },
    ) => ({
      ...acm,
      [symbol]: { currentPrice, pendingSignal, closedSignal, createdSignal },
    }),
    <IMCPContext>{},
  );
};

const GET_TARGET_MESSAGES_FN = async (
  mcpName: string,
  context: IMCPContext,
) => {
  const { getMessages = DEFAULT_GET_MESSAGES } =
    backtest.mcpSchemaService.get(mcpName);
  const when = alignToInterval(new Date(), "1m");
  return await getMessages(context, when);
};

const COMMIT_POSITION_OPEN_FN = async (dto: IMCPPositionOpenCommand) => {
  const { strategyName, positionCost = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST } =
    backtest.mcpSchemaService.get(dto.mcpName);
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    const config = getConfig();
    if (pending) {
      throw new Error(
        `MCP Error: already have pending signal for ${dto.symbol}`,
      );
    }
    const percentStopLoss = COMPUTE_HARD_STOP_FN(
      config.CC_MAX_STOPLOSS_DISTANCE_PERCENT,
    );
    return await Live.commitCreateSignal(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      {
        ...Position.moonbag({
          position: dto.position,
          currentPrice,
          percentStopLoss,
        }),
        cost: positionCost,
        note: dto.note,
      },
    );
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

const COMMIT_POSITION_CLOSE_FN = async (dto: IMCPPositionCloseCommand) => {
  const { strategyName } = backtest.mcpSchemaService.get(dto.mcpName);
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    if (!pending) {
      throw new Error(`MCP Error: missed pending signal for ${dto.symbol}`);
    }
    return await Live.commitClosePending(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      {
        id: pending.id,
        note: dto.note,
      },
    );
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

export class MCPUtils {
  public getStatus = async (mcpName: string): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_STATUS, {
      mcpName,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_STATUS);
    }

    const context = await GET_TARGET_CONTEXT_FN(mcpName);
    const messages = await GET_TARGET_MESSAGES_FN(mcpName, context);

    return messages;
  };

  public commitPositionOpen = async (dto: IMCPPositionOpenCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_OPEN, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_OPEN);
    }

    return await COMMIT_POSITION_OPEN_FN(dto);
  };

  public commitPositionClose = async (dto: IMCPPositionCloseCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_CLOSE, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_CLOSE);
    }

    return await COMMIT_POSITION_CLOSE_FN(dto);
  };
}

export const MCP = new MCPUtils();
