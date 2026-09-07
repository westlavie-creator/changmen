<script setup lang="ts">
import FootballMatchBoard from "@/components/football/FootballMatchBoard.vue";
import FootballObSessionBar from "@/components/match/FootballObSessionBar.vue";
import { useFootballStore } from "@/stores/footballStore";

const football = useFootballStore();
</script>

<template>
  <div class="football-board">
    <FootballObSessionBar @saved="football.fetchMatchs(true)" />
    <FootballMatchBoard />
  </div>
</template>
