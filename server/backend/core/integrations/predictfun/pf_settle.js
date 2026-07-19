/**
 * Predict.fun 市场结算（house 台账）
 *
 * 官方：Market.status=RESOLVED；Outcome.status=WON|LOST；token=onChainId
 * @see https://dev.predict.fun/ （OutcomeStatus / MarketStatus）
 *
 * house 多用户共用链上仓位：按每用户 RDS 订单 + 市场赛果独立结算，不拆链上持仓。
 * 下单已扣 betMoney：
 * - Win → balance += betMoney * odds（本金+盈利）；money = 盈利
 * - Lose → balance 不变；money = -betMoney
 */

import { roundUsdt } from "./pf_ledger.js";

/**
 * @param {object|null|undefined} market
 * @param {string} tokenId
 * @returns {"win"|"lose"|null} null=未结算或无法判定
 */
export function resolvePfMarketOutcome(market, tokenId) {
  const marketStatus = String(market?.status ?? "").trim().toUpperCase();
  if (marketStatus !== "RESOLVED")
    return null;

  const tid = String(tokenId ?? "").trim();
  if (!tid)
    return null;

  const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
  const mine = outcomes.find(o => String(o?.onChainId ?? "").trim() === tid);
  if (!mine)
    return null;

  const mineStatus = String(mine.status ?? "").trim().toUpperCase();
  if (mineStatus === "WON")
    return "win";
  if (mineStatus === "LOST")
    return "lose";

  const winner = outcomes.find(o => String(o?.status ?? "").trim().toUpperCase() === "WON");
  if (winner)
    return String(winner.onChainId ?? "").trim() === tid ? "win" : "lose";

  return null;
}

/**
 * @param {number} betMoney
 * @param {number} odds
 * @param {"win"|"lose"} result
 * @returns {{ status: "win"|"lose", money: number, balanceDelta: number, payout: number }}
 */
export function computePfSettlement(betMoney, odds, result) {
  const stake = roundUsdt(betMoney);
  if (result === "lose") {
    return {
      status: "lose",
      money: roundUsdt(-stake),
      balanceDelta: 0,
      payout: 0,
    };
  }
  const o = Number(odds);
  const payout = Number.isFinite(o) && o > 1
    ? roundUsdt(stake * o)
    : stake;
  return {
    status: "win",
    money: roundUsdt(payout - stake),
    balanceDelta: payout,
    payout,
  };
}
