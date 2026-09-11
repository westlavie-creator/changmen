/** [A8 可证实] bundle `Zn.get/post` + `Ly` + `k0`；`unwrap` 等价 PZe 的 `r.data` */

import { a8PluginGet, a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";
import { buildPbAuthHeaders, pbAccountUsesLiveTab } from "./auth";
import {
  isPbLiveTabDead,
  isPbTabMiss,
  PB_LIVE_TAB_UNAVAILABLE,
  pbLiveTabHardError,
  pbLiveTabRetryDelaysMs,
  readPbTabIdFromPlugin,
  setPbTabIdCached,
  takePbLiveTabDebug,
} from "./tabId";
import {
  applyPbLiveCredentialToAccount,
  gatePbLiveCredentialFromPlugin,
  parsePbLiveCredential,
  pbLiveMemberMatchesAccount,
  type PbLiveCredential,
} from "./liveCredential";
import { pbOddsUrl } from "./parse";
import { useAccountStore } from "../shared/webBridge";
import { PLATFORMS } from "../shared/platforms";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

/** 采集层提示文案（A8 无等价常量；仅 collect 侧 UX） */
export const PB_PLUGIN_REQUIRED_MSG =
  "平博 PB 需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/chrome-extension，或使用 Electron 启动（内嵌扩展）";

/** 活标签页登录会员 ≠ 投注账号：硬失败，勿当 tab miss 重试同一错误页 */
export const PB_LIVE_TAB_MEMBER_MISMATCH = "PB live tab member mismatch";

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

type PluginOpts = { headers?: Record<string, string>; tabId?: number; platform?: string; provider?: string };

function liveTabOpts(tabId: number, extraHeaders: Record<string, string> = {}): PluginOpts {
  return {
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
    tabId,
    platform: PLATFORMS.PB,
    provider: PLATFORMS.PB,
  };
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readEmbeddedLiveCredential(raw: unknown): PbLiveCredential | undefined {
  if (!raw || typeof raw !== "object")
    return undefined;
  const bag = raw as { pbLiveCredential?: unknown };
  if (bag.pbLiveCredential && typeof bag.pbLiveCredential === "object")
    return parsePbLiveCredential(bag.pbLiveCredential)
      ?? parsePbLiveCredential({ data: bag.pbLiveCredential });
  return undefined;
}

/**
 * 同帧快照优先；否则回落 storage。会员不一致 → mismatch。
 */
async function acceptPbLiveTabSession(
  account: PlatformAccount,
  raw: unknown,
): Promise<"ok" | "mismatch" | "missing"> {
  const embedded = readEmbeddedLiveCredential(raw);
  if (embedded) {
    if (!pbLiveMemberMatchesAccount(account, embedded))
      return "mismatch";
    applyPbLiveCredentialToAccount(account, embedded);
    return "ok";
  }
  return gatePbLiveCredentialFromPlugin(account);
}

/**
 * part888：只走官网标签，F5 空窗短重试。
 * 不要回退冻结核——过期 X-U 才是 TOKEN ERROR 来源。
 */
async function sendViaLiveTab<T>(
  account: PlatformAccount,
  extraHeaders: Record<string, string>,
  send: (opts: PluginOpts) => Promise<T | undefined>,
): Promise<T | undefined> {
  if (!pbAccountUsesLiveTab(account))
    return send(frozenOpts(account, extraHeaders) ?? {});

  const attempts = 1 + pbLiveTabRetryDelaysMs.length;
  const hosts = account.referer || account.gateway || "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0)
      await sleep(pbLiveTabRetryDelaysMs[i - 1] ?? 0);
    const tabId = await readPbTabIdFromPlugin(account);
    if (!tabId)
      continue;
    try {
      const raw = await send(liveTabOpts(tabId, extraHeaders));
      if (!isPbLiveTabDead(raw)) {
        const hard = pbLiveTabHardError(raw);
        if (hard) throw hard;
        // 页上会话必须是本账号会员，否则余额/下注会打到别人的登录态
        const gate = await acceptPbLiveTabSession(account, raw);
        if (gate === "mismatch")
          throw new Error(PB_LIVE_TAB_MEMBER_MISMATCH);
        return raw;
      }
    }
    catch (err) {
      if (!isPbTabMiss(err))
        throw err;
    }
  }
  setPbTabIdCached(undefined);
  const debug = takePbLiveTabDebug();
  const seen = debug && typeof debug === "object" && "ports" in debug
    ? (debug as { ports?: Array<{ host?: string }> }).ports?.map(p => p.host).filter(Boolean).join(", ")
    : "";
  throw new Error(
    hosts
      ? `PB 官网标签页暂时不可用（未找到 ${hosts} 的登录页${seen ? `；扩展连着：${seen}` : "；扩展未连上该站，请刷新平博页"}，请打开并刷新该站后重试）`
      : PB_LIVE_TAB_UNAVAILABLE,
  );
}

async function pbPluginGet(url: string, account: PlatformAccount, extraHeaders: Record<string, string> = {}) {
  return sendViaLiveTab(account, extraHeaders, (opts) => a8PluginGet(url, opts));
}

async function pbPluginPost(
  url: string,
  account: PlatformAccount,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return sendViaLiveTab(account, extraHeaders, (opts) => a8PluginPost(url, body, opts));
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
