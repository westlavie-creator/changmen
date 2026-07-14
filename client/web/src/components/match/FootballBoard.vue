<script setup lang="ts">
import SportMatchBoard from "@/components/match/SportMatchBoard.vue";
import { useFootballStore } from "@/stores/footballStore";

const football = useFootballStore();
</script>

<template>
  <SportMatchBoard
    :store="football"
    meta-label="Polymarket · 暂不匹配"
    empty-label="暂无足球比赛"
  />
</template>
