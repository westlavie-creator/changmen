import type { BetResult } from "@/models/betResult";

/** 套利补单锚定腿：API 成功且场馆未拒、无 PM settlement reject */
export function legSucceededForMakeUpAnchor(
  result?: BetResult,
  venueRejected = false,
): boolean {
  return Boolean(result?.success && !venueRejected && !result.reject);
}

/** 套利补单目标腿：API 失败、场馆拒单、或 PM unfilled/timeout */
export function legFailedForMakeUpTarget(
  result?: BetResult,
  venueRejected = false,
): boolean {
  if (!result)
    return true;
  if (!result.success)
    return true;
  if (venueRejected || result.reject)
    return true;
  return false;
}
