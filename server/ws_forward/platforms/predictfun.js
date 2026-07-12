/** Predict.fun WebSocket — MARKET=hub 合并订阅（见 predictfun_market_hub.js） */

export const PREDICT_FUN_MARKET_WS_URL = "wss://ws.predict.fun/ws";
export const PREDICTFUN_MARKET_HUB_PATH = "/esport/ws-forward/PREDICTFUN-MARKET";

export function resolvePredictFunWsApiKey() {
  return String(process.env.PREDICT_FUN_API_KEY || process.env.VITE_PREDICT_FUN_API_KEY || "").trim();
}

/** @returns {{ url: string, headers?: Record<string, string> }} */
export function resolvePredictFunMarketUpstream() {
  const apiKey = resolvePredictFunWsApiKey();
  if (!apiKey)
    return { url: PREDICT_FUN_MARKET_WS_URL };
  const url = new URL(PREDICT_FUN_MARKET_WS_URL);
  url.searchParams.set("apiKey", apiKey);
  return {
    url: url.toString(),
    headers: { "x-api-key": apiKey },
  };
}

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const predictFunMarketForwardDefinition = {
  id: "PREDICTFUN-MARKET",
  transport: "raw-ws",
  browserPath: PREDICTFUN_MARKET_HUB_PATH,
  resolveUpstream: resolvePredictFunMarketUpstream,
};
