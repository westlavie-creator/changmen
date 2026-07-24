/**
 * 请求上下文：reqId + pathname。不改写响应头，避免改变现有客户端行为。
 */

import { randomBytes } from "node:crypto";

/**
 * 同步挂载 req.reqId / req.pathname（early-return 与 pipeline 共用）。
 * @param {import("node:http").IncomingMessage & { reqId?: string, pathname?: string }} req
 */
export function seedRequestContext(req) {
  if (!req.reqId) {
    const incoming = typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"].trim().slice(0, 64)
      : "";
    req.reqId = incoming || randomBytes(4).toString("hex");
  }
  if (req.pathname == null) {
    const raw = String(req.url || "/");
    const q = raw.indexOf("?");
    req.pathname = q >= 0 ? raw.slice(0, q) : raw;
  }
}

/**
 * @type {import("./compose.js").HttpMiddleware}
 */
export async function attachContext(req, res, next) {
  seedRequestContext(req);
  await next();
}
