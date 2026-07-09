/**
 * [changmen 扩展] value-bet EV 标记：在赔率格上标记正EV机会（金色）。
 *
 * 集成：BetRow.vue → useEvMarker + evMarker.css
 * P1：点击金色 +x%（正 EV）→ 确认单边下单；双击赔率仍为手动下单。
 * 成功后绑方案 B 负 Link（💎），侧栏按时间排序，与 9999 🏆 区分。
 */

import "@/extensions/valueBet/evMarker.css";

export { useEvMarker } from "@/extensions/valueBet/useEvMarker";
export {
  computeValueBetEdge,
  isValueBetPositiveEdge,
} from "@/extensions/valueBet/computeValueBetEdge";
export {
  formatValueBetLabel,
  readValueBetMoney,
  valueBetSuggestedStake,
} from "@/extensions/valueBet/valueBetStake";
