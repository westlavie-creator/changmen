/**
 * Polymarket 语义 Pm_* 处理器（VPS 直连 CLOB）
 */
import * as dbStore from "../../db/store.js";
import store from "../../esport-api/store.js";
import { assertPlayerOwnedByUser } from "../../account/player_ownership.js";
import { executePolymarketHttpRequest } from "./clob_proxy.js";
import { fetchPolymarketTradesSince } from "./clob_l2.js";

const DEFAULT_CLOB = "https://clob.polymarket.com";
const ORDER_PATH = "/order";
const TRADES_PATH = "/data/trades";
const ORDER_PATH_PREFIX = "/data/order/";
const HEARTBEAT_PATH = "/v1/heartbeats";
const OPEN_ORDERS_PATH = "/data/orders";

function parseBodyField(raw) {
  if (raw == null || raw === "")
    return undefined;
  if (typeof raw === "object")
    return raw;
  const text = String(raw).trim();
  if (!text)
    return undefined;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    }
    catch {
      return text;
    }
  }
  return text;
}

function findPolymarketAccountRow(accounts, playerId) {
  const want = String(playerId).trim();
  if (!want)
    return null;
  return accounts.find((row) => {
    const id = String(row.accountId ?? row.AccountId ?? "").trim();
    const provider = String(row.provider ?? "").trim().toLowerCase();
    return id === want && provider === "polymarket";
  }) ?? null;
}

function clobGateway(account) {
  return String(account?.gateway || DEFAULT_CLOB).replace(/\/+$/, "");
}

function parseUpstreamJson(result) {
  if (result.status >= 400) {
    const snippet = String(result.text || "").slice(0, 160) || `HTTP ${result.status}`;
    const err = new Error(snippet);
    err.status = result.status;
    err.rawText = result.text;
    throw err;
  }
  const text = String(result.text ?? "").trim();
  if (!text)
    return null;
  if (text.startsWith("{") || text.startsWith("["))
    return JSON.parse(text);
  return text;
}

function extractHeartbeatId(raw) {
  if (!raw || typeof raw !== "object")
    return "";
  const id = raw.heartbeat_id ?? raw.heartbeatId;
  return id == null ? "" : String(id);
}

function extractHeartbeatIdFromError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const rawText = err?.rawText;
  for (const source of [rawText, msg]) {
    if (!source)
      continue;
    const text = String(source);
    const jsonStart = text.indexOf("{");
    if (jsonStart >= 0) {
      try {
        const id = extractHeartbeatId(JSON.parse(text.slice(jsonStart)));
        if (id)
          return id;
      }
      catch { /* ignore */ }
    }
  }
  const m = msg.match(/heartbeat_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i);
  return m?.[1] ?? "";
}

async function resolveOwnedPmAccount(playerId, userId) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  if (playerId == null || String(playerId).trim() === "")
    return { ok: false, msg: "playerId 必填" };
  const owned = await assertPlayerOwnedByUser(playerId, userId);
  if (!owned.ok)
    return owned;
  await dbStore.refreshAccountsFromRdsIfEmpty(userId);
  const row = findPolymarketAccountRow(store.getAccountsForUser(userId), playerId);
  if (!row?.token)
    return { ok: false, msg: "PM 账号不存在或缺少 token" };
  return { ok: true, account: row };
}

