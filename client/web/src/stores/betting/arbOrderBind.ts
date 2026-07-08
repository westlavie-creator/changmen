import type { VenueOrder } from "@venue/contract";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { saveOrderBind } from "@/api/esport";

/** [A8 可证实] 列表非空时绑 orders[0].orderId */
function resolveA8VenueBindOrderId(orders: VenueOrder[]): string | undefined {
  if (orders.length === 0)
    return undefined;
  const id = String(orders[0].orderId ?? "").trim();
  return id || undefined;
}

/** 绑单 orderId：拒单腿优先绑本次检测到的拒单；成单腿优先 result.orderId，否则 orders[0] */
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

/** 套利/补单：把场馆订单绑到同一 LinkID，侧栏按 link 合并展示 */
export async function bindArbLegOrder(
  linkId: number,
  account: PlatformAccount,
  result: BetResult,
  orders: VenueOrder[],
  rejected: boolean,
): Promise<boolean> {
  if (!linkId || !result?.success)
    return false;
  const orderId = resolveArbBindOrderId(orders, result, rejected);
  if (!orderId)
    return false;
  await saveOrderBind({
    orders: JSON.stringify([
      {
        LinkID: linkId,
        Provider: result.provider,
        PlayerID: account.accountId,
        OrderID: orderId,
      },
    ]),
  });
  return true;
}

/** 绑单后刷新侧栏订单列表（合并组可见） */
export function refreshOrderListAfterBind(): void {
  void import("@/stores/orderStore")
    .then(({ useOrderStore }) => useOrderStore().fetchOrders())
    .catch(() => {});
}
