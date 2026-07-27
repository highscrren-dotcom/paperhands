declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_MCP_HOST: "",
  CC_MCP_PORT: 0,
  CC_MCP_NAME: "",
};

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;

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
  return config;
};

export const setConfig = (config: Partial<Config>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
