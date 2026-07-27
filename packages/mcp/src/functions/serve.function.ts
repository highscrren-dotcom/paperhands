import http from "http";
import { singleshot } from "functools-kit";

import { getConfig } from "../config/params";

import router from "../config/router";
import ioc from "../lib";

type CallbackFn = (error?: Error) => void;

const METHOD_NAME_SERVE = "serve.serve";
const METHOD_NAME_GET_ROUTER = "serve.getRouter";

const MAX_CONNECTIONS = 1_000;
const SOCKET_TIMEOUT = 60 * 10 * 1000;

const serveInternal = singleshot(
  (callback?: CallbackFn) => {
    const server = new http.Server(router);

    const GLOBAL_CONFIG = getConfig();

    server.listen(GLOBAL_CONFIG.CC_MCP_PORT, GLOBAL_CONFIG.CC_MCP_HOST).addListener("listening", () => {
      console.log(`Listening on http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`);
      callback && callback();
    });

    server.addListener("error", (err) => {
      console.error("Server error:", err);
      // Сервер не поднялся — сбрасываем singleshot, иначе повторный serve()
      // вернёт мёртвый инстанс и слушать порт больше никто не попробует
      if (!server.listening) {
        serveInternal.clear();
      }
      callback && callback(err);
    });

    server.maxConnections = MAX_CONNECTIONS;
    server.setTimeout(SOCKET_TIMEOUT);

    return () => {
      server.close();
      serveInternal.clear();
    };
  },
);

export function serve(host?: string, port?: number, cwd = process.cwd(), callback?: CallbackFn) {
  ioc.loggerService.log(METHOD_NAME_SERVE, {
    host,
    port,
  });
  return serveInternal(callback);
}

export function getRouter() {
  ioc.loggerService.log(METHOD_NAME_GET_ROUTER);
  return router;
}
