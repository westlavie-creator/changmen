<script setup lang="ts">
import type {
  PolymarketBuilderDashboardPayload,
  PolymarketBuilderTradeRow,
  PolymarketChangmenOrderRow,
} from "@/api/admin";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { getAdminPolymarketBuilder } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { todayKey } from "@/shared/dateKey";
import { toFixed } from "@/shared/format";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

const rangeMode = ref<"day" | "days7" | "month">("day");
const dateKey = ref(todayKey());
const monthKey = ref((() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})());

const loading = ref(false);
const error = ref("");
const data = ref<PolymarketBuilderDashboardPayload | null>(null);

const polySummary = computed(() => data.value?.polymarket.summary);
const cmSummary = computed(() => data.value?.changmen.summary);
const polyTrades = computed(() => data.value?.polymarket.trades ?? []);
const cmOrders = computed(() => data.value?.changmen.orders ?? []);

function fmtUsdc(n: number | undefined): string {
  return n == null ? "-" : toFixed(n, 2);
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms)
    return "-";
  return new Date(ms).toLocaleString();
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12)
    return addr || "-";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 14)
    return hash || "-";
  return `${hash.slice(0, 10)}…`;
}

function polygonscanTx(hash: string): string {
  return hash ? `https://polygonscan.com/tx/${hash}` : "#";
}

async function fetchData() {
  loading.value = true;
  error.value = "";
  try {
    const body: Record<string, unknown> = rangeMode.value === "month"
      ? { month: monthKey.value, maxPages: 10 }
      : rangeMode.value === "days7"
        ? {
            startMs: Date.now() - 7 * 86400000,
            endMs: Date.now(),
            maxPages: 10,
          }
        : { date: dateKey.value, maxPages: 5 };
    data.value = await getAdminPolymarketBuilder(body);
  }
  catch (err) {
    data.value = null;
    error.value = err instanceof Error ? err.message : "加载失败";
  }
  finally {
    loading.value = false;
  }
}

watch([rangeMode, dateKey, monthKey], () => {
  void fetchData();
});

onMounted(async () => {
  if (!user.ready) {
    try {
      await user.fetchUserInfo();
    }
    catch {
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  void fetchData();
});
</script>

<template>
  <AdminLayout
    title="Polymarket Builder"
    subtitle="Polymarket 归因成交与 changmen 用户 Polymarket 订单对照"
  >
    <template #toolbar>
      <el-radio-group v-model="rangeMode" size="small">
        <el-radio-button value="day">
          按日
        </el-radio-button>
        <el-radio-button value="days7">
          近 7 天
        </el-radio-button>
        <el-radio-button value="month">
          按月
        </el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="rangeMode === 'day'"
        v-model="dateKey"
        type="date"
        value-format="YYYY-MM-DD"
        size="small"
        style="width: 150px"
      />
      <el-date-picker
        v-else-if="rangeMode === 'month'"
        v-model="monthKey"
        type="month"
        value-format="YYYY-MM"
        size="small"
        style="width: 130px"
      />
      <el-button size="small" :loading="loading" @click="fetchData">
        刷新
      </el-button>
    </template>

    <div v-loading="loading" class="poly-builder-page">
      <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />

      <section v-if="data" class="admin-card poly-builder-meta">
        <div class="meta-row">
          <span>Builder Code</span>
          <code>{{ data.builderCode }}</code>
        </div>
        <div class="meta-row">
          <span>Relayer</span>
          <span>{{ data.relayerConfigured ? `已配置 (${data.relayerAuthMode})` : "未配置" }}</span>
        </div>
        <div v-if="data.polymarket.hasMore" class="meta-hint">
          Polymarket 成交可能未拉全，可缩小日期范围或联系开发增大 maxPages。
        </div>
      </section>

      <section v-if="polySummary && cmSummary" class="summary-grid">
        <article class="admin-card summary-card">
          <h3>Polymarket 归因成交</h3>
          <p class="summary-num">
            {{ polySummary.tradeCount }}
          </p>
          <p>成交笔数</p>
          <ul>
            <li>成交量 {{ fmtUsdc(polySummary.volumeUsdc) }} USDC</li>
            <li>feeUsdc {{ fmtUsdc(polySummary.feeUsdc) }} USDC</li>
            <li>builderFee {{ fmtUsdc(polySummary.builderFeeUsdc) }} USDC</li>
            <li>BUY / SELL：{{ polySummary.buyCount }} / {{ polySummary.sellCount }}</li>
          </ul>
        </article>
        <article class="admin-card summary-card">
          <h3>changmen Polymarket 订单</h3>
          <p class="summary-num">
            {{ cmSummary.orderCount }}
          </p>
          <p>订单数</p>
          <ul>
            <li>下注 {{ fmtUsdc(cmSummary.totalBet) }}  盈亏 {{ fmtUsdc(cmSummary.totalProfit) }}</li>
            <li>Win / Lose / Reject / Pending：{{ cmSummary.wins }} / {{ cmSummary.losses }} / {{ cmSummary.rejects }} / {{ cmSummary.pending }}</li>
          </ul>
        </article>
      </section>

      <section class="admin-card table-section">
        <h3>Polymarket 归因成交（CLOB builder/trades）</h3>
        <el-table :data="polyTrades" size="small" stripe empty-text="该时段无 Builder 归因成交">
          <el-table-column label="时间" width="170">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtTime(row.matchTime) }}
            </template>
          </el-table-column>
          <el-table-column prop="side" label="方向" width="70" />
          <el-table-column label="金额 USDC" width="100">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtUsdc(row.sizeUsdc) }}
            </template>
          </el-table-column>
          <el-table-column label="feeUsdc" width="100">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtUsdc(row.feeUsdc) }}
            </template>
          </el-table-column>
          <el-table-column label="builderFee" width="110">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtUsdc(row.builderFeeUsdc) }}
            </template>
          </el-table-column>
          <el-table-column label="价格" width="80">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ toFixed(row.price, 4) }}
            </template>
          </el-table-column>
          <el-table-column prop="outcome" label="Outcome" width="90" />
          <el-table-column label="Maker" min-width="120">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              <span :title="row.maker">{{ shortAddr(row.maker) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Tx" width="110">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              <a
                v-if="row.transactionHash"
                :href="polygonscanTx(row.transactionHash)"
                target="_blank"
                rel="noopener"
              >{{ shortHash(row.transactionHash) }}</a>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="admin-card table-section">
        <h3>changmen Polymarket 订单</h3>
        <el-table :data="cmOrders" size="small" stripe empty-text="该时段无 changmen Polymarket 订单">
          <el-table-column label="时间" width="170">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtTime(row.createAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="userName" label="用户" width="100" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="下注" width="90">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtUsdc(row.betMoney) }}
            </template>
          </el-table-column>
          <el-table-column label="盈亏" width="90">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtUsdc(row.profit) }}
            </template>
          </el-table-column>
          <el-table-column prop="matchTitle" label="比赛" min-width="160" show-overflow-tooltip />
          <el-table-column prop="message" label="消息" min-width="180" show-overflow-tooltip />
        </el-table>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.poly-builder-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.poly-builder-meta {
  padding: 12px 16px;
}

.meta-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 13px;
}

.meta-row code {
  font-size: 11px;
  word-break: break-all;
}

.meta-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.summary-card {
  padding: 16px;
}

.summary-card h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.summary-num {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

.summary-card ul {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
}

.table-section {
  padding: 16px;
}

.table-section h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
</style>
