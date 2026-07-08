<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

const loseStore = useLoseOrderStore();
const { linkBoundCount } = storeToRefs(loseStore);
</script>

<template>
  <div v-if="linkBoundCount > 0" class="order-makeup-status">
    套利补单中 ({{ linkBoundCount }}笔)
  </div>
</template>
