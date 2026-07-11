/** Predict.fun WebSocket — changmen HK 出口中继 */

export const PREDICT_FUN_MARKET_WS_URL = "wss://ws.predict.fun/ws";

function resolvePredictFunWsApiKey() {
  return String(process.env.PREDICT_FUN_API_KEY || process.env.VITE_PREDICT_FUN_API_KEY || "").trim();
}

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const predictFunMarketForwardDefinition = {
  id: "PREDICTFUN-MARKET",
  transport: "raw-ws",
  browserPath: "/esport/ws-forward/PREDICTFUN-MARKET",
  resolveUpstream() {
    const apiKey = resolvePredictFunWsApiKey();
    if (!apiKey)
      return { url: PREDICT_FUN_MARKET_WS_URL };
    const url = new URL(PREDICT_FUN_MARKET_WS_URL);
    url.searchParams.set("apiKey", apiKey);
    return {
      url: url.toString(),
      headers: { "x-api-key": apiKey },
    };
  },
};
