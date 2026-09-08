<script setup lang="ts">
import FootballMatchBoard from "@/components/football/FootballMatchBoard.vue";
import FootballObSessionBar from "@/components/match/FootballObSessionBar.vue";
import { openFootballSettings } from "@/runtime/footballSettingsUi";
import { useFootballStore } from "@/stores/footballStore";

const football = useFootballStore();
</script>

<template>
  <div class="football-board">
    <FootballObSessionBar
      layout="chip"
      @saved="football.fetchMatchs(true)"
      @open-settings="openFootballSettings"
    />
    <FootballMatchBoard />
  </div>
</template>
