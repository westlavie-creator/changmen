import { saveOrders } from "@/api/order";
import type { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import type { VenueOrder } from "@platform/contract";

export function applyUnsettledStats(account: PlatformAccount, orders: VenueOrder[]) {
  account.unsettle = orders.filter((o) => o.status === "none").length;
  const unsettledExposure = orders
    .filter((o) => o.status === "none")
    .reduce((sum, o) => sum + o.odds * o.betMoney, 0);
  account.winBalance = (account.balance ?? 0) + unsettledExposure;
}

/** 对齐 A8 `uv.updateOrders` + `Vt.saveOrders` */
export async function syncVenueOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  const provider = getProvider(account);
  if (!provider?.getOrders) return [];
  const orders = await provider.getOrders(account);
  applyUnsettledStats(account, orders);
  await saveOrders(account, orders);
  return orders;
}

/** 对齐 A8 `uv.updateOrders`：拉场馆订单并返回（拒单检测用） */
export async function updateVenueOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  try {
    return await syncVenueOrders(account);
  } catch (err) {
    console.warn(`[${account.provider}] updateVenueOrders`, err);
    return [];
  }
}

export async function refreshVenueOrdersQuiet(account: PlatformAccount) {
  try {
    await syncVenueOrders(account);
  } catch (err) {
    console.warn(`[${account.provider}] updateOrders`, err);
  }
}
