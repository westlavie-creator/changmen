import type { VenueOrder } from "@venue/contract";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { PLATFORMS } from "@/shared/platform";
import { POLYMARKET_CLOB_API, POLYMARKET_GAMMA_API } from "./api";
import { buildL2HeadersFromAccount } from "./l2Auth";
import { polymarketOrderContextFromMarket, parseJsonArray, type PolymarketRawMarket } from "./parse";
import { polymarketPluginGet } from "./transport";

const TRADES_PATH = "/data/trades";
const TOKEN_MICRO = 1_000_000;
/** 订单 sync + 迟结算缓冲（Phase 2b） */
const ORDER_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TRADE_PAGES = 5;
const NO_MORE_CURSOR = "LTE=";
/** Gamma closed 后 outcomePrices 赢家判定阈值 */
const WINNER_PRICE_MIN = 0.99;

export interface PolymarketTradeRow {
  id?: string;
  taker_order_id?: string;
  market?: string;
  asset_id?: string;
  side?: string;
  size?: string | number;
  price?: string | number;
  status?: string;
  match_time?: string | number;
  outcome?: string;
  bucket_index?: number;
  trader_side?: string;
  type?: string;
  maker_orders?: PolymarketMakerOrderRow[];
}

export interface PolymarketMakerOrderRow {
  order_id?: string;
  matched_amount?: string | number;
  price?: string | number;
  outcome?: string;
  asset_id?: string;
  side?: string;
}

interface PolymarketTradesResponse {
  data?: PolymarketTradeRow[];
  next_cursor?: string;
}

function unwrapGammaMarkets(data: unknown): PolymarketRawMarket[] {
  if (Array.isArray(data))
    return data as PolymarketRawMarket[];
  const wrapped = data as { markets?: unknown; data?: unknown };
  if (Array.isArray(wrapped.markets))
    return wrapped.markets as PolymarketRawMarket[];
  if (Array.isArray(wrapped.data))
    return wrapped.data as PolymarketRawMarket[];
  return [];
}

function marketConditionId(market: PolymarketRawMarket): string {
  return String(market.condition_id ?? market.conditionId ?? market.market ?? market.id ?? "");
}

/** 已成交 trade 是否计入订单列表（含 MINED，排除 FAILED/CANCEL） */
export function isPolymarketTradeConfirmed(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.includes("FAILED") || normalized.includes("CANCEL")) return false;
  return normalized.includes("CONFIRMED")
    || normalized.includes("MATCHED")
    || normalized.includes("MINED")
    || normalized.includes("RETRYING");
}

/** CLOB REST 多为 6 位 micro；WS/部分响应为可读份数 */
export function polymarketBuyStakeUsdc(sizeRaw: string | number | undefined, price: number): number {
  const size = Number(sizeRaw);
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(price) || price <= 0)
    return 0;
  if (size >= 10_000)
    return (size / TOKEN_MICRO) * price;
  return size * price;
}

/** 成交份数（CLOB REST 小数份数 vs micro） */
export function polymarketShareCount(sizeRaw: string | number | undefined): number {
  const size = Number(sizeRaw);
  if (!Number.isFinite(size) || size <= 0) return 0;
  if (size >= 10_000) return size / TOKEN_MICRO;
  return size;
}

function gammaOutcomePrices(market: PolymarketRawMarket): number[] {
  return parseJsonArray(market.outcomePrices ?? market.outcome_prices).map(Number);
}

function gammaTokenIds(market: PolymarketRawMarket): string[] {
  return parseJsonArray(market.clobTokenIds ?? market.clob_token_ids);
}

/** Gamma closed 且 outcomePrices 有明确赢家 */
export function findPolymarketWinnerIndex(prices: number[]): number {
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (Number.isFinite(price) && price >= WINNER_PRICE_MIN)
      return i;
  }
  return -1;
}

export function isPolymarketMarketResolved(market: PolymarketRawMarket | undefined): boolean {
  if (!market?.closed) return false;
  return findPolymarketWinnerIndex(gammaOutcomePrices(market)) >= 0;
}

