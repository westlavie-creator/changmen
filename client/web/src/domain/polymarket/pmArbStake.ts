/**
 * [changmen 扩展] Polymarket 套利 stake 换算与 reconcile。
 * A8 对齐逻辑在 domain/arbitrage/arbStakeMath.ts（纯 CNY）；本文件不进入非 PM 路径。
 *
 * 不变量：
 * - checkBetting 入参 betMoney = CNY 计划额（GetOrderOptions / reconcile 重检前 restore）
 * - checkBetting 出参 betMoney = 场馆口径（PM 为 USDT，A8 场馆为 CNY×rate）
 * - apiBetMoney 仅作进度展示，下单以 betMoney 为准
 */
import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { getExchange } from "@/shared/currency";
import { PLATFORMS } from "@/shared/platform";

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
    return Math.round(betMoney * getExchange(account.currency));
  }
  return betMoney;
}

/** CNY 计划额 → 场馆下单口径（经 getBetMoney / 汇率） */
export function applyLegStakeFromCny(
  cnyStake: number,
  leg: BetOption,
  account?: PlatformAccount,
): number {
  if (account) {
    return account.getBetMoney(cnyStake, leg.odds);
  }
  return cnyStake;
}

/** 对齐 PlatformAccount.getBetMoney 取当前赔率 band 的 rate */
function resolveEffectiveRate(account: PlatformAccount, odds: number): number {
  if (!account.rateConfig?.length)
    return 1;
  const row = account.rateConfig.find(
    r =>
      (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
  );
  let rate = row?.rate ?? 0;
  if (rate === 0)
    rate = 1;
  return rate;
}

/**
 * reconcile 重检前：场馆口径 stake → CNY 计划额，供 checkBetting 再次 getBetMoney。
 */
export function restoreLegStakeCnyBeforeRecheck(
  leg: BetOption,
  account?: PlatformAccount,
): void {
  if (!account)
    return;
  if (leg.type === PLATFORMS.Polymarket) {
    leg.betMoney = legStakeCny(leg.betMoney, leg.type, account);
    return;
  }
  const rate = resolveEffectiveRate(account, leg.odds);
  if (rate !== 1)
    leg.betMoney = Math.ceil(leg.betMoney / rate);
}

function roundTenStake(config: UserConfig, cnyStake: number): number {
  if (config.tenNumber)
    return Math.round(cnyStake / 10) * 10;
  return cnyStake;
}

export type PmArbHedgeAdjustment = {
  changedLeg: "pm" | "a8";
  leg: BetOption;
  account?: PlatformAccount;
  moneyBefore: number;
};

function betMoneyChanged(before: number, after: number): boolean {
  return Math.round(before) !== Math.round(after);
}

/**
 * PM 预检后按盘口价只调整对冲侧一条腿，A8 主腿保持第一次预检 stake。
 * - A8 低赔：锚 config.betMoney，只改 PM
 * - PM 低赔：锚 PM 实占 CNY，只改 A8
 */
export function applyPmArbHedgeAfterPrecheck(
  legA: BetOption,
  legB: BetOption,
  config: UserConfig,
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
): PmArbHedgeAdjustment | null {
  const { pmLeg, a8Leg, pmAccount, a8Account } = splitPmA8Legs(legA, legB, accountA, accountB);

  if (a8Leg.odds <= pmLeg.odds) {
    const moneyBefore = pmLeg.betMoney;
    const pmHedgeCny = roundTenStake(
      config,
      (a8Leg.odds * config.betMoney) / pmLeg.odds,
    );
    const moneyAfter = applyLegStakeFromCny(pmHedgeCny, pmLeg, pmAccount);
    if (!betMoneyChanged(moneyBefore, moneyAfter))
      return null;
    pmLeg.betMoney = moneyAfter;
    return { changedLeg: "pm", leg: pmLeg, account: pmAccount, moneyBefore };
  }

  const moneyBefore = a8Leg.betMoney;
  const anchorCny = legStakeCny(pmLeg.betMoney, pmLeg.type, pmAccount) || config.betMoney;
  const a8HedgeCny = roundTenStake(
    config,
    (pmLeg.odds * anchorCny) / a8Leg.odds,
  );
  const moneyAfter = applyLegStakeFromCny(a8HedgeCny, a8Leg, a8Account);
  if (!betMoneyChanged(moneyBefore, moneyAfter))
    return null;
  a8Leg.betMoney = moneyAfter;
  return { changedLeg: "a8", leg: a8Leg, account: a8Account, moneyBefore };
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
