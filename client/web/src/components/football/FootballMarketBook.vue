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
import { viewBetsToMarketRows, mergeFootballBookRows } from "@/runtime/footballMarketRows";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

const props = defineProps<{
  match: ViewMatch;
}>();

const loading = ref(false);
const error = ref("");
const obRows = ref<FootballObMarketRow[]>([]);
let fetchGen = 0;

const obLive = useObSportLiveStore();
const { playRevByMid } = storeToRefs(obLive);

const obMid = computed(() => String(props.match.providers?.OB || "").trim());
const teams = computed(() => splitFootballTeams(String(props.match.title || "")));

/** HTTP 结构稳定；实时价由 FootballOddsCell 按 oid 读 sportOddsStore，不订全局 tick。 */
const listRows = computed(() => viewBetsToMarketRows(props.match));

const allRows = computed(() => mergeFootballBookRows(listRows.value, obRows.value));

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
  const kick = () => { void fetchAllMarkets(); };
  if (listRows.value.length && typeof requestIdleCallback === "function")
    requestIdleCallback(kick, { timeout: 2500 });
  else
    kick();
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
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 8px;
  overflow: visible;
  padding-bottom: 4px;
}
.fb-book__col {
  flex: 1 1 0;
  min-width: 0;
  background: hsla(0, 0%, 100%, 0.04);
  border-radius: 8px;
  overflow: visible;
}
.fb-book__col--ml,
.fb-book__col--ht_ml {
  flex: 1.2 1 0;
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
