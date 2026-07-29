/**
 * 客户端采集/列表开赛时间窗 — 与 A8 bundle 一致（仅未来 1h 上限，无过去下限）。
 * Polymarket 为 [changmen 扩展]：电竞 discovery 窗在 VPS `polymarket-esports/api.js`，浏览器不扫盘。
 */
export {
  A8_MATCH_MAX_FUTURE_MS,
  A8_MATCH_LIST_MAX_FUTURE_MS,
  a8StartTimeCollectAllowed,
  a8StartTimeListAllowed,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
} from "@changmen/shared/time/match_time";
