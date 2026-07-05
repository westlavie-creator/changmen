/**
 * [changmen 扩展] Polymarket stake 换算（anyOdds 补单 / 进度展示）。
 * 套利预检与 A8 相同：GetOrderOptions 计划额 + 并行 checkBetting，预检后不改 betMoney。
 */
import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import { PLATFORMS } from "@/shared/platform";
import { polymarketCnyFromUsdt } from "@venue/polymarket/pmStake";

export type PmA8LegPair = {
  pmLeg: BetOption;
  a8Leg: BetOption;
  pmAccount?: PlatformAccount;
  a8Account?: PlatformAccount;
};

export function splitPmA8Legs(
  legA: BetOption,
  legB: BetOption,
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
): PmA8LegPair {
  if (legA.type === PLATFORMS.Polymarket) {
    return { pmLeg: legA, a8Leg: legB, pmAccount: accountA, a8Account: accountB };
  }
  return { pmLeg: legB, a8Leg: legA, pmAccount: accountB, a8Account: accountA };
}

/** 预检后 PM 腿 USDT betMoney → CNY */
export function legStakeCny(
  betMoney: number,
  legType: BetOption["type"],
  account?: PlatformAccount,
): number {
  if (account && legType === PLATFORMS.Polymarket) {
    return polymarketCnyFromUsdt(betMoney);
  }
  return betMoney;
}

/** anyOdds / 补单：成功腿场馆 stake → CNY，再算对侧 hedge */
export function hedgeStakeCnyFromLeg(
  successOdds: number,
  successBetMoney: number,
  successLegType: BetOption["type"],
  targetOdds: number,
  successAccount?: PlatformAccount,
): number {
  if (!successOdds || !targetOdds)
    return 0;
  const successCny = legStakeCny(successBetMoney, successLegType, successAccount);
  return Math.floor((successOdds * successCny) / targetOdds);
}
