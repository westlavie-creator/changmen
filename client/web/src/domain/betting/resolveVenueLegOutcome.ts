import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ResolveLegOutcomeOpts, VenueLegOutcome, VenueOrder } from "@changmen/venue-adapter/contract";
import { isA8VenueReject } from "@changmen/venue-adapter/adaptation";
import { sortVenueOrdersNewestFirst } from "@changmen/venue-adapter/contract";
import { getProvider } from "@/runtime/providers";

export type { ResolveLegOutcomeOpts };

/**
 * 编排层入口：委托场馆 provider.resolveLegOutcome。
 * fetchVenueOrders 通常为 accountStore.updateVenueOrders（非 PF 含 saveOrders；PF 只拉单统计）。
 *
 * [changmen 扩展] `confirmPmPost`：不在入口预拉；由 PM `resolvePolymarketLegOutcome`
 * 按需拉单（fill confirmed 快路径仅一次；delayed 在 settlement 后再拉）。
 * A8 场馆：仍预拉后传入 `orders`（拒单等待在 a8LegOutcome 内）。
 */
export async function resolveVenueLegOutcome(
  account: PlatformAccount,
  result: BetResult | undefined,
  fetchVenueOrders: () => Promise<VenueOrder[] | undefined>,
  opts: ResolveLegOutcomeOpts = {},
): Promise<VenueLegOutcome> {
  const pullSorted = async () => sortVenueOrdersNewestFirst((await fetchVenueOrders()) ?? []);
  const provider = getProvider(account);

  if (provider?.resolveLegOutcome && opts.confirmPmPost) {
    return provider.resolveLegOutcome(account, result, {
      ...opts,
      fetchVenueOrders: pullSorted,
    });
  }

  const orders = await pullSorted();
  if (provider?.resolveLegOutcome) {
    return provider.resolveLegOutcome(account, result, { ...opts, orders });
  }
  return {
    orders,
    settlement: isA8VenueReject(orders) ? "unfilled" : "filled",
  };
}
