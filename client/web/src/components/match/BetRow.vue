<script setup lang="ts">
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import LimitDiagDialog from "@/components/match/LimitDiagDialog.vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { useBetRowExtensionUiEnabled } from "@/composables/useExtensionPrefs";
import { ArbLineOverlay, useBetRowArbUi } from "@/extensions/arbBet/ui";
import { useEvMarker } from "@/extensions/valueBet";
import { arbPercent, formatSecond, percent, toFixed } from "@changmen/client-core/shared/format";
import { useCreateLoseDialogStore } from "@/stores/createLoseDialogStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";

const props = defineProps<{
  match: ViewMatch;
  bet: ViewBet;
  /**
   * [changmen 扩展] 体育板传入：实时价只改 fallback / sportOddsStore，不写 fo。
   * 电竞路径不传；BetRow 不 import sportOddsStore，保持壳共用、store 隔离。
   */
  oddsDisplayTick?: number;
  /**
   * [changmen 扩展] 棒/足只读板：禁双击下单 / EV / 补单 / 点选 target，避免误走电竞 manualBet。
   * 电竞默认 true（或不传）。
   */
  allowBetting?: boolean;
}>();

const BET_SIDES: BetSide[] = ["Home", "Away"];
const bettingEnabled = computed(() => props.allowBetting !== false);

const oddsStore = useOddsStore();
const matchStore = useMatchStore();
const { liveTick } = storeToRefs(matchStore);

const createLoseDialog = useCreateLoseDialogStore();

const limitOpen = ref(false);
const limitProvider = ref<PlatformId>();
const limitItemIds = ref<string[]>([]);

const betRowUiEnabled = useBetRowExtensionUiEnabled();
/** 体育只读板关掉扩展交互暗示（红线/EV），避免看起来能下单 */
const extensionsEnabled = computed(() => betRowUiEnabled.value && bettingEnabled.value);

const arbUi = useBetRowArbUi(() => props.match, () => props.bet, extensionsEnabled);
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

const evMarker = useEvMarker(() => props.bet, extensionsEnabled);

const oddsByItemKey = computed(() => {
  void props.oddsDisplayTick;
  const out = new Map<string, { home: number; away: number }>();
  for (const item of props.bet.items) {
    out.set(`${item.type}:${item.betId}`, {
      home: oddsStore.getOdds(item.type, item.homeId, item.fallbackHomeOdds),
      away: oddsStore.getOdds(item.type, item.awayId, item.fallbackAwayOdds),
    });
  }
  return out;
});

const limitByItemKey = computed(() => {
  const out = new Map<string, boolean>();
  for (const item of props.bet.items) {
    out.set(
      `${item.type}:${item.betId}`,
      oddsStore.hasLimit(item.type, [item.homeId, item.awayId]),
    );
  }
  return out;
});

function itemHasLimit(item: ViewBet["items"][0]): boolean {
  return limitByItemKey.value.get(`${item.type}:${item.betId}`) ?? false;
}

function itemOdds(item: ViewBet["items"][0], side: BetSide) {
  const row = oddsByItemKey.value.get(`${item.type}:${item.betId}`);
  if (!row)
    return 0;
  return side === "Home" ? row.home : row.away;
}

/** [A8 可证实] HomeView 内联 `c(bet)`：各行最高主/客赔 implied，无红线/可下单标签 */
const arb = computed(() => {
  let bestHome = 0;
  let bestAway = 0;
  for (const item of props.bet.items) {
    const h = itemOdds(item, "Home");
    const a = itemOdds(item, "Away");
    if (h > bestHome)
      bestHome = h;
    if (a > bestAway)
      bestAway = a;
  }
  return arbPercent(bestHome, bestAway);
});

const showLiveTimer = computed(() => {
  const lr = props.match.liveRound;
  return lr !== 0 && lr === props.bet.round;
});

const liveSeconds = computed(() => {
  void liveTick.value;
  if (!showLiveTimer.value)
    return 0;
  const rs = props.match.liveRoundStart;
  const start = rs > 0 ? rs : props.bet.startTime ?? Date.now();
  return (Date.now() - start) / 1000;
});

function defaultOddsValue(betId: number, side: BetSide): number {
  void matchStore.defaultOdds;
  const fromStore = matchStore.getDefaultOdds(betId, side);
  if (fromStore > 0)
    return fromStore;
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
  if (!home || !away)
    return undefined;
  const implied = 1 / (1 / home + 1 / away);
  const line = defaultOddsValue(betId, side);
  if (!line)
    return undefined;
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
  if (!bettingEnabled.value)
    return;
  void matchStore.setBetTarget(platform, props.bet.id, side);
}

