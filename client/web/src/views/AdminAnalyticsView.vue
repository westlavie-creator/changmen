<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { useUserStore } from "@/stores/userStore";
import {
  getAdminPlatformAnalytics,
  type PlatformAnalyticsRow,
  type ArbPairRow,
} from "@/api/admin";
import { todayKey } from "@/shared/dateKey";
import { toFixed } from "@/shared/format";

const router = useRouter();
const user = useUserStore();

const rangeMode = ref<"day" | "month" | "custom">("day");
const dateKey = ref(todayKey());
const monthKey = ref((() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})());

const loading = ref(false);
const platforms = ref<PlatformAnalyticsRow[]>([]);
const pairs = ref<ArbPairRow[]>([]);

const totalOrders = computed(() => platforms.value.reduce((s, p) => s + p.total_orders, 0));
const totalProfit = computed(() => platforms.value.reduce((s, p) => s + p.total_profit, 0));
const totalBet = computed(() => platforms.value.reduce((s, p) => s + p.total_bet, 0));

const maxBarProfit = computed(() => {
  const vals = platforms.value.map((p) => Math.abs(p.total_profit));
  return Math.max(...vals, 1);
});

function winRate(p: PlatformAnalyticsRow): string {
  const settled = p.wins + p.losses;
  return settled ? toFixed((p.wins / settled) * 100, 1) + "%" : "-";
}

function rejectRate(p: PlatformAnalyticsRow): string {
  return p.total_orders ? toFixed((p.rejects / p.total_orders) * 100, 1) + "%" : "-";
}

function pairSuccessRate(p: ArbPairRow): string {
  return p.pair_count ? toFixed((p.both_settled / p.pair_count) * 100, 1) + "%" : "-";
}

function profitBarWidth(val: number): string {
  return toFixed((Math.abs(val) / maxBarProfit.value) * 100, 0) + "%";
}

async function fetchData() {
  loading.value = true;
  try {
    const body: Record<string, unknown> =
      rangeMode.value === "month" ? { month: monthKey.value } : { date: dateKey.value };
    const data = await getAdminPlatformAnalytics(body);
    platforms.value = data.platforms;
    pairs.value = data.pairs;
  } catch {
    platforms.value = [];
    pairs.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/analytics");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.isAdmin) { await router.replace({ name: "home" }); return; }
  await fetchData();
});
</script>

<template>
  <AdminLayout title="数据分析" subtitle="平台盈亏与套利配对统计">
    <!-- Toolbar -->
    <div class="analytics-toolbar">
      <el-radio-group v-model="rangeMode" size="small" @change="fetchData">
        <el-radio-button value="day">按日</el-radio-button>
        <el-radio-button value="month">按月</el-radio-button>
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
      <el-button size="small" :loading="loading" @click="fetchData">刷新</el-button>
    </div>

    <!-- Summary cards -->
    <div class="analytics-summary">
      <div class="summary-card">
        <div class="summary-label">总订单</div>
        <div class="summary-value">{{ totalOrders }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">总投注额</div>
        <div class="summary-value">{{ toFixed(totalBet, 0) }}</div>
      </div>
      <div class="summary-card" :class="totalProfit >= 0 ? 'summary-card--green' : 'summary-card--red'">
        <div class="summary-label">总盈亏</div>
        <div class="summary-value">{{ totalProfit >= 0 ? "+" : "" }}{{ toFixed(totalProfit, 0) }}</div>
      </div>
    </div>

    <!-- Platform table -->
    <div class="analytics-section">
      <h3 class="analytics-section__title">平台盈亏</h3>
      <el-table :data="platforms" stripe size="small" :show-header="true">
        <el-table-column prop="provider" label="平台" width="90" />
        <el-table-column prop="total_orders" label="订单数" width="80" align="right" />
        <el-table-column label="胜率" width="80" align="right">
          <template #default="{ row }">{{ winRate(row) }}</template>
        </el-table-column>
        <el-table-column label="拒单率" width="80" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-warn': row.rejects > 0 }">{{ rejectRate(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="投注额" width="120" align="right">
          <template #default="{ row }">{{ toFixed(row.total_bet, 0) }}</template>
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
      <h3 class="analytics-section__title">套利配对</h3>
      <el-table v-if="pairs.length" :data="pairs" stripe size="small">
        <el-table-column label="平台组合" width="150">
          <template #default="{ row }">{{ row.provider_a }} + {{ row.provider_b }}</template>
        </el-table-column>
        <el-table-column prop="pair_count" label="配对数" width="80" align="right" />
        <el-table-column label="成功率" width="80" align="right">
          <template #default="{ row }">{{ pairSuccessRate(row) }}</template>
        </el-table-column>
        <el-table-column label="含拒单" width="80" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-warn': row.has_reject > 0 }">{{ row.has_reject }}</span>
          </template>
        </el-table-column>
        <el-table-column label="总投注额" width="120" align="right">
          <template #default="{ row }">{{ toFixed(row.total_bet, 0) }}</template>
        </el-table-column>
        <el-table-column label="净利润" min-width="160">
          <template #default="{ row }">
            <span :class="row.net_profit >= 0 ? 'text-green' : 'text-red'">
              {{ row.net_profit >= 0 ? "+" : "" }}{{ toFixed(row.net_profit, 0) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="analytics-empty">暂无套利配对数据</div>
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
.analytics-empty { text-align: center; padding: 30px; color: var(--el-text-color-secondary); }
</style>
