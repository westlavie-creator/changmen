<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import { formatDate } from "@/utils/format";
import BetRow from "@/components/match/BetRow.vue";

defineProps<{
  match: ViewMatch;
}>();
</script>

<template>
  <div class="match">
    <div class="match-title">
      [{{ match.game }}]
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
    </div>
    <div class="bets flex flex-wrap">
      <BetRow v-for="bet in match.bets" :key="bet.id" :match="match" :bet="bet" />
    </div>
  </div>
</template>
