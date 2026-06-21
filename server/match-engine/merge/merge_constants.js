/**
 * 跨平台合并与 align 共用的时间窗常量。
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

/** 开赛时间 ±30 分钟视为同一场（各平台上报时间差异较大） */
export const MERGE_START_TIME_TOLERANCE_MS = 30 * 60 * 1000;

export function startTimesCompatible(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b)
    return true;
  return Math.abs(a - b) <= MERGE_START_TIME_TOLERANCE_MS;
}

/** 队名合并 / 队名 align：双方均需有效开赛时间且在 ±15min 内 */
export function startTimesCompatibleStrict(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b)
    return false;
  return Math.abs(a - b) <= MERGE_START_TIME_TOLERANCE_MS;
}
