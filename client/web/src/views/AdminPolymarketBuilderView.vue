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
import {
  cmBuilderSideLabel,
  groupChangmenPmOrdersForDisplay,
  type CmBuilderDisplayEntry,
} from "@/shared/adminPmBuilderOrders";
import { todayKey, todayUtcKey, utcWeekBounds } from "@/shared/dateKey";
import {
  pmCnyToUsdc,
  pmOrderProfitDisplayUsdc,
  pmOrderStakeDisplayUsdc,
  resolvePmOrderListStatusClass,
} from "@/shared/pmOrderDisplay";
import { toFixed } from "@changmen/client-core/shared/format";
import { useUserStore } from "@/stores/userStore";

const PAGE_SIZE = 20;
const UNKNOWN_USER = "__unknown__";

const router = useRouter();
const user = useUserStore();

/** day/month/all = 本地；utcDay/utcWeek = 对齐 Polymarket 官网 */
const rangeMode = ref<"day" | "utcDay" | "utcWeek" | "month" | "all">("utcDay");
const dateKey = ref(todayKey());
const utcDateKey = ref(todayUtcKey());
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

const utcWeekLabel = computed(() => {
  const { startKey, endKey } = utcWeekBounds(utcDateKey.value);
  return `${startKey} → ${endKey}（UTC 周日–周六）`;
});

const rangeWindowHint = computed(() => {
  const r = data.value?.range;
  if (!r?.startIso || !r?.endIso)
    return "";
  const startLocal = new Date(data.value!.startMs).toLocaleString();
  const endLocal = new Date(data.value!.endMs).toLocaleString();
  return `${r.startIso} → ${r.endIso}（本地约 ${startLocal} → ${endLocal}）`;
});

const polySummary = computed(() => data.value?.polymarket.summary);
const cmSummary = computed(() => data.value?.changmen.summary);
const cmAnalytics = computed(() => data.value?.changmen.analytics ?? null);
const polyTrades = computed(() => data.value?.polymarket.trades ?? []);
const cmOrders = computed(() => data.value?.changmen.orders ?? []);
const cmDisplayEntries = computed(() => groupChangmenPmOrdersForDisplay(cmOrders.value));

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
  return cmDisplayEntries.value.slice(start, start + PAGE_SIZE);
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
    PmBuyOrderId: row.pmBuyOrderId || undefined,
    PmLastSellOrderId: row.pmLastSellOrderId || undefined,
    PmSellProceeds: row.pmSellProceeds || undefined,
  };
}

/** 卖单无「下注」；买单展示原始本金 U */
function cmDisplayBetMoney(row: PolymarketChangmenOrderRow): number | null {
  if (isCmSellOrder(row))
    return null;
  return pmOrderStakeDisplayUsdc(cmOrderToOrderRow(row));
}

/** 卖单盈亏已记在买单，此处不展示；买单盈亏为 U */
function cmDisplayProfit(row: PolymarketChangmenOrderRow): number | null {
  if (isCmSellOrder(row))
    return null;
  return pmOrderProfitDisplayUsdc(cmOrderToOrderRow(row));
}

function cmEntryStatus(entry: CmBuilderDisplayEntry): string {
  return resolvePmOrderListStatusClass(cmOrderToOrderRow(entry.primary));
}

/** 卖单回款 U：优先买单累计 pmSellProceeds，否则卖单 BetMoney(CNY)→U */
function cmSellProceedsLabel(entry: CmBuilderDisplayEntry): string {
  if (entry.kind === "orphan-sell")
    return "-";
  const fromBuy = Number(entry.primary.pmSellProceeds) || 0;
  if (fromBuy > 0)
    return fmtUsdc(fromBuy);
  const fromSells = entry.sells.reduce(
    (s, r) => s + pmCnyToUsdc(Number(r.betMoney) || 0),
    0,
  );
  return fromSells > 0 ? fmtUsdc(fromSells) : (entry.sells.length ? "—" : "-");
}

function cmSellRowProceedsUsdc(sell: PolymarketChangmenOrderRow): number {
  return pmOrderStakeDisplayUsdc(cmOrderToOrderRow(sell));
}

