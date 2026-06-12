<script setup lang="ts">
import type { ArbLineBadge, ArbLineSegment } from "@/shared/arb_line";

defineProps<{
  line: ArbLineSegment | null;
  badge: ArbLineBadge | null;
  label?: string;
}>();
</script>

<template>
  <svg v-if="line" class="arb-lines" aria-hidden="true">
    <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
  </svg>
  <div
    v-if="line && badge && label"
    class="arb-profit-badge"
    :style="{ left: `${badge.x}px`, top: `${badge.y}px` }"
  >
    {{ label }}
  </div>
</template>
