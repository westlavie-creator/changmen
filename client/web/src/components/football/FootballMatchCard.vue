<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import { formatDate } from "@changmen/client-core/shared/format";
import { footballLeagueTag } from "@/runtime/footballLeague";
import {
  formatObSportElapsed,
  formatObSportScore,
  obSportPeriodLabel,
  obSportShowLiveBadge,
} from "@/runtime/obSportLive";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { computed, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  match: ViewMatch;
}>();

const obLive = useObSportLiveStore();
const clockLabel = ref("");
let clockTimer: ReturnType<typeof setInterval> | null = null;

const leagueTag = computed(() => footballLeagueTag(props.match.game));
const obMid = computed(() => String(props.match.providers?.OB || "").trim());
/** 只订本场 byMid，禁止 void 全局 liveTick（否则任意场进球会重绘所有标题）。 */
const live = computed(() => obMid.value ? obLive.get(obMid.value) : undefined);
const scoreLabel = computed(() => formatObSportScore(live.value));
const periodLabel = computed(() => obSportPeriodLabel(live.value?.mmp || ""));
const showLive = computed(() => Boolean(scoreLabel.value || obSportShowLiveBadge(live.value)));

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function tickClock() {
  clockLabel.value = formatObSportElapsed(obLive.get(obMid.value), Date.now());
}

watch(showLive, (on) => {
  stopClock();
  if (!on) {
    clockLabel.value = "";
    return;
  }
  tickClock();
  clockTimer = setInterval(tickClock, 1_000);
}, { immediate: true });

onUnmounted(stopClock);
</script>

<template>
  <div class="match-title football-match__title">
    <label v-if="leagueTag" class="game-tag">[{{ leagueTag }}]</label>
    <label class="football-match__name">{{ match.title }}</label>
    <span v-if="showLive" class="football-match__live">
      <span v-if="periodLabel" class="football-match__period">{{ periodLabel }}</span>
      <span v-if="clockLabel" class="football-match__clock">{{ clockLabel }}</span>
      <span v-if="scoreLabel" class="football-match__score">{{ scoreLabel }}</span>
    </span>
    <label v-else class="startTime">{{ formatDate(match.startAt) }}</label>
  </div>
</template>

<style scoped>
.football-match__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  padding: 0 0 10px;
}
.football-match__name {
  min-width: 0;
  font-weight: 600;
}
.football-match__live {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}
.football-match__period {
  font-size: 12px;
  color: #93c5fd;
}
.football-match__clock {
  font-size: 12px;
  color: hsla(0, 0%, 100%, 0.72);
}
.football-match__score {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
</style>
