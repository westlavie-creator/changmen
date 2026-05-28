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
  <fieldset v-if="orders.size" class="lose-panel">
    <legend>补单队列 ({{ orders.size }}笔)</legend>
    <div class="lose-list">
      <div v-for="[betId, item] in orders" :key="betId" class="lose-item">
        <div class="lose-item__match" v-html="item.match" />
        <div class="lose-item__bet">
          <label v-html="item.bet" />
          <label class="lose-item__target"> => {{ item.target }}</label>
        </div>
        <div class="lose-item__time">时间: {{ formatDate(item.createAt) }}</div>
        <div class="lose-item__info">
          补单金额：{{ item.getBetMoney(item.getOdds(config.makeProfit)) }}@{{
            item.getOdds(config.makeProfit)
          }}
          <span v-if="item.betCount > 1"> x {{ item.betCount }}</span>
        </div>
        <button type="button" class="lose-item__close" title="删除" @click="remove(betId)">
          ×
        </button>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.lose-panel {
  margin: 0;
  border: 1px solid #ffffff1a;
  border-radius: 0;
  padding: 8px 10px 10px;
  color: #cbd5e1;
}
.lose-panel legend {
  font-size: 12px;
  color: #e2e8f0;
  padding: 0 4px;
}
.lose-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}
.lose-item {
  position: relative;
  padding: 8px 24px 8px 8px;
  border-radius: 4px;
  background: #0f172a80;
  font-size: 11px;
}
.lose-item__match {
  color: #e2e8f0;
  margin-bottom: 4px;
}
.lose-item__bet {
  color: #94a3b8;
}
.lose-item__target {
  margin-left: 4px;
  color: #38bdf8;
}
.lose-item__time,
.lose-item__info {
  margin-top: 4px;
  color: #64748b;
}
.lose-item__close {
  position: absolute;
  top: 6px;
  right: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}
.lose-item__close:hover {
  color: #f87171;
}
</style>
