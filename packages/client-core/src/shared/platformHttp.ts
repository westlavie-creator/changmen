import type { PlatformAccount } from "../models/platformAccount";
import { buildHttpRelayUrl } from "@changmen/api-contract/urls";
import { a8Axios, responseBodyText } from "./a8Axios";
import { resolvePmHkRelayHttpOrigin } from "./pmHkRelayOrigin";

export interface AccountHttpOptions {
  /** 对齐 A8 mr 最后一参 `!0`：有 proxyId 也强制浏览器直连 gateway */
  forceDirect?: boolean;
}

export interface PlatformHttpContext {
  getToken: () => string | null;
  getApiBase: () => string;
  getProxyUrl: (proxyId: number) => string | undefined;
}

let httpCtx: PlatformHttpContext | null = null;

export function registerPlatformHttpContext(ctx: PlatformHttpContext): void {
  httpCtx = ctx;
}

export function clearPlatformHttpContext(): void {
  httpCtx = null;
}

function requireHttpCtx(): PlatformHttpContext {
  if (!httpCtx)
    throw new Error("[client-core] PlatformHttp context not registered");
  return httpCtx;
}

function originFromReferer(referer?: string): string | undefined {
  if (!referer)
    return undefined;
  try {
    return new URL(referer).origin;
  }
  catch {
    return String(referer).replace(/\/+$/, "");
  }
}

function resolveProxyUrl(account: PlatformAccount): string | undefined {
  if (!account.proxyId)
    return undefined;
  return requireHttpCtx().getProxyUrl(account.proxyId);
}

/** 对齐 A8 `vS`：localStorage.PROXY ?? VITE_API_BASE，并落到 http-relay */
function getA8ProxyRelayEntry(): string {
  const proxyOrigin
    = typeof localStorage !== "undefined" ? localStorage.getItem("PROXY")?.trim() : "";
  return buildHttpRelayUrl({
    apiBase: requireHttpCtx().getApiBase(),
    proxyOrigin: proxyOrigin || undefined,
  });
}

export interface AccountHttpResult { status: number; text: string }

/**
 * 对齐 A8 mr.get/post：默认 Rr(Nr) 直连 gateway；仅 proxyId 且非 forceDirect 时走 PROXY + x-proxy-url。
 */
export async function accountHttpRequest(
  account: PlatformAccount,
  targetUrl: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  forceDirect = false,
): Promise<AccountHttpResult> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = { ...(init.headers || {}) };

  const requestUrl
    = account.proxyId && !forceDirect ? getA8ProxyRelayEntry() : targetUrl;

  if (account.proxyId && !forceDirect) {
    headers["x-proxy-url"] = targetUrl;
    const token = requireHttpCtx().getToken();
    if (token)
      headers.token = token;
    if (account.referer) {
      headers["x-proxy-referer"] = account.referer;
      const origin = originFromReferer(account.referer);
      if (origin)
        headers["x-proxy-origin"] = origin;
    }
    if (account.userAgent)
      headers["x-proxy-useragent"] = account.userAgent;
    const socksProxy = resolveProxyUrl(account);
    if (socksProxy)
      headers["x-proxy"] = socksProxy;
  }

  try {
    const res = await a8Axios.request({
      method,
      url: requestUrl,
      headers,
      data: init.body,
      responseType: "text",
      transformResponse: [d => d],
    });
    const text = responseBodyText(res.data);
    if (res.status >= 400 && /json/i.test(String(res.headers["content-type"] || ""))) {
      try {
        const parsed = JSON.parse(text) as { msg?: string; error?: string };
        throw new Error(parsed.msg || parsed.error || `HTTP ${res.status}`);
      }
      catch (e) {
        if (e instanceof Error && !e.message.startsWith("HTTP "))
          throw e;
      }
    }
    return { status: res.status, text };
  }
  catch (e) {
    if (account.proxyId && !forceDirect) {
      const hint = e instanceof Error ? e.message : String(e);
      throw new Error(`http-relay 不可用（${getA8ProxyRelayEntry()}）：${hint}`);
    }
    throw e;
  }
}

export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  }
  catch {
    return text;
  }
}

const PM_RELAY_REFERER = "https://polymarket.com/";

/**
 * changmen http-relay 直连上游（不传 x-proxy），供 Polymarket HK 出口等场景。
 * 服务端需能访问目标 host（如 HK VPS）。
 */
export async function changmenRelayHttpRequest(
  targetUrl: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<AccountHttpResult> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(init.headers || {}),
    "x-proxy-url": targetUrl,
  };
  if (!headers["x-proxy-referer"])
    headers["x-proxy-referer"] = PM_RELAY_REFERER;
  if (!headers["x-proxy-origin"])
    headers["x-proxy-origin"] = "https://polymarket.com";
  const token = requireHttpCtx().getToken();
  if (token)
    headers.token = token;

  const relayUrl = buildHttpRelayUrl({ proxyOrigin: resolvePmHkRelayHttpOrigin() });
  try {
    const res = await a8Axios.request({
      method,
      url: relayUrl,
      headers,
      data: init.body,
      responseType: "text",
      transformResponse: [d => d],
      timeout: 60_000,
    });
    const text = responseBodyText(res.data);
    if (res.status >= 400) {
      const snippet = text.slice(0, 160) || `HTTP ${res.status}`;
      throw new Error(snippet);
    }
    return { status: res.status, text };
  }
  catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(`http-relay 不可用（${relayUrl}）：${hint}`);
  }
}
