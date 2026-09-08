<script setup lang="ts">
/** 让球/大小盘口线：按本行 oid 读 live line，不重建整列。 */
import { computed } from "vue";
import { formatFootballLine } from "@/runtime/footballMarketLayout";
import { resolveFootballCellLine } from "@/runtime/footballMarketRows";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";

const props = withDefaults(defineProps<{
  oddIds?: string[];
  fallback?: number | null;
  format?: "raw" | "signed" | "signed-neg" | "ml-home" | "ml-away";
}>(), {
  oddIds: () => [],
  format: "raw",
});

const obLive = useObSportLiveStore();

const line = computed(() => resolveFootballCellLine(
  props.oddIds || [],
  props.fallback,
  oid => obLive.getLine(oid),
));

const text = computed(() => {
  const n = line.value;
  if (n == null)
    return "";
  if (props.format === "raw")
    return String(n);
  if (props.format === "signed")
    return formatFootballLine(n);
  if (props.format === "signed-neg")
    return formatFootballLine(-n);
  if (!Number.isFinite(n) || n === 0)
    return "";
  if (props.format === "ml-home")
    return ` ${formatFootballLine(n)}`;
  return ` ${formatFootballLine(-n)}`;
});
</script>

<template>
  <span v-if="text">{{ text }}</span>
</template>
