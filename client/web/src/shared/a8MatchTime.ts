/**
 * 客户端采集时间窗：复用 @changmen/shared，采集侧额外保留过去 12h 下限。
 * [changmen 扩展] 过去下限不在 A8 bundle 采集过滤中，见 shared/time/match_time.mjs 注释。
 */
import {
  A8_MATCH_MAX_FUTURE_MS,
  a8StartTimeListAllowed,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
} from "@changmen/shared/time/match_time";

export { A8_MATCH_MAX_FUTURE_MS, a8StartTimeListAllowed, IM_ODDS_ACTIVE_MS, normalizeEpochMs };

/** [changmen 扩展] 客户端采集：拒绝开赛超过 12h 的比赛 */
export const A8_MATCH_MAX_PAST_MS = 12 * 3600 * 1000;

export function a8StartTimeCollectAllowed(startMs: number): boolean {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  const now = Date.now();
  return ms >= now - A8_MATCH_MAX_PAST_MS && ms <= now + A8_MATCH_MAX_FUTURE_MS;
}
