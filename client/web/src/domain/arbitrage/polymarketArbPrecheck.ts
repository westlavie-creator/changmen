import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { impliedFromLegOdds, resolveArbTargetProfit } from "@/domain/arbitrage/arbStakeMath";
import {
  applyPmArbHedgeAfterPrecheck,
  restoreLegStakeCnyBeforeRecheck,
} from "@/domain/polymarket/pmArbStake";

export function arbLegsIncludePolymarket(legA: BetOption, legB: BetOption): boolean {
  return legA.type === "Polymarket" || legB.type === "Polymarket";
}

export type PolymarketArbPrecheckResult =
  | {
    ok: true;
    legA: BetOption;
    legB: BetOption;
    implied: number;
  }
  | {
    ok: false;
    message: string;
  };

/**
 * [changmen 扩展] PM 预检后 reconcile：只调整对冲侧一条腿，A8 腿保持第一次预检 stake。
 * 非 PM 双腿套利不进入此路径（对齐 A8：GetOrderOptions 后不再改 betMoney）。
 */
export async function reconcilePolymarketArbStakes(params: {
  legA: BetOption;
  legB: BetOption;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  config: UserConfig;
  checkBetting: (account: PlatformAccount, option: BetOption) => Promise<BetOption>;
}): Promise<PolymarketArbPrecheckResult> {
  let { legA, legB, accountA, accountB, config, checkBetting } = params;

  const adjustment = applyPmArbHedgeAfterPrecheck(legA, legB, config, accountA, accountB);

  let implied = impliedFromLegOdds(legA, legB);
  const targetProfit = resolveArbTargetProfit(config, legA, legB, accountA, accountB);
  if (implied < targetProfit || implied > config.maxProfit) {
    return {
      ok: false,
      message: `预检后利润 ${implied.toFixed(4)} 未达阈值（要求 ≥ ${targetProfit.toFixed(4)}）`,
    };
  }

  if (adjustment?.account) {
    restoreLegStakeCnyBeforeRecheck(adjustment.leg, adjustment.account);
    const checked = await checkBetting(adjustment.account, adjustment.leg);
    if (!checked.data) {
      return {
        ok: false,
        message: checked.checkError || `${checked.type} 预检未通过`,
      };
    }

    implied = impliedFromLegOdds(legA, legB);
    if (implied < targetProfit || implied > config.maxProfit) {
      return {
        ok: false,
        message: `PM 重检后利润 ${implied.toFixed(4)} 未达阈值（要求 ≥ ${targetProfit.toFixed(4)}）`,
      };
    }
  }

  return { ok: true, legA, legB, implied };
}
