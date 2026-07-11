/** Polymarket CLOB WebSocket — changmen HK 出口中继 */

export const PM_MARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
export const PM_USER_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user";

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const pmMarketForwardDefinition = {
  id: "PM-MARKET",
  transport: "raw-ws",
  browserPath: "/esport/ws-forward/PM-MARKET",
  resolveUpstream() {
    return { url: PM_MARKET_WS_URL };
  },
};

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const pmUserForwardDefinition = {
  id: "PM-USER",
  transport: "raw-ws",
  browserPath: "/esport/ws-forward/PM-USER",
  resolveUpstream() {
    return { url: PM_USER_WS_URL };
  },
};
