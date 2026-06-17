/**
 * @deprecated 套利机会扫描已迁入主循环 `runArbBetRound`；保留兼容导出。
 */
export {
  OPPORTUNITY_SCAN_INTERVAL_MS,
  notifyArbOpportunityForBet,
  resetOpportunityScanThrottleForTest,
  shouldRunOpportunityScan,
} from "@/extensions/arbBet/arbOpportunityScan";

/** @deprecated 由 `runArbBetRound` 内 `shouldRunOpportunityScan` 替代 */
export function onOddsRefreshed(_minIntervalMs = 5000): void {}
