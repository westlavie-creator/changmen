/**
 * 跨平台合并与 align 共用的时间窗常量。
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

/** 队名归一化合并 / name-align：开赛时间 ±30 分钟视为同一场 */
export const MERGE_START_TIME_TOLERANCE_MS = 30 * 60 * 1000;

/** gb_team_id（platform ID）合并 / id-align：各平台上报时间差更大，±60 分钟 */
export const MERGE_ID_START_TIME_TOLERANCE_MS = 60 * 60 * 1000;

export function startTimesCompatible(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b)
    return true;
  return Math.abs(a - b) <= MERGE_ID_START_TIME_TOLERANCE_MS;
}

/** 队名合并 / 队名 align：双方均需有效开赛时间且在 MERGE_START_TIME_TOLERANCE_MS 内 */
export function startTimesCompatibleStrict(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b)
    return false;
  return Math.abs(a - b) <= MERGE_START_TIME_TOLERANCE_MS;
}