/** Pm_SubmitOrder */
export async function handlePmSubmitOrder(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const order = parseBodyField(body.order);
  if (!order || typeof order !== "object")
    return { ok: false, msg: "order 必填" };
  try {
    const gateway = clobGateway(resolved.account);
    const result = await executePolymarketHttpRequest({
      method: "POST",
      url: `${gateway}${ORDER_PATH}`,
      l2Path: ORDER_PATH,
      accountToken: resolved.account.token,
      body: order,
    });
    return { ok: true, info: parseUpstreamJson(result) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pm_GetTrades */
export async function handlePmGetTrades(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const afterSec = Number(body.after);
  if (!Number.isFinite(afterSec) || afterSec <= 0)
    return { ok: false, msg: "after 必填（unix 秒）" };
  const maxPages = Math.min(Math.max(Number(body.maxPages) || 30, 1), 30);
  try {
    const trades = await fetchPolymarketTradesSince({
      token: resolved.account.token,
      gateway: clobGateway(resolved.account),
      afterSec: Math.floor(afterSec),
      maxPages,
    });
    return { ok: true, info: trades };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pm_GetOrder */
export async function handlePmGetOrder(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId)
    return { ok: false, msg: "orderId 必填" };
  const path = `${ORDER_PATH_PREFIX}${orderId}`;
  try {
    const gateway = clobGateway(resolved.account);
    const result = await executePolymarketHttpRequest({
      method: "GET",
      url: `${gateway}${path}`,
      l2Path: path,
      accountToken: resolved.account.token,
    });
    return { ok: true, info: parseUpstreamJson(result) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pm_Heartbeat — 维持 GTC open 订单 */
export async function handlePmHeartbeat(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const gateway = clobGateway(resolved.account);
  let heartbeatId = String(body.heartbeatId ?? body.heartbeat_id ?? "").trim();

  async function postOnce(id) {
    const payload = { heartbeat_id: id };
    const result = await executePolymarketHttpRequest({
      method: "POST",
      url: `${gateway}${HEARTBEAT_PATH}`,
      l2Path: HEARTBEAT_PATH,
      accountToken: resolved.account.token,
      body: payload,
    });
    return parseUpstreamJson(result);
  }

  try {
    const res = await postOnce(heartbeatId);
    const nextId = extractHeartbeatId(res) || heartbeatId;
    return { ok: true, info: { heartbeat_id: nextId } };
  }
  catch (err) {
    const recovered = extractHeartbeatIdFromError(err);
    if (!recovered)
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    try {
      const res = await postOnce(recovered);
      const nextId = extractHeartbeatId(res) || recovered;
      return { ok: true, info: { heartbeat_id: nextId } };
    }
    catch (retryErr) {
      return { ok: false, msg: retryErr instanceof Error ? retryErr.message : String(retryErr) };
    }
  }
}

/** Pm_GetOpenOrders — 用户 open orders（可选 asset_id 过滤） */
export async function handlePmGetOpenOrders(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const gateway = clobGateway(resolved.account);
  const assetId = String(body.assetId ?? body.tokenId ?? "").trim();
  const qs = new URLSearchParams();
  if (assetId)
    qs.set("asset_id", assetId);
  const l2Path = qs.toString() ? `${OPEN_ORDERS_PATH}?${qs.toString()}` : OPEN_ORDERS_PATH;
  try {
    const result = await executePolymarketHttpRequest({
      method: "GET",
      url: `${gateway}${l2Path}`,
      l2Path,
      accountToken: resolved.account.token,
    });
    return { ok: true, info: parseUpstreamJson(result) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pm_CancelOrder — DELETE /order { orderID } */
export async function handlePmCancelOrder(body, userId) {
  const resolved = await resolveOwnedPmAccount(body.playerId, userId);
  if (!resolved.ok)
    return resolved;
  const orderId = String(body.orderId ?? body.orderID ?? "").trim();
  if (!orderId)
    return { ok: false, msg: "orderId 必填" };
  try {
    const gateway = clobGateway(resolved.account);
    const payload = { orderID: orderId };
    const result = await executePolymarketHttpRequest({
      method: "DELETE",
      url: `${gateway}${ORDER_PATH}`,
      l2Path: ORDER_PATH,
      accountToken: resolved.account.token,
      body: payload,
    });
    return { ok: true, info: parseUpstreamJson(result) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pm_GetBook — 公开盘口，无 L2 */
export async function handlePmGetBook(body, userId) {
  void userId;
  const tokenId = String(body.tokenId ?? "").trim();
  if (!tokenId)
    return { ok: false, msg: "tokenId 必填" };
  const gateway = String(body.gateway || DEFAULT_CLOB).replace(/\/+$/, "");
  const params = new URLSearchParams({ token_id: tokenId });
  try {
    const result = await executePolymarketHttpRequest({
      method: "GET",
      url: `${gateway}/book?${params.toString()}`,
    });
    return { ok: true, info: parseUpstreamJson(result) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}
