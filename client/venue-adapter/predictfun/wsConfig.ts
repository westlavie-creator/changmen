import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolvePmHkRelayHttpOrigin } from "@changmen/client-core/shared/pmHkRelayOrigin";
import { isPolymarketHkEgressEnabled } from "@venue/polymarket/pmHkEgress";
import { PREDICT_FUN_WS } from "./api";

export const PREDICT_FUN_WS_FORWARD_PATH = "/esport/ws-forward/PREDICTFUN-MARKET";

function changmenPredictWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolvePmHkRelayHttpOrigin());
  return `${base}${path}`;
}

/** HK 出口走 ws-forward；否则浏览器直连（需可访问 predict.fun） */
export function resolvePredictFunMarketWsUrl(): string {
  if (isPolymarketHkEgressEnabled())
    return changmenPredictWsUrl(PREDICT_FUN_WS_FORWARD_PATH);
  return PREDICT_FUN_WS;
}
