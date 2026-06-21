import type { PlatformAccount } from "@/models/platformAccount";
import { buildHttpRelayUrl } from "@changmen/api-contract/urls";
import { buildPbAuthHeaders } from "@platform/pb";
import { buildTfAccountHeaders, tfGatewayUrl } from "@platform/tf";
import { getApiBase } from "@/config/apiBase";
import { a8Axios, responseBodyText } from "@/shared/a8Axios";
import { useUserStore } from "@/stores/userStore";

export interface AccountHttpOptions {
  /** 对齐 A8 mr 最后一参 `!0`：有 proxyId 也强制浏览器直连 gateway */
  forceDirect?: boolean;
}

/** 对齐 A8 `b0(account)`：GET 也带 form Content-Type */
function obHeaders(account: PlatformAccount, _post = false) {
  const mobile = Boolean(account.userAgent && /mobile/i.test(account.userAgent));
  const base: Record<string, string> = {
    "device": mobile ? "2" : "1",
    "lang": "cn",
    "token": account.token || "",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  if (account.userAgent)
    base["User-Agent"] = account.userAgent;
  if (account.referer)
    base.Referer = account.referer;
  return base;
}

/** [A8 可证实] RAY `kw`：仅 authorization + Content-Type */
function rayHeaders(account: PlatformAccount, _post = false) {
  return {
    "authorization": account.token || "",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
}

export function buildAccountHeaders(account: PlatformAccount, post = false) {
  if (account.provider === "RAY")
    return rayHeaders(account, post);
  return obHeaders(account, post);
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

interface AccountHttpResult { status: number; text: string }

/**
 * 对齐 A8 mr.get/post：默认 Rr(Nr) 直连 gateway；仅 proxyId 且非 forceDirect 时走 PROXY + x-proxy-url。
 */
async function accountHttpRequest(
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

async function accountFetch(
  account: PlatformAccount,
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  opts?: AccountHttpOptions,
): Promise<AccountHttpResult> {
  if (!account.gateway)
    throw new Error("账号未配置 gateway");
  const targetUrl = `${account.gateway.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildAccountHeaders(account, init.method === "POST");
  return accountHttpRequest(
    account,
    targetUrl,
    {
      method: init.method,
      body: init.body,
      headers: { ...headers, ...init.headers },
    },
    opts?.forceDirect ?? false,
  );
}

export async function accountGet<T = unknown>(
  account: PlatformAccount,
  path: string,
  opts?: AccountHttpOptions,
): Promise<T> {
  const res = await accountFetch(account, path, {}, opts);
  const text = res.text;
  if (res.status >= 400) {
    let message = text.slice(0, 160) || `HTTP ${res.status}`;
    if (text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; msg?: string; hint?: string };
        message = parsed.msg || parsed.error || message;
      }
      catch {
        /* keep text slice */
      }
    }
    throw new Error(message);
  }
  try {
    return JSON.parse(text) as T;
  }
  catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

export async function accountPostForm<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: Record<string, string | number>,
  opts?: AccountHttpOptions,
): Promise<T> {
  const res = await accountFetch(
    account,
    path,
    {
      method: "POST",
      body: new URLSearchParams(
        Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])),
      ).toString(),
    },
    opts,
  );
  const text = res.text;
  try {
    return JSON.parse(text) as T;
  }
  catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

export async function accountPostJson<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: unknown,
  opts?: AccountHttpOptions,
): Promise<T> {
  const res = await accountFetch(
    account,
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    },
    opts,
  );
  const text = res.text;
  try {
    return JSON.parse(text) as T;
  }
  catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

/** PB 等：POST 空 body，可覆盖鉴权头（x-app-data 等） */
export async function accountPostText<T = unknown>(
  account: PlatformAccount,
  path: string,
  body = "",
  headerOverride?: Record<string, string>,
  opts?: AccountHttpOptions,
): Promise<T> {
  const baseHeaders = headerOverride ?? buildAccountHeaders(account, true);
  const targetUrl = `${account.gateway!.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await accountHttpRequest(
    account,
    targetUrl,
    {
      method: "POST",
      body,
      headers: baseHeaders,
    },
    opts?.forceDirect ?? false,
  );
  const text = res.text;
  if (res.status >= 400) {
    let message = text.slice(0, 160) || `HTTP ${res.status}`;
    if (text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; msg?: string };
        message = parsed.msg || parsed.error || message;
      }
      catch {
        /* keep slice */
      }
    }
    throw new Error(message);
  }
  try {
    return JSON.parse(text) as T;
  }
  catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  }
  catch {
    return text;
  }
}

async function accountHttpRaw(
  account: PlatformAccount,
  targetUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  forceDirect = false,
): Promise<{ status: number; text: string }> {
  return accountHttpRequest(account, targetUrl, init, forceDirect);
}

/** PB：GET + x-app-data 头（checkBet 回退拉 lineId） */
export async function accountPbGet<T = unknown>(
  account: PlatformAccount,
  targetUrl: string,
  opts?: AccountHttpOptions,
): Promise<T> {
  const headers = buildPbAuthHeaders(account);
  if (!headers)
    throw new Error("账号参数读取失败");
  const { status, text } = await accountHttpRaw(
    account,
    targetUrl,
    { method: "GET", headers },
    opts?.forceDirect ?? false,
  );
  if (status >= 400) {
    throw new Error(text.slice(0, 160) || `HTTP ${status}`);
  }
  return parseJsonLoose(text) as T;
}

export type TfAccountHttpOptions = AccountHttpOptions & {
  /** 对齐 A8 ly(account, !0)：合并 tf-authorization / public-token */
  signed?: boolean;
};

/** TF 账号 HTTP：默认 ly(account) 无签名；getOrders 等传 signed: true */
export async function accountTfGet<T = unknown>(
  account: PlatformAccount,
  path: string,
  opts?: TfAccountHttpOptions,
): Promise<{ status: number; data: T }> {
  if (!account.gateway || !account.token) {
    return { status: 401, data: {} as T };
  }
  const url = tfGatewayUrl(account.gateway, path);
  const headers = await buildTfAccountHeaders(account.token, { signed: opts?.signed });
  const { status, text } = await accountHttpRaw(
    account,
    url,
    { method: "GET", headers },
    opts?.forceDirect ?? false,
  );
  return { status, data: parseJsonLoose(text) as T };
}

export async function accountTfPost<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: unknown,
  opts?: TfAccountHttpOptions,
): Promise<{ status: number; data: T }> {
  if (!account.gateway || !account.token) {
    return { status: 401, data: {} as T };
  }
  const url = tfGatewayUrl(account.gateway, path);
  const headers = await buildTfAccountHeaders(account.token, { signed: opts?.signed });
  const { status, text } = await accountHttpRaw(
    account,
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    },
    opts?.forceDirect ?? false,
  );
  return { status, data: parseJsonLoose(text) as T };
}

