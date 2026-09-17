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
import { isObFootballPlaceholderTitle } from "@/runtime/obSportFootballFetch";
import {
  obChineseNamesRev,
  peekObChineseNames,
} from "@/runtime/obSportChineseNames";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { storeToRefs } from "pinia";
import { computed, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  match: ViewMatch;
}>();

const obLive = useObSportLiveStore();
const { byMid } = storeToRefs(obLive);
const clockLabel = ref("");
let clockTimer: ReturnType<typeof setInterval> | null = null;

const leagueTag = computed(() => footballLeagueTag(props.match.game));
const obMid = computed(() => String(props.match.providers?.OB || "").trim());

const boardTitle = computed(() => String(props.match.title || "").trim());

const zhNames = computed(() => {
  void obChineseNamesRev.value;
  const mid = obMid.value;
  return mid ? peekObChineseNames(mid) : null;
});

function splitVs(title: string): { home: string; away: string } | null {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  const home = String(parts[0] || "").trim();
  const away = String(parts.slice(1).join(" vs ") || "").trim();
  if (!home || !away)
    return null;
  return { home, away };
}

/** 两侧队名：英文主；中文旁路有则挂在后面。 */
const titleSides = computed(() => {
  const title = boardTitle.value;
  const mid = obMid.value;
  const zh = zhNames.value;
  const enPair = !isObFootballPlaceholderTitle(title, mid, String(props.match.game || ""))
    ? splitVs(title)
    : null;
  const homeEn = enPair?.home || "";
  const awayEn = enPair?.away || "";
  const homeZh = zh?.home || "";
  const awayZh = zh?.away || "";

  if (homeEn && awayEn) {
    return {
      home: homeEn,
      away: awayEn,
      homeZh: homeZh && homeZh.toLowerCase() !== homeEn.toLowerCase() ? homeZh : "",
      awayZh: awayZh && awayZh.toLowerCase() !== awayEn.toLowerCase() ? awayZh : "",
    };
  }
  if (homeZh && awayZh) {
    return { home: homeZh, away: awayZh, homeZh: "", awayZh: "" };
  }
  const fallback = title || (mid ? `Football ${mid}` : "Home vs Away");
  return { home: fallback, away: "", homeZh: "", awayZh: "" };
});

/** 只订本场 byMid 的比分/节次，不订全局 liveTick，也不读 elapsedSec。 */
const live = computed(() => {
  const mid = obMid.value;
  if (!mid)
    return undefined;
  const row = byMid.value[mid];
  void row?.home;
  void row?.away;
  void row?.mmp;
  void row?.ms;
  return row;
});
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
    <label class="football-match__name">
      <template v-if="titleSides.away">
        <span>{{ titleSides.home }}</span>
        <span v-if="titleSides.homeZh" class="football-match__zh"> ({{ titleSides.homeZh }})</span>
        <span> vs </span>
        <span>{{ titleSides.away }}</span>
        <span v-if="titleSides.awayZh" class="football-match__zh"> ({{ titleSides.awayZh }})</span>
      </template>
      <template v-else>{{ titleSides.home }}</template>
    </label>
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
.football-match__zh {
  font-weight: 500;
  font-size: 0.92em;
  color: #94a3b8;
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
