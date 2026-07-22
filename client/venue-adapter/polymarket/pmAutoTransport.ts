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
 * HTTP 选 extension 的条件（自动路由）：
 * Market WS 可达 + 插件在线 + 插件实测 CLOB /time 成功。
 * 仅 WS onopen 不够——没翻墙时 WS 偶通也会误选 extension，余额/下单全挂。
 */
export async function resolveHttpModeForAutoRoute(marketWsOk: boolean): Promise<PmHttpMode> {
  if (!marketWsOk)
    return "vps";
  const extension = await probeGamebetExtension();
  if (!extension)
    return "vps";
  const clobOk = await probePolymarketClobViaExtension();
  return clobOk ? "extension" : "vps";
}

/**
 * 角标切换 Market WS 时同步 HTTP：
 * - changmen → 强制 vps（本机官方 REST 不可用）
 * - official → 再测插件 CLOB，通才 extension
 */
export async function syncPmHttpModeWithMarketWs(
  marketWsMode: PmMarketWsSourceMode,
): Promise<PmHttpMode> {
  const httpMode = marketWsMode === "changmen"
    ? "vps"
    : await resolveHttpModeForAutoRoute(true);
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
 * - 可达：WS 直连官方；HTTP 仅当插件实测 CLOB 通才 extension，否则 VPS
 * - 不可达：WS + HTTP 均走 changmen VPS
 * 用户曾手动点角标切换时跳过 WS 自动路由（直到 logout 清除）；仍会纠偏不可用的 extension HTTP。
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
