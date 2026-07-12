/** [A8 可证实] bundle `Zn.get/post` + `Ly` + `k0`；`unwrap` 等价 PZe 的 `r.data` */

import { a8PluginGet, a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";
import { buildPbAuthHeaders } from "./auth";
import { pbOddsUrl } from "./parse";
import { useAccountStore } from "@changmen/venue-adapter/shared/webBridge";
import { PLATFORMS } from "@changmen/venue-adapter/shared/platforms";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

/** 采集层提示文案（A8 无等价常量；仅 collect 侧 UX） */
export const PB_PLUGIN_REQUIRED_MSG =
  "平博 PB 需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/client/chrome-extension，或使用 Electron 启动（内嵌扩展）";

/** [A8 可证实] `Ly(t,e)=>`${t.gateway}${e}`` */
export function pbGatewayUrl(account: Pick<PlatformAccount, "gateway">, path: string): string {
  return `${account.gateway}${path}`;
}

function unwrap<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data?: unknown }).data as T;
  }
  return response as T;
}

/**
 * [A8 可证实] `gHe`：inline `${ny.gateway}/sports-service/sv/euro/odds?...` + `$n.get(e,{headers:Ah})`。
 * 不经 `Am`/`Ly`；与下注 `PZe` 的 `Am(account, path)` 路径分离。
 */
export async function pbCollectEuroOdds(
  account: PlatformAccount,
  isLive = true,
): Promise<Record<string, unknown> | undefined> {
  const url = pbOddsUrl(account.gateway!, isLive);
  const headers = buildPbAuthHeaders(account);
  const raw = await a8PluginGet(url, headers ? { headers } : undefined);
  if (raw == null) return undefined;
  return unwrap<Record<string, unknown>>(raw);
}

/** [A8 可证实] `PZe`/`Am` + `Zn.get(e,{headers:k0(...)})` → `r.data` */
export async function pbGet<T>(
  account: PlatformAccount,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<T | undefined> {
  const url = pbGatewayUrl(account, path);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  const raw = await a8PluginGet(url, headers ? { headers } : undefined);
  if (raw == null) return undefined;
  return unwrap<T>(raw);
}

/** [A8 可证实] `Zn.post(e,body,{headers:k0(...)})` → `r.data` */
export async function pbPost<T>(
  account: PlatformAccount,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T | undefined> {
  const url = pbGatewayUrl(account, path);
  const headers = buildPbAuthHeaders(account, extraHeaders);
  const raw = await a8PluginPost(url, body, headers ? { headers } : undefined);
  if (raw == null) return undefined;
  return unwrap<T>(raw);
}

/** [A8 可证实] bundle `bv` */
export function resolvePbAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.balance !== undefined,
  );
}