function iaHeaders(account: PlatformAccount): Record<string, string> {
  return {
    "token": account.token || "",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
}

/** IA：form POST + token 头（对齐 A8 EYe / Qh） */
export async function accountIaPost<T = unknown>(
  account: PlatformAccount,
  path: string,
  body: string,
  opts?: AccountHttpOptions,
): Promise<T> {
  if (!account.gateway)
    throw new Error("账号未配置 gateway");
  const targetUrl = `${account.gateway.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await accountHttpRequest(
    account,
    targetUrl,
    {
      method: "POST",
      body,
      headers: iaHeaders(account),
    },
    opts?.forceDirect ?? false,
  );
  return parseJsonLoose(res.text) as T;
}

/** 通用 POST（自定义 URL + 头，供 IM / IMT / SABA / PB 等） */
export async function accountRelayPost<T = unknown>(
  account: PlatformAccount,
  targetUrl: string,
  body: string | null,
  headers: Record<string, string>,
  opts?: AccountHttpOptions,
): Promise<{ status: number; data: T }> {
  const { status, text } = await accountHttpRaw(
    account,
    targetUrl,
    {
      method: "POST",
      body: body ?? "",
      headers,
    },
    opts?.forceDirect ?? false,
  );
  return { status, data: parseJsonLoose(text) as T };
}

export async function accountRelayPostJson<T = unknown>(
  account: PlatformAccount,
  targetUrl: string,
  body: unknown,
  headers: Record<string, string>,
  opts?: AccountHttpOptions,
): Promise<{ status: number; data: T }> {
  return accountRelayPost(account, targetUrl, JSON.stringify(body), {
    "Content-Type": "application/json; charset=UTF-8",
    ...headers,
  }, opts);
}
