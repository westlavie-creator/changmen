<script setup lang="ts">
import type { ActiveBetLeg, ActiveBetRun } from "@/types/activeBetRun";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/active-bet-run.css";

const activeStore = useActiveBetRunStore();
const loseStore = useLoseOrderStore();
const { visibleRuns } = storeToRefs(activeStore);

onMounted(() => {
  activeStore.bootstrapFromLoseOrders(loseStore.orders);
});

function legClass(leg: ActiveBetLeg): string {
  return `active-bet-run__leg--${leg.status}`;
}

function lastEvent(run: ActiveBetRun): string | undefined {
  const ev = run.events[run.events.length - 1];
  if (!ev)
    return undefined;
  return `${ev.stage}：${ev.detail}`;
}
</script>

<template>
  <fieldset v-if="visibleRuns.length" class="active-bet-run">
    <legend>进行中的套利 ({{ visibleRuns.length }})</legend>
    <div class="active-bet-run__list">
      <article
        v-for="run in visibleRuns"
        :key="run.betId"
        class="active-bet-run__card"
      >
        <header class="active-bet-run__head">
          <div class="active-bet-run__title" v-html="run.matchTitle" />
          <div class="active-bet-run__bet" v-html="run.betName" />
          <div class="active-bet-run__phase">
            {{ run.overallLabel }}
          </div>
        </header>

        <ul class="active-bet-run__legs">
          <li
            v-for="leg in run.legs"
            :key="leg.side"
            class="active-bet-run__leg"
            :class="legClass(leg)"
          >
            <span class="active-bet-run__leg-platform">{{ leg.platform }}</span>
            <span class="active-bet-run__leg-target">{{ leg.target }}</span>
            <span class="active-bet-run__leg-status">{{ activeStore.legStatusLabel(leg.status) }}</span>
            <span v-if="leg.odds" class="active-bet-run__leg-odds">@{{ leg.odds }}</span>
            <span v-if="leg.detail" class="active-bet-run__leg-detail">{{ leg.detail }}</span>
          </li>
        </ul>

        <footer v-if="lastEvent(run)" class="active-bet-run__foot">
          {{ lastEvent(run) }}
        </footer>
      </article>
    </div>
  </fieldset>
</template>
