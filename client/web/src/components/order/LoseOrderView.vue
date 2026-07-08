<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import { storeToRefs } from "pinia";
import { formatDate } from "@/shared/format";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/lose-order.css";

const loseStore = useLoseOrderStore();
const user = useUserStore();
const { manualOrders } = storeToRefs(loseStore);
const { config } = storeToRefs(user);

function runtimeLabel(order: (typeof manualOrders.value)[number]) {
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
      <div v-for="item in manualOrders" :key="item.betId" class="order">
        <i
          class="close"
          title="删除补单"
          role="button"
          @click="remove(item.betId)"
        />
        <div class="match" v-html="item.match" />
        <div class="bet">
          <label v-html="item.bet" />
          <label class="team"> => {{ item.target }}</label>
        </div>
        <div class="time">
          时间: {{ formatDate(item.createAt) }}{{ runtimeLabel(item) }}
        </div>
        <div class="info">
          补单金额：{{ item.getBetMoney(item.getOdds(config.makeProfit)) }}@{{
            item.getOdds(config.makeProfit)
          }}<span v-if="item.betCount > 1"> x {{ item.betCount }}</span>
        </div>
      </div>
    </div>
  </fieldset>
</template>
