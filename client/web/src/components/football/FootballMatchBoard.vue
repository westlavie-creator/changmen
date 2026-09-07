<script setup lang="ts">
import FootballMarketBook from "@/components/football/FootballMarketBook.vue";
import FootballMatchCard from "@/components/football/FootballMatchCard.vue";
import type { ViewMatch } from "@/models/match";
import {
  FOOTBALL_LIVE_LOOKBACK_MS,
  FOOTBALL_UPCOMING_MS,
  filterSportBoardMatches,
} from "@/runtime/sportBoardFilter";
import {
  startSportLiveOddsSession,
  type SportLiveOddsSession,
} from "@/runtime/sportLiveOdds";
import { useFootballStore } from "@/stores/footballStore";
import { useSportOddsStore } from "@/stores/sportOddsStore";
import { getGameDisplayName } from "@changmen/shared/catalog/game_catalog.browser";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const football = useFootballStore();
const { matchs, loading, error } = storeToRefs(football);
const { tick: oddsDisplayTick } = storeToRefs(useSportOddsStore());

const searchQuery = ref("");
const nowTick = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
let liveSession: SportLiveOddsSession | null = null;

const displayedMatchs = computed(() => {
  void nowTick.value;
  return filterSportBoardMatches(matchs.value, {
    query: searchQuery.value,
    horizonMs: FOOTBALL_UPCOMING_MS,
    lookbackMs: FOOTBALL_LIVE_LOOKBACK_MS,
    now: nowTick.value,
  });
});

const matchCountLabel = computed(() => {
  const total = matchs.value.length;
  const shown = displayedMatchs.value.length;
  if (shown !== total)
    return `${shown} / ${total} 场`;
  return `${shown} 场`;
});

const leagueGroups = computed(() => {
  const map = new Map<string, ViewMatch[]>();
  for (const m of displayedMatchs.value) {
    const league = getGameDisplayName(m.game || "") || "其他";
    let list = map.get(league);
    if (!list) {
      list = [];
      map.set(league, list);
    }
    list.push(m);
  }
  return [...map.entries()].map(([league, matches]) => ({ league, matches }));
});

onMounted(() => {
  football.startPolling();
  liveSession = startSportLiveOddsSession(() => displayedMatchs.value);
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 15_000);
});

onUnmounted(() => {
  football.stopPolling();
  liveSession?.stop();
  liveSession = null;
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});

watch(
  () => displayedMatchs.value.map(m => m.id).join(","),
  () => {
    liveSession?.sync();
  },
);
</script>

<template>
  <div class="football-board-list">
    <div class="match-search-row sport-toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索队名 / 联赛 / 比赛ID"
        clearable
        class="match-search"
      />
      <span class="match-count" :title="`当前列表 ${displayedMatchs.length} 场`">
        {{ matchCountLabel }}
      </span>
      <span class="sport-toolbar__meta">
        未来6小时 · 全部盘口
      </span>
      <el-button link type="primary" :loading="loading" @click="football.fetchMatchs(true)">
        刷新
      </el-button>
    </div>
    <p v-if="error" class="sport-toolbar__error">
      {{ error }}
    </p>
    <div v-if="displayedMatchs.length" class="matchs">
      <section
        v-for="group in leagueGroups"
        :key="group.league"
        class="football-league"
      >
        <div class="football-league__head">
          {{ group.league }} · {{ group.matches.length }}
        </div>
        <FootballMatchCard
          v-for="m in group.matches"
          :key="m.id"
          :match="m"
        >
          <FootballMarketBook
            :match="m"
            :odds-display-tick="oddsDisplayTick"
          />
        </FootballMatchCard>
      </section>
    </div>
    <div v-else-if="!loading && !error" class="match-empty">
      {{ searchQuery.trim() ? "没有匹配的比赛" : "未来6小时暂无足球比赛" }}
    </div>
  </div>
</template>

<style scoped>
.football-board-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.football-board-list .match-search-row {
  flex: 0 0 auto;
}
.football-board-list .matchs,
.football-board-list .match-empty {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.sport-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  max-width: none;
}
.sport-toolbar__meta {
  flex: 0 1 auto;
  font-size: 13px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sport-toolbar__error {
  flex: 0 0 auto;
  margin: 0 10px 8px;
  color: #f56c6c;
  font-size: 13px;
}
.sport-toolbar :deep(.el-button) {
  margin-left: auto;
}
.football-league {
  margin: 0 10px 12px;
}
.football-league__head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  color: hsla(0, 0%, 100%, 0.82);
  background: #1a2332;
  border-left: 3px solid #3b82f6;
  border-radius: 4px 4px 0 0;
}
.football-league :deep(.football-match) {
  margin-left: 0;
  margin-right: 0;
}
</style>
