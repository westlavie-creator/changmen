<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  formatPodSportOrderMeta,
  formatPodSportOrderTitle,
  POD_SPORT_ORDERS_UPDATED,
  readPodSportOrders,
  type PodSportOrder,
} from "@/runtime/podSportOrders";
import { formatPodPrice } from "@/runtime/podAlerts";

const rows = ref<PodSportOrder[]>(readPodSportOrders());
const nowTick = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

function reload() {
  rows.value = readPodSportOrders();
}

onMounted(() => {
  reload();
  window.addEventListener(POD_SPORT_ORDERS_UPDATED, reload);
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 15_000);
});

onUnmounted(() => {
  window.removeEventListener(POD_SPORT_ORDERS_UPDATED, reload);
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});
</script>

<template>
  <div class="order-view-stack football-order-view">
    <div class="football-order-view__head">
      足球订单
      <span class="football-order-view__n">{{ rows.length }}</span>
    </div>
    <p v-if="!rows.length" class="football-order-view__hint">
      POD 跟单下出的单会出现在这里，不进电竞订单。自动关着只记 EV，开了才会出现订单。
    </p>
    <div v-else class="football-order-view__list">
      <article v-for="row in rows" :key="row.orderId || row.id" class="football-order-row">
        <div class="football-order-row__top">
          <span class="football-order-row__side">{{ row.sideLabel }}</span>
          <span class="football-order-row__odds">{{ formatPodPrice(row.odds) }}</span>
        </div>
        <div class="football-order-row__match">{{ formatPodSportOrderTitle(row) }}</div>
        <div class="football-order-row__meta">{{ row.marketLabel }}</div>
        <div class="football-order-row__meta">{{ formatPodSportOrderMeta(row, nowTick) }}</div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.football-order-view {
  min-height: 0;
  overflow: hidden;
  background: #0f172a;
  color: #e2e8f0;
}

.football-order-view__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 8px 10px;
  border-bottom: 1px solid #ffffff14;
  font-size: 12px;
  font-weight: 700;
}

.football-order-view__n {
  color: #94a3b8;
  font-weight: 500;
}

.football-order-view__hint {
  margin: 0;
  padding: 12px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
}

.football-order-view__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.football-order-row {
  padding: 8px 10px;
  border-bottom: 1px solid #ffffff0f;
}

.football-order-row__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.football-order-row__side {
  color: #fbbf24;
  font-size: 12px;
  font-weight: 700;
}

.football-order-row__odds {
  color: #4ade80;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.football-order-row__match {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
}

.football-order-row__meta {
  margin-top: 2px;
  font-size: 11px;
  color: #94a3b8;
}
</style>
