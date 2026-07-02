/**
 * 客户端采集/列表开赛时间窗 — 与 A8 bundle 一致（仅未来 1h 上限，无过去下限）。
 * Polymarket 为 [changmen 扩展] 场馆，见 venue-adapter/polymarket/api.ts 单独 6h 窗。
 */
export {
  A8_MATCH_MAX_FUTURE_MS,
  A8_MATCH_LIST_MAX_FUTURE_MS,
  a8StartTimeCollectAllowed,
  a8StartTimeListAllowed,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
} from "@changmen/shared/time/match_time";
