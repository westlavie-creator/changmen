import { a8PluginGetStore, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { parsePbVenueIdentity, pbAccountUsesLiveTab } from "./auth";

/** 扩展 storage：part888 页写入的活 localStorage 快照（与 GetConfig.token 同形） */
export const PB_LIVE_CREDENTIAL_STORE_KEY = "PB_LIVE_CREDENTIAL";

export interface PbLiveCredential {
  token: string;
  gateway?: string;
  referer?: string;
  capturedAt?: number;
}

function pbHost(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
    return host;
  }
  catch {
    return String(raw).replace(/^www\./i, "").toLowerCase();
  }
}

export function parsePbLiveCredential(response: unknown): PbLiveCredential | undefined {
  const root = response as {
    data?: Record<string, unknown>;
    response?: { data?: Record<string, unknown> };
  };
  const nested = root?.data?.[PB_LIVE_CREDENTIAL_STORE_KEY]
    ?? root?.response?.data?.[PB_LIVE_CREDENTIAL_STORE_KEY];
  const bag = (nested && typeof nested === "object"
    ? nested
    : (root?.data && typeof root.data.token === "string" ? root.data : root)) as Record<string, unknown> | undefined;
  if (!bag || typeof bag !== "object")
    return undefined;
  const token = typeof bag.token === "string" ? bag.token : "";
  if (!token.trim())
    return undefined;
  return {
    token,
    gateway: typeof bag.gateway === "string" ? bag.gateway : undefined,
    referer: typeof bag.referer === "string" ? bag.referer : undefined,
    capturedAt: typeof bag.capturedAt === "number" ? bag.capturedAt : undefined,
  };
}

/**
 * 账号已能解析会员 id 时，官网快照必须是同一会员。
 * 空 liveId / 异号 → false（禁止把别的登录态当成本账号，也禁止空快照冲掉 token）。
 */
export function pbLiveMemberMatchesAccount(
  account: Pick<PlatformAccount, "token">,
  cred: Pick<PbLiveCredential, "token">,
): boolean {
  const accId = parsePbVenueIdentity(account.token)?.venueMemberId || "";
  if (!accId)
    return true;
  const liveId = parsePbVenueIdentity(cred.token)?.venueMemberId || "";
  return Boolean(liveId) && liveId === accId;
}

/**
 * [changmen 扩展] 把官网活快照写进账号 token。
 * 515 / 会员不一致 / 站点不一致：不写，避免破坏 A8 k0 或串号。
 */
export function applyPbLiveCredentialToAccount(
  account: Pick<PlatformAccount, "token" | "gateway" | "referer">,
  cred: PbLiveCredential,
): boolean {
  if (!pbAccountUsesLiveTab(account))
    return false;
  if (!pbAccountUsesLiveTab({ token: cred.token }))
    return false;
  if (!pbLiveMemberMatchesAccount(account, cred))
    return false;

  const accHost = pbHost(account.gateway);
  const liveHost = pbHost(cred.gateway);
  if (accHost && liveHost && accHost !== liveHost)
    return false;

  let changed = false;
  if (account.token !== cred.token) {
    account.token = cred.token;
    changed = true;
  }
  if (cred.gateway && account.gateway !== cred.gateway) {
    account.gateway = cred.gateway;
    changed = true;
  }
  if (cred.referer && account.referer !== cred.referer) {
    account.referer = cred.referer;
    changed = true;
  }
  return changed;
}

let lastApplyAt = 0;
const APPLY_MIN_MS = 8_000;

/** 活标签代发后：校验页上会员；匹配才允许写回（写回仍节流）。 */
export type PbLiveCredentialGate = "ok" | "mismatch" | "missing";

export async function gatePbLiveCredentialFromPlugin(
  account: PlatformAccount,
): Promise<PbLiveCredentialGate> {
  if (!pbAccountUsesLiveTab(account) || !hasA8PluginRuntime())
    return "ok";
  try {
    const response = await a8PluginGetStore(PB_LIVE_CREDENTIAL_STORE_KEY);
    const cred = parsePbLiveCredential(response);
    if (!cred)
      return "missing";
    if (!pbLiveMemberMatchesAccount(account, cred))
      return "mismatch";
    const now = Date.now();
    if (now - lastApplyAt >= APPLY_MIN_MS) {
      applyPbLiveCredentialToAccount(account, cred);
      lastApplyAt = now;
    }
    return "ok";
  }
  catch {
    return "missing";
  }
}

export async function applyPbLiveCredentialFromPlugin(
  account: PlatformAccount,
): Promise<boolean> {
  return (await gatePbLiveCredentialFromPlugin(account)) === "ok";
}

export function resetPbLiveCredentialApplyClockForTest() {
  lastApplyAt = 0;
}
