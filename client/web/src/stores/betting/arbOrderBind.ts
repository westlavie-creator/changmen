import type { VenueOrder } from "@venue/contract";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { saveOrderBind } from "@/api/esport";
import { resolveArbBindOrderId } from "@/stores/betting/autoBet/venueRejectSync";

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
