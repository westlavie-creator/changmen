<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { formatDate } from "@/shared/format";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/lose-order.css";

const loseStore = useLoseOrderStore();
const user = useUserStore();
const { orders } = storeToRefs(loseStore);
const { config } = storeToRefs(user);

/** 无 Link 的手动补单：无法并入订单组，单独展示在订单列表上方 */
const manualOrders = computed(() =>
  [...orders.value.entries()].filter(([, order]) => !order.isLinkBoundMakeup()),
);

function runtimeLabel(betId: number) {
  const order = orders.value.get(betId);
  if (!order)
    return "";
  if (String(order.pendingPmOrderId ?? "").trim())
    return " · PM待确认";
  switch (order.runtimePhase) {
    case "placing":
      return " · 下单中";
    case "settling":
      return " · 检测拒单中";
    case "rejected_retry":
      return " · 再次被拒";
    default:
      return "";
  }
}

function remove(betId: number) {
  ElMessageBox.confirm("确认要删除补单吗？", "补单删除", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      loseStore.removeOrder(betId, true);
      void import("@/stores/activeBetRunStore")
        .then(({ useActiveBetRunStore }) => useActiveBetRunStore().removeRun(betId))
        .catch(() => {});
    })
    .catch(() => {});
}
</script>

<template>
  <fieldset v-if="manualOrders.length" class="loseorder-container">
    <legend>手动补单 ({{ manualOrders.length }}笔)</legend>
    <div class="loseorders">
      <div v-for="[betId, item] in manualOrders" :key="betId" class="order">
        <div class="match" v-html="item.match" />
        <div class="bet">
          <label v-html="item.bet" />
          <label class="team"> => {{ item.target }}</label>
        </div>
        <div class="time">
          时间: {{ formatDate(item.createAt) }}{{ runtimeLabel(betId) }}
        </div>
        <div class="info">
          补单金额：{{ item.getBetMoney(item.getOdds(config.makeProfit)) }}@{{
            item.getOdds(config.makeProfit)
          }}<span v-if="item.betCount"> x {{ item.betCount }}</span>
        </div>
        <i class="close" title="删除" role="button" @click="remove(betId)" />
      </div>
    </div>
  </fieldset>
</template>
