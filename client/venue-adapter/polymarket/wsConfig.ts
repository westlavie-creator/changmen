import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";
import { POLYMARKET_MARKET_WS, POLYMARKET_USER_WS } from "./api";
import { getPmMarketWsSourceMode } from "./pmMarketWsMode";
import { getPmUserWsSourceMode } from "./pmUserWsMode";

export const PM_MARKET_WS_FORWARD_PATH = "/esport/ws-forward/PM-MARKET";
export const PM_USER_WS_FORWARD_PATH = "/esport/ws-forward/PM-USER";

function changmenPmWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolveHkRelayHttpOrigin());
  return `${base}${path}`;
}

export function resolvePolymarketMarketWsUrl(): string {
  if (getPmMarketWsSourceMode() === "official") return POLYMARKET_MARKET_WS;
  return changmenPmWsUrl(PM_MARKET_WS_FORWARD_PATH);
}

export function resolvePolymarketUserWsUrl(): string {
  if (getPmUserWsSourceMode() === "official") return POLYMARKET_USER_WS;
  return changmenPmWsUrl(PM_USER_WS_FORWARD_PATH);
}
