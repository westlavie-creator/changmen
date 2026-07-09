<script setup lang="ts">
import type { ActiveBetLeg, ActiveBetRun } from "@/types/activeBetRun";
import { storeToRefs } from "pinia";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/active-bet-run.css";

const activeStore = useActiveBetRunStore();
const loseStore = useLoseOrderStore();
const { visibleRuns } = storeToRefs(activeStore);

const now = ref(Date.now());
const legEventFeedEls = new Map<string, HTMLElement>();
let tickTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  activeStore.bootstrapFromLoseOrders(loseStore.orders);
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickTimer)
    clearInterval(tickTimer);
});

watch(
  visibleRuns,
  () => {
    void nextTick(scrollLegEventFeedsToBottom);
  },
  { deep: true },
);

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

function scrollLegEventFeedsToBottom() {
  for (const run of visibleRuns.value) {
    for (const leg of run.legs) {
      const el = legEventFeedEls.get(legEventKey(run.betId, leg.side));
      if (el)
        el.scrollTop = el.scrollHeight;
    }
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
  if (run.linkId && run.linkId !== 0)
    return `Link ${String(run.linkId).slice(-6)}`;
  return `订单 ${index + 1}`;
}
</script>

<template>
  <fieldset class="active-bet-run">
    <legend>进行中的订单 ({{ visibleRuns.length }})</legend>
    <div class="active-bet-run__list">
      <p v-if="!visibleRuns.length" class="active-bet-run__empty">
        暂无进行中的订单
      </p>
      <article
        v-for="(run, index) in visibleRuns"
        :key="run.betId"
        class="active-bet-run__col"
        :class="colToneClass(run)"
      >
        <header class="active-bet-run__col-head">
          <span class="active-bet-run__col-label">{{ orderLabel(run, index) }}</span>
          <span class="active-bet-run__phase">{{ phaseLabel(run) }}</span>
        </header>

        <div
          class="active-bet-run__meta-line"
          :title="stripHtml(run.matchTitle)"
        >
          <span class="active-bet-run__match" v-html="run.matchTitle" />
          <span class="active-bet-run__sep">·</span>
          <span
            class="active-bet-run__bet"
            :title="stripHtml(run.betName)"
            v-html="run.betName"
          />
        </div>

        <div class="active-bet-run__legs">
          <div
            v-for="leg in run.legs"
            :key="leg.side"
            class="active-bet-run__leg"
            :class="legClass(leg)"
            :title="leg.detail || undefined"
          >
            <div class="active-bet-run__leg-meta">
              <span class="active-bet-run__leg-side">{{ legSideLabel(leg.side) }}</span>
              <span class="active-bet-run__leg-platform">{{ leg.platform }}</span>
              <span class="active-bet-run__leg-target">{{ leg.target }}</span>
              <span v-if="leg.odds" class="active-bet-run__leg-odds">@{{ leg.odds }}</span>
              <span v-if="formatLegMoney(leg.betMoney)" class="active-bet-run__leg-money">
                {{ formatLegMoney(leg.betMoney) }}
              </span>
            </div>
            <ul
              v-if="leg.events?.length"
              :ref="el => setLegEventFeedEl(run.betId, leg.side, el as Element | null)"
              class="active-bet-run__leg-events"
            >
              <li
                v-for="(ev, evIndex) in leg.events"
                :key="`${run.betId}-${leg.side}-${evIndex}`"
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

        <ul
          v-if="run.events.length"
          class="active-bet-run__events active-bet-run__events--run"
        >
          <li
            v-for="(ev, evIndex) in run.events"
            :key="`${run.betId}-run-${evIndex}`"
            class="active-bet-run__event"
            :class="{ 'active-bet-run__event--latest': evIndex === run.events.length - 1 }"
            :title="ev.detail"
          >
            <span
              class="active-bet-run__event-stage"
              :data-layer="ev.stage"
            >{{ ev.stage }}</span>
            <span class="active-bet-run__event-detail">{{ ev.detail }}</span>
          </li>
        </ul>
      </article>
    </div>
  </fieldset>
</template>
