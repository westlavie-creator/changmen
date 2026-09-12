<script setup lang="ts">
/**
 * 足球赔率格：按 oddId 读 sportOddsStore，不订全局 tick，不读电竞 fo。
 */
import { computed } from "vue";
import { resolveFootballCellOdds } from "@/runtime/footballMarketRows";
import { useSportOddsStore } from "@/stores/sportOddsStore";

const props = withDefaults(defineProps<{
  venue?: string;
  oddId?: string;
  fallback?: number;
  compact?: boolean;
  label?: string;
  side?: string;
}>(), {
  fallback: 0,
  compact: false,
});

const sportOdds = useSportOddsStore();

const display = computed(() => resolveFootballCellOdds(
  props.venue || "OB",
  String(props.oddId || ""),
  Number(props.fallback) || 0,
  {
    get: (p, id) => sportOdds.get(p, id),
    has: (p, id) => sportOdds.has(p, id),
  },
));

const text = computed(() => {
  const n = display.value.odds;
  return n > 0 ? String(n) : "-";
});

const locked = computed(() => !(display.value.odds > 0));
</script>

<template>
  <div
    class="fb-sec__cell"
    :class="{ lock: locked, 'fb-sec__cell--sm': compact }"
    :data-odd-id="oddId || undefined"
    :data-pod-side="side || undefined"
    :data-pod-venue="venue || undefined"
  >
    <span v-if="label" class="fb-sec__lab">{{ label }}</span>
    <span class="fb-sec__odd">
      {{ text }}<span
        class="odds-src"
        :class="display.source === 'M' ? 'odds-src--m' : 'odds-src--h'"
      >{{ display.source }}</span>
    </span>
  </div>
</template>

<style scoped>
.fb-sec__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 28px;
  min-width: 48px;
  padding: 4px 6px;
  border-radius: 6px;
  background: hsla(210, 40%, 50%, 0.16);
  border: 1px solid hsla(210, 40%, 70%, 0.18);
}
.fb-sec__cell--sm {
  flex-direction: column;
  justify-content: center;
  min-height: 42px;
}
.fb-sec__lab {
  font-size: 11px;
  color: hsla(0, 0%, 100%, 0.62);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-sec__odd {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.odds-src {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  vertical-align: super;
  margin-left: 2px;
}
.odds-src--m {
  color: #86efac;
}
.odds-src--h {
  color: #94a3b8;
}
.fb-sec__cell.lock {
  opacity: 0.45;
}
.fb-sec__cell.is-pod-flash {
  outline: 2px solid #fde68a;
  box-shadow: 0 0 0 3px #fde68a55;
}
</style>
