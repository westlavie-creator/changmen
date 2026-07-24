/**
 * 未捕获异常 → JSON；若 proxy/上游已写头则不再 writeHead。
 */

import { jsonResponse } from "./body.js";

const FALLBACK_MSG = "\u670D\u52A1\u5668\u9519\u8BEF";

/**
 * @param {import("node:http").IncomingMessage & { reqId?: string }} req
 * @param {import("node:http").ServerResponse} res
 * @param {unknown} err
 */
export function sendUnhandledError(req, res, err) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error("[server]", req.reqId || "-", req.url, e);
  if (!res.headersSent) {
    jsonResponse(res, 500, {
      success: 0,
      msg: e.message || FALLBACK_MSG,
      info: null,
    });
  }
}

/**
 * @type {import("./compose.js").HttpMiddleware}
 */
export async function catchErrors(req, res, next) {
  try {
    await next();
  }
  catch (err) {
    sendUnhandledError(req, res, err);
  }
}
