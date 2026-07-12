import { probeGamebetExtension } from "@changmen/client-core/chrome-plugin/bridge";
import { getPmMarketWsSourceMode, setPmMarketWsSourceMode, type PmMarketWsSourceMode } from "./pmMarketWsMode";
import { probePolymarketOfficialReachable } from "./pmOfficialReachability";
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

async function resolveHttpModeForAutoRoute(marketWsOk: boolean): Promise<PmHttpMode> {
  if (!marketWsOk)
    return "vps";
  const extension = await probeGamebetExtension();
  return extension ? "extension" : "vps";
}

async function applyModes(
  marketWsOk: boolean,
): Promise<Omit<PmAutoTransportApplyResult, "applied" | "skippedManualOverride" | "reachable"> & { reachable: boolean }> {
  const httpMode = await resolveHttpModeForAutoRoute(marketWsOk);
  setPmHttpMode(httpMode);

  if (marketWsOk) {
    setPmMarketWsSourceMode("official");
    setPmUserWsSourceMode("official");
    return {
      reachable: true,
      httpMode,
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
 * 登录后：探测 Polymarket 官方 Market WS。
 * - 可达：WS 直连官方；HTTP 走浏览器插件代发（无插件则回退 VPS）
 * - 不可达：WS + HTTP 均走 changmen VPS
 * 用户曾手动点角标切换时跳过自动路由（直到 logout 清除）。
 */
export async function applyPmAutoTransportOnLogin(): Promise<PmAutoTransportApplyResult> {
  if (readManualOverride()) {
    return {
      applied: false,
      skippedManualOverride: true,
      reachable: getPmMarketWsSourceMode() === "official",
      httpMode: resolvePmHttpMode(),
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
