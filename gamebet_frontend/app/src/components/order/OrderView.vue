<script setup lang="ts">
import { storeToRefs } from "pinia";
import type { OrderRow } from "@/types/order";
import { useOrderStore } from "@/stores/orderStore";
import { formatDate } from "@/shared/format";

const orderStore = useOrderStore();
const { filteredOrders, orderDate, loading, filterAccountId, accountOptions } =
  storeToRefs(orderStore);

async function reload(date?: string) {
  filterAccountId.value = 0;
  await orderStore.fetchOrders(date);
}

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
</script>

<template>
  <div class="date flex flex-center">
    <el-date-picker
      v-model="orderDate"
      type="date"
      placeholder="选择日期"
      size="small"
      value-format="YYYY-MM-DD"
      :disabled="loading"
      @change="onDateChange"
    />
    <el-select
      v-model="filterAccountId"
      placeholder="Select"
      size="small"
      style="width: 160px"
      :disabled="loading"
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
      :loading="loading"
      @click="reload()"
    />
  </div>

  <div class="orders" :class="{ loading }">
    <fieldset v-for="[link, rows] in filteredOrders" :key="link" class="orderlink">
      <legend :class="legendClass(rows)">{{ legendText(rows) }}</legend>
      <div v-for="row in rows" :key="String(row.OrderID)" class="order">
        <label class="status" :class="row.Status" />
        <div class="platform flex" :class="row.Player?.Status">
          <div class="provider-icon" :class="row.Type" />
          <div class="player">{{ playerLabel(row) }}</div>
        </div>
        <div class="match" v-html="row.Match" />
        <div class="bet">
          <div class="betname" style="float: left" v-html="row.Bet" />
          <div class="item" style="float: right">
            <label v-html="row.Item" />
            @{{ row.Odds }}
          </div>
        </div>
        <div class="time">投注时间：{{ formatDate(row.CreateAt || 0) }}</div>
        <div class="profit">投注金额：{{ row.BetMoney }} 盈亏：{{ row.Money }}</div>
      </div>
    </fieldset>
  </div>
</template>
