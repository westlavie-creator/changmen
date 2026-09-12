<script setup lang="ts">
/**
 * 屏幕外不挂盘口树。报价仍写入 sportOddsStore，滚进视口后格子直接读当前价。
 */
import FootballMarketBook from "@/components/football/FootballMarketBook.vue";
import type { ViewMatch } from "@/models/match";
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  match: ViewMatch;
  forceOn?: boolean;
}>(), {
  forceOn: false,
});

const el = ref<HTMLElement | null>(null);
const on = ref(false);
let io: IntersectionObserver | null = null;

function turnOn() {
  on.value = true;
  io?.disconnect();
  io = null;
}

watch(() => props.forceOn, (force) => {
  if (force)
    turnOn();
}, { immediate: true });

onMounted(() => {
  if (on.value)
    return;
  const node = el.value;
  if (!node || typeof IntersectionObserver !== "function") {
    turnOn();
    return;
  }
  const root = node.closest(".matchs");
  io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting))
      return;
    turnOn();
  }, {
    root: root instanceof Element ? root : null,
    rootMargin: "280px 0px",
    threshold: 0,
  });
  io.observe(node);
});

onUnmounted(() => {
  io?.disconnect();
  io = null;
});
</script>

<template>
  <div ref="el" class="fb-lazy">
    <FootballMarketBook v-if="on" :match="match" />
    <div v-else class="fb-lazy__ph" />
  </div>
</template>

<style scoped>
.fb-lazy {
  width: 100%;
  min-width: 0;
}
.fb-lazy__ph {
  min-height: 72px;
}
</style>
