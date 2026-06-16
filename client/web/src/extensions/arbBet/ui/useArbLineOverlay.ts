import { nextTick, onMounted, onUnmounted, ref, watch, type Ref, type WatchSource } from "vue";
import type { BetSide } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import {
  computeArbLineOverlay,
  oddsAnchorKey,
  resolveVueElement,
  type ArbLineBadge,
  type ArbLineSegment,
} from "@/extensions/arbBet/ui/arb_line";

/** 登记赔率格 DOM，供套利划线取 anchor */
export function useOddsAnchorMap() {
  const map = new Map<string, HTMLElement>();

  function bind(type: PlatformId, side: BetSide) {
    return (el: unknown) => {
      const key = oddsAnchorKey(type, side);
      const node = resolveVueElement(el);
      if (node) map.set(key, node);
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
) {
  const line = ref<ArbLineSegment | null>(null);
  const badge = ref<ArbLineBadge | null>(null);

  function refresh() {
    const root = containerRef.value;
    if (!root) {
      line.value = null;
      badge.value = null;
      return;
    }
    const anchors = resolveAnchors();
    if (!anchors) {
      line.value = null;
      badge.value = null;
      return;
    }
    const geom = computeArbLineOverlay(root, anchors.home, anchors.away);
    if (!geom) {
      line.value = null;
      badge.value = null;
      return;
    }
    line.value = geom.line;
    badge.value = geom.badge;
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    resizeObserver = new ResizeObserver(() => refresh());
  });

  watch(
    containerRef,
    (el) => {
      resizeObserver?.disconnect();
      if (el && resizeObserver) resizeObserver.observe(el);
      nextTick(refresh);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  watch(watchSources, () => nextTick(refresh), { deep: true });

  return { line, badge, refresh };
}
