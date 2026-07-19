<script setup lang="ts">
import type { ActiveBetLeg, ActiveBetRun } from "@/types/activeBetRun";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { formatActiveBetLinkLabel } from "@/shared/linkDisplay";
import { ACTIVE_BET_RUN_QUEUE_CAP, useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/active-bet-run.css";

const PANEL_POS_KEY = "changmen:active-bet-run:pos:v4";
const PANEL_COLLAPSED_KEY = "changmen:active-bet-run:collapsed";
/** 默认宽度：与原先列表上方单笔栏一致（双腿并排共 460） */
const PANEL_W = 460;

const activeStore = useActiveBetRunStore();
const loseStore = useLoseOrderStore();
const { visibleRuns } = storeToRefs(activeStore);

const now = ref(Date.now());
const panelEl = ref<HTMLElement | null>(null);
const collapsed = ref(false);
const offset = ref<{ left: number; top: number } | null>(null);
const dragging = ref(false);
/** 当前展示的套利单下标（visibleRuns：0=最新） */
const activeIndex = ref(0);

const legEventFeedEls = new Map<string, HTMLElement>();
let tickTimer: ReturnType<typeof setInterval> | undefined;
let dragCleanup: (() => void) | undefined;

const runCount = computed(() => visibleRuns.value.length);
const activeRun = computed(() => visibleRuns.value[activeIndex.value] ?? null);
const canPrev = computed(() => activeIndex.value < runCount.value - 1);
const canNext = computed(() => activeIndex.value > 0);
const pageLabel = computed(() => {
  if (!runCount.value)
    return `0/${ACTIVE_BET_RUN_QUEUE_CAP}`;
  return `${activeIndex.value + 1}/${runCount.value}`;
});

const panelStyle = computed(() => {
  const style: Record<string, string> = {
    position: "fixed",
    zIndex: "1200",
    boxSizing: "border-box",
  };
  if (!collapsed.value) {
    style.width = `${PANEL_W}px`;
    style.minWidth = `${PANEL_W}px`;
    style.maxWidth = `${PANEL_W}px`;
    style.height = "320px";
  }
  else {
    style.width = "auto";
    style.minWidth = "200px";
    style.height = "auto";
  }
  if (offset.value) {
    style.left = `${offset.value.left}px`;
    style.top = `${offset.value.top}px`;
    style.right = "auto";
  }
  else {
    style.top = "72px";
    style.right = "16px";
    style.left = "auto";
  }
  return style;
});

onMounted(() => {
  activeStore.bootstrapFromLoseOrders(loseStore.orders);
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  restorePanelPrefs();
});

onUnmounted(() => {
  if (tickTimer)
    clearInterval(tickTimer);
  dragCleanup?.();
});

watch(
  visibleRuns,
  (runs, prev) => {
    const prevNewestId = prev?.[0]?.betId;
    const newestId = runs[0]?.betId;
    // 有新单进队：切到最新
    if (newestId != null && newestId !== prevNewestId)
      activeIndex.value = 0;
    else if (activeIndex.value >= runs.length)
      activeIndex.value = Math.max(0, runs.length - 1);
    void nextTick(scrollActiveLegFeedsToBottom);
  },
  { deep: true },
);

watch(activeIndex, () => {
  void nextTick(scrollActiveLegFeedsToBottom);
});

function restorePanelPrefs() {
  try {
    collapsed.value = localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
    const raw = localStorage.getItem(PANEL_POS_KEY);
    if (!raw)
      return;
    const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(parsed.left);
    const top = Number(parsed.top);
    if (Number.isFinite(left) && Number.isFinite(top))
      offset.value = { left, top };
  }
  catch {
    /* ignore */
  }
}

function persistCollapsed() {
  try {
    localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed.value ? "1" : "0");
  }
  catch {
    /* ignore */
  }
}

function persistOffset() {
  if (!offset.value)
    return;
  try {
    localStorage.setItem(PANEL_POS_KEY, JSON.stringify(offset.value));
  }
  catch {
    /* ignore */
  }
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  persistCollapsed();
}

