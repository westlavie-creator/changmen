import type { OrderRow } from "@/types/order";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  applyChangmenSellToVenueOrder,
  venueOrderFromOrderRow,
} from "@venue/polymarket/pmLogicalPosition";
import { saveOrders } from "@/api/order";

export interface PersistChangmenSellParams {
  sharesSold: number;
  proceedsUsdc: number;
}

/** changmen 卖出成交后：按行写回份额与 Money，再 saveOrder */
export async function persistChangmenSellAttribution(
  account: PlatformAccount,
  row: OrderRow,
  params: PersistChangmenSellParams,
): Promise<void> {
  const buyOrderId = String(row.OrderID ?? "").trim();
  if (!buyOrderId)
    throw new Error("缺少买入订单 OrderID");

  const base = venueOrderFromOrderRow(row);
  if (base.orderId !== buyOrderId)
    base.orderId = buyOrderId;

  const updated = applyChangmenSellToVenueOrder(base, params);
  await saveOrders(account, [updated]);
}
