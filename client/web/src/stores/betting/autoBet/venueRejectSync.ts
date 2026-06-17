import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import { isVenueReject } from "@/domain/betting";
import type { VenueOrder } from "@platform/contract";
import { useAccountStore } from "@/stores/accountStore";

/** 拉场馆订单并判定首条是否拒单（对齐 A8 `isVenueReject`） */
export async function fetchVenueOrdersWithReject(
  account: PlatformAccount,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const orders = (await useAccountStore().updateVenueOrders(account)) ?? [];
  return { orders, rejected: isVenueReject(orders) };
}

/** 自动套利双腿：分别 sync 场馆订单与拒单标记 */
export async function syncVenueRejectFlags(
  resultA: BetResult | undefined,
  accountA: PlatformAccount | undefined,
  resultB: BetResult | undefined,
  accountB: PlatformAccount | undefined,
): Promise<{
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
}> {
  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;
  if (resultA?.success && accountA) {
    const synced = await fetchVenueOrdersWithReject(accountA);
    ordersA = synced.orders;
    rejectA = synced.rejected;
  }
  if (resultB?.success && accountB) {
    const synced = await fetchVenueOrdersWithReject(accountB);
    ordersB = synced.orders;
    rejectB = synced.rejected;
  }
  return { ordersA, ordersB, rejectA, rejectB };
}
