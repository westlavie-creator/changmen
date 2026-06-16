<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { BetSide, ViewBet } from "@/models/match";
import ArbLineOverlay from "@/components/match/ArbLineOverlay.vue";
import CreateLoseDialog from "@/components/match/CreateLoseDialog.vue";
import LimitDiagDialog from "@/components/match/LimitDiagDialog.vue";
import { useArbLineOverlay, useOddsAnchorMap } from "@/composables/useArbLineOverlay";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";
import { useBettingStore } from "@/stores/bettingStore";
import { useConfigStore } from "@/stores/configStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { getProviders } from "@/stores/account/accountPicker";
import { arbLegSide, pickArbLegs, evaluateArbOrderEligibility } from "@/domain/arbitrage";
import { resolveArbProviderKeys } from "@/domain/betting";
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
const loseStore = useLoseOrderStore();
const { revision } = storeToRefs(oddsStore);
const { tick: matchTick } = storeToRefs(matchStore);

const loseOpen = ref(false);
const limitOpen = ref(false);
const limitProvider = ref<PlatformId>();
const limitItemIds = ref<string[]>([]);

const betItemsRef = ref<HTMLElement | null>(null);
const { bind: bindOddsRef, get: getOddsAnchor } = useOddsAnchorMap();

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
  const providerKeys = resolveArbProviderKeys("display", { bet: props.bet });
  return pickArbLegs(
    props.bet,
    configStore.config,
    providerKeys,
    accountStore.accounts,
    props.match.game,
  );
});

const arbEligibility = computed(() => {
  void revision.value;
  void matchTick.value;
  const legs = arbLegs.value;
  if (!legs) return undefined;
  const autoProviderKeys = resolveArbProviderKeys("auto", {
    accountProviderKeys: getProviders(accountStore).keys(),
  });
  return evaluateArbOrderEligibility({
    match: props.match,
    bet: props.bet,
    legs,
    config: configStore.config,
    accounts: accountStore.accounts,
    autoProviderKeys,
    loseOrderPending: loseStore.orders.has(props.bet.id),
    getBetTarget: (provider, betId) => matchStore.getBetTarget(provider, betId),
  });
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

const { line: arbLine, badge: arbBadge } = useArbLineOverlay(
  betItemsRef,
  () => {
    const legs = arbLegs.value;
    if (!legs) return null;
    return {
      home: getOddsAnchor(legs.homeItem.type, "Home"),
      away: getOddsAnchor(legs.awayItem.type, "Away"),
    };
  },
  [arbLegs, revision, matchTick],
);

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
      <el-tooltip
        v-if="arbEligibility"
        :content="arbEligibility.canOrder
          ? arbEligibility.reasons.join('；')
          : arbEligibility.reasons.join('\n')"
        placement="top"
      >
        <el-tag
          class="arb-order-tag"
          :type="arbEligibility.canOrder ? 'success' : 'danger'"
          size="small"
          effect="plain"
        >
          {{ arbEligibility.summary }}
        </el-tag>
      </el-tooltip>
    </div>
    <div ref="betItemsRef" class="bet-items">
      <ArbLineOverlay :line="arbLine" :badge="arbBadge" :label="arbProfitLabel" />

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

<style scoped>
.bet-title .arb-order-tag {
  margin-left: 6px;
  vertical-align: middle;
}
</style>
