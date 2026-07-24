import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { VenueOrder } from "../contract";
import { PLATFORMS } from "../shared/platforms";
import { isPolymarketBetResultFillConfirmed } from "./orderStatus";
import { parsePolymarketBuyOrderFill, scalePolymarketVenueOrdersForDisplay } from "./orders";
import type { PolymarketOrderResponseLike } from "./orderTypes";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface PolymarketMatchedBuyDisplayCtx {
  odds?: number;
  createAt?: number;
  game?: string;
  match?: string;
  bet?: string;
  item?: string;
  pmTokenId?: string;
  pmConditionId?: string;
}

/**
 * 官方 Place Order：FOK BUY `matched` + takingAmount/makingAmount 即为成交真相，
 * 不必等 `/data/trades` 索引。返回 CLOB 口径 USDC（save 前再 scale 一次）。
 */
export function buildPolymarketMatchedBuyVenueOrderUsdc(
  orderId: string,
  response: PolymarketOrderResponseLike | null | undefined,
  ctx: PolymarketMatchedBuyDisplayCtx = {},
): VenueOrder | null {
  const id = String(orderId ?? "").trim();
  if (!id)
    return null;
  const fill = parsePolymarketBuyOrderFill(response);
  if (!(fill.stakeUsdc > 0) || !(fill.shares > 0))
    return null;
  const fillPrice = fill.stakeUsdc / fill.shares;
  if (!(fillPrice > 0 && fillPrice < 1))
    return null;
  const oddsFromFill = round4(1 / fillPrice);
  const odds = Number(ctx.odds) > 0 ? Number(ctx.odds) : oddsFromFill;
  const stake = fill.stakeUsdc;
  return {
    provider: PLATFORMS.Polymarket,
    orderId: id,
    odds,
    createAt: Number(ctx.createAt) > 0 ? Number(ctx.createAt) : Date.now(),
    betMoney: stake,
    reward: round4(stake * odds),
    money: 0,
    status: "none",
    game: String(ctx.game ?? ""),
    match: String(ctx.match ?? ""),
    bet: String(ctx.bet ?? ""),
    item: String(ctx.item ?? ""),
    pmTokenId: String(ctx.pmTokenId ?? "").trim() || undefined,
    pmShares: fill.shares,
    pmFillPrice: round4(fillPrice),
    pmStakeUsdc: stake,
    pmConditionId: String(ctx.pmConditionId ?? "").trim() || undefined,
    pmSide: "buy",
    pmSellState: "open",
    pmOrigin: "changmen",
  };
}

/** 侧栏/RDS 展示口径（CNY），与 getOrders → scale 一致 */
export function buildPolymarketMatchedBuyVenueOrderForSave(
  orderId: string,
  response: PolymarketOrderResponseLike | null | undefined,
  ctx: PolymarketMatchedBuyDisplayCtx = {},
): VenueOrder | null {
  const usdc = buildPolymarketMatchedBuyVenueOrderUsdc(orderId, response, ctx);
  if (!usdc)
    return null;
  return scalePolymarketVenueOrdersForDisplay([usdc])[0] ?? null;
}

/**
 * 从 BetOption + BetResult 拼 matched 买单。
 * delayed / 未成交返回 null（仍走 settlement / trades）。
 */
export function buildPolymarketMatchedBuyVenueOrderFromBet(
  option: BetOption,
  result: BetResult,
): VenueOrder | null {
  if (!isPolymarketBetResultFillConfirmed(result))
    return null;
  const orderId = String(result.orderId ?? "").trim();
  const itemName = option.target === "Home"
    ? option.bet?.homeName
    : option.bet?.awayName;
  return buildPolymarketMatchedBuyVenueOrderForSave(
    orderId,
    result.response as PolymarketOrderResponseLike | undefined,
    {
      odds: Number(option.newOdds) > 0 ? Number(option.newOdds) : Number(option.odds) || 0,
      createAt: Number(result.beginTime) > 0 ? Number(result.beginTime) : Date.now(),
      game: option.match?.game ?? "",
      match: option.match?.title ?? "",
      bet: option.bet?.getBetName?.() ?? option.bet?.name ?? "",
      item: String(itemName ?? "").trim(),
      pmTokenId: String(option.itemId ?? "").trim(),
      pmConditionId: String(option.betId ?? "").trim(),
    },
  );
}
