import type { PlatformId } from "@/types/esport";

/** [changmen 扩展] EV 金色标记 / 正 EV 确认可用的 sharp 基准 */
export const VALUE_BET_SHARP_OPTIONS = ["PB", "RAY"] as const;
export type ValueBetSharpPlatform = (typeof VALUE_BET_SHARP_OPTIONS)[number];

export const DEFAULT_SHARP_PLATFORM: ValueBetSharpPlatform = "PB";
export const DEFAULT_MIN_EDGE_PCT = 3;
export const DEFAULT_NEAR_EDGE_PCT = 1;
export const DEFAULT_AUTO_BET_MIN_EDGE_PCT = 3;
export const DEFAULT_AUTO_BET_MAX_EDGE_PCT = 20;
export const DEFAULT_AUTO_BET_MIN_ODDS = 1.3;
export const DEFAULT_AUTO_BET_MAX_ODDS = 10;
export const DEFAULT_AUTO_BET_MAX_PER_MAP = 1;

/** 历史默认（sharp=PB）；运行时请用 valueBetCalcOptsFromPrefs */
export const SHARP_PLATFORM: PlatformId = DEFAULT_SHARP_PLATFORM;
export const MIN_EDGE = DEFAULT_MIN_EDGE_PCT / 100;
export const NEAR_EDGE = DEFAULT_NEAR_EDGE_PCT / 100;

/**
 * 可被标记的软盘候选。所选基准从中剔除；另一基准（PB↔RAY）可作为软盘。
 * 名单沿用现网白名单，另加 PB 以便 RAY 作基准时能标 PB。
 */
export const VALUE_BET_SOFT_CANDIDATES: readonly PlatformId[] = [
  "OB",
  "RAY",
  "IA",
  "SABA",
  "IMT",
  "Polymarket",
  "PB",
];

export function resolveSoftPlatforms(sharp: PlatformId): PlatformId[] {
  return VALUE_BET_SOFT_CANDIDATES.filter(p => p !== sharp);
}

/** sharp=PB 时的软盘名单（与改前白名单一致：不含 PB） */
export const SOFT_PLATFORMS: PlatformId[] = resolveSoftPlatforms(DEFAULT_SHARP_PLATFORM);

export interface ValueBetCalcOpts {
  sharp: PlatformId;
  minEdge: number;
  nearEdge: number;
  softPlatforms: PlatformId[];
}

export function normalizeValueBetSharp(raw: unknown): ValueBetSharpPlatform {
  return raw === "RAY" ? "RAY" : "PB";
}

export function normalizeValueBetEdgePct(raw: unknown, fallback: number): number {
  if (raw == null || raw === "")
    return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n))
    return fallback;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(20, Math.max(0.1, rounded));
}

/** 接近阈值不得高于正 EV，否则会把已达正 EV 的格子滤出 map。 */
export function clampValueBetNearEdgePct(nearEdgePct: number, minEdgePct: number): number {
  return Math.min(nearEdgePct, minEdgePct);
}

export function valueBetCalcOptsFromPrefs(prefs?: {
  sharp?: unknown;
  minEdgePct?: unknown;
} | null): ValueBetCalcOpts {
  const sharp = normalizeValueBetSharp(prefs?.sharp);
  const minEdgePct = normalizeValueBetEdgePct(prefs?.minEdgePct, DEFAULT_MIN_EDGE_PCT);
  const nearEdgePct = clampValueBetNearEdgePct(DEFAULT_NEAR_EDGE_PCT, minEdgePct);
  return {
    sharp,
    minEdge: minEdgePct / 100,
    nearEdge: nearEdgePct / 100,
    softPlatforms: resolveSoftPlatforms(sharp),
  };
}

/** 角标可见下限：正 EV 与接近取较小者，避免接近>正EV 时漏标金色。 */
export function evMarkerFloor(nearEdge: number, minEdge: number): number {
  return Math.min(nearEdge, minEdge);
}

export function normalizeValueBetOdds(raw: unknown, fallback: number): number {
  if (raw == null || raw === "")
    return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n))
    return fallback;
  const rounded = Math.round(n * 100) / 100;
  return Math.min(20, Math.max(1.01, rounded));
}

/** EV% 区间：上限不得低于下限。 */
export function clampValueBetEdgePctRange(minEdgePct: number, maxEdgePct: number): {
  minEdgePct: number;
  maxEdgePct: number;
} {
  if (maxEdgePct < minEdgePct)
    return { minEdgePct, maxEdgePct: minEdgePct };
  return { minEdgePct, maxEdgePct };
}

/** 基准赔率区间：上限不得低于下限。 */
export function clampValueBetOddsRange(minOdds: number, maxOdds: number): { minOdds: number; maxOdds: number } {
  if (maxOdds < minOdds)
    return { minOdds, maxOdds: minOdds };
  return { minOdds, maxOdds };
}

/** 扫描/落单用：把界面清空的 null、倒区间收成合法上下限，避免当 0 下出。 */
export function coerceValueBetAutoBetRuntime(raw?: {
  minEdgePct?: unknown;
  maxEdgePct?: unknown;
  minOdds?: unknown;
  maxOdds?: unknown;
  maxPerMap?: unknown;
} | null): {
  minEdgePct: number;
  maxEdgePct: number;
  minOdds: number;
  maxOdds: number;
  maxPerMap: number;
  minEdge: number;
  maxEdge: number;
} {
  const minEdgePct = normalizeValueBetEdgePct(raw?.minEdgePct, DEFAULT_AUTO_BET_MIN_EDGE_PCT);
  const maxEdgePct = normalizeValueBetEdgePct(raw?.maxEdgePct, DEFAULT_AUTO_BET_MAX_EDGE_PCT);
  const edge = clampValueBetEdgePctRange(minEdgePct, maxEdgePct);
  const minOdds = normalizeValueBetOdds(raw?.minOdds, DEFAULT_AUTO_BET_MIN_ODDS);
  const maxOdds = normalizeValueBetOdds(raw?.maxOdds, DEFAULT_AUTO_BET_MAX_ODDS);
  const odds = clampValueBetOddsRange(minOdds, maxOdds);
  const maxPerMap = normalizeValueBetCount(raw?.maxPerMap, DEFAULT_AUTO_BET_MAX_PER_MAP);
  return {
    minEdgePct: edge.minEdgePct,
    maxEdgePct: edge.maxEdgePct,
    minOdds: odds.minOdds,
    maxOdds: odds.maxOdds,
    maxPerMap,
    minEdge: edge.minEdgePct / 100,
    maxEdge: edge.maxEdgePct / 100,
  };
}

/** 同一地图 EV 下注次数：1–20，非法回退 fallback。 */
export function normalizeValueBetCount(raw: unknown, fallback: number): number {
  if (raw == null || raw === "")
    return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n))
    return fallback;
  return Math.min(20, Math.max(1, Math.round(n)));
}
