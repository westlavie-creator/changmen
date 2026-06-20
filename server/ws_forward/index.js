import { attachForwardEngine, closeForwardEngine } from "./core/forward_engine.js";
import { registerPlatformForward, listPlatformForwards } from "./platforms/registry.js";
import { getForwardStats } from "./core/forward_stats.js";
import { iaForwardDefinition } from "./platforms/ia.js";
import { obForwardDefinition } from "./platforms/ob.js";
import { rayForwardDefinition } from "./platforms/ray.js";

/** 浏览器实时转发入口 URL 前缀（勿被 esport-api HTTP 路由拦截） */
export const WS_FORWARD_URL_PREFIX = "/esport/ws-forward";

/** @param {string} urlPath */
export function isWsForwardHttpPath(urlPath) {
  return urlPath === WS_FORWARD_URL_PREFIX || urlPath.startsWith(`${WS_FORWARD_URL_PREFIX}/`);
}

const PLATFORM_DEFS = {
  IA: iaForwardDefinition,
  OB: obForwardDefinition,
  RAY: rayForwardDefinition,
};

let enabled = false;

/**
 * @param {import("node:http").Server} httpServer
 * @param {{ platforms?: string[] }} [opts]
 */
export function attachWsForward(httpServer, opts = {}) {
  if (enabled) return;
  const wanted = new Set(opts.platforms ?? ["IA", "OB", "RAY"]);
  for (const id of wanted) {
    const def = PLATFORM_DEFS[id];
    if (def) registerPlatformForward(def);
  }
  attachForwardEngine(httpServer);
  enabled = true;
}

export function getWsForwardStatus() {
  const stats = getForwardStats();
  return {
    enabled,
    wsForward: enabled,
    platforms: listPlatformForwards().map((p) => p.id),
    platformStats: stats,
  };
}

export { closeForwardEngine };
