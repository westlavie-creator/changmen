import type { VenueOrder } from "@venue/contract";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import {
  applyPolymarketSettlementToResult,
  buildPolymarketRejectVenueOrder,
  isPolymarketBetResultFillConfirmed,
  isPolymarketOrderIdRejected,
  settlePolymarketDelayedOrder,
} from "@venue/polymarket/orderStatus";
import { fetchPolymarketConfirmedTradeForOrder } from "@venue/polymarket/orders";
import { isVenueReject } from "@/domain/betting";
import { useAccountStore } from "@/stores/accountStore";

export interface VenueRejectFlags {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
}

/** 拉场馆订单并判定首条是否拒单（对齐 A8 `isVenueReject`） */
export async function fetchVenueOrdersWithReject(
  account: PlatformAccount,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const orders = (await useAccountStore().updateVenueOrders(account)) ?? [];
  const sorted = sortVenueOrdersNewestFirst(orders);
  return { orders: sorted, rejected: isVenueReject(sorted) };
}

async function syncPolymarketVenueOrdersWithReject(
  account: PlatformAccount,
  result: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  if (isPolymarketBetResultFillConfirmed(result))
    return { orders: [], rejected: false };

  const trade = await fetchPolymarketConfirmedTradeForOrder(
    account,
    result.orderId!,
    10 * 60 * 1000,
  );
  if (trade) {
    const synced = await fetchVenueOrdersWithReject(account);
    return { orders: synced.orders, rejected: false };
  }

  const synced = await fetchVenueOrdersWithReject(account);
  return {
    orders: synced.orders,
    rejected: isPolymarketOrderIdRejected(synced.orders, result.orderId),
  };
}

/**
 * 单腿拒单检测：PM delayed 在拒单等待后轮询 CLOB order，未成交合成 reject；
 * POST 已 matched 时信任成交；其它场馆走 getOrders + isVenueReject。
 */
export async function syncVenueOrdersWithRejectForLeg(
  account: PlatformAccount,
  result?: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  if (account.provider === "Polymarket" && result?.pending && result.orderId) {
    const { outcome, row } = await settlePolymarketDelayedOrder(account, result.orderId);
    applyPolymarketSettlementToResult(result, outcome, row);
    if (outcome === "matched") {
      const synced = await fetchVenueOrdersWithReject(account);
      return synced;
    }
    const rejectOrder = buildPolymarketRejectVenueOrder(
      account,
      result,
      outcome === "timeout" ? "timeout" : "unfilled",
    );
    return { orders: [rejectOrder], rejected: true };
  }

  if (account.provider === "Polymarket" && result?.success && result.orderId)
    return syncPolymarketVenueOrdersWithReject(account, result);

  return fetchVenueOrdersWithReject(account);
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

export function resolveArbBindOrderId(
  orders: VenueOrder[],
  result: BetResult | undefined,
): string | undefined {
  const fromVenue = String(orders[0]?.orderId ?? "").trim();
  if (fromVenue)
    return fromVenue;
  const fromResult = String(result?.orderId ?? "").trim();
  return fromResult || undefined;
}
