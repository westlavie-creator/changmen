/** Predict.fun REST — changmen HK http-relay（固定 VPS 出海） */

import { changmenRelayHttpRequest, parseJsonLoose } from "@changmen/client-core/shared/platformHttp";

const PREDICT_FUN_RELAY_ORIGIN = "https://predict.fun/";

export function resolvePredictFunApiKey(): string {
  const fromEnv = typeof import.meta !== "undefined"
    ? String(import.meta.env?.VITE_PREDICT_FUN_API_KEY ?? "").trim()
    : "";
  return fromEnv;
}

function unwrapRelayResponse<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed)
    throw new Error("Predict.fun API 无响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonLoose(trimmed) as T;
  return trimmed as T;
}

async function predictFunRelayGet<T>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await changmenRelayHttpRequest(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-proxy-referer": PREDICT_FUN_RELAY_ORIGIN,
      "x-proxy-origin": "https://predict.fun",
      ...(headers || {}),
    },
  });
  if (res.status >= 400)
    throw new Error(res.text?.trim() || `HTTP ${res.status}`);
  return unwrapRelayResponse<T>(res.text);
}

/** Predict.fun REST GET（经 changmen http-relay） */
export async function predictFunHttpGet<T>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  return predictFunRelayGet<T>(url, headers);
}

async function predictFunRelayPost<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await changmenRelayHttpRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-proxy-referer": PREDICT_FUN_RELAY_ORIGIN,
      "x-proxy-origin": "https://predict.fun",
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status >= 400)
    throw new Error(res.text?.trim() || `HTTP ${res.status}`);
  return unwrapRelayResponse<T>(res.text);
}

/** Predict.fun REST POST（经 changmen http-relay） */
export async function predictFunHttpPost<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return predictFunRelayPost<T>(url, body, headers);
}

export function isPredictFunHttpTransportReady(): boolean {
  return true;
}
