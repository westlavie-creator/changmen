import { obProxy, pbProxy, rayProxy } from "@/api/platformProxy";
import type { CollectPlatformInfo } from "@/types/esport";
import { fetchWithRelay, isLikelyCorsOrNetwork, relayFetch } from "@/utils/httpRelay";
import { buildImtHeaders } from "@/utils/imtHeaders";
import { buildPbAuthHeaders } from "@/utils/pbHeaders";
import { SABA_PAGE_PATH } from "@/utils/sabaCore";
import { STAKE_GRAPHQL } from "@/utils/stakeCore";
import { rayApiPath } from "@/utils/rayPaths";
import type { CollectHttpSession } from "@/utils/collectSession";
import { PlatformAccount } from "@/models/platformAccount";
import { tfRequestHeaders } from "@/utils/tfAuth";

/** 对齐 A8 Ck(platform) */
function obHeaders(token: string): Record<string, string> {
  return {
    device: "1",
    lang: "cn",
    token,
    Accept: "application/json, text/plain, */*",
  };
}

function rayHeaders(token: string): Record<string, string> {
  const auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return {
    authorization: auth,
    Accept: "application/json, text/plain, */*",
  };
}

async function directGet<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

/**
 * A8 NMe：浏览器 axios 直连 OB gateway；本地 dev CORS 失败时回退 /esport/ob/proxy。
 */
export async function collectObGet<T>(
  platform: CollectPlatformInfo,
  path: string,
  query = "",
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("OB collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const q = query ? (apiPath.includes("?") ? "&" : "?") + query : "";
  const url = `${base}${apiPath}${q}`;
  try {
    return await directGet<T>(url, obHeaders(platform.Token));
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    console.warn("[OB] 直连失败，回退 ob/proxy", err);
    return obProxy<T>(path.replace(/^\//, ""), query);
  }
}

/**
 * A8 bQe：浏览器直连 RAY gateway；CORS 失败时回退 /esport/ray/proxy。
 */
export async function collectRayGet<T>(
  platform: CollectPlatformInfo,
  apiPath: string,
  query = "",
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("RAY collect platform not configured");
  }
  const path = rayApiPath(platform.Gateway, apiPath);
  const base = platform.Gateway.replace(/\/+$/, "");
  const q = query ? (path.includes("?") ? "&" : "?") + query : "";
  const url = `${base}${path}${q}`;
  try {
    return await directGet<T>(url, rayHeaders(platform.Token));
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    console.warn("[RAY] 直连失败，回退 ray/proxy", err);
    return rayProxy<T>(apiPath.replace(/^\//, ""), query);
  }
}

function iaHeaders(token: string): Record<string, string> {
  return { token, Accept: "application/json, text/plain, */*" };
}

/**
 * A8 NBe：TF /api/v8/events/；CORS 失败时走 http-relay。
 */
export async function collectTfGet<T>(
  platform: CollectPlatformInfo,
  query: Record<string, string>,
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("TF collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    combo: "false",
    outright: "false",
    lang: "zh",
    timezone: "Asia/Shanghai",
    ...query,
  });
  const url = `${base}/api/v8/events/?${qs}`;
  const headers = await tfRequestHeaders(platform.Token);
  try {
    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
    return JSON.parse(text) as T;
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    console.warn("[TF] 直连失败，回退 http-relay", err);
    return fetchWithRelay<T>(url, { method: "GET", headers });
  }
}

/** A8 CQe：IA GET gameListPageSplit */
export async function collectIaGet<T>(platform: CollectPlatformInfo, path: string): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("IA collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = iaHeaders(platform.Token);
  return fetchWithRelay<T>(url, { method: "GET", headers });
}

/** A8 CQe：IA POST getPointsListSplit */
export async function collectIaPost<T>(
  platform: CollectPlatformInfo,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("IA collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    ...iaHeaders(platform.Token),
    "Content-Type": "application/json",
  };
  return fetchWithRelay<T>(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function pbSessionAccount(session: CollectHttpSession): PlatformAccount {
  const row = new PlatformAccount({
    accountId: 0,
    provider: "PB",
    playerName: "",
    gateway: session.gateway,
    token: session.token,
    referer: session.referer,
    userAgent: session.userAgent,
    currency: "CNY",
    updateTime: Date.now(),
  });
  return row;
}

/** A8 PZe：PB euro odds GET；CORS 失败时回退 pb/proxy */
export async function collectPbGet<T>(session: CollectHttpSession, url: string): Promise<T> {
  const headers = buildPbAuthHeaders(pbSessionAccount(session));
  if (!headers) throw new Error("PB token 无效");
  try {
    return await directGet<T>(url, headers);
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    console.warn("[PB] 直连失败，回退 pb/proxy", err);
    return pbProxy<T>(url);
  }
}

/** A8 HQe/GQe：IMT POST；CORS 失败时走 http-relay */
export async function collectImtPost<T>(
  session: CollectHttpSession,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = session.gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildImtHeaders(session);
  return fetchWithRelay<T>(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** SABA 电竞页 HTML（对齐 backend saba_session.fetchEsportsPage） */
export async function fetchSabaEsportsPage(session: {
  gateway: string;
  token: string;
  sportPath?: string;
}): Promise<string> {
  const url = SABA_PAGE_PATH(session.gateway, session.token, session.sportPath ?? "43");
  const headers = {
    Accept: "text/html,application/xhtml+xml,*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  };
  try {
    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
    return text;
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    const res = await relayFetch(url, { method: "GET", headers });
    return res.text();
  }
}

/** Stake GraphQL SportIndex */
export async function collectStakeGraphql<T>(
  apiUrl: string,
  accessToken: string,
  sportSlug: string,
): Promise<T> {
  const url = `${apiUrl.replace(/\/+$/, "")}/_api/graphql`;
  const headers = {
    "content-type": "application/json",
    "x-language": "zh",
    "x-access-token": accessToken,
    "x-operation-name": "SportIndex",
    "x-operation-type": "query",
  };
  return fetchWithRelay<T>(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: STAKE_GRAPHQL,
      variables: { sport: sportSlug, groups: ["winner", "maps"] },
    }),
  });
}
