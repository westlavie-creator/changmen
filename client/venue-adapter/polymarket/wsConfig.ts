import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";

export const PM_MARKET_WS_FORWARD_PATH = "/esport/ws-forward/PM-MARKET";
export const PM_USER_WS_FORWARD_PATH = "/esport/ws-forward/PM-USER";

function changmenPmWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolveHkRelayHttpOrigin());
  return `${base}${path}`;
}

export function resolvePolymarketMarketWsUrl(): string {
  return changmenPmWsUrl(PM_MARKET_WS_FORWARD_PATH);
}

export function resolvePolymarketUserWsUrl(): string {
  return changmenPmWsUrl(PM_USER_WS_FORWARD_PATH);
}
