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
  return s.label || s.status || (s.ended ? "已结束" : "");
});

const pmSportTitle = computed(() => {
  const src = props.match.pmSport?.resolutionSource;
  return src ? String(src) : undefined;
});
</script>

<template>
  <div class="match">
    <div class="match-title">
      <label v-if="match.game" class="game-tag">[{{ match.game }}]</label>
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
      <label v-if="pmSportText" class="pm-sport" :title="pmSportTitle">{{ pmSportText }}</label>
    </div>
    <div class="bets flex flex-wrap">
      <BetRow v-for="bet in match.bets" :key="bet.id" :match="match" :bet="bet" />
    </div>
  </div>
</template>
