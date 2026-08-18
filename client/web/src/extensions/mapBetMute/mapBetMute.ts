/**
 * [changmen 扩展] 用户折叠全场或任意地图盘口：禁止该局自动/手动新开仓。
 * Map -1（非地图盘）不可折叠。状态仅 sessionStorage，不进 USERCONFIG / 服务端。
 */

import { ref, type Ref } from "vue";

export const MIN_FOLDABLE_MAP = 0;
export const MAP_BET_MUTE_SESSION_KEY = "MapBetMute";

const mutedKeys: Ref<Set<string>> = ref(new Set());
let loaded = false;

export function canFoldMap(round: number): boolean {
  return Number.isFinite(round) && round >= MIN_FOLDABLE_MAP;
}

export function muteKey(matchId: number, round: number): string {
  return `${matchId}:${round}`;
}

function readSession(): Set<string> {
  try {
    const raw = sessionStorage.getItem(MAP_BET_MUTE_SESSION_KEY);
    if (!raw)
      return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string" && x.includes(":")));
  }
  catch {
    return new Set();
  }
}

function writeSession(keys: Set<string>): void {
  try {
    sessionStorage.setItem(MAP_BET_MUTE_SESSION_KEY, JSON.stringify([...keys]));
  }
  catch {
    /* ignore quota / private mode */
  }
}

/** 惰性加载；BetRow computed 应先读 `mapBetMuteKeys` 以建立依赖 */
export function ensureMapBetMuteLoaded(): void {
  if (loaded)
    return;
  loaded = true;
  mutedKeys.value = readSession();
}

/** 供 Vue computed 订阅；勿在非 UI 路径依赖其响应式 */
export function mapBetMuteKeys(): Ref<Set<string>> {
  ensureMapBetMuteLoaded();
  return mutedKeys;
}

export function isMapMuted(matchId: number, round: number): boolean {
  ensureMapBetMuteLoaded();
  if (!canFoldMap(round))
    return false;
  return mutedKeys.value.has(muteKey(matchId, round));
}

/**
 * 是否生效中的折叠禁下。
 * 该局正在 live（liveRound === round）时恒为 false：live 与折叠互斥。
 */
export function isMapMuteActive(
  matchId: number,
  round: number,
  liveRound: number,
): boolean {
  if (liveRound !== 0 && liveRound === round)
    return false;
  return isMapMuted(matchId, round);
}

/** 清除某局折叠（进入 live 时调用，避免结束后残留 mute） */
export function clearMapMute(matchId: number, round: number): void {
  ensureMapBetMuteLoaded();
  if (!canFoldMap(round))
    return;
  const key = muteKey(matchId, round);
  if (!mutedKeys.value.has(key))
    return;
  const next = new Set(mutedKeys.value);
  next.delete(key);
  mutedKeys.value = next;
  writeSession(next);
}

/** @returns 折叠后是否处于 muted（true=已禁止下注） */
export function toggleMapMute(matchId: number, round: number): boolean {
  ensureMapBetMuteLoaded();
  if (!canFoldMap(round))
    return false;
  const key = muteKey(matchId, round);
  const next = new Set(mutedKeys.value);
  if (next.has(key))
    next.delete(key);
  else
    next.add(key);
  mutedKeys.value = next;
  writeSession(next);
  return next.has(key);
}

/** 测试用：重置内存 + session */
export function resetMapBetMuteForTests(): void {
  loaded = false;
  mutedKeys.value = new Set();
  try {
    sessionStorage.removeItem(MAP_BET_MUTE_SESSION_KEY);
  }
  catch {
    /* ignore */
  }
}
