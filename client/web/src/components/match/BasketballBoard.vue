<script setup lang="ts">
import SportMatchBoard from "@/components/match/SportMatchBoard.vue";
import { useBasketballStore } from "@/stores/basketballStore";

const basketball = useBasketballStore();
</script>

<template>
  <SportMatchBoard
    :store="basketball"
    meta-label="Polymarket + Predict.fun · NBA"
    empty-label="暂无篮球比赛"
  />
</template>
