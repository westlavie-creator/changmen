<script setup lang="ts">
import type { AccountAnalyticsRow, ArbPairRow, GameAnalyticsRow, HourlyAnalyticsRow, ObArbOddsAnalyticsPayload, PlatformAnalyticsRow } from "@/api/admin";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {

  getAdminPlatformAnalytics,

} from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminObArbOddsSection from "@/components/admin/AdminObArbOddsSection.vue";
import { todayKey } from "@/shared/dateKey";
import { toFixed } from "@changmen/client-core/shared/format";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

const rangeMode = ref<"day" | "month" | "all">("day");
const dateKey = ref(todayKey());
const monthKey = ref((() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})());

const loading = ref(false);
const platforms = ref<PlatformAnalyticsRow[]>([]);
const pairs = ref<ArbPairRow[]>([]);
const games = ref<GameAnalyticsRow[]>([]);
const hourly = ref<HourlyAnalyticsRow[]>([]);
const accounts = ref<AccountAnalyticsRow[]>([]);
const obArbOdds = ref<ObArbOddsAnalyticsPayload | null>(null);

const totalOrders = computed(() => platforms.value.reduce((s, p) => s + p.total_orders, 0));
const totalProfit = computed(() => platforms.value.reduce((s, p) => s + p.total_profit, 0));
const totalBet = computed(() => platforms.value.reduce((s, p) => s + p.total_bet, 0));

const maxBarProfit = computed(() => {
  const vals = platforms.value.map(p => Math.abs(p.total_profit));
  return Math.max(...vals, 1);
});

function winRateGeneric(wins: number, losses: number): string {
  const settled = wins + losses;
  return settled ? `${toFixed((wins / settled) * 100, 1)}%` : "-";
}

const maxHourlyOrders = computed(() => Math.max(...hourly.value.map(h => h.total_orders), 1));

const fullHourly = computed(() => {
  const byHour = new Map(hourly.value.map(h => [h.hour, h]));
  return Array.from({ length: 24 }, (_, i) => byHour.get(i) ?? { hour: i, total_orders: 0, wins: 0, losses: 0, total_profit: 0, total_bet: 0 });
});

function hourlyBarHeight(count: number): string {
  return `${toFixed((count / maxHourlyOrders.value) * 100, 0)}%`;
}

function winRate(p: PlatformAnalyticsRow): string {
  const settled = p.wins + p.losses;
  return settled ? `${toFixed((p.wins / settled) * 100, 1)}%` : "-";
}

function rejectRate(p: PlatformAnalyticsRow): string {
  return p.total_orders ? `${toFixed((p.rejects / p.total_orders) * 100, 1)}%` : "-";
}

function pairSuccessRate(p: ArbPairRow): string {
  return p.pair_count ? `${toFixed((p.both_settled / p.pair_count) * 100, 1)}%` : "-";
}

function profitBarWidth(val: number): string {
  return `${toFixed((Math.abs(val) / maxBarProfit.value) * 100, 0)}%`;
}

async function fetchData() {
  loading.value = true;
  try {
    const body: Record<string, unknown>
      = rangeMode.value === "all"
        ? { all: true }
        : rangeMode.value === "month"
          ? { month: monthKey.value }
          : { date: dateKey.value };
    const data = await getAdminPlatformAnalytics(body);
    platforms.value = data.platforms;
    pairs.value = data.pairs;
    games.value = data.games ?? [];
    hourly.value = data.hourly ?? [];
    accounts.value = data.accounts ?? [];
    obArbOdds.value = data.obArbOdds ?? { buckets: [], summary: [] };
  }
  catch {
    platforms.value = [];
    pairs.value = [];
    games.value = [];
    hourly.value = [];
    accounts.value = [];
    obArbOdds.value = { buckets: [], summary: [] };
  }
  finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/analytics");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.canAccessAdmin) { await router.replace({ name: "home" }); return; }
  await fetchData();
});
</script>

