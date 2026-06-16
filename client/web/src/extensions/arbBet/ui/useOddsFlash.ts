import { storeToRefs } from "pinia";
import type { BetSide, ViewBetItem } from "@/models/match";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";

/** [changmen 扩展] 赔率涨跌高亮与 HTTP/MQTT 来源角标（样式见 arbBetUi.css） */
export function useOddsFlashCell() {
  const oddsStore = useOddsStore();
  const matchStore = useMatchStore();
  const { revision } = storeToRefs(oddsStore);
  const { tick: matchTick } = storeToRefs(matchStore);

  function flashState(item: ViewBetItem, side: BetSide) {
    void revision.value;
    void matchTick.value;
    const id = side === "Home" ? item.homeId : item.awayId;
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
    const flash = flashState(item, side);
    if (!flash) return undefined;
    return flash.source === "mqtt" ? "M" : "H";
  }

  return { flashState, oddsCellClasses, sourceLabel };
}
