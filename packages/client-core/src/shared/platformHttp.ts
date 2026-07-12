import type { PlatformAccount } from "../models/platformAccount";
import { buildEsportUrl, buildHttpRelayUrl } from "@changmen/api-contract/urls";
import { a8Axios, responseBodyText } from "./a8Axios";
import { resolveHkRelayHttpOrigin } from "./hkRelayOrigin";

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

  const relayUrl = buildHttpRelayUrl({ proxyOrigin: resolveHkRelayHttpOrigin() });
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

const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded;" };

function toEsportPostBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    out[key] = value && typeof value === "object" ? JSON.stringify(value) : value;
  }
  return out;
}

export interface ChangmenPmHttpRequestInput {
  method?: string;
  url: string;
  playerId?: number;
  l2Path?: string;
  polyHeaders?: Record<string, string>;
  body?: unknown;
}

export async function changmenPmEsportCall<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = requireHttpCtx().getToken();
  if (!token)
    throw new Error("请先登录");

  try {
    const res = await a8Axios.post<{ success?: number; msg?: string; info?: T }>(
      buildEsportUrl(action, "", requireHttpCtx().getApiBase()),
      toEsportPostBody(body),
      { headers: { ...FORM_HEADERS, token } },
    );
    const json = res.data;
    if (json?.success !== 1) {
      const hint = String(json?.msg || `${action} failed`).slice(0, 160);
      throw new Error(hint);
    }
    return json.info as T;
  }
  catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(`PM API 不可用（${action}）：${hint}`);
  }
}

/**
 * Polymarket HTTP：经 Pm_HttpRequest 由 VPS 直连上游（不经 http-relay）。
 */
export async function changmenPmHttpRequest(
  input: ChangmenPmHttpRequestInput,
): Promise<AccountHttpResult> {
  const token = requireHttpCtx().getToken();
  if (!token)
    throw new Error("请先登录");

  const payload: Record<string, unknown> = {
    method: (input.method || "GET").toUpperCase(),
    url: input.url,
  };
  if (input.playerId)
    payload.playerId = input.playerId;
  if (input.l2Path)
    payload.l2Path = input.l2Path;
  if (input.polyHeaders)
    payload.polyHeaders = input.polyHeaders;
  if (input.body !== undefined)
    payload.body = input.body;

  try {
    const res = await a8Axios.post<{ success?: number; msg?: string; info?: AccountHttpResult }>(
      buildEsportUrl("Pm_HttpRequest", "", requireHttpCtx().getApiBase()),
      toEsportPostBody(payload),
      { headers: { ...FORM_HEADERS, token } },
    );
    const json = res.data;
    if (json?.success !== 1 || !json.info) {
      const hint = String(json?.msg || "Pm_HttpRequest failed").slice(0, 160);
      throw new Error(hint);
    }
    const upstream = json.info;
    if (upstream.status >= 400) {
      const snippet = upstream.text?.slice(0, 160) || `HTTP ${upstream.status}`;
      throw new Error(snippet);
    }
    return upstream;
  }
  catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(`PM 代理不可用：${hint}`);
  }
}