function showPrev() {
  if (!canPrev.value)
    return;
  activeIndex.value += 1;
}

function showNext() {
  if (!canNext.value)
    return;
  activeIndex.value -= 1;
}

function clampOffset(left: number, top: number): { left: number; top: number } {
  const el = panelEl.value;
  const w = el?.offsetWidth ?? PANEL_W;
  const h = el?.offsetHeight ?? 40;
  return {
    left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - w)),
    top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - h)),
  };
}

function onDragHandlePointerDown(ev: PointerEvent) {
  if (ev.button !== 0)
    return;
  if ((ev.target as HTMLElement | null)?.closest("button"))
    return;
  const el = panelEl.value;
  if (!el)
    return;

  ev.preventDefault();
  const rect = el.getBoundingClientRect();
  const originLeft = rect.left;
  const originTop = rect.top;
  const startX = ev.clientX;
  const startY = ev.clientY;
  offset.value = { left: originLeft, top: originTop };
  dragging.value = true;

  const onMove = (moveEv: PointerEvent) => {
    offset.value = clampOffset(
      originLeft + (moveEv.clientX - startX),
      originTop + (moveEv.clientY - startY),
    );
  };
  const onUp = () => {
    dragging.value = false;
    dragCleanup?.();
    dragCleanup = undefined;
    if (offset.value)
      offset.value = clampOffset(offset.value.left, offset.value.top);
    persistOffset();
  };

  dragCleanup?.();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("pointercancel", onUp, { once: true });
  dragCleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

function legEventKey(betId: number, side: ActiveBetLeg["side"]): string {
  return `${betId}:${side}`;
}

function setLegEventFeedEl(betId: number, side: ActiveBetLeg["side"], el: Element | null) {
  const key = legEventKey(betId, side);
  if (el)
    legEventFeedEls.set(key, el as HTMLElement);
  else
    legEventFeedEls.delete(key);
}

function scrollActiveLegFeedsToBottom() {
  const run = activeRun.value;
  if (!run)
    return;
  for (const leg of run.legs) {
    const el = legEventFeedEls.get(legEventKey(run.betId, leg.side));
    if (el)
      el.scrollTop = el.scrollHeight;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function legClass(leg: ActiveBetLeg): string {
  return `active-bet-run__leg--${leg.status}`;
}

function colToneClass(run: ActiveBetRun): string {
  const active = run.legs.filter(l => l.status !== "skipped");
  const hasRejected = active.some(l => l.status === "rejected" || l.status === "failed");
  if (hasRejected)
    return "active-bet-run__col--danger";
  const allConfirmed = active.length > 0 && active.every(l => l.status === "confirmed");
  if (allConfirmed && (run.phase === "syncing" || run.phase === "settling"))
    return "active-bet-run__col--success";
  const hasPmPending = active.some(l => l.status === "pending_confirm");
  if (run.phase === "makeup" || hasPmPending)
    return "active-bet-run__col--makeup";
  if (run.phase === "placing" || run.phase === "settling" || run.phase === "checking")
    return "active-bet-run__col--pending";
  return "";
}

function phaseLabel(run: ActiveBetRun): string {
  if (run.countdownUntil && (run.phase === "settling" || run.phase === "syncing")) {
    const left = Math.max(0, Math.ceil((run.countdownUntil - now.value) / 1000));
    if (left > 0) {
      if (run.phase === "syncing")
        return `双腿已成交 ${left}s`;
      return `等待确认 ${left}s`;
    }
  }
  return run.overallLabel;
}

function formatLegMoney(betMoney?: number): string | undefined {
  if (betMoney == null || !Number.isFinite(betMoney) || betMoney <= 0)
    return undefined;
  return `¥${Math.round(betMoney)}`;
}

function legSideLabel(side: ActiveBetLeg["side"]): string {
  return side === "A" ? "A腿" : "B腿";
}

function orderLabel(run: ActiveBetRun, index: number): string {
  return formatActiveBetLinkLabel(run.linkId) ?? `订单 ${index + 1}`;
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="panelEl"
      class="active-bet-run"
      :class="{
        'active-bet-run--collapsed': collapsed,
        'active-bet-run--dragging': dragging,
      }"
      :style="panelStyle"
    >
      <div
        class="active-bet-run__chrome"
        title="按住拖动"
        @pointerdown="onDragHandlePointerDown"
      >
        <span class="active-bet-run__chrome-title">
          进行中的订单 ({{ pageLabel }})
        </span>
        <button
          type="button"
          class="active-bet-run__fold"
          :title="collapsed ? '展开' : '折叠'"
          :aria-expanded="!collapsed"
          @click.stop="toggleCollapsed"
        >
          {{ collapsed ? "展开" : "折叠" }}
        </button>
      </div>

      <div v-show="!collapsed" class="active-bet-run__body">
        <button
          type="button"
          class="active-bet-run__nav"
          :disabled="!canPrev"
          title="上一笔（更旧）"
          aria-label="上一笔"
          @click="showPrev"
        >
          ‹
        </button>

        <div class="active-bet-run__stage">
          <p v-if="!activeRun" class="active-bet-run__empty">
            暂无进行中的订单
          </p>
          <article
            v-else
            :key="activeRun.betId"
            class="active-bet-run__col"
            :class="colToneClass(activeRun)"
          >
            <header class="active-bet-run__col-head">
              <span class="active-bet-run__col-label">{{ orderLabel(activeRun, activeIndex) }}</span>
              <span class="active-bet-run__phase">{{ phaseLabel(activeRun) }}</span>
            </header>

            <div
              class="active-bet-run__meta-line"
              :title="stripHtml(activeRun.matchTitle)"
            >
              <span class="active-bet-run__match" v-html="activeRun.matchTitle" />
              <span class="active-bet-run__sep">·</span>
              <span
                class="active-bet-run__bet"
                :title="stripHtml(activeRun.betName)"
                v-html="activeRun.betName"
              />
            </div>

            <div class="active-bet-run__legs">
              <div
                v-for="leg in activeRun.legs"
                :key="leg.side"
                class="active-bet-run__leg"
                :class="legClass(leg)"
                :title="leg.detail || undefined"
              >
                <div class="active-bet-run__leg-meta">
                  <span class="active-bet-run__leg-side">{{ legSideLabel(leg.side) }}</span>
                  <span class="active-bet-run__leg-platform" :title="leg.platform" :aria-label="leg.platform">
                    <PlatformIcon :platform="leg.platform" />
                  </span>
                  <span class="active-bet-run__leg-target">{{ leg.target }}</span>
                  <span v-if="leg.odds" class="active-bet-run__leg-odds">@{{ leg.odds }}</span>
                  <span v-if="formatLegMoney(leg.betMoney)" class="active-bet-run__leg-money">
                    {{ formatLegMoney(leg.betMoney) }}
                  </span>
                </div>
                <ul
                  v-if="leg.events?.length"
                  :ref="el => setLegEventFeedEl(activeRun.betId, leg.side, el as Element | null)"
                  class="active-bet-run__leg-events"
                >
                  <li
                    v-for="(ev, evIndex) in leg.events"
                    :key="`${activeRun.betId}-${leg.side}-${evIndex}`"
                    class="active-bet-run__leg-event"
                    :class="{ 'active-bet-run__leg-event--latest': evIndex === leg.events.length - 1 }"
                    :title="ev.detail"
                  >
                    <span
                      class="active-bet-run__leg-event-stage"
                      :data-layer="ev.stage"
                    >{{ ev.stage }}</span>
                    <span class="active-bet-run__leg-event-detail">{{ ev.detail }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </article>
        </div>

        <button
          type="button"
          class="active-bet-run__nav"
          :disabled="!canNext"
          title="下一笔（更新）"
          aria-label="下一笔"
          @click="showNext"
        >
          ›
        </button>
      </div>
    </div>
  </Teleport>
</template>
