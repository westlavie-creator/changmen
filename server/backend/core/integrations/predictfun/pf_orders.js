/**
 * Predict.fun 官方订单查询 + 状态映射
 * @see https://dev.predict.fun/get-order-by-hash-25326901e0
 * @see https://dev.predict.fun/get-orders-25326902e0
 *
 * OrderStatus: OPEN | FILLED | EXPIRED | CANCELLED | INVALIDATED
 * 列表 filter 仅 OPEN | FILLED；拒单态须按 hash 单查。
 */

import { predictFunGetAuth } from "./pf_api.js";
import { fetchPredictFunHouseOrderJwt } from "./pf_house_session.js";
import { resolvePfOrderLabels, isBarePfItemLabel, extractPfMarketIdHint } from "./pf_order_labels.js";
import {
  ensureHouseWalletEventsStarted,
  getHouseWalletSettlementHint,
  officialStubFromWalletHint,
  waitForHouseWalletSettlementHint,
} from "./pf_wallet_events.js";

/** 官方状态 → VenueOrder.status */
export function mapPredictOfficialStatusToVenue(status) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "FILLED")
    return "none";
  if (s === "OPEN")
    return "pending";
  if (s === "CANCELLED" || s === "EXPIRED" || s === "INVALIDATED")
    return "reject";
  return "pending";
}

/** 官方状态 → 腿结算（POST 受理后确认） */
export function settlementFromPredictOfficialStatus(status) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "FILLED")
    return "filled";
  if (s === "CANCELLED" || s === "EXPIRED" || s === "INVALIDATED")
    return "unfilled";
  return "timeout";
}

export function isPredictOfficialTerminal(status) {
  const s = String(status ?? "").trim().toUpperCase();
  return s === "FILLED"
    || s === "CANCELLED"
    || s === "EXPIRED"
    || s === "INVALIDATED";
}

export function extractPredictOrderHash(row) {
  if (!row || typeof row !== "object")
    return "";
  // 官方 Get-by-hash 须用 typed-data hash，勿把 API id 当 hash
  return String(row.order?.hash ?? row.hash ?? "").trim();
}

export function extractPredictOrderId(row) {
  if (!row || typeof row !== "object")
    return "";
  return String(row.id ?? row.order?.hash ?? "").trim();
}

/**
 * GET /v1/orders/{hash}
 * @returns {Promise<object|null>} OrderData 或 null（404）
 */
export async function fetchPredictOrderByHash(hash, jwt) {
  const key = String(hash ?? "").trim();
  if (!key)
    return null;
  try {
    const res = await predictFunGetAuth(`/v1/orders/${encodeURIComponent(key)}`, jwt);
    return res?.data ?? null;
  }
  catch (err) {
    if (Number(err?.status) === 404)
      return null;
    throw err;
  }
}

/**
 * GET /v1/orders?status=OPEN|FILLED
 * @returns {Promise<object[]>}
 */
export async function fetchPredictOrdersList({ status, first = "50", after } = {}, jwt) {
  const qs = new URLSearchParams();
  if (status)
    qs.set("status", String(status));
  if (first)
    qs.set("first", String(first));
  if (after)
    qs.set("after", String(after));
  const path = qs.toString() ? `/v1/orders?${qs}` : "/v1/orders";
  const res = await predictFunGetAuth(path, jwt);
  return Array.isArray(res?.data) ? res.data : [];
}

/** house JWT 下按 hash 查单 */
export async function fetchHousePredictOrderByHash(hash) {
  const { jwt } = await fetchPredictFunHouseOrderJwt();
  return fetchPredictOrderByHash(hash, jwt);
}

/**
 * GetOrder + wallet hint：优先 predictWalletEvents 终态，REST Get-by-hash 兜底/校正金额。
 * @param {string} hashOrId
 * @param {{ fetchOrder?: (h: string) => Promise<object|null> }} [opts]
 * @returns {Promise<object|null>}
 */
