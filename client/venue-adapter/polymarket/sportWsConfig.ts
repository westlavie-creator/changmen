/**
 * 体育 MARKET WS URL（独立于电竞 `wsConfig.ts`，避免改电竞文件）。
 */
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";
import { getChangmenAuthToken } from "../shared/changmenAuthToken";
import { changmenHttpBaseToWs } from "../shared/changmenWsBase";

export const PM_SPORT_MARKET_WS_FORWARD_PATH = "/esport/ws-forward/PM-SPORT-MARKET";

function changmenSportPmWsUrl(path: string, withAuthToken = false): string {
  const base = changmenHttpBaseToWs(resolveHkRelayHttpOrigin());
  const url = `${base}${path}`;
  if (!withAuthToken)
    return url;
  const token = getChangmenAuthToken();
  if (!token)
    return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** 固定走 PM-SPORT-MARKET；不读电竞 official/changmen 切换。 */
export function resolvePolymarketSportMarketWsUrl(): string {
  return changmenSportPmWsUrl(PM_SPORT_MARKET_WS_FORWARD_PATH, true);
}
