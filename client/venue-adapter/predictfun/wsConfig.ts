import { changmenHttpBaseToWs } from "@venue/shared/changmenWsBase";
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";

export const PREDICT_FUN_WS_FORWARD_PATH = "/esport/ws-forward/PREDICTFUN-MARKET";

function changmenPredictWsUrl(path: string): string {
  const base = changmenHttpBaseToWs(resolveHkRelayHttpOrigin());
  return `${base}${path}`;
}

/** Predict.fun WS 经 changmen ws-forward（API Key 由 VPS .env 注入） */
export function resolvePredictFunMarketWsUrl(): string {
  return changmenPredictWsUrl(PREDICT_FUN_WS_FORWARD_PATH);
}
