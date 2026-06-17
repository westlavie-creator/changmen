/**
 * changmen 相对 A8 的「套利检测 + 自动下单」扩展（集中入口）。
 *
 * A8 对齐路径（核心逻辑，勿在 extensions 外加增强行为）：
 * - 主循环 `matchStore.runMainLoopTick` → `GetOrderOptions`（内部 `getProviders()`）→ `executeArbBet`
 * - BetRow 标题：各行最高主/客赔 implied（bundle HomeView `c(bet)`）
 *
 * 本模块职责：
 * | 能力 | A8 | changmen |
 * |------|-----|----------|
 * | 比例 9999 单边下注 | 缺任一侧账号则 `continue` | 对侧真下单 + 负 `linkId` |
 * | Telegram | 仅成功推单等（见 messageStore） | 同左（双腿版式，9999 侧标注不下单） |
 * | BetRow 红线 / flash | 无 / bundle 内联 | `extensions/arbBet/ui` |
 *
 * 集成点：
 * - `mainBetLoop` → `runArbBetRound` → `executeArbBet`
 * - `executeArbBet` → `resolveSingleLegByRate` / `allowArbBetExecution` / `createArbLinkId`
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
  SINGLE_LEG_RATE,
  allowArbBetExecution,
  arbAccountPickerFilter,
  createArbLinkId,
  explainAllowArbRejection,
  explainArbAccountRejection,
  findSingleLegRateAccount,
  isSingleLegRateAtOdds,
  legHasSingleLegRateAccount,
  resolveSingleLegByRate,
} from "@/extensions/arbBet/rate9999";
