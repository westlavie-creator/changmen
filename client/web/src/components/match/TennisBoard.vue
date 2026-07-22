<script setup lang="ts">
import SportMatchBoard from "@/components/match/SportMatchBoard.vue";
import { useTennisStore } from "@/stores/tennisStore";

const tennis = useTennisStore();
</script>

<template>
  <SportMatchBoard
    :store="tennis"
    meta-label="Polymarket + Predict.fun · ATP/WTA 单打"
    empty-label="暂无网球比赛"
  />
</template>
