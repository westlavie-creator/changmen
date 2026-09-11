/** [A8 可证实] bundle `Zn.get/post` + `Ly` + `k0`；`unwrap` 等价 PZe 的 `r.data` */

import { a8PluginGet, a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";
import { buildPbAuthHeaders, pbAccountUsesLiveTab } from "./auth";
import { isPbLiveTabDead, isPbTabMiss, pbLiveTabHardError, readPbTabIdFromPlugin, setPbTabIdCached } from "./tabId";
import { pbOddsUrl } from "./parse";
import { useAccountStore } from "../shared/webBridge";
import { PLATFORMS } from "../shared/platforms";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

/** 采集层提示文案（A8 无等价常量；仅 collect 侧 UX） */
export const PB_PLUGIN_REQUIRED_MSG =
  "平博 PB 需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/chrome-extension，或使用 Electron 启动（内嵌扩展）";

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

function frozenOpts(account: PlatformAccount, extraHeaders: Record<string, string> = {}) {
  const headers = buildPbAuthHeaders(account, extraHeaders);
  return headers ? { headers } : undefined;
}

async function pbPluginOpts(
  account: PlatformAccount,
  extraHeaders: Record<string, string> = {},
): Promise<{ headers?: Record<string, string>; tabId?: number; platform?: string; provider?: string }> {
  const fallback = frozenOpts(account, extraHeaders);
  if (!pbAccountUsesLiveTab(account))
    return fallback ?? {};
  const tabId = await readPbTabIdFromPlugin();
  if (!tabId)
    return fallback ?? {};
  // 活头由标签页现读；这里只传 content-type 等业务头，避免冻结核 X-U 盖掉官网
  return {
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
    tabId,
    platform: PLATFORMS.PB,
    provider: PLATFORMS.PB,
  };
}

async function withLiveTabFallback<T>(
  tabId: number | undefined,
  live: () => Promise<T | undefined>,
  frozen: () => Promise<T | undefined>,
): Promise<T | undefined> {
  if (!tabId)
    return live();
  try {
    const raw = await live();
    if (!isPbLiveTabDead(raw)) {
      const hard = pbLiveTabHardError(raw);
      if (hard) throw hard;
      return raw;
    }
  }
  catch (err) {
    if (!isPbTabMiss(err))
      throw err;
  }
  setPbTabIdCached(undefined);
  return frozen();
}

async function pbPluginGet(url: string, account: PlatformAccount, extraHeaders: Record<string, string> = {}) {
  const opts = await pbPluginOpts(account, extraHeaders);
  return withLiveTabFallback(
    opts.tabId,
    () => a8PluginGet(url, opts),
    () => a8PluginGet(url, frozenOpts(account, extraHeaders)),
  );
}

async function pbPluginPost(
  url: string,
  account: PlatformAccount,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const opts = await pbPluginOpts(account, extraHeaders);
  return withLiveTabFallback(
    opts.tabId,
    () => a8PluginPost(url, body, opts),
    () => a8PluginPost(url, body, frozenOpts(account, extraHeaders)),
  );
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
  const raw = await pbPluginGet(url, account);
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
  const raw = await pbPluginGet(url, account, extraHeaders);
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
  const raw = await pbPluginPost(url, account, body, extraHeaders);
  if (raw == null) return undefined;
  return unwrap<T>(raw);
}

/** [A8 可证实] bundle `bv` */
export function resolvePbAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.balance !== undefined,
  );
}
