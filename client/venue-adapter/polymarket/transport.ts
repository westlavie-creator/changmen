/** Polymarket Gamma/CLOB REST — 扩展 background 或 changmen HK http-relay */

import { a8PluginGet, a8PluginPost, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { changmenRelayHttpRequest, parseJsonLoose } from "@changmen/client-core/shared/platformHttp";
import { buildL2HeadersFromAccount } from "./l2Auth";
import { isVenueHkEgressEnabled } from "@venue/shared/venueHkEgress";

export const POLYMARKET_PLUGIN_REQUIRED_MSG =
  "Polymarket 采集需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/client/chrome-extension，或使用 Electron 启动（内嵌扩展）；或在扩展页开启「HK 出海 relay」";

const PLUGIN_TIMEOUT_MS = 60_000;

function unwrapPluginResponse<T>(raw: unknown): T {
  if (raw instanceof Error)
    throw raw;
  if (raw && typeof raw === "object" && "message" in raw && !("status" in raw) && !("data" in raw)) {
    const message = String((raw as { message?: unknown }).message || "Polymarket API 请求失败");
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
    throw new Error("Polymarket API 无响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonLoose(trimmed) as T;
  return trimmed as T;
}

function requirePluginRuntime(): void {
  if (!hasA8PluginRuntime())
    throw new Error(POLYMARKET_PLUGIN_REQUIRED_MSG);
}

async function polymarketRelayGet<T>(
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    account?: import("@changmen/client-core/models/platformAccount").PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  void options?.timeout;
  void options?.withCredentials;
  const headers: Record<string, string> = {};
  if (options?.account && options?.l2Path) {
    headers["x-pm-account-id"] = String(options.account.accountId);
    headers["x-pm-l2-path"] = options.l2Path;
  }
  else if (options?.headers) {
    Object.assign(headers, options.headers);
  }
  const res = await changmenRelayHttpRequest(url, {
    method: "GET",
    headers: Object.keys(headers).length ? headers : undefined,
  });
  return unwrapRelayResponse<T>(res.text);
}

async function polymarketRelayPost<T>(
  url: string,
  data: unknown,
  options?: {
    headers?: Record<string, string>;
    account?: import("@changmen/client-core/models/platformAccount").PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers || {}),
  };
  if (options?.account && options?.l2Path) {
    headers["x-pm-account-id"] = String(options.account.accountId);
    headers["x-pm-l2-path"] = options.l2Path;
    for (const key of ["POLY_ADDRESS", "POLY_SIGNATURE", "POLY_TIMESTAMP", "POLY_API_KEY", "POLY_PASSPHRASE"]) {
      delete headers[key];
      delete headers[key.toLowerCase()];
    }
  }
  const body = data === undefined ? undefined : JSON.stringify(data);
  const res = await changmenRelayHttpRequest(url, {
    method: "POST",
    headers,
    body,
  });
  return unwrapRelayResponse<T>(res.text);
}

/** 扩展 background axios GET（不经 tab，与 Dex `dexPluginGet` 同路） */
export async function polymarketPluginGet<T>(
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    account?: import("@changmen/client-core/models/platformAccount").PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  if (isVenueHkEgressEnabled())
    return polymarketRelayGet<T>(url, options);
  requirePluginRuntime();
  const raw = await a8PluginGet(url, { timeout: PLUGIN_TIMEOUT_MS, withCredentials: false, ...options });
  if (raw == null)
    throw new Error("Polymarket API 无响应");
  return unwrapPluginResponse<T>(raw);
}

/** 扩展 background axios POST（CLOB /prices /order 等接口） */
export async function polymarketPluginPost<T>(
  url: string,
  data: unknown,
  options?: {
    headers?: Record<string, string>;
    account?: import("@changmen/client-core/models/platformAccount").PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  if (isVenueHkEgressEnabled())
    return polymarketRelayPost<T>(url, data, options);
  requirePluginRuntime();
  const raw = await a8PluginPost(url, data, { timeout: PLUGIN_TIMEOUT_MS, withCredentials: false, ...options });
  if (raw == null)
    throw new Error("Polymarket API 无响应");
  return unwrapPluginResponse<T>(raw);
}

/** 采集/下注 HTTP 是否可用（扩展 或 HK relay） */
export function isPolymarketHttpTransportReady(): boolean {
  return isVenueHkEgressEnabled() || hasA8PluginRuntime();
}

/** L2 GET：HK 出口走 relay 服务端签名；否则扩展 + 客户端 POLY 头 */
export async function polymarketL2Get<T>(
  account: PlatformAccount,
  url: string,
  l2Path: string,
): Promise<T> {
  if (isVenueHkEgressEnabled())
    return polymarketPluginGet<T>(url, { account, l2Path });
  const headers = await buildL2HeadersFromAccount(account, "GET", l2Path);
  if (!headers)
    throw new Error("Polymarket L2 credentials missing");
  return polymarketPluginGet<T>(url, { headers });
}

/** L2 POST：HK 出口走 relay 服务端签名；否则扩展 + 客户端 POLY 头 */
export async function polymarketL2Post<T>(
  account: PlatformAccount,
  url: string,
  l2Path: string,
  data: unknown,
  bodyForSignature?: string,
): Promise<T> {
  if (isVenueHkEgressEnabled())
    return polymarketPluginPost<T>(url, data, { account, l2Path });
  const body = bodyForSignature ?? (data === undefined ? "" : JSON.stringify(data));
  const headers = await buildL2HeadersFromAccount(account, "POST", l2Path, body);
  if (!headers)
    throw new Error("Polymarket L2 credentials missing");
  return polymarketPluginPost<T>(url, data, { headers });
}
