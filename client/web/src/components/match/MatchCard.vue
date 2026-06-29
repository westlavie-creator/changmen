<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import BetRow from "@/components/match/BetRow.vue";
import { formatDate } from "@/shared/format";
import { computed } from "vue";

const props = defineProps<{
  match: ViewMatch;
}>();

const pmSportText = computed(() => {
  const s = props.match.pmSport;
  if (!s)
    return "";
  if (s.label)
    return s.label;
  if (s.ended)
    return "已结束";
  if (s.status)
    return s.status;
  return "";
});
</script>

<template>
  <div class="match">
    <div class="match-title">
      <label v-if="match.game" class="game-tag">[{{ match.game }}]</label>
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
      <label v-if="pmSportText" class="pm-sport">{{ pmSportText }}</label>
    </div>
    <div class="bets flex flex-wrap">
      <BetRow v-for="bet in match.bets" :key="bet.id" :match="match" :bet="bet" />
    </div>
  </div>
</template>
