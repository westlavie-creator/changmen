/** Polymarket Gamma/CLOB REST — changmen HK http-relay（固定 VPS 出海，无扩展开关） */

import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { changmenRelayHttpRequest, parseJsonLoose } from "@changmen/client-core/shared/platformHttp";

const PLUGIN_TIMEOUT_MS = 60_000;

function unwrapRelayResponse<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed)
    throw new Error("Polymarket API 无响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonLoose(trimmed) as T;
  return trimmed as T;
}

async function polymarketRelayGet<T>(
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    account?: PlatformAccount;
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
  if (res.status >= 400)
    throw new Error(res.text?.trim() || `HTTP ${res.status}`);
  return unwrapRelayResponse<T>(res.text);
}

async function polymarketRelayPost<T>(
  url: string,
  data: unknown,
  options?: {
    headers?: Record<string, string>;
    account?: PlatformAccount;
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
  if (res.status >= 400)
    throw new Error(res.text?.trim() || `HTTP ${res.status}`);
  return unwrapRelayResponse<T>(res.text);
}

/** Polymarket REST GET（经 changmen http-relay） */
export async function polymarketPluginGet<T>(
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    withCredentials?: boolean;
    account?: PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  void PLUGIN_TIMEOUT_MS;
  return polymarketRelayGet<T>(url, options);
}

/** Polymarket REST POST（经 changmen http-relay） */
export async function polymarketPluginPost<T>(
  url: string,
  data: unknown,
  options?: {
    headers?: Record<string, string>;
    account?: PlatformAccount;
    l2Path?: string;
  },
): Promise<T> {
  return polymarketRelayPost<T>(url, data, options);
}

/** 采集/下注 HTTP 经 changmen relay，始终可用（需登录 changmen） */
export function isPolymarketHttpTransportReady(): boolean {
  return true;
}

/** L2 GET：relay 服务端签名 */
export async function polymarketL2Get<T>(
  account: PlatformAccount,
  url: string,
  l2Path: string,
): Promise<T> {
  return polymarketPluginGet<T>(url, { account, l2Path });
}

/** L2 POST：relay 服务端签名 */
export async function polymarketL2Post<T>(
  account: PlatformAccount,
  url: string,
  l2Path: string,
  data: unknown,
  _bodyForSignature?: string,
): Promise<T> {
  return polymarketPluginPost<T>(url, data, { account, l2Path });
}
