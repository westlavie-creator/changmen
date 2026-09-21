<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import type { FootballOrderDto } from "@/api/footballOrder";
import FootballOrderList from "@/components/football/FootballOrderList.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { wait } from "@changmen/client-core/shared/wait";
import { todayKey } from "@/shared/dateKey";
import { resolveOrderItemLabel } from "@/shared/orderItemDisplay";
import { isUnifiedFootballOrderRow } from "@/shared/orderDomain";
import { normalizeFootballOrderStatus } from "@/runtime/podSportOrders";
import { pmOrderOriginalStakeDisplayCny } from "@/shared/pmOrderDisplay";
import { useFootballOrderStore } from "@/stores/footballOrderStore";
import { useOrderStore } from "@/stores/orderStore";
import type { OrderRow } from "@/types/order";

const store = useFootballOrderStore();
const orderStore = useOrderStore();
const { orderDate, loading: obLoading, rows }
  = storeToRefs(store);
const { loading: unifiedLoading } = storeToRefs(orderStore);
const filterAccountId = ref(0);

const viewLoading = ref(false);
const loading = computed(() => obLoading.value || unifiedLoading.value);

onMounted(() => {
  if (!store.rows.length || !orderStore.orders.size) {
    void Promise.all([
      store.load(),
      loadOrders(),
    ]);
  }
});

async function reload(date?: string) {
  filterAccountId.value = 0;
  viewLoading.value = true;
  try {
    const nextDate = date || orderDate.value;
    await Promise.all([
      store.load(nextDate),
      loadOrders(nextDate),
    ]);
    await store.syncVenueSettlement();
  }
  finally {
    await wait(1000);
    viewLoading.value = false;
  }
}

const showFilteredEmpty = computed(
  () =>
    filterAccountId.value !== 0
    && filteredRows.value.length === 0
    && combinedRows.value.length > 0,
);

function onDateChange(value: string) {
  if (value)
    void reload(value);
}

async function loadOrders(date?: string) {
  await orderStore.fetchOrders(date || orderDate.value, { sideEffects: false });
}

function isObVenue(venue: unknown): boolean {
  return String(venue || "OB").trim().toUpperCase() === "OB";
}

function splitMatch(match: unknown): { home: string; away: string; market: string } {
  const text = String(match || "").trim();
  const [title, ...marketParts] = text.split(/\s*:\s*/);
  const market = marketParts.join(": ").trim();
  const parts = title.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2)
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim(), market };
  return { home: title.trim(), away: "", market };
}

function cleanMarketLabel(row: OrderRow, parsedMarket: string): string {
  const bet = String(row.Bet || "").trim();
  if (bet && bet !== "买单" && bet !== "卖单")
    return bet;
  return parsedMarket;
}

function stakeOf(row: OrderRow): number {
  if (String(row.Type || "") === "Polymarket")
    return pmOrderOriginalStakeDisplayCny(row);
  return Number(row.BetMoney) || 0;
}

function unifiedOrderToFootballOrder(row: OrderRow): FootballOrderDto {
  const { home, away, market } = splitMatch(row.Match);
  return {
    id: String(row.OrderID || row.Link || `${row.Type || "order"}-${row.CreateAt || Date.now()}`),
    orderId: String(row.OrderID || ""),
    at: Number(row.CreateAt) || 0,
    home,
    away,
    sideLabel: resolveOrderItemLabel(row.Item, row.Match),
    marketLabel: cleanMarketLabel(row, market),
    odds: Number(row.Odds) || 0,
    stake: stakeOf(row),
    oid: String(row.PmTokenId || row.PfTokenId || ""),
    obMid: String(row.PmConditionId || row.PfMarketId || ""),
    auto: String(row.Source || "").toLowerCase().includes("auto"),
    status: normalizeFootballOrderStatus(row.Status || "None"),
    profit: Number(row.Money) || 0,
    venue: String(row.Type || ""),
    playerId: Number(row.PlayerID) || 0,
    accountName: String(row.Player?.UserName || ""),
  };
}

const unifiedFootballRows = computed(() => {
  const out: FootballOrderDto[] = [];
  for (const group of orderStore.orders.values()) {
    for (const row of group) {
      if (isUnifiedFootballOrderRow(row) && row.PmSide !== "sell" && row.PfSide !== "sell")
        out.push(unifiedOrderToFootballOrder(row));
    }
  }
  return out;
});

const combinedRows = computed(() =>
  [...rows.value.filter(row => isObVenue(row.venue)), ...unifiedFootballRows.value]
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)),
);

const filteredRows = computed(() => {
  if (!filterAccountId.value)
    return combinedRows.value;
  return combinedRows.value.filter(row => Number(row.playerId) === filterAccountId.value);
});

const accountOptions = computed(() => {
  const seen = new Set<number>();
  const opts: { value: number; label: string }[] = [];
  for (const opt of [...store.accountOptions, ...orderStore.accountOptions]) {
    const value = Number(opt.value) || 0;
    if (seen.has(value))
      continue;
    seen.add(value);
    opts.push({ value, label: opt.label });
  }
  return opts;
});
</script>

<template>
  <div class="order-view-stack">
    <div class="date flex flex-middle order-date-bar">
      <OrderDateNav
        v-model="orderDate"
        class="date-nav--sidebar"
        placeholder="选择日期"
        picker-width="100px"
        :disabled="loading || viewLoading"
        @change="onDateChange"
      />
      <el-select
        v-model="filterAccountId"
        class="order-account-filter"
        placeholder="Select"
        size="small"
        :disabled="loading || viewLoading"
      >
        <el-option
          v-for="opt in accountOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-button
        class="am-icon-refresh order-date-bar__refresh"
        size="small"
        :loading="loading || viewLoading"
        @click="reload()"
      />
    </div>

    <p v-if="store.persistError" class="order-filter-empty">
      {{ store.persistError }}
    </p>
    <p v-if="showFilteredEmpty" class="order-filter-empty">
      当前账号筛选下无订单，请选「全部」或点刷新
    </p>
    <p v-else-if="!loading && !viewLoading && !filteredRows.length" class="order-filter-empty">
      {{ orderDate === todayKey() ? "当日无足球订单" : "所选日期无足球订单" }}
    </p>

    <FootballOrderList
      :rows="filteredRows"
      :loading="loading || viewLoading"
      :player-label="store.playerLabel"
      :platform-class="store.platformClass"
    />
  </div>
</template>

<style scoped>
.order-view-stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.order-view-stack > :deep(.orders) {
  flex: 1 1 auto;
  min-height: 0;
}

.order-date-bar {
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 8px;
}

.order-date-bar__refresh {
  margin-left: auto;
  flex: 0 0 auto;
}

.order-filter-empty {
  margin: 6px 8px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  text-align: center;
}

.order-account-filter {
  width: 56px;
  flex: 0 0 auto;
}

.order-account-filter :deep(.el-select__wrapper) {
  padding-left: 4px;
  padding-right: 2px;
}

.order-account-filter :deep(.el-select__selected-item) {
  font-size: 11px;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-account-filter :deep(.el-select__suffix) {
  margin-left: 0;
}
</style>
