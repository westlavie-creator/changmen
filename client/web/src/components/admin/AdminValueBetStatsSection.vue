<script setup lang="ts">
import type { ValueBetOrderAnalyticsPayload } from "@/api/admin";
import { computed, ref } from "vue";
import { toFixed } from "@changmen/client-core/shared/format";

const props = defineProps<{
  data: ValueBetOrderAnalyticsPayload | null | undefined;
}>();

const ODDS_BUCKETS = [
  "1.00-1.49",
  "1.50-1.99",
  "2.00-2.49",
  "2.50-2.99",
  "3.00-3.99",
  "4.00-5.99",
  "6.00+",
] as const;

const filterProvider = ref("");

const providers = computed(() => {
  const set = new Set<string>();
  for (const row of props.data?.byProvider ?? [])
    set.add(row.provider);
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
});

const filteredProviders = computed(() => {
  const rows = props.data?.byProvider ?? [];
  if (!filterProvider.value)
    return rows;
  return rows.filter(r => r.provider === filterProvider.value);
});

const bucketRows = computed(() => {
  const raw = props.data?.byOddsBucket ?? [];
  const scoped = filterProvider.value
    ? raw.filter(r => r.provider === filterProvider.value)
    : raw;
  const byBucket = new Map<string, {
    bucket: string;
    total_orders: number;
    wins: number;
    losses: number;
    rejects: number;
    pending: number;
    total_bet: number;
    total_profit: number;
    oddsSum: number;
    oddsWeight: number;
  }>();
  for (const b of ODDS_BUCKETS) {
    byBucket.set(b, {
      bucket: b,
      total_orders: 0,
      wins: 0,
      losses: 0,
      rejects: 0,
      pending: 0,
      total_bet: 0,
      total_profit: 0,
      oddsSum: 0,
      oddsWeight: 0,
    });
  }
  for (const row of scoped) {
    const cur = byBucket.get(row.odds_bucket);
    if (!cur)
      continue;
    cur.total_orders += row.total_orders;
    cur.wins += row.wins;
    cur.losses += row.losses;
    cur.rejects += row.rejects;
    cur.pending += row.pending;
    cur.total_bet += row.total_bet;
    cur.total_profit += row.total_profit;
    if (row.avg_odds != null && row.total_orders > 0) {
      cur.oddsSum += row.avg_odds * row.total_orders;
      cur.oddsWeight += row.total_orders;
    }
  }
  return ODDS_BUCKETS.map((bucket) => {
    const cur = byBucket.get(bucket)!;
    return {
      bucket,
      total_orders: cur.total_orders,
      wins: cur.wins,
      losses: cur.losses,
      rejects: cur.rejects,
      pending: cur.pending,
      total_bet: cur.total_bet,
      total_profit: cur.total_profit,
      avg_odds: cur.oddsWeight ? cur.oddsSum / cur.oddsWeight : 0,
    };
  });
});

const totals = computed(() => {
  const rows = filteredProviders.value;
  return rows.reduce(
    (acc, r) => {
      acc.total_orders += r.total_orders;
      acc.wins += r.wins;
      acc.losses += r.losses;
      acc.rejects += r.rejects;
      acc.pending += r.pending;
      acc.total_bet += r.total_bet;
      acc.total_profit += r.total_profit;
      return acc;
    },
    { total_orders: 0, wins: 0, losses: 0, rejects: 0, pending: 0, total_bet: 0, total_profit: 0 },
  );
});

const maxBucketOrders = computed(() => Math.max(...bucketRows.value.map(r => r.total_orders), 1));

const hasData = computed(() => (props.data?.byProvider?.length ?? 0) > 0);

function winRate(wins: number, losses: number): string {
  const settled = wins + losses;
  return settled ? `${toFixed((wins / settled) * 100, 1)}%` : "-";
}

function rejectRate(orders: number, rejects: number): string {
  return orders ? `${toFixed((rejects / orders) * 100, 1)}%` : "-";
}

function barWidth(count: number): string {
  return `${toFixed((count / maxBucketOrders.value) * 100, 0)}%`;
}

function fmtOdds(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n) || n <= 0)
    return "-";
  return toFixed(n, 2);
}

function fmtMoney(n: number | undefined | null): string {
  const v = n ?? 0;
  return `${v >= 0 ? "+" : ""}${toFixed(v, 0)}`;
}
</script>

