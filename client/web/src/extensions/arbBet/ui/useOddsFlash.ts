import type { BetSide, ViewBetItem } from "@/models/match";
import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import { useOddsStore } from "@/stores/oddsStore";

/** [changmen 扩展] 赔率涨跌高亮与 HTTP/MQTT 来源角标（样式见 arbBetUi.css） */
export function useOddsFlashCell(enabled: MaybeRefOrGetter<boolean> = true) {
  const active = computed(() => toValue(enabled) !== false);
  const oddsStore = useOddsStore();

  function flashState(item: ViewBetItem, side: BetSide) {
    if (!active.value)
      return undefined;
    const id = side === "Home" ? item.homeId : item.awayId;
    const key = `${item.type}:${id}`;
    void oddsStore.flash.get(key);
    return oddsStore.getFlash(item.type, id);
  }

  function oddsCellClasses(item: ViewBetItem, side: BetSide): Record<string, boolean> {
    const flash = flashState(item, side);
    return {
      "odds-up": flash?.dir === "up",
      "odds-down": flash?.dir === "down",
    };
  }

  function sourceLabel(item: ViewBetItem, side: BetSide): string | undefined {
    if (!active.value)
      return undefined;
    const flash = flashState(item, side);
    if (!flash)
      return undefined;
    return flash.source === "mqtt" ? "M" : "H";
  }

  return { flashState, oddsCellClasses, sourceLabel };
}
