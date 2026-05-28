<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import CreateLoseDialog from "@/components/match/CreateLoseDialog.vue";
import LimitDiagDialog from "@/components/match/LimitDiagDialog.vue";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";
import { useBettingStore } from "@/stores/bettingStore";
import { arbPercent, formatSecond } from "@/shared/format";
import type { PlatformId } from "@/types/esport";

const props = defineProps<{
  match: ViewMatch;
  bet: ViewBet;
}>();

const oddsStore = useOddsStore();
const matchStore = useMatchStore();
const bettingStore = useBettingStore();
const { revision } = storeToRefs(oddsStore);
const { tick: matchTick } = storeToRefs(matchStore);

const loseOpen = ref(false);
const limitOpen = ref(false);
const limitProvider = ref<PlatformId>();
const limitItemIds = ref<string[]>([]);

function itemOdds(item: ViewBet["items"][0], side: BetSide) {
  void revision.value;
  void matchTick.value;
  return item.getOdds(side);
}

function oddsFlashClass(item: ViewBet["items"][0], side: BetSide) {
  void revision.value;
  const foSide = side === "Home" ? "home" : "away";
  const dir = oddsStore.getFlashForBetSide(
    item.type,
    item.betId,
    foSide,
    item.homeId,
    item.awayId,
  );
  if (dir === "up") return "odds-up";
  if (dir === "down") return "odds-down";
  return "";
}

const arb = computed(() => {
  let bestHome = 0;
  let bestAway = 0;
  for (const item of props.bet.items) {
    const h = itemOdds(item, "Home");
    const a = itemOdds(item, "Away");
    if (h > bestHome) bestHome = h;
    if (a > bestAway) bestAway = a;
  }
  return arbPercent(bestHome, bestAway);
});

const liveLabel = computed(() => {
  if (!props.bet.isLive || !props.bet.startTime) return "";
  return formatSecond((Date.now() - props.bet.startTime) / 1000);
});

function onTarget(platform: ViewBet["items"][0]["type"], side: BetSide) {
  matchStore.setBetTarget(platform, props.bet.id, side);
}

function openLimit(item: ViewBet["items"][0]) {
  limitProvider.value = item.type;
  limitItemIds.value = [item.homeId, item.awayId];
  limitOpen.value = true;
}

function onOddsDblClick(item: ViewBet["items"][0], side: BetSide) {
  void bettingStore.manualBet(props.match, props.bet, item, side);
}
</script>

<template>
  <div class="bet">
    <span v-if="bet.isLive && bet.startTime" class="live-tag">{{ liveLabel }}</span>
    <div class="bet-title" @dblclick="loseOpen = true">
      {{ bet.getBetName() }} - {{ arb }}
    </div>
    <div class="items flex flex-wrap">
      <div v-for="item in bet.items" :key="item.type + item.betId" class="item flex">
        <div
          class="item-type provider-icon"
          :class="[
            item.type,
            {
              limit: oddsStore.hasLimit(item.type, [item.homeId, item.awayId]),
            },
          ]"
          @click="openLimit(item)"
        />
        <div
          class="item-odds home"
          :class="[
            oddsFlashClass(item, 'Home'),
            {
              lock: !itemOdds(item, 'Home'),
              target: matchStore.getBetTarget(item.type, bet.id) === 'Home',
            },
          ]"
          @click="onTarget(item.type, 'Home')"
          @dblclick.stop="onOddsDblClick(item, 'Home')"
        >
          <span
            v-if="oddsFlashClass(item, 'Home') === 'odds-up'"
            class="odds-arrow odds-arrow-up"
            aria-hidden="true"
          >▲</span>
          <span
            v-else-if="oddsFlashClass(item, 'Home') === 'odds-down'"
            class="odds-arrow odds-arrow-down"
            aria-hidden="true"
          >▼</span>
          <span class="odds-value">{{ itemOdds(item, "Home") || "" }}</span>
        </div>
        <div
          class="item-odds away"
          :class="[
            oddsFlashClass(item, 'Away'),
            {
              lock: !itemOdds(item, 'Away'),
              target: matchStore.getBetTarget(item.type, bet.id) === 'Away',
            },
          ]"
          @click="onTarget(item.type, 'Away')"
          @dblclick.stop="onOddsDblClick(item, 'Away')"
        >
          <span
            v-if="oddsFlashClass(item, 'Away') === 'odds-up'"
            class="odds-arrow odds-arrow-up"
            aria-hidden="true"
          >▲</span>
          <span
            v-else-if="oddsFlashClass(item, 'Away') === 'odds-down'"
            class="odds-arrow odds-arrow-down"
            aria-hidden="true"
          >▼</span>
          <span class="odds-value">{{ itemOdds(item, "Away") || "" }}</span>
        </div>
      </div>
    </div>

    <CreateLoseDialog
      :open="loseOpen"
      :match="match"
      :bet="bet"
      @close="loseOpen = false"
    />
    <LimitDiagDialog
      :open="limitOpen"
      :provider="limitProvider"
      :item-ids="limitItemIds"
      @close="limitOpen = false"
    />
  </div>
</template>

<style scoped>
.live-tag {
  display: inline-block;
  margin-bottom: 4px;
  padding: 0 8px;
  font-size: 11px;
  line-height: 20px;
  border-radius: 10px;
  background: #e6a23c;
  color: #fff;
}
.bet-title {
  cursor: default;
  user-select: none;
}
.item-type {
  cursor: pointer;
}
.item-odds {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 2.8em;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.55s ease, color 0.55s ease;
}
.item-odds.target {
  outline: 1px solid #67c23a;
}
.item-odds.odds-up {
  background-color: #00bd7e !important;
  color: #fff !important;
}
.item-odds.odds-down {
  background-color: #f56c6c !important;
  color: #fff !important;
}
.odds-arrow {
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
}
.odds-arrow-up {
  color: #e8fff4;
}
.odds-arrow-down {
  color: #fff0f0;
}
.odds-value {
  font-variant-numeric: tabular-nums;
}
</style>
