import LoggerService from "../services/base/LoggerService";

import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
}
