import { ILogger } from "../interfaces/Logger.interface";
import ioc from "../lib";

/**
 * Attaches a custom logger to the internal `LoggerService`.
 *
 * By default the package logs to `console`. Pass your own {@link ILogger} implementation
 * to redirect output to an external logging system (Winston, Pino, Datadog, etc.).
 *
 * @param logger - Object with `log`, `debug`, `info`, and `warn` methods.
 *   Each method receives a string topic followed by arbitrary arguments.
 *
 * @example
 * import winston from "winston";
 *
 * setLogger({
 *   log:   (topic, ...args) => winston.verbose(topic, ...args),
 *   debug: (topic, ...args) => winston.debug(topic, ...args),
 *   info:  (topic, ...args) => winston.info(topic, ...args),
 *   warn:  (topic, ...args) => winston.warn(topic, ...args),
 * });
 */
export function setLogger(logger: ILogger) {
    ioc.loggerService.setLogger(logger);
}
