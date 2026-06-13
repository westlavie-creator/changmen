export const A8_MATCH_MAX_FUTURE_SEC: number;
export const A8_MATCH_LIST_MAX_FUTURE_SEC: number;
export const IM_ODDS_ACTIVE_MS: number;
export const A8_MATCH_MAX_FUTURE_MS: number;
export const A8_MATCH_LIST_MAX_FUTURE_MS: number;

export function normalizeEpochMs(raw: unknown): number;
export function a8StartTimeCollectAllowed(startMs: unknown): boolean;
export function a8StartTimeListAllowed(startMs: unknown): boolean;
