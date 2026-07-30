/**
 * Global configuration parameters for the Ollama package.
 *
 * Provides runtime configuration via environment variables with sensible defaults.
 * Environment variables are read lazily on each {@link getConfig} call, so values
 * set programmatically via {@link setConfig} always take precedence over env.
 *
 * Available configurations:
 * - CC_ENABLE_DEBUG: Enable detailed debug logging
 * - CC_ENABLE_THINKING: Enable AI extended reasoning mode
 *
 * @example
 * ```typescript
 * import { getConfig } from "./config/params";
 *
 * if (getConfig().CC_ENABLE_DEBUG) {
 *   console.log("Debug mode enabled");
 * }
 * ```
 */

declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_ENABLE_DEBUG: false,
  CC_ENABLE_THINKING: false,
};

/**
 * Frozen copy of default configuration values.
 * Use this to restore configuration to defaults.
 */
export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

/**
 * Type for global configuration object.
 * Ensures type safety when accessing configuration values.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;

export const getConfig = () => {
  const config = {
    CC_ENABLE_DEBUG:
      "CC_ENABLE_DEBUG" in process.env
        ? !!parseInt(process.env.CC_ENABLE_DEBUG)
        : false,
    CC_ENABLE_THINKING:
      "CC_ENABLE_THINKING" in process.env
        ? !!parseInt(process.env.CC_ENABLE_THINKING)
        : false,
  };
  if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
    config.CC_ENABLE_DEBUG = true;
  }
  if (GLOBAL_CONFIG.CC_ENABLE_THINKING) {
    config.CC_ENABLE_THINKING = true;
  }
  return config;
};

export const setConfig = (config: Partial<GlobalConfig>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
