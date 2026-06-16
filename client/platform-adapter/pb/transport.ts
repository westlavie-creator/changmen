/** 对齐 A8 `Zn`（pluginBridge）+ `k0`（auth headers）+ account 解析 */

import { a8PluginGet, a8PluginPost, hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { buildPbAuthHeaders } from "./auth";
import { useAccountStore } from "@/stores/accountStore";
import { PLATFORMS } from "@/shared/platform";
import type { PlatformAccount } from "@/models/platformAccount";

/** 对齐 A8 `Zn`：PB 采集/下注仅扩展代发 */
export const PB_PLUGIN_REQUIRED_MSG =
  "平博 PB 需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/client/chrome-extension，或使用 Electron 启动（内嵌扩展）";

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

function requirePluginRuntime(): void {
  if (!hasA8PluginRuntime()) throw new Error(PB_PLUGIN_REQUIRED_MSG);
}

/** 对齐 A8 `Zn.get` + `k0` */
export async function pbGet<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  requirePluginRuntime();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginGet(url, { headers });
  return unwrap<T>(raw);
}

/** 对齐 A8 `Zn.post` + `k0` */
export async function pbPost<T>(
  account: PlatformAccount,
  pathOrUrl: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  requirePluginRuntime();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : pbGatewayUrl(account, pathOrUrl);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  if (!headers) throw new Error("token error");
  const raw = await a8PluginPost(url, body, { headers });
  return unwrap<T>(raw);
}

/** 对齐 A8 `AQ` 的 `bv`：须为 PB 且余额已知 */
export function resolvePbAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.gateway && a.token && a.balance !== undefined,
  );
}
