import { probeGamebetExtension } from "@changmen/client-core/chrome-plugin/bridge";
import { getPmMarketWsSourceMode, setPmMarketWsSourceMode, type PmMarketWsSourceMode } from "./pmMarketWsMode";
import {
  probePolymarketClobViaExtension,
  probePolymarketOfficialReachable,
} from "./pmOfficialReachability";
import { resolvePmHttpMode, setPmHttpMode, type PmHttpMode } from "./pmTransportMode";
import { getPmUserWsSourceMode, setPmUserWsSourceMode, type PmUserWsSourceMode } from "./pmUserWsMode";

const PM_TRANSPORT_MANUAL_OVERRIDE_KEY = "changmen:pm:transport-manual-override";

export type PmAutoTransportApplyResult = {
  applied: boolean;
  skippedManualOverride: boolean;
  reachable: boolean;
  httpMode: PmHttpMode;
  marketWsMode: PmMarketWsSourceMode;
  userWsMode: PmUserWsSourceMode;
};

const routingListeners = new Set<(result: PmAutoTransportApplyResult) => void>();

function readManualOverride(): boolean {
  try {
    return globalThis.localStorage?.getItem(PM_TRANSPORT_MANUAL_OVERRIDE_KEY) === "1";
  }
  catch {
    return false;
  }
}

export function isPmTransportManualOverride(): boolean {
  return readManualOverride();
}

export function markPmTransportManualOverride(): void {
  try {
    globalThis.localStorage?.setItem(PM_TRANSPORT_MANUAL_OVERRIDE_KEY, "1");
  }
  catch {
    /* ignore */
  }
}

export function clearPmTransportManualOverride(): void {
  try {
    globalThis.localStorage?.removeItem(PM_TRANSPORT_MANUAL_OVERRIDE_KEY);
  }
  catch {
    /* ignore */
  }
}

/** @internal vitest */
export function resetPmTransportManualOverrideForTests(): void {
  clearPmTransportManualOverride();
}

export function onPmAutoTransportApplied(
  listener: (result: PmAutoTransportApplyResult) => void,
): () => void {
  routingListeners.add(listener);
  return () => routingListeners.delete(listener);
}

function notifyRoutingApplied(result: PmAutoTransportApplyResult) {
  for (const listener of routingListeners)
    listener(result);
}

/**
 * 角标切到官方 WS 时，才允许 REST 走插件：
 * 插件在线 + 实测 CLOB /time。登录自动路由不再调用本函数。
 */
export async function resolveHttpModeForManualOfficialWs(): Promise<PmHttpMode> {
  const extension = await probeGamebetExtension();
  if (!extension)
    return "vps";
  const clobOk = await probePolymarketClobViaExtension();
  return clobOk ? "extension" : "vps";
}

/**
 * 角标切换 Market WS 时同步 HTTP（用户显式覆盖，不是登录自动升 extension）：
 * - changmen → 强制 vps
 * - official → 再测插件 CLOB，通才 extension
 */
export async function syncPmHttpModeWithMarketWs(
  marketWsMode: PmMarketWsSourceMode,
): Promise<PmHttpMode> {
  const httpMode = marketWsMode === "changmen"
    ? "vps"
    : await resolveHttpModeForManualOfficialWs();
  setPmHttpMode(httpMode);
  return httpMode;
}

/** 手动覆盖下纠偏 HTTP，避免卡在不可用的 extension */
async function reconcileHttpUnderManualOverride(): Promise<PmHttpMode> {
  let httpMode = resolvePmHttpMode();

  // WS 已是 changmen 时，本机官方 REST 不可用 → 强制 vps
  if (getPmMarketWsSourceMode() === "changmen" && httpMode !== "vps") {
    setPmHttpMode("vps");
    return "vps";
  }

  // WS 仍是 official 但 HTTP=extension：再测插件 CLOB；不通则降级（关墙后常见）
  if (httpMode === "extension") {
    const clobOk = await probePolymarketClobViaExtension();
    if (!clobOk) {
      setPmHttpMode("vps");
      return "vps";
    }
  }

  return httpMode;
}

async function applyModes(
  marketWsOk: boolean,
): Promise<Omit<PmAutoTransportApplyResult, "applied" | "skippedManualOverride" | "reachable"> & { reachable: boolean }> {
  // REST（book / 下单）固定 VPS，与余额同一出口；翻墙只切行情 WS。
  setPmHttpMode("vps");

  if (marketWsOk) {
    setPmMarketWsSourceMode("official");
    setPmUserWsSourceMode("official");
    return {
      reachable: true,
      httpMode: "vps",
      marketWsMode: "official",
      userWsMode: "official",
    };
  }

  setPmMarketWsSourceMode("changmen");
  setPmUserWsSourceMode("changmen");
  return {
    reachable: false,
    httpMode: "vps",
    marketWsMode: "changmen",
    userWsMode: "changmen",
  };
}

/**
 * 登录后：探测官方 Market WS。
 * - 可达：WS 直连官方；HTTP 一律 VPS（预检/下单同一出口）
 * - 不可达：WS + HTTP 均 changmen VPS
 * 角标手动切官方后才可能把 HTTP 升到 extension；仍会纠偏不可用的 extension。
 */
export async function applyPmAutoTransportOnLogin(): Promise<PmAutoTransportApplyResult> {
  if (readManualOverride()) {
    const httpMode = await reconcileHttpUnderManualOverride();
    return {
      applied: false,
      skippedManualOverride: true,
      reachable: getPmMarketWsSourceMode() === "official",
      httpMode,
      marketWsMode: getPmMarketWsSourceMode(),
      userWsMode: getPmUserWsSourceMode(),
    };
  }

  const probe = await probePolymarketOfficialReachable();
  const modes = await applyModes(probe.marketWsOk);
  const result: PmAutoTransportApplyResult = {
    applied: true,
    skippedManualOverride: false,
    ...modes,
  };
  notifyRoutingApplied(result);
  if (import.meta.env?.DEV) {
    console.info("[PM transport] auto route on login", {
      marketWsOk: probe.marketWsOk,
      httpOk: probe.httpOk,
      ...modes,
    });
  }
  return result;
}

/** logout 时清除手动覆盖，下次登录重新探测 */
export function resetPmTransportRoutingOnLogout(): void {
  clearPmTransportManualOverride();
}
