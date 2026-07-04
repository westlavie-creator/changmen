import type { BetOption } from "@/models/betOption";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import { legStakeCny } from "@/domain/arbitrage/arbStakeMath";

/** 补单入队：优先锚定成功腿场馆实单，避免 leg 对象被重试污染 */
export function resolveMakeUpSuccessReference(
  leg: BetOption,
  venueOrders: VenueOrder[],
  rejected: boolean,
  account?: PlatformAccount,
): { betMoney: number; betOdds: number } {
  if (!rejected && venueOrders.length > 0) {
    const placed = venueOrders.find(o => o.status !== "reject") ?? venueOrders[0];
    const betMoney = Math.round(Number(placed?.betMoney) || 0);
    const betOdds = Number(placed?.odds) || 0;
    if (betMoney > 0 && betOdds > 0)
      return { betMoney, betOdds };
  }
  const betMoney = legStakeCny(
    Math.round(Number(leg.betMoney) || 0),
    leg.type,
    account,
  );
  const betOdds = Number(leg.newOdds ?? leg.odds) || 0;
  return { betMoney, betOdds };
}

/** 预检后按实盘赔率重算补单金额（手动 isCreateOrder 保持预检额） */
export function resolveMakeUpHedgeStake(order: LoseOrder, liveOdds: number): number {
  if (!liveOdds)
    return 0;
  if (order.isCreateOrder)
    return Math.round(order.betMoney);
  return order.getBetMoney(liveOdds);
}

/** hedge（CNY）与 checkBet 后 option.betMoney（PM 为 USDT）是否一致 */
export function needsMakeUpStakeRecheck(
  hedgeStakeCny: number,
  checkedBetMoney: number,
  checkedLegType: BetOption["type"],
  account?: PlatformAccount,
): boolean {
  const checkedCny = legStakeCny(Math.round(checkedBetMoney), checkedLegType, account);
  return hedgeStakeCny !== checkedCny;
}