<template>
  <div class="analytics-section">
    <div class="section-head">
      <h3 class="analytics-section__title">
        正 EV 统计
      </h3>
      <el-select
        v-if="providers.length > 1"
        v-model="filterProvider"
        clearable
        placeholder="全部场馆"
        size="small"
        style="width: 140px"
      >
        <el-option
          v-for="p in providers"
          :key="p"
          :label="p"
          :value="p"
        />
      </el-select>
    </div>

    <p v-if="hasData" class="section-hint">
      识别 orders.link 正 EV 编码（💎）；金额已换算 CNY。不含套利双腿与普通 9999 单边。
    </p>

    <div v-if="!hasData" class="analytics-empty">
      暂无正 EV 下注数据
    </div>

    <template v-else>
      <div class="vb-summary">
        <span>{{ totals.total_orders }} 笔</span>
        <span>胜 {{ totals.wins }} / 负 {{ totals.losses }} / 拒 {{ totals.rejects }} / 未结 {{ totals.pending }}</span>
        <span>买入 {{ toFixed(totals.total_bet, 0) }}</span>
        <span :class="totals.total_profit >= 0 ? 'text-green' : 'text-red'">
          盈亏 {{ fmtMoney(totals.total_profit) }}
        </span>
        <span>胜率 {{ winRate(totals.wins, totals.losses) }}</span>
      </div>

      <h4 class="vb-subtitle">
        场馆
      </h4>
      <el-table :data="filteredProviders" stripe size="small" :show-header="true">
        <el-table-column prop="provider" label="场馆" width="100" />
        <el-table-column prop="total_orders" label="笔数" width="70" align="right" />
        <el-table-column label="胜/负/拒" width="110" align="right">
          <template #default="{ row }">
            {{ row.wins }}/{{ row.losses }}/{{ row.rejects }}
          </template>
        </el-table-column>
        <el-table-column label="胜率" width="70" align="right">
          <template #default="{ row }">
            {{ winRate(row.wins, row.losses) }}
          </template>
        </el-table-column>
        <el-table-column label="拒单率" width="70" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-warn': row.rejects > 0 }">
              {{ rejectRate(row.total_orders, row.rejects) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="均赔" width="70" align="right">
          <template #default="{ row }">
            {{ fmtOdds(row.avg_odds) }}
          </template>
        </el-table-column>
        <el-table-column label="买入额" width="100" align="right">
          <template #default="{ row }">
            {{ toFixed(row.total_bet, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="盈亏" min-width="100" align="right">
          <template #default="{ row }">
            <span :class="row.total_profit >= 0 ? 'text-green' : 'text-red'">
              {{ fmtMoney(row.total_profit) }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <h4 class="vb-subtitle">
        赔率区间
      </h4>
      <el-table :data="bucketRows" stripe size="small" :show-header="true">
        <el-table-column prop="bucket" label="赔率区间" width="110" />
        <el-table-column label="笔数" width="60" align="right">
          <template #default="{ row }">
            {{ row.total_orders || "" }}
          </template>
        </el-table-column>
        <el-table-column label="分布" min-width="140">
          <template #default="{ row }">
            <div v-if="row.total_orders" class="dist-bar-bg">
              <div
                class="dist-bar-fill"
                :class="row.total_profit >= 0 ? 'bar-green' : 'bar-red'"
                :style="{ width: barWidth(row.total_orders) }"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="胜率" width="70" align="right">
          <template #default="{ row }">
            {{ row.total_orders ? winRate(row.wins, row.losses) : "" }}
          </template>
        </el-table-column>
        <el-table-column label="均赔" width="70" align="right">
          <template #default="{ row }">
            {{ row.total_orders ? fmtOdds(row.avg_odds) : "" }}
          </template>
        </el-table-column>
        <el-table-column label="买入额" width="100" align="right">
          <template #default="{ row }">
            {{ row.total_orders ? toFixed(row.total_bet, 0) : "" }}
          </template>
        </el-table-column>
        <el-table-column label="盈亏" min-width="90" align="right">
          <template #default="{ row }">
            <span
              v-if="row.total_orders"
              :class="row.total_profit >= 0 ? 'text-green' : 'text-red'"
            >
              {{ fmtMoney(row.total_profit) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </template>
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
.vb-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-bottom: 14px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
}
.vb-subtitle {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
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
.text-warn { color: #e6a23c; }
.analytics-empty {
  text-align: center;
  padding: 30px;
  color: var(--el-text-color-secondary);
}
</style>
