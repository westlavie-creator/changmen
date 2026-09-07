<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import { formatDate } from "@changmen/client-core/shared/format";
import { footballLeagueTag } from "@/runtime/footballLeague";
import { computed } from "vue";

const props = defineProps<{
  match: ViewMatch;
}>();

const leagueTag = computed(() => footballLeagueTag(props.match.game));
</script>

<template>
  <div class="match football-match">
    <div class="match-title football-match__title">
      <label v-if="leagueTag" class="game-tag">[{{ leagueTag }}]</label>
      <label class="football-match__name">{{ match.title }}</label>
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
    </div>
    <div class="football-match__book">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.football-match__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  padding: 0 0 10px;
}
.football-match__name {
  min-width: 0;
  font-weight: 600;
}
.football-match__book {
  width: 100%;
  min-width: 0;
}
</style>
