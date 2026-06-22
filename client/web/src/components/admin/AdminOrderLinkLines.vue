<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

interface LinkPath {
  id: string;
  d: string;
  color: string;
}

const props = defineProps<{
  containerRef: HTMLElement | null;
}>();

const svgWidth = ref(0);
const svgHeight = ref(0);
const paths = ref<LinkPath[]>([]);

let resizeObs: ResizeObserver | null = null;
let mutationObs: MutationObserver | null = null;
let rafId = 0;

function scheduleRecalc() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(recalc);
}

function recalc() {
  const container = props.containerRef;
  if (!container) {
    paths.value = [];
    return;
  }

  const cRect = container.getBoundingClientRect();
  const sl = container.scrollLeft;
  const st = container.scrollTop;

  svgWidth.value = container.scrollWidth;
  svgHeight.value = container.scrollHeight;

  const allFieldsets = container.querySelectorAll<HTMLElement>("[data-link-id]");
  const byLinkId = new Map<string, { el: HTMLElement; col: HTMLElement }[]>();

  for (const el of allFieldsets) {
    const linkId = el.dataset.linkId;
    if (!linkId || linkId === "0" || Number(linkId) <= 0)
      continue;
    const col = el.closest(".workspace-col, .admin-orders-account-col") as HTMLElement | null;
    if (!col)
      continue;
    if (!byLinkId.has(linkId))
      byLinkId.set(linkId, []);
    byLinkId.get(linkId)!.push({ el, col });
  }

  const newPaths: LinkPath[] = [];

  for (const [linkId, items] of byLinkId) {
    const colMap = new Map<HTMLElement, HTMLElement[]>();
    for (const { el, col } of items) {
      if (!colMap.has(col))
        colMap.set(col, []);
      colMap.get(col)!.push(el);
    }
    if (colMap.size < 2)
      continue;

    const cols = [...colMap.entries()].sort((a, b) => {
      const ar = a[0].getBoundingClientRect();
      const br = b[0].getBoundingClientRect();
      return ar.left - br.left;
    });

    let color = "rgba(144, 147, 153, 0.5)";
    for (const { el } of items) {
      const legend = el.querySelector("legend");
      if (legend?.classList.contains("success")) {
        color = "rgba(103, 194, 58, 0.6)";
        break;
      }
      if (legend?.classList.contains("fail")) {
        color = "rgba(245, 108, 108, 0.6)";
        break;
      }
    }

    for (let i = 0; i < cols.length - 1; i++) {
      const leftEls = cols[i][1];
      const rightEls = cols[i + 1][1];

      const lr = leftEls[0].getBoundingClientRect();
      const rr = rightEls[0].getBoundingClientRect();

      // 相对于容器内容区（含滚动偏移）
      const x1 = lr.right - cRect.left + sl;
      const y1 = lr.top + lr.height / 2 - cRect.top + st;
      const x2 = rr.left - cRect.left + sl;
      const y2 = rr.top + rr.height / 2 - cRect.top + st;

      const gap = Math.abs(x2 - x1);
      const dx = Math.min(gap * 0.4, 40);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      newPaths.push({ id: `link-${linkId}-${i}`, d, color });
    }
  }

  paths.value = newPaths;
}

function setupObservers() {
  const container = props.containerRef;
  if (!container)
    return;
  resizeObs = new ResizeObserver(() => scheduleRecalc());
  resizeObs.observe(container);
  mutationObs = new MutationObserver(() => scheduleRecalc());
  mutationObs.observe(container, { childList: true, subtree: true });
  container.addEventListener("scroll", scheduleRecalc, { passive: true });
  // drawer 的滚动容器也要监听
  const drawer = container.closest(".el-drawer__body, .el-drawer");
  if (drawer)
    drawer.addEventListener("scroll", scheduleRecalc, { passive: true });
}

function teardownObservers() {
  const container = props.containerRef;
  container?.removeEventListener("scroll", scheduleRecalc);
  const drawer = container?.closest(".el-drawer__body, .el-drawer");
  if (drawer)
    drawer.removeEventListener("scroll", scheduleRecalc);
  resizeObs?.disconnect();
  resizeObs = null;
  mutationObs?.disconnect();
  mutationObs = null;
  cancelAnimationFrame(rafId);
}

watch(() => props.containerRef, (newRef, oldRef) => {
  if (oldRef)
    teardownObservers();
  if (newRef) {
    setupObservers();
    void nextTick(() => scheduleRecalc());
  }
});

onMounted(() => {
  if (props.containerRef) {
    setupObservers();
    void nextTick(() => scheduleRecalc());
  }
  setTimeout(() => recalc(), 500);
});

onBeforeUnmount(() => {
  teardownObservers();
});
</script>

<template>
  <svg
    class="admin-link-lines"
    :width="svgWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
  >
    <path
      v-for="p in paths"
      :key="p.id"
      :d="p.d"
      fill="none"
      :stroke="p.color"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
</template>
