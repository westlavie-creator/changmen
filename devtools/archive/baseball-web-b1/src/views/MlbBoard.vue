<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { fetchMlbEvents, type MlbEventQuote, type MlbOutcomeQuote } from "@/api/mlbGamma";
import { eventLookupKeys, type MlbSportLive } from "@/lib/mlbSport";
import { createMlbSportsWsFeed } from "@/ws/mlbSportsWs";

const events = ref<MlbEventQuote[]>([]);
const loading = ref(false);
const error = ref("");
const lastUpdated = ref<number | null>(null);
const expanded = ref<Record<string, boolean>>({});
const wsConnected = ref(false);
const sportByKey = reactive<Record<string, MlbSportLive>>({});

let refreshTimer: ReturnType<typeof setInterval> | undefined;
let sportsFeed: ReturnType<typeof createMlbSportsWsFeed> | undefined;

const eventCount = computed(() => events.value.length);
const liveCount = computed(() =>
  events.value.filter(event => getSportForEvent(event)?.live).length,
);

function formatStart(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatOdds(outcome: MlbOutcomeQuote | undefined): string {
  if (!outcome || outcome.decimalOdds <= 0)
    return "—";
  return outcome.decimalOdds.toFixed(2);
}

function formatProb(outcome: MlbOutcomeQuote | undefined): string {
  if (!outcome || outcome.probability <= 0)
    return "—";
  return `${(outcome.probability * 100).toFixed(1)}%`;
}

function marketTypeLabel(type: string): string {
  const map: Record<string, string> = {
    moneyline: "胜负",
    spreads: "让分",
    totals: "大小",
    nrfi: "首局得分",
    child_moneyline: "局胜负",
  };
  return map[type] ?? type;
}

function toggleMarkets(id: string): void {
  expanded.value[id] = !expanded.value[id];
}

function storeSportSnapshot(snapshot: MlbSportLive): void {
  const keys: string[] = [];
  if (snapshot.slug)
    keys.push(`slug:${snapshot.slug}`);
  if (snapshot.gameId != null && Number.isFinite(snapshot.gameId))
    keys.push(`game:${snapshot.gameId}`);
  for (const key of keys)
    sportByKey[key] = snapshot;
}

function getSportForEvent(event: MlbEventQuote): MlbSportLive | undefined {
  for (const key of eventLookupKeys(event)) {
    const snap = sportByKey[key];
    if (snap)
      return snap;
  }
  return undefined;
}

function sportBadgeClass(sport: MlbSportLive | undefined): string {
  if (!sport)
    return "";
  if (sport.live)
    return "live";
  if (sport.ended)
    return "ended";
  return "idle";
}

async function loadEvents(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    events.value = await fetchMlbEvents();
    lastUpdated.value = Date.now();
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
  finally {
    loading.value = false;
  }
}

onMounted(() => {
  sportsFeed = createMlbSportsWsFeed(
    storeSportSnapshot,
    connected => { wsConnected.value = connected; },
  );
  sportsFeed.start();
  void loadEvents();
  refreshTimer = setInterval(() => void loadEvents(), 60_000);
});

onUnmounted(() => {
  sportsFeed?.stop();
  if (refreshTimer)
    clearInterval(refreshTimer);
});
</script>

<template>
  <div class="page">
    <header class="header">
      <div>
        <p class="eyebrow">changmen · baseball B1</p>
        <h1>Polymarket MLB</h1>
        <p class="subtitle">Gamma 赛事 + CLOB 买入价 + Sports WS 实时比分（本地直连）</p>
      </div>
      <div class="header-actions">
        <button class="btn" :disabled="loading" @click="loadEvents">
          {{ loading ? "刷新中…" : "刷新" }}
        </button>
        <span class="meta ws-status" :class="{ on: wsConnected }">
          WS {{ wsConnected ? "已连接" : "重连中" }}
        </span>
        <span v-if="lastUpdated" class="meta">
          {{ eventCount }} 场 · 直播 {{ liveCount }} · 更新于 {{ formatStart(lastUpdated) }}
        </span>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="!events.length && !loading && !error" class="empty">
      暂无 MLB 赛事（时间窗：过去 24h ~ 未来 7 天）
    </section>

    <section v-else class="board">
      <article v-for="event in events" :key="event.id" class="card">
        <div class="card-main">
          <div class="match-meta">
            <time>{{ formatStart(event.startTimeMs) }}</time>
            <h2>{{ event.title }}</h2>
            <p v-if="getSportForEvent(event)" class="sport-line" :class="sportBadgeClass(getSportForEvent(event))">
              {{ getSportForEvent(event)?.label }}
            </p>
            <p v-else class="sport-line muted">等待 Sports WS 推送</p>
            <p v-if="event.slug" class="slug">
              {{ event.slug }}<template v-if="event.gameId"> · gameId {{ event.gameId }}</template>
            </p>
          </div>

          <div v-if="event.moneyline" class="moneyline">
            <div
              v-for="outcome in event.moneyline.outcomes"
              :key="outcome.tokenId || outcome.name"
              class="odds-cell"
            >
              <span class="team">{{ outcome.name }}</span>
              <strong>{{ formatOdds(outcome) }}</strong>
              <span class="prob">{{ formatProb(outcome) }}</span>
            </div>
          </div>
          <div v-else class="moneyline muted">
            无 open moneyline
          </div>

          <button
            v-if="event.markets.length > 1"
            class="btn-link"
            @click="toggleMarkets(event.id)"
          >
            {{ expanded[event.id] ? "收起盘口" : `更多盘口 (${event.markets.length - 1})` }}
          </button>
        </div>

        <div v-if="expanded[event.id]" class="markets">
          <div
            v-for="market in event.markets.filter(m => m.type !== 'moneyline')"
            :key="`${event.id}-${market.type}-${market.label}`"
            class="market-row"
          >
            <span class="market-type">{{ marketTypeLabel(market.type) }}</span>
            <span class="market-label">{{ market.label }}</span>
            <div class="market-outcomes">
              <span
                v-for="outcome in market.outcomes"
                :key="outcome.tokenId || outcome.name"
                class="outcome-pill"
              >
                {{ outcome.name }} {{ formatOdds(outcome) }}
              </span>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
