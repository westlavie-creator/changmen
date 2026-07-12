/**
 * Polymarket RDS 订单加载器注册（须在 sessionBoot 前 import）。
 * 对齐 A8：updateOrders → provider.getOrders → saveOrders；PM 在 getOrders 内合并 RDS。
 */
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { getPlayerOrder } from "@/api/chat";
import { registerPolymarketStoredVenueOrdersLoader } from "@changmen/venue-adapter/polymarket/pmStoredOrders";
import { venueOrderFromOrderRow, stripPolymarketSellOrders } from "@changmen/venue-adapter/polymarket/pmLogicalPosition";

async function loadStoredPmVenueOrders(account: PlatformAccount) {
  const info = await getPlayerOrder({ playerId: account.accountId });
  return stripPolymarketSellOrders(
    (info.orders ?? [])
      .filter(o => String(o.Type ?? "") === "Polymarket")
      .map(o => venueOrderFromOrderRow(o)),
  );
}

registerPolymarketStoredVenueOrdersLoader(loadStoredPmVenueOrders);
