/**
 * Predict.fun REST（VPS 直连官方，不经 http-relay）
 * @see https://dev.predict.fun/
 */

import {
  resolvePredictFunApiBase,
  resolvePredictFunApiKey,
} from "./house_credentials.js";

/** 单次上游 HTTP 上限；避免裸 fetch 挂死拖垮 house 锁与客户端 */
const PREDICT_FUN_FETCH_TIMEOUT_MS = Number(process.env.PF_HOUSE_FETCH_TIMEOUT_MS || 12_000);

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

function fetchSignal(timeoutMs = PREDICT_FUN_FETCH_TIMEOUT_MS) {
  const ms = Math.max(1000, Number(timeoutMs) || PREDICT_FUN_FETCH_TIMEOUT_MS);
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function")
    return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
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

async function predictFunFetch(path, init = {}) {
  const base = resolvePredictFunApiBase();
  const url = `${base}${path}`;
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || fetchSignal(),
    });
  }
  catch (err) {
    const name = err?.name || "";
    if (name === "TimeoutError" || name === "AbortError")
      throw new Error(`Predict.fun 上游超时（${path}，${PREDICT_FUN_FETCH_TIMEOUT_MS}ms）`);
    throw err;
  }
}

export async function predictFunGet(path) {
  const res = await predictFunFetch(path, {
    method: "GET",
    headers: predictFunApiHeaders(),
  });
  return parseJsonResponse(res);
}

/** 需 JWT 的 GET（订单查询等） */
export async function predictFunGetAuth(path, jwt) {
  const headers = predictFunApiHeaders();
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`;
  const res = await predictFunFetch(path, {
    method: "GET",
    headers,
  });
  return parseJsonResponse(res);
}

export async function predictFunPost(path, body, jwt) {
  const headers = predictFunApiHeaders({
    "Content-Type": "application/json",
  });
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`;
  const res = await predictFunFetch(path, {
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