/** 已 resolve 市场的赢家 token id */
export function resolvePolymarketWinningAssetId(market: PolymarketRawMarket | undefined): string | null {
  if (!market?.closed) return null;
  const prices = gammaOutcomePrices(market);
  const idx = findPolymarketWinnerIndex(prices);
  if (idx < 0) return null;
  const tokens = gammaTokenIds(market);
  return tokens[idx] ?? null;
}

function tradeHeldAssetId(trade: PolymarketTradeRow, market?: PolymarketRawMarket): string {
  const assetId = String(trade.asset_id ?? "").trim();
  if (assetId) return assetId;
  const outcome = String(trade.outcome ?? "").trim();
  if (!market || !outcome) return "";
  const outcomes = parseJsonArray(market.outcomes);
  const idx = outcomes.findIndex(name => name.trim() === outcome);
  if (idx < 0) return "";
  return gammaTokenIds(market)[idx] ?? "";
}

/** Gamma 结算：none → win/lose + money/reward */
export function applyPolymarketSettlement(
  order: VenueOrder,
  trade: PolymarketTradeRow,
  market?: PolymarketRawMarket,
): VenueOrder {
  const winningAssetId = resolvePolymarketWinningAssetId(market);
  if (!winningAssetId) return order;

  const heldAssetId = tradeHeldAssetId(trade, market);
  if (!heldAssetId) return order;

  const shares = polymarketShareCount(trade.size);
  const stake = order.betMoney;
  if (shares <= 0 || stake <= 0) return order;

  if (heldAssetId === winningAssetId) {
    const reward = Math.round(shares * 10000) / 10000;
    const money = Math.round((reward - stake) * 10000) / 10000;
    return { ...order, status: "win", reward, money };
  }

  return { ...order, status: "lose", reward: 0, money: -stake };
}

/** MAKER 成交在 maker_orders；TAKER 用 taker_order_id */
export function flattenPolymarketTrades(trades: PolymarketTradeRow[]): PolymarketTradeRow[] {
  const out: PolymarketTradeRow[] = [];
  for (const trade of trades) {
    const role = String(trade.trader_side ?? trade.type ?? "").trim().toUpperCase();
    if (role.includes("MAKER") && Array.isArray(trade.maker_orders) && trade.maker_orders.length) {
      for (const mo of trade.maker_orders) {
        const orderId = String(mo.order_id ?? "").trim();
        if (!orderId) continue;
        out.push({
          ...trade,
          taker_order_id: orderId,
          size: mo.matched_amount ?? trade.size,
          price: mo.price ?? trade.price,
          outcome: mo.outcome ?? trade.outcome,
          asset_id: mo.asset_id ?? trade.asset_id,
          side: mo.side ?? trade.side ?? "BUY",
        });
      }
      continue;
    }
    const orderId = String(trade.taker_order_id ?? "").trim();
    if (orderId)
      out.push(trade);
  }
  return out;
}

/** 同一 taker_order_id 多 bucket 合并 */
export function aggregatePolymarketTrades(trades: PolymarketTradeRow[]): PolymarketTradeRow[] {
  const byOrder = new Map<string, PolymarketTradeRow & { _sizeSum: number }>();
  for (const trade of trades) {
    if (String(trade.side ?? "").trim().toUpperCase() !== "BUY") continue;
    if (!isPolymarketTradeConfirmed(String(trade.status ?? ""))) continue;
    const orderId = String(trade.taker_order_id ?? "").trim();
    if (!orderId) continue;

    const size = Number(trade.size) || 0;
    const matchSec = Number(trade.match_time) || 0;
    const existing = byOrder.get(orderId);
    if (!existing) {
      byOrder.set(orderId, { ...trade, taker_order_id: orderId, _sizeSum: size });
      continue;
    }
    existing._sizeSum += size;
    if (matchSec >= (Number(existing.match_time) || 0))
      existing.match_time = trade.match_time;
  }

  return [...byOrder.values()].map(({ _sizeSum, ...rest }) => ({
    ...rest,
    size: String(_sizeSum),
  }));
}

