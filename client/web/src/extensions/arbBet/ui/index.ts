/**
 * [changmen 扩展] BetRow 套利可视化：赔率涨跌 flash、套利腿红线与利润角标。
 *
 * 集成：`BetRow.vue` → `useBetRowArbUi` + `ArbLineOverlay` + `arbBetUi.css`
 */

import "@/extensions/arbBet/ui/arbBetUi.css";

export {
  type ArbLineBadge,
  type ArbLineSegment,
  computeArbLineOverlay,
  oddsAnchorKey,
} from "@/extensions/arbBet/ui/arb_line";
export { default as ArbLineOverlay } from "@/extensions/arbBet/ui/ArbLineOverlay.vue";
export { useArbLineOverlay, useOddsAnchorMap } from "@/extensions/arbBet/ui/useArbLineOverlay";
export { useBetRowArbUi } from "@/extensions/arbBet/ui/useBetRowArbUi";
export { useOddsFlashCell } from "@/extensions/arbBet/ui/useOddsFlash";
