<script setup lang="ts">
import type { ViewMatch } from "@/models/match";
import BetRow from "@/components/match/BetRow.vue";
import { formatDate } from "@changmen/client-core/shared/format";
import {
  formatResolutionSourceLabel,
  normalizeResolutionSourceHref,
} from "@/shared/pmSportDisplay";
import {
  lookupResolutionSourceBySourceMatchId,
  pmMapOutcomeTick,
} from "@changmen/venue-adapter/polymarket";
import { computed } from "vue";

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

/** Gamma resolutionSource（经 MarketIndex）；Index 未命中时回退 pm_sport 上的同字段（Gamma 合并写入，非 Sports 比分） */
const resolutionSource = computed(() => {
  void pmMapOutcomeTick.value;
  const fromIndex = lookupResolutionSourceBySourceMatchId(props.match.providers?.Polymarket);
  if (fromIndex)
    return fromIndex;
  const fromPmSport = String(props.match.pmSport?.resolutionSource ?? "").trim();
  return fromPmSport || null;
});

const resolutionLabel = computed(() => formatResolutionSourceLabel(resolutionSource.value || undefined));
const resolutionHref = computed(() => normalizeResolutionSourceHref(resolutionSource.value || undefined));
</script>

<template>
  <div class="match">
    <div class="match-title">
      <label v-if="match.game" class="game-tag">[{{ match.game }}]</label>
      <label v-html="match.title" />
      <label class="startTime">{{ formatDate(match.startAt) }}</label>
      <span v-if="resolutionLabel && resolutionHref" class="pm-sport">
        <a
          class="pm-sport-link"
          :href="resolutionHref"
          target="_blank"
          rel="noopener noreferrer"
        >{{ resolutionLabel }}</a>
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
