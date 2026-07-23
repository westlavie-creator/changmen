/**
 * 用户侧 PF API DTO：changmen 处理后的结果，不含官网原文 / 官网 fee / 链上实付。
 * 管理端仍走 rowToOrder / mapAdminOrderRow 完整字段。
 *
 * 用户可见生命周期见 `pf_lifecycle.js`（open|closed|settled；closing 对外折叠为 open）。
 */

import { toUserPfSellState } from "./pf_lifecycle.js";

/** @type {ReadonlySet<string>} */
const USER_PF_VENUE_ORDER_KEYS = new Set([
  "provider",
  "orderId",
  "odds",
  "createAt",
  "betMoney",
  "reward",
  "money",
  "status",
  "game",
  "match",
  "bet",
  "item",
  "link",
  "pfSide",
  "pfBuyOrderId",
  "pfSellState",
  "pfSellOrderId",
  "pfSellProceeds",
  "pfShares",
  "pfHoldShares",
  "pfNotionalUsdt",
  "pfBookPrice",
  "pfTokenId",
  "pfMarketId",
]);

/**
 * VenueOrder → 用户可读订单（白名单）。
 * @param {object|null|undefined} order
 * @returns {object|null}
 */
export function toUserPfVenueOrder(order) {
  if (!order || typeof order !== "object")
    return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of USER_PF_VENUE_ORDER_KEYS) {
    if (order[key] !== undefined)
      out[key] = order[key];
  }
  const sellState = toUserPfSellState(order);
  if (sellState)
    out.pfSellState = sellState;
  else
    delete out.pfSellState;
  return out;
}

/**
 * @param {object|null|undefined} order
 * @returns {object[]}
 */
export function toUserPfVenueOrders(orders) {
  if (!Array.isArray(orders))
    return [];
  return orders.map(toUserPfVenueOrder).filter(Boolean);
}

/**
 * Pf_RefreshBalance / 余额发布回包：只含账本字段，不含 ACCOUNT 整行配置。
 * PredictFun 不用 A8 credit，余额只看 balance（RDS total_balance）。
 * @param {Record<string, unknown>} info
 */
export function toUserPfBalanceInfo(info) {
  if (!info || typeof info !== "object")
    return info;
  /** @type {Record<string, unknown>} */
  const out = {
    accountId: Number(info.accountId),
    balance: Number(info.balance) || 0,
    currency: String(info.currency || "USDT"),
  };
  if (info.totalProfit != null)
    out.totalProfit = Number(info.totalProfit) || 0;
  if (info.unsettle != null)
    out.unsettle = Number(info.unsettle) || 0;
  if (info.orderCount != null)
    out.orderCount = Number(info.orderCount) || 0;
  if (info.settledPnl != null)
    out.settledPnl = Number(info.settledPnl) || 0;
  if (info.openStake != null)
    out.openStake = Number(info.openStake) || 0;
  return out;
}

/**
 * Pf_SubmitOrder 成功回包：仅受理结果 + changmen 报价，不含官网 result。
 * @param {Record<string, unknown>} info
 */
export function toUserPfSubmitOrderInfo(info) {
  if (!info || typeof info !== "object")
    return info;
  return {
    orderId: info.orderId,
    code: info.code ?? null,
    bookPrice: info.bookPrice,
    bookOdds: info.bookOdds,
    playerId: info.playerId,
    pending: info.pending ?? true,
    ...(info.balance != null ? { balance: info.balance } : {}),
    ...(info.totalProfit != null ? { totalProfit: info.totalProfit } : {}),
  };
}

/**
 * Pf_GetOrder 回包：settlement + 脱敏订单，不含 official。
 * @param {Record<string, unknown>} info
 */
export function toUserPfGetOrderInfo(info) {
  if (!info || typeof info !== "object")
    return info;
  return {
    orderId: info.orderId,
    found: Boolean(info.found),
    settlement: info.settlement,
    order: toUserPfVenueOrder(info.order),
    refunded: Boolean(info.refunded),
  };
}

/**
 * Pf_SubmitSell 回包：用户可见回款，不含 officialStatus。
 * @param {Record<string, unknown>} info
 */
export function toUserPfSubmitSellInfo(info) {
  if (!info || typeof info !== "object")
    return info;
  return {
    buyOrderId: info.buyOrderId,
    sellOrderId: info.sellOrderId,
    shares: info.shares,
    proceedsUsdt: info.proceedsUsdt,
    profit: info.profit,
    ...(info.bookPrice != null ? { bookPrice: info.bookPrice } : {}),
    ...(info.bookOdds != null ? { bookOdds: info.bookOdds } : {}),
    ...(info.balance != null ? { balance: info.balance } : {}),
    ...(info.totalProfit != null ? { totalProfit: info.totalProfit } : {}),
    playerId: info.playerId,
  };
}
