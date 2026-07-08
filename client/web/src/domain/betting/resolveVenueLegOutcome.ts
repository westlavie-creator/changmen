import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ResolveLegOutcomeOpts, VenueLegOutcome, VenueOrder } from "@venue/contract";
import { isA8VenueReject } from "@venue/adaptation/a8LegOutcome";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import { getProvider } from "@/runtime/providers";

export type { ResolveLegOutcomeOpts };

/**
 * 编排层入口：拉订单后委托场馆 provider.resolveLegOutcome。
 * fetchVenueOrders 通常为 accountStore.updateVenueOrders（含 saveOrders / 统计）。
 */
export async function resolveVenueLegOutcome(
  account: PlatformAccount,
  result: BetResult | undefined,
  fetchVenueOrders: () => Promise<VenueOrder[] | undefined>,
  opts: ResolveLegOutcomeOpts = {},
): Promise<VenueLegOutcome> {
  const orders = sortVenueOrdersNewestFirst((await fetchVenueOrders()) ?? []);
  const pullSorted = async () => sortVenueOrdersNewestFirst((await fetchVenueOrders()) ?? []);
  const provider = getProvider(account);
  if (provider?.resolveLegOutcome) {
    const providerOpts: ResolveLegOutcomeOpts = opts.confirmPmPost
      ? { ...opts, fetchVenueOrders: pullSorted }
      : { ...opts, orders };
    return provider.resolveLegOutcome(account, result, providerOpts);
  }
  return {
    orders,
    settlement: isA8VenueReject(orders) ? "unfilled" : "filled",
  };
}
