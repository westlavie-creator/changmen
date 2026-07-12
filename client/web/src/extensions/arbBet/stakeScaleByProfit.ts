import type { StakeScaleByProfitPrefs } from "@/types/extensionPrefs";
import type { BetOption } from "@changmen/client-core/models/betOption";

/**
 * [changmen 扩展] 利润（implied）达阈值时，两腿注码同乘 multiplier。
 * 不改两边比例（仍保持 S ∝ 1/odds）；不改动 config.betMoney，避免污染下一笔。
 */
export function shouldScaleStakeByProfit(
  implied: number,
  prefs: StakeScaleByProfitPrefs | undefined | null,
): boolean {
  if (!prefs?.enabled)
    return false;
  const minImplied = prefs.minImplied;
  const multiplier = prefs.multiplier;
  if (!(Number.isFinite(implied) && implied > 0))
    return false;
  if (!(Number.isFinite(minImplied) && minImplied > 1))
    return false;
  if (!(Number.isFinite(multiplier) && multiplier > 0 && multiplier !== 1))
    return false;
  return implied >= minImplied;
}

/** @returns 实际使用的倍数；未触发时返回 1 */
export function applyStakeScaleByProfit(
  legA: BetOption,
  legB: BetOption,
  implied: number,
  prefs: StakeScaleByProfitPrefs | undefined | null,
): number {
  if (!shouldScaleStakeByProfit(implied, prefs))
    return 1;
  const multiplier = prefs!.multiplier;
  legA.betMoney *= multiplier;
  legB.betMoney *= multiplier;
  return multiplier;
}

/** 加仓触发且扩展开启时，预检/下注不按账号比例系数缩放 Plan 金额 */
export function shouldSkipAccountRateOnStakeScale(
  stakeScale: number,
  prefs: StakeScaleByProfitPrefs | undefined | null,
): boolean {
  return stakeScale > 1 && prefs?.skipAccountRateOnScale === true;
}
