<script setup lang="ts">
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import {
  formatFootballLine,
  type FootballBookSection,
} from "@/runtime/footballMarketLayout";
import {
  footballRowVenues,
  type FootballObMarketRow,
  type FootballSelection,
  type FootballVenueOdds,
} from "@/runtime/footballObMarkets";

defineProps<{
  section: FootballBookSection;
  home: string;
  away: string;
  showTitle?: boolean;
}>();

function venues(row: FootballObMarketRow): FootballVenueOdds[] {
  return footballRowVenues(row);
}

function selOdds(list: FootballSelection[] | undefined, side: string) {
  const rows = list || [];
  const want = side.toLowerCase();
  const bySide = rows.find(s => String(s.Side || "").toLowerCase() === want);
  if (bySide)
    return Number(bySide.Odds) || 0;
  const alias: Record<string, RegExp> = {
    home: /主|home/i,
    away: /客|away/i,
    draw: /平|和|draw/i,
    over: /大|over/i,
    under: /小|under/i,
  };
  const byName = rows.find(s => alias[want]?.test(String(s.Name || "")));
  return Number(byName?.Odds) || 0;
}

function fmtOdds(n: number) {
  if (!(n > 0))
    return "-";
  return String(n);
}

function locked(n: number) {
  return !(n > 0);
}
</script>

<template>
  <div class="fb-sec">
    <div v-if="showTitle !== false" class="fb-sec__head">
      {{ section.title }}
    </div>
    <div v-if="section.kind === 'ml'" class="fb-sec__body">
      <div
        v-for="row in section.rows"
        :key="`${row.hpid}-${row.MarketCode}`"
        class="fb-sec__block"
      >
        <div class="fb-sec__cols fb-sec__cols--ml">
          <span />
          <span>{{ home }}</span>
          <span>和</span>
          <span>{{ away }}</span>
        </div>
        <div
          v-for="v in venues(row)"
          :key="v.venue || 'one'"
          class="fb-sec__venue fb-sec__venue--ml"
        >
          <PlatformIcon
            v-if="v.venue"
            class="fb-sec__icon"
            :platform="v.venue"
            :title="v.venue"
          />
          <span v-else class="fb-sec__icon" />
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'home')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'home')) }}</span>
          </div>
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'draw')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'draw')) }}</span>
          </div>
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'away')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'away')) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="section.kind === 'ou'" class="fb-sec__body">
      <div
        v-for="(row, i) in section.rows"
        :key="`${row.hpid}-${row.Line}-${i}`"
        class="fb-sec__block"
      >
        <div class="fb-sec__cols fb-sec__cols--ou">
          <span class="fb-sec__line">{{ row.Line ?? "" }}</span>
          <span>大</span>
          <span>小</span>
        </div>
        <div
          v-for="v in venues(row)"
          :key="v.venue || 'one'"
          class="fb-sec__venue fb-sec__venue--ou"
        >
          <PlatformIcon
            v-if="v.venue"
            class="fb-sec__icon"
            :platform="v.venue"
            :title="v.venue"
          />
          <span v-else class="fb-sec__icon" />
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'over')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'over')) }}</span>
          </div>
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'under')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'under')) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="section.kind === 'ah'" class="fb-sec__body">
      <div
        v-for="(row, i) in section.rows"
        :key="`${row.hpid}-${row.Line}-${i}`"
        class="fb-sec__block"
      >
        <div class="fb-sec__cols fb-sec__cols--ah">
          <span />
          <span>{{ home }} {{ formatFootballLine(row.Line) }}</span>
          <span>{{ away }} {{ formatFootballLine(row.Line != null ? -Number(row.Line) : null) }}</span>
        </div>
        <div
          v-for="v in venues(row)"
          :key="v.venue || 'one'"
          class="fb-sec__venue fb-sec__venue--ah"
        >
          <PlatformIcon
            v-if="v.venue"
            class="fb-sec__icon"
            :platform="v.venue"
            :title="v.venue"
          />
          <span v-else class="fb-sec__icon" />
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'home')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'home')) }}</span>
          </div>
          <div class="fb-sec__cell" :class="{ lock: locked(selOdds(v.Selections, 'away')) }">
            <span class="fb-sec__odd">{{ fmtOdds(selOdds(v.Selections, 'away')) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="fb-sec__body">
      <div
        v-for="(row, i) in section.rows"
        :key="`${row.hpid}-${row.Name}-${i}`"
        class="fb-sec__block"
      >
        <div
          v-for="v in venues(row)"
          :key="v.venue || 'one'"
          class="fb-sec__grid-venue"
        >
          <PlatformIcon
            v-if="v.venue"
            class="fb-sec__icon"
            :platform="v.venue"
            :title="v.venue"
          />
          <div class="fb-sec__grid-block">
            <div
              v-for="(sel, j) in v.Selections || []"
              :key="j"
              class="fb-sec__cell fb-sec__cell--sm"
              :class="{ lock: locked(Number(sel.Odds) || 0) }"
            >
              <span class="fb-sec__lab">{{ sel.Name || sel.Side }}</span>
              <span class="fb-sec__odd">{{ fmtOdds(Number(sel.Odds) || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb-sec {
  min-width: 0;
}
.fb-sec__head {
  padding: 6px 8px 4px;
  font-size: 12px;
  color: hsla(0, 0%, 100%, 0.55);
}
.fb-sec__body {
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fb-sec__block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fb-sec__cols {
  display: grid;
  gap: 6px;
  font-size: 11px;
  color: hsla(0, 0%, 100%, 0.5);
  text-align: center;
  min-width: 0;
}
.fb-sec__cols--ml,
.fb-sec__venue--ml {
  grid-template-columns: 22px 1fr 1fr 1fr;
}
.fb-sec__cols--ah,
.fb-sec__venue--ah,
.fb-sec__cols--ou,
.fb-sec__venue--ou {
  grid-template-columns: 22px 1fr 1fr;
}
.fb-sec__cols span:first-child {
  text-align: left;
}
.fb-sec__venue {
  display: grid;
  gap: 6px;
  align-items: center;
}
.fb-sec__grid-venue {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.fb-sec__icon {
  width: 18px;
  height: 18px;
  justify-self: center;
}
.fb-sec__line {
  font-size: 12px;
  font-weight: 600;
  color: #93c5fd;
  text-align: left;
}
.fb-sec__grid-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.fb-sec__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 28px;
  min-width: 0;
  padding: 4px 6px;
  border-radius: 6px;
  background: hsla(210, 40%, 50%, 0.16);
  border: 1px solid hsla(210, 40%, 70%, 0.18);
}
.fb-sec__cell--sm {
  flex-direction: column;
  justify-content: center;
  min-height: 42px;
}
.fb-sec__lab {
  font-size: 11px;
  color: hsla(0, 0%, 100%, 0.62);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-sec__odd {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}
.fb-sec__cell.lock {
  opacity: 0.45;
}
</style>