export function mapPolymarketTradeToVenueOrder(
  trade: PolymarketTradeRow,
  market?: PolymarketRawMarket,
): VenueOrder | null {
  const orderId = String(trade.taker_order_id ?? trade.id ?? "").trim();
  if (!orderId) return null;

  const price = Number(trade.price);
  const sizeRaw = trade.size;
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return null;

  const betMoney = Math.round(polymarketBuyStakeUsdc(sizeRaw, price) * 10000) / 10000;
  if (betMoney <= 0) return null;

  const odds = Math.round((1 / price) * 10000) / 10000;
  const ctx = market
    ? polymarketOrderContextFromMarket(market)
    : { game: "", match: "", bet: "" };
  const marketId = String(trade.market ?? "").trim();
  const match = ctx.match || (marketId ? `${marketId.slice(0, 10)}…` : "");

  const unsettled: VenueOrder = {
    provider: PLATFORMS.Polymarket,
    orderId,
    odds,
    createAt: (Number(trade.match_time) || 0) * 1000,
    betMoney,
    reward: Math.round(betMoney * odds * 10000) / 10000,
    money: 0,
    status: "none",
    game: ctx.game,
    match,
    bet: ctx.bet,
    item: String(trade.outcome ?? "").trim(),
  };
  return applyPolymarketSettlement(unsettled, trade, market);
}

async function fetchMarketsByConditionIds(ids: string[]): Promise<Map<string, PolymarketRawMarket>> {
  const out = new Map<string, PolymarketRawMarket>();
  const unique = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  if (!unique.length) return out;

  const chunkSize = 20;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    for (const id of chunk)
      params.append("condition_ids", id);
    try {
      const data = await polymarketPluginGet<unknown>(
        `${POLYMARKET_GAMMA_API}/markets?${params.toString()}`,
      );
      for (const market of unwrapGammaMarkets(data)) {
        const key = marketConditionId(market);
        if (key) out.set(key, market);
      }
    }
    catch (err) {
      console.warn("[Polymarket] Gamma market lookup failed", err);
    }
  }
  return out;
}

async function fetchTradesSince(
  gateway: string,
  headers: Record<string, string>,
  afterSec: number,
): Promise<PolymarketTradeRow[]> {
  const all: PolymarketTradeRow[] = [];
  let nextCursor: string | undefined;

  for (let page = 0; page < MAX_TRADE_PAGES; page++) {
    const params = new URLSearchParams({ after: String(afterSec) });
    if (nextCursor)
      params.set("next_cursor", nextCursor);
    const data = await polymarketPluginGet<PolymarketTradesResponse>(
      `${gateway}${TRADES_PATH}?${params.toString()}`,
      { headers },
    );
    const batch = Array.isArray(data?.data) ? data.data : [];
    all.push(...batch);
    nextCursor = data?.next_cursor;
    if (!nextCursor || nextCursor === NO_MORE_CURSOR || batch.length === 0)
      break;
  }
  return all;
}

/** CLOB /data/trades → VenueOrder（近 30 天；Gamma resolve → win/lose） */
export async function fetchPolymarketVenueOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  const headers = await buildL2HeadersFromAccount(account, "GET", TRADES_PATH);
  if (!headers) return [];

  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const afterSec = Math.floor((Date.now() - ORDER_LOOKBACK_MS) / 1000);
  const rawTrades = await fetchTradesSince(gateway, headers, afterSec);
  const preview = aggregatePolymarketTrades(flattenPolymarketTrades(rawTrades)).filter(
    trade => (Number(trade.match_time) || 0) >= afterSec,
  );
  const marketMap = await fetchMarketsByConditionIds(
    preview.map(trade => String(trade.market ?? "")).filter(Boolean),
  );
  return mapPolymarketTradesToVenueOrders(rawTrades, marketMap, afterSec);
}

/** 纯映射（单测 / 调试）：CLOB trades → VenueOrder */
export function mapPolymarketTradesToVenueOrders(
  trades: PolymarketTradeRow[],
  marketMap: Map<string, PolymarketRawMarket> = new Map(),
  afterSec = 0,
): VenueOrder[] {
  const flattened = flattenPolymarketTrades(trades);
  const aggregated = aggregatePolymarketTrades(flattened).filter(
    trade => !afterSec || (Number(trade.match_time) || 0) >= afterSec,
  );
  const orders: VenueOrder[] = [];
  for (const trade of aggregated) {
    const mapped = mapPolymarketTradeToVenueOrder(trade, marketMap.get(String(trade.market ?? "")));
    if (mapped)
      orders.push(mapped);
  }
  return sortVenueOrdersNewestFirst(orders);
}
