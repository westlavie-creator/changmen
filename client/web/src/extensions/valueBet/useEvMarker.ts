import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { BetSide, ViewBet, ViewBetItem } from "@/models/match";
import { useMatchStore } from "@/stores/matchStore";
import { storeToRefs } from "pinia";
import { removVig, calcEdge } from "./evCalc";
import { SHARP_PLATFORM, SOFT_PLATFORMS, MIN_EDGE, NEAR_EDGE } from "./evConfig";

interface EvEntry {
  edge: number;
  fairOdds: number;
}

export function useEvMarker(bet: MaybeRefOrGetter<ViewBet>) {
  const { tick } = storeToRefs(useMatchStore());

  const evMap = computed(() => {
    void tick.value;
    const b = toValue(bet);
    const map = new Map<string, EvEntry>();

    const sharpItem = b.items.find((it) => it.type === SHARP_PLATFORM);
    if (!sharpItem) return map;

    const sharpHome = sharpItem.getOdds("Home");
    const sharpAway = sharpItem.getOdds("Away");
    if (!sharpHome || !sharpAway) return map;

    const fair = removVig(sharpHome, sharpAway);
    if (!fair) return map;

    for (const item of b.items) {
      if (item.type === SHARP_PLATFORM) continue;
      if (!SOFT_PLATFORMS.includes(item.type)) continue;

      for (const side of ["Home", "Away"] as BetSide[]) {
        const softOdds = item.getOdds(side);
        if (!softOdds) continue;
        const fairOdds = side === "Home" ? fair.fairHome : fair.fairAway;
        const edge = calcEdge(softOdds, fairOdds);
        if (edge > NEAR_EDGE) {
          map.set(`${item.type}:${side}`, { edge, fairOdds });
        }
      }
    }

    return map;
  });

  function _get(item: ViewBetItem, side: BetSide): EvEntry | undefined {
    return evMap.value.get(`${item.type}:${side}`);
  }

  function isPositiveEv(item: ViewBetItem, side: BetSide): boolean {
    const e = _get(item, side);
    return !!e && e.edge >= MIN_EDGE;
  }

  function isNearEv(item: ViewBetItem, side: BetSide): boolean {
    const e = _get(item, side);
    return !!e && e.edge >= NEAR_EDGE && e.edge < MIN_EDGE;
  }

  function evLabel(item: ViewBetItem, side: BetSide): string | undefined {
    const e = _get(item, side);
    if (!e || e.edge < NEAR_EDGE) return undefined;
    return `+${(e.edge * 100).toFixed(1)}%`;
  }

  const hasPbBaseline = computed(() => {
    void tick.value;
    const b = toValue(bet);
    const sharpItem = b.items.find((it) => it.type === SHARP_PLATFORM);
    if (!sharpItem) return false;
    return !!sharpItem.getOdds("Home") && !!sharpItem.getOdds("Away");
  });

  return { isPositiveEv, isNearEv, evLabel, hasPbBaseline };
}
