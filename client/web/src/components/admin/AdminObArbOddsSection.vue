<script setup lang="ts">
import type { ObArbOddsAnalyticsPayload } from "@/api/admin";
import { computed, ref } from "vue";
import { toFixed } from "@/shared/format";

const props = defineProps<{
  data: ObArbOddsAnalyticsPayload | null | undefined;
}>();

const OB_ODDS_BUCKETS = [
  "1.00-1.49",
  "1.50-1.99",
  "2.00-2.49",
  "2.50-2.99",
  "3.00-3.99",
  "4.00-5.99",
  "6.00+",
] as const;

const filterProvider = ref("");

const otherProviders = computed(() => {
  const set = new Set<string>();
  for (const row of props.data?.summary ?? [])
    set.add(row.other_provider);
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
});

const filteredSummary = computed(() => {
  const rows = props.data?.summary ?? [];
  if (!filterProvider.value)
    return rows;
  return rows.filter(r => r.other_provider === filterProvider.value);
});

const filteredBuckets = computed(() => {
  const rows = props.data?.buckets ?? [];
  if (!filterProvider.value)
    return rows;
  return rows.filter(r => r.other_provider === filterProvider.value);
});

const providersToShow = computed(() => {
  if (filterProvider.value)
    return [filterProvider.value];
  return otherProviders.value;
});

function summaryFor(provider: string, status: "Win" | "Lose") {
  return filteredSummary.value.find(r => r.other_provider === provider && r.ob_status === status);
}

function bucketsFor(provider: string, status: "Win" | "Lose") {
  const byBucket = new Map(
    filteredBuckets.value
      .filter(r => r.other_provider === provider && r.ob_status === status)
      .map(r => [r.ob_odds_bucket, r]),
  );
  return OB_ODDS_BUCKETS.map((bucket) => {
    const row = byBucket.get(bucket);
    return {
      bucket,
      count: row?.count ?? 0,
      avgObOdds: row?.avg_ob_odds ?? 0,
      avgOtherOdds: row?.avg_other_odds ?? 0,
    };
  });
}

function maxBucketCount(provider: string): number {
  let max = 1;
  for (const status of ["Win", "Lose"] as const) {
    for (const row of bucketsFor(provider, status))
      max = Math.max(max, row.count);
  }
  return max;
}

function barWidth(count: number, provider: string): string {
  return `${toFixed((count / maxBucketCount(provider)) * 100, 0)}%`;
}

function fmtOdds(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n))
    return "-";
  return toFixed(n, 2);
}

const hasData = computed(() => (props.data?.summary?.length ?? 0) > 0);
</script>

<template>
  <div class="analytics-section">
    <div class="section-head">
      <h3 class="analytics-section__title">
        OB 套利赔率分布
      </h3>
      <el-select
        v-if="otherProviders.length"
        v-model="filterProvider"
        clearable
        placeholder="全部对手平台"
        size="small"
        style="width: 140px"
      >
        <el-option
          v-for="p in otherProviders"
          :key="p"
          :label="p"
          :value="p"
        />
      </el-select>
    </div>

    <p v-if="hasData" class="section-hint">
      套利双腿（Link ≥ 1e12）中 OB 一侧已结算为赢/输的订单；按 OB 下注赔率分桶，并显示同组对手腿均赔。
    </p>

    <div v-if="!hasData" class="analytics-empty">
      暂无 OB 套利赔率数据（需存在 OB + 其他平台的双腿套利且 OB 已赢/输结算）
    </div>

    <div
      v-for="provider in providersToShow"
      :key="provider"
      class="ob-arb-block"
    >
      <h4 class="ob-arb-block__title">
        OB vs {{ provider }}
      </h4>

      <div class="ob-arb-grid">
        <div
          v-for="status in (['Win', 'Lose'] as const)"
          :key="status"
          class="ob-arb-panel"
        >
          <div class="ob-arb-panel__head">
            <span class="ob-arb-panel__label" :class="status === 'Win' ? 'text-green' : 'text-red'">
              OB {{ status === "Win" ? "赢" : "输" }}
            </span>
            <span v-if="summaryFor(provider, status)" class="ob-arb-panel__meta">
              {{ summaryFor(provider, status)!.count }} 单 ·
              OB 均赔 {{ fmtOdds(summaryFor(provider, status)!.avg_ob_odds) }} ·
              对手均赔 {{ fmtOdds(summaryFor(provider, status)!.avg_other_odds) }} ·
              {{ fmtOdds(summaryFor(provider, status)!.min_ob_odds) }}–{{ fmtOdds(summaryFor(provider, status)!.max_ob_odds) }}
            </span>
            <span v-else class="ob-arb-panel__meta">0 单</span>
          </div>

          <el-table
            :data="bucketsFor(provider, status)"
            stripe
            size="small"
            :show-header="true"
          >
            <el-table-column prop="bucket" label="OB 赔率区间" width="110" />
            <el-table-column label="单量" width="60" align="right">
              <template #default="{ row }">
                {{ row.count || "" }}
              </template>
            </el-table-column>
            <el-table-column label="分布" min-width="160">
              <template #default="{ row }">
                <div v-if="row.count" class="dist-bar-bg">
                  <div
                    class="dist-bar-fill"
                    :class="status === 'Win' ? 'bar-green' : 'bar-red'"
                    :style="{ width: barWidth(row.count, provider) }"
                  />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="OB 均赔" width="80" align="right">
              <template #default="{ row }">
                {{ row.count ? fmtOdds(row.avgObOdds) : "" }}
              </template>
            </el-table-column>
            <el-table-column label="对手均赔" width="80" align="right">
              <template #default="{ row }">
                {{ row.count ? fmtOdds(row.avgOtherOdds) : "" }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.analytics-section__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}
.section-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ob-arb-block {
  margin-bottom: 20px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.ob-arb-block__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
}
.ob-arb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 960px) {
  .ob-arb-grid { grid-template-columns: 1fr; }
}
.ob-arb-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.ob-arb-panel__label { font-weight: 600; }
.ob-arb-panel__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.dist-bar-bg {
  height: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  overflow: hidden;
}
.dist-bar-fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
}
.bar-green { background: #67c23a; }
.bar-red { background: #f56c6c; }
.text-green { color: #67c23a; }
.text-red { color: #f56c6c; }
.analytics-empty {
  text-align: center;
  padding: 30px;
  color: var(--el-text-color-secondary);
}
</style>
