import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { getPlayerOrder } from "@/api/chat";
import {
  fetchPolymarketVenueOrdersBundle,
  finalizePolymarketVenueOrders,
  scalePolymarketVenueOrdersForDisplay,
} from "@venue/polymarket/orders";
import { venueOrderFromOrderRow } from "@venue/polymarket/pmLogicalPosition";

async function loadStoredPmVenueOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  try {
    const info = await getPlayerOrder({ playerId: account.accountId });
    return (info.orders ?? [])
      .filter(o => String(o.Type ?? "") === "Polymarket")
      .map(o => venueOrderFromOrderRow(o));
  }
  catch (err) {
    console.warn("[Polymarket] loadStoredPmVenueOrders failed", err);
    return [];
  }
}

/** CLOB + RDS changmen 合并后 scale；updateVenueOrders 专用 */
export async function fetchPolymarketVenueOrdersForSync(
  account: PlatformAccount,
): Promise<VenueOrder[]> {
  const [{ orders }, stored] = await Promise.all([
    fetchPolymarketVenueOrdersBundle(account),
    loadStoredPmVenueOrders(account),
  ]);
  const finalized = finalizePolymarketVenueOrders(orders, account.accountId, stored);
  return scalePolymarketVenueOrdersForDisplay(finalized);
}
