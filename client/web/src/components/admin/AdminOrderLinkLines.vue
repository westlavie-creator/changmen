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
    // 按列分组，只要跨列的
    const colMap = new Map<HTMLElement, HTMLElement[]>();
    for (const { el, col } of items) {
      if (!colMap.has(col))
        colMap.set(col, []);
      colMap.get(col)!.push(el);
    }
    if (colMap.size < 2)
      continue;

    // 按列的 offsetLeft 排序
    const cols = [...colMap.entries()].sort((a, b) => a[0].offsetLeft - b[0].offsetLeft);

    // 判断颜色：看 legend class
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

    // 相邻列之间画线
    for (let i = 0; i < cols.length - 1; i++) {
      const [leftCol, leftEls] = cols[i];
      const [rightCol, rightEls] = cols[i + 1];

      // 左侧：取第一个 fieldset 的中点，用 offsetTop/offsetLeft 相对于 container
      const leftEl = leftEls[0];
      const rightEl = rightEls[0];

      const x1 = leftCol.offsetLeft + leftCol.offsetWidth;
      const y1 = leftEl.offsetTop + leftEl.offsetHeight / 2
        + leftCol.offsetTop;
      const x2 = rightCol.offsetLeft;
      const y2 = rightEl.offsetTop + rightEl.offsetHeight / 2
        + rightCol.offsetTop;

      const dx = Math.abs(x2 - x1) * 0.4;
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
}

function teardownObservers() {
  const container = props.containerRef;
  container?.removeEventListener("scroll", scheduleRecalc);
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
