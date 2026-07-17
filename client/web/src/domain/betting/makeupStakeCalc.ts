/**
 * [changmen 扩展] 补单金额计算器（纯本地小工具，不接队列/下单）。
 * 对冲式与 LoseOrder.getBetMoney 一致：round(已成金额 × 已成赔率 / 补单赔率)。
 */

import { toFixed } from "@changmen/client-core/shared/format";

export interface MakeupStakeInput {
  refMoney: number;
  refOdds: number;
  targetOdds: number;
}

export interface MakeupStakeResult {
  makeupMoney: number;
  refReturn: number;
  makeupReturn: number;
  /** 两侧返还之差（正=补单侧返还更高） */
  returnDiff: number;
  /** 总投入 = 已成 + 补单 */
  totalStake: number;
  /**
   * 保底盈利金额 = min(两侧返还) − 总投入。
   * 取较小返还，避免取整后一侧虚高。
   */
  profitAmount: number;
  /** 保底利润率 = 盈利金额 / 总投入 */
  profitRate: number;
}

/**
 * 打平赔率：对冲后保本（利润率 0）所需的最低补单赔率。
 * 与 LoseOrder.getOdds(1) 一致：1 / (1 − 1/已成赔率)。
 */
export function calcBreakEvenOdds(refOdds: number): number | null {
  const o = Number(refOdds);
  if (!(o > 1))
    return null;
  const implied = 1 / (1 - 1 / o);
  if (!(implied > 1) || !Number.isFinite(implied))
    return null;
  return Number(toFixed(implied));
}

export function calcMakeupStake(input: MakeupStakeInput): MakeupStakeResult | null {
  const refMoney = Number(input.refMoney);
  const refOdds = Number(input.refOdds);
  const targetOdds = Number(input.targetOdds);
  if (!(refMoney > 0) || !(refOdds > 1) || !(targetOdds > 1))
    return null;

  const makeupMoney = Math.round((refMoney * refOdds) / targetOdds);
  if (!(makeupMoney > 0))
    return null;

  const refReturn = refMoney * refOdds;
  const makeupReturn = makeupMoney * targetOdds;
  const totalStake = refMoney + makeupMoney;
  const profitAmount = Math.min(refReturn, makeupReturn) - totalStake;
  const profitRate = profitAmount / totalStake;
  return {
    makeupMoney,
    refReturn,
    makeupReturn,
    returnDiff: makeupReturn - refReturn,
    totalStake,
    profitAmount,
    profitRate,
  };
}
