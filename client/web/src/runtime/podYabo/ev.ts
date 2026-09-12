/**
 * AutoYabo EV：printExpectationResult = (venueOdds / noVig - 1) × 100。
 */
import type { PodDropAlert } from "@/runtime/podAlerts";
import { podAlertLineKind } from "@/runtime/podBetSettings";

export function podAlertNvp(alert: Pick<PodDropAlert, "nvp" | "current">): number {
  if (alert.nvp > 1)
    return alert.nvp;
  return alert.current;
}

export function podYaboEdgePct(
  alert: Pick<PodDropAlert, "lineType" | "market" | "outcome">,
  settings: { minObEdgePct: number; spreadObEdgePct: number },
): number {
  if (podAlertLineKind(alert) === "spreads")
    return settings.spreadObEdgePct;
  return settings.minObEdgePct;
}

export function minObOddsFromNvp(nvp: number, edgePct: number): number {
  if (!(nvp > 1))
    return 0;
  return Math.round(nvp * (1 + edgePct / 100) * 1000) / 1000;
}

export function maxObOddsFromNvp(nvp: number, maxObEdgePct: number): number {
  if (!(nvp > 1) || !(maxObEdgePct > 0))
    return 0;
  return Math.round(nvp * (1 + maxObEdgePct / 100) * 1000) / 1000;
}

export function minObOddsForAlert(
  alert: Pick<PodDropAlert, "nvp" | "current" | "lineType" | "market" | "outcome">,
  settings: { minObEdgePct: number; spreadObEdgePct: number },
): number {
  return minObOddsFromNvp(podAlertNvp(alert), podYaboEdgePct(alert, settings));
}

export function maxObOddsForAlert(
  alert: Pick<PodDropAlert, "nvp" | "current">,
  settings: { maxObEdgePct: number },
): number {
  return maxObOddsFromNvp(podAlertNvp(alert), settings.maxObEdgePct);
}

export function podEvPercent(quote: number, nvp: number): number {
  if (!(nvp > 1) || !(quote > 0))
    return 0;
  return Math.round((quote / nvp - 1) * 10000) / 100;
}

export function formatPodEv(evPercent: number): string {
  if (!Number.isFinite(evPercent) || evPercent === 0)
    return "EV —";
  const n = Math.round(evPercent * 10) / 10;
  return `EV ${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}
