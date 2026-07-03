import type { OrderRow } from "@/types/order";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  applyBuySharesAfterSell,
  buildChangmenSellVenueOrder,
  venueOrderFromOrderRow,
} from "@venue/polymarket/pmLogicalPosition";
import { scalePolymarketVenueOrdersForDisplay } from "@venue/polymarket/orders";
import { saveOrderBind, saveOrders } from "@/api/order";

export interface PersistChangmenSellParams {
  sellOrderId: string;
  sharesSold: number;
  proceedsUsdc: number;
  stakeUsdc?: number;
}

/** changmen 卖出成交：新建卖单 + 更新买单份额 */
export async function persistChangmenSellOrder(
  account: PlatformAccount,
  buyRow: OrderRow,
  params: PersistChangmenSellParams,
): Promise<void> {
  const sellOrderId = String(params.sellOrderId ?? "").trim();
  if (!sellOrderId)
    throw new Error("缺少卖出订单 orderId");

  const buyOrderId = String(buyRow.OrderID ?? "").trim();
  if (!buyOrderId)
    throw new Error("缺少买入订单 OrderID");

  const buy = venueOrderFromOrderRow(buyRow);
  if (buy.pmSide === "sell")
    throw new Error("不能对卖单再次卖出");

  const updatedBuy = applyBuySharesAfterSell(buy, params.sharesSold);
  const sellOrder = buildChangmenSellVenueOrder(buy, {
    sellOrderId,
    sharesSold: params.sharesSold,
    proceedsUsdc: params.proceedsUsdc,
    stakeUsdc: params.stakeUsdc,
  });

  // 买单行已是 DB CNY 口径；卖单新建为 USDC，仅 scale 卖单
  const [scaledSell] = scalePolymarketVenueOrdersForDisplay([sellOrder]);
  await saveOrders(account, [updatedBuy, scaledSell]);

  const link = Number(buyRow.Link) || 0;
  if (link !== 0) {
    await saveOrderBind({
      orders: JSON.stringify([{
        LinkID: link,
        Provider: "Polymarket",
        OrderID: sellOrderId,
        playerId: account.accountId,
      }]),
    });
  }
}

/** @deprecated 使用 persistChangmenSellOrder */
export async function persistChangmenSellAttribution(
  account: PlatformAccount,
  row: OrderRow,
  params: Omit<PersistChangmenSellParams, "sellOrderId"> & { sellOrderId?: string },
): Promise<void> {
  const sellOrderId = String(params.sellOrderId ?? `legacy-sell-${row.OrderID}-${Date.now()}`).trim();
  await persistChangmenSellOrder(account, row, { ...params, sellOrderId });
}
