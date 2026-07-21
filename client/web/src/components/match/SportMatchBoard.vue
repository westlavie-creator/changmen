<script setup lang="ts">
import type { Store } from "pinia";
import type { ViewMatch } from "@/models/match";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, watch } from "vue";
import MatchCard from "@/components/match/MatchCard.vue";
import {
  startSportLiveOddsSession,
  type SportLiveOddsSession,
} from "@/runtime/sportLiveOdds";
import { useSportOddsStore } from "@/stores/sportOddsStore";

/** 非电竞只读列表板：与电竞 .matchs 同级挂在 home-main */
export type SportListStore = Store<
  string,
  {
    matchs: ViewMatch[];
    loading: boolean;
    error: string | null;
  },
  object,
  {
    fetchMatchs: (force?: boolean) => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
  }
>;

const props = defineProps<{
  store: SportListStore;
  metaLabel: string;
  emptyLabel: string;
}>();

const { matchs, loading, error } = storeToRefs(props.store);
/** 体育实时盘显示时钟；只由本板注入 MatchCard，电竞 BetRow 不依赖 sportOddsStore */
const { tick: oddsDisplayTick } = storeToRefs(useSportOddsStore());

let liveSession: SportLiveOddsSession | null = null;

onMounted(() => {
  // 仅当前 Tab 挂载时轮询；切换 Tab（v-if 卸载）会 stopPolling。与电竞 mainBetLoop 无关。
  props.store.startPolling();
  // collector hub：登记可见场 token，报价只刷 fallback / sportOddsStore，不写 fo
  liveSession = startSportLiveOddsSession(() => props.store.matchs);
});

onUnmounted(() => {
  props.store.stopPolling();
  liveSession?.stop();
  liveSession = null;
});

// 列表刷新后重同步订阅 + 用直播缓存盖回 fallback
watch(matchs, () => {
  liveSession?.sync();
});

const count = computed(() => matchs.value.length);
</script>

<template>
  <div class="sport-board">
    <div class="match-search sport-toolbar">
      <span class="sport-toolbar__meta">
        {{ metaLabel }} · {{ count }} 场
      </span>
      <el-button link type="primary" :loading="loading" @click="store.fetchMatchs(true)">
        刷新
      </el-button>
    </div>
    <p v-if="error" class="sport-toolbar__error">
      {{ error }}
    </p>
    <div v-if="matchs.length" class="matchs">
      <MatchCard
        v-for="m in matchs"
        :key="m.id"
        :match="m"
        :odds-display-tick="oddsDisplayTick"
        :allow-betting="false"
      />
    </div>
    <div v-else-if="!loading && !error" class="match-empty">
      {{ emptyLabel }}
    </div>
  </div>
</template>

<style scoped>
.sport-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  max-width: none;
}
.sport-toolbar__meta {
  font-size: 13px;
  color: #94a3b8;
}
.sport-toolbar__error {
  flex: 0 0 auto;
  margin: 0 10px 8px;
  color: #f56c6c;
  font-size: 13px;
}
</style>
