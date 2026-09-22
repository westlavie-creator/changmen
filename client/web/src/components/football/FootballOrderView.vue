<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import FootballOrderList from "@/components/football/FootballOrderList.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { wait } from "@changmen/client-core/shared/wait";
import { todayKey } from "@/shared/dateKey";
import { useFootballOrderStore } from "@/stores/footballOrderStore";

const store = useFootballOrderStore();
const { orderDate, loading, rows } = storeToRefs(store);
const filterAccountId = ref(0);

const viewLoading = ref(false);

onMounted(() => {
  if (!store.rows.length)
    void store.load();
});

async function reload(date?: string) {
  filterAccountId.value = 0;
  viewLoading.value = true;
  try {
    const nextDate = date || orderDate.value;
    await store.load(nextDate);
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
    && obFootballRows.value.length > 0,
);

function onDateChange(value: string) {
  if (value)
    void reload(value);
}

function isObVenue(venue: unknown): boolean {
  return String(venue || "OB").trim().toUpperCase() === "OB";
}

const obFootballRows = computed(() => {
  return rows.value
    .filter(row => isObVenue(row.venue))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
});

const filteredRows = computed(() => {
  if (!filterAccountId.value)
    return obFootballRows.value;
  return obFootballRows.value.filter(row => Number(row.playerId) === filterAccountId.value);
});

const accountOptions = computed(() => store.accountOptions);
</script>

<template>
  <div class="order-view-stack">
    <div class="date flex flex-middle order-date-bar">
      <OrderDateNav
        v-model="orderDate"
        class="date-nav--sidebar"
        placeholder="选择日期"
        picker-width="86px"
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
        title="刷新订单"
        aria-label="刷新订单"
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
  justify-content: center;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  box-sizing: border-box;
}

.order-date-bar :deep(.date-nav) {
  flex: 0 0 auto;
}

.order-date-bar__refresh {
  flex: 0 0 32px;
  width: 32px;
  min-width: 32px;
  padding: 4px 0;
}

.order-filter-empty {
  margin: 6px 8px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  text-align: center;
}

.order-account-filter {
  width: 64px;
  min-width: 64px;
  flex: 0 0 64px;
}

.order-account-filter :deep(.el-select__wrapper) {
  padding-left: 4px;
  padding-right: 2px;
}

.order-account-filter :deep(.el-select__selected-item) {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-account-filter :deep(.el-select__suffix) {
  margin-left: 0;
}
</style>
