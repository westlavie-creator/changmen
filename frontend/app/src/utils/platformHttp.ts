import type { PlatformAccount } from "@/models/platformAccount";
import { useUserStore } from "@/stores/userStore";

const RELAY_PATH = "/esport/http-relay";

function obHeaders(account: PlatformAccount, post = false) {
  const base: Record<string, string> = {
    device: "1",
    lang: "cn",
    token: account.token || "",
  };
  if (post) {
    base["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }
  if (account.userAgent) base["User-Agent"] = account.userAgent;
  if (account.referer) base.Referer = account.referer;
  return base;
}

function rayHeaders(account: PlatformAccount, post = false) {
  const origin = originFromReferer(account.referer);
  const base: Record<string, string> = {
    authorization: account.token || "",
    Accept: "application/json, text/plain, */*",
    "X-Unique": String(Date.now()),
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  if (origin) {
    base.Origin = origin;
    base.Referer = account.referer!.endsWith("/") ? account.referer! : `${account.referer}/`;
  }
  if (post) base["Content-Type"] = "application/json";
  if (account.userAgent) base["User-Agent"] = account.userAgent;
  return base;
}

export function buildAccountHeaders(account: PlatformAccount, post = false) {
  if (account.provider === "RAY") return rayHeaders(account, post);
  return obHeaders(account, post);
}

function originFromReferer(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return String(referer).replace(/\/+$/, "");
  }
}

function resolveProxyUrl(account: PlatformAccount): string | undefined {
  if (!account.proxyId) return undefined;
  const user = useUserStore();
  return user.proxyList.find((p) => p.proxyId === account.proxyId)?.url;
}

/** 对齐 A8 mr.get/post：经后端 http-relay 代发，避免 CORS / 支持 SOCKS 代理 */
async function relayRequest(
  account: PlatformAccount,
  targetUrl: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-proxy-url", targetUrl);
  if (account.referer) {
    headers.set("x-proxy-referer", account.referer);
    const origin = originFromReferer(account.referer);
    if (origin) headers.set("x-proxy-origin", origin);
  }
  if (account.userAgent) headers.set("x-proxy-useragent", account.userAgent);

  const socksProxy = resolveProxyUrl(account);
  if (socksProxy) headers.set("x-proxy", socksProxy);

  // 对齐 A8：仅当账号配置了 proxyId 时才走 localStorage.PROXY 外部 relay
  const a8Proxy =
    typeof localStorage !== "undefined" ? localStorage.getItem("PROXY")?.trim() : "";
  const relayUrl =
    socksProxy && a8Proxy ? a8Proxy.replace(/\/$/, "") : RELAY_PATH;

  const res = await fetch(relayUrl, {
    ...init,
    headers,
  });
  if (!res.ok && res.headers.get("content-type")?.includes("json")) {
    const errBody = await res.text();
    try {
      const parsed = JSON.parse(errBody) as { msg?: string; error?: string };
      throw new Error(parsed.msg || parsed.error || `HTTP ${res.status}`);
    } catch (e) {
      if (e instanceof Error && e.message !== `HTTP ${res.status}`) throw e;
    }
  }
  return res;
}

async function accountFetch(
  account: PlatformAccount,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!account.gateway) throw new Error("账号未配置 gateway");
  const targetUrl = `${account.gateway.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildAccountHeaders(account, init.method === "POST");
  return relayRequest(account, targetUrl, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
}

export async function accountGet<T = unknown>(account: PlatformAccount, path: string): Promise<T> {
  const res = await accountFetch(account, path);
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 160) || `HTTP ${res.status}`;
    if (text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; msg?: string; hint?: string };
        message = parsed.msg || parsed.error || message;
      } catch {
        /* keep text slice */
      }
    }
    throw new Error(message);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

export async function accountPostForm<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: Record<string, string | number>,
): Promise<T> {
  const res = await accountFetch(account, path, {
    method: "POST",
    body: new URLSearchParams(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])),
    ).toString(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

export async function accountPostJson<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await accountFetch(account, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

/** PB 等：POST 空 body，可覆盖鉴权头（x-app-data 等） */
export async function accountPostText<T = unknown>(
  account: PlatformAccount,
  path: string,
  body = "",
  headerOverride?: Record<string, string>,
): Promise<T> {
  const baseHeaders = headerOverride ?? buildAccountHeaders(account, true);
  const targetUrl = `${account.gateway!.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await relayRequest(account, targetUrl, {
    method: "POST",
    body,
    headers: baseHeaders,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 160) || `HTTP ${res.status}`;
    if (text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; msg?: string };
        message = parsed.msg || parsed.error || message;
      } catch {
        /* keep slice */
      }
    }
    throw new Error(message);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}
