<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import {
  formatPodDropPct,
  formatPodPrice,
  isFreshPodAlert,
} from "@/runtime/podAlerts";
import {
  POD_BET_SETTINGS_UPDATED,
  POD_FOLLOW_STAKE_PRESETS,
  podAlertWithinFollowAge,
  readPodBetSettings,
  writePodBetSettings,
  type PodBetSettings,
} from "@/runtime/podBetSettings";
import {
  formatPodKickoff,
  formatPodStake,
  listPodFollowTickets,
} from "@/runtime/podBetTicket";
import {
  formatPodEv,
  pickPodYaboAutoTicket,
  scorePodYaboFollow,
} from "@/runtime/podYabo";
import { openFootballSettings } from "@/runtime/footballSettingsUi";
import {
  fixtureFromViewMatch,
  formatPodFixtureMatch,
  matchPodAlertToFixtures,
} from "@/runtime/podFixtureMatch";
import {
  formatPodMarketMatch,
  formatPodObQuote,
} from "@/runtime/podMarketMatch";
import {
  buildPodBoardFocus,
  requestPodBoardFocus,
} from "@/runtime/podBoardFocus";
import {
  placePodFollowBet,
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import {
  buildPodFollowLogRow,
  clearPodFollowLog,
  formatPodFollowLogPlace,
  formatPodFollowLogQuote,
  formatPodFollowLogWhen,
  markPodFollowLogPlaced,
  readPodFollowLog,
  ticketHasPodFollowMatch,
  upsertPodFollowEv,
  type PodFollowLogRow,
} from "@/runtime/podFollowLog";
import { peekObEnglishNames } from "@/runtime/obSportEnglishNames";
import { useFootballStore } from "@/stores/footballStore";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { usePodAlertStore } from "@/stores/podAlertStore";
import { useSportOddsStore } from "@/stores/sportOddsStore";

const POS_KEY = "changmen:podFollowPanel";
const DEFAULT_W = 400;
const DEFAULT_H = 420;
const MIN_W = 280;
const MIN_H = 180;
const HEADER_H = 40;
const MARGIN = 8;

const store = usePodAlertStore();
const football = useFootballStore();
const sportOdds = useSportOddsStore();
const obLive = useObSportLiveStore();
const { snapshot, portReady, alerts } = storeToRefs(store);
const { matchs } = storeToRefs(football);
const { tick: sportOddsTick } = storeToRefs(sportOdds);
const { lineTick } = storeToRefs(obLive);
const betSettings = ref<PodBetSettings>(readPodBetSettings());
const nowTick = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const tickets = computed(() => {
  void sportOddsTick.value;
  void lineTick.value;
  const live = {
    get: (platform: string, id: string) => sportOdds.get(platform, id),
    has: (platform: string, id: string) => sportOdds.has(platform, id),
    getLine: (oid: string) => obLive.getLine(oid),
  };
  const fixtures = matchs.value.map((row) => {
    const fixture = fixtureFromViewMatch(row);
    const en = peekObEnglishNames(fixture.obMid);
    if (!en)
      return fixture;
    return { ...fixture, homeEn: en.home, awayEn: en.away, gameEn: en.league };
  });
  return listPodFollowTickets(alerts.value, { ...betSettings.value, maxAgeSec: 0 }, nowTick.value).map(ticket => {
    const fixtureMatch = matchPodAlertToFixtures(ticket.alert, fixtures);
    const hit = fixtureMatch.status === "matched" ? fixtureMatch.hits[0] : null;
    return {
      ...scorePodYaboFollow(ticket, {
        fixture: hit?.fixture,
        swapped: hit?.swapped === true,
        live,
        books: snapshot.value.books,
        settings: betSettings.value,
      }),
      fixtureMatch,
    };
  });
});
const stakePresets = POD_FOLLOW_STAKE_PRESETS;
const logRows = ref<PodFollowLogRow[]>(readPodFollowLog());
const liveById = computed(() => new Map(
  tickets.value.filter(ticketHasPodFollowMatch).map(ticket => [ticket.id, ticket]),
));
const displayRows = computed(() => logRows.value
  .filter(log => log.obMid)
  .map(log => ({
    log,
    live: liveById.value.get(log.id),
  })));

function refreshLog() {
  logRows.value = readPodFollowLog();
}

function recordLiveTickets() {
  let wrote = false;
  for (const ticket of tickets.value) {
    if (!ticketHasPodFollowMatch(ticket))
      continue;
    const next = upsertPodFollowEv(buildPodFollowLogRow(ticket, nowTick.value));
    if (next.added || next.wrote)
      wrote = true;
  }
  if (wrote)
    refreshLog();
}

watch(tickets, recordLiveTickets, { immediate: true });

function jumpToTicket(ticket: (typeof tickets.value)[number]) {
  if (ticket.fixtureMatch.status !== "matched")
    return;
  const hit = ticket.fixtureMatch.hits[0];
  if (!hit)
    return;
  requestPodBoardFocus(buildPodBoardFocus(hit.fixture, ticket.marketMatch));
}

function ticketPlacePayload(ticket: (typeof tickets.value)[number], auto = false): PodFollowPlaceTicket {
  const hit = ticket.fixtureMatch.status === "matched" ? ticket.fixtureMatch.hits[0] : null;
  return {
    id: ticket.id,
    stake: ticket.stake,
    fixtureStatus: ticket.fixtureMatch.status,
    obMid: String(hit?.fixture.obMid || "").trim(),
    home: ticket.alert.home,
    away: ticket.alert.away,
    sideLabel: ticket.sideLabel,
    marketLabel: ticket.marketLabel,
    auto,
    market: ticket.marketMatch,
    quote: ticket.obQuote,
  };
}

const placingId = ref("");
const placed = ref<Record<string, true>>({});
const placeNote = ref<Record<string, string>>({});

function isPlaced(id: string): boolean {
  return !!placed.value[id] || logRows.value.some(row => row.id === id && row.placed);
}

function placeBlock(ticket: (typeof tickets.value)[number]): string | null {
  if (isPlaced(ticket.id))
    return "已下过";
  return podFollowPlaceBlock(ticketPlacePayload(ticket));
}

function placeLabel(ticket: (typeof tickets.value)[number]): string {
  if (isPlaced(ticket.id))
    return "已下";
  if (placingId.value === ticket.id)
    return "下单中";
  return "下单";
}

function placeStatus(row: { log: PodFollowLogRow }): string {
  return formatPodFollowLogPlace({
    placed: isPlaced(row.log.id),
    placeNote: placeNote.value[row.log.id] || row.log.placeNote,
  });
}

function onDisplayClick(row: { live?: (typeof tickets.value)[number]; log: PodFollowLogRow }) {
  if (row.live)
    jumpToTicket(row.live);
  else
    jumpToLog(row.log);
}

async function placeTicket(ticket: (typeof tickets.value)[number], auto: boolean) {
  if (placingId.value)
    return;
  const payload = ticketPlacePayload(ticket, auto);
  const block = podFollowPlaceBlock(payload);
  if (block) {
    if (!auto)
      ElMessage.warning(block);
    return;
  }
  if (isPlaced(ticket.id)) {
    if (!auto)
      ElMessage.info("已下过");
    return;
  }
  placingId.value = ticket.id;
  try {
    const result = await placePodFollowBet(payload);
    placeNote.value = { ...placeNote.value, [ticket.id]: result.message };
    if (result.ok) {
      placed.value = { ...placed.value, [ticket.id]: true };
      logRows.value = markPodFollowLogPlaced(ticket.id, result.message);
      ElMessage.success(result.message);
      return;
    }
    if (auto)
      ElMessage.warning(result.message);
    else
      ElMessage.error(result.message);
  }
  finally {
    placingId.value = "";
  }
}

function onPlaceClick(ev: MouseEvent, ticket: (typeof tickets.value)[number]) {
  ev.stopPropagation();
  void placeTicket(ticket, false);
}

async function maybeAutoPlace() {
  if (!betSettings.value.autoPlace || placingId.value)
    return;
  const ready = tickets.value.filter(ticket =>
    podAlertWithinFollowAge(ticket.alert, betSettings.value.maxAgeSec, nowTick.value),
  );
  const skipped = [
    ...Object.keys(placed.value),
    ...logRows.value.filter(row => row.placed).map(row => row.id),
  ];
  const placedEntries = logRows.value
    .filter(row => row.placed && row.obMid && row.boardSide)
    .map(row => ({
      obMid: row.obMid,
      marketCode: row.marketCode,
      boardSide: row.boardSide,
    }));
  const next = pickPodYaboAutoTicket(
    ready.map(row => ticketPlacePayload(row)),
    skipped,
    placedEntries,
  );
  if (!next)
    return;
  const ui = tickets.value.find(row => row.id === next.id);
  if (ui)
    await placeTicket(ui, true);
}

const stakeModel = computed({
  get: () => betSettings.value.stake,
  set: (v: number | undefined) => persistStake(v),
});

const autoModel = computed({
  get: () => betSettings.value.autoPlace,
  set: (v: boolean) => persistAuto(v),
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
    const n = displayRows.value.length;
    const live = tickets.value.filter(ticketHasPodFollowMatch).length;
    if (!n)
      return "等待机会";
    return betSettings.value.autoPlace
      ? `${n} 条 · ${live} 在线 · 自动开`
      : `${n} 条 · ${live} 在线`;
  }
  if (snapshot.value.sourceConnected)
    return "等 Dropping Odds";
  return "等待 POD 页";
});

