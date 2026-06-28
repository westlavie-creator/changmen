import type { PlatformAccount } from "@/models/platformAccount";
import { buildHttpRelayUrl } from "@changmen/api-contract/urls";
import { getToken } from "@/api/client";
import { getApiBase } from "@/config/apiBase";
import { a8Axios, responseBodyText } from "@/shared/a8Axios";
import { useUserStore } from "@/stores/userStore";

export interface AccountHttpOptions {
  /** 对齐 A8 mr 最后一参 `!0`：有 proxyId 也强制浏览器直连 gateway */
  forceDirect?: boolean;
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
  const user = useUserStore();
  return user.proxyList.find(p => p.proxyId === account.proxyId)?.url;
}

/** 对齐 A8 `vS`：localStorage.PROXY ?? VITE_API_BASE，并落到 http-relay */
function getA8ProxyRelayEntry(): string {
  const proxyOrigin
    = typeof localStorage !== "undefined" ? localStorage.getItem("PROXY")?.trim() : "";
  return buildHttpRelayUrl({ apiBase: getApiBase(), proxyOrigin: proxyOrigin || undefined });
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
    const token = getToken();
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
