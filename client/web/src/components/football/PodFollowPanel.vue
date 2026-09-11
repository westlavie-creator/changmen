<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  formatPodDropPct,
  formatPodPrice,
  isFreshPodAlert,
} from "@/runtime/podAlerts";
import {
  POD_BET_SETTINGS_UPDATED,
  POD_FOLLOW_STAKE_PRESETS,
  readPodBetSettings,
  writePodBetSettings,
  type PodBetSettings,
} from "@/runtime/podBetSettings";
import {
  formatPodKickoff,
  formatPodRemain,
  formatPodStake,
  listPodFollowTickets,
} from "@/runtime/podBetTicket";
import { openFootballSettings } from "@/runtime/footballSettingsUi";
import {
  fixtureFromViewMatch,
  formatPodFixtureMatch,
  matchPodAlertToFixtures,
} from "@/runtime/podFixtureMatch";
import { useFootballStore } from "@/stores/footballStore";
import { usePodAlertStore } from "@/stores/podAlertStore";

const POS_KEY = "changmen:podFollowPanel";
const DEFAULT_W = 400;
const DEFAULT_H = 420;
const MIN_W = 280;
const MIN_H = 180;
const HEADER_H = 40;
const MARGIN = 8;

const store = usePodAlertStore();
const football = useFootballStore();
const { snapshot, portReady, alerts } = storeToRefs(store);
const { matchs } = storeToRefs(football);
const betSettings = ref<PodBetSettings>(readPodBetSettings());
const nowTick = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const boardFixtures = computed(() => matchs.value.map(fixtureFromViewMatch));
const tickets = computed(() => {
  const fixtures = boardFixtures.value;
  return listPodFollowTickets(alerts.value, betSettings.value, nowTick.value).map(ticket => ({
    ...ticket,
    fixtureMatch: matchPodAlertToFixtures(ticket.alert, fixtures),
  }));
});
const matchedCount = computed(() => tickets.value.filter(t => t.fixtureMatch.status === "matched").length);
const stakePresets = POD_FOLLOW_STAKE_PRESETS;

const stakeModel = computed({
  get: () => betSettings.value.stake,
  set: (v: number | undefined) => persistStake(v),
});

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
  if (!betSettings.value.enabled)
    return "筛选已关";
  if (!portReady.value)
    return "扩展未连通";
  if (snapshot.value.sourceConnected && snapshot.value.gridFound) {
    const n = tickets.value.length;
    const m = matchedCount.value;
    if (n && m)
      return `${n} 条可跟 · ${m} 已对上`;
    return `${n} 条可跟`;
  }
  if (snapshot.value.sourceConnected)
    return "等 Dropping Odds";
  return "等待 POD 页";
});

const statusKind = computed(() => {
  if (!betSettings.value.enabled)
    return "idle";
  if (tickets.value.length)
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
  if ((ev.target as HTMLElement | null)?.closest("button, .pod-follow-panel__resize"))
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

function persistStake(raw: number | null | undefined) {
  betSettings.value = writePodBetSettings({
    ...betSettings.value,
    stake: Number(raw) || 0,
  });
}

function reloadBetSettings() {
  betSettings.value = readPodBetSettings();
}

function openPodSettings() {
  openFootballSettings("pod");
}

onMounted(() => {
  left.value = Math.max(MARGIN, window.innerWidth - DEFAULT_W - 440);
  loadPos();
  store.start();
  reloadBetSettings();
  window.addEventListener("resize", onWindowResize);
  window.addEventListener(POD_BET_SETTINGS_UPDATED, reloadBetSettings);
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 1_000);
});

onUnmounted(() => {
  window.removeEventListener("resize", onWindowResize);
  window.removeEventListener(POD_BET_SETTINGS_UPDATED, reloadBetSettings);
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});
</script>

<template>
  <div
    class="pod-follow-panel"
    :class="{ 'is-collapsed': collapsed, 'is-dragging': dragging || resizing }"
    :style="panelStyle"
  >
    <div
      class="pod-follow-panel__header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @pointercancel="onHeaderPointerUp"
    >
      <span class="pod-follow-panel__dot" :class="`is-${statusKind}`" />
      <span class="pod-follow-panel__title">POD 跟单</span>
      <span class="pod-follow-panel__status">{{ statusText }}</span>
      <button type="button" class="pod-follow-panel__btn" @click="openPodSettings">
        设置
      </button>
      <button type="button" class="pod-follow-panel__btn" @click="toggleCollapsed">
        {{ collapsed ? "展开" : "收起" }}
      </button>
    </div>
    <div v-show="!collapsed" class="pod-follow-panel__stake" @pointerdown.stop>
      <span class="pod-follow-panel__stake-lab">下注金额</span>
      <el-input-number
        v-model="stakeModel"
        :min="0"
        :max="1000000"
        :step="10"
        :precision="0"
        size="small"
        controls-position="right"
      />
      <span class="pod-follow-panel__stake-unit">元</span>
      <button
        v-for="n in stakePresets"
        :key="n"
        type="button"
        class="pod-follow-panel__chip"
        :class="{ 'is-on': betSettings.stake === n }"
        @click="persistStake(n)"
      >
        {{ n }}
      </button>
    </div>
    <div v-show="!collapsed" class="pod-follow-panel__body">
      <p v-if="!betSettings.enabled" class="pod-follow-panel__hint">
        筛选已关。打开「足球设置 → POD跟单」后，过线的警报会出现在这里。降赔浮窗不受影响。
      </p>
      <p v-else-if="!snapshot.sourceConnected" class="pod-follow-panel__hint">
        等 POD 降赔连通后，这里只列符合门槛的票：买哪边、最低 OB、计划注码。不自动下单。
      </p>
      <p v-else-if="!tickets.length" class="pod-follow-panel__hint">
        当前没有过线的票。门槛在「足球设置 → POD跟单」。
      </p>
      <div v-else class="pod-follow-panel__list">
        <article
          v-for="ticket in tickets"
          :key="ticket.id"
          class="pod-follow-row"
          :class="{ 'is-fresh': isFreshPodAlert(ticket.alert.alertedAt, nowTick) }"
        >
          <div class="pod-follow-row__top">
            <span class="pod-follow-row__side">买 {{ ticket.sideLabel }}</span>
            <span class="pod-follow-row__drop">{{ formatPodDropPct(ticket.dropPct) }}</span>
          </div>
          <div class="pod-follow-row__match">{{ ticket.alert.home }} vs {{ ticket.alert.away }}</div>
          <div class="pod-follow-row__fixture" :class="`is-${ticket.fixtureMatch.status}`">
            {{ formatPodFixtureMatch(ticket.fixtureMatch) }}
          </div>
          <div class="pod-follow-row__meta">
            {{ ticket.alert.league }} · {{ ticket.marketLabel }}
          </div>
          <div class="pod-follow-row__bet">
            <span>PIN {{ formatPodPrice(ticket.pinPrevious) }} → {{ formatPodPrice(ticket.pinCurrent) }}</span>
            <span>NVP {{ formatPodPrice(ticket.nvp) }}</span>
            <span class="pod-follow-row__ob">OB ≥ {{ formatPodPrice(ticket.minObOdds) }}</span>
          </div>
          <div class="pod-follow-row__plan">
            <span>{{ formatPodStake(ticket.stake) }}</span>
            <span>{{ formatPodKickoff(ticket.starts, nowTick) }}</span>
            <span>{{ formatPodRemain(ticket.remainSec) }}</span>
          </div>
        </article>
      </div>
    </div>
    <button
      v-show="!collapsed"
      type="button"
      class="pod-follow-panel__resize"
      aria-label="缩放面板"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
      @pointercancel="onResizePointerUp"
    />
  </div>
</template>

<style scoped>
.pod-follow-panel {
  position: fixed;
  z-index: 1890;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 16px);
  color: #e8edf4;
  background: #14110ee6;
  border: 1px solid #f59e0b33;
  border-radius: 10px;
  box-shadow: 0 12px 40px #00000073;
  backdrop-filter: blur(10px);
  user-select: none;
  overflow: hidden;
}

