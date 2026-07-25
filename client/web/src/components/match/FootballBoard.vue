<script setup lang="ts">
import SportMatchBoard from "@/components/match/SportMatchBoard.vue";
import { useFootballStore } from "@/stores/footballStore";

const football = useFootballStore();
</script>

<template>
  <SportMatchBoard
    :store="football"
    meta-label="Polymarket + Predict.fun · 胜负/让球/大小（全量；PF 让球大小目前主要中超）"
    empty-label="暂无足球比赛"
  />
</template>
