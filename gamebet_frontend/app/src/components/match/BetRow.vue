<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import CreateLoseDialog from "@/components/match/CreateLoseDialog.vue";
import LimitDiagDialog from "@/components/match/LimitDiagDialog.vue";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";
import { useBettingStore } from "@/stores/bettingStore";
import { useConfigStore } from "@/stores/configStore";
import { useAccountStore } from "@/stores/accountStore";
import { arbLegSide, pickArbLegs } from "@/shared/arbitrage";
import { arbPercent, arbProfitRate, formatSecond, percent, toFixed } from "@/shared/format";
import type { PlatformId } from "@/types/esport";

const BET_SIDES: BetSide[] = ["Home", "Away"];

const props = defineProps<{
  match: ViewMatch;
  bet: ViewBet;
}>();

const oddsStore = useOddsStore();
const matchStore = useMatchStore();
const bettingStore = useBettingStore();
const configStore = useConfigStore();
const accountStore = useAccountStore();
const { revision } = storeToRefs(oddsStore);
const { tick: matchTick } = storeToRefs(matchStore);

const loseOpen = ref(false);
const limitOpen = ref(false);
const limitProvider = ref<PlatformId>();
const limitItemIds = ref<string[]>([]);

const betItemsRef = ref<HTMLElement | null>(null);
const arbLine = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
const arbBadge = ref<{ x: number; y: number } | null>(null);
const oddsRefMap = new Map<string, HTMLElement>();

function itemOdds(item: ViewBet["items"][0], side: BetSide) {
  void revision.value;
  void matchTick.value;
  return item.getOdds(side);
}

function itemFlash(item: ViewBet["items"][0], side: BetSide) {
  void revision.value;
  void matchTick.value;
  return oddsStore.getFlash(item.type, side === "Home" ? item.homeId : item.awayId);
}

/** 默认开启：全平台赔率参与检测，与是否开启投注无关 */
const arbLegs = computed(() => {
  void revision.value;
  void matchTick.value;
  const providerKeys = props.bet.items.map((item) => item.type);
  return pickArbLegs(
    props.bet,
    configStore.config,
    providerKeys,
    accountStore.accounts,
    props.match.game,
  );
});

const arb = computed(() => {
  if (arbLegs.value) {
    return `${percent(arbLegs.value.implied)} / 利润 ${arbProfitRate(arbLegs.value.implied)}`;
  }
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

const arbProfitLabel = computed(() => {
  const legs = arbLegs.value;
  if (!legs) return "";
  return `利润率 ${arbProfitRate(legs.implied)}`;
});

function oddsRefKey(type: PlatformId, side: BetSide) {
  return `${type}:${side}`;
}

function bindOddsRef(type: PlatformId, side: BetSide) {
  return (el: unknown) => {
    const key = oddsRefKey(type, side);
    const node =
      el instanceof HTMLElement
        ? el
        : el && typeof el === "object" && "$el" in el && (el as { $el: unknown }).$el instanceof HTMLElement
          ? ((el as { $el: HTMLElement }).$el)
          : null;
    if (node) oddsRefMap.set(key, node);
    else oddsRefMap.delete(key);
  };
}

function centerInContainer(el: HTMLElement, container: DOMRect) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - container.left,
    y: rect.top + rect.height / 2 - container.top,
  };
}

function refreshArbLine() {
  const legs = arbLegs.value;
  const root = betItemsRef.value;
  if (!legs || !root) {
    arbLine.value = null;
    arbBadge.value = null;
    return;
  }
  const homeEl = oddsRefMap.get(oddsRefKey(legs.homeItem.type, "Home"));
  const awayEl = oddsRefMap.get(oddsRefKey(legs.awayItem.type, "Away"));
  if (!homeEl || !awayEl) {
    arbLine.value = null;
    arbBadge.value = null;
    return;
  }
  const box = root.getBoundingClientRect();
  const p1 = centerInContainer(homeEl, box);
  const p2 = centerInContainer(awayEl, box);
  arbLine.value = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  arbBadge.value = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2 - 14,
  };
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(() => refreshArbLine());
  if (betItemsRef.value) resizeObserver.observe(betItemsRef.value);
  nextTick(refreshArbLine);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch([arbLegs, revision, matchTick], () => nextTick(refreshArbLine));

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
  return matchStore.getDefaultOdds(betId, side);
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
    <div ref="betItemsRef" class="bet-items">
      <svg v-if="arbLine" class="arb-lines" aria-hidden="true">
        <line
          :x1="arbLine.x1"
          :y1="arbLine.y1"
          :x2="arbLine.x2"
          :y2="arbLine.y2"
        />
      </svg>
      <div
        v-if="arbLine && arbBadge && arbProfitLabel"
        class="arb-profit-badge"
        :style="{ left: `${arbBadge.x}px`, top: `${arbBadge.y}px` }"
      >
        {{ arbProfitLabel }}
      </div>

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
          :ref="bindOddsRef(item.type, 'Home')"
          class="item-odds home"
          :class="{
            lock: !itemOdds(item, 'Home'),
            target: matchStore.getBetTarget(item.type, bet.id) === 'Home',
            'arb-leg': arbLegSide(arbLegs, item, 'Home'),
            'odds-up': itemFlash(item, 'Home')?.dir === 'up',
            'odds-down': itemFlash(item, 'Home')?.dir === 'down',
          }"
          @click="onTarget(item.type, 'Home')"
          @dblclick.stop="onOddsDblClick(item, 'Home')"
        >
          {{ itemOdds(item, "Home") || "" }}<span v-if="itemFlash(item, 'Home')" class="odds-src">{{ itemFlash(item, 'Home')?.source === 'mqtt' ? 'M' : 'H' }}</span>
        </div>
        <div
          :ref="bindOddsRef(item.type, 'Away')"
          class="item-odds away"
          :class="{
            lock: !itemOdds(item, 'Away'),
            target: matchStore.getBetTarget(item.type, bet.id) === 'Away',
            'arb-leg': arbLegSide(arbLegs, item, 'Away'),
            'odds-up': itemFlash(item, 'Away')?.dir === 'up',
            'odds-down': itemFlash(item, 'Away')?.dir === 'down',
          }"
          @click="onTarget(item.type, 'Away')"
          @dblclick.stop="onOddsDblClick(item, 'Away')"
        >
          {{ itemOdds(item, "Away") || "" }}<span v-if="itemFlash(item, 'Away')" class="odds-src">{{ itemFlash(item, 'Away')?.source === 'mqtt' ? 'M' : 'H' }}</span>
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
