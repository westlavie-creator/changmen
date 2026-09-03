/**
 * [changmen 扩展] 用户折叠全场或任意地图盘口：禁止该局自动/手动新开仓。
 * Map -1（非地图盘）不可折叠。状态仅 sessionStorage，不进 USERCONFIG / 服务端。
 *
 * 全局开关：折叠所有比赛的全场 + 各地图；关闭时清空全部单行 mute。
 */

import { ref, type Ref } from "vue";

export const MIN_FOLDABLE_MAP = 0;
export const MAP_BET_MUTE_SESSION_KEY = "MapBetMute";
export const MAP_BET_MUTE_GLOBAL_SESSION_KEY = "MapBetMuteGlobal";

const mutedKeys: Ref<Set<string>> = ref(new Set());
const globalMuteAll: Ref<boolean> = ref(false);
let loaded = false;

export function canFoldMap(round: number): boolean {
  return Number.isFinite(round) && round >= MIN_FOLDABLE_MAP;
}

export function muteKey(matchId: number, round: number): string {
  return `${matchId}:${round}`;
}

function readSessionKeys(): Set<string> {
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

function writeSessionKeys(keys: Set<string>): void {
  try {
    if (keys.size === 0)
      sessionStorage.removeItem(MAP_BET_MUTE_SESSION_KEY);
    else
      sessionStorage.setItem(MAP_BET_MUTE_SESSION_KEY, JSON.stringify([...keys]));
  }
  catch {
    /* ignore quota / private mode */
  }
}

function readSessionGlobal(): boolean {
  try {
    return sessionStorage.getItem(MAP_BET_MUTE_GLOBAL_SESSION_KEY) === "1";
  }
  catch {
    return false;
  }
}

function writeSessionGlobal(on: boolean): void {
  try {
    if (on)
      sessionStorage.setItem(MAP_BET_MUTE_GLOBAL_SESSION_KEY, "1");
    else
      sessionStorage.removeItem(MAP_BET_MUTE_GLOBAL_SESSION_KEY);
  }
  catch {
    /* ignore quota / private mode */
  }
}

/** 惰性加载；BetRow computed 应先读 `mapBetMuteKeys` / `mapBetMuteGlobal` 以建立依赖 */
export function ensureMapBetMuteLoaded(): void {
  if (loaded)
    return;
  loaded = true;
  mutedKeys.value = readSessionKeys();
  globalMuteAll.value = readSessionGlobal();
}

/** 供 Vue computed 订阅；勿在非 UI 路径依赖其响应式 */
export function mapBetMuteKeys(): Ref<Set<string>> {
  ensureMapBetMuteLoaded();
  return mutedKeys;
}

/** 全局折叠（全场 + 各地图）；供 Vue computed 订阅 */
export function mapBetMuteGlobal(): Ref<boolean> {
  ensureMapBetMuteLoaded();
  return globalMuteAll;
}

export function isMapMuteGlobal(): boolean {
  ensureMapBetMuteLoaded();
  return globalMuteAll.value;
}

/**
 * 打开：全局折叠所有可折盘（含后续新比赛/新图）。
 * 关闭：关全局，并清空全部单行 mute。
 * @returns 关闭后是否处于全局折叠
 */
export function setMapMuteGlobal(on: boolean): boolean {
  ensureMapBetMuteLoaded();
  if (on) {
    globalMuteAll.value = true;
    writeSessionGlobal(true);
    return true;
  }
  globalMuteAll.value = false;
  writeSessionGlobal(false);
  if (mutedKeys.value.size > 0) {
    mutedKeys.value = new Set();
    writeSessionKeys(mutedKeys.value);
  }
  return false;
}

/** @returns 切换后是否处于全局折叠 */
export function toggleMapMuteGlobal(): boolean {
  return setMapMuteGlobal(!isMapMuteGlobal());
}

/** 仅单行 mute（不含全局）；全局请用 isMapMuteGlobal / isMapMuteActive */
export function isMapMuted(matchId: number, round: number): boolean {
  ensureMapBetMuteLoaded();
  if (!canFoldMap(round))
    return false;
  return mutedKeys.value.has(muteKey(matchId, round));
}

/**
 * 是否生效中的折叠禁下（全局或单行）。
 * 该局正在 live（liveRound === round）时恒为 false：live 与折叠互斥。
 */
export function isMapMuteActive(
  matchId: number,
  round: number,
  liveRound: number,
): boolean {
  if (liveRound !== 0 && liveRound === round)
    return false;
  if (!canFoldMap(round))
    return false;
  ensureMapBetMuteLoaded();
  if (globalMuteAll.value)
    return true;
  return mutedKeys.value.has(muteKey(matchId, round));
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
  writeSessionKeys(next);
}

/**
 * 单行折叠切换。全局开启时 no-op（应先关总开关）。
 * @returns 折叠后是否处于 muted（true=已禁止下注）
 */
export function toggleMapMute(matchId: number, round: number): boolean {
  ensureMapBetMuteLoaded();
  if (!canFoldMap(round))
    return false;
  if (globalMuteAll.value)
    return true;
  const key = muteKey(matchId, round);
  const next = new Set(mutedKeys.value);
  if (next.has(key))
    next.delete(key);
  else
    next.add(key);
  mutedKeys.value = next;
  writeSessionKeys(next);
  return next.has(key);
}

/** 测试用：重置内存 + session */
export function resetMapBetMuteForTests(): void {
  loaded = false;
  mutedKeys.value = new Set();
  globalMuteAll.value = false;
  try {
    sessionStorage.removeItem(MAP_BET_MUTE_SESSION_KEY);
    sessionStorage.removeItem(MAP_BET_MUTE_GLOBAL_SESSION_KEY);
  }
  catch {
    /* ignore */
  }
}
