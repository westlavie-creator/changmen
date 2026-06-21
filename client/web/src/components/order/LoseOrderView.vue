<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import { storeToRefs } from "pinia";
import { formatDate } from "@/shared/format";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/lose-order.css";

const loseStore = useLoseOrderStore();
const configStore = useConfigStore();
const { orders } = storeToRefs(loseStore);
const { config } = storeToRefs(configStore);

function remove(betId: number) {
  ElMessageBox.confirm("确认要删除补单吗？", "补单删除", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      loseStore.removeOrder(betId, true);
    })
    .catch(() => {});
}
</script>

<template>
  <fieldset v-if="orders.size" class="loseorder-container">
    <legend>补单队列 ({{ orders.size }}笔)</legend>
    <div class="loseorders">
      <div v-for="[betId, item] in orders" :key="betId" class="order">
        <div class="match" v-html="item.match" />
        <div class="bet">
          <label v-html="item.bet" />
          <label class="team"> => {{ item.target }}</label>
        </div>
        <div class="time">
          时间: {{ formatDate(item.createAt) }}
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
