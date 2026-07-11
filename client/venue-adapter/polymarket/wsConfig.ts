import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolvePmHkRelayHttpOrigin } from "@changmen/client-core/shared/pmHkRelayOrigin";
import { POLYMARKET_MARKET_WS, POLYMARKET_USER_WS } from "./api";
import { isPolymarketHkEgressEnabled } from "./pmHkEgress";

export const PM_MARKET_WS_FORWARD_PATH = "/esport/ws-forward/PM-MARKET";
export const PM_USER_WS_FORWARD_PATH = "/esport/ws-forward/PM-USER";

function changmenPmWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolvePmHkRelayHttpOrigin());
  return `${base}${path}`;
}

export function resolvePolymarketMarketWsUrl(): string {
  if (isPolymarketHkEgressEnabled())
    return changmenPmWsUrl(PM_MARKET_WS_FORWARD_PATH);
  return POLYMARKET_MARKET_WS;
}

export function resolvePolymarketUserWsUrl(): string {
  if (isPolymarketHkEgressEnabled())
    return changmenPmWsUrl(PM_USER_WS_FORWARD_PATH);
  return POLYMARKET_USER_WS;
}
