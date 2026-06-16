/**
 * changmen 相对 A8 的「套利检测 + 自动下单」增强（集中入口）。
 *
 * A8 对齐路径（勿改本模块以外逻辑时参考）：
 * - 主循环 `matchStore.runMainLoopTick` → `pickArbLegs` + `getProviders()` + `executeArbBet`
 * - BetRow 标题：各行最高主/客赔 implied（bundle HomeView `c(bet)`）
 *
 * 本模块职责：
 * | 能力 | A8 | changmen |
 * |------|-----|----------|
 * | 比例 9999 单边下注 | 缺任一侧账号则 `continue` | 允许单边 + 负 `linkId` |
 * | Telegram 套利机会 | 无（仅下单成功推单群） | 全盘口 `pickArbLegs` + 可下单评估 + 价值下注 |
 * | BetRow 红线 / flash | 无 / bundle 内联 | `extensions/arbBet/ui` |
 *
 * 集成点：
 * - `matchStore.refreshOddsOnBets` → `onOddsRefreshed()`
 * - `executeArbBet` → `resolveRate9999SingleLeg` / `allowArbBetExecution` / `createArbLinkId`
 * - `BetRow.vue` → `useBetRowArbUi` + `ArbLineOverlay`
 */

export {
  ArbLineOverlay,
  useBetRowArbUi,
  useOddsFlashCell,
  useOddsAnchorMap,
  useArbLineOverlay,
} from "@/extensions/arbBet/ui";

export {
  allowArbBetExecution,
  createArbLinkId,
  isLegSkippedByRate9999,
  resolveRate9999SingleLeg,
} from "@/extensions/arbBet/rate9999";

export {
  evaluateArbOrderEligibility,
  type ArbOrderEligibility,
  type ArbOrderEligibilityContext,
} from "@/extensions/arbBet/eligibility";

export {
  assessValueBet,
  assessValueBetFromDefaultOdds,
  fairProbFromDefault,
  formatValueBetTelegramLine,
  type ValueBetAssessment,
  type ValueBetLeg,
  type ValueBetLegsInput,
} from "@/extensions/arbBet/valueBet";

export { onOddsRefreshed } from "@/extensions/arbBet/telegramScan";
export { sendArbOpportunityTelegram } from "@/extensions/arbBet/telegramMessage";
