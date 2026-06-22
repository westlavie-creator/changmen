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
let scrollCleanup: (() => void) | null = null;

function recalc() {
  const container = props.containerRef;
  if (!container) {
    paths.value = [];
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;

  svgWidth.value = container.scrollWidth;
  svgHeight.value = container.scrollHeight;

  // Find all fieldsets with data-link-id
  const allFieldsets = container.querySelectorAll<HTMLElement>("[data-link-id]");
  const byLinkId = new Map<string, HTMLElement[]>();

  for (const el of allFieldsets) {
    const linkId = el.dataset.linkId;
    if (!linkId || linkId === "0" || Number(linkId) <= 0)
      continue;
    if (!byLinkId.has(linkId))
      byLinkId.set(linkId, []);
    byLinkId.get(linkId)!.push(el);
  }

  const newPaths: LinkPath[] = [];

  for (const [linkId, elements] of byLinkId) {
    if (elements.length < 2)
      continue;

    // Find which column each element belongs to
    const colElements = new Map<HTMLElement, HTMLElement[]>();
    for (const el of elements) {
      const col = el.closest(".admin-orders-account-col") as HTMLElement | null;
      if (!col)
        continue;
      if (!colElements.has(col))
        colElements.set(col, []);
      colElements.get(col)!.push(el);
    }

    // Only draw lines between different columns
    const columns = [...colElements.entries()];
    if (columns.length < 2)
      continue;

    // Sort columns by their horizontal position
    columns.sort((a, b) => {
      const aRect = a[0].getBoundingClientRect();
      const bRect = b[0].getBoundingClientRect();
      return aRect.left - bRect.left;
    });

    // Compute the profit for this link group to determine color
    let totalMoney = 0;
    let hasPending = false;
    for (const el of elements) {
      const fieldset = el;
      const legendEl = fieldset.querySelector("legend");
      if (legendEl) {
        if (legendEl.classList.contains("default"))
          hasPending = true;
        else if (legendEl.classList.contains("success"))
          totalMoney = 1; // positive
        else if (legendEl.classList.contains("fail"))
          totalMoney = -1; // negative
      }
    }

    let color: string;
    if (hasPending)
      color = "rgba(144, 147, 153, 0.6)"; // gray for pending
    else if (totalMoney > 0)
      color = "rgba(103, 194, 58, 0.6)"; // green for profit
    else if (totalMoney < 0)
      color = "rgba(245, 108, 108, 0.6)"; // red for loss
    else
      color = "rgba(144, 147, 153, 0.6)"; // gray default

    // Draw lines between adjacent column pairs
    for (let i = 0; i < columns.length - 1; i++) {
      const leftCol = columns[i];
      const rightCol = columns[i + 1];

      // Get the vertical center of the fieldset group in each column
      const leftEls = leftCol[1];
      const rightEls = rightCol[1];

      // Use the bounding box of all elements in the column for this link
      const leftRects = leftEls.map(el => el.getBoundingClientRect());
      const rightRects = rightEls.map(el => el.getBoundingClientRect());

      const leftTop = Math.min(...leftRects.map(r => r.top));
      const leftBottom = Math.max(...leftRects.map(r => r.bottom));
      const leftRight = Math.max(...leftRects.map(r => r.right));
      const leftMidY = (leftTop + leftBottom) / 2;

      const rightTop = Math.min(...rightRects.map(r => r.top));
      const rightBottom = Math.max(...rightRects.map(r => r.bottom));
      const rightLeft = Math.min(...rightRects.map(r => r.left));
      const rightMidY = (rightTop + rightBottom) / 2;

      // Convert to coordinates relative to the scrollable container
      const x1 = leftRight - containerRect.left + scrollLeft;
      const y1 = leftMidY - containerRect.top + scrollTop;
      const x2 = rightLeft - containerRect.left + scrollLeft;
      const y2 = rightMidY - containerRect.top + scrollTop;

      // Cubic bezier: control points at 40% of the horizontal distance
      const dx = (x2 - x1) * 0.4;
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      newPaths.push({
        id: `link-${linkId}-${i}`,
        d,
        color,
      });
    }
  }

  paths.value = newPaths;
}

function setupObservers() {
  const container = props.containerRef;
  if (!container)
    return;

  resizeObs = new ResizeObserver(() => recalc());
  resizeObs.observe(container);

  mutationObs = new MutationObserver(() => recalc());
  mutationObs.observe(container, { childList: true, subtree: true });

  const onScroll = () => recalc();
  container.addEventListener("scroll", onScroll, { passive: true });
  scrollCleanup = () => container.removeEventListener("scroll", onScroll);
}

function teardownObservers() {
  resizeObs?.disconnect();
  resizeObs = null;
  mutationObs?.disconnect();
  mutationObs = null;
  scrollCleanup?.();
  scrollCleanup = null;
}

watch(() => props.containerRef, (newRef, oldRef) => {
  if (oldRef)
    teardownObservers();
  if (newRef) {
    setupObservers();
    void nextTick(() => recalc());
  }
});

onMounted(() => {
  if (props.containerRef) {
    setupObservers();
    void nextTick(() => recalc());
  }
});

onBeforeUnmount(() => {
  teardownObservers();
});
</script>

<template>
  <svg
    v-if="paths.length"
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
