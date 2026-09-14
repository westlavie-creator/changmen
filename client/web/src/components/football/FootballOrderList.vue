<script setup lang="ts">
import type { FootballOrderDto } from "@/api/footballOrder";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@changmen/client-core/shared/format";
import { computed } from "vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import {
  formatPodSportOrderTitle,
  groupPodSportOrders,
  isFootballOrderPending,
} from "@/runtime/podSportOrders";

const props = withDefaults(
  defineProps<{
    rows: FootballOrderDto[];
    loading?: boolean;
    playerLabel?: (row: FootballOrderDto) => string;
    platformClass?: (row: FootballOrderDto) => string | undefined;
  }>(),
  {
    loading: false,
    playerLabel: (row: FootballOrderDto) => String(row.accountName || row.venue || "OB"),
    platformClass: () => undefined,
  },
);

const groups = computed(() => groupPodSportOrders(props.rows));
</script>

<template>
  <div class="orders" :class="{ loading }">
    <fieldset
      v-for="group in groups"
      :key="group.key"
      class="orderlink"
    >
      <legend :class="group.legendClass">
        {{ group.legend }}
      </legend>
      <div
        v-for="row in group.rows"
        :key="row.orderId || row.id"
        class="order"
      >
        <label class="status" :class="row.status || 'None'" />
        <div class="platform flex" :class="platformClass(row)">
          <span class="order__platform-badge">
            <PlatformIcon :platform="row.venue || 'OB'" />
          </span>
          <div class="player">
            {{ playerLabel(row) }}
          </div>
          <span
            class="order__pm-tag order__pm-tag--side"
            :class="row.auto ? 'order__pm-tag--buy' : 'order__pm-tag--sell'"
          >{{ row.auto ? "自动" : "手动" }}</span>
        </div>
        <div class="match">{{ formatPodSportOrderTitle(row) }}</div>
        <div class="bet">
          <div class="betname">
            {{ row.marketLabel || "—" }}
          </div>
          <div class="item">
            <label>{{ row.sideLabel || "—" }}</label>
          </div>
        </div>
        <div class="profit">
          买入金额：{{ toFixed(Number(row.stake) || 0, 0) }} 赔率：<span class="order__odds">{{
            formatDisplayOdds(Number(row.odds) || 0)
          }}</span>
          <template v-if="isFootballOrderPending(row.status)">
            盈亏：待结算
          </template>
          <template v-else>
            盈亏：{{ toFixed(Number(row.profit) || 0, 0) }}
          </template>
        </div>
        <div class="time">
          买入时间：{{ formatOrderTime(row.at || 0) }}
        </div>
      </div>
    </fieldset>
  </div>
</template>
