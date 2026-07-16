<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import BetRow from "@/components/match/BetRow.vue";
import { formatDate } from "@changmen/client-core/shared/format";
import { buildPmSportDisplayParts } from "@/shared/pmSportDisplay";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useMatchStore } from "@/stores/matchStore";

/** 默认 true：电竞 HomeView 不传时必须允许下注。
 * Vue 对 `boolean` 缺省会铸成 false；若无 default，中转 `:allow-betting` 会把电竞一并锁死。 */
const props = withDefaults(
  defineProps<{
    match: ViewMatch;
    /** 仅体育板传入；电竞不传（见 SportMatchBoard） */
    oddsDisplayTick?: number;
    /** 体育只读：false；电竞默认 true */
    allowBetting?: boolean;
  }>(),
  { allowBetting: true },
);

const { pmSportTick } = storeToRefs(useMatchStore());

const pmSportParts = computed(() => {
  void pmSportTick.value;
  return buildPmSportDisplayParts(props.match.pmSport);
});
</script>

<template>
  <div class="match">
    <div class="match-title">
      <label v-if="match.game" class="game-tag">[{{ match.game }}]</label>
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
      <span v-if="pmSportParts.length" class="pm-sport">
        <template v-for="(part, index) in pmSportParts" :key="index">
          <span v-if="index > 0" class="pm-sport-sep"> · </span>
          <a
            v-if="part.kind === 'link'"
            class="pm-sport-link"
            :href="part.href"
            target="_blank"
            rel="noopener noreferrer"
          >{{ part.text }}</a>
          <span v-else>{{ part.text }}</span>
        </template>
      </span>
    </div>
    <div class="bets flex flex-wrap">
      <BetRow
        v-for="bet in match.bets"
        :key="bet.id"
        :match="match"
        :bet="bet"
        :odds-display-tick="oddsDisplayTick"
        :allow-betting="allowBetting"
      />
    </div>
  </div>
</template>
