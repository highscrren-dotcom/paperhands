import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

// MCPPublicService endpoints
//
// Every handler ALWAYS responds 200: transport success is not operation
// success. The caller (MCPCommandService) inspects the envelope's `error`
// string — non-empty means the operation failed.

interface GetStatusRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface CommitPositionOpenRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  data: {
    symbol: string;
    position: "long" | "short";
    note: string;
  };
}

interface CommitPositionCloseRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  data: {
    symbol: string;
    note: string;
  };
}

interface CommitAverageBuyRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  data: {
    symbol: string;
  };
}

interface CommitSignalNotifyRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  data: {
    symbol: string;
    note: string;
    notificationId?: string;
  };
}

router.post("/api/v1/mcp/get_status", async (req, res) => {
  try {
    const request = <GetStatusRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.mcpPublicService.getStatus();
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/get_status ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/get_status error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/mcp/get_notification_messages", async (req, res) => {
  try {
    const request = <GetStatusRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.mcpPublicService.getNotificationMessages();
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/get_notification_messages ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/get_notification_messages error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/mcp/commit_position_open", async (req, res) => {
  try {
    const request = <CommitPositionOpenRequest>await micro.json(req);
    const { requestId, serviceName, data: dto } = request;
    const data = await ioc.mcpPublicService.commitPositionOpen(dto);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/commit_position_open ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/commit_position_open error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/mcp/commit_position_close", async (req, res) => {
  try {
    const request = <CommitPositionCloseRequest>await micro.json(req);
    const { requestId, serviceName, data: dto } = request;
    const data = await ioc.mcpPublicService.commitPositionClose(dto);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/commit_position_close ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/commit_position_close error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/mcp/commit_average_buy", async (req, res) => {
  try {
    const request = <CommitAverageBuyRequest>await micro.json(req);
    const { requestId, serviceName, data: dto } = request;
    const data = await ioc.mcpPublicService.commitAverageBuy(dto);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/commit_average_buy ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/commit_average_buy error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/mcp/commit_signal_notify", async (req, res) => {
  try {
    const request = <CommitSignalNotifyRequest>await micro.json(req);
    const { requestId, serviceName, data: dto } = request;
    const data = await ioc.mcpPublicService.commitSignalNotify(dto);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/mcp/commit_signal_notify ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mcp/commit_signal_notify error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

export default router;
