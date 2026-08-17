/**
 * [changmen 扩展] 全场 / 地图3+折叠禁下（UI + executeArbBet 早退）。
 */

export {
  MIN_FOLDABLE_MAP,
  MAP_BET_MUTE_SESSION_KEY,
  canFoldMap,
  muteKey,
  ensureMapBetMuteLoaded,
  mapBetMuteKeys,
  isMapMuted,
  isMapMuteActive,
  clearMapMute,
  toggleMapMute,
  resetMapBetMuteForTests,
} from "@/extensions/mapBetMute/mapBetMute";
