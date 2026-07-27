import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";

import LoggerService from "./services/base/LoggerService";
import MCPPrivateService from "./services/private/MCPPrivateService";
import MCPPublicService from "./services/public/MCPPublicService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const privateServices = {
  mcpPrivateService: inject<MCPPrivateService>(TYPES.mcpPrivateService),
};

const publicServices = {
  mcpPublicService: inject<MCPPublicService>(TYPES.mcpPublicService),
};

export const ioc = {
  ...baseServices,
  ...privateServices,
  ...publicServices,
};

init();

export default ioc;
