/** 对齐 A8 `Zn`（pluginBridge）+ `k0`（auth headers）+ account 解析 */

import { a8PluginGet, a8PluginPost } from "@/extension/bridge";
import { buildPbAuthHeaders } from "./auth";
import { useAccountStore } from "@/stores/accountStore";
import { PLATFORMS } from "@/shared/platform";
import type { PlatformAccount } from "@/models/platformAccount";

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

/** 对齐 A8 `Zn.get` + `k0`：通过插件发 GET，自动附加 PB 认证头 */
export async function pbGet<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginGet(url, { headers, withCredentials: true });
  return unwrap<T>(raw);
}

/** 对齐 A8 `Zn.post` + `k0`：通过插件发 POST，自动附加 PB 认证头 */
export async function pbPost<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginPost(url, body, { headers, withCredentials: true });
  return unwrap<T>(raw);
}

/** 对齐 A8 `AQ` 的 `bv`：须为 PB 且余额已知 */
export function resolvePbAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.gateway && a.token && a.balance !== undefined,
  );
}
