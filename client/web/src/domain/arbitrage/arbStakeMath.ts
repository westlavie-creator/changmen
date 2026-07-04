import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { getExchange } from "@/shared/currency";
import { PLATFORMS } from "@/shared/platform";

/** 两腿对冲 implied 乘数（≥1 为盈利） */
export function impliedFromLegOdds(legA: BetOption, legB: BetOption): number {
  return 1 / (1 / legA.odds + 1 / legB.odds);
}

/** 对齐 pickArbLegs：账号 profit 覆盖 config.profit */
export function resolveArbTargetProfit(
  config: UserConfig,
  legA: BetOption,
  legB: BetOption,
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
): number {
  let targetProfit = config.profit;
  const profitOverrides = [accountA, accountB].filter(
    (acc, idx) =>
      acc
      && acc.profit !== 0
      && acc.provider === (idx === 0 ? legA.type : legB.type),
  );
  if (profitOverrides.length) {
    targetProfit = Math.max(...profitOverrides.map(a => a!.profit));
  }
  return targetProfit;
}

/** GetOrderOptions 对冲金额（与 buildOrderOptions 同式；A8 仅在选腿时算一次，预检后不再重算） */
export function applyArbHedgeStakes(
  legA: BetOption,
  legB: BetOption,
  baseStake: number,
  config: UserConfig,
): void {
  const oddsA = legA.odds;
  const oddsB = legB.odds;
  if (oddsA <= oddsB) {
    legA.betMoney = baseStake;
    let hedge = (oddsA * baseStake) / oddsB;
    if (config.tenNumber)
      hedge = Math.round(hedge / 10) * 10;
    legB.betMoney = hedge;
  }
  else {
    legB.betMoney = baseStake;
    let hedge = (oddsB * baseStake) / oddsA;
    if (config.tenNumber)
      hedge = Math.round(hedge / 10) * 10;
    legA.betMoney = hedge;
  }
}

/** 主腿投注额：低赔一侧原 stake（与 prepare 时 config.betMoney 一致） */
export function arbBaseStake(legA: BetOption, legB: BetOption, config: UserConfig): number {
  if (legA.odds <= legB.odds)
    return legA.betMoney || config.betMoney;
  return legB.betMoney || config.betMoney;
}

/** 预检后 leg.betMoney → CNY（PM 经 getBetMoney 后为 USDT，须还原） */
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

/** CNY 计划金额 → 场馆下单口径（经 getBetMoney / 汇率） */
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

/** PM 预检后对冲：先在 CNY 口径算 stake，再写回各腿场馆金额 */
export function arbBaseStakeCny(
  legA: BetOption,
  legB: BetOption,
  config: UserConfig,
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
): number {
  const cnyA = legStakeCny(legA.betMoney, legA.type, accountA);
  const cnyB = legStakeCny(legB.betMoney, legB.type, accountB);
  if (legA.odds <= legB.odds)
    return cnyA || config.betMoney;
  return cnyB || config.betMoney;
}

export function applyArbHedgeStakesCny(
  legA: BetOption,
  legB: BetOption,
  baseStakeCny: number,
  config: UserConfig,
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
): void {
  let cnyA: number;
  let cnyB: number;
  const oddsA = legA.odds;
  const oddsB = legB.odds;
  if (oddsA <= oddsB) {
    cnyA = baseStakeCny;
    let hedge = (oddsA * baseStakeCny) / oddsB;
    if (config.tenNumber)
      hedge = Math.round(hedge / 10) * 10;
    cnyB = hedge;
  }
  else {
    cnyB = baseStakeCny;
    let hedge = (oddsB * baseStakeCny) / oddsA;
    if (config.tenNumber)
      hedge = Math.round(hedge / 10) * 10;
    cnyA = hedge;
  }
  legA.betMoney = applyLegStakeFromCny(cnyA, legA, accountA);
  legB.betMoney = applyLegStakeFromCny(cnyB, legB, accountB);
}
