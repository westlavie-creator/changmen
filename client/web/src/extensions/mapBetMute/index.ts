/**
 * [changmen 扩展] 全场 / 各地图折叠禁下（UI + executeArbBet 早退）。
 * 含全局总开关：所有比赛的全场 + 地图。
 */

export {
  MIN_FOLDABLE_MAP,
  MAP_BET_MUTE_SESSION_KEY,
  MAP_BET_MUTE_GLOBAL_SESSION_KEY,
  canFoldMap,
  muteKey,
  ensureMapBetMuteLoaded,
  mapBetMuteKeys,
  mapBetMuteGlobal,
  isMapMuteGlobal,
  setMapMuteGlobal,
  toggleMapMuteGlobal,
  isMapMuted,
  isMapMuteActive,
  clearMapMute,
  toggleMapMute,
  resetMapBetMuteForTests,
} from "@/extensions/mapBetMute/mapBetMute";
