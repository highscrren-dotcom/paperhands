import { singleshot } from "functools-kit";

import { getArgs } from "../helpers/getArgs";
import { getEntry } from "../helpers/getEntry";

declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_MCP_HOST: "",
  CC_MCP_PORT: 0,
  CC_MCP_NAME: "",
};

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;

// CLI-аргументы (--host, --port) применяются только когда процесс запущен
// как самостоятельный MCP-сервер. Сборка — единый бандл, поэтому
// import.meta.url здесь совпадает с точкой входа и getEntry даёт тот же
// результат, что и в main/entry.ts. При использовании пакета как библиотеки
// argv чужого процесса на конфиг влиять не должен.
const isEntry = singleshot(() => getEntry(import.meta.url));

export const getConfig = () => {
  const config = {
    CC_MCP_HOST: process.env.CC_MCP_HOST || "127.0.0.1",
    CC_MCP_PORT: parseInt(process.env.CC_MCP_PORT) || 60051,
    CC_MCP_NAME: process.env.CC_MCP_NAME || "",
  };
  if (GLOBAL_CONFIG.CC_MCP_HOST) {
    config.CC_MCP_HOST = GLOBAL_CONFIG.CC_MCP_HOST;
  }
  if (GLOBAL_CONFIG.CC_MCP_PORT) {
    config.CC_MCP_PORT = GLOBAL_CONFIG.CC_MCP_PORT;
  }
  if (GLOBAL_CONFIG.CC_MCP_NAME) {
    config.CC_MCP_NAME = GLOBAL_CONFIG.CC_MCP_NAME;
  }
  if (isEntry()) {
    const { values } = getArgs();
    if (typeof values.host === "string" && values.host) {
      config.CC_MCP_HOST = values.host;
    }
    if (typeof values.port === "string" && values.port) {
      const port = parseInt(values.port);
      if (!Number.isNaN(port)) {
        config.CC_MCP_PORT = port;
      }
    }
  }
  return config;
};

export const setConfig = (config: Partial<Config>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
