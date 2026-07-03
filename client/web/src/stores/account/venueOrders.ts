import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import { hasOpenPolymarketPosition } from "@venue/polymarket/pmLogicalPosition";
import { saveOrders } from "@/api/order";
import { getProvider } from "@/runtime/providers";

function isOpenUnsettledVenueOrder(o: VenueOrder): boolean {
  if (o.status !== "none")
    return false;
  if (o.provider === "Polymarket")
    return hasOpenPolymarketPosition(o);
  return true;
}

export function applyUnsettledStats(account: PlatformAccount, orders: VenueOrder[]) {
  const open = orders.filter(isOpenUnsettledVenueOrder);
  account.unsettle = open.length;
  const unsettledExposure = open.reduce((sum, o) => sum + o.odds * o.betMoney, 0);
  account.winBalance = (account.balance ?? 0) + unsettledExposure;
}

/** 对齐 A8 `uv.updateOrders` + `Vt.saveOrders` */
export async function syncVenueOrders(account: PlatformAccount): Promise<VenueOrder[] | undefined> {
  const provider = getProvider(account);
  if (!provider?.getOrders)
    return undefined;
  const raw = await provider.getOrders(account);
  if (raw == null)
    return undefined;
  const orders = sortVenueOrdersNewestFirst(raw);
  applyUnsettledStats(account, orders);
  await saveOrders(account, orders);
  return orders;
}

/** 对齐 A8 `uv.updateOrders`：拉场馆订单并返回（拒单检测用） */
export async function updateVenueOrders(account: PlatformAccount): Promise<VenueOrder[] | undefined> {
  account.loadingBalance = true;
  try {
    return await syncVenueOrders(account);
  }
  catch (err) {
    console.error(`[${account.provider}]${account.playerName} 加载订单出错`, err);
    return undefined;
  }
  finally {
    account.loadingBalance = false;
  }
}
