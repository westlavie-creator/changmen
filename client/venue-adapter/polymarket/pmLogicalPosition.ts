import type { VenueOrder, VenueOrderStatus } from "@venue/contract";
import type { PolymarketSellState } from "@venue/contract";
import { scaleUsdtToCnyDisplay, USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";

export interface ChangmenSellAttributionParams {
  sharesSold: number;
  proceedsUsdc: number;
  sellOrderId: string;
  /** 卖出前买单总成本（USDC）；侧栏 pmStakeUsdcFromRow 传入 */
  stakeUsdc?: number;
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

/** 买单成本（USDC）：pmStakeUsdc 优先，否则 BetMoney(CNY) ÷ 7 */
export function resolveBuyStakeUsdc(buy: VenueOrder | OrderRowLike): number {
  const venue = buy as VenueOrder;
  const row = buy as OrderRowLike;
  const stakeUsdc = Number(venue.pmStakeUsdc ?? row.PmStakeUsdc);
  if (Number.isFinite(stakeUsdc) && stakeUsdc > 0)
    return round4(stakeUsdc);
  const betDisplay = Number(venue.betMoney ?? row.BetMoney) || 0;
  if (betDisplay > 0)
    return round4(betDisplay / USDT_CNY_EXCHANGE);
  return 0;
}

/** 卖单展示盈亏（CNY）= 回款 − 成本 */
export function computeSellProfitDisplayCny(proceedsCny: number, costUsdc: number): number {
  const proceeds = Number(proceedsCny) || 0;
  const costCny = scaleUsdtToCnyDisplay(Number(costUsdc) || 0);
  return Math.round(proceeds - costCny);
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

/** 卖单成交后更新买单已卖份额（pmShares 保持 API 成交份数不变） */
export function applyBuySharesAfterSell(
  buy: VenueOrder,
  sharesSold: number,
): VenueOrder {
  const fillShares = resolvePmFillShares(buy);
  const remaining = resolvePmRemainingShares(buy);
  const sold = Math.min(Math.max(0, sharesSold), remaining > 0 ? remaining : fillShares);
  if (sold <= 0)
    return { ...buy, pmSide: buy.pmSide ?? "buy" };

  const stake = resolveBuyStakeUsdc(buy);
  const ratio = fillShares > 0 ? sold / fillShares : 0;
  const costPortion = round4(stake * ratio);
  const remainingStake = round4(stake - costPortion);
  const attributed = round4((buy.pmAttributedSellShares ?? 0) + sold);
  const pmSellState: PolymarketSellState = resolvePmRemainingShares({
    ...buy,
    pmShares: fillShares,
    pmAttributedSellShares: attributed,
  }) <= 0.0001 ? "closed" : "partial";

  return {
    ...buy,
    pmSide: "buy",
    pmShares: fillShares > 0 ? fillShares : buy.pmShares,
    pmStakeUsdc: remainingStake > 0 ? remainingStake : 0,
    pmAttributedSellShares: attributed,
    pmSellState,
  };
}

/** changmen 卖出：新建卖单行（盈亏在卖单 Money 上） */
export function buildChangmenSellVenueOrder(
  buy: VenueOrder,
  params: ChangmenSellAttributionParams,
): VenueOrder {
  const fillShares = resolvePmFillShares(buy);
  const remaining = resolvePmRemainingShares(buy);
  const stake = params.stakeUsdc != null && params.stakeUsdc > 0
    ? round4(params.stakeUsdc)
    : resolveBuyStakeUsdc(buy);
  const sharesSold = Math.min(
    Math.max(0, params.sharesSold),
    remaining > 0 ? remaining : fillShares,
  );
  const ratio = fillShares > 0 ? sharesSold / fillShares : 0;
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
    betMoney: proceedsUsdc,
    reward: 0,
    money: profitUsdc,
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

  return resolvePmRemainingShares(order) > 0.0001;
}