function openLimit(item: ViewBet["items"][0]) {
  if (!bettingEnabled.value)
    return;
  limitProvider.value = item.type;
  limitItemIds.value = [item.homeId, item.awayId];
  limitOpen.value = true;
}

function onOddsDblClick(item: ViewBet["items"][0], side: BetSide) {
  if (!bettingEnabled.value)
    return;
  void matchStore.manualBet(props.match, props.bet, item, side);
}

function onEvBadgeClick(item: ViewBet["items"][0], side: BetSide, e: MouseEvent) {
  e.stopPropagation();
  if (!bettingEnabled.value)
    return;
  if (!evMarker.isPositiveEv(item, side))
    return;
  void matchStore.valueBetConfirm(props.match, props.bet, item, side);
}

/** [A8 可证实] HomeView `v(match,bet)`：双击 bet-title 打开单例 CreateLoseView */
function onBetTitleDblClick() {
  if (!bettingEnabled.value)
    return;
  createLoseDialog.show(props.match, props.bet);
}
</script>

<template>
  <div class="bet">
    <el-tag
      v-if="showLiveTimer"
      class="live"
      type="warning"
      size="small"
      effect="dark"
      round
      :disable-transitions="true"
    >
      {{ formatSecond(liveSeconds) }}
    </el-tag>
    <div class="bet-title" @dblclick="onBetTitleDblClick">
      {{ bet.getBetName() }} - {{ arb }}
    </div>
    <div ref="itemsContainerRef" class="bet-items">
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
        <PlatformIcon
          class="item-type"
          :platform="item.type"
          :limit="itemHasLimit(item)"
          @click="openLimit(item)"
        />
        <div
          :ref="bindOddsAnchor(item.type, 'Home')"
          class="item-odds home"
          :class="{
            'lock': !itemOdds(item, 'Home'),
            'target': matchStore.getBetTarget(item.type, bet.id) === 'Home',
            'arb-leg': isArbLeg(item, 'Home'),
            ...oddsCellClasses(item, 'Home'),
            'ev-positive': evMarker.isPositiveEv(item, 'Home'),
            'ev-near': evMarker.isNearEv(item, 'Home'),
          }"
          @click="onTarget(item.type, 'Home')"
          @dblclick.stop="onOddsDblClick(item, 'Home')"
        >
          {{ itemOdds(item, "Home") || ""
          }}<span
            v-if="evMarker.evLabel(item, 'Home')"
            class="ev-badge"
            :class="{ 'ev-badge--action': evMarker.isPositiveEv(item, 'Home') }"
            :title="evMarker.isPositiveEv(item, 'Home') ? '点击确认正 EV 下单' : undefined"
            @click="onEvBadgeClick(item, 'Home', $event)"
            @dblclick.stop
          >{{
            evMarker.evLabel(item, "Home")
          }}</span><span v-if="sourceLabel(item, 'Home')" class="odds-src">{{
            sourceLabel(item, "Home")
          }}</span>
        </div>
        <div
          :ref="bindOddsAnchor(item.type, 'Away')"
          class="item-odds away"
          :class="{
            'lock': !itemOdds(item, 'Away'),
            'target': matchStore.getBetTarget(item.type, bet.id) === 'Away',
            'arb-leg': isArbLeg(item, 'Away'),
            ...oddsCellClasses(item, 'Away'),
            'ev-positive': evMarker.isPositiveEv(item, 'Away'),
            'ev-near': evMarker.isNearEv(item, 'Away'),
          }"
          @click="onTarget(item.type, 'Away')"
          @dblclick.stop="onOddsDblClick(item, 'Away')"
        >
          {{ itemOdds(item, "Away") || ""
          }}<span
            v-if="evMarker.evLabel(item, 'Away')"
            class="ev-badge"
            :class="{ 'ev-badge--action': evMarker.isPositiveEv(item, 'Away') }"
            :title="evMarker.isPositiveEv(item, 'Away') ? '点击确认正 EV 下单' : undefined"
            @click="onEvBadgeClick(item, 'Away', $event)"
            @dblclick.stop
          >{{
            evMarker.evLabel(item, "Away")
          }}</span><span v-if="sourceLabel(item, 'Away')" class="odds-src">{{
            sourceLabel(item, "Away")
          }}</span>
        </div>
      </div>
      <ArbLineOverlay
        v-if="extensionsEnabled"
        :line="arbLine"
        :badge="arbBadge"
        :label="overlayLabel"
      />
    </div>

    <LimitDiagDialog
      :open="limitOpen"
      :provider="limitProvider"
      :item-ids="limitItemIds"
      @close="limitOpen = false"
    />
  </div>
</template>
