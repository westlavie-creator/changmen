import type { VenueOrder, VenueOrderStatus } from "@venue/contract";
import type { PolymarketSellState } from "@venue/contract";
import { scaleUsdtToCnyDisplay } from "@changmen/shared/account_multiply";

export interface ChangmenSellAttributionParams {
  sharesSold: number;
  proceedsUsdc: number;
  sellOrderId: string;
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
  PmSide?: "buy" | "sell";
  PmBuyOrderId?: string;
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

/** 卖单成交后仅更新买单剩余份额（不改 BetMoney / Money） */
export function applyBuySharesAfterSell(
  buy: VenueOrder,
  sharesSold: number,
): VenueOrder {
  const shares = Number(buy.pmShares) || 0;
  const stake = Number(buy.pmStakeUsdc ?? buy.betMoney) || 0;
  const sold = Math.min(Math.max(0, sharesSold), shares);
  if (sold <= 0)
    return { ...buy, pmSide: buy.pmSide ?? "buy" };

  const ratio = shares > 0 ? sold / shares : 0;
  const costPortion = round4(stake * ratio);
  const remainingShares = round4(shares - sold);
  const remainingStake = round4(stake - costPortion);
  const pmSellState: PolymarketSellState = remainingShares <= 0 ? "closed" : "partial";

  return {
    ...buy,
    pmSide: "buy",
    pmShares: remainingShares > 0 ? remainingShares : 0,
    pmStakeUsdc: remainingStake > 0 ? remainingStake : 0,
    pmAttributedSellShares: round4((buy.pmAttributedSellShares ?? 0) + sold),
    pmSellState,
  };
}

/** changmen 卖出：新建卖单行（盈亏在卖单 Money 上） */
export function buildChangmenSellVenueOrder(
  buy: VenueOrder,
  params: ChangmenSellAttributionParams,
): VenueOrder {
  const shares = Number(buy.pmShares) || 0;
  const stake = Number(buy.pmStakeUsdc ?? buy.betMoney) || 0;
  const sharesSold = Math.min(Math.max(0, params.sharesSold), shares);
  const ratio = shares > 0 ? sharesSold / shares : 0;
  const costPortion = round4(stake * ratio);
  const proceedsUsdc = round4(Math.max(0, params.proceedsUsdc));
  const profitUsdc = round4(proceedsUsdc - costPortion);
  const sellPrice = sharesSold > 0 ? proceedsUsdc / sharesSold : 0;
  const sellOdds = sellPrice > 0 && sellPrice < 1
    ? round4(1 / sellPrice)
    : buy.odds;

  return {
    provider: "Polymarket",
    orderId: params.sellOrderId,
    odds: sellOdds,
    createAt: Date.now(),
    betMoney: 0,
    reward: 0,
    money: Math.round(scaleUsdtToCnyDisplay(profitUsdc)),
    status: "none",
    game: buy.game,
    match: buy.match,
    bet: buy.bet,
    item: buy.item ? `平仓 ${buy.item}` : "平仓",
    pmTokenId: buy.pmTokenId,
    pmShares: sharesSold,
    pmStakeUsdc: costPortion,
    pmConditionId: buy.pmConditionId,
    pmOrigin: "changmen",
    pmSide: "sell",
    pmBuyOrderId: buy.orderId,
    pmRealizedPnlUsdc: profitUsdc,
  };
}

/** @deprecated 方案1：卖回写买单；保留单测兼容 */
export function applyChangmenSellToVenueOrder(
  order: VenueOrder,
  params: Omit<ChangmenSellAttributionParams, "sellOrderId">,
): VenueOrder {
  const updatedBuy = applyBuySharesAfterSell(order, params.sharesSold);
  const sellId = `legacy-sell-${order.orderId}-${Date.now()}`;
  const sell = buildChangmenSellVenueOrder(order, { ...params, sellOrderId: sellId });
  return {
    ...updatedBuy,
    money: sell.money,
    pmRealizedPnlUsdc: sell.pmRealizedPnlUsdc,
  };
}

export function isPolymarketSellOrder(order: OrderRowLike | VenueOrder): boolean {
  const rowLike = order as OrderRowLike;
  const venueLike = order as VenueOrder;
  return rowLike.PmSide === "sell" || venueLike.pmSide === "sell";
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

  const sharesRaw = rowLike.PmShares ?? venueLike.pmShares;
  const shares = Number(sharesRaw);
  const attributed = Number(rowLike.PmAttributedSellShares ?? venueLike.pmAttributedSellShares) || 0;

  if (attributed > 0 && (!Number.isFinite(shares) || shares <= 0.0001))
    return false;

  if (Number.isFinite(shares))
    return shares > 0.0001;

  return true;
}
