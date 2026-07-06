import type { VenueOrder, VenueOrderStatus } from "@venue/contract";
import type { PolymarketSellState } from "@venue/contract";
import { getExchange, Currency } from "@changmen/shared/currency";

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
  PmSide?: "buy" | "sell";
  PmBuyOrderId?: string;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 买单/API 成交总份数（pmShares 只存官方 fill，不随平仓扣减） */
export function resolvePmFillShares(order: OrderRowLike | VenueOrder): number {
  const row = order as OrderRowLike;
  const venue = order as VenueOrder;
  return Number(row.PmShares ?? venue.pmShares) || 0;
}

/** 买单剩余可卖份数 = fill − 已归因卖出 */
export function resolvePmRemainingShares(order: OrderRowLike | VenueOrder): number {
  const fill = resolvePmFillShares(order);
  const attributed = Number(
    (order as OrderRowLike).PmAttributedSellShares
    ?? (order as VenueOrder).pmAttributedSellShares,
  ) || 0;
  return round4(Math.max(0, fill - attributed));
}

/** 买单成本（USDC）：pmStakeUsdc 优先，否则 BetMoney(CNY) ÷ exchange */
export function resolveBuyStakeUsdc(buy: VenueOrder | OrderRowLike): number {
  const venue = buy as VenueOrder;
  const row = buy as OrderRowLike;
  const stakeUsdc = Number(venue.pmStakeUsdc ?? row.PmStakeUsdc);
  if (Number.isFinite(stakeUsdc) && stakeUsdc > 0)
    return round4(stakeUsdc);
  const betDisplay = Number(venue.betMoney ?? row.BetMoney) || 0;
  if (betDisplay > 0)
    return round4(betDisplay / getExchange(Currency.USDT));
  return 0;
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

function resolvePmSide(row: OrderRowLike): "buy" | "sell" {
  if (row.PmSide === "sell")
    return "sell";
  return "buy";
}

/** 订单侧栏行 → VenueOrder */
export function venueOrderFromOrderRow(row: OrderRowLike): VenueOrder {
  const betMoney = Number(row.BetMoney) || 0;
  const odds = Number(row.Odds) || 0;
  const pmSide = resolvePmSide(row);
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
    pmSellState: row.PmSellState ?? (pmSide === "buy" ? "open" : undefined),
    pmSide,
    pmBuyOrderId: row.PmBuyOrderId,
  };
}

export function isPolymarketSellOrder(order: OrderRowLike | VenueOrder): boolean {
  const rowLike = order as OrderRowLike;
  const venueLike = order as VenueOrder;
  return rowLike.PmSide === "sell" || venueLike.pmSide === "sell";
}

/** changmen 不做卖出：同步/展示/落库均排除卖单 */
export function stripPolymarketSellOrders<T extends OrderRowLike | VenueOrder>(orders: T[]): T[] {
  return orders.filter(o => !isPolymarketSellOrder(o));
}

export function hasChangmenLogicalSell(order: VenueOrder): boolean {
  return order.pmSide === "sell"
    || (order.pmOrigin === "changmen"
      && ((order.pmAttributedSellShares ?? 0) > 0
        || order.pmSellState === "partial"
        || order.pmSellState === "closed"));
}

/** 仍有未平仓份额；卖单永远不算持仓 */
export function hasOpenPolymarketPosition(order: OrderRowLike | VenueOrder): boolean {
  if (isPolymarketSellOrder(order))
    return false;

  const rowLike = order as OrderRowLike;
  const venueLike = order as VenueOrder;
  const status = String(rowLike.Status ?? venueLike.status ?? "").toLowerCase();
  if (status && status !== "none")
    return false;

  const state = rowLike.PmSellState ?? venueLike.pmSellState;
  if (state === "closed" || state === "settled")
    return false;

  const fill = resolvePmFillShares(order);
  if (fill <= 0.0001)
    return true;

  return resolvePmRemainingShares(order) > 0.0001;
}
