import { attachForwardEngine, closeForwardEngine } from "./core/forward_engine.js";
import { registerPlatformForward, listPlatformForwards } from "./platforms/registry.js";
import { iaForwardDefinition } from "./platforms/ia.js";

/** 浏览器 Socket.IO 转发入口 URL 前缀（勿被 esport-api HTTP 路由拦截） */
export const WS_FORWARD_URL_PREFIX = "/esport/ws-forward";

/** @param {string} urlPath */
export function isWsForwardHttpPath(urlPath) {
  return urlPath === WS_FORWARD_URL_PREFIX || urlPath.startsWith(`${WS_FORWARD_URL_PREFIX}/`);
}

let enabled = false;

/**
 * @param {import("node:http").Server} httpServer
 * @param {{ platforms?: string[] }} [opts]
 */
export function attachWsForward(httpServer, opts = {}) {
  if (enabled) return;
  const wanted = new Set(opts.platforms ?? ["IA"]);
  if (wanted.has("IA")) registerPlatformForward(iaForwardDefinition);
  attachForwardEngine(httpServer);
  enabled = true;
}

export function getWsForwardStatus() {
  return {
    enabled,
    wsForward: enabled,
    platforms: listPlatformForwards().map((p) => p.id),
  };
}

export { closeForwardEngine };
