/**
 * Polymarket CLOB L2 鉴权 + /data/trades（服务端运维脚本用）
 */

import crypto from "node:crypto";

const DEFAULT_CLOB = "https://clob.polymarket.com";
const TRADES_PATH = "/data/trades";
const NO_MORE_CURSOR = "LTE=";

function parseJsonObject(text) {
  if (!text)
    return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  }
  catch {
    return undefined;
  }
}

function decodeBase64Utf8(text) {
  try {
    return Buffer.from(text, "base64").toString("utf8");
  }
  catch {
    return undefined;
  }
}

export function parsePolymarketTokenConfig(raw) {
  const text = String(raw ?? "").trim();
  if (!text)
    return {};
  const direct = parseJsonObject(text);
  if (direct)
    return direct;
  const decoded = decodeBase64Utf8(text);
  return parseJsonObject(decoded) ?? {};
}

function headerValue(headers, name) {
  if (!headers)
    return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value != null)
      return String(value);
  }
  return "";
}

export function resolvePolymarketApiCreds(config) {
  const headers = config?.polyHeaders;
  const api = config?.apiCreds ?? {};
  return {
    address: config?.walletAddress || config?.address || headerValue(headers, "POLY_ADDRESS"),
    apiKey: api.apiKey || api.key || api.api_key
      || config?.apiKey || config?.key || config?.api_key
      || headerValue(headers, "POLY_API_KEY"),
    secret: api.secret || api.apiSecret || api.api_secret
      || config?.secret || config?.apiSecret || config?.api_secret,
    passphrase: api.passphrase || config?.passphrase || headerValue(headers, "POLY_PASSPHRASE"),
  };
}

function base64UrlToBuffer(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function hmacSha256Base64Url(secret, message) {
  const sig = crypto.createHmac("sha256", base64UrlToBuffer(secret))
    .update(message)
    .digest("base64");
  return sig.replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildPolymarketL2Headers(address, apiKey, secret, passphrase, method, requestPath, body = "") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = hmacSha256Base64Url(secret, timestamp + method + requestPath + body);
  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_API_KEY: apiKey,
    POLY_PASSPHRASE: passphrase,
    Accept: "application/json",
  };
}

export function buildPolymarketL2HeadersFromToken(token, method, requestPath, body = "") {
  const creds = resolvePolymarketApiCreds(parsePolymarketTokenConfig(token));
  if (!creds.address || !creds.apiKey || !creds.secret || !creds.passphrase)
    return null;
  return buildPolymarketL2Headers(
    creds.address,
    creds.apiKey,
    creds.secret,
    creds.passphrase,
    method,
    requestPath,
    body,
  );
}

function isTradeConfirmed(status) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized)
    return false;
  if (normalized.includes("FAILED") || normalized.includes("CANCEL"))
    return false;
  return normalized.includes("CONFIRMED")
    || normalized.includes("MATCHED")
    || normalized.includes("MINED")
    || normalized.includes("RETRYING");
}

export function flattenPolymarketTrades(trades) {
  const out = [];
  for (const trade of trades) {
    const role = String(trade?.trader_side ?? trade?.type ?? "").trim().toUpperCase();
    if (role.includes("MAKER") && Array.isArray(trade?.maker_orders) && trade.maker_orders.length) {
      for (const mo of trade.maker_orders) {
        const orderId = String(mo?.order_id ?? "").trim();
        if (!orderId)
          continue;
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
    const orderId = String(trade?.taker_order_id ?? "").trim();
    if (orderId)
      out.push(trade);
  }
  return out;
}

/** 按 taker_order_id 聚合 BUY 成交 */
export function indexPolymarketBuyTrades(trades) {
  const byOrder = new Map();
  for (const trade of flattenPolymarketTrades(trades)) {
    if (String(trade?.side ?? "").trim().toUpperCase() !== "BUY")
      continue;
    if (!isTradeConfirmed(trade?.status))
      continue;
    const orderId = String(trade?.taker_order_id ?? "").trim();
    if (!orderId)
      continue;

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

  const out = new Map();
  for (const [orderId, row] of byOrder) {
    const { _sizeSum, ...rest } = row;
    out.set(orderId, { ...rest, size: String(_sizeSum) });
  }
  return out;
}

export async function fetchPolymarketTradesSince({
  token,
  gateway = DEFAULT_CLOB,
  afterSec,
  maxPages = 30,
}) {
  const headers = buildPolymarketL2HeadersFromToken(token, "GET", TRADES_PATH);
  if (!headers)
    throw new Error("缺少 Polymarket L2 凭据（walletAddress + apiCreds）");

  const host = String(gateway || DEFAULT_CLOB).replace(/\/+$/, "");
  const all = [];
  let nextCursor;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ after: String(Math.floor(afterSec)) });
    if (nextCursor)
      params.set("next_cursor", nextCursor);
    const res = await fetch(`${host}${TRADES_PATH}?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok)
      throw new Error(`CLOB ${res.status} ${host}${TRADES_PATH}`);
    const data = await res.json();
    const batch = Array.isArray(data?.data) ? data.data : [];
    all.push(...batch);
    nextCursor = data?.next_cursor;
    if (!nextCursor || nextCursor === NO_MORE_CURSOR || batch.length === 0)
      break;
  }
  return all;
}

/** 公开接口：Gamma 缺失时 CLOB 仍保留 tokens[].winner */
export async function fetchClobMarketByConditionId(conditionId, gateway = DEFAULT_CLOB) {
  const id = String(conditionId ?? "").trim();
  if (!id)
    return null;
  const host = String(gateway || DEFAULT_CLOB).replace(/\/+$/, "");
  const res = await fetch(`${host}/markets/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok)
    return null;
  const data = await res.json();
  return data && typeof data === "object" ? data : null;
}
