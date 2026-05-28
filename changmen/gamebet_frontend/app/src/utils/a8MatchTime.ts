/** 与 gamebet_backend/shared/a8_match_time.js 保持同步 */

export const A8_MATCH_MAX_FUTURE_MS = 3600 * 1000;
export const A8_MATCH_MAX_PAST_MS = 12 * 3600 * 1000;

/** IM Socket 仅推赔率：超过该时长无推送则不再落库 */
export const IM_ODDS_ACTIVE_MS = 3 * 60 * 60 * 1000;

export function normalizeEpochMs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return Math.floor(n * 1000);
  return Math.floor(n);
}

/** 对齐 A8 OB/SABA：`start_time < now/1000 + 3600` */
export function a8StartTimeCollectAllowed(startMs: number): boolean {
  if (!startMs) return true;
  const now = Date.now();
  return startMs >= now - A8_MATCH_MAX_PAST_MS && startMs <= now + A8_MATCH_MAX_FUTURE_MS;
}
