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

function onDateInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
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
  <section class="order-panel">
    <div class="order-toolbar flex flex-middle">
      <input
        class="order-date"
        type="date"
        :value="orderDate"
        :disabled="loading"
        @change="onDateInput"
      />
      <select v-model="filterAccountId" class="order-select" :disabled="loading">
        <option v-for="opt in accountOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <button type="button" class="order-refresh" :disabled="loading" @click="reload()">
        ↻
      </button>
    </div>

    <div class="orders" :class="{ loading }">
      <p v-if="!filteredOrders.size && !loading" class="order-empty">当日暂无订单</p>
      <fieldset v-for="[link, rows] in filteredOrders" :key="link" class="orderlink">
        <legend :class="legendClass(rows)">{{ legendText(rows) }}</legend>
        <div v-for="row in rows" :key="String(row.OrderID)" class="order">
          <label class="status" :class="row.Status" />
          <div class="platform flex" :class="row.Player?.Status">
            <div class="provider-icon" :class="row.Type" />
            <div class="player">{{ playerLabel(row) }}</div>
          </div>
          <div class="match" v-html="row.Match" />
          <div class="bet-row flex flex-between">
            <div class="betname" v-html="row.Bet" />
            <div class="item">
              <label v-html="row.Item" />
              @{{ row.Odds }}
            </div>
          </div>
          <div class="time">投注时间：{{ formatDate(row.CreateAt || 0) }}</div>
          <div class="profit">投注金额：{{ row.BetMoney }} 盈亏：{{ row.Money }}</div>
        </div>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.order-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #ffffff14;
}
.order-toolbar {
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #ffffff14;
}
.order-date,
.order-select {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}
.order-refresh {
  width: 28px;
  height: 28px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #334155;
  color: #e2e8f0;
  cursor: pointer;
}
.orders {
  flex: 1;
  overflow: auto;
  padding: 8px 10px;
}
.orders.loading {
  opacity: 0.6;
}
.order-empty {
  color: #64748b;
  font-size: 12px;
  text-align: center;
  padding: 12px 0;
}
.orderlink {
  border: 1px solid #ffffff1a;
  margin: 0 0 10px;
  padding: 6px 8px 8px;
  color: #cbd5e1;
}
.orderlink legend {
  font-size: 12px;
  padding: 0 4px;
}
.orderlink legend.success {
  color: #34d399;
}
.orderlink legend.fail {
  color: #f87171;
}
.order {
  position: relative;
  padding: 6px 0 8px;
  border-top: 1px solid #ffffff0d;
  font-size: 11px;
}
.order:first-of-type {
  border-top: none;
}
.order .status {
  position: absolute;
  left: 0;
  top: 8px;
  width: 4px;
  height: 28px;
  border-radius: 2px;
  background: #64748b;
}
.order .status.Win {
  background: #059669;
}
.order .status.Lose,
.order .status.Reject {
  background: #dc2626;
}
.order .status.None {
  background: #eab308;
}
.order .platform {
  gap: 6px;
  align-items: center;
  margin-left: 10px;
}
.order .provider-icon {
  width: 16px;
  height: 16px;
}
.order .player {
  color: #94a3b8;
}
.order .match {
  margin: 4px 0 4px 10px;
  color: #e2e8f0;
}
.order .bet-row {
  margin-left: 10px;
  gap: 8px;
}
.order .betname {
  color: #94a3b8;
}
.order .item {
  color: #38bdf8;
  white-space: nowrap;
}
.order .time,
.order .profit {
  margin: 4px 0 0 10px;
  color: #64748b;
}
</style>
