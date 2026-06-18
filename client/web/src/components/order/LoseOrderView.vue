<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ElMessageBox } from "element-plus";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useConfigStore } from "@/stores/configStore";
import { formatDate } from "@/shared/format";

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
        <div class="time"> 时间: {{ formatDate(item.createAt) }}</div>
        <div class="info">
          补单金额：{{ item.getBetMoney(item.getOdds(config.makeProfit)) }}@{{
            item.getOdds(config.makeProfit)
          }}<span v-if="item.betCount"> x {{ item.betCount }}</span>
        </div>
        <i class="close am-icon-times" title="删除" @click="remove(betId)" />
      </div>
    </div>
  </fieldset>
</template>

<!-- [A8 可证实] LoseOrderView scoped（bundle data-v-6ad7135b） -->
<style scoped>
.loseorder-container {
  border: 1px solid #000;
  border-radius: 6px;
  margin: 5px;
  padding: 5px;
  overflow: visible;
  box-shadow: none;
}

.loseorder-container legend {
  font-size: 12px;
  padding: 2px 10px;
  line-height: 16px;
  color: #fff;
  text-shadow: 1px 1px 0 #000;
  background: #909399;
  border: none;
  border-radius: 0;
  cursor: default;
}

.loseorders .order {
  color: #fffc;
  font-size: 12px;
  background: linear-gradient(to bottom, #45484d, #000);
  margin-top: 10px;
  border-radius: 6px;
  padding: 6px 22px 6px 6px;
  line-height: 20px;
  position: relative;
  overflow: visible;
}

.loseorders .order:first-child {
  margin-top: 0;
}

.loseorders .order .match {
  font-size: 14px;
}

.loseorders .order .close {
  position: absolute;
  right: 5px;
  top: 5px;
  z-index: 2;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 14px;
  font-style: normal;
  color: #fff;
  transition: all 0.25s;
  cursor: pointer;
}

.loseorders .order .close::before {
  display: inline-block;
  font: normal normal normal 14px/1 FontAwesome, sans-serif;
  content: "\f00d";
}

.loseorders .order .close:hover {
  transform: scale(1.2);
  color: #fff;
}
</style>
