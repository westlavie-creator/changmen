<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useConfigStore } from "@/stores/configStore";
import { formatDate } from "@/shared/format";

const loseStore = useLoseOrderStore();
const configStore = useConfigStore();
const { orders } = storeToRefs(loseStore);
const { config } = storeToRefs(configStore);

function remove(betId: number) {
  if (!confirm("确认要删除补单吗？")) return;
  loseStore.removeOrder(betId, true);
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
        <div class="time">时间: {{ formatDate(item.createAt) }}</div>
        <div class="info">
          补单金额：{{ item.getBetMoney(item.getOdds(config.makeProfit)) }}@{{
            item.getOdds(config.makeProfit)
          }}
          <span v-if="item.betCount > 1"> x {{ item.betCount }}</span>
        </div>
        <div class="close am-icon-times" title="删除" @click="remove(betId)" />
      </div>
    </div>
  </fieldset>
</template>
