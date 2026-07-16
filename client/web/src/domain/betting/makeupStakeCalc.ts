/**
 * [changmen 扩展] 补单金额计算器（纯本地小工具，不接队列/下单）。
 * 对冲式与 LoseOrder.getBetMoney 一致：round(已成金额 × 已成赔率 / 补单赔率)。
 */

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
}

export function calcMakeupStake(input: MakeupStakeInput): MakeupStakeResult | null {
  const refMoney = Number(input.refMoney);
  const refOdds = Number(input.refOdds);
  const targetOdds = Number(input.targetOdds);
  if (!(refMoney > 0) || !(refOdds > 1) || !(targetOdds > 1))
    return null;

  const makeupMoney = Math.round((refMoney * refOdds) / targetOdds);
  const refReturn = refMoney * refOdds;
  const makeupReturn = makeupMoney * targetOdds;
  return {
    makeupMoney,
    refReturn,
    makeupReturn,
    returnDiff: makeupReturn - refReturn,
  };
}
