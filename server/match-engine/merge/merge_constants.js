/**
 * 跨平台合并与 align 共用的时间窗常量。
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time.mjs";

/** 开赛时间 ±15 分钟视为同一场（与 alignUnmatchedToClientMatches 一致） */
export const MERGE_START_TIME_TOLERANCE_MS = 15 * 60 * 1000;

export function startTimesCompatible(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b) return true;
  return Math.abs(a - b) <= MERGE_START_TIME_TOLERANCE_MS;
}
