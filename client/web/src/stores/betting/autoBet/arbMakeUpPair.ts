import type { BetResult } from "@/models/betResult";

export type ArbMakeUpEnqueueSide = "enqueueA" | "enqueueB";

function legSucceededForMakeUpAnchor(
  result?: BetResult,
  venueRejected = false,
  pendingConfirm = false,
): boolean {
  if (pendingConfirm && result?.success)
    return true;
  return Boolean(result?.success && !venueRejected && !result.reject);
}

function legFailedForMakeUpTarget(
  result?: BetResult,
  venueRejected = false,
  pendingConfirm = false,
): boolean {
  if (pendingConfirm)
    return false;
  if (!result)
    return true;
  if (!result.success)
    return true;
  if (venueRejected || result.reject)
    return true;
  return false;
}

/** 套利补单配对：锚腿成单（含 PM pending）且对腿失败 → 补对腿；否则不入队 */
export function arbMakeUpSides(
  resultA?: BetResult,
  rejectA = false,
  pendingA = false,
  resultB?: BetResult,
  rejectB = false,
  pendingB = false,
): ArbMakeUpEnqueueSide | null {
  if (
    legSucceededForMakeUpAnchor(resultA, rejectA, pendingA)
    && legFailedForMakeUpTarget(resultB, rejectB, pendingB)
  )
    return "enqueueB";

  if (
    legSucceededForMakeUpAnchor(resultB, rejectB, pendingB)
    && legFailedForMakeUpTarget(resultA, rejectA, pendingA)
  )
    return "enqueueA";

  return null;
}
