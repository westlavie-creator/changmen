/**
 * Predict.fun 市场结算（house 台账）
 *
 * 官方：Market.status=RESOLVED；Outcome.status=WON|LOST；token=onChainId
 * @see https://dev.predict.fun/ （OutcomeStatus / MarketStatus）
 *
 * house 多用户共用链上仓位：按每用户 RDS 订单 + 市场赛果独立结算，不拆链上持仓。
 * 下单已扣 betMoney（名义）：
 * - Win → 回款 = 持仓份额 × 1 USDT（每份兑付 $1）；money = 回款 − 本金
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
 * 赢单回款（USDT）：份额 × $1；无份额时用 名义/买入价。
 * @param {{ stakeUsdt: number, shares?: number, bookPrice?: number }} input
 */
export function resolvePfWinPayoutUsdt(input) {
  const stake = roundUsdt(input?.stakeUsdt);
  const shares = Number(input?.shares);
  if (Number.isFinite(shares) && shares > 0)
    return roundUsdt(shares);
  const price = Number(input?.bookPrice);
  if (stake > 0 && Number.isFinite(price) && price > 0 && price < 1)
    return roundUsdt(stake / price);
  return stake;
}

/**
 * @param {number} betMoney 用户本金 USDT（名义）
 * @param {number|{ shares?: number, bookPrice?: number, odds?: number }} optsOrOdds
 * @param {"win"|"lose"} result
 * @returns {{ status: "win"|"lose", money: number, balanceDelta: number, payout: number }}
 */
export function computePfSettlement(betMoney, optsOrOdds, result) {
  const stake = roundUsdt(betMoney);
  if (result === "lose") {
    return {
      status: "lose",
      money: roundUsdt(-stake),
      balanceDelta: 0,
      payout: 0,
    };
  }

  const opts = optsOrOdds && typeof optsOrOdds === "object"
    ? optsOrOdds
    : { odds: optsOrOdds };

  const shares = Number(opts.shares);
  const bookPrice = Number(opts.bookPrice);
  const hasShares = Number.isFinite(shares) && shares > 0;
  const hasBookPrice = Number.isFinite(bookPrice) && bookPrice > 0 && bookPrice < 1;

  let payout = resolvePfWinPayoutUsdt({
    stakeUsdt: stake,
    shares: hasShares ? shares : undefined,
    bookPrice: hasBookPrice ? bookPrice : undefined,
  });
  // 仅当既无份额也无买入价时，才用赔率兜底（旧调用兼容）；有份额时即使 payout≤stake 也不改写
  if (!hasShares && !hasBookPrice && Number(opts.odds) > 1)
    payout = roundUsdt(stake * Number(opts.odds));

  return {
    status: "win",
    money: roundUsdt(payout - stake),
    balanceDelta: payout,
    payout,
  };
}