.pod-follow-panel.is-dragging {
  opacity: 0.92;
}

.pod-follow-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0 10px 0 12px;
  cursor: grab;
  border-bottom: 1px solid #ffffff14;
}

.pod-follow-panel.is-collapsed .pod-follow-panel__header {
  border-bottom: 0;
}

.pod-follow-panel__header:active {
  cursor: grabbing;
}

.pod-follow-panel__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ffffff66;
  flex-shrink: 0;
}

.pod-follow-panel__dot.is-ok {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0bcc;
}

.pod-follow-panel__dot.is-wait {
  background: #e6a23c;
  box-shadow: 0 0 8px #e6a23ccc;
}

.pod-follow-panel__title {
  font-size: 13px;
  font-weight: 700;
}

.pod-follow-panel__status {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-panel__btn {
  border: 0;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}

.pod-follow-panel__btn:hover {
  color: #fff;
}

.pod-follow-panel__stake {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 40px;
  padding: 6px 10px;
  border-bottom: 1px solid #ffffff14;
  font-size: 12px;
  color: #cbd5e1;
}

.pod-follow-panel__stake-lab {
  flex-shrink: 0;
  font-weight: 600;
}

.pod-follow-panel__stake-unit {
  color: #94a3b8;
}

.pod-follow-panel__stake :deep(.el-input-number) {
  width: 112px;
}

.pod-follow-panel__chip {
  padding: 2px 7px;
  border: 1px solid #ffffff2e;
  border-radius: 999px;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
}

.pod-follow-panel__chip.is-on,
.pod-follow-panel__chip:hover {
  color: #fde68a;
  border-color: #f59e0b99;
}

.pod-follow-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.pod-follow-panel__hint {
  margin: 0;
  padding: 14px 14px 16px;
  font-size: 12px;
  line-height: 1.55;
  color: #cbd5e1;
}

.pod-follow-panel__list {
  display: flex;
  flex-direction: column;
}

.pod-follow-row {
  padding: 10px 12px;
  border-bottom: 1px solid #ffffff0f;
}

.pod-follow-row.is-fresh {
  background: #f59e0b14;
}

.pod-follow-row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pod-follow-row__side {
  min-width: 0;
  color: #fbbf24;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__drop {
  flex-shrink: 0;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 700;
}

.pod-follow-row__match {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__fixture,
.pod-follow-row__meta,
.pod-follow-row__bet,
.pod-follow-row__plan {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.pod-follow-row__fixture {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__fixture.is-matched {
  color: #fde68a;
}

.pod-follow-row__fixture.is-pending {
  color: #fb923c;
}

.pod-follow-row__fixture.is-none {
  color: #64748b;
}

.pod-follow-row__bet,
.pod-follow-row__plan {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}

.pod-follow-row__ob {
  color: #fde68a;
  font-weight: 600;
}

.pod-follow-panel__resize {
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
