import micro from "micro";
import Router from "router";
import finalhandler from "finalhandler";

import health from "../routes/health";
import mcp from "../routes/mcp";

const router = Router({
  params: true,
});

router.all("/api/v1/health/*", (req, res) => {
  return health(req, res, finalhandler(req, res));
});

router.all("/api/v1/mcp/*", (req, res) => {
  return mcp(req, res, finalhandler(req, res));
});

router.get("/*", async (_, res) =>{
   await micro.send(res, 200, '@backtest-kit/mcp')
});

export default micro.serve(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");

  return router(req, res, finalhandler(req, res));
});