function cmRowClassName({ row }: { row: CmBuilderDisplayEntry }): string {
  return row.sells.length > 0 ? "" : "cm-order-row--no-sells";
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms)
    return "-";
  // UTC 口径下用 ISO，方便直接对照官网 / CLOB matchTime
  if (rangeMode.value === "utcDay" || rangeMode.value === "utcWeek")
    return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
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
    // all 用字符串：post 走 x-www-form-urlencoded，boolean true 会变成 "true"
    let body: Record<string, unknown>;
    if (rangeMode.value === "all") {
      body = { period: "all", all: "1", maxPages: 20, orderLimit: 500 };
    }
    else if (rangeMode.value === "month") {
      body = { month: monthKey.value, maxPages: 10, orderLimit: 500 };
    }
    else if (rangeMode.value === "utcDay") {
      body = {
        period: "utcDay",
        date: utcDateKey.value || todayUtcKey(),
        maxPages: 5,
        orderLimit: 500,
      };
    }
    else if (rangeMode.value === "utcWeek") {
      body = {
        period: "utcWeek",
        date: utcDateKey.value || todayUtcKey(),
        maxPages: 10,
        orderLimit: 500,
      };
    }
    else {
      body = { date: dateKey.value || todayKey(), maxPages: 5, orderLimit: 500 };
    }
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

