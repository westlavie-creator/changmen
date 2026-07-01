import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";

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

/** 预检后按最新赔率重算对冲金额（对齐 buildOrderOptions） */
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
