<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import BetRow from "@/components/match/BetRow.vue";
import { formatDate } from "@/shared/format";

defineProps<{
  match: ViewMatch;
}>();
</script>

<template>
  <div class="match">
    <div class="match-title">
      <label v-if="match.game" class="game-tag">[{{ match.game }}]</label>
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
      <label v-if="match.pmSport?.label" class="pm-sport">{{ match.pmSport.label }}</label>
    </div>
    <div class="bets flex flex-wrap">
      <BetRow v-for="bet in match.bets" :key="bet.id" :match="match" :bet="bet" />
    </div>
  </div>
</template>