watch([rangeMode, dateKey, utcDateKey, monthKey], () => {
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
    subtitle="Polymarket 归因成交与 changmen 订单对照；UTC日/周对齐官网日榜与周奖励 epoch"
  >
    <template #toolbar>
      <el-radio-group v-model="rangeMode" size="small">
        <el-radio-button value="utcDay">
          UTC日
        </el-radio-button>
        <el-radio-button value="utcWeek">
          UTC周
        </el-radio-button>
        <el-radio-button value="day">
          本地日
        </el-radio-button>
        <el-radio-button value="month">
          本地月
        </el-radio-button>
        <el-radio-button value="all">
          全部
        </el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="rangeMode === 'utcDay' || rangeMode === 'utcWeek'"
        v-model="utcDateKey"
        type="date"
        value-format="YYYY-MM-DD"
        size="small"
        style="width: 150px"
        :clearable="false"
        :placeholder="rangeMode === 'utcWeek' ? '锚定日（UTC）' : 'UTC 日'"
      />
      <span v-if="rangeMode === 'utcWeek'" class="range-all-hint">
        {{ utcWeekLabel }}
      </span>
      <el-date-picker
        v-if="rangeMode === 'day'"
        v-model="dateKey"
        type="date"
        value-format="YYYY-MM-DD"
        size="small"
        style="width: 150px"
        :clearable="false"
      />
      <el-date-picker
        v-if="rangeMode === 'month'"
        v-model="monthKey"
        type="month"
        value-format="YYYY-MM"
        size="small"
        style="width: 130px"
        :clearable="false"
      />
      <span v-if="rangeMode === 'all'" class="range-all-hint">
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
        <div v-if="data.range" class="meta-row">
          <span>统计口径</span>
          <span>{{ data.range.label }}</span>
        </div>
        <div v-if="rangeWindowHint" class="meta-row meta-row-wrap">
          <span>时间窗口</span>
          <code>{{ rangeWindowHint }}</code>
        </div>
        <div v-if="data.range?.timezone === 'utc'" class="meta-hint meta-hint-info">
          与 Polymarket 官网一致：日榜按 UTC 自然日；周奖励 epoch 为周日 00:00 UTC → 周六 23:59 UTC。
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
            <li>成交量 {{ fmtUsdc(polyViewSummary.volumeUsdc) }} U</li>
            <li>feeUsdc {{ fmtUsdc(polyViewSummary.feeUsdc) }} U</li>
            <li>builderFee {{ fmtUsdc(polyViewSummary.builderFeeUsdc) }} U</li>
            <li>
              BUY {{ polyViewSummary.buyCount }} 笔 / {{ fmtUsdc(polyViewSummary.buyVolumeUsdc) }} U
            </li>
            <li>
              SELL {{ polyViewSummary.sellCount }} 笔 / {{ fmtUsdc(polyViewSummary.sellVolumeUsdc) }} U
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
            <li>下注 {{ fmtUsdc(pmCnyToUsdc(cmSummary.totalBet)) }} U · 盈亏 {{ fmtUsdc(pmCnyToUsdc(cmSummary.totalProfit)) }} U</li>
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
          · 成交量 {{ fmtUsdc(polyViewSummary.volumeUsdc) }} U
          · BUY {{ polyViewSummary.buyCount }}/{{ fmtUsdc(polyViewSummary.buyVolumeUsdc) }}
          · SELL {{ polyViewSummary.sellCount }}/{{ fmtUsdc(polyViewSummary.sellVolumeUsdc) }}
          · fee {{ fmtUsdc(polyViewSummary.feeUsdc) }}
          · builderFee {{ fmtUsdc(polyViewSummary.builderFeeUsdc) }}
        </p>
        <el-table :data="polyTradesPage" size="small" stripe empty-text="该时段无 Builder 归因成交">
          <el-table-column label="时间" :width="rangeMode === 'utcDay' || rangeMode === 'utcWeek' ? 190 : 170">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtTime(row.matchTime) }}
            </template>
          </el-table-column>
          <el-table-column prop="side" label="方向" width="70" />
          <el-table-column label="金额 U" width="100">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtUsdc(row.sizeUsdc) }}
            </template>
          </el-table-column>
          <el-table-column label="fee U" width="100">
            <template #default="{ row }: { row: PolymarketBuilderTradeRow }">
              {{ fmtUsdc(row.feeUsdc) }}
            </template>
          </el-table-column>
          <el-table-column label="builderFee U" width="110">
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
        <p class="table-filter-summary">
          买单主行合并卖单 · 展示 {{ cmDisplayEntries.length }} 组
          （原始 {{ cmOrders.length }} 行，含卖单附属）
        </p>
        <el-table
          :data="cmOrdersPage"
          size="small"
          stripe
          row-key="key"
          :row-class-name="cmRowClassName"
          empty-text="该时段无 changmen Polymarket 订单"
        >
          <el-table-column type="expand" width="36">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              <div v-if="row.sells.length" class="cm-sell-expand">
                <div
                  v-for="sell in row.sells"
                  :key="sell.orderId"
                  class="cm-sell-expand__row"
                >
                  <span>{{ fmtTime(sell.createAt) }}</span>
                  <span>SELL</span>
                  <span>回款 {{ fmtUsdc(cmSellRowProceedsUsdc(sell)) }} U</span>
                  <span>价 {{ fmtPrice(sell.price) }}</span>
                  <span class="cm-sell-expand__id" :title="sell.orderId">{{ shortHash(sell.orderId) }}</span>
                </div>
              </div>
              <div v-else class="cm-sell-expand cm-sell-expand--empty">
                无挂接卖单行
              </div>
            </template>
          </el-table-column>
          <el-table-column label="时间" :width="rangeMode === 'utcDay' || rangeMode === 'utcWeek' ? 190 : 170">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ fmtTime(row.primary.createAt) }}
            </template>
          </el-table-column>
          <el-table-column label="用户" width="90">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ row.primary.userName }}
            </template>
          </el-table-column>
          <el-table-column label="方向" width="110">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ cmBuilderSideLabel(row) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ cmEntryStatus(row) }}
            </template>
          </el-table-column>
          <el-table-column label="下注 U" width="100">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ fmtUsdc(cmDisplayBetMoney(row.primary)) }}
            </template>
          </el-table-column>
          <el-table-column label="盈亏 U" width="100">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ fmtUsdc(cmDisplayProfit(row.primary)) }}
            </template>
          </el-table-column>
          <el-table-column label="卖出回款 U" width="110">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ cmSellProceedsLabel(row) }}
            </template>
          </el-table-column>
          <el-table-column label="赔率" width="80">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ fmtOdds(row.primary.odds) }}
            </template>
          </el-table-column>
          <el-table-column label="价格" width="80">
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ fmtPrice(row.primary.price) }}
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90" show-overflow-tooltip>
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ row.primary.game }}
            </template>
          </el-table-column>
          <el-table-column label="比赛" min-width="180" show-overflow-tooltip>
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ row.primary.matchTitle }}
            </template>
          </el-table-column>
          <el-table-column label="玩法" width="90" show-overflow-tooltip>
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ row.primary.betTitle }}
            </template>
          </el-table-column>
          <el-table-column label="选项" min-width="120" show-overflow-tooltip>
            <template #default="{ row }: { row: CmBuilderDisplayEntry }">
              {{ row.primary.item }}
            </template>
          </el-table-column>
        </el-table>
        <div v-if="cmDisplayEntries.length > PAGE_SIZE" class="table-pager">
          <el-pagination
            v-model:current-page="cmPage"
            background
            layout="total, prev, pager, next"
            :total="cmDisplayEntries.length"
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

.meta-hint-info {
  color: var(--el-text-color-secondary);
}

.meta-row-wrap {
  align-items: flex-start;
}

.meta-row-wrap code {
  flex: 1;
  line-height: 1.4;
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

.cm-sell-expand {
  padding: 8px 12px 8px 48px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.cm-sell-expand--empty {
  color: var(--el-text-color-secondary);
}

.cm-sell-expand__row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
}

.cm-sell-expand__id {
  font-family: ui-monospace, monospace;
  color: var(--el-text-color-secondary);
}

:deep(.cm-order-row--no-sells .el-table__expand-icon) {
  visibility: hidden;
  pointer-events: none;
}
</style>
