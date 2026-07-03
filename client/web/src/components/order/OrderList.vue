<script setup lang="ts">
import type { OrderRow } from "@/types/order";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";

export type OrderListEntry = readonly [number, OrderRow[]];

withDefaults(
  defineProps<{
    orderEntries: ReadonlyArray<OrderListEntry>;
    loading?: boolean;
    playerLabel?: (row: OrderRow) => string;
    platformClass?: (row: OrderRow) => string | undefined;
  }>(),
  {
    loading: false,
    playerLabel: () => "",
    platformClass: () => undefined,
  },
);
</script>

<template>
  <div class="orders" :class="{ loading }">
    <fieldset
      v-for="[link, rows] in orderEntries"
      :key="link"
      class="orderlink"
      :class="{ 'orderlink--paired': isArbGroup(rows) }"
      :data-link-id="link"
    >
      <legend :class="orderLegendModifier(rows)">
        {{ orderLegendText(rows) }}
      </legend>
      <div v-for="row in rows" :key="String(row.OrderID)" class="order">
        <label class="status" :class="row.Status" />
        <div class="platform flex" :class="platformClass(row)">
          <div class="provider-icon" :class="row.Type" />
          <div class="player">
            {{ playerLabel(row) }}
          </div>
        </div>
        <div class="match" v-html="row.Match" />
        <div class="bet">
          <div class="betname" v-html="row.Bet" />
          <div class="item">
            <label v-html="row.Item" />
          </div>
        </div>
        <div class="profit">
          投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
            formatDisplayOdds(Number(row.Odds) || 0)
          }}</span>
          盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
        </div>
        <div class="time">
          投注时间：{{ formatOrderTime(row.CreateAt || 0) }}
        </div>
        <div v-if="$slots['row-actions']" class="order-list__row-actions">
          <slot name="row-actions" :row="row" />
        </div>
      </div>
      <div v-if="$slots['group-actions']" class="order-list__group-actions">
        <slot name="group-actions" :link="link" :rows="rows" />
      </div>
    </fieldset>
  </div>
</template>
