import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import { legStakeCny } from "@/domain/polymarket/pmArbStake";
import { PLATFORMS } from "@/shared/platform";

/** PM 场馆单：已 scale 的 CNY 直接用；未 scale 的 USDC（≈pmStakeUsdc）转 CNY */
export function makeUpVenueBetMoneyCny(
  placed: VenueOrder,
  leg: BetOption,
  account?: PlatformAccount,
): number {
  const raw = Math.round(Number(placed?.betMoney) || 0);
  if (leg.type !== PLATFORMS.Polymarket || !account)
    return raw;
  const usdc = Number(placed.pmStakeUsdc) || 0;
  if (usdc > 0 && raw <= usdc * 1.5)
    return legStakeCny(Math.round(usdc), leg.type, account);
  if (usdc > 0 && raw > usdc * 1.5)
    return raw;
  if (raw > 0 && raw < 500)
    return legStakeCny(raw, leg.type, account);
  return raw;
}

/** 补单入队：优先锚定成功腿场馆实单，避免 leg 对象被重试污染 */
export function resolveMakeUpSuccessReference(
  leg: BetOption,
  venueOrders: VenueOrder[],
  rejected: boolean,
  account?: PlatformAccount,
): { betMoney: number; betOdds: number } {
  if (!rejected && venueOrders.length > 0) {
    const placed = venueOrders.find(o => o.status !== "reject") ?? venueOrders[0];
    const betMoney = makeUpVenueBetMoneyCny(placed, leg, account);
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

