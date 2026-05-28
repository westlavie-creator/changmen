import { a8PluginGet, a8PluginPost } from "@/collectors/a8/pluginBridge";
import { buildPbAuthHeaders } from "@/collectors/pb/headers";
import type { PlatformAccount } from "@/models/platformAccount";

type PluginAxiosLike = { data?: unknown };

function unwrapPluginData<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as PluginAxiosLike).data as T;
  }
  return response as T;
}

/** 对齐 A8 `Ly(account, path)` */
export function pbGatewayUrl(account: Pick<PlatformAccount, "gateway">, path: string): string {
  const base = (account.gateway || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** PB 场馆 HTTP 统一走 A8 `Zn`（Chrome 扩展） */
export async function pbPluginGet<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginGet(url, { headers, withCredentials: true });
  return unwrapPluginData<T>(raw);
}

export async function pbPluginPost<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginPost(url, body, { headers, withCredentials: true });
  return unwrapPluginData<T>(raw);
}
