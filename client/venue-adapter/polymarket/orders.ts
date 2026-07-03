import type { VenueOrder } from "@venue/contract";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { PLATFORMS } from "@/shared/platform";
import { POLYMARKET_CLOB_API, POLYMARKET_GAMMA_API } from "./api";
import {
  buildL2HeadersFromAccount,
  collectPolymarketUserAddressesFromAccount,
  normalizeEthAddress,
} from "./l2Auth";
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
  owner?: string;
  maker_address?: string;
  maker_orders?: PolymarketMakerOrderRow[];
}

export interface PolymarketMakerOrderRow {
  order_id?: string;
  owner?: string;
  maker_address?: string;
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

function normalizeConditionId(id: string | undefined | null): string {
  return String(id ?? "").trim().toLowerCase();
}

function marketConditionId(market: PolymarketRawMarket): string {
  return normalizeConditionId(
    String(market.condition_id ?? market.conditionId ?? market.market ?? market.id ?? ""),
  );
}

function gammaUmaResolutionStatus(market: PolymarketRawMarket): string {
  return String(market.umaResolutionStatus ?? market.uma_resolution_status ?? "")
    .trim()
    .toLowerCase();
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

/** UMA 已 finalize，或 outcomePrices 有明确赢家（≥0.99） */
export function isPolymarketMarketResolved(market: PolymarketRawMarket | undefined): boolean {
  if (!market) return false;
  const uma = gammaUmaResolutionStatus(market);
  if (uma === "settled_normal" || uma === "resolved")
    return findPolymarketWinnerIndex(gammaOutcomePrices(market)) >= 0;
  // Polymarket 常保持 closed=false，但 outcomePrices 已接近 0/1
  return findPolymarketWinnerIndex(gammaOutcomePrices(market)) >= 0;
}

/** 已 resolve 市场的赢家 token id */
export function resolvePolymarketWinningAssetId(market: PolymarketRawMarket | undefined): string | null {
  if (!isPolymarketMarketResolved(market))
    return null;
  const prices = gammaOutcomePrices(market!);
  const idx = findPolymarketWinnerIndex(prices);
  if (idx < 0) return null;
  const tokens = gammaTokenIds(market!);
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

/**
 * MAKER 撮合里 maker_orders 含对手挂单；只保留 maker_address / owner 属于本账户的腿。
 * userAddresses 为空时不做地址过滤（单测兼容旧 payload）。
 */
export function isUserMakerOrderLeg(
  mo: PolymarketMakerOrderRow,
  trade: PolymarketTradeRow,
  userAddresses?: ReadonlySet<string>,
): boolean {
  if (!userAddresses || userAddresses.size === 0)
    return true;

  const moMaker = normalizeEthAddress(mo.maker_address);
  if (moMaker)
    return userAddresses.has(moMaker);

  const moOwner = String(mo.owner ?? "").trim();
  const tradeOwner = String(trade.owner ?? "").trim();
  if (moOwner && tradeOwner)
    return moOwner === tradeOwner;

  return false;
}

/** trade 是否关联指定 CLOB orderId（taker 或 maker_orders） */
export function polymarketTradeRefsOrderId(trade: PolymarketTradeRow, orderId: string): boolean {
  const id = String(orderId ?? "").trim().toLowerCase();
  if (!id)
    return false;
  if (String(trade.taker_order_id ?? "").trim().toLowerCase() === id)
    return true;
  const makers = trade.maker_orders;
  if (!Array.isArray(makers))
    return false;
  return makers.some(mo => String(mo.order_id ?? "").trim().toLowerCase() === id);
}

/** 近窗内按 orderId 查已确认 BUY 成交（体育 delayed 订单状态滞后时的兜底） */
export async function fetchPolymarketConfirmedTradeForOrder(
  account: PlatformAccount,
  orderId: string,
  lookbackMs = 10 * 60 * 1000,
): Promise<PolymarketTradeRow | null> {
  const id = String(orderId ?? "").trim();
  if (!id)
    return null;
  const headers = await buildL2HeadersFromAccount(account, "GET", TRADES_PATH);
  if (!headers)
    return null;
  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const afterSec = Math.floor((Date.now() - lookbackMs) / 1000);
  const userAddresses = collectPolymarketUserAddressesFromAccount(account);
  const rawTrades = await fetchTradesSince(gateway, headers, afterSec);
  const flattened = flattenPolymarketTrades(rawTrades, userAddresses);
  for (const trade of flattened) {
    if (!polymarketTradeRefsOrderId(trade, id))
      continue;
    if (String(trade.side ?? "").trim().toUpperCase() !== "BUY")
      continue;
    if (!isPolymarketTradeConfirmed(String(trade.status ?? "")))
      continue;
    return trade;
  }
  return null;
}

/** MAKER 成交在 maker_orders；TAKER 用 taker_order_id */
export function flattenPolymarketTrades(
  trades: PolymarketTradeRow[],
  userAddresses?: ReadonlySet<string>,
): PolymarketTradeRow[] {
  const out: PolymarketTradeRow[] = [];
  for (const trade of trades) {
    const role = String(trade.trader_side ?? trade.type ?? "").trim().toUpperCase();
    if (role.includes("MAKER") && Array.isArray(trade.maker_orders) && trade.maker_orders.length) {
      for (const mo of trade.maker_orders) {
        if (!isUserMakerOrderLeg(mo, trade, userAddresses))
          continue;
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

/** 合并后 price 保留精度（与 CLOB 小数价一致） */
function formatPolymarketVwapPrice(notionalUsdc: number, shares: number): string {
  if (!Number.isFinite(notionalUsdc) || !Number.isFinite(shares) || shares <= 0 || notionalUsdc <= 0)
    return "";
  const vwap = Math.round((notionalUsdc / shares) * 1_000_000) / 1_000_000;
  return String(vwap);
}

/** 同一 taker_order_id 多 bucket 合并；price 为各腿 USDC 加权均价（VWAP） */
export function aggregatePolymarketTrades(trades: PolymarketTradeRow[]): PolymarketTradeRow[] {
  const byOrder = new Map<string, PolymarketTradeRow & { _sizeSum: number; _notionalSum: number }>();
  for (const trade of trades) {
    if (String(trade.side ?? "").trim().toUpperCase() !== "BUY") continue;
    if (!isPolymarketTradeConfirmed(String(trade.status ?? ""))) continue;
    const orderId = String(trade.taker_order_id ?? "").trim();
    if (!orderId) continue;

    const size = Number(trade.size) || 0;
    const price = Number(trade.price);
    const notional = Number.isFinite(price) && price > 0
      ? polymarketBuyStakeUsdc(trade.size, price)
      : 0;
    const matchSec = Number(trade.match_time) || 0;
    const existing = byOrder.get(orderId);
    if (!existing) {
      byOrder.set(orderId, {
        ...trade,
        taker_order_id: orderId,
        _sizeSum: size,
        _notionalSum: notional,
      });
      continue;
    }
    existing._sizeSum += size;
    existing._notionalSum += notional;
    if (matchSec >= (Number(existing.match_time) || 0))
      existing.match_time = trade.match_time;
  }

  return [...byOrder.values()].map(({ _sizeSum, _notionalSum, ...rest }) => {
    const shares = polymarketShareCount(_sizeSum);
    const vwapPrice = formatPolymarketVwapPrice(_notionalSum, shares);
    return {
      ...rest,
      size: String(_sizeSum),
      ...(vwapPrice ? { price: vwapPrice } : {}),
    };
  });
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
  const shares = Math.round(polymarketShareCount(sizeRaw) * 10000) / 10000;
  const pmTokenId = tradeHeldAssetId(trade, market);
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
    pmTokenId: pmTokenId || undefined,
    pmShares: shares > 0 ? shares : undefined,
    pmStakeUsdc: betMoney,
    pmConditionId: marketId || undefined,
  };
  return applyPolymarketSettlement(unsettled, trade, market);
}

/** 汇总已确认 SELL 成交的卖出份数（按 asset_id） */
export function aggregatePolymarketSellSharesByAsset(
  trades: PolymarketTradeRow[],
): Map<string, number> {
  const sold = new Map<string, number>();
  for (const trade of trades) {
    if (String(trade.side ?? "").trim().toUpperCase() !== "SELL")
      continue;
    if (!isPolymarketTradeConfirmed(String(trade.status ?? "")))
      continue;
    const assetId = String(trade.asset_id ?? "").trim();
    if (!assetId)
      continue;
    const shares = polymarketShareCount(trade.size);
    if (shares <= 0)
      continue;
    sold.set(assetId, Math.round(((sold.get(assetId) ?? 0) + shares) * 10000) / 10000);
  }
  return sold;
}

/** 仅对官网同步行 FIFO 扣减 SELL；changmen 行由卖出归因写回，不自动扣 */
export function applyPolymarketExternalSellDeduction(
  orders: VenueOrder[],
  flattenedTrades: PolymarketTradeRow[],
): VenueOrder[] {
  const soldByAsset = aggregatePolymarketSellSharesByAsset(flattenedTrades);
  if (!soldByAsset.size)
    return orders;

  const soldRemaining = new Map(soldByAsset);
  const openExternal = orders
    .filter(o =>
      o.pmOrigin === "external"
      && o.status === "none"
      && o.pmTokenId
      && (o.pmShares ?? 0) > 0,
    )
    .sort((a, b) => a.createAt - b.createAt || a.orderId.localeCompare(b.orderId));

  for (const order of openExternal) {
    const tokenId = String(order.pmTokenId);
    let soldLeft = soldRemaining.get(tokenId) ?? 0;
    if (soldLeft <= 0)
      continue;

    const shares = order.pmShares ?? 0;
    const stake = order.pmStakeUsdc ?? order.betMoney;
    const deduct = Math.min(shares, soldLeft);
    const ratio = shares > 0 ? deduct / shares : 0;
    order.pmShares = Math.round((shares - deduct) * 10000) / 10000;
    order.pmStakeUsdc = Math.round(stake * (1 - ratio) * 10000) / 10000;
    order.betMoney = Math.round(order.betMoney * (1 - ratio) * 10000) / 10000;
    soldRemaining.set(tokenId, Math.round((soldLeft - deduct) * 10000) / 10000);
  }
  return orders;
}

/** @deprecated 使用 applyPolymarketExternalSellDeduction；保留单测兼容 */
export function applyPolymarketNetPositions(
  orders: VenueOrder[],
  flattenedTrades: PolymarketTradeRow[],
): VenueOrder[] {
  for (const order of orders) {
    if (!order.pmOrigin)
      order.pmOrigin = "external";
  }
  return applyPolymarketExternalSellDeduction(orders, flattenedTrades);
}

/** 存在未归因卖出时告警（不改行） */
export function warnPolymarketPositionDrift(
  orders: VenueOrder[],
  flattenedTrades: PolymarketTradeRow[],
): void {
  const soldByAsset = aggregatePolymarketSellSharesByAsset(flattenedTrades);
  if (!soldByAsset.size)
    return;

  for (const [tokenId, soldTotal] of soldByAsset) {
    const attributed = orders
      .filter(o => String(o.pmTokenId) === tokenId)
      .reduce((sum, o) => sum + (o.pmAttributedSellShares ?? 0), 0);
    const openChangmen = orders.filter(o =>
      o.pmOrigin === "changmen"
      && String(o.pmTokenId) === tokenId
      && o.status === "none"
      && (o.pmShares ?? 0) > 0.0001,
    );
    const unexplained = Math.round((soldTotal - attributed) * 10000) / 10000;
    if (unexplained > 0.01 && openChangmen.length > 0) {
      console.warn("[Polymarket] position drift alert: 链上卖出未归因到 changmen 行", {
        tokenId,
        soldTotal,
        attributed,
        unexplained,
        changmenOrderIds: openChangmen.map(o => o.orderId),
      });
    }
  }
}

async function fetchGammaMarketsChunk(params: URLSearchParams): Promise<PolymarketRawMarket[]> {
  try {
    const data = await polymarketPluginGet<unknown>(
      `${POLYMARKET_GAMMA_API}/markets/keyset?${params.toString()}`,
    );
    return unwrapGammaMarkets(data);
  }
  catch (err) {
    console.warn("[Polymarket] Gamma keyset lookup failed, fallback /markets", err);
    const data = await polymarketPluginGet<unknown>(
      `${POLYMARKET_GAMMA_API}/markets?${params.toString()}`,
    );
    return unwrapGammaMarkets(data);
  }
}

function rememberGammaMarket(out: Map<string, PolymarketRawMarket>, market: PolymarketRawMarket): void {
  const key = marketConditionId(market);
  if (key) out.set(key, market);
  for (const tokenId of gammaTokenIds(market)) {
    const tokenKey = normalizeConditionId(tokenId);
    if (tokenKey) out.set(`token:${tokenKey}`, market);
  }
}

function lookupGammaMarket(
  marketMap: Map<string, PolymarketRawMarket>,
  trade: PolymarketTradeRow,
): PolymarketRawMarket | undefined {
  const conditionKey = normalizeConditionId(String(trade.market ?? ""));
  if (conditionKey && marketMap.has(conditionKey))
    return marketMap.get(conditionKey);
  const assetKey = normalizeConditionId(String(trade.asset_id ?? ""));
  if (assetKey && marketMap.has(`token:${assetKey}`))
    return marketMap.get(`token:${assetKey}`);
  return undefined;
}

async function fetchMarketsByConditionIds(
  ids: string[],
  tokenIds: string[] = [],
): Promise<Map<string, PolymarketRawMarket>> {
  const out = new Map<string, PolymarketRawMarket>();
  const unique = [...new Set(ids.map(id => normalizeConditionId(id)).filter(Boolean))];
  const uniqueTokens = [...new Set(tokenIds.map(id => String(id ?? "").trim()).filter(Boolean))];
  if (!unique.length && !uniqueTokens.length) return out;

  const chunkSize = 20;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams({ limit: String(chunk.length) });
    for (const id of chunk)
      params.append("condition_ids", id);
    try {
      for (const market of await fetchGammaMarketsChunk(params))
        rememberGammaMarket(out, market);
    }
    catch (fallbackErr) {
      console.warn("[Polymarket] Gamma market lookup failed", fallbackErr);
    }
  }

  for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
    const chunk = uniqueTokens.slice(i, i + chunkSize);
    const params = new URLSearchParams({ limit: String(chunk.length) });
    for (const id of chunk)
      params.append("clob_token_ids", id);
    try {
      for (const market of await fetchGammaMarketsChunk(params))
        rememberGammaMarket(out, market);
    }
    catch (fallbackErr) {
      console.warn("[Polymarket] Gamma token lookup failed", fallbackErr);
    }
  }

  for (const id of unique) {
    if (out.has(id))
      continue;
    try {
      const clob = await polymarketPluginGet<PolymarketRawMarket>(
        `${POLYMARKET_CLOB_API}/markets/${encodeURIComponent(id)}`,
      );
      const tokens = Array.isArray(clob?.tokens) ? clob.tokens : [];
      if (!tokens.length)
        continue;
      const hasWinner = tokens.some(t => t?.winner === true);
      rememberGammaMarket(out, {
        condition_id: id,
        question: clob?.question,
        title: clob?.question,
        slug: clob?.market_slug,
        closed: clob?.closed === true || hasWinner,
        outcomes: JSON.stringify(tokens.map(t => String(t?.outcome ?? ""))),
        outcomePrices: JSON.stringify(tokens.map(t => String(t?.price ?? 0))),
        clobTokenIds: JSON.stringify(tokens.map(t => String(t?.token_id ?? ""))),
        umaResolutionStatus: hasWinner ? "settled_normal" : undefined,
      });
    }
    catch {
      // Gamma + CLOB 均无时保持 none
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

/** CLOB /data/trades → VenueOrder bundle（不在此做 FIFO；由 getOrders 按 pmOrigin 处理） */
export async function fetchPolymarketVenueOrdersBundle(
  account: PlatformAccount,
): Promise<PolymarketVenueOrdersBundle> {
  const headers = await buildL2HeadersFromAccount(account, "GET", TRADES_PATH);
  if (!headers)
    return { orders: [], flattenedTrades: [] };

  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const afterSec = Math.floor((Date.now() - ORDER_LOOKBACK_MS) / 1000);
  const userAddresses = collectPolymarketUserAddressesFromAccount(account);
  const rawTrades = await fetchTradesSince(gateway, headers, afterSec);
  const flattened = flattenPolymarketTrades(rawTrades, userAddresses);
  const preview = aggregatePolymarketTrades(flattened).filter(
    trade => (Number(trade.match_time) || 0) >= afterSec,
  );
  const marketMap = await fetchMarketsByConditionIds(
    preview.map(trade => String(trade.market ?? "")).filter(Boolean),
    preview.map(trade => String(trade.asset_id ?? "")).filter(Boolean),
  );
  return {
    orders: mapPolymarketTradesToVenueOrders(rawTrades, marketMap, afterSec, userAddresses),
    flattenedTrades: flattened,
  };
}

export interface PolymarketVenueOrdersBundle {
  orders: VenueOrder[];
  flattenedTrades: PolymarketTradeRow[];
}

/** CLOB /data/trades → VenueOrder（近 30 天；Gamma resolve → win/lose） */
export async function fetchPolymarketVenueOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  const bundle = await fetchPolymarketVenueOrdersBundle(account);
  return bundle.orders;
}

/** 纯映射（单测 / 调试）：CLOB trades → VenueOrder */
export function mapPolymarketTradesToVenueOrders(
  trades: PolymarketTradeRow[],
  marketMap: Map<string, PolymarketRawMarket> = new Map(),
  afterSec = 0,
  userAddresses?: ReadonlySet<string>,
): VenueOrder[] {
  const flattened = flattenPolymarketTrades(trades, userAddresses);
  const aggregated = aggregatePolymarketTrades(flattened).filter(
    trade => !afterSec || (Number(trade.match_time) || 0) >= afterSec,
  );
  const orders: VenueOrder[] = [];
  for (const trade of aggregated) {
    const mapped = mapPolymarketTradeToVenueOrder(
      trade,
      lookupGammaMarket(marketMap, trade),
    );
    if (mapped)
      orders.push(mapped);
  }
  return sortVenueOrdersNewestFirst(orders);
}
