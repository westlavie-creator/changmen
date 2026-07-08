<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

const loseStore = useLoseOrderStore();
const { orders } = storeToRefs(loseStore);
const count = computed(() => orders.value.size);
</script>

<template>
  <div v-if="count > 0" class="order-makeup-status">
    补单中 ({{ count }}笔)
  </div>
</template>
