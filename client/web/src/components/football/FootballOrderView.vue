<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import FootballOrderList from "@/components/football/FootballOrderList.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { wait } from "@changmen/client-core/shared/wait";
import { todayKey } from "@/shared/dateKey";
import { useFootballOrderStore } from "@/stores/footballOrderStore";

const store = useFootballOrderStore();
const { orderDate, loading, filterAccountId, accountOptions, rows, filteredRows }
  = storeToRefs(store);

const viewLoading = ref(false);

onMounted(() => {
  if (!store.rows.length)
    void store.load();
});

async function reload(date?: string) {
  filterAccountId.value = 0;
  viewLoading.value = true;
  try {
    await store.load(date);
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
    && rows.value.length > 0,
);

function onDateChange(value: string) {
  if (value)
    void reload(value);
}
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
