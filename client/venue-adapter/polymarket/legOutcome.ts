import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { ResolveLegOutcomeOpts, VenueLegOutcome, VenueLegSettlement, VenueOrder } from "@venue/contract";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import { fetchPolymarketConfirmedTradeForOrder } from "./orders";
import {
  applyPolymarketSettlementToResult,
  buildPolymarketRejectVenueOrder,
  isPolymarketBetResultFillConfirmed,
  isPolymarketOrderIdRejected,
} from "./orderStatus";
import { settlePolymarketDelayedOrder } from "./orderSettlement";
import { awaitPolymarketSettlementJob } from "./settlementJob";
import type { PolymarketPollOutcome } from "./orderTypes";

export interface PolymarketLegOutcomeDeps {
  fetchVenueOrders: () => Promise<VenueOrder[]>;
}

function pollOutcomeToSettlement(outcome: PolymarketPollOutcome): VenueLegSettlement {
  if (outcome === "matched")
    return "filled";
  if (outcome === "timeout")
    return "timeout";
  return "unfilled";
}

function rejectOrders(
  account: PlatformAccount,
  result: BetResult,
  settlement: "unfilled" | "timeout",
): VenueOrder[] {
  return [buildPolymarketRejectVenueOrder(account, result, settlement)];
}

async function fetchSortedVenueOrders(
  deps: PolymarketLegOutcomeDeps,
): Promise<VenueOrder[]> {
  return sortVenueOrdersNewestFirst(await deps.fetchVenueOrders());
}

function needsPmSettlementPoll(result: BetResult): boolean {
  if (result.pending)
    return true;
  const status = String(
    (result.response as { status?: string } | undefined)?.status ?? "",
  ).trim().toLowerCase();
  return status === "delayed" || status === "live";
}

async function resolvePolymarketPostAcceptedOutcome(
  account: PlatformAccount,
  result: BetResult,
  deps: PolymarketLegOutcomeDeps,
): Promise<VenueLegOutcome> {
  if (result.reject) {
    const settlement = result.reject === "timeout" ? "timeout" : "unfilled";
    return {
      orders: rejectOrders(account, result, settlement),
      settlement,
    };
  }

  if (isPolymarketBetResultFillConfirmed(result)) {
    return {
      orders: await fetchSortedVenueOrders(deps),
      settlement: "filled",
    };
  }

  const trade = await fetchPolymarketConfirmedTradeForOrder(
    account,
    result.orderId!,
    10 * 60 * 1000,
  );
  if (trade) {
    return {
      orders: await fetchSortedVenueOrders(deps),
      settlement: "filled",
    };
  }

  const orderId = String(result.orderId ?? "").trim();
  if (orderId && needsPmSettlementPoll(result)) {
    const settled = await settlePolymarketDelayedOrder(account, orderId);
    applyPolymarketSettlementToResult(result, settled.outcome, settled.row);
    const settlement = pollOutcomeToSettlement(settled.outcome);
    if (settlement === "filled") {
      return {
        orders: await fetchSortedVenueOrders(deps),
        settlement,
      };
    }
    return {
      orders: rejectOrders(
        account,
        result,
        settlement === "timeout" ? "timeout" : "unfilled",
      ),
      settlement,
    };
  }

  const orders = await fetchSortedVenueOrders(deps);
  const listRejected = isPolymarketOrderIdRejected(orders, result.orderId)
    || Boolean(result.reject);
  return {
    orders,
    settlement: listRejected ? "unfilled" : "filled",
  };
}

/**
 * PM 订单状态层：POST 受理后确认最终 filled / unfilled / timeout。
 * 编排层（套利收尾、补单 jb、手动下注）统一调用此函数。
 *
 * [changmen 扩展] fill confirmed（matched+takingAmount）→ 直接 filled，不进 delayed poll；
 * 仅拉单一次供绑单。契约见 docs/ARB_VENUE_ORCH_CONTRACT.md。
 */
export async function resolvePolymarketLegOutcome(
  account: PlatformAccount,
  result: BetResult,
  deps: PolymarketLegOutcomeDeps,
): Promise<VenueLegOutcome> {
  if (result.pending && result.orderId) {
    const jobResult = await awaitPolymarketSettlementJob(account, result.orderId);
    const { outcome, row } = jobResult
      ?? await settlePolymarketDelayedOrder(account, result.orderId);
    applyPolymarketSettlementToResult(result, outcome, row);
    const settlement = pollOutcomeToSettlement(outcome);
    if (settlement === "filled") {
      return {
        orders: await fetchSortedVenueOrders(deps),
        settlement,
      };
    }
    return {
      orders: rejectOrders(
        account,
        result,
        settlement === "timeout" ? "timeout" : "unfilled",
      ),
      settlement,
    };
  }

  if (result.success && result.orderId)
    return resolvePolymarketPostAcceptedOutcome(account, result, deps);

  const orders = await fetchSortedVenueOrders(deps);
  const listRejected = isPolymarketOrderIdRejected(orders, result.orderId);
  return {
    orders,
    settlement: listRejected ? "unfilled" : "filled",
  };
}

/** PM 列表模式：getOrders + orderId 判拒，不轮询 settle */
export function resolvePolymarketListLegOutcome(
  orders: VenueOrder[],
  result?: BetResult,
): VenueLegOutcome {
  const sorted = sortVenueOrdersNewestFirst(orders);
  if (result?.success) {
    const orderId = String(result.orderId ?? "").trim();
    if (orderId) {
      return {
        orders: sorted,
        settlement: isPolymarketOrderIdRejected(sorted, orderId) ? "unfilled" : "filled",
      };
    }
  }
  const listRejected = sorted.length > 0 && sorted[0].status === "reject";
  return {
    orders: sorted,
    settlement: listRejected ? "unfilled" : "filled",
  };
}

export async function resolvePolymarketProviderLegOutcome(
  getOrders: (account: PlatformAccount) => Promise<VenueOrder[]>,
  account: PlatformAccount,
  result?: BetResult,
  opts?: ResolveLegOutcomeOpts,
): Promise<VenueLegOutcome> {
  const pull = async () => {
    if (opts?.fetchVenueOrders)
      return sortVenueOrdersNewestFirst(await opts.fetchVenueOrders());
    if (opts?.orders)
      return sortVenueOrdersNewestFirst(opts.orders);
    return sortVenueOrdersNewestFirst(await getOrders(account));
  };

  if (result && opts?.confirmPmPost) {
    return resolvePolymarketLegOutcome(account, result, { fetchVenueOrders: pull });
  }

  return resolvePolymarketListLegOutcome(await pull(), result);
}
