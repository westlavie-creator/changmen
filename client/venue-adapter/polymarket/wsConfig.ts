import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";
import { isVenueHkEgressEnabled } from "@venue/shared/venueHkEgress";
import { POLYMARKET_MARKET_WS, POLYMARKET_USER_WS } from "./api";

export const PM_MARKET_WS_FORWARD_PATH = "/esport/ws-forward/PM-MARKET";
export const PM_USER_WS_FORWARD_PATH = "/esport/ws-forward/PM-USER";

function changmenPmWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolveHkRelayHttpOrigin());
  return `${base}${path}`;
}

export function resolvePolymarketMarketWsUrl(): string {
  if (isVenueHkEgressEnabled())
    return changmenPmWsUrl(PM_MARKET_WS_FORWARD_PATH);
  return POLYMARKET_MARKET_WS;
}

export function resolvePolymarketUserWsUrl(): string {
  if (isVenueHkEgressEnabled())
    return changmenPmWsUrl(PM_USER_WS_FORWARD_PATH);
  return POLYMARKET_USER_WS;
}
