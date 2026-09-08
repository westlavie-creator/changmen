<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import { formatDate } from "@changmen/client-core/shared/format";
import { footballLeagueTag } from "@/runtime/footballLeague";
import {
  formatObSportElapsed,
  formatObSportScore,
  obSportPeriodLabel,
  obSportMatchInPlay,
} from "@/runtime/obSportLive";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";

const props = defineProps<{
  match: ViewMatch;
}>();

const obLive = useObSportLiveStore();
const { tick: liveTick } = storeToRefs(obLive);
const nowMs = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;

const leagueTag = computed(() => footballLeagueTag(props.match.game));
const obMid = computed(() => String(props.match.providers?.OB || "").trim());
const live = computed(() => {
  void liveTick.value;
  return obMid.value ? obLive.get(obMid.value) : undefined;
});
const scoreLabel = computed(() => formatObSportScore(live.value));
const periodLabel = computed(() => obSportPeriodLabel(live.value?.mmp || ""));
const clockLabel = computed(() => {
  void nowMs.value;
  return formatObSportElapsed(live.value, nowMs.value);
});
const showLive = computed(() => Boolean(scoreLabel.value || (live.value && obSportMatchInPlay(live.value))));

onMounted(() => {
  clockTimer = setInterval(() => { nowMs.value = Date.now(); }, 1_000);
});
onUnmounted(() => {
  if (clockTimer)
    clearInterval(clockTimer);
});
</script>

<template>
  <div class="match football-match">
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
    <div class="football-match__book">
      <slot />
    </div>
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
.football-match__book {
  width: 100%;
  min-width: 0;
}
</style>
