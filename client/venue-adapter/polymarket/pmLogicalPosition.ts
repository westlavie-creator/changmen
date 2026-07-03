import type { VenueOrder, VenueOrderStatus } from "@venue/contract";
import type { PolymarketSellState } from "@venue/contract";
import { scaleUsdtToCnyDisplay } from "@changmen/shared/account_multiply";

export interface ChangmenSellAttributionParams {
  sharesSold: number;
  proceedsUsdc: number;
}

export interface OrderRowLike {
  OrderID?: number | string;
  Type?: string;
  Match?: string;
  Bet?: string;
  Item?: string;
  Odds?: number;
  BetMoney?: number;
  Money?: number;
  Status?: string;
  CreateAt?: number;
  PmTokenId?: string;
  PmShares?: number;
  PmStakeUsdc?: number;
  PmConditionId?: string;
  PmOrigin?: "changmen" | "external";
  PmAttributedSellShares?: number;
  PmRealizedPnlUsdc?: number;
  PmSellState?: PolymarketSellState;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function statusFromRow(status?: string): VenueOrderStatus {
  const s = String(status ?? "").toLowerCase();
  if (s === "win")
    return "win";
  if (s === "lose")
    return "lose";
  if (s === "reject")
    return "reject";
  if (s === "return")
    return "return";
  if (s === "pending")
    return "pending";
  return "none";
}

/** 订单侧栏行 → VenueOrder（卖出归因写回用） */
export function venueOrderFromOrderRow(row: OrderRowLike): VenueOrder {
  const betMoney = Number(row.BetMoney) || 0;
  const odds = Number(row.Odds) || 0;
  return {
    provider: "Polymarket",
    orderId: String(row.OrderID ?? "").trim(),
    odds,
    createAt: Number(row.CreateAt) || Date.now(),
    betMoney,
    reward: round4(betMoney * odds),
    money: Number(row.Money) || 0,
    status: statusFromRow(row.Status),
    game: "",
    match: String(row.Match ?? ""),
    bet: String(row.Bet ?? ""),
    item: String(row.Item ?? ""),
    pmTokenId: row.PmTokenId,
    pmShares: row.PmShares,
    pmStakeUsdc: row.PmStakeUsdc,
    pmConditionId: row.PmConditionId,
    pmOrigin: row.PmOrigin,
    pmAttributedSellShares: row.PmAttributedSellShares,
    pmRealizedPnlUsdc: row.PmRealizedPnlUsdc,
    pmSellState: row.PmSellState ?? "open",
  };
}

/** changmen 按行卖出：更新份额、已实现盈亏与 Money（未结算持仓不计浮盈） */
export function applyChangmenSellToVenueOrder(
  order: VenueOrder,
  params: ChangmenSellAttributionParams,
): VenueOrder {
  const shares = Number(order.pmShares) || 0;
  const stake = Number(order.pmStakeUsdc ?? order.betMoney) || 0;
  const sharesSold = Math.min(Math.max(0, params.sharesSold), shares);
  if (sharesSold <= 0)
    return order;

  const ratio = shares > 0 ? sharesSold / shares : 0;
  const costPortion = round4(stake * ratio);
  const proceedsUsdc = round4(Math.max(0, params.proceedsUsdc));
  const realizedDelta = round4(proceedsUsdc - costPortion);
  const pmRealizedPnlUsdc = round4((order.pmRealizedPnlUsdc ?? 0) + realizedDelta);
  const remainingShares = round4(shares - sharesSold);
  const remainingStake = round4(stake - costPortion);
  const pmSellState: PolymarketSellState = remainingShares <= 0 ? "closed" : "partial";

  return {
    ...order,
    pmOrigin: "changmen",
    pmShares: remainingShares > 0 ? remainingShares : 0,
    pmStakeUsdc: remainingStake > 0 ? remainingStake : 0,
    betMoney: round4(order.betMoney * (1 - ratio)),
    pmAttributedSellShares: round4((order.pmAttributedSellShares ?? 0) + sharesSold),
    pmRealizedPnlUsdc,
    pmSellState,
    money: Math.round(scaleUsdtToCnyDisplay(pmRealizedPnlUsdc)),
  };
}

export function hasChangmenLogicalSell(order: VenueOrder): boolean {
  return order.pmOrigin === "changmen"
    && ((order.pmAttributedSellShares ?? 0) > 0
      || order.pmSellState === "partial"
      || order.pmSellState === "closed");
}
