import type { BetOption } from "@changmen/client-core/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@changmen/venue-adapter/contract";
import {
  resolvePlanCnyFromVenueOrder,
  resolvePlanCnyFromVenueStake,
} from "@changmen/venue-adapter/adaptation";
import { PLATFORMS } from "@changmen/venue-adapter/shared";

function pickVenueOrderForMakeUpReference(
  venueOrders: VenueOrder[],
  successOrderId?: string | null,
): VenueOrder | undefined {
  const id = String(successOrderId ?? "").trim();
  if (id) {
    const ours = venueOrders.find(o => o.orderId === id && o.status !== "reject");
    if (ours)
      return ours;
    return undefined;
  }
  return venueOrders.find(o => o.status !== "reject");
}

/** 补单入队：优先锚定成功腿场馆实单，避免 leg 对象被重试污染 */
export function resolveMakeUpSuccessReference(
  leg: BetOption,
  venueOrders: VenueOrder[],
  rejected: boolean,
  account?: PlatformAccount,
  successOrderId?: string | null,
): { betMoney: number; betOdds: number } {
  if (!rejected && venueOrders.length > 0) {
    const placed = pickVenueOrderForMakeUpReference(venueOrders, successOrderId);
    if (placed) {
      const betMoney = account
        ? resolvePlanCnyFromVenueOrder(account, placed)
        : Math.round(Number(placed.betMoney) || 0);
      const betOdds = Number(placed.odds) || 0;
      if (betMoney > 0 && betOdds > 0)
        return { betMoney, betOdds };
    }
  }
  const raw = Math.round(Number(leg.betMoney) || 0);
  const betMoney = account && leg.type === PLATFORMS.Polymarket
    ? resolvePlanCnyFromVenueStake(account, raw)
    : raw;
  const betOdds = Number(leg.newOdds ?? leg.odds) || 0;
  return { betMoney, betOdds };
}
