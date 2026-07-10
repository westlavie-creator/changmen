import type { MaybeRefOrGetter } from "vue";
import type { BetSide, ViewBet, ViewBetItem } from "@/models/match";
import { computed, toValue } from "vue";
import { useOddsStore } from "@/stores/oddsStore";
import { calcEdge, removVig } from "./evCalc";
import { MIN_EDGE, NEAR_EDGE, SHARP_PLATFORM, SOFT_PLATFORMS } from "./evConfig";

interface EvEntry {
  edge: number;
  fairOdds: number;
}

export function useEvMarker(
  bet: MaybeRefOrGetter<ViewBet>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const active = computed(() => toValue(enabled) !== false);
  const oddsStore = useOddsStore();

  function readOdds(item: ViewBetItem, side: BetSide): number {
    const id = item.getItemId(side);
    const fallback = side === "Home" ? item.fallbackHomeOdds : item.fallbackAwayOdds;
    return oddsStore.getOdds(item.type, id, fallback);
  }

  const evMap = computed(() => {
    if (!active.value)
      return new Map<string, EvEntry>();
    const b = toValue(bet);
    const map = new Map<string, EvEntry>();

    const sharpItem = b.items.find(it => it.type === SHARP_PLATFORM);
    if (!sharpItem)
      return map;

    const sharpHome = readOdds(sharpItem, "Home");
    const sharpAway = readOdds(sharpItem, "Away");
    if (!sharpHome || !sharpAway)
      return map;

    const fair = removVig(sharpHome, sharpAway);
    if (!fair)
      return map;

    for (const item of b.items) {
      if (item.type === SHARP_PLATFORM)
        continue;
      if (!SOFT_PLATFORMS.includes(item.type))
        continue;

      for (const side of ["Home", "Away"] as BetSide[]) {
        const softOdds = readOdds(item, side);
        if (!softOdds)
          continue;
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
    if (!e || e.edge < NEAR_EDGE)
      return undefined;
    // 第一期金额固定且仅配置用，角标只展示 edge%
    return `+${(e.edge * 100).toFixed(1)}%`;
  }

  const hasPbBaseline = computed(() => {
    if (!active.value)
      return false;
    const b = toValue(bet);
    const sharpItem = b.items.find(it => it.type === SHARP_PLATFORM);
    if (!sharpItem)
      return false;
    return !!readOdds(sharpItem, "Home") && !!readOdds(sharpItem, "Away");
  });

  return { isPositiveEv, isNearEv, evLabel, hasPbBaseline };
}
