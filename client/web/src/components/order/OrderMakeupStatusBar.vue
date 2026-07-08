<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

const loseStore = useLoseOrderStore();
const { orders } = storeToRefs(loseStore);

/** 已绑定 Link 的补单在订单组内展示；顶栏仅统计这类 */
const count = computed(() => {
  let n = 0;
  for (const order of orders.value.values()) {
    if (order.isLinkBoundMakeup())
      n += 1;
  }
  return n;
});
</script>

<template>
  <div v-if="count > 0" class="order-makeup-status">
    套利补单中 ({{ count }}笔)
  </div>
</template>
