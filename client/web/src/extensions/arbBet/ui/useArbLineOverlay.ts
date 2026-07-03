import type { MaybeRefOrGetter, Ref, WatchSource } from "vue";
import type { ArbLineBadge, ArbLineSegment } from "@/extensions/arbBet/ui/arb_line";
import type { BetSide } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import { computed, nextTick, onMounted, onUnmounted, ref, toValue, watch } from "vue";
import {

  computeArbLineOverlay,
  oddsAnchorKey,
  resolveVueElement,
} from "@/extensions/arbBet/ui/arb_line";

/** 登记赔率格 DOM，供套利划线取 anchor */
export function useOddsAnchorMap() {
  const map = new Map<string, HTMLElement>();

  function bind(type: PlatformId, side: BetSide) {
    return (el: unknown) => {
      const key = oddsAnchorKey(type, side);
      const node = resolveVueElement(el);
      if (node)
        map.set(key, node);
      else map.delete(key);
    };
  }

  function get(type: PlatformId, side: BetSide): HTMLElement | undefined {
    return map.get(oddsAnchorKey(type, side));
  }

  return { bind, get };
}

/**
 * 在 container 内根据两腿 anchor 刷新套利连线几何（ResizeObserver + watch）。
 */
export function useArbLineOverlay(
  containerRef: Ref<HTMLElement | null>,
  resolveAnchors: () => {
    home: HTMLElement | undefined | null;
    away: HTMLElement | undefined | null;
  } | null,
  watchSources: WatchSource[],
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const active = computed(() => toValue(enabled) !== false);
  const line = ref<ArbLineSegment | null>(null);
  const badge = ref<ArbLineBadge | null>(null);

  function clearOverlay() {
    line.value = null;
    badge.value = null;
  }

  function refresh() {
    if (!active.value) {
      clearOverlay();
      return;
    }
    const root = containerRef.value;
    if (!root) {
      clearOverlay();
      return;
    }
    const anchors = resolveAnchors();
    if (!anchors) {
      clearOverlay();
      return;
    }
    const geom = computeArbLineOverlay(root, anchors.home, anchors.away);
    if (!geom) {
      clearOverlay();
      return;
    }
    line.value = geom.line;
    badge.value = geom.badge;
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    resizeObserver = new ResizeObserver(() => refresh());
  });

  function syncObserver(el: HTMLElement | null) {
    resizeObserver?.disconnect();
    if (!active.value || !el || !resizeObserver)
      return;
    resizeObserver.observe(el);
  }

  watch(
    containerRef,
    (el) => {
      syncObserver(el);
      nextTick(refresh);
    },
    { immediate: true },
  );

  watch(active, (on) => {
    if (!on) {
      resizeObserver?.disconnect();
      clearOverlay();
      return;
    }
    syncObserver(containerRef.value);
    nextTick(refresh);
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  watch(watchSources, () => nextTick(refresh), { deep: true });

  return { line, badge, refresh };
}
