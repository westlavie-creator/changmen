<script setup lang="ts">
import SportMatchBoard from "@/components/match/SportMatchBoard.vue";
import { useBaseballStore } from "@/stores/baseballStore";

const baseball = useBaseballStore();
</script>

<template>
  <SportMatchBoard
    :store="baseball"
    meta-label="Polymarket + Predict.fun · MLB/KBO/NPB"
    empty-label="暂无棒球比赛"
  />
</template>
