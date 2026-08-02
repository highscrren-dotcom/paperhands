import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage, singleshot } from "functools-kit";

import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { basename, join, resolve } from "path";

import { fromFile } from "file-type";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

const getFilesDir = singleshot(() => {
  return resolve(process.cwd(), "dump");
})

const DEFAULT_MIME = "application/octet-stream";

interface DownloadParams {
  fileName: string;
}

const normalizePath = (fileName: string) => {
  const segments = fileName
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return join(getFilesDir(), ...segments);
};

const statFile = async (filePath: string) => {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
};

router.get("/api/v1/file/download/:fileName(*)", async (req, res) => {
  try {
    const { fileName } = <DownloadParams>req.params;

    const filePath = normalizePath(fileName);

    const fileStat = await statFile(filePath);

    if (!fileStat || !fileStat.isFile()) {
      ioc.loggerService.log("/api/v1/file/download not found", {
        request: { fileName, filePath },
      });
      return await micro.send(res, 404, {
        status: "error",
        error: `file not found fileName=${fileName}`,
      });
    }

    const fileType = await fromFile(filePath);
    const mime = fileType ? fileType.mime : DEFAULT_MIME;

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", fileStat.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(basename(filePath))}`
    );

    ioc.loggerService.log("/api/v1/file/download ok", {
      request: { fileName, filePath },
      result: { mime, size: fileStat.size },
    });

    return await micro.send(res, 200, createReadStream(filePath));
  } catch (error) {
    ioc.loggerService.log("/api/v1/file/download error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

export default router;
