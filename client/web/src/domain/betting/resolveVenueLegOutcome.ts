import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ResolveLegOutcomeOpts, VenueLegOutcome, VenueOrder } from "@changmen/venue-adapter/contract";
import { isA8VenueReject } from "@changmen/venue-adapter/adaptation";
import { sortVenueOrdersNewestFirst } from "@changmen/venue-adapter/contract";
import { getProvider } from "@/runtime/providers";

export type { ResolveLegOutcomeOpts };

/**
 * 编排层入口：委托场馆 provider.resolveLegOutcome。
 * fetchVenueOrders 通常为 accountStore.updateVenueOrders（含 saveOrders / 统计）。
 *
 * [A8 可证实] tip → wait(q) → updateOrders：有 resolveLegOutcome 时不预拉，
 * 只传 fetchVenueOrders，由场馆层 wait 后再拉（含 A8 / PM / PF / SX）。
 */
export async function resolveVenueLegOutcome(
  account: PlatformAccount,
  result: BetResult | undefined,
  fetchVenueOrders: () => Promise<VenueOrder[] | undefined>,
  opts: ResolveLegOutcomeOpts = {},
): Promise<VenueLegOutcome> {
  const pullSorted = async () => sortVenueOrdersNewestFirst((await fetchVenueOrders()) ?? []);
  const provider = getProvider(account);

  if (provider?.resolveLegOutcome) {
    return provider.resolveLegOutcome(account, result, {
      ...opts,
      fetchVenueOrders: pullSorted,
    });
  }

  const orders = await pullSorted();
  return {
    orders,
    settlement: isA8VenueReject(orders) ? "unfilled" : "filled",
  };
}
