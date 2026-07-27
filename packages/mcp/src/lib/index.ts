import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";

import LoggerService from "./services/base/LoggerService";
import MCPPrivateService from "./services/private/MCPPrivateService";
import MCPPublicService from "./services/public/MCPPublicService";
import MCPCommandService from "./services/command/MCPCommandService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const privateServices = {
  mcpPrivateService: inject<MCPPrivateService>(TYPES.mcpPrivateService),
};

const publicServices = {
  mcpPublicService: inject<MCPPublicService>(TYPES.mcpPublicService),
};

const commandServices = {
  mcpCommandService: inject<MCPCommandService>(TYPES.mcpCommandService),
}

export const ioc = {
  ...baseServices,
  ...privateServices,
  ...publicServices,
  ...commandServices,
};

init();

export default ioc;
