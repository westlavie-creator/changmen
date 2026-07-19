/**
 * Predict.fun REST（VPS 直连官方，不经 http-relay）
 * @see https://dev.predict.fun/
 */

import {
  resolvePredictFunApiBase,
  resolvePredictFunApiKey,
} from "./house_credentials.js";

export function predictFunApiHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  const apiKey = resolvePredictFunApiKey();
  if (apiKey)
    headers["x-api-key"] = apiKey;
  return headers;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  let body = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    }
    catch {
      body = text;
    }
  }
  if (!res.ok) {
    const snippet = typeof body === "string"
      ? body.slice(0, 300)
      : JSON.stringify(body ?? {}).slice(0, 300);
    const err = new Error(snippet || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function predictFunGet(path) {
  const base = resolvePredictFunApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: predictFunApiHeaders(),
  });
  return parseJsonResponse(res);
}

/** 需 JWT 的 GET（订单查询等） */
export async function predictFunGetAuth(path, jwt) {
  const base = resolvePredictFunApiBase();
  const headers = predictFunApiHeaders();
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers,
  });
  return parseJsonResponse(res);
}

export async function predictFunPost(path, body, jwt) {
  const base = resolvePredictFunApiBase();
  const headers = predictFunApiHeaders({
    "Content-Type": "application/json",
  });
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return parseJsonResponse(res);
}

export async function fetchPredictMarket(marketId) {
  const id = String(marketId ?? "").trim();
  if (!id)
    return null;
  const res = await predictFunGet(`/v1/markets/${encodeURIComponent(id)}`);
  return res?.data ?? null;
}

export async function fetchPredictOrderbook(marketId) {
  const id = String(marketId ?? "").trim();
  if (!id)
    return null;
  const res = await predictFunGet(`/v1/markets/${encodeURIComponent(id)}/orderbook`);
  return res?.data ?? null;
}
