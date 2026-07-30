declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_WWWROOT_PATH: "",
  CC_WWWROOT_HOST: "",
  CC_WWWROOT_PORT: 0,
  CC_TELEGRAM_CHANNEL: "",
  CC_QUICKCHART_HOST: "",
  CC_ENABLE_MOCK: false,
};

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;

export const getConfig = () => {
  const config = {
    CC_WWWROOT_PATH: process.env.CC_WWWROOT_PATH || "",
    CC_WWWROOT_HOST: process.env.CC_WWWROOT_HOST || "0.0.0.0",
    CC_WWWROOT_PORT: parseInt(process.env.CC_WWWROOT_PORT) || 60050,
    CC_TELEGRAM_CHANNEL: process.env.CC_TELEGRAM_CHANNEL || "",
    CC_QUICKCHART_HOST: process.env.CC_QUICKCHART_HOST || "",
    CC_ENABLE_MOCK: !!parseInt(process.env.CC_ENABLE_MOCK) || false,
  };
  if (GLOBAL_CONFIG.CC_WWWROOT_PATH) {
    config.CC_WWWROOT_PATH = GLOBAL_CONFIG.CC_WWWROOT_PATH;
  }
  if (GLOBAL_CONFIG.CC_WWWROOT_HOST) {
    config.CC_WWWROOT_HOST = GLOBAL_CONFIG.CC_WWWROOT_HOST;
  }
  if (GLOBAL_CONFIG.CC_WWWROOT_PORT) {
    config.CC_WWWROOT_PORT = GLOBAL_CONFIG.CC_WWWROOT_PORT;
  }
  if (GLOBAL_CONFIG.CC_TELEGRAM_CHANNEL) {
    config.CC_TELEGRAM_CHANNEL = GLOBAL_CONFIG.CC_TELEGRAM_CHANNEL;
  }
  if (GLOBAL_CONFIG.CC_QUICKCHART_HOST) {
    config.CC_QUICKCHART_HOST = GLOBAL_CONFIG.CC_QUICKCHART_HOST;
  }
  if (GLOBAL_CONFIG.CC_ENABLE_MOCK) {
    config.CC_ENABLE_MOCK = true;
  }
  return config;
};

export const setConfig = (config: Partial<Config>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
