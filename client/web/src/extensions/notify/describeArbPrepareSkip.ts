import { pickArbLegs } from "@/domain/arbitrage";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { arbProfitRate } from "@/shared/format";

/** getOrderOptions 失败时的可读原因（不改变 A8 判定，仅用于进度报告文案） */
export function describeGetOrderOptionsSkip(
  bet: ViewBet,
  match: ViewMatch,
  config: UserConfig,
  providerKeys: PlatformId[],
  accounts: PlatformAccount[],
): string {
  if (!providerKeys.length) {
    return `无余额 ≥ ${config.betMoney} 的账号平台`;
  }
  if (providerKeys.length === 1) {
    return `仅 ${providerKeys[0]} 有余额账号，套利需至少两个不同平台`;
  }

  const legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
  if (!legs) {
    return `利润/赔率未达阈值（要求对冲 ≥ ${arbProfitRate(config.profit)}，minOdds ≥ ${config.minOdds}）`;
  }

  return "无法构建双腿订单";
}
