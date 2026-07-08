import type { VenueOrder } from "@venue/contract";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import {
  applyPolymarketSettlementToResult,
  buildPolymarketRejectVenueOrder,
  isPolymarketBetResultFillConfirmed,
  isPolymarketOrderIdRejected,
} from "@venue/polymarket/orderStatus";
import { settlePolymarketDelayedOrder } from "@venue/polymarket/orderSettlement";
import { awaitPolymarketSettlementJob } from "@venue/polymarket/settlementJob";
import { fetchPolymarketConfirmedTradeForOrder } from "@venue/polymarket/orders";
import {
  resolveA8VenueBindOrderId,
  resolveA8VenueReject,
  resolveVenueRejectForLeg,
} from "@/domain/betting";
import { useAccountStore } from "@/stores/accountStore";

export interface VenueRejectFlags {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
}

/** 拉场馆订单；A8 场馆仅 `orders[0]` 判拒，PM 走 orderId / settlement */
export async function fetchVenueOrdersWithReject(
  account: PlatformAccount,
  result?: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const orders = (await useAccountStore().updateVenueOrders(account)) ?? [];
  const sorted = sortVenueOrdersNewestFirst(orders);
  const rejected = account.provider === "Polymarket"
    ? resolveVenueRejectForLeg(sorted, result)
    : resolveA8VenueReject(sorted);
  return { orders: sorted, rejected };
}

async function syncPolymarketVenueOrdersWithReject(
  account: PlatformAccount,
  result: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  if (result.reject) {
    const kind = result.reject === "timeout" ? "timeout" : "unfilled";
    return {
      orders: [buildPolymarketRejectVenueOrder(account, result, kind)],
      rejected: true,
    };
  }

  if (isPolymarketBetResultFillConfirmed(result)) {
    const synced = await fetchVenueOrdersWithReject(account);
    return { orders: synced.orders, rejected: false };
  }

  const trade = await fetchPolymarketConfirmedTradeForOrder(
    account,
    result.orderId!,
    10 * 60 * 1000,
  );
  if (trade) {
    const synced = await fetchVenueOrdersWithReject(account);
    return { orders: synced.orders, rejected: false };
  }

  const orderId = String(result.orderId ?? "").trim();
  if (orderId) {
    const settled = await settlePolymarketDelayedOrder(account, orderId);
    applyPolymarketSettlementToResult(result, settled.outcome, settled.row);
    if (settled.outcome === "matched") {
      const synced = await fetchVenueOrdersWithReject(account, result);
      return { orders: synced.orders, rejected: false };
    }
    if (settled.outcome === "unfilled" || settled.outcome === "timeout") {
      const kind = settled.outcome === "timeout" ? "timeout" : "unfilled";
      return {
        orders: [buildPolymarketRejectVenueOrder(account, result, kind)],
        rejected: true,
      };
    }
  }

  const synced = await fetchVenueOrdersWithReject(account, result);
  return {
    orders: synced.orders,
    rejected: isPolymarketOrderIdRejected(synced.orders, result.orderId)
      || Boolean(result.reject),
  };
}

/**
 * 单腿拒单检测：PM delayed 在拒单等待后轮询 CLOB order，未成交合成 reject；
 * POST 已 matched 时信任成交；其它场馆走 getOrders + resolveVenueRejectForLeg。
 * PM pending：优先 await POST 预启动的 SettlementJob（wait 期间已在跑）。
 */
export async function syncVenueOrdersWithRejectForLeg(
  account: PlatformAccount,
  result?: BetResult,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  if (account.provider === "Polymarket" && result?.pending && result.orderId) {
    const jobResult = await awaitPolymarketSettlementJob(account, result.orderId);
    const { outcome, row } = jobResult
      ?? await settlePolymarketDelayedOrder(account, result.orderId);
    applyPolymarketSettlementToResult(result, outcome, row);
    if (outcome === "matched") {
      return fetchVenueOrdersWithReject(account, result);
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

  return fetchVenueOrdersWithReject(account, result);
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
