import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";

import LoggerService from "./services/base/LoggerService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

export const ioc = {
  ...baseServices,
};

init();

export default ioc;
