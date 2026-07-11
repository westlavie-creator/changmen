/** Predict.fun REST — 扩展 background 或 changmen HK http-relay（与 Polymarket 同需出海） */

import { a8PluginGet, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { changmenRelayHttpRequest, parseJsonLoose } from "@changmen/client-core/shared/platformHttp";
import { isPolymarketHkEgressEnabled } from "@venue/polymarket/pmHkEgress";

export const PREDICT_FUN_PLUGIN_REQUIRED_MSG =
  "Predict.fun 采集需要 Gamebet 扩展，或在扩展页开启「PM HK出口」（经 changmen VPS 代连 predict.fun）";

const PLUGIN_TIMEOUT_MS = 60_000;
const PREDICT_FUN_RELAY_ORIGIN = "https://predict.fun/";

export function resolvePredictFunApiKey(): string {
  const fromEnv = typeof import.meta !== "undefined"
    ? String(import.meta.env?.VITE_PREDICT_FUN_API_KEY ?? "").trim()
    : "";
  return fromEnv;
}

function unwrapPluginResponse<T>(raw: unknown): T {
  if (raw instanceof Error)
    throw raw;
  if (raw && typeof raw === "object" && "message" in raw && !("status" in raw) && !("data" in raw)) {
    const message = String((raw as { message?: unknown }).message || "Predict.fun API 请求失败");
    throw new Error(message);
  }
  if (raw && typeof raw === "object" && "status" in raw && "data" in raw) {
    const res = raw as { status: number; data: unknown };
    if (res.status >= 400) {
      const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
      throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
    }
    return res.data as T;
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data?: unknown }).data as T;
  }
  return raw as T;
}

function unwrapRelayResponse<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed)
    throw new Error("Predict.fun API 无响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonLoose(trimmed) as T;
  return trimmed as T;
}

function requirePluginRuntime(): void {
  if (!hasA8PluginRuntime())
    throw new Error(PREDICT_FUN_PLUGIN_REQUIRED_MSG);
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
  return unwrapRelayResponse<T>(res.text);
}

/** 扩展 background 或 HK http-relay GET */
export async function predictFunHttpGet<T>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  if (isPolymarketHkEgressEnabled())
    return predictFunRelayGet<T>(url, headers);
  requirePluginRuntime();
  const raw = await a8PluginGet(url, {
    timeout: PLUGIN_TIMEOUT_MS,
    withCredentials: false,
    headers,
  });
  if (raw == null)
    throw new Error("Predict.fun API 无响应");
  return unwrapPluginResponse<T>(raw);
}

/** 采集 HTTP 是否可用（扩展 或 PM HK 出口 relay） */
export function isPredictFunHttpTransportReady(): boolean {
  return isPolymarketHkEgressEnabled() || hasA8PluginRuntime();
}
