import LoggerService from "../services/base/LoggerService";
import MCPPrivateService from "../services/private/MCPPrivateService";
import MCPPublicService from "../services/public/MCPPublicService";

import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.mcpPrivateService, () => new MCPPrivateService());
}

{
    provide(TYPES.mcpPublicService, () => new MCPPublicService());
}
