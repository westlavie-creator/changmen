/**
 * [changmen 扩展] BetRow 套利可视化：赔率涨跌 flash、套利腿红线与利润角标。
 *
 * 集成：`BetRow.vue` → `useBetRowArbUi` + `ArbLineOverlay` + `arbBetUi.css`
 */

import "@/extensions/arbBet/ui/arbBetUi.css";

export { default as ArbLineOverlay } from "@/extensions/arbBet/ui/ArbLineOverlay.vue";
export { useBetRowArbUi } from "@/extensions/arbBet/ui/useBetRowArbUi";
export { useOddsFlashCell } from "@/extensions/arbBet/ui/useOddsFlash";
export { useOddsAnchorMap, useArbLineOverlay } from "@/extensions/arbBet/ui/useArbLineOverlay";
export {
  computeArbLineOverlay,
  oddsAnchorKey,
  type ArbLineBadge,
  type ArbLineSegment,
} from "@/extensions/arbBet/ui/arb_line";
