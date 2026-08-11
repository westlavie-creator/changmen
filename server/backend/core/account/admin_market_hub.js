import { isAdminUser } from "../auth/admin_auth.js";
import {
  getMarketHubRouteConfig,
  saveMarketHubRouteConfig,
} from "../esport-api/market_hub_route.js";

export function getAdminMarketHubRoute(caller = null) {
  if (caller && !isAdminUser(caller))
    throw new Error("无管理员权限");
  return getMarketHubRouteConfig();
}

/** @param {Record<string, unknown>} body */
export function saveAdminMarketHubRoute(body = {}, caller = null) {
  if (!caller || !isAdminUser(caller))
    throw new Error("无管理员权限");
  return saveMarketHubRouteConfig(body);
}
