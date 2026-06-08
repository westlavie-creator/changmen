/** 对齐 A8 `Zn`（pluginBridge）+ `k0`（auth headers）+ account 解析 */

import { a8PluginGet, a8PluginPost, hasA8PluginRuntime } from "@/extension/bridge";
import { a8Axios, responseBodyText } from "@/shared/a8Axios";
import { useUserStore } from "@/stores/userStore";
import { buildPbAuthHeaders } from "./auth";
import { useAccountStore } from "@/stores/accountStore";
import { PLATFORMS } from "@/shared/platform";
import type { PlatformAccount } from "@/models/platformAccount";

const RELAY_PATH = "/esport/http-relay";
const DEFAULT_PROXY_BASE = "http://127.0.0.1:3456";

/** 对齐 A8 `Ly(account, path)` */
export function pbGatewayUrl(account: Pick<PlatformAccount, "gateway">, path: string): string {
  const base = (account.gateway || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function unwrap<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data?: unknown }).data as T;
  }
  return response as T;
}

function originFromReferer(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return String(referer).replace(/\/+$/, "");
  }
}

/** Electron / 无扩展：同源 http-relay 代发 PB 场馆请求（绕过 CORS） */
function pbRelayEntry(): string {
  if (typeof window !== "undefined" && window.location?.origin?.startsWith("http")) {
    return `${window.location.origin.replace(/\/$/, "")}${RELAY_PATH}`;
  }
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem("PROXY")?.trim() : "";
  const base = (raw || DEFAULT_PROXY_BASE).replace(/\/$/, "");
  return base.endsWith(RELAY_PATH) ? base : `${base}${RELAY_PATH}`;
}

function resolveSocksProxy(account: PlatformAccount): string | undefined {
  if (!account.proxyId) return undefined;
  return useUserStore().proxyList.find((p) => p.proxyId === account.proxyId)?.url;
}

function ensureContentType(headers: Record<string, string>, body: unknown) {
  if (headers["content-type"] || headers["Content-Type"]) return;
  if (body === "" || body == null) return;
  if (typeof body === "string") {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    return;
  }
  headers["Content-Type"] = "application/json; charset=UTF-8";
}

function serializePbBody(body: unknown): string {
  if (body === "" || body == null) return "";
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

async function pbHttpViaRelay(
  account: PlatformAccount,
  targetUrl: string,
  init: { method: "GET" | "POST"; body?: unknown; headers: Record<string, string> },
): Promise<unknown> {
  const headers: Record<string, string> = { ...init.headers };
  ensureContentType(headers, init.body);
  headers["x-proxy-url"] = targetUrl;
  if (account.referer) {
    headers["x-proxy-referer"] = account.referer;
    const origin = originFromReferer(account.referer);
    if (origin) headers["x-proxy-origin"] = origin;
  }
  if (account.userAgent) headers["x-proxy-useragent"] = account.userAgent;
  const socks = resolveSocksProxy(account);
  if (socks) headers["x-proxy"] = socks;

  const res = await a8Axios.request({
    method: init.method,
    url: pbRelayEntry(),
    headers,
    data: init.method === "POST" ? serializePbBody(init.body) : undefined,
    responseType: "text",
    transformResponse: [(d) => d],
  });
  const text = responseBodyText(res.data);
  if (res.status >= 400) {
    throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

/** 对齐 A8 `Zn.get` + `k0`：扩展代发；无扩展时走 http-relay */
export async function pbGet<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");

  if (hasA8PluginRuntime()) {
    const raw = await a8PluginGet(url, { headers, withCredentials: true });
    return unwrap<T>(raw);
  }

  return (await pbHttpViaRelay(account, url, { method: "GET", headers })) as T;
}

/** 对齐 A8 `Zn.post` + `k0`：扩展代发；无扩展时走 http-relay */
export async function pbPost<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");

  if (hasA8PluginRuntime()) {
    const raw = await a8PluginPost(url, body, { headers, withCredentials: true });
    return unwrap<T>(raw);
  }

  return (await pbHttpViaRelay(account, url, { method: "POST", body, headers })) as T;
}

/** 对齐 A8 `AQ` 的 `bv`：须为 PB 且余额已知 */
export function resolvePbAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.gateway && a.token && a.balance !== undefined,
  );
}
