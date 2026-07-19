<script setup lang="ts">
import type {
  PolymarketBuilderDashboardPayload,
  PolymarketBuilderTradeRow,
  PolymarketChangmenOrderRow,
} from "@/api/admin";
import type { OrderRow } from "@/types/order";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { getAdminPolymarketBuilder } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminPmOrderAnalyticsSection from "@/components/admin/AdminPmOrderAnalyticsSection.vue";
import { todayKey } from "@/shared/dateKey";
import { pmOrderStakeDisplayCny } from "@/shared/pmOrderDisplay";
import { toFixed } from "@changmen/client-core/shared/format";
import { useUserStore } from "@/stores/userStore";

const PAGE_SIZE = 20;
const UNKNOWN_USER = "__unknown__";

const router = useRouter();
const user = useUserStore();

const rangeMode = ref<"day" | "month" | "all">("day");
const dateKey = ref(todayKey());
const monthKey = ref((() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})());

const loading = ref(false);
const error = ref("");
const data = ref<PolymarketBuilderDashboardPayload | null>(null);

const polyPage = ref(1);
const cmPage = ref(1);
/** "" = 全部用户 */
const polyUserFilter = ref("");

const polySummary = computed(() => data.value?.polymarket.summary);
const cmSummary = computed(() => data.value?.changmen.summary);
const cmAnalytics = computed(() => data.value?.changmen.analytics ?? null);
const polyTrades = computed(() => data.value?.polymarket.trades ?? []);
const cmOrders = computed(() => data.value?.changmen.orders ?? []);

const polyUserOptions = computed(() => {
  const names = new Set<string>();
  let hasUnknown = false;
  for (const t of polyTrades.value) {
    const name = String(t.makerUserName || "").trim();
    if (name)
      names.add(name);
    else
      hasUnknown = true;
  }
  const opts = [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (hasUnknown)
    opts.push(UNKNOWN_USER);
  return opts;
});

const filteredPolyTrades = computed(() => {
  const filter = polyUserFilter.value;
  if (!filter)
    return polyTrades.value;
  if (filter === UNKNOWN_USER)
    return polyTrades.value.filter(t => !String(t.makerUserName || "").trim());
  return polyTrades.value.filter(t => String(t.makerUserName || "").trim() === filter);
});

function summarizePolyTrades(trades: PolymarketBuilderTradeRow[]) {
  let volumeUsdc = 0;
  let feeUsdc = 0;
  let builderFeeUsdc = 0;
  let buyCount = 0;
  let sellCount = 0;
  let buyVolumeUsdc = 0;
  let sellVolumeUsdc = 0;
  for (const t of trades) {
    const size = Number(t.sizeUsdc) || 0;
    volumeUsdc += size;
    feeUsdc += Number(t.feeUsdc) || 0;
    builderFeeUsdc += Number(t.builderFeeUsdc) || 0;
    if (t.side === "BUY") {
      buyCount += 1;
      buyVolumeUsdc += size;
    }
    else if (t.side === "SELL") {
      sellCount += 1;
      sellVolumeUsdc += size;
    }
  }
  return {
    tradeCount: trades.length,
    volumeUsdc,
    feeUsdc,
    builderFeeUsdc,
    buyCount,
    sellCount,
    buyVolumeUsdc,
    sellVolumeUsdc,
  };
}

/** 卡片 / 表格上方：随用户筛选变化 */
const polyViewSummary = computed(() => summarizePolyTrades(filteredPolyTrades.value));

const polyTradesPage = computed(() => {
  const start = (polyPage.value - 1) * PAGE_SIZE;
  return filteredPolyTrades.value.slice(start, start + PAGE_SIZE);
});

const cmOrdersPage = computed(() => {
  const start = (cmPage.value - 1) * PAGE_SIZE;
  return cmOrders.value.slice(start, start + PAGE_SIZE);
});

function fmtUsdc(n: number | null | undefined): string {
  return n == null ? "-" : toFixed(n, 2);
}

function fmtOdds(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0)
    return "-";
  return toFixed(n, 4);
}

function fmtPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0)
    return "-";
  return toFixed(n, 4);
}

function isCmSellOrder(row: PolymarketChangmenOrderRow): boolean {
  return String(row.pmSide || "").trim().toLowerCase() === "sell";
}

/** 与控制台 OrderList 同源：已平仓买单用 fill×价还原原始本金，不直接读库内剩余 bet_money */
function cmOrderToOrderRow(row: PolymarketChangmenOrderRow): OrderRow {
  return {
    OrderID: row.orderId,
    Type: "Polymarket",
    Match: row.matchTitle,
    Bet: row.betTitle,
    Item: row.item,
    Odds: row.odds,
    BetMoney: row.betMoney,
    Money: row.profit,
    Status: (row.status || "None") as OrderRow["Status"],
    CreateAt: row.createAt,
    PlayerID: row.playerId,
    PmShares: row.pmShares || undefined,
    PmFillPrice: row.price || undefined,
    PmStakeUsdc: row.pmStakeUsdc || undefined,
    PmSellState: row.pmSellState || undefined,
    PmAttributedSellShares: row.pmAttributedSellShares || undefined,
    PmSide: row.pmSide === "sell" ? "sell" : "buy",
  };
}

/** 卖单无「下注」；买单展示原始本金 CNY */
function cmDisplayBetMoney(row: PolymarketChangmenOrderRow): number | null {
  if (isCmSellOrder(row))
    return null;
  return pmOrderStakeDisplayCny(cmOrderToOrderRow(row));
}

