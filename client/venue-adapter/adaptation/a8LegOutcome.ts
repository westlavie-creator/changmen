import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type {
  PlatformProvider,
  ResolveLegOutcomeOpts,
  VenueLegOutcome,
  VenueOrder,
} from "../contract";
import { sortVenueOrdersNewestFirst } from "../contract";
import { venueRejectWaitBeforePoll } from "../shared/rejectWait";

/** [changmen 扩展] wait 后若仍空/none，再短轮询次数与间隔 */
const A8_UNCERTAIN_REPOLL_EXTRA = 2;
const A8_UNCERTAIN_REPOLL_INTERVAL_MS = 1000;

/** [A8 可证实] 场馆订单列表首条 status 为 reject 视为拒单 */
export function isA8VenueReject(orders: VenueOrder[]): boolean {
  return orders.length > 0 && orders[0].status === "reject";
}

/** 空列表或最新单仍为受理中：尚不能按 A8 单次快照放心定案 */
function isA8OutcomeUncertain(orders: VenueOrder[]): boolean {
  return orders.length === 0 || orders[0].status === "none";
}

/** 仅当能拿到更新鲜的列表时才短轮询（显式 opts.orders 快照不重拉） */
function canRefreshVenueOrders(
  provider: PlatformProvider,
  opts?: ResolveLegOutcomeOpts,
): boolean {
  if (opts?.fetchVenueOrders)
    return true;
  if (opts?.orders)
    return false;
  return Boolean(provider.getOrders);
}

async function pullVenueOrders(
  provider: PlatformProvider,
  account: PlatformAccount,
  opts?: ResolveLegOutcomeOpts,
): Promise<VenueOrder[]> {
  // 编排层回调（含 saveOrders）；须在 wait 之后调用，避免预拉快照锁死拒单检测
  if (opts?.fetchVenueOrders)
    return sortVenueOrdersNewestFirst(await opts.fetchVenueOrders());
  if (opts?.orders)
    return sortVenueOrdersNewestFirst(opts.orders);
  if (!provider.getOrders)
    return [];
  return sortVenueOrdersNewestFirst(await provider.getOrders(account));
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * A8 场馆订单状态层：仅 `orders[0].status`。
 * [changmen 扩展] wait 后若空/none，再短轮询以降低异步拒单漏检。
 */
export async function resolveA8VenueLegOutcome(
  provider: PlatformProvider,
  account: PlatformAccount,
  _result?: BetResult,
  opts?: ResolveLegOutcomeOpts,
): Promise<VenueLegOutcome> {
  await venueRejectWaitBeforePoll(opts?.rejectWaitSec);
  let orders = await pullVenueOrders(provider, account, opts);

  if (canRefreshVenueOrders(provider, opts)) {
    for (let i = 0; i < A8_UNCERTAIN_REPOLL_EXTRA && isA8OutcomeUncertain(orders); i += 1) {
      await sleepMs(A8_UNCERTAIN_REPOLL_INTERVAL_MS);
      orders = await pullVenueOrders(provider, account, opts);
    }
  }

  return {
    orders,
    settlement: isA8VenueReject(orders) ? "unfilled" : "filled",
  };
}

/** 为未实现 resolveLegOutcome 的 A8 provider 注入默认拒单检测 */
export function withA8ResolveLegOutcome(provider: PlatformProvider): PlatformProvider {
  if (provider.resolveLegOutcome || !provider.getOrders)
    return provider;
  return {
    ...provider,
    resolveLegOutcome(account, result, opts) {
      return resolveA8VenueLegOutcome(provider, account, result, opts);
    },
  };
}
