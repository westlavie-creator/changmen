/**
 * AutoYabo 决策复刻。跟单面板只调这里；不下单、不连 Playwright。
 *
 * 对齐：EV = OB/NVP-1、EV 上限 18、让球更高边、同场同向/反向闸门、
 * 自动等实时价、优先高 EV、副盘必须用该档 NVP。
 */
export type { PodYaboSettings, PodYaboLineMatch } from "./settings";
export { POD_YABO_SETTINGS_DEFAULTS, parsePodYaboSettings } from "./settings";
export {
  formatPodEv,
  maxObOddsForAlert,
  maxObOddsFromNvp,
  minObOddsForAlert,
  minObOddsFromNvp,
  podAlertNvp,
  podEvPercent,
  podYaboEdgePct,
} from "./ev";
export { POD_LOOSE_LINE_MAX, listPodBookNeighbors, lookupPodBookNvp } from "./book";
export type { PodBookNvpQuery } from "./book";
export {
  evaluatePodOutcomeGate,
  podOutcomeGateEntryFrom,
} from "./gate";
export type {
  PodOutcomeDecision,
  PodOutcomeGateEntry,
  PodOutcomeGateResult,
} from "./gate";
export { matchPodYaboMarket } from "./match";
export { comparePodYaboQuote } from "./quote";
export { scorePodYaboFollow } from "./score";
export type { PodYaboFollowScore, PodYaboScoreContext } from "./score";
export { pickPodYaboAutoTicket } from "./auto";
