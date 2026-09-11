<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  formatPodAgo,
  formatPodDropPct,
  formatPodOutcome,
  formatPodPeriod,
  formatPodPrice,
  isFreshPodAlert,
} from "@/runtime/podAlerts";
import { usePodAlertStore } from "@/stores/podAlertStore";

const POS_KEY = "changmen:podAlertPanel";
const DEFAULT_W = 420;
const DEFAULT_H = 460;
const MIN_W = 280;
const MIN_H = 180;
const HEADER_H = 40;
const MARGIN = 8;

const store = usePodAlertStore();
const { snapshot, portReady, alerts } = storeToRefs(store);

const collapsed = ref(false);
const left = ref(0);
const top = ref(72);
const width = ref(DEFAULT_W);
const height = ref(DEFAULT_H);
const dragging = ref(false);
const resizing = ref(false);
let dragDx = 0;
let dragDy = 0;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

const statusText = computed(() => {
  if (!portReady.value)
    return "扩展未连通";
  if (snapshot.value.sourceConnected && snapshot.value.gridFound)
    return `已连接 · ${alerts.value.length}`;
  if (snapshot.value.sourceConnected)
    return "请打开 Alerts [Dropping odds]";
  return "等待 POD 页";
});

const statusKind = computed(() => {
  if (snapshot.value.sourceConnected && snapshot.value.gridFound)
    return "ok";
  if (portReady.value)
    return "wait";
  return "idle";
});

const panelStyle = computed(() => ({
  left: `${left.value}px`,
  top: `${top.value}px`,
  width: `${width.value}px`,
  height: collapsed.value ? `${HEADER_H}px` : `${height.value}px`,
}));

function clampPos(x: number, y: number) {
  const w = width.value;
  const h = collapsed.value ? HEADER_H : height.value;
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - Math.min(h, 80) - MARGIN);
  left.value = Math.min(maxX, Math.max(MARGIN, x));
  top.value = Math.min(maxY, Math.max(MARGIN, y));
}

function clampSize(nextW: number, nextH: number) {
  const maxW = Math.max(MIN_W, window.innerWidth - left.value - MARGIN);
  const maxH = Math.max(MIN_H, window.innerHeight - top.value - MARGIN);
  width.value = Math.min(maxW, Math.max(MIN_W, Math.round(nextW)));
  height.value = Math.min(maxH, Math.max(MIN_H, Math.round(nextH)));
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw)
      return;
    const parsed = JSON.parse(raw) as {
      left?: unknown;
      top?: unknown;
      width?: unknown;
      height?: unknown;
      collapsed?: unknown;
    };
    if (typeof parsed.collapsed === "boolean")
      collapsed.value = parsed.collapsed;
    if (Number.isFinite(Number(parsed.width)) && Number.isFinite(Number(parsed.height)))
      clampSize(Number(parsed.width), Number(parsed.height));
    if (Number.isFinite(Number(parsed.left)) && Number.isFinite(Number(parsed.top)))
      clampPos(Number(parsed.left), Number(parsed.top));
  }
  catch { /* ignore */ }
}

function savePos() {
  localStorage.setItem(POS_KEY, JSON.stringify({
    left: left.value,
    top: top.value,
    width: width.value,
    height: height.value,
    collapsed: collapsed.value,
  }));
}