const statusKind = computed(() => {
  if (!betSettings.value.enabled)
    return "idle";
    if (tickets.value.length || logRows.value.length)
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

function persistAuto(raw: boolean) {
  betSettings.value = writePodBetSettings({
    ...betSettings.value,
    autoPlace: raw === true,
  });
}

function reloadBetSettings() {
  betSettings.value = readPodBetSettings();
}

function openPodSettings() {
  openFootballSettings("pod");
}

function jumpToLog(row: PodFollowLogRow) {
  if (!row.obMid)
    return;
  requestPodBoardFocus({
    matchId: 0,
    obMid: row.obMid,
    marketCode: row.marketCode,
    side: row.boardSide,
    line: row.boardLine,
    oid: row.oid,
  });
}

function onClearLog() {
  logRows.value = clearPodFollowLog();
  placed.value = {};
  placeNote.value = {};
}

onMounted(() => {
  left.value = Math.max(MARGIN, window.innerWidth - DEFAULT_W - 440);
  loadPos();
  store.start();
  reloadBetSettings();
  refreshLog();
  placed.value = Object.fromEntries(logRows.value.filter(row => row.placed).map(row => [row.id, true as const]));
  window.addEventListener("resize", onWindowResize);
  window.addEventListener(POD_BET_SETTINGS_UPDATED, reloadBetSettings);
  nowTimer = setInterval(() => {
    nowTick.value = Date.now();
    void maybeAutoPlace();
  }, 1_000);
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
      <span class="pod-follow-panel__stake-lab">自动下注</span>
      <el-switch
        v-model="autoModel"
        size="small"
        inline-prompt
        active-text="开"
        inactive-text="关"
        :disabled="!betSettings.enabled"
      />
    </div>
    <div v-show="!collapsed" class="pod-follow-panel__body">
      <p v-if="!betSettings.enabled" class="pod-follow-panel__hint">
        筛选已关。打开「足球设置 → POD跟单」后，对上场和盘的会一直留在列表里，并标已下/未下。降赔浮窗不受影响。
      </p>
      <template v-else>
        <div v-if="logRows.length" class="pod-follow-panel__toolbar" @pointerdown.stop>
          <button type="button" class="pod-follow-panel__btn" @click="onClearLog">
            清空
          </button>
        </div>
        <p v-if="!snapshot.sourceConnected && !displayRows.length" class="pod-follow-panel__hint">
          等 POD 连通后，对上场和盘的会进来并一直留下。时效只挡自动下注。
        </p>
        <p v-else-if="!displayRows.length" class="pod-follow-panel__hint">
          还没有跟单机会。对上足球板的场和盘才会进来，并标有没有下单。
        </p>
        <div v-else class="pod-follow-panel__list">
          <article
            v-for="row in displayRows"
            :key="row.log.id"
            class="pod-follow-row"
            :class="{
              'is-fresh': row.live && isFreshPodAlert(row.live.alert.alertedAt, nowTick),
              'is-jumpable': row.live ? row.live.fixtureMatch.status === 'matched' : !!row.log.obMid,
            }"
            :title="(row.live ? row.live.fixtureMatch.status === 'matched' : !!row.log.obMid) ? '点到板上这场' : undefined"
            @click="onDisplayClick(row)"
          >
            <template v-if="row.live">
              <div class="pod-follow-row__top">
                <span class="pod-follow-row__side">买 {{ row.live.sideLabel }}</span>
                <span class="pod-follow-row__drop">{{ formatPodDropPct(row.live.dropPct) }}</span>
              </div>
              <div class="pod-follow-row__match">{{ row.live.alert.home }} vs {{ row.live.alert.away }}</div>
              <div class="pod-follow-row__fixture" :class="`is-${row.live.fixtureMatch.status}`">
                {{ formatPodFixtureMatch(row.live.fixtureMatch) }}
              </div>
              <div
                v-if="row.live.fixtureMatch.status === 'matched'"
                class="pod-follow-row__market"
                :class="`is-${row.live.marketMatch.status}`"
              >
                {{ formatPodMarketMatch(row.live.marketMatch) }}
              </div>
              <div
                v-if="row.live.marketMatch.status === 'matched'"
                class="pod-follow-row__quote"
                :class="`is-${row.live.obQuote.status}`"
              >
                {{ formatPodObQuote(row.live.obQuote) }}
                <span v-if="row.live.obQuote.evPercent" class="pod-follow-row__ev">
                  {{ formatPodEv(row.live.obQuote.evPercent) }}
                </span>
              </div>
              <div class="pod-follow-row__meta">
                {{ row.live.alert.league }} · {{ row.live.marketLabel }}
              </div>
              <div class="pod-follow-row__bet">
                <span>PIN {{ formatPodPrice(row.live.pinPrevious) }} → {{ formatPodPrice(row.live.pinCurrent) }}</span>
                <span>NVP {{ formatPodPrice(row.live.nvp) }}</span>
                <span class="pod-follow-row__ob">OB ≥ {{ formatPodPrice(row.live.minObOdds) }}</span>
                <span v-if="row.live.maxObOdds">OB ≤ {{ formatPodPrice(row.live.maxObOdds) }}</span>
              </div>
              <div class="pod-follow-row__plan">
                <span>{{ formatPodStake(row.live.stake) }}</span>
                <span>{{ formatPodKickoff(row.live.starts, nowTick) }}</span>
                <span class="pod-follow-row__placed" :class="isPlaced(row.log.id) ? 'is-yes' : 'is-no'">
                  {{ placeStatus(row) }}
                </span>
                <button
                  type="button"
                  class="pod-follow-row__place"
                  :disabled="!!placeBlock(row.live) || placingId === row.live.id"
                  :title="placeBlock(row.live) || undefined"
                  @click="onPlaceClick($event, row.live)"
                >
                  {{ placeLabel(row.live) }}
                </button>
              </div>
            </template>
            <template v-else>
              <div class="pod-follow-row__top">
                <span class="pod-follow-row__side">买 {{ row.log.sideLabel }}</span>
                <span class="pod-follow-row__drop">{{ formatPodDropPct(row.log.dropPct) }}</span>
              </div>
              <div class="pod-follow-row__match">{{ row.log.home }} vs {{ row.log.away }}</div>
              <div class="pod-follow-row__quote">{{ formatPodFollowLogQuote(row.log) }}</div>
              <div class="pod-follow-row__meta">{{ row.log.league }} · {{ row.log.marketLabel }}</div>
              <div class="pod-follow-row__bet">
                <span>NVP {{ formatPodPrice(row.log.nvp) }}</span>
                <span>{{ formatPodStake(row.log.stake) }}</span>
                <span>{{ formatPodFollowLogWhen(row.log.at, nowTick) }}</span>
                <span class="pod-follow-row__placed" :class="isPlaced(row.log.id) ? 'is-yes' : 'is-no'">
                  {{ placeStatus(row) }}
                </span>
              </div>
            </template>
            <div v-if="placeNote[row.log.id] && !isPlaced(row.log.id)" class="pod-follow-row__note">
              {{ placeNote[row.log.id] }}
            </div>
          </article>
        </div>
      </template>
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

.pod-follow-panel__toolbar {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding: 4px 6px 0;
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

.pod-follow-row.is-jumpable {
  cursor: pointer;
}

.pod-follow-row.is-jumpable:hover {
  background: #f59e0b22;
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
.pod-follow-row__market,
.pod-follow-row__quote,
.pod-follow-row__meta,
.pod-follow-row__bet,
.pod-follow-row__plan {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.pod-follow-row__fixture,
.pod-follow-row__market,
.pod-follow-row__quote {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__fixture.is-matched,
.pod-follow-row__market.is-matched,
.pod-follow-row__quote.is-ok {
  color: #fde68a;
}

.pod-follow-row__fixture.is-pending,
.pod-follow-row__market.is-skipped,
.pod-follow-row__quote.is-short,
.pod-follow-row__quote.is-spike {
  color: #fb923c;
}

.pod-follow-row__fixture.is-none,
.pod-follow-row__market.is-none,
.pod-follow-row__quote.is-none,
.pod-follow-row__quote.is-locked {
  color: #64748b;
}

.pod-follow-row__ev {
  margin-left: 6px;
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

.pod-follow-row__placed {
  font-weight: 600;
}

.pod-follow-row__placed.is-yes {
  color: #4ade80;
}

.pod-follow-row__placed.is-no {
  color: #fbbf24;
}

.pod-follow-row__place {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid #f59e0b99;
  border-radius: 999px;
  background: #f59e0b22;
  color: #fde68a;
  font-size: 11px;
  cursor: pointer;
}

.pod-follow-row__place:hover:not(:disabled) {
  background: #f59e0b44;
}

.pod-follow-row__place:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pod-follow-row__note {
  margin-top: 4px;
  font-size: 11px;
  color: #fbbf24;
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
