import type { VenueOrder } from "@venue/contract";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { isVenueLegRejected } from "@venue/contract";
import {
  resolveA8VenueBindOrderId,
} from "@/domain/betting";
import { resolveVenueLegOutcome } from "@/domain/betting/resolveVenueLegOutcome";
import { useAccountStore } from "@/stores/accountStore";

export interface VenueRejectFlags {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
}

/** 拉场馆订单；A8 场馆仅 `orders[0]` 判拒，PM 列表模式按 orderId 判拒 */
export async function fetchVenueOrdersWithReject(
  account: PlatformAccount,
  result?: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const outcome = await resolveVenueLegOutcome(
    account,
    result,
    () => useAccountStore().updateVenueOrders(account),
    { confirmPmPost: false },
  );
  return {
    orders: outcome.orders,
    rejected: isVenueLegRejected(outcome),
  };
}

/** 单腿拒单检测：PM 走 adapter 状态层确认；其它场馆走 getOrders */
export async function syncVenueOrdersWithRejectForLeg(
  account: PlatformAccount,
  result?: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const outcome = await resolveVenueLegOutcome(
    account,
    result,
    () => useAccountStore().updateVenueOrders(account),
    { confirmPmPost: account.provider === "Polymarket" && Boolean(result) },
  );
  return {
    orders: outcome.orders,
    rejected: isVenueLegRejected(outcome),
  };
}

/** 自动套利双腿：分别 sync 场馆订单与拒单标记 */
export async function syncVenueRejectFlags(
  resultA: BetResult | undefined,
  accountA: PlatformAccount | undefined,
  resultB: BetResult | undefined,
  accountB: PlatformAccount | undefined,
): Promise<VenueRejectFlags> {
  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;
  if (resultA?.success && accountA) {
    const synced = await syncVenueOrdersWithRejectForLeg(accountA, resultA);
    ordersA = synced.orders;
    rejectA = synced.rejected;
  }
  if (resultB?.success && accountB) {
    const synced = await syncVenueOrdersWithRejectForLeg(accountB, resultB);
    ordersB = synced.orders;
    rejectB = synced.rejected;
  }
  return { ordersA, ordersB, rejectA, rejectB };
}

/** 绑单 orderId：拒单腿优先绑本次检测到的拒单；成单腿优先 result.orderId，否则 `orders[0]` */
export function resolveArbBindOrderId(
  orders: VenueOrder[],
  result: BetResult | undefined,
  rejected = false,
): string | undefined {
  const fromResult = String(result?.orderId ?? "").trim();
  if (rejected) {
    if (fromResult) {
      const ours = orders.find(o => String(o.orderId ?? "") === fromResult);
      if (ours)
        return fromResult;
    }
    return resolveA8VenueBindOrderId(orders);
  }
  if (fromResult)
    return fromResult;
  return resolveA8VenueBindOrderId(orders);
}
