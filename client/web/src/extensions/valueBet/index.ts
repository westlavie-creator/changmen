/**
 * [changmen 扩展] value-bet EV 标记：在赔率格上标记正EV机会（金色）。
 *
 * 集成：BetRow.vue → useEvMarker + evMarker.css
 */

import "@/extensions/valueBet/evMarker.css";

export { useEvMarker } from "@/extensions/valueBet/useEvMarker";
