<script setup lang="ts">
import FootballLineLabel from "@/components/football/FootballLineLabel.vue";
import FootballOddsCell from "@/components/football/FootballOddsCell.vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import {
  type FootballBookSection,
} from "@/runtime/footballMarketLayout";
import {
  footballRowVenues,
  type FootballObMarketRow,
  type FootballSelection,
  type FootballVenueOdds,
} from "@/runtime/footballObMarkets";
import { podBoardLineAttr } from "@/runtime/podBoardFocus";

defineProps<{
  section: FootballBookSection;
  home: string;
  away: string;
  showTitle?: boolean;
}>();

function venues(row: FootballObMarketRow): FootballVenueOdds[] {
  return footballRowVenues(row);
}

function rowOddIds(row: FootballObMarketRow): string[] {
  const ids: string[] = [];
  for (const v of footballRowVenues(row)) {
    for (const s of v.Selections || []) {
      const id = String(s.OddID || "").trim();
      if (id)
        ids.push(id);
    }
  }
  return ids;
}

function marketAttr(row: FootballObMarketRow): string {
  return String(row.MarketCode || "").toLowerCase();
}

function selAt(list: FootballSelection[] | undefined, side: string): FootballSelection | undefined {
  const rows = list || [];
  const want = side.toLowerCase();
  const bySide = rows.find(s => String(s.Side || "").toLowerCase() === want);
  if (bySide)
    return bySide;
  const alias: Record<string, RegExp> = {
    home: /主|home/i,
    away: /客|away/i,
    draw: /平|和|draw/i,
    over: /大|over/i,
    under: /小|under/i,
  };
  return rows.find(s => alias[want]?.test(String(s.Name || "")));
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
        :key="`${row.hpid}-${row.MarketCode}-${row.Line}`"
        class="fb-sec__block"
        :data-pod-market="marketAttr(row)"
        :data-pod-line="podBoardLineAttr(row.Line)"
      >
        <div class="fb-sec__cols fb-sec__cols--ml">
          <span />
          <span>{{ home }}<FootballLineLabel :odd-ids="rowOddIds(row)" :fallback="row.Line" format="ml-home" /></span>
          <span>和</span>
          <span>{{ away }}<FootballLineLabel :odd-ids="rowOddIds(row)" :fallback="row.Line" format="ml-away" /></span>
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
          <FootballOddsCell
            side="home"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'home')?.OddID"
            :fallback="Number(selAt(v.Selections, 'home')?.Odds) || 0"
          />
          <FootballOddsCell
            side="draw"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'draw')?.OddID"
            :fallback="Number(selAt(v.Selections, 'draw')?.Odds) || 0"
          />
          <FootballOddsCell
            side="away"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'away')?.OddID"
            :fallback="Number(selAt(v.Selections, 'away')?.Odds) || 0"
          />
        </div>
      </div>
    </div>
    <div v-else-if="section.kind === 'ou'" class="fb-sec__body">
      <div
        v-for="(row, i) in section.rows"
        :key="`${row.hpid}-${row.Line}-${i}`"
        class="fb-sec__block"
        :data-pod-market="marketAttr(row)"
        :data-pod-line="podBoardLineAttr(row.Line)"
      >
        <div class="fb-sec__cols fb-sec__cols--ou">
          <span class="fb-sec__line"><FootballLineLabel :odd-ids="rowOddIds(row)" :fallback="row.Line" format="raw" /></span>
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
          <FootballOddsCell
            side="over"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'over')?.OddID"
            :fallback="Number(selAt(v.Selections, 'over')?.Odds) || 0"
          />
          <FootballOddsCell
            side="under"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'under')?.OddID"
            :fallback="Number(selAt(v.Selections, 'under')?.Odds) || 0"
          />
        </div>
      </div>
    </div>
    <div v-else-if="section.kind === 'ah'" class="fb-sec__body">
      <div
        v-for="(row, i) in section.rows"
        :key="`${row.hpid}-${row.Line}-${i}`"
        class="fb-sec__block"
        :data-pod-market="marketAttr(row)"
        :data-pod-line="podBoardLineAttr(row.Line)"
      >
        <div class="fb-sec__cols fb-sec__cols--ah">
          <span />
          <span>{{ home }} <FootballLineLabel :odd-ids="rowOddIds(row)" :fallback="row.Line" format="signed" /></span>
          <span>{{ away }} <FootballLineLabel :odd-ids="rowOddIds(row)" :fallback="row.Line" format="signed-neg" /></span>
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
          <FootballOddsCell
            side="home"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'home')?.OddID"
            :fallback="Number(selAt(v.Selections, 'home')?.Odds) || 0"
          />
          <FootballOddsCell
            side="away"
            :venue="v.venue"
            :odd-id="selAt(v.Selections, 'away')?.OddID"
            :fallback="Number(selAt(v.Selections, 'away')?.Odds) || 0"
          />
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
            <FootballOddsCell
              v-for="(sel, j) in v.Selections || []"
              :key="j"
              compact
              :venue="v.venue"
              :odd-id="sel.OddID"
              :fallback="Number(sel.Odds) || 0"
              :label="sel.Name || sel.Side"
              :side="sel.Side"
            />
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
  grid-template-columns: 40px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
}
.fb-sec__cols--ah,
.fb-sec__venue--ah,
.fb-sec__cols--ou,
.fb-sec__venue--ou {
  grid-template-columns: 40px minmax(0, 1fr) minmax(0, 1fr);
}
.fb-sec__cols--ah > span:not(:first-child) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  overflow: visible;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.fb-sec__grid-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  flex: 1;
  min-width: 0;
}
</style>
