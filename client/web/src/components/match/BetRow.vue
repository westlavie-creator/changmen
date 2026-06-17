<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import CreateLoseDialog from "@/components/match/CreateLoseDialog.vue";
import LimitDiagDialog from "@/components/match/LimitDiagDialog.vue";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";
import { useBettingStore } from "@/stores/bettingStore";
import { ArbLineOverlay, useBetRowArbUi } from "@/extensions/arbBet/ui";
import { arbPercent, formatSecond, percent, toFixed } from "@/shared/format";
import type { PlatformId } from "@/types/esport";
import { strictA8Mode } from "@/shared/a8Strict";

const BET_SIDES: BetSide[] = ["Home", "Away"];

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

const strictA8 = strictA8Mode;

// 增强 UI（红线/角标/flash/source 标签）：严格 A8 模式下必须关闭
const arbUi = useBetRowArbUi(() => props.match, () => props.bet);
const {
  itemsContainerRef,
  line: arbLine,
  badge: arbBadge,
  overlayLabel,
  isArbLeg,
  bindOddsAnchor,
  oddsCellClasses,
  sourceLabel,
} = arbUi;

function itemOdds(item: ViewBet["items"][0], side: BetSide) {
  void revision.value;
  void matchTick.value;
  return item.getOdds(side);
}

/** [A8 可证实] HomeView 内联 `c(bet)`：各行最高主/客赔 implied，无红线/可下单标签 */
const arb = computed(() => {
  void revision.value;
  void matchTick.value;
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

const liveSeconds = computed(() => {
  void matchTick.value;
  if (!props.bet.isLive || !props.bet.startTime) return 0;
  return (Date.now() - props.bet.startTime) / 1000;
});

const roundScore = computed(() => {
  void matchTick.value;
  return matchStore.getRoundScore(props.match.id, props.bet.round);
});

function defaultOddsValue(betId: number, side: BetSide): number {
  void matchTick.value;
  const fromStore = matchStore.getDefaultOdds(betId, side);
  if (fromStore > 0) return fromStore;
  return side === "Home" ? props.bet.initialHomeOdds : props.bet.initialAwayOdds;
}

const showDefaultOdds = computed(() => {
  return (
    defaultOddsValue(props.bet.id, "Home") > 0 || defaultOddsValue(props.bet.id, "Away") > 0
  );
});

function defaultOddsPercent(betId: number, side: BetSide): string | undefined {
  const home = defaultOddsValue(betId, "Home");
  const away = defaultOddsValue(betId, "Away");
  if (!home || !away) return undefined;
  const implied = 1 / (1 / home + 1 / away);
  const line = defaultOddsValue(betId, side);
  if (!line) return undefined;
  return percent(implied / line, 0);
}

function defaultOddsHigh(betId: number, side: BetSide): boolean {
  const v = defaultOddsValue(betId, side);
  return v > 2;
}

function defaultOddsLabel(betId: number, side: BetSide): string {
  const odds = toFixed(defaultOddsValue(betId, side), 3, "round");
  const pct = defaultOddsPercent(betId, side);
  return pct ? `${odds} / ${pct}` : odds;
}

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
    <el-tag
      v-if="bet.isLive && bet.startTime"
      class="live"
      type="warning"
      size="small"
      effect="dark"
      round
      :disable-transitions="true"
    >
      {{ formatSecond(liveSeconds) }}
    </el-tag>
    <div class="bet-title" @dblclick="loseOpen = true">
      {{ bet.getBetName() }} - {{ arb }}
    </div>
    <div ref="itemsContainerRef" class="bet-items">
      <div v-if="roundScore" class="score">
        <div class="home">{{ roundScore.Home }}</div>
        <div class="away">{{ roundScore.Away }}</div>
      </div>

      <div v-if="showDefaultOdds" class="item flex defaultOdds">
        <div class="item-type default" />
        <div
          v-for="side in BET_SIDES"
          :key="side"
          class="item-odds"
          :class="[side.toLowerCase(), { high: defaultOddsHigh(bet.id, side) }]"
        >
          {{ defaultOddsLabel(bet.id, side) }}
        </div>
      </div>

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
          :ref="strictA8 ? undefined : bindOddsAnchor(item.type, 'Home')"
          class="item-odds home"
          :class="{
            lock: !itemOdds(item, 'Home'),
            target: matchStore.getBetTarget(item.type, bet.id) === 'Home',
            'arb-leg': strictA8 ? false : isArbLeg(item, 'Home'),
            ...(strictA8 ? {} : oddsCellClasses(item, 'Home')),
          }"
          @click="onTarget(item.type, 'Home')"
          @dblclick.stop="onOddsDblClick(item, 'Home')"
        >
          {{ itemOdds(item, "Home") || ""
          }}<span v-if="!strictA8 && sourceLabel(item, 'Home')" class="odds-src">{{
            sourceLabel(item, "Home")
          }}</span>
        </div>
        <div
          :ref="strictA8 ? undefined : bindOddsAnchor(item.type, 'Away')"
          class="item-odds away"
          :class="{
            lock: !itemOdds(item, 'Away'),
            target: matchStore.getBetTarget(item.type, bet.id) === 'Away',
            'arb-leg': strictA8 ? false : isArbLeg(item, 'Away'),
            ...(strictA8 ? {} : oddsCellClasses(item, 'Away')),
          }"
          @click="onTarget(item.type, 'Away')"
          @dblclick.stop="onOddsDblClick(item, 'Away')"
        >
          {{ itemOdds(item, "Away") || ""
          }}<span v-if="!strictA8 && sourceLabel(item, 'Away')" class="odds-src">{{
            sourceLabel(item, "Away")
          }}</span>
        </div>
      </div>
      <ArbLineOverlay
        v-if="!strictA8"
        :line="arbLine"
        :badge="arbBadge"
        :label="overlayLabel"
      />
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