function onHeaderPointerDown(ev: PointerEvent) {
  if ((ev.target as HTMLElement | null)?.closest("button, .pod-alert-panel__resize"))
    return;
  dragging.value = true;
  dragDx = ev.clientX - left.value;
  dragDy = ev.clientY - top.value;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onHeaderPointerMove(ev: PointerEvent) {
  if (!dragging.value)
    return;
  clampPos(ev.clientX - dragDx, ev.clientY - dragDy);
}

function onHeaderPointerUp(ev: PointerEvent) {
  if (!dragging.value)
    return;
  dragging.value = false;
  try {
    (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
  }
  catch { /* ignore */ }
  savePos();
}

function onResizePointerDown(ev: PointerEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  resizing.value = true;
  resizeStartX = ev.clientX;
  resizeStartY = ev.clientY;
  resizeStartW = width.value;
  resizeStartH = height.value;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onResizePointerMove(ev: PointerEvent) {
  if (!resizing.value)
    return;
  clampSize(
    resizeStartW + (ev.clientX - resizeStartX),
    resizeStartH + (ev.clientY - resizeStartY),
  );
}

function onResizePointerUp(ev: PointerEvent) {
  if (!resizing.value)
    return;
  resizing.value = false;
  try {
    (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
  }
  catch { /* ignore */ }
  savePos();
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  savePos();
}

function onWindowResize() {
  clampSize(width.value, height.value);
  clampPos(left.value, top.value);
}

onMounted(() => {
  left.value = Math.max(MARGIN, window.innerWidth - DEFAULT_W - 16);
  loadPos();
  store.start();
  window.addEventListener("resize", onWindowResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onWindowResize);
  store.stop();
});
</script>

<template>
  <div
    class="pod-alert-panel"
    :class="{ 'is-collapsed': collapsed, 'is-dragging': dragging || resizing }"
    :style="panelStyle"
  >
    <div
      class="pod-alert-panel__header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @pointercancel="onHeaderPointerUp"
    >
      <span class="pod-alert-panel__dot" :class="`is-${statusKind}`" />
      <span class="pod-alert-panel__title">POD 降赔</span>
      <span class="pod-alert-panel__status">{{ statusText }}</span>
      <button type="button" class="pod-alert-panel__btn" @click="toggleCollapsed">
        {{ collapsed ? "展开" : "收起" }}
      </button>
    </div>
    <div v-show="!collapsed" class="pod-alert-panel__body">
      <p v-if="!snapshot.sourceConnected" class="pod-alert-panel__hint">
        请在<strong>同一 Chrome</strong>（已装 じらいや 1.3.58+）打开
        pinnacleoddsdropper.com/terminal 的 Dropping Odds。
        Cursor 内置浏览器里的登录不会进这里。
      </p>
      <p v-else-if="!snapshot.gridFound" class="pod-alert-panel__hint">
        已碰到 POD 页，请切到 Alerts [Dropping odds]。
      </p>
      <p v-else-if="!alerts.length" class="pod-alert-panel__hint">
        已连接，暂无告警。
      </p>
      <div v-else class="pod-alert-panel__list">
        <article
          v-for="alert in alerts"
          :key="alert.id"
          class="pod-alert-row"
          :class="{ 'is-fresh': isFreshPodAlert(alert.alertedAt) }"
        >
          <div class="pod-alert-row__top">
            <span class="pod-alert-row__drop">{{ formatPodDropPct(alert.dropPct) }}</span>
            <span class="pod-alert-row__match">{{ alert.home }} vs {{ alert.away }}</span>
          </div>
          <div class="pod-alert-row__meta">
            {{ alert.league }} · {{ formatPodPeriod(alert.period) }} · {{ formatPodOutcome(alert) }}
          </div>
          <div class="pod-alert-row__prices">
            <span>{{ formatPodPrice(alert.previous) }} → {{ formatPodPrice(alert.current) }}</span>
            <span>NVP {{ formatPodPrice(alert.nvp) }}</span>
            <span>{{ formatPodAgo(alert.alertedAt) }}</span>
          </div>
        </article>
      </div>
    </div>
    <button
      v-show="!collapsed"
      type="button"
      class="pod-alert-panel__resize"
      aria-label="缩放面板"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
      @pointercancel="onResizePointerUp"
    />
  </div>
</template>

<style scoped>
.pod-alert-panel {
  position: fixed;
  z-index: 1900;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 16px);
  color: #e8edf4;
  background: #12151ee6;
  border: 1px solid #ffffff24;
  border-radius: 10px;
  box-shadow: 0 12px 40px #00000073;
  backdrop-filter: blur(10px);
  user-select: none;
  overflow: hidden;
}

.pod-alert-panel.is-dragging {
  opacity: 0.92;
}

.pod-alert-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0 10px 0 12px;
  cursor: grab;
  border-bottom: 1px solid #ffffff14;
}

.pod-alert-panel.is-collapsed .pod-alert-panel__header {
  border-bottom: 0;
}

.pod-alert-panel__header:active {
  cursor: grabbing;
}

.pod-alert-panel__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ffffff66;
  flex-shrink: 0;
}

.pod-alert-panel__dot.is-ok {
  background: #67c23a;
  box-shadow: 0 0 8px #67c23acc;
}

.pod-alert-panel__dot.is-wait {
  background: #e6a23c;
  box-shadow: 0 0 8px #e6a23ccc;
}

.pod-alert-panel__title {
  font-size: 13px;
  font-weight: 700;
}

.pod-alert-panel__status {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-alert-panel__btn {
  border: 0;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}

.pod-alert-panel__btn:hover {
  color: #fff;
}

.pod-alert-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.pod-alert-panel__hint {
  margin: 0;
  padding: 14px 14px 16px;
  font-size: 12px;
  line-height: 1.55;
  color: #cbd5e1;
}

.pod-alert-panel__hint strong {
  color: #fff;
}

.pod-alert-panel__list {
  display: flex;
  flex-direction: column;
}

.pod-alert-row {
  padding: 10px 12px;
  border-bottom: 1px solid #ffffff0f;
}

.pod-alert-row.is-fresh {
  background: #67c23a14;
}

.pod-alert-row__top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pod-alert-row__drop {
  flex-shrink: 0;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 700;
}

.pod-alert-row__match {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-alert-row__meta,
.pod-alert-row__prices {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.pod-alert-row__prices {
  display: flex;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}

.pod-alert-panel__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 0 0 10px 0;
  background:
    linear-gradient(135deg, transparent 0 55%, #ffffff55 55% 62%, transparent 62% 72%, #ffffff55 72% 79%, transparent 79%);
  cursor: nwse-resize;
}
</style>