<template>
  <AdminLayout title="数据分析" subtitle="平台盈亏与套利配对统计">
    <!-- Toolbar -->
    <div class="analytics-toolbar">
      <el-radio-group v-model="rangeMode" size="small" @change="fetchData">
        <el-radio-button value="day">
          按日
        </el-radio-button>
        <el-radio-button value="month">
          按月
        </el-radio-button>
        <el-radio-button value="all">
          全部
        </el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="rangeMode === 'day'"
        v-model="dateKey"
        type="date"
        value-format="YYYY-MM-DD"
        size="small"
        style="width: 150px"
        @change="fetchData"
      />
      <el-date-picker
        v-if="rangeMode === 'month'"
        v-model="monthKey"
        type="month"
        value-format="YYYY-MM"
        size="small"
        style="width: 150px"
        @change="fetchData"
      />
      <el-button size="small" :loading="loading" @click="fetchData">
        刷新
      </el-button>
    </div>

    <!-- Summary cards -->
    <div class="analytics-summary">
      <div class="summary-card">
        <div class="summary-label">
          总订单
        </div>
        <div class="summary-value">
          {{ totalOrders }}
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-label">
          总投注额
        </div>
        <div class="summary-value">
          {{ toFixed(totalBet, 0) }}
        </div>
      </div>
      <div class="summary-card" :class="totalProfit >= 0 ? 'summary-card--green' : 'summary-card--red'">
        <div class="summary-label">
          总盈亏
        </div>
        <div class="summary-value">
          {{ totalProfit >= 0 ? "+" : "" }}{{ toFixed(totalProfit, 0) }}
        </div>
      </div>
    </div>

    <!-- Platform table -->
    <div class="analytics-section">
      <h3 class="analytics-section__title">
        平台盈亏
      </h3>
      <el-table :data="platforms" stripe size="small" :show-header="true">
        <el-table-column prop="provider" label="平台" width="90" />
        <el-table-column prop="total_orders" label="订单数" width="80" align="right" />
        <el-table-column label="胜率" width="80" align="right">
          <template #default="{ row }">
            {{ winRate(row) }}
          </template>
        </el-table-column>
        <el-table-column label="拒单率" width="80" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-warn': row.rejects > 0 }">{{ rejectRate(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="投注额" width="120" align="right">
          <template #default="{ row }">
            {{ toFixed(row.total_bet, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="盈亏" min-width="200">
          <template #default="{ row }">
            <div class="profit-cell">
              <span class="profit-num" :class="row.total_profit >= 0 ? 'text-green' : 'text-red'">
                {{ row.total_profit >= 0 ? "+" : "" }}{{ toFixed(row.total_profit, 0) }}
              </span>
              <div class="profit-bar-bg">
                <div
                  class="profit-bar-fill"
                  :class="row.total_profit >= 0 ? 'bar-green' : 'bar-red'"
                  :style="{ width: profitBarWidth(row.total_profit) }"
                />
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Win" width="60" align="right" prop="wins" />
        <el-table-column label="Lose" width="60" align="right" prop="losses" />
        <el-table-column label="Reject" width="60" align="right" prop="rejects" />
        <el-table-column label="Pending" width="70" align="right" prop="pending" />
      </el-table>
    </div>

    <!-- Arb pairs table -->
    <div class="analytics-section">
      <h3 class="analytics-section__title">
        套利配对
      </h3>
      <el-table v-if="pairs.length" :data="pairs" stripe size="small">
        <el-table-column label="平台组合" width="140" fixed>
          <template #default="{ row }">
            {{ row.provider_a }} + {{ row.provider_b }}
          </template>
        </el-table-column>
        <el-table-column prop="pair_count" label="配对数" width="70" align="right" />
        <el-table-column label="成功率" width="70" align="right">
          <template #default="{ row }">
            {{ pairSuccessRate(row) }}
          </template>
        </el-table-column>
        <el-table-column label="场馆拒单" min-width="180">
          <template #default="{ row }">
            <div class="venue-cmp">
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_a }}</span>
                <span :class="{ 'text-warn': (row.rejects_a ?? 0) > 0 }">{{ row.rejects_a ?? 0 }}</span>
              </div>
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_b }}</span>
                <span :class="{ 'text-warn': (row.rejects_b ?? 0) > 0 }">{{ row.rejects_b ?? 0 }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="场馆胜负对比" min-width="220">
          <template #default="{ row }">
            <div class="venue-cmp">
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_a }}</span>
                <span><span class="text-green">{{ row.wins_a ?? 0 }}胜</span> / <span class="text-red">{{ row.losses_a ?? 0 }}负</span></span>
              </div>
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_b }}</span>
                <span><span class="text-green">{{ row.wins_b ?? 0 }}胜</span> / <span class="text-red">{{ row.losses_b ?? 0 }}负</span></span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="场馆盈亏对比" min-width="200">
          <template #default="{ row }">
            <div class="venue-cmp">
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_a }}</span>
                <span :class="(row.profit_a ?? 0) >= 0 ? 'text-green' : 'text-red'">
                  {{ (row.profit_a ?? 0) >= 0 ? "+" : "" }}{{ toFixed(row.profit_a ?? 0, 0) }}
                </span>
              </div>
              <div class="venue-cmp__row">
                <span class="venue-cmp__name">{{ row.provider_b }}</span>
                <span :class="(row.profit_b ?? 0) >= 0 ? 'text-green' : 'text-red'">
                  {{ (row.profit_b ?? 0) >= 0 ? "+" : "" }}{{ toFixed(row.profit_b ?? 0, 0) }}
                </span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总投注额" width="100" align="right">
          <template #default="{ row }">
            {{ toFixed(row.total_bet, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="净利润" min-width="100">
          <template #default="{ row }">
            <span :class="row.net_profit >= 0 ? 'text-green' : 'text-red'">
              {{ row.net_profit >= 0 ? "+" : "" }}{{ toFixed(row.net_profit, 0) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="analytics-empty">
        暂无套利配对数据
      </div>
    </div>

    <AdminObArbOddsSection :data="obArbOdds" />

    <!-- Game dimension -->
    <div v-if="games.length" class="analytics-section">
      <h3 class="analytics-section__title">
        游戏维度
      </h3>
      <el-table :data="games" stripe size="small">
        <el-table-column prop="game" label="游戏" width="120" />
        <el-table-column prop="total_orders" label="订单数" width="80" align="right" />
        <el-table-column label="胜率" width="80" align="right">
          <template #default="{ row }">
            {{ winRateGeneric(row.wins, row.losses) }}
          </template>
        </el-table-column>
        <el-table-column label="投注额" width="120" align="right">
          <template #default="{ row }">
            {{ toFixed(row.total_bet, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="盈亏" min-width="160">
          <template #default="{ row }">
            <span :class="row.total_profit >= 0 ? 'text-green' : 'text-red'">
              {{ row.total_profit >= 0 ? "+" : "" }}{{ toFixed(row.total_profit, 0) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Hourly dimension -->
    <div v-if="hourly.length" class="analytics-section">
      <h3 class="analytics-section__title">
        时段分布
      </h3>
      <div class="hourly-chart">
        <div
          v-for="h in fullHourly"
          :key="h.hour"
          class="hourly-bar-group"
          :title="`${h.hour}:00 — 订单 ${h.total_orders} / 盈亏 ${toFixed(h.total_profit, 0)}`"
        >
          <div class="hourly-bar-wrapper">
            <div
              class="hourly-bar"
              :class="h.total_profit >= 0 ? 'bar-green' : 'bar-red'"
              :style="{ height: hourlyBarHeight(h.total_orders) }"
            />
          </div>
          <div class="hourly-label">
            {{ h.hour }}
          </div>
          <div class="hourly-count">
            {{ h.total_orders || "" }}
          </div>
        </div>
      </div>
    </div>

    <!-- Account dimension -->
    <div v-if="accounts.length" class="analytics-section">
      <h3 class="analytics-section__title">
        账号维度
      </h3>
      <el-table :data="accounts" stripe size="small" max-height="400">
        <el-table-column prop="player_id" label="账号 ID" width="100" />
        <el-table-column prop="provider" label="平台" width="80" />
        <el-table-column prop="total_orders" label="订单数" width="80" align="right" />
        <el-table-column label="胜率" width="80" align="right">
          <template #default="{ row }">
            {{ winRateGeneric(row.wins, row.losses) }}
          </template>
        </el-table-column>
        <el-table-column label="拒单" width="60" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-warn': row.rejects > 0 }">{{ row.rejects }}</span>
          </template>
        </el-table-column>
        <el-table-column label="投注额" width="120" align="right">
          <template #default="{ row }">
            {{ toFixed(row.total_bet, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="盈亏" min-width="140">
          <template #default="{ row }">
            <span :class="row.total_profit >= 0 ? 'text-green' : 'text-red'">
              {{ row.total_profit >= 0 ? "+" : "" }}{{ toFixed(row.total_profit, 0) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </AdminLayout>
</template>

<style scoped>
.analytics-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.analytics-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.summary-card {
  flex: 1;
  min-width: 140px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.summary-label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.summary-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.summary-card--green .summary-value { color: #67c23a; }
.summary-card--red .summary-value { color: #f56c6c; }
.analytics-section { margin-bottom: 24px; }
.analytics-section__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}
.profit-cell { display: flex; align-items: center; gap: 8px; }
.profit-num { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 70px; }
.profit-bar-bg { flex: 1; height: 6px; background: var(--el-fill-color-light); border-radius: 3px; overflow: hidden; }
.profit-bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }
.bar-green { background: #67c23a; }
.bar-red { background: #f56c6c; }
.text-green { color: #67c23a; }
.text-red { color: #f56c6c; }
.text-warn { color: #e6a23c; }
.venue-cmp {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}
.venue-cmp__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.venue-cmp__name {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  min-width: 48px;
}
.analytics-empty { text-align: center; padding: 30px; color: var(--el-text-color-secondary); }
.hourly-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 140px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.hourly-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.hourly-bar-wrapper { width: 100%; height: 100px; display: flex; align-items: flex-end; justify-content: center; }
.hourly-bar { width: 80%; max-width: 24px; border-radius: 2px 2px 0 0; transition: height .4s; min-height: 1px; }
.hourly-label { font-size: 10px; color: var(--el-text-color-secondary); margin-top: 4px; }
.hourly-count { font-size: 10px; color: var(--el-text-color-regular); font-variant-numeric: tabular-nums; }
</style>
