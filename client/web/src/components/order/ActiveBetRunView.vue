<script setup lang="ts">
import type { ActiveBetLeg, ActiveBetRun } from "@/types/activeBetRun";
import { storeToRefs } from "pinia";
import { onMounted, onUnmounted, ref } from "vue";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/active-bet-run.css";

const activeStore = useActiveBetRunStore();
const loseStore = useLoseOrderStore();
const { visibleRuns } = storeToRefs(activeStore);

const now = ref(Date.now());
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
  if (run.phase === "makeup")
    return "active-bet-run__col--makeup";
  if (run.phase === "placing" || run.phase === "settling" || run.phase === "checking")
    return "active-bet-run__col--pending";
  return "";
}

function phaseLabel(run: ActiveBetRun): string {
  if (run.phase === "settling" && run.countdownUntil) {
    const left = Math.max(0, Math.ceil((run.countdownUntil - now.value) / 1000));
    if (left > 0)
      return `等待确认 ${left}s`;
  }
  return run.overallLabel;
}

function formatLegMoney(betMoney?: number): string | undefined {
  if (betMoney == null || !Number.isFinite(betMoney) || betMoney <= 0)
    return undefined;
  return `¥${Math.round(betMoney)}`;
}

function lastEvent(run: ActiveBetRun): string | undefined {
  const ev = run.events[run.events.length - 1];
  if (!ev)
    return undefined;
  return `${ev.stage}：${ev.detail}`;
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

        <ul class="active-bet-run__legs">
          <li
            v-for="leg in run.legs"
            :key="leg.side"
            class="active-bet-run__leg"
            :class="legClass(leg)"
            :title="leg.detail || undefined"
          >
            <span class="active-bet-run__leg-platform">{{ leg.platform }}</span>
            <span class="active-bet-run__leg-target">{{ leg.target }}</span>
            <span class="active-bet-run__leg-status">{{ activeStore.legStatusLabel(leg.status) }}</span>
            <span v-if="leg.odds" class="active-bet-run__leg-odds">@{{ leg.odds }}</span>
            <span v-if="formatLegMoney(leg.betMoney)" class="active-bet-run__leg-money">
              {{ formatLegMoney(leg.betMoney) }}
            </span>
          </li>
        </ul>

        <footer v-if="lastEvent(run)" class="active-bet-run__foot">
          {{ lastEvent(run) }}
        </footer>
      </article>
    </div>
  </fieldset>
</template>
