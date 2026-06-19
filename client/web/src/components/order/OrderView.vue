<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import type { OrderRow } from "@/types/order";
import { useOrderStore, isLinkedArbGroup } from "@/stores/orderStore";
import { formatOrderTime, formatDisplayOdds, toFixed } from "@/shared/format";
import { wait } from "@/shared/wait";
import OrderDateNav from "@/components/order/OrderDateNav.vue";

const orderStore = useOrderStore();
const { orderEntries, orderDate, loading, filterAccountId, accountOptions, orders } =
  storeToRefs(orderStore);

const viewLoading = ref(false);

onMounted(() => {
  if (!orderStore.orders.size) void orderStore.fetchOrders();
});

/** [A8 可证实] OrderView `a(c,d)`：重置账号筛选 → getOrders → finally wait(1s) */
async function reload(date?: string) {
  filterAccountId.value = 0;
  viewLoading.value = true;
  try {
    await orderStore.fetchOrders(date);
  } finally {
    await wait(1000);
    viewLoading.value = false;
  }
}

const showFilteredEmpty = computed(
  () =>
    filterAccountId.value !== 0 &&
    orderEntries.value.length === 0 &&
    orders.value.size > 0,
);

function onDateChange(value: string) {
  if (value) void reload(value);
}

function legendText(rows: OrderRow[]) {
  return orderStore.linkLegend(rows);
}

function legendClass(rows: OrderRow[]) {
  return orderStore.linkClass(rows);
}

function playerLabel(row: OrderRow) {
  return orderStore.playerLabel(row);
}

function platformClass(row: OrderRow) {
  return orderStore.platformClass(row);
}

function isArbGroup(rows: OrderRow[]) {
  return isLinkedArbGroup(rows);
}
</script>

<template>
  <div class="date flex flex-center">
    <OrderDateNav
      v-model="orderDate"
      class="date-nav--sidebar"
      placeholder="选择日期"
      picker-width="92px"
      :disabled="loading || viewLoading"
      @change="onDateChange"
    />
    <el-select
      v-model="filterAccountId"
      placeholder="Select"
      size="small"
      style="width: 160px"
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
      class="am-icon-refresh"
      size="small"
      :loading="loading || viewLoading"
      @click="reload()"
    />
  </div>

  <p v-if="showFilteredEmpty" class="order-filter-empty">
    当前账号筛选下无订单，请选「全部」或点刷新
  </p>

  <div class="orders" :class="{ loading: loading || viewLoading }">
    <fieldset
      v-for="[link, rows] in orderEntries"
      :key="link"
      class="orderlink"
      :class="{ 'orderlink--paired': isArbGroup(rows) }"
    >
      <legend :class="legendClass(rows)">
        {{ legendText(rows) }}
      </legend>
      <div v-for="row in rows" :key="String(row.OrderID)" class="order">
        <label class="status" :class="row.Status" />
        <div class="platform flex" :class="platformClass(row)">
          <div class="provider-icon" :class="row.Type" />
          <div class="player">{{ playerLabel(row) }}</div>
        </div>
        <div class="match" v-html="row.Match" />
        <div class="bet">
          <div class="betname" v-html="row.Bet" />
          <div class="item">
            <label v-html="row.Item" />
          </div>
        </div>
        <div class="profit">
          投注金额：{{ row.BetMoney }} 赔率：<span class="order__odds">{{
            formatDisplayOdds(Number(row.Odds) || 0)
          }}</span>
          盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
        </div>
        <div class="time">投注时间：{{ formatOrderTime(row.CreateAt || 0) }}</div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.order-filter-empty {
  margin: 6px 8px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  text-align: center;
}
</style>
