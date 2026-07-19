/**
 * 下单前市场可交易校验
 * @see https://dev.predict.fun/subscription-topics-1915507m0 tradingStatus
 * @see https://dev.predict.fun/marketstatus-14037482d0
 */

/**
 * @param {object|null|undefined} market
 * @returns {{ ok: true } | { ok: false, msg: string }}
 */
export function assertPredictMarketTradable(market) {
  if (!market || typeof market !== "object")
    return { ok: false, msg: "Predict.fun 市场不存在" };

  const marketStatus = String(market.status ?? "").trim().toUpperCase();
  if (marketStatus === "RESOLVED" || marketStatus === "REMOVED" || marketStatus === "PAUSED") {
    return {
      ok: false,
      msg: `Predict.fun 市场不可交易（status=${marketStatus || "?"}）`,
    };
  }

  const trading = String(market.tradingStatus ?? "OPEN").trim().toUpperCase();
  if (trading && trading !== "OPEN" && trading !== "UNPAUSED") {
    return {
      ok: false,
      msg: `Predict.fun 市场不可交易（tradingStatus=${trading}）`,
    };
  }

  return { ok: true };
}
