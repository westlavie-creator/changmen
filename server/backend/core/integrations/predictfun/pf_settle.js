/**
 * Predict.fun 市场结算（house 台账）
 *
 * 官方：Market.status=RESOLVED；Outcome.status=WON|LOST；token=onChainId
 * @see https://dev.predict.fun/ （OutcomeStatus / MarketStatus）
 *
 * house 多用户共用链上仓位：按每用户 RDS 订单 + 市场赛果独立结算，不拆链上持仓。
 * 下单已扣 betMoney（名义）：
 * - Win → 回款 = 截断两位后的持仓 × 1 USDT（与用户端持仓展示一致，截断不四舍五入）
 * - Lose → balance 不变；money = -betMoney
 */

import { roundUsdt } from "./pf_ledger.js";

/**
 * 用户端回款份额精度：两位小数向 0 截断（不用四舍五入）。
 * 赢单回款 = 截断后持仓 × $1。
 */
export function truncateShareUsdt(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0)
    return 0;
  return Math.trunc(x * 100 + 1e-9) / 100;
}

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
 * 赢单回款（USDT）：截断后持仓 × $1；无份额时用 名义/买入价（同样截断）。
 * @param {{ stakeUsdt: number, shares?: number, bookPrice?: number }} input
 */
export function resolvePfWinPayoutUsdt(input) {
  const stake = roundUsdt(input?.stakeUsdt);
  const shares = Number(input?.shares);
  if (Number.isFinite(shares) && shares > 0)
    return truncateShareUsdt(shares);
  const price = Number(input?.bookPrice);
  if (stake > 0 && Number.isFinite(price) && price > 0 && price < 1)
    return truncateShareUsdt(stake / price);
  return stake;
}

/**
 * @param {number} betMoney 用户本金 USDT（名义）
 * @param {{ shares?: number, bookPrice?: number }|number|null|undefined} opts
 * @param {"win"|"lose"} result
 * @returns {{ status: "win"|"lose", money: number, balanceDelta: number, payout: number }}
 */
export function computePfSettlement(betMoney, opts, result) {
  const stake = roundUsdt(betMoney);
  if (result === "lose") {
    return {
      status: "lose",
      money: roundUsdt(-stake),
      balanceDelta: 0,
      payout: 0,
    };
  }

  // 仅接受 { shares, bookPrice }；历史 number 入参（旧赔率）忽略，避免赔率参与结算
  const o = opts && typeof opts === "object" ? opts : {};
  const shares = Number(o.shares);
  const bookPrice = Number(o.bookPrice);
  const hasShares = Number.isFinite(shares) && shares > 0;
  const hasBookPrice = Number.isFinite(bookPrice) && bookPrice > 0 && bookPrice < 1;

  const payout = resolvePfWinPayoutUsdt({
    stakeUsdt: stake,
    shares: hasShares ? shares : undefined,
    bookPrice: hasBookPrice ? bookPrice : undefined,
  });

  return {
    status: "win",
    money: roundUsdt(payout - stake),
    balanceDelta: payout,
    payout,
  };
}
