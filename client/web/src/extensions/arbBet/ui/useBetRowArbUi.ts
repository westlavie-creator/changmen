import type { MaybeRefOrGetter } from "vue";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { computed, ref, toValue } from "vue";
import { arbLegSide, pickArbLegs } from "@/domain/arbitrage";
import { providerKeysFromBetItems } from "@/domain/betting/providerKeys";
import { useArbLineOverlay, useOddsAnchorMap } from "@/extensions/arbBet/ui/useArbLineOverlay";
import { useOddsFlashCell } from "@/extensions/arbBet/ui/useOddsFlash";
import { percent } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";

/**
 * [changmen 扩展] BetRow 套利 UI：全盘口 pickArbLegs 红线、利润角标、赔率涨跌 flash。
 * A8 默认 BetRow 仅标题 implied；本 composable 集中扩展展示逻辑。
 */
export function useBetRowArbUi(
  match: MaybeRefOrGetter<ViewMatch>,
  bet: MaybeRefOrGetter<ViewBet>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const active = computed(() => toValue(enabled) !== false);
  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const itemsContainerRef = ref<HTMLElement | null>(null);
  const anchorMap = useOddsAnchorMap();
  const flash = useOddsFlashCell(enabled);

  const legs = computed(() => {
    if (!active.value)
      return null;
    const b = toValue(bet);
    const m = toValue(match);
    const providerKeys = providerKeysFromBetItems(b);
    return pickArbLegs(
      b,
      configStore.config,
      providerKeys,
      accountStore.accounts,
      m.game,
    );
  });

  const overlayLabel = computed(() => {
    const L = legs.value;
    return L ? percent(L.implied) : undefined;
  });

  function isArbLeg(item: ViewBetItem, side: BetSide): boolean {
    if (!active.value)
      return false;
    return arbLegSide(legs.value ?? undefined, item, side);
  }

  function bindOddsAnchor(type: ViewBetItem["type"], side: BetSide) {
    if (!active.value)
      return undefined;
    return anchorMap.bind(type, side);
  }

  const { line, badge } = useArbLineOverlay(
    itemsContainerRef,
    () => {
      if (!active.value)
        return null;
      const L = legs.value;
      if (!L)
        return null;
      return {
        home: anchorMap.get(L.homeItem.type, "Home"),
        away: anchorMap.get(L.awayItem.type, "Away"),
      };
    },
    [legs, active],
    enabled,
  );

  return {
    itemsContainerRef,
    line,
    badge,
    overlayLabel,
    isArbLeg,
    bindOddsAnchor,
    ...flash,
  };
}