/** 卖单盈亏已记在买单，此处不展示 */
function cmDisplayProfit(row: PolymarketChangmenOrderRow): number | null {
  if (isCmSellOrder(row))
    return null;
  return Number(row.profit) || 0;
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

function polyUserLabel(value: string): string {
  return value === UNKNOWN_USER ? "(未匹配用户)" : value;
}

async function fetchData() {
  loading.value = true;
  error.value = "";
  try {
    const body: Record<string, unknown> = rangeMode.value === "all"
      ? { all: true, maxPages: 20, orderLimit: 500 }
      : rangeMode.value === "month"
        ? { month: monthKey.value, maxPages: 10, orderLimit: 500 }
        : { date: dateKey.value, maxPages: 5, orderLimit: 500 };
    data.value = await getAdminPolymarketBuilder(body);
    polyPage.value = 1;
    cmPage.value = 1;
    polyUserFilter.value = "";
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

watch(polyUserFilter, () => {
  polyPage.value = 1;
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
          日
        </el-radio-button>
        <el-radio-button value="month">
          月
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
      />
      <el-date-picker
        v-else-if="rangeMode === 'month'"
        v-model="monthKey"
        type="month"
        value-format="YYYY-MM"
        size="small"
        style="width: 130px"
      />
      <span v-else class="range-all-hint">
        全时段（订单分析走 RDS 全量）
      </span>
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
          <h3>Polymarket 归因成交{{ polyUserFilter ? ` · ${polyUserLabel(polyUserFilter)}` : "" }}</h3>
          <p class="summary-num">
            {{ polyViewSummary.tradeCount }}
          </p>
          <p>成交笔数</p>
          <ul>
            <li>成交量 {{ fmtUsdc(polyViewSummary.volumeUsdc) }} USDC</li>
            <li>feeUsdc {{ fmtUsdc(polyViewSummary.feeUsdc) }} USDC</li>
            <li>builderFee {{ fmtUsdc(polyViewSummary.builderFeeUsdc) }} USDC</li>
            <li>
              BUY {{ polyViewSummary.buyCount }} 笔 / {{ fmtUsdc(polyViewSummary.buyVolumeUsdc) }} USDC
            </li>
            <li>
              SELL {{ polyViewSummary.sellCount }} 笔 / {{ fmtUsdc(polyViewSummary.sellVolumeUsdc) }} USDC
            </li>
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
        <div class="table-section-head">
          <h3>Polymarket 归因成交（CLOB builder/trades）</h3>
          <el-select
            v-model="polyUserFilter"
            clearable
            filterable
            placeholder="全部用户"
            size="small"
            style="width: 180px"
          >
            <el-option label="全部用户" value="" />
            <el-option
              v-for="name in polyUserOptions"
              :key="name"
              :label="polyUserLabel(name)"
              :value="name"
            />
          </el-select>
        </div>
        <p class="table-filter-summary">
          {{ polyUserFilter ? polyUserLabel(polyUserFilter) : "全部用户" }}
          · {{ polyViewSummary.tradeCount }} 笔
          · 成交量 {{ fmtUsdc(polyViewSummary.volumeUsdc) }} USDC
          · BUY {{ polyViewSummary.buyCount }}/{{ fmtUsdc(polyViewSummary.buyVolumeUsdc) }}
          · SELL {{ polyViewSummary.sellCount }}/{{ fmtUsdc(polyViewSummary.sellVolumeUsdc) }}
          · fee {{ fmtUsdc(polyViewSummary.feeUsdc) }}
          · builderFee {{ fmtUsdc(polyViewSummary.builderFeeUsdc) }}
        </p>
        <el-table :data="polyTradesPage" size="small" stripe empty-text="该时段无 Builder 归因成交">
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
          <el-table-column prop="outcome" label="Outcome" min-width="180" show-overflow-tooltip />
          <el-table-column prop="makerUserName" label="用户" width="90" />
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
        <div v-if="filteredPolyTrades.length > PAGE_SIZE" class="table-pager">
          <el-pagination
            v-model:current-page="polyPage"
            background
            layout="total, prev, pager, next"
            :total="filteredPolyTrades.length"
            :page-size="PAGE_SIZE"
          />
        </div>
      </section>

      <section class="admin-card table-section">
        <h3>changmen Polymarket 订单</h3>
        <el-table :data="cmOrdersPage" size="small" stripe empty-text="该时段无 changmen Polymarket 订单">
          <el-table-column label="时间" width="170">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtTime(row.createAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="userName" label="用户" width="90" />
          <el-table-column prop="pmSide" label="方向" width="70">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ row.pmSide ? row.pmSide.toUpperCase() : "-" }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="下注" width="90">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtUsdc(cmDisplayBetMoney(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="盈亏" width="90">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtUsdc(cmDisplayProfit(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="赔率" width="80">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtOdds(row.odds) }}
            </template>
          </el-table-column>
          <el-table-column label="价格" width="80">
            <template #default="{ row }: { row: PolymarketChangmenOrderRow }">
              {{ fmtPrice(row.price) }}
            </template>
          </el-table-column>
          <el-table-column prop="game" label="类型" width="90" show-overflow-tooltip />
          <el-table-column prop="matchTitle" label="比赛" min-width="180" show-overflow-tooltip />
          <el-table-column prop="betTitle" label="玩法" width="90" show-overflow-tooltip />
          <el-table-column prop="item" label="选项" min-width="120" show-overflow-tooltip />
        </el-table>
        <div v-if="cmOrders.length > PAGE_SIZE" class="table-pager">
          <el-pagination
            v-model:current-page="cmPage"
            background
            layout="total, prev, pager, next"
            :total="cmOrders.length"
            :page-size="PAGE_SIZE"
          />
        </div>
      </section>

      <AdminPmOrderAnalyticsSection :data="cmAnalytics" />
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

.range-all-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
  margin: 0;
  font-size: 14px;
}

.table-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.table-filter-summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.table-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
