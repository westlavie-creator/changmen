/** SX.bet Centrifugo — MARKET=hub 扇出 best_odds:global（见 sxbet_market_hub.js） */

export const SXBET_API = String(process.env.SXBET_API_BASE || "https://api.sx.bet").replace(/\/$/, "");
export const SXBET_WS = "wss://realtime.sx.bet/connection/websocket";
export const SXBET_BEST_ODDS_CHANNEL = "best_odds:global";
export const SXBET_MARKET_HUB_PATH = "/esport/ws-forward/SXBET-MARKET";

export function resolveSxBetWsApiKey() {
  return String(
    process.env.SXBET_API_KEY
    || process.env.SX_BET_API_KEY
    || "",
  ).trim();
}

/**
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function fetchSxBetRealtimeToken(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key)
    throw new Error("SXBET_API_KEY 未配置");
  const res = await fetch(`${SXBET_API}/user/realtime-token/api-key`, {
    headers: {
      Accept: "application/json",
      "x-api-key": key,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `SX realtime token HTTP ${res.status}`);
  }
  const json = await res.json();
  const token = json?.token ?? json?.data?.token;
  if (!token)
    throw new Error("SXBet realtime token 为空");
  return String(token);
}

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const sxBetMarketForwardDefinition = {
  id: "SXBET-MARKET",
  transport: "raw-ws",
  browserPath: SXBET_MARKET_HUB_PATH,
  resolveUpstream: () => ({ url: SXBET_WS }),
};