export async function fetchHousePredictOrderResolved(hashOrId, opts = {}) {
  const key = String(hashOrId ?? "").trim();
  if (!key)
    return null;

  ensureHouseWalletEventsStarted();
  const fetchOrder = opts.fetchOrder || fetchHousePredictOrderByHash;

  const resolveHint = (official) => (
    getHouseWalletSettlementHint(key)
    || (official?.id ? getHouseWalletSettlementHint(String(official.id)) : null)
    || (extractPredictOrderHash(official)
      ? getHouseWalletSettlementHint(extractPredictOrderHash(official))
      : null)
  );

  // Wallet-first：拒单可直接 stub（省 REST）；成交尽量先 REST 校正金额
  const earlyHint = resolveHint(null);
  if (earlyHint && earlyHint.settlement !== "pending") {
    if (earlyHint.settlement === "unfilled") {
      const stub = officialStubFromWalletHint(earlyHint);
      if (stub)
        return stub;
    }
    const officialFilled = await fetchOrder(key);
    if (officialFilled && isPredictOfficialTerminal(officialFilled.status))
      return officialFilled;
    return officialStubFromWalletHint(earlyHint) || officialFilled;
  }

  let official = await fetchOrder(key);
  if (official && isPredictOfficialTerminal(official.status))
    return official;

  const hint = resolveHint(official);
  if (!hint || hint.settlement === "pending")
    return official;

  // REST 滞后：用 wallet stub（不再二次 REST）
  return officialStubFromWalletHint(hint) || official;
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * 轮询官方 GetOrder 直至终态（FILLED / CANCELLED / …）或超时。
 * 并行消费 house `predictWalletEvents`（加速确认；REST 仍优先）。
 * @param {string} hash typed-data hash
 * @param {{ attempts?: number, intervalMs?: number, fetchOrder?: (h: string) => Promise<object|null> }} [opts]
 * @returns {Promise<object|null>} 最后一次官方 OrderData；超时可能仍为 OPEN
 */
export async function waitForHouseOrderTerminal(hash, opts = {}) {
  const key = String(hash ?? "").trim();
  if (!key)
    return null;
  const attempts = Math.max(1, Number(opts.attempts) || 25);
  const intervalMs = Math.max(50, Number(opts.intervalMs) || 300);
  const fetchOrder = opts.fetchOrder || fetchHousePredictOrderByHash;
  const timeoutMs = attempts * intervalMs;

  ensureHouseWalletEventsStarted();

  let last = null;
  const walletHintPromise = waitForHouseWalletSettlementHint(key, timeoutMs);

  for (let i = 0; i < attempts; i += 1) {
    const peeked = getHouseWalletSettlementHint(key);
    if (peeked && peeked.settlement !== "pending") {
      // 拒单：wallet 即可收束；成交：优先 REST 校正金额后再 stub
      if (peeked.settlement === "unfilled") {
        const stub = officialStubFromWalletHint(peeked);
        if (stub)
          return stub;
      }
      last = await fetchOrder(key);
      if (last && isPredictOfficialTerminal(last.status))
        return last;
      const stub = officialStubFromWalletHint(peeked);
      if (stub)
        return stub;
    }

    last = await fetchOrder(key);
    if (last && isPredictOfficialTerminal(last.status))
      return last;

    if (i + 1 < attempts)
      await sleep(intervalMs);
  }

  const lateHint = await Promise.race([
    walletHintPromise,
    Promise.resolve(null),
  ]);
  if (lateHint && lateHint.settlement !== "pending") {
    last = await fetchOrder(key);
    if (last && isPredictOfficialTerminal(last.status))
      return last;
    const stub = officialStubFromWalletHint(lateHint);
    if (stub)
      return stub;
  }

  return last;
}

/**
 * 将官方 OrderData + RDS 行合并为 VenueOrder 形状（供 Pf_GetOrders）
 * Match/Bet/Item 优先保留 RDS 可读文案（勿每次 sync 用 marketId/tokenId 盖掉）
 */
export function mapPredictOrderToVenueOrder(official, rds = {}) {
  const hash = extractPredictOrderHash(official) || String(rds.orderId ?? rds.OrderID ?? "").trim();
  const apiId = extractPredictOrderId(official);
  const status = official?.status != null
    ? mapPredictOfficialStatusToVenue(official.status)
    : mapRdsStatusToVenue(rds.status ?? rds.Status);
  const odds = Number(rds.odds ?? rds.Odds) || 0;
  const betMoney = Number(rds.betMoney ?? rds.BetMoney) || 0;
  const createAt = Number(rds.createAt ?? rds.CreateAt) || Date.now();
  const storedToken = String(rds.pfTokenId ?? "").trim();
  const storedMarket = String(rds.pfMarketId ?? "").trim();
  const rdsMatch = rds.match ?? rds.Match;
  const rdsItem = rds.item ?? rds.Item;
  // item 列可能是可读队名；旧单 token 可能只在 item；market 可能只在 match
  const tokenId = String(
    official?.order?.tokenId
      ?? storedToken
      ?? (isBarePfItemLabel(rdsItem) ? rdsItem : "")
      ?? "",
  ).trim();
  const marketId = String(
    official?.marketId
      ?? storedMarket
      ?? extractPfMarketIdHint(rdsMatch, storedMarket)
      ?? "",
  ).trim();

  const labels = resolvePfOrderLabels({
    marketId,
    tokenId,
    match: rdsMatch,
    bet: rds.bet ?? rds.Bet,
    item: rdsItem,
  });

  return {
    provider: "PredictFun",
    orderId: hash || apiId,
    odds,
    createAt,
    betMoney,
    reward: 0,
    money: Number(rds.money ?? rds.Money) || 0,
    status,
    game: "",
    match: labels.match,
    bet: labels.bet,
    item: labels.item,
    link: (() => {
      const n = Number(rds.link ?? rds.Link);
      return Number.isFinite(n) && n !== 0 ? n : undefined;
    })(),
    pfOfficialStatus: official?.status ? String(official.status) : undefined,
    pfApiOrderId: apiId || undefined,
    pfOrderHash: hash || undefined,
    pfAmountFilled: official?.amountFilled != null ? String(official.amountFilled) : undefined,
    pfMarketId: marketId || undefined,
    pfTokenId: tokenId || undefined,
    pfSellState: rds.pfSellState ? String(rds.pfSellState) : undefined,
    pfSide: rds.pfSide ? String(rds.pfSide) : undefined,
    pfBuyOrderId: rds.pfBuyOrderId ? String(rds.pfBuyOrderId) : undefined,
    pfShares: Number(rds.pfShares) > 0 ? Number(rds.pfShares) : undefined,
  };
}

function mapRdsStatusToVenue(raw) {
  const s = String(raw ?? "").toLowerCase();
  if (s === "reject")
    return "reject";
  if (s === "pending")
    return "pending";
  if (s === "win")
    return "win";
  if (s === "lose")
    return "lose";
  if (s === "return")
    return "return";
  return "none";
}

export function isOpenChangmenOrderStatus(raw) {
  const s = String(raw ?? "").toLowerCase();
  return s === "none" || s === "pending" || s === "";
}
