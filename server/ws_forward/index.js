import { attachForwardEngine, closeForwardEngine } from "./core/forward_engine.js";
import {
  attachPmMarketHub,
  closePmMarketHub,
  getPmMarketHubStatus,
  isPmMarketHubAttached,
} from "./core/pm_market_hub.js";
import { attachPredictFunMarketHub, closePredictFunMarketHub } from "./core/predictfun_market_hub.js";
import { registerPlatformForward, listPlatformForwards } from "./platforms/registry.js";
import { getForwardStats } from "./core/forward_stats.js";
import { iaForwardDefinition } from "./platforms/ia.js";
import { obForwardDefinition } from "./platforms/ob.js";
import { pmUserForwardDefinition } from "./platforms/pm.js";
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
  "PM-USER": pmUserForwardDefinition,
};

let enabled = false;
let predictFunHubAttached = false;

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
  // PM-MARKET 默认由独立进程 changmen-pm-market-hub 承担；仅当显式列入 platforms 时才挂本进程
  if (wanted.has("PM-MARKET")) {
    attachPmMarketHub(httpServer, {
      resolveIdentity: async (token) => {
        const { default: store } = await import("../backend/core/esport-api/store.js");
        return store.resolveUserIdentityByToken(token);
      },
    });
  }
  if (wanted.has("PREDICTFUN-MARKET")) {
    attachPredictFunMarketHub(httpServer);
    predictFunHubAttached = true;
  }
  enabled = true;
}

export function getWsForwardStatus() {
  const stats = getForwardStats();
  const platforms = listPlatformForwards().map((p) => p.id);
  const pmAttached = isPmMarketHubAttached();
  if (pmAttached && !platforms.includes("PM-MARKET"))
    platforms.push("PM-MARKET");
  if (predictFunHubAttached && !platforms.includes("PREDICTFUN-MARKET"))
    platforms.push("PREDICTFUN-MARKET");
  return {
    enabled,
    wsForward: enabled,
    platforms,
    platformStats: stats,
    hubs: {
      pmMarket: pmAttached ? getPmMarketHubStatus() : null,
    },
  };
}

export { closeForwardEngine };

export function closeWsForward() {
  closePmMarketHub();
  closePredictFunMarketHub();
  closeForwardEngine();
  predictFunHubAttached = false;
  enabled = false;
}
