import type { BetResult } from "@/models/betResult";

export type ArbMakeUpEnqueueSide = "enqueueA" | "enqueueB";

/** 锚腿：API 成功且场馆 settlement 为 filled（reject=false） */
function legFilledForMakeUpAnchor(
  result?: BetResult,
  venueNotFilled = false,
): boolean {
  return Boolean(result?.success && !venueNotFilled && !result.reject);
}

/** 败腿：API 失败，或场馆 settlement 非 filled */
function legFailedForMakeUpTarget(
  result?: BetResult,
  venueNotFilled = false,
): boolean {
  if (!result)
    return true;
  if (!result.success)
    return true;
  if (venueNotFilled || result.reject)
    return true;
  return false;
}

/** 套利补单配对：一腿 filled + 一腿败 → 补败腿；否则不入队 */
export function arbMakeUpSides(
  resultA?: BetResult,
  venueNotFilledA = false,
  resultB?: BetResult,
  venueNotFilledB = false,
): ArbMakeUpEnqueueSide | null {
  if (
    legFilledForMakeUpAnchor(resultA, venueNotFilledA)
    && legFailedForMakeUpTarget(resultB, venueNotFilledB)
  )
    return "enqueueB";

  if (
    legFilledForMakeUpAnchor(resultB, venueNotFilledB)
    && legFailedForMakeUpTarget(resultA, venueNotFilledA)
  )
    return "enqueueA";

  return null;
}
