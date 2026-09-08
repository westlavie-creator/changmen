<script setup lang="ts">
import FootballMarketSection from "@/components/football/FootballMarketSection.vue";
import type { ViewMatch } from "@/models/match";
import {
  groupFootballColumns,
  splitFootballTeams,
  type FootballBookColumn,
} from "@/runtime/footballMarketLayout";
import {
  invalidateFootballObMarkets,
  isFootballObMarketsComplete,
  loadFootballObMarkets,
  peekFootballObMarkets,
  type FootballObMarketRow,
} from "@/runtime/footballObMarkets";
import { viewBetsToMarketRows, mergeFootballBookRows, applyObLiveOdds } from "@/runtime/footballMarketRows";
import { useSportOddsStore } from "@/stores/sportOddsStore";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

const props = defineProps<{
  match: ViewMatch;
  oddsDisplayTick?: number;
}>();

const loading = ref(false);
const error = ref("");
const obRows = ref<FootballObMarketRow[]>([]);
let fetchGen = 0;

const sportOdds = useSportOddsStore();
const obLive = useObSportLiveStore();
const { tick: sportTick } = storeToRefs(sportOdds);
const { tick: liveTick, playRevByMid } = storeToRefs(obLive);

const obMid = computed(() => String(props.match.providers?.OB || "").trim());
const teams = computed(() => splitFootballTeams(String(props.match.title || "")));

const listRows = computed(() => {
  void props.oddsDisplayTick;
  void sportTick.value;
  void liveTick.value;
  return viewBetsToMarketRows(props.match, {
    get: (p, id) => sportOdds.get(p, id),
    has: (p, id) => sportOdds.has(p, id),
    getLine: oid => obLive.getLine(oid),
  });
});

const liveObRows = computed(() => {
  void sportTick.value;
  void liveTick.value;
  return applyObLiveOdds(obRows.value, {
    get: (p, id) => sportOdds.get(p, id),
    has: (p, id) => sportOdds.has(p, id),
    getLine: oid => obLive.getLine(oid),
  });
});

const allRows = computed(() => {
  return mergeFootballBookRows(listRows.value, liveObRows.value);
});

const columns = computed((): FootballBookColumn[] => groupFootballColumns(allRows.value));

async function fetchAllMarkets(force = false) {
  const mid = obMid.value;
  if (!mid)
    return;
  const gen = ++fetchGen;
  if (force)
    invalidateFootballObMarkets(mid);
  const cached = peekFootballObMarkets(mid);
  if (cached)
    obRows.value = cached;
  const hasRows = (cached?.length || 0) > 0 || obRows.value.length > 0 || listRows.value.length > 0;
  if (!force && cached && isFootballObMarketsComplete(cached))
    return;
  if (!hasRows)
    loading.value = true;
  error.value = "";
  try {
    const rows = await loadFootballObMarkets(mid, force);
    if (gen !== fetchGen)
      return;
    obRows.value = rows;
  }
  catch (err) {
    if (gen !== fetchGen)
      return;
    error.value = err instanceof Error ? err.message : String(err);
  }
  finally {
    if (gen === fetchGen)
      loading.value = false;
  }
}

onMounted(() => {
  void fetchAllMarkets();
});

watch(obMid, (mid) => {
  obRows.value = peekFootballObMarkets(String(mid || "")) || [];
  error.value = "";
  void fetchAllMarkets();
});

watch(
  () => playRevByMid.value[obMid.value] || 0,
  (rev, prev) => {
    if (rev && rev !== prev)
      void fetchAllMarkets(true);
  },
);
</script>

<template>
  <div
    v-if="obMid || columns.length"
    class="fb-book"
  >
    <div v-if="columns.length" class="fb-book__cols">
      <section
        v-for="col in columns"
        :key="col.id"
        class="fb-book__col"
        :class="`fb-book__col--${col.id}`"
      >
        <div class="fb-book__col-head">
          {{ col.label }}
        </div>
        <FootballMarketSection
          v-for="sec in col.sections"
          :key="sec.key"
          :section="sec"
          :home="teams.home"
          :away="teams.away"
          :show-title="col.sections.length > 1 || sec.title !== col.label"
        />
      </section>
    </div>
    <div v-if="loading && !columns.length" class="fb-book__hint">
      加载盘口…
    </div>
    <div v-else-if="error" class="fb-book__hint err">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.fb-book {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 0 4px;
}
.fb-book__cols {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  overflow: visible;
  padding-bottom: 4px;
}
.fb-book__col {
  flex: 0 0 260px;
  min-width: 240px;
  background: hsla(0, 0%, 100%, 0.04);
  border-radius: 8px;
  overflow: hidden;
}
.fb-book__col--ml {
  flex-basis: 280px;
}
.fb-book__col--ah,
.fb-book__col--ou {
  flex-basis: 320px;
}
.fb-book__col--cs,
.fb-book__col--goals,
.fb-book__col--other {
  flex-basis: 280px;
}
.fb-book__col-head {
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  color: hsla(0, 0%, 100%, 0.9);
  background: hsla(0, 0%, 100%, 0.06);
  border-left: 3px solid #3b82f6;
}
.fb-book__hint {
  font-size: 12px;
  color: #94a3b8;
  padding: 4px 2px;
}
.fb-book__hint.err {
  color: #f56c6c;
}
</style>
